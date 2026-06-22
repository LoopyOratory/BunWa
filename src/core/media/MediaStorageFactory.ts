import { IMediaStorage } from './IMediaManager';
import { injectable } from 'tsyringe';

@injectable()
export abstract class MediaStorageFactory {
  abstract build(name: string, logger: any): Promise<IMediaStorage>;
}
