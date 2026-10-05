/**
 * Media MCP tools.
 *
 * The REST surface has two media reads an agent needs and the MCP had neither:
 * `GET /api/{session}/chats/{chatId}/messages/{messageId}/media` and
 * `GET /api/files/{session}/{filename}`. The send tools accept a URL, but the
 * URL these return is served under `/api`, which requires the API key, so an
 * agent could not fetch it and hand it back. These tools therefore return the
 * bytes as base64 alongside the metadata, which round-trips straight into
 * MessageSendImage/File/Voice/Video.
 */
import { existsSync, statSync } from 'fs';
import { join, normalize, sep } from 'path';
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import { getLocalMediaFolder } from '../../core/media/MediaStorageFactory';
import { isOggOpus, materializeAudioBytes } from '../../core/media/audio';
import { UnprocessableEntityException } from '../../core/exceptions';
import type { ToolDescriptor } from '../tool-descriptor';

const sessionId = z
  .string()
  .min(1)
  .optional()
  .default('')
  .describe('Session name (e.g. "default"). Not needed when the key is a session-scoped MCP key, which supplies it.');

const chatId = z
  .string()
  .min(1)
  .describe('Chat the message belongs to: a JID (628123456789@c.us, groupId@g.us) or a WhatsApp username');

/** Base64 payloads are large; a message media read stops here by default. */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  bin: 'application/octet-stream',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
};

function mimetypeFor(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/** Resolve a stored file and report its size, without reading the bytes. */
function statMediaFile(session: string, filename: string, maxBytes: number) {
  if (
    !session ||
    !filename ||
    session.includes('..') ||
    filename.includes('..') ||
    session.includes(sep) ||
    filename.includes(sep)
  ) {
    throw new UnprocessableEntityException('Invalid session or filename');
  }
  const root = normalize(getLocalMediaFolder());
  const filePath = normalize(join(root, session, filename));
  if (!filePath.startsWith(root + sep)) {
    throw new UnprocessableEntityException('Invalid session or filename');
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new UnprocessableEntityException(`No stored media file named '${filename}'`);
  }
  const sizeBytes = statSync(filePath).size;
  if (sizeBytes > maxBytes) {
    throw new UnprocessableEntityException(
      `The stored file is ${sizeBytes} bytes, above the ${maxBytes} byte limit for this tool. Raise maxBytes to read it.`,
    );
  }
  return { filePath, sizeBytes, mimetype: mimetypeFor(filename) };
}

async function readMediaFile(session: string, filename: string, maxBytes: number) {
  const { filePath, sizeBytes, mimetype } = statMediaFile(session, filename, maxBytes);
  const bytes = Buffer.from(await Bun.file(filePath).arrayBuffer());
  return { bytes, sizeBytes, mimetype };
}

export function mediaTools(manager: SessionManager): ToolDescriptor[] {
  const getSession = (name: string) => manager.getWorkingSession(name);

  return [
    {
      name: 'MediaDownloadMessage',
      description:
        'Download the media attached to one message and return it as base64 with its mimetype, so it can be passed straight to MessageSendImage, MessageSendFile, MessageSendVoice or MessageSendVideo. Set includeData to false for metadata only. Answers a 422 when the message carries no media or the download failed.',
      tier: 'read',
      category: 'media',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId,
        messageId: z.string().min(1).describe('Message id, as returned by ChatGetMessages'),
        includeData: z
          .boolean()
          .optional()
          .default(true)
          .describe('Return the bytes as base64. Set false for metadata only'),
        maxBytes: z
          .number()
          .int()
          .positive()
          .optional()
          .default(DEFAULT_MAX_BYTES)
          .describe('Refuse to return more than this many bytes (default 8 MiB)'),
      }),
      handler: async (input) => {
        const session = await getSession(input.sessionId);
        const message: any = await (session as any).getChatMessage(input.chatId, input.messageId, {
          downloadMedia: true,
        });
        const media = message?.media;
        if (!media) {
          throw new UnprocessableEntityException(
            'The message carries no media, or the download failed.',
          );
        }
        const result: Record<string, unknown> = {
          chatId: input.chatId,
          messageId: input.messageId,
          url: media.url ?? null,
          mimetype: media.mimetype ?? null,
          filename: media.filename ?? null,
          type: message?.type ?? null,
          caption: message?.body ?? null,
        };
        if (media.url) {
          // The stored file is named after the last path segment of the URL.
          const storedName = String(media.url).split('/').pop() ?? '';
          const filename = decodeURIComponent(storedName);
          if (input.includeData) {
            const { bytes, sizeBytes, mimetype } = await readMediaFile(
              input.sessionId,
              filename,
              input.maxBytes,
            );
            result.sizeBytes = sizeBytes;
            result.mimetype = media.mimetype ?? mimetype;
            result.base64 = bytes.toString('base64');
          } else {
            // Metadata only: still report the size, without reading the bytes.
            const { sizeBytes } = statMediaFile(input.sessionId, filename, input.maxBytes);
            result.sizeBytes = sizeBytes;
          }
        }
        return result;
      },
    },
    {
      name: 'MediaGetFile',
      description:
        'Read a file from the session media store by filename, the same file GET /api/files/{session}/{filename} serves, returned as base64. Use MediaDownloadMessage for a message attachment, which also knows the mimetype.',
      tier: 'read',
      category: 'media',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        filename: z.string().min(1).describe('Stored file name, for example 2A5344A796863CF03D2B.bin'),
        maxBytes: z
          .number()
          .int()
          .positive()
          .optional()
          .default(DEFAULT_MAX_BYTES)
          .describe('Refuse to return more than this many bytes (default 8 MiB)'),
      }),
      handler: async (input) => {
        const { bytes, sizeBytes, mimetype } = await readMediaFile(
          input.sessionId,
          input.filename,
          input.maxBytes,
        );
        return {
          filename: input.filename,
          sizeBytes,
          mimetype,
          base64: bytes.toString('base64'),
        };
      },
    },
    {
      name: 'MediaConvertVoice',
      description:
        'Convert an audio file to an OGG/Opus voice note and return it as base64, ready for MessageSendVoice with convert false. Needs ffmpeg on the server; a file that is already OGG/Opus is returned unchanged.',
      tier: 'write',
      category: 'media',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        file: z
          .string()
          .min(1)
          .describe('Audio to convert: an http(s) URL, a data URL, a base64 string or a local path'),
      }),
      handler: async (input) => {
        const session = await getSession(input.sessionId);
        const audio = await materializeAudioBytes(input.file);
        const opus = isOggOpus(audio)
          ? audio
          : await (session as any).mediaConverter.voice(audio);
        return {
          mimetype: 'audio/ogg; codecs=opus',
          sizeBytes: opus.length,
          base64: Buffer.from(opus).toString('base64'),
        };
      },
    },
  ];
}
