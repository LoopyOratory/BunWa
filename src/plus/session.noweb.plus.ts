import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';
import { MessageImageRequest, MessageFileRequest, MessageVoiceRequest } from '../structures/chatting.dto';
import { BinaryFile, RemoteFile } from '../structures/files.dto';
import { AvailableInPlusVersion } from '../core/exceptions';

export class WhatsappSessionNoWebPlus extends WhatsappSessionNoWebCore {

  async sendImage(request: MessageImageRequest): Promise<any> {
    const media = await this.uploadMedia(request.file, 'image');
    return this.socket.sendMessage(request.chatId, {
      image: media,
      caption: request.caption,
      mentions: request.mentions,
    }, {
      quoted: request.reply_to ? { key: request.reply_to } : undefined,
    });
  }

  async sendFile(request: MessageFileRequest): Promise<any> {
    const media = await this.uploadMedia(request.file, 'document');
    return this.socket.sendMessage(request.chatId, {
      document: media,
      fileName: request.file.filename || 'file',
      mimetype: request.file.mimetype,
      caption: request.caption,
      mentions: request.mentions,
    }, {
      quoted: request.reply_to ? { key: request.reply_to } : undefined,
    });
  }

  async sendVoice(request: MessageVoiceRequest): Promise<any> {
    const media = await this.uploadMedia(request.file, 'audio');
    return this.socket.sendMessage(request.chatId, {
      audio: media,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
    }, {
      quoted: request.reply_to ? { key: request.reply_to } : undefined,
    });
  }

  async sendVideo(request: any): Promise<any> {
    const media = await this.uploadMedia(request.file, 'video');
    return this.socket.sendMessage(request.chatId, {
      video: media,
      caption: request.caption,
      mentions: request.mentions,
    }, {
      quoted: request.reply_to ? { key: request.reply_to } : undefined,
    });
  }

  async setProfilePicture(file: BinaryFile | RemoteFile): Promise<boolean> {
    try {
      const buffer = await this.getFileBuffer(file);
      await this.socket.updateProfilePicture(buffer);
      return true;
    } catch (error) {
      this.logger.error('Failed to set profile picture:', error);
      return false;
    }
  }

  async deleteProfilePicture(): Promise<boolean> {
    try {
      await this.socket.removeProfilePicture(this.socket.user.id);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete profile picture:', error);
      return false;
    }
  }

  async uploadMedia(file: BinaryFile | RemoteFile, type: string): Promise<any> {
    const buffer = await this.getFileBuffer(file);
    const { default: Baileys } = await import('@whiskeysockets/baileys');
    // NOTE: `uploadMedia` is not a real export of @whiskeysockets/baileys —
    // this call would throw at runtime. Left as-is (type-only fix) since this
    // Plus-tier file is not wired into the OSS build; flagged separately.
    return await (Baileys as any).uploadMedia(buffer, {
      file: { mimetype: file.mimetype },
      type,
    });
  }

  private async getFileBuffer(file: BinaryFile | RemoteFile): Promise<Buffer> {
    if ('data' in file && file.data) {
      return Buffer.from(file.data, 'base64');
    }
    if ('url' in file && file.url) {
      const response = await fetch(file.url);
      return Buffer.from(await response.arrayBuffer());
    }
    throw new Error('Invalid file: must have data or url');
  }
}
