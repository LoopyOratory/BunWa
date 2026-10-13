/**
 * Upload MCP tools.
 *
 * An agent with a local file cannot hand its bytes to a remote server except
 * as base64 through the model, which breaks past a few tens of KB. A ticket
 * gives it a single-use URL it can `curl` the file to from its own shell —
 * no API key involved — and the resulting id sends as `upload:<id>`.
 */
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';
import { UnprocessableEntityException } from '../../core/exceptions';
import { UploadStore } from '../../core/uploads/upload-store';
import { uploadTickets, ticketResponse, uploadBaseUrl } from '../../core/uploads/upload-tickets';

const sessionId = z
  .string()
  .min(1)
  .optional()
  .default('')
  .describe('Session name (e.g. "default"). Not needed when the key is a session-scoped MCP key, which supplies it.');

function requireSession(name: string): string {
  if (!name) throw new UnprocessableEntityException('sessionId is required');
  return name;
}

export function uploadTools(_manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'UploadCreateTicket',
      description:
        'Get a single-use URL to upload a local file of any size (up to the server limit) into this session, without the API key. ' +
        'Run the returned curl command from your shell with <FILE> replaced by the path; it prints the upload record. ' +
        'Then send it with file "upload:<id>" in MessageSendImage, MessageSendFile, MessageSendVideo or MessageSendVoice. ' +
        'The URL expires in minutes and works once; the upload is kept about a day and can be sent to several chats.',
      tier: 'write',
      category: 'media',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        filename: z.string().optional().describe('Name the recipient sees, e.g. "ads.zip"; sets the mimetype from its extension'),
        maxBytes: z.number().int().positive().optional().describe('Lower the size cap for this ticket'),
      }),
      handler: async (input) => {
        const { token, ticket } = uploadTickets.create(requireSession(input.sessionId), {
          filename: input.filename,
          maxBytes: input.maxBytes,
        });
        return ticketResponse(uploadBaseUrl(), token, ticket);
      },
    },
    {
      name: 'UploadList',
      description: 'List this session\'s live uploads (id, filename, mimetype, size, expiresAt).',
      tier: 'read',
      category: 'media',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => new UploadStore().list(requireSession(input.sessionId)),
    },
    {
      name: 'UploadDelete',
      description: 'Delete an upload now instead of waiting for it to expire.',
      tier: 'write',
      destructive: true,
      category: 'media',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, uploadId: z.string().min(1) }),
      handler: async (input) => ({
        deleted: await new UploadStore().delete(requireSession(input.sessionId), input.uploadId),
      }),
    },
  ];
}
