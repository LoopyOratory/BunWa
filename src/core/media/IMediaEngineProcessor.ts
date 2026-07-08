export interface IMediaEngineProcessor<Message> {
  hasMedia(message: Message): boolean;
  getFilename(message: Message): string | null;
  getMimetype(message: Message): string;
  getMessageId(message: Message): string;
  getChatId(message: Message): string;
  getMediaBuffer(message: Message): Promise<Buffer | null>;
}
