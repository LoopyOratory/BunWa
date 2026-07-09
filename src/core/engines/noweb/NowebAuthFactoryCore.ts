import { DataStore } from '../../storage/DataStore';
import { LocalStore } from '../../storage/LocalStore';
import { useMultiFileAuthState } from './useMultiFileAuthState';

export class NowebAuthFactoryCore {
  buildAuth(store: DataStore, name: string) {
    if (store instanceof LocalStore) return this.buildLocalAuth(store, name);
    throw new Error(`Unsupported store type '${store.constructor.name}'`);
  }

  protected async buildLocalAuth(store: LocalStore, name: string) {
    const authFolder = store.getSessionDirectory(name);
    const { state, saveCreds, close } = await useMultiFileAuthState(authFolder);
    return { state, saveCreds, close };
  }
}
