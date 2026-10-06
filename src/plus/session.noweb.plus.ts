import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';
import { BinaryFile, RemoteFile } from '../structures/files.dto';

// NOTE: sendImage/sendFile/sendVoice/sendVideo used to be overridden here via
// a broken pre-upload step (this.socket.sendMessage — `socket` doesn't exist
// anywhere in the class hierarchy, the real property is `sock` — calling
// Baileys.uploadMedia, which also isn't a real Baileys export). The inherited
// Core implementations already send all of these correctly by passing the
// file straight to sock.sendMessage(), which uploads media internally, so
// those overrides were pure dead weight and have been removed.
/**
 * Normalise the media input an interactive message accepts.
 *
 * A header image arrives as a plain string as often as an object — a URL, or a
 * data URL holding the bytes. `'url' in someString` throws a TypeError, which
 * surfaced as a 500 on sendButtons, so the shape is settled here first.
 */
export function normalizeInteractiveMedia(
  file: unknown,
): { url: string } | { data: string } | undefined {
  if (typeof file === 'string') {
    if (!file) return undefined;
    if (file.startsWith('data:')) {
      const base64 = file.split(',').pop() ?? '';
      return base64 ? { data: base64 } : undefined;
    }
    return { url: file };
  }
  if (!file || typeof file !== 'object') return undefined;
  const candidate = file as { url?: unknown; data?: unknown };
  if (typeof candidate.url === 'string' && candidate.url) return { url: candidate.url };
  if (typeof candidate.data === 'string' && candidate.data) return { data: candidate.data };
  return undefined;
}

export class WhatsappSessionNoWebPlus extends WhatsappSessionNoWebCore {

  async setProfilePicture(file: BinaryFile | RemoteFile): Promise<boolean> {
    try {
      const buffer = await this.getFileBuffer(file);
      const jid = this.sock.user?.id;
      if (!jid) {
        throw new Error('Session has no authenticated user to set a profile picture for');
      }
      await this.sock.updateProfilePicture(jid, buffer);
      return true;
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to set profile picture');
      return false;
    }
  }

  async deleteProfilePicture(): Promise<boolean> {
    try {
      const jid = this.sock.user?.id;
      if (!jid) {
        throw new Error('Session has no authenticated user to delete a profile picture for');
      }
      await this.sock.removeProfilePicture(jid);
      return true;
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to delete profile picture');
      return false;
    }
  }

  /**
   * Prepares a media file as button/interactive-message content (e.g.
   * sendButtons' headerImage) using Baileys' real media pipeline —
   * prepareWAMessageMedia() + the live socket's upload function — rather
   * than a standalone "uploadMedia" call, which Baileys does not expose.
   * Overrides Core.uploadMedia(), which throws AvailableInPlusVersion.
   */
  async uploadMedia(file: BinaryFile | RemoteFile | string, type: string): Promise<any> {
    const input = normalizeInteractiveMedia(file);
    // sendButtons() calls this unconditionally, with no header image in the
    // common case, so a missing file has to behave like Core.uploadMedia() does
    // (a no-op) instead of reaching getFileBuffer() and throwing a TypeError on
    // `'data' in undefined`.
    if (!input) {
      return undefined;
    }
    const buffer = await this.getFileBuffer(input as BinaryFile | RemoteFile);
    const { prepareWAMessageMedia } = await import('@whiskeysockets/baileys');
    const prepared = await prepareWAMessageMedia(
      { [type]: buffer } as any,
      { upload: this.sock.waUploadToServer },
    );
    // prepareWAMessageMedia returns e.g. { imageMessage: {...} } for type
    // 'image' — callers (like sendButtons' headerImage) expect that inner
    // *Message object, not the wrapper.
    return (prepared as any)[`${type}Message`];
  }

  private async getFileBuffer(file: BinaryFile | RemoteFile): Promise<Buffer> {
    if ('data' in file && file.data) {
      return Buffer.from(file.data, 'base64');
    }
    if ('url' in file && file.url) {
      // Use the shared fetchBuffer helper (this.fetch) rather than a raw
      // fetch() call, matching the RemoteFile-download convention already
      // used by the inherited sendImage/sendFile/etc paths in Core.
      return this.fetch(file.url);
    }
    throw new Error('Invalid file: must have data or url');
  }
}
