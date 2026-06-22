import type { Label } from '@whiskeysockets/baileys/lib/Types/Label';

export class ILabelsRepository {
  getById(id: string): Promise<Label | null>;

  getAll(): Promise<Label[]>;

  getAllByIds(ids: string[]): Promise<Label[]>;

  deleteById(id: string): Promise<void>;

  save(label: Label): Promise<void>;
}
