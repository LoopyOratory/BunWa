import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'crypto';
import { AuditAction, AuditService, AuditSeverity } from '../../core/audit/audit.service';
import { SendingPolicyService } from '../../core/sending-policy/sending-policy.service';
import type { INowebStorage } from '../../core/engines/noweb/store/INowebStorage';
import type { ITemplateRepository } from '../../core/templates/ITemplateRepository';
import type { Template } from '../../core/templates/template.types';

/**
 * Shared driver conformance suite.
 *
 * The same assertions run against every registered session store and template
 * repository driver, so a deployment can choose sqlite or postgres with the
 * same expectations. Adding a driver means adding one test file that builds a
 * ConformanceDriver and calls runDriverConformance (see the sqlite and
 * postgres files in this directory).
 *
 * The audit log and the sending policy ledger are deliberately local sqlite
 * files in both deployments (see describeStorage in storage-report.ts), so the
 * same assertions run in both driver profiles to pin that the session store
 * driver does not leak into them.
 */

export interface ConformanceHarness {
  storage: INowebStorage;
  templates: ITemplateRepository;
  /** Directory for the driver independent components (audit, sending policy). */
  localDir: string;
  dispose(): Promise<void>;
}

export interface ConformanceDriver {
  name: string;
  setup(): Promise<ConformanceHarness>;
}

function id(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function runDriverConformance(driver: ConformanceDriver, skipReason?: string): void {
  if (skipReason) {
    // A skip is not a pass. Make it loud in the run output, not just in the
    // final counter, and register a skipped test so the reporter shows it.
    console.warn(`[conformance] ${driver.name} driver suite SKIPPED: ${skipReason}`);
    describe(`driver conformance: ${driver.name}`, () => {
      it.skip(`skipped, not passed: ${skipReason}`, () => {});
    });
    return;
  }

  describe(`driver conformance: ${driver.name}`, () => {
    let harness: ConformanceHarness;

    beforeAll(async () => {
      harness = await driver.setup();
    });

    afterAll(async () => {
      if (harness) {
        await harness.dispose();
      }
    });

    // ------------------------------------------------------------ contacts
    it('contacts: save, read, upsert, batch read, delete', async () => {
      const contacts = harness.storage.getContactsRepository();
      const first = '111@s.whatsapp.net';
      const second = '222@s.whatsapp.net';

      await contacts.save({ id: first, name: 'Conformance Contact' } as any);
      await contacts.upsertMany([
        { id: second, name: 'Second Contact' },
      ] as any);

      expect((await contacts.getById(first))?.name).toBe('Conformance Contact');
      const byIds = await contacts.getEntitiesByIds([first, second, 'missing@s.whatsapp.net']);
      expect(byIds.get(first)?.id).toBe(first);
      expect(byIds.get(second)?.id).toBe(second);
      expect(byIds.get('missing@s.whatsapp.net')).toBeNull();

      await contacts.save({ id: first, name: 'Conformance Contact v2' } as any);
      expect((await contacts.getById(first))?.name).toBe('Conformance Contact v2');

      const all = await contacts.getAll({ limit: 100 });
      expect(all.some((contact: any) => contact.id === first)).toBe(true);
      expect(all.some((contact: any) => contact.id === second)).toBe(true);

      await contacts.deleteById(second);
      expect(await contacts.getById(second)).toBeNull();
      expect(await contacts.getById(first)).not.toBeNull();
    });

    // --------------------------------------------------------------- chats
    it('chats: save, read, batch read, upsert, delete', async () => {
      const chats = harness.storage.getChatRepository();
      const chatId = '333@s.whatsapp.net';

      await chats.save({ id: chatId, conversationTimestamp: 1700000001 } as any);
      expect((await chats.getById(chatId))?.conversationTimestamp).toBe(1700000001);

      const byIds = await chats.getAllByIds([chatId]);
      expect(byIds.length).toBe(1);
      expect((byIds[0] as any).id).toBe(chatId);

      await chats.save({ id: chatId, conversationTimestamp: 1700000099 } as any);
      expect((await chats.getById(chatId))?.conversationTimestamp).toBe(1700000099);

      await chats.deleteById(chatId);
      expect(await chats.getById(chatId)).toBeNull();
    });

    // -------------------------------------------------------------- groups
    it('groups: save, read, delete', async () => {
      const groups = harness.storage.getGroupRepository();
      const groupId = id('conformance') + '@g.us';

      await groups.save({ id: groupId, subject: 'Conformance Group' } as any);
      expect((await groups.getById(groupId))?.subject).toBe('Conformance Group');

      const all = await groups.getAll();
      expect(all.some((group: any) => group.id === groupId)).toBe(true);

      await groups.deleteById(groupId);
      expect(await groups.getById(groupId)).toBeNull();
    });

    // ------------------------------------------------------------ messages
    it('messages: upsert, merge on id, ordering, filters, update, delete', async () => {
      const messages = harness.storage.getMessagesRepository();
      const chatId = '444@s.whatsapp.net';
      const make = (n: number, timestamp: number): any => ({
        key: { id: `conformance-msg-${n}-${randomUUID()}`, remoteJid: chatId, fromMe: n % 2 === 0 },
        messageTimestamp: timestamp,
        status: 2,
        message: { conversation: `message ${n}` },
      });
      const m1 = make(1, 1700000001);
      const m2 = make(2, 1700000002);
      const m3 = make(3, 1700000003);

      await messages.upsert([m1, m2, m3]);
      expect((await messages.getById(m1.key.id))?.key?.id).toBe(m1.key.id);

      // Re-saving the same id must merge, not duplicate. This pins the unique
      // index on both drivers.
      await messages.upsertOne({ ...m1, status: 4 });
      expect((await messages.getById(m1.key.id))?.status).toBe(4);

      const all = await messages.getAllByJid(chatId, {} as any, { limit: 10 } as any, false);
      expect(all.length).toBe(3);
      expect(all.map((message: any) => message.key.id)).toEqual([
        m3.key.id,
        m2.key.id,
        m1.key.id,
      ]);

      const recent = await messages.getAllByJid(
        chatId,
        { 'filter.timestamp.gte': 1700000002 } as any,
        { limit: 10 } as any,
        false,
      );
      expect(recent.length).toBe(2);

      expect((await messages.getByJidById(chatId, m2.key.id, false))?.key.id).toBe(m2.key.id);
      expect(await messages.getByJidById(chatId, 'missing-message-id', false)).toBeNull();

      expect(await messages.updateByJidAndId(chatId, m2.key.id, { status: 5 })).toBe(true);
      expect((await messages.getById(m2.key.id))?.status).toBe(5);

      const newest = await messages.getNewestPerJid([chatId]);
      expect((newest.get(chatId) as any)?.key?.id).toBe(m3.key.id);

      await messages.deleteByJidByIds(chatId, [m2.key.id]);
      expect(await messages.getById(m2.key.id)).toBeNull();

      await messages.deleteAll();
      expect((await messages.getAllByJid(chatId, {} as any, { limit: 10 } as any, false)).length).toBe(0);
    });

    // -------------------------------------------------- lid to pn mapping
    it('lid mapping: upsert, aliases and merged message lookup', async () => {
      const lids = harness.storage.getLidPNRepository();
      const messages = harness.storage.getMessagesRepository();
      const lid = '555@lid';
      const pn = '556@s.whatsapp.net';

      await lids.saveLids([{ id: lid, pn } as any]);
      expect(await lids.findPNByLid(lid)).toBe(pn);
      expect(await lids.findLidByPN(pn)).toBe(lid);
      expect(await lids.getLidsCount()).toBe(1);

      const stored = await lids.getAllLids({ limit: 10 } as any);
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe(lid);
      expect(stored[0].pn).toBe(pn);

      // Upserting the same lid with a new pn must replace the mapping.
      const updatedPn = '557@s.whatsapp.net';
      await lids.saveLids([{ id: lid, pn: updatedPn } as any]);
      expect(await lids.findPNByLid(lid)).toBe(updatedPn);
      expect(await lids.findLidByPN(updatedPn)).toBe(lid);
      expect(await lids.getLidsCount()).toBe(1);

      // A message stored under a lid is reachable through the pn when the
      // caller asks for merged results, and only through the lid when not.
      const message: any = {
        key: { id: `conformance-lid-msg-${randomUUID()}`, remoteJid: lid },
        messageTimestamp: 1700000100,
        status: 2,
      };
      await messages.upsertOne(message);
      const merged = await messages.getAllByJid(updatedPn, {} as any, { limit: 10 } as any, true);
      expect(merged.some((row: any) => row.key.id === message.key.id)).toBe(true);
      const exact = await messages.getAllByJid(updatedPn, {} as any, { limit: 10 } as any, false);
      expect(exact.some((row: any) => row.key.id === message.key.id)).toBe(false);
      expect((await messages.getByJidById(updatedPn, message.key.id, true))?.key.id).toBe(message.key.id);

      await messages.deleteAll();
    });

    // -------------------------------------------------------------- labels
    it('labels: save, read, batch read, upsert, delete', async () => {
      const labels = harness.storage.getLabelsRepository();
      const first = id('label');
      const second = id('label');

      await labels.save({ id: first, name: 'Lead', color: '#E22134' } as any);
      expect((await labels.getById(first))?.name).toBe('Lead');

      await labels.save({ id: first, name: 'Lead v2', color: '#E22134' } as any);
      expect((await labels.getById(first))?.name).toBe('Lead v2');

      await labels.save({ id: second, name: 'Other', color: '#000000' } as any);
      const byIds = await labels.getAllByIds([first, second]);
      expect(byIds.length).toBe(2);
      expect((await labels.getAll()).some((label: any) => label.id === first)).toBe(true);

      await labels.deleteById(second);
      expect(await labels.getById(second)).toBeNull();
    });

    // -------------------------------------------------- label associations
    it('label associations: save, query by chat and label, delete', async () => {
      const associations = harness.storage.getLabelAssociationRepository();
      const chatId = '666@s.whatsapp.net';
      const labelId = id('label');
      const messageId = id('message');

      const chatAssociation: any = { type: 'label_jid', chatId, labelId };
      await associations.save(chatAssociation);
      const byChat = await associations.getAssociationsByChatId(chatId);
      expect(byChat.length).toBe(1);
      expect(byChat[0].labelId).toBe(labelId);

      const messageAssociation: any = { type: 'label_message', chatId, messageId, labelId };
      await associations.save(messageAssociation);
      const byLabel = await associations.getAssociationsByLabelId(labelId, 'label_message' as any);
      expect(byLabel.length).toBe(1);
      expect((byLabel[0] as any).messageId).toBe(messageId);

      await associations.deleteOne(messageAssociation);
      expect((await associations.getAssociationsByLabelId(labelId, 'label_message' as any)).length).toBe(0);

      await associations.deleteByLabelId(labelId);
      expect((await associations.getAssociationsByChatId(chatId)).length).toBe(0);
    });

    it('label associations: deleteOne removes its own row and is idempotent', async () => {
      const associations = harness.storage.getLabelAssociationRepository();
      const chatId = id('chat') + '@s.whatsapp.net';
      const labelId = id('label');
      const messageId = id('message');

      const chatAssociation: any = { type: 'label_jid', chatId, labelId };
      const messageAssociation: any = { type: 'label_message', chatId, messageId, labelId };
      await associations.save(chatAssociation);
      await associations.save(messageAssociation);

      // A chat query is chat-only: the message row shares the chat id but must
      // not leak into the result. Both drivers return the same rows.
      const chatRows = await associations.getAssociationsByChatId(chatId);
      expect(chatRows.map((row: any) => row.type)).toEqual(['label_jid']);

      // Deleting a chat association removes exactly that row. A second delete
      // is a no-op: no error, and no other row is removed.
      await associations.deleteOne(chatAssociation);
      expect((await associations.getAssociationsByChatId(chatId)).length).toBe(0);
      await associations.deleteOne(chatAssociation);
      expect((await associations.getAssociationsByChatId(chatId)).length).toBe(0);
      expect((await associations.getAssociationsByLabelId(labelId, 'label_message' as any)).length).toBe(1);

      // The same holds for a message association, which is matched by its
      // message id as well.
      await associations.deleteOne(messageAssociation);
      expect((await associations.getAssociationsByLabelId(labelId, 'label_message' as any)).length).toBe(0);
      await associations.deleteOne(messageAssociation);
      expect((await associations.getAssociationsByLabelId(labelId, 'label_message' as any)).length).toBe(0);

      // Clean up the label itself.
      await associations.deleteByLabelId(labelId);
      expect((await associations.getAssociationsByChatId(chatId)).length).toBe(0);
    });

    // ------------------------------------------------------------ templates
    it('templates: create, read, update, delete and session isolation', async () => {
      const templates = harness.templates;
      const sessionA = id('session');
      const sessionB = id('session');
      const now = new Date().toISOString();
      const base: Omit<Template, 'id' | 'sessionId' | 'name'> = {
        body: 'Hello {{name}}',
        header: null,
        footer: null,
        createdAt: now,
        updatedAt: now,
      };
      const t1: Template = { ...base, id: id('tpl'), sessionId: sessionA, name: 'welcome' };
      const t2: Template = { ...base, id: id('tpl'), sessionId: sessionB, name: 'welcome' };

      await templates.create(t1);
      await templates.create(t2);

      const sessionATemplates = await templates.findBySession(sessionA);
      expect(sessionATemplates.length).toBe(1);
      expect(sessionATemplates[0].id).toBe(t1.id);
      expect((await templates.findByName(sessionA, 'welcome'))?.id).toBe(t1.id);
      expect((await templates.findOne(sessionB, t2.id))?.id).toBe(t2.id);
      expect(await templates.findOne(sessionA, t2.id)).toBeUndefined();

      await templates.update({ ...t1, body: 'Updated body', updatedAt: new Date().toISOString() });
      expect((await templates.findOne(sessionA, t1.id))?.body).toBe('Updated body');
      expect((await templates.findByName(sessionA, 'welcome'))?.body).toBe('Updated body');

      await templates.delete(sessionA, t1.id);
      expect(await templates.findOne(sessionA, t1.id)).toBeUndefined();
      expect((await templates.findBySession(sessionA)).length).toBe(0);
      expect((await templates.findBySession(sessionB)).length).toBe(1);

      await templates.delete(sessionB, t2.id);
    });

    it('templates: unique (sessionId, name) rejects duplicates and frees on delete', async () => {
      const templates = harness.templates;
      const sessionId = id('session');
      const now = new Date().toISOString();
      const make = (name: string): Template => ({
        id: id('tpl'),
        sessionId,
        name,
        body: 'body',
        header: null,
        footer: null,
        createdAt: now,
        updatedAt: now,
      });

      const first = make('unique-name');
      const duplicate = make('unique-name');
      await templates.create(first);
      await expect(templates.create(duplicate)).rejects.toThrow(/duplicate key|UNIQUE constraint/i);

      // The unique slot is freed by delete, so the name can be reused.
      await templates.delete(sessionId, first.id);
      const reused = make('unique-name');
      await templates.create(reused);
      expect((await templates.findByName(sessionId, 'unique-name'))?.id).toBe(reused.id);
      await templates.delete(sessionId, reused.id);
    });

    it('templates: unique (sessionId, name) rejects a conflicting update', async () => {
      const templates = harness.templates;
      const sessionId = id('session');
      const now = new Date().toISOString();
      const first: Template = {
        id: id('tpl'),
        sessionId,
        name: 'first-name',
        body: 'first',
        header: null,
        footer: null,
        createdAt: now,
        updatedAt: now,
      };
      const second: Template = {
        id: id('tpl'),
        sessionId,
        name: 'second-name',
        body: 'second',
        header: null,
        footer: null,
        createdAt: now,
        updatedAt: now,
      };
      await templates.create(first);
      await templates.create(second);

      // Renaming the second template onto the first name must be rejected on
      // both drivers (table constraint on sqlite, unique index on postgres).
      await expect(
        templates.update({ ...second, name: 'first-name', updatedAt: new Date().toISOString() }),
      ).rejects.toThrow(/duplicate key|UNIQUE constraint/i);

      // The rejected update must not have changed the stored row.
      expect((await templates.findOne(sessionId, second.id))?.name).toBe('second-name');
      await templates.delete(sessionId, first.id);
      await templates.delete(sessionId, second.id);
    });

    // ------------------------------------------------------- sending policy
    it('sending policy: sliding windows, counters and new chat controls', () => {
      let now = Date.UTC(2026, 0, 15, 12, 0, 0);
      const policy = new SendingPolicyService(harness.localDir, () => now);
      try {
        const windowSession = id('policy-windows');
        policy.setOverrides(windowSession, {
          maxPerMinute: 2,
          maxPerHour: 5,
          maxPerDay: 10,
          newChatsPerDay: 10,
          reachoutMinIntervalSeconds: 0,
          warmupDays: 1,
          warmupFloorPercent: 100,
        });
        const chat = '777@s.whatsapp.net';
        expect(policy.isNewChat(windowSession, chat)).toBe(true);
        policy.recordSend(windowSession, chat);
        now += 1000;
        policy.recordSend(windowSession, chat);
        expect(policy.isNewChat(windowSession, chat)).toBe(false);

        const usage = policy.getUsage(windowSession);
        expect(usage.counts.lastMinute).toBe(2);
        expect(usage.counts.lastHour).toBe(2);
        expect(usage.counts.lastDay).toBe(2);
        expect(usage.counts.newChatsLastDay).toBe(1);

        // Minute cap blocks a third send, then the window rolls over.
        expect(() => policy.assertSendAllowed(windowSession, chat)).toThrow('Per minute send cap reached');
        now += 61_000;
        expect(() => policy.assertSendAllowed(windowSession, chat)).not.toThrow();
        const rolled = policy.getUsage(windowSession);
        expect(rolled.counts.lastMinute).toBe(0);
        expect(rolled.counts.lastHour).toBe(2);
        expect(rolled.counts.lastDay).toBe(2);

        // New chat quota and reachout timelock.
        const newChatSession = id('policy-new-chat');
        policy.setOverrides(newChatSession, {
          maxPerMinute: 100,
          maxPerHour: 100,
          maxPerDay: 100,
          newChatsPerDay: 2,
          reachoutMinIntervalSeconds: 60,
          warmupDays: 1,
          warmupFloorPercent: 100,
        });
        const first = '778@s.whatsapp.net';
        const second = '779@s.whatsapp.net';
        const third = '780@s.whatsapp.net';
        policy.recordSend(newChatSession, first);
        expect(() => policy.assertSendAllowed(newChatSession, second)).toThrow('Reachout timelock');
        now += 61_000;
        expect(() => policy.assertSendAllowed(newChatSession, second)).not.toThrow();
        policy.recordSend(newChatSession, second);
        expect(() => policy.assertSendAllowed(newChatSession, third)).toThrow('New chats per day quota reached');

        // A failed send to a brand new chat occupies the timelock slot. A
        // failed send to a known chat records nothing.
        const failedSession = id('policy-failed');
        policy.setOverrides(failedSession, { newChatsPerDay: 10, reachoutMinIntervalSeconds: 0 });
        const attempted = '781@s.whatsapp.net';
        policy.recordSend(failedSession, attempted, true);
        expect(policy.isNewChat(failedSession, attempted)).toBe(false);
        const before = policy.getUsage(failedSession).counts.lastDay;
        policy.recordSend(failedSession, attempted, true);
        expect(policy.getUsage(failedSession).counts.lastDay).toBe(before);

        policy.resetSession(windowSession);
        expect(policy.getUsage(windowSession).counts.lastDay).toBe(0);
      } finally {
        policy.destroy();
      }
    });

    // ---------------------------------------------------------------- audit
    it('audit: insert, filter by action, session, severity and query by api key', async () => {
      const audit = new AuditService(harness.localDir);
      try {
        const sessionId = id('session');
        const apiKeyId = id('key');
        const written = await audit.log(
          AuditAction.MESSAGE_SENT,
          {
            apiKeyId,
            apiKeyName: 'conformance key',
            sessionId,
            sessionName: 'conformance',
            metadata: { chatId: '888@s.whatsapp.net', attempt: 1 },
          },
          AuditSeverity.WARN,
        );
        expect(written).not.toBeNull();
        expect(written?.action).toBe(AuditAction.MESSAGE_SENT);
        expect(written?.severity).toBe(AuditSeverity.WARN);

        const byAction = await audit.findAll({ action: AuditAction.MESSAGE_SENT, sessionId });
        expect(byAction.total).toBe(1);
        expect(byAction.data[0].id).toBe(written!.id);
        expect(JSON.parse(byAction.data[0].metadata!)).toEqual({
          chatId: '888@s.whatsapp.net',
          attempt: 1,
        });

        expect((await audit.findAll({ sessionId, severity: AuditSeverity.ERROR })).total).toBe(0);
        expect((await audit.getRecentByApiKey(apiKeyId)).length).toBe(1);
        expect((await audit.getRecentBySession(sessionId)).length).toBe(1);
      } finally {
        audit.destroy();
      }
    });
  });
}
