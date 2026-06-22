import { DataStore } from '../abc/DataStore';

export abstract class LocalStore extends DataStore {
  abstract init(sessionName?: string): Promise<void>;
  abstract getBaseDirectory(): string;
  abstract getEngineDirectory(): string;
  abstract getSessionDirectory(name: string): string;
  abstract getFilePath(session: string, file: string): string;
}
