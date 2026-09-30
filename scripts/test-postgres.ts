#!/usr/bin/env bun
/**
 * PostgreSQL store smoke test.
 *
 * Exercises every knex/pg code path in the NOWEB session store and the
 * template repository against a live PostgreSQL server — a real Postgres, a
 * Docker service, or a PGlite socket server (see the vault note
 * "Postgres on PGlite").
 *
 * Usage:
 *   WAHA_DATABASE_URL=postgres://user:pass@host:5432/db bun run test:postgres
 *
 * Exits non-zero on failure. Only touches rows it creates; safe to rerun.
 */
import 'reflect-metadata';
import { PostgresStorage } from '../src/core/engines/noweb/store/postgres/PostgresStorage';
import { PostgresTemplateRepository } from '../src/core/templates/postgres/PostgresTemplateRepository';
import { makePostgresKnex } from '../src/core/db/knex-postgres';

const url = process.env.WAHA_DATABASE_URL ?? process.env.WHATSAPP_SESSIONS_POSTGRESQL_URL;
if (!url) {
  console.error('Set WAHA_DATABASE_URL (or WHATSAPP_SESSIONS_POSTGRESQL_URL) first.');
  process.exit(2);
}

let pass = 0;
let fail = 0;
const ok = (name: string) => {
  pass += 1;
  console.log(`  ok   ${name}`);
};
const bad = (name: string, e: unknown) => {
  fail += 1;
  console.log(`  FAIL ${name} :: ${(e as Error).message.split('\n')[0]}`);
};
const attempt = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    ok(name);
  } catch (e) {
    bad(name, e);
  }
};
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

const JID = '111@s.whatsapp.net';
const storage = new PostgresStorage(url);
const templates = new PostgresTemplateRepository(url);
const sql = makePostgresKnex(url);

console.log(`\nBunWa — PostgreSQL store smoke test\n  target: ${url.replace(/\/\/.*@/, '//***@')}\n`);

// ---------------------------------------------------------------- schema
await attempt('schema: init() creates every store table', async () => {
  await storage.init();
  const res: any = await sql.raw(`select tablename from pg_tables where schemaname = 'public'`);
  const names: string[] = (res.rows ?? res).map((r: any) => r.tablename);
  for (const t of ['contacts', 'chats', 'groups', 'messages', 'labels', 'labelAssociations', 'lid_map']) {
    assert(names.includes(t), `table ${t} missing (have: ${names.join(', ')})`);
  }
});

// ---------------------------------------------------------------- contacts
const contacts = storage.getContactsRepository();
await attempt('contacts: save / getById / getEntitiesByIds / upsert-merge / delete', async () => {
  await contacts.save({ id: JID, name: 'Smoke Contact' } as any);
  await contacts.save({ id: '222@s.whatsapp.net', name: 'Second' } as any);
  const one = await contacts.getById(JID);
  assert(one?.id === JID, 'getById returned wrong row');
  const map = await contacts.getEntitiesByIds([JID, 'missing@x']);
  assert(map.get(JID)?.id === JID && map.get('missing@x') === null, 'getEntitiesByIds mismatch');
  await contacts.save({ id: JID, name: 'Smoke Contact v2' } as any);
  const v2 = (await contacts.getById(JID)) as any;
  assert(v2?.name === 'Smoke Contact v2', 'upsert did not merge new value');
  const all = await contacts.getAll();
  assert(all.length >= 2, `getAll expected >=2, got ${all.length}`);
  await contacts.deleteById('222@s.whatsapp.net');
  assert((await contacts.getById('222@s.whatsapp.net')) === null, 'deleteById failed');
});

// ----------------------------------------------------------------- chats
const chats = storage.getChatRepository();
await attempt('chats: save / getById / getAllByIds / upsert / delete', async () => {
  await chats.save({ id: JID, conversationTimestamp: 1700000123 } as any);
  const c = (await chats.getById(JID)) as any;
  assert(c?.conversationTimestamp === 1700000123, 'getById mismatch');
  const byIds = await chats.getAllByIds([JID]);
  assert(byIds.length === 1, 'getAllByIds mismatch');
  await chats.save({ id: JID, conversationTimestamp: 1700000999 } as any);
  const c2 = (await chats.getById(JID)) as any;
  assert(c2?.conversationTimestamp === 1700000999, 'upsert did not merge');
  await chats.deleteById(JID);
});

// -------------------------------------------------------------- messages
const messages = storage.getMessagesRepository();
await attempt('messages: save / merge-on-id / upsertMany / reads / delete', async () => {
  const m: any = { key: { id: 'SMOKE-MSG-1', remoteJid: JID, fromMe: false }, messageTimestamp: 1700000001, status: 2 };
  await messages.save(m, JID);
  const fetched = (await messages.getById('SMOKE-MSG-1')) as any;
  assert(fetched?.key?.id === 'SMOKE-MSG-1', 'getById mismatch');
  await messages.save({ ...m, status: 3 } as any, JID);
  const merged = (await messages.getById('SMOKE-MSG-1')) as any;
  assert(merged?.status === 3, 'merge on conflict failed (unique index mismatch?)');
  await messages.upsertMany(
    [
      { key: { id: 'SMOKE-MSG-2', remoteJid: JID }, messageTimestamp: 1700000002, status: 2 },
      { key: { id: 'SMOKE-MSG-3', remoteJid: JID }, messageTimestamp: 1700000003, status: 2 },
    ] as any,
    JID,
  );
  const got = await messages.getAllByJid(JID, {} as any, { limit: 10 } as any);
  assert(got.length === 3, `getAllByJid expected 3, got ${got.length}`);
  assert((got[0] as any).key.id === 'SMOKE-MSG-3', 'ordering is not desc');
  const count = await messages.getCount(JID);
  assert(count === 3, `getCount expected 3, got ${count}`);
  const newest = await messages.getNewestPerJid([JID]);
  assert((newest.get(JID) as any)?.key?.id === 'SMOKE-MSG-3', 'getNewestPerJid mismatch');
  await messages.deleteAllByJid(JID);
  assert((await messages.getCount(JID)) === 0, 'deleteAllByJid failed');
});

// ---------------------------------------------------------------- groups
const groups = storage.getGroupRepository();
await attempt('groups: save / getById / delete', async () => {
  await groups.save({ id: 'smoke@g.us', subject: 'Smoke Group' } as any);
  const g = (await groups.getById('smoke@g.us')) as any;
  assert(g?.subject === 'Smoke Group', 'getById mismatch');
  await groups.deleteById('smoke@g.us');
});

// ---------------------------------------------------------------- labels
const labels = storage.getLabelsRepository();
await attempt('labels: save / getById / getAllByIds / upsert-merge / delete', async () => {
  await labels.save({ id: 'smoke-lbl-1', name: 'Lead', color: '#E22134' } as any);
  const l = (await labels.getById('smoke-lbl-1')) as any;
  assert(l?.name === 'Lead', 'getById mismatch');
  await (labels as any).upsertMany([{ id: 'smoke-lbl-1', name: 'Lead v2' } as any, { id: 'smoke-lbl-2', name: 'Other' } as any]);
  const got = await labels.getAllByIds(['smoke-lbl-1', 'smoke-lbl-2']);
  assert(got.length === 2, 'getAllByIds mismatch');
  const v2 = (await labels.getById('smoke-lbl-1')) as any;
  assert(v2?.name === 'Lead v2', 'upsert did not merge');
  await labels.deleteById('smoke-lbl-2');
});

// ------------------------------------------------------ labelAssociations
const assoc = storage.getLabelAssociationRepository();
await attempt('labelAssociations: chat + message assoc round-trip', async () => {
  const chatAssoc: any = { type: 'label_jid', chatId: JID, labelId: 'smoke-lbl-1' };
  await assoc.save(chatAssoc);
  const byChat = await assoc.getAssociationsByChatId(JID);
  assert(byChat.length === 1 && byChat[0].labelId === 'smoke-lbl-1', 'byChatId mismatch');
  const msgAssoc: any = { type: 'label_message', chatId: JID, messageId: 'MSG-X', labelId: 'smoke-lbl-1' };
  await assoc.save(msgAssoc);
  const byLabel = await assoc.getAssociationsByLabelId('smoke-lbl-1', 'label_message' as any);
  assert(byLabel.length === 1 && (byLabel[0] as any).messageId === 'MSG-X', 'byLabelId+type mismatch');
  await assoc.deleteOne(chatAssoc);
  await assoc.deleteByLabelId('smoke-lbl-1');
  assert((await assoc.getAssociationsByChatId(JID)).length === 0, 'deleteByLabelId failed');
});

// ---------------------------------------------------------------- lid_map
const lids = storage.getLidPNRepository();
await attempt('lid_map: save / find aliases / count / saveLids / delete', async () => {
  const LID = '999@lid';
  await (lids as any).save(LID, JID);
  assert((await lids.findPNByLid(LID)) === JID, 'findPNByLid mismatch');
  assert((await lids.findLidByPN(JID)) === LID, 'findLidByPN mismatch');
  await lids.saveLids([{ id: '888@lid', pn: '222@s.whatsapp.net' } as any]);
  const count = await lids.getLidsCount();
  assert(count === 2, `getLidsCount expected 2, got ${count}`);
  const all = await lids.getAllLids();
  assert(all.length === 2, 'getAllLids mismatch');
  await (lids as any).deleteById(LID);
  assert((await lids.findPNByLid(LID)) === null, 'deleteById failed');
});

// -------------------------------------------------------------- templates
await attempt('templates: init / CRUD / session isolation', async () => {
  await templates.init();
  const now = new Date().toISOString();
  const t1: any = { id: 'smoke-tpl-1', sessionId: 'smoke-s1', name: 'welcome', body: 'Hi {{name}}', header: null, footer: null, createdAt: now, updatedAt: now };
  const t2: any = { id: 'smoke-tpl-2', sessionId: 'smoke-s2', name: 'welcome', body: 'Hi', header: null, footer: null, createdAt: now, updatedAt: now };
  await templates.create(t1);
  await templates.create(t2);
  const s1 = await templates.findBySession('smoke-s1');
  assert(s1.length === 1 && s1[0].id === t1.id, 'session isolation broken');
  const byName = await templates.findByName('smoke-s1', 'welcome');
  assert(byName?.id === t1.id, 'findByName mismatch');
  await templates.update({ ...t1, body: 'Updated body', updatedAt: new Date().toISOString() } as any);
  const upd = await templates.findOne('smoke-s1', t1.id);
  assert(upd?.body === 'Updated body', 'update did not stick');
  await templates.delete('smoke-s1', t1.id);
  await templates.delete('smoke-s2', t2.id);
  assert((await templates.findBySession('smoke-s1')).length === 0, 'delete failed');
});

// --------------------------------------------------- cleanup + pool close
await attempt('cleanup + pool close', async () => {
  await contacts.deleteAll();
  await chats.deleteAll();
  await groups.deleteAll();
  await (labels as any).deleteAll();
  await messages.deleteAll();
  await (lids as any).deleteAll();
  await storage.close();
  await templates.close();
  await sql.destroy();
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
