import {
  convertProtobufToPlainObject,
  replaceLongsWithNumber,
} from '../utils';
import { BunSqliteKVRepository } from '../../../../storage/bun-sqlite/BunSqliteKVRepository';
import { BufferJSON } from '@whiskeysockets/baileys';

/**
 * Key value repository with extra metadata
 * Add support for converting protobuf to plain object
 * Uses bun:sqlite for high-performance access.
 */
export class NOWEBBunSqliteKVRepository<
  Entity,
> extends BunSqliteKVRepository<Entity> {
  protected stringify(data: any): string {
    return JSON.stringify(data, BufferJSON.replacer);
  }

  public parse(row: any): any {
    return JSON.parse(row.data, BufferJSON.reviver);
  }

  protected dump(entity: Entity) {
    const raw = convertProtobufToPlainObject(entity);
    replaceLongsWithNumber(raw);
    return super.dump(raw);
  }
}
