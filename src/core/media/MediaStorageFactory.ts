import { IMediaStorage } from './IMediaManager';

// Abstract contract only — not DI-registered anywhere, and @injectable() on an
// abstract class is meaningless (it can never be constructed), so no decorator.
export abstract class MediaStorageFactory {
  abstract build(name: string, logger: any): Promise<IMediaStorage>;
}
