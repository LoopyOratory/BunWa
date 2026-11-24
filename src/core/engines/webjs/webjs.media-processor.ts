/**
 * Media processor for whatsapp-web.js messages.
 *
 * BUNWEB has an equivalent adapter inline in its session class; WEBJS used to
 * skip media entirely, so inbound images/files had no stored URL and
 * `downloadMedia: true` answered 422. whatsapp-web.js exposes the bytes through
 * `message.downloadMedia()`, which returns a MessageMedia whose `data` is base64.
 */

import { IMediaEngineProcessor } from '../../media/IMediaEngineProcessor';

export class WebJSMediaProcessor implements IMediaEngineProcessor<any> {
  hasMedia(message: any): boolean {
    return Boolean(message?.hasMedia);
  }

  getFilename(message: any): string | null {
    return message?.filename || message?._data?.filename || null;
  }

  getMimetype(message: any): string {
    return message?.mimetype || message?._data?.mimetype || 'application/octet-stream';
  }

  getMessageId(message: any): string {
    return (
      message?.id?._serialized ||
      message?.id?.id ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
  }

  getChatId(message: any): string {
    return message?.from || message?.to || '';
  }

  async getMediaBuffer(message: any): Promise<Buffer | null> {
    const media = await message.downloadMedia();
    if (!media?.data) return null;
    return Buffer.from(media.data, 'base64');
  }
}
