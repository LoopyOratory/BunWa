import { IGroupRepository } from './IGroupRepository';
import { ILabelAssociationRepository } from './ILabelAssociationsRepository';
import { ILabelsRepository } from './ILabelsRepository';

import { IChatRepository } from './IChatRepository';
import { IContactRepository } from './IContactRepository';
import { IMessagesRepository } from './IMessagesRepository';
import { IBunwebLidPNRepository } from './IBunwebLidPNRepository';

export abstract class IBunwebStorage {
  abstract init(): Promise<void>;

  abstract close(): Promise<void>;

  abstract getContactsRepository(): IContactRepository;

  abstract getChatRepository(): IChatRepository;

  abstract getGroupRepository(): IGroupRepository;

  abstract getMessagesRepository(): IMessagesRepository;

  abstract getLabelsRepository(): ILabelsRepository;

  abstract getLabelAssociationRepository(): ILabelAssociationRepository;

  abstract getLidPNRepository(): IBunwebLidPNRepository;

  abstract runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
