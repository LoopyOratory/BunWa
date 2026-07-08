import { WAMedia } from '../../structures/media.dto';

export interface IMediaManager {
  processMedia<Message>(
    processor: any,
    message: Message,
    session: string,
  ): Promise<WAMedia | null>;
  close(): void;
}
