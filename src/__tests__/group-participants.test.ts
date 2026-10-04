import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { container } from 'tsyringe';
import { configureContainer } from '../di/container';
import { SessionManager } from '../core/manager.core';
import { WAHAEngine } from '../structures/enums.dto';
import { BadRequestException } from '../core/exceptions';
import { participantId, toJID } from '../core/utils/jids';

// The REST contract for group participants is a list of chat ids
// (15551234567 or 15551234567@c.us). The NOWEB engine used to read every entry
// as an object with an `id`, so a string entry became undefined and Baileys sent
// a malformed group IQ, which WhatsApp answered with "Invalid group metadata
// response: missing <group> node" after a 30 second timeout. These tests pin the
// shared entry reader and the JIDs each engine hands to its transport.

function makeNowebSession() {
  const EngineClass = container.resolve(SessionManager).getEngine(WAHAEngine.NOWEB);
  return new EngineClass({
    name: 'group-participants-noweb',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: {
      child: () => ({
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {},
      }),
    } as any,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  }) as any;
}

function makeWebjsSession() {
  const EngineClass = container.resolve(SessionManager).getEngine(WAHAEngine.WEBJS);
  const session = new EngineClass({
    name: 'group-participants-webjs',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: {
      child: () => ({
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
      }),
    } as any,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  }) as any;
  session.ensureClientReady = () => {};
  return session;
}

describe('participantId', () => {
  it('reads a chat id string', () => {
    expect(participantId('15551234567@c.us')).toBe('15551234567@c.us');
    expect(participantId('15551234567')).toBe('15551234567');
  });

  it('reads an object carrying an id', () => {
    expect(participantId({ id: '15551234567@c.us' })).toBe('15551234567@c.us');
  });

  it('returns undefined for malformed entries', () => {
    expect(participantId(undefined)).toBeUndefined();
    expect(participantId(null)).toBeUndefined();
    expect(participantId({})).toBeUndefined();
    expect(participantId({ id: 42 })).toBeUndefined();
    expect(participantId('')).toBeUndefined();
  });
});

describe('NOWEB group participants', () => {
  it('createGroup turns chat ids into user JIDs for Baileys', async () => {
    const session = makeNowebSession();
    let received: any;
    session.sock = {
      groupCreate: async (name: string, participants: string[]) => {
        received = { name, participants };
        return { id: '123@g.us' };
      },
    };

    await session.createGroup({
      name: 'Drill',
      participants: ['15551234567@c.us', '15551234567'],
    });

    expect(received.name).toBe('Drill');
    expect(received.participants).toEqual([
      '15551234567@s.whatsapp.net',
      '15551234567@s.whatsapp.net',
    ]);
  });

  it('createGroup accepts objects with an id', async () => {
    const session = makeNowebSession();
    let received: string[] = [];
    session.sock = {
      groupCreate: async (_name: string, participants: string[]) => {
        received = participants;
        return { id: '123@g.us' };
      },
    };

    await session.createGroup({
      name: 'Drill',
      participants: [{ id: '15551234567@c.us' } as any],
    });

    expect(received).toEqual(['15551234567@s.whatsapp.net']);
  });

  it('keeps LID and group JIDs unchanged', async () => {
    const session = makeNowebSession();
    let received: string[] = [];
    session.sock = {
      groupCreate: async (_name: string, participants: string[]) => {
        received = participants;
        return { id: '123@g.us' };
      },
    };

    await session.createGroup({
      name: 'Drill',
      participants: ['99887766554433@lid', '123@g.us'],
    });

    expect(received).toEqual(['99887766554433@lid', '123@g.us']);
  });

  it('rejects a malformed participant instead of sending undefined', async () => {
    const session = makeNowebSession();
    session.sock = {
      groupCreate: async () => {
        throw new Error('must not be called');
      },
    };

    await expect(
      session.createGroup({ name: 'Drill', participants: [undefined as any] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('participants add and remove use the same JID form', async () => {
    const session = makeNowebSession();
    const calls: any[] = [];
    session.sock = {
      groupParticipantsUpdate: async (id: string, participants: string[], action: string) => {
        calls.push({ id, participants, action });
        return [];
      },
    };

    await session.addParticipants('123@g.us', { participants: ['15551234567'] });
    await session.removeParticipants('123@g.us', { participants: ['15551234567@c.us'] });

    expect(calls).toEqual([
      { id: '123@g.us', participants: ['15551234567@s.whatsapp.net'], action: 'add' },
      { id: '123@g.us', participants: ['15551234567@s.whatsapp.net'], action: 'remove' },
    ]);
  });

  it('treats an empty participant list as an empty list', async () => {
    const session = makeNowebSession();
    let received: string[] | undefined;
    session.sock = {
      groupCreate: async (_name: string, participants: string[]) => {
        received = participants;
        return { id: '123@g.us' };
      },
    };

    await session.createGroup({ name: 'Drill', participants: undefined as any });

    expect(received).toEqual([]);
  });
});

describe('WEBJS group participants', () => {
  it('createGroup appends the c.us suffix like before and accepts objects', async () => {
    const session = makeWebjsSession();
    let received: string[] = [];
    session.client = {
      createGroup: async (_name: string, participants: string[]) => {
        received = participants;
        return { gid: { _serialized: '123@g.us' } };
      },
    };

    await session.createGroup({
      name: 'Drill',
      participants: ['15551234567', '15551234567@c.us', { id: '15551234567' } as any],
    });

    expect(received).toEqual([
      '15551234567@c.us',
      '15551234567@c.us',
      '15551234567@c.us',
    ]);
  });

  it('rejects a malformed participant with the shared 400', async () => {
    const session = makeWebjsSession();
    session.client = { createGroup: async () => ({ gid: { _serialized: 'x@g.us' } }) };

    await expect(
      session.createGroup({ name: 'Drill', participants: [{} as any] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('toJID', () => {
  it('normalises c.us to s.whatsapp.net', () => {
    expect(toJID('15551234567@c.us')).toBe('15551234567@s.whatsapp.net');
    expect(toJID('15551234567')).toBe('15551234567@s.whatsapp.net');
  });
});

describe('group detail shape', () => {
  it('NOWEB getGroup answers the documented GroupInfo', async () => {
    const session = makeNowebSession();
    session.store = {
      getGroupById: async () => ({
        id: '120363000000000001@g.us',
        subject: 'BunWa Drill',
        desc: 'A description',
        announce: false,
        restrict: true,
        participants: [
          { id: '111111111111111@lid', admin: 'superadmin', username: 'drill_user' },
        ],
      }),
      findPNByLid: async () => '15551234567@s.whatsapp.net',
    };

    const info = await session.getGroup('120363000000000001@g.us');

    // description comes from the engine's desc field, not the raw key
    expect(info.subject).toBe('BunWa Drill');
    expect(info.description).toBe('A description');
    // the LID is resolved to a phone number through the store mapping
    expect(info.participants).toEqual([
      {
        id: '111111111111111@lid',
        pn: '15551234567@c.us',
        role: 'superadmin',
        username: 'drill_user',
      },
    ]);
    // the raw engine fields stay out of the contract
    expect((info as any).announce).toBeUndefined();
    expect((info as any).restrict).toBeUndefined();
  });

  it('NOWEB getGroup leaves pn empty when the store has no mapping', async () => {
    const session = makeNowebSession();
    session.store = {
      getGroupById: async () => ({
        id: '123@g.us',
        subject: 'Drill',
        participants: [{ id: '111111111111111@lid', admin: null }],
      }),
      findPNByLid: async () => null,
    };

    const info = await session.getGroup('123@g.us');

    expect(info.participants?.[0].pn).toBeUndefined();
    expect(info.participants?.[0].role).toBe('participant');
  });

  it('NOWEB keeps a phone number the engine already provided', async () => {
    const session = makeNowebSession();
    let lookedUp = false;
    session.store = {
      getGroupById: async () => ({
        id: '123@g.us',
        participants: [
          { id: '111@lid', phoneNumber: '15551234567@s.whatsapp.net', admin: 'admin' },
        ],
      }),
      findPNByLid: async () => {
        lookedUp = true;
        return null;
      },
    };

    const info = await session.getGroup('123@g.us');

    expect(info.participants?.[0]).toEqual({
      id: '111@lid',
      pn: '15551234567@c.us',
      role: 'admin',
      username: undefined,
    });
    expect(lookedUp).toBe(false);
  });

  it('NOWEB reports membersCanSendMessages as the inverse of announce', async () => {
    const session = makeNowebSession();
    session.store = {
      getGroupById: async () => ({ id: '123@g.us', announce: false, participants: [] }),
    };
    expect((await session.getGroup('123@g.us')).membersCanSendMessages).toBe(true);

    session.store = {
      getGroupById: async () => ({ id: '123@g.us', announce: true, participants: [] }),
    };
    expect((await session.getGroup('123@g.us')).membersCanSendMessages).toBe(false);
  });

  it('NOWEB settings reads still see the raw metadata', async () => {    const session = makeNowebSession();
    session.store = {
      getGroupById: async () => ({
        id: '123@g.us',
        announce: true,
        restrict: true,
        participants: [],
      }),
    };

    expect(await session.getInfoAdminsOnly('123@g.us')).toEqual({ adminsOnly: true });
    expect(await session.getMessagesAdminsOnly('123@g.us')).toEqual({ adminsOnly: true });
  });

  it('WEBJS getGroup answers the same shape with roles', async () => {
    const session = makeWebjsSession();
    session.getGroupChatOrFail = async () => ({
      id: { _serialized: '123@g.us' },
      name: 'BunWa Drill',
      description: 'A description',
      participants: [
        { id: { _serialized: '111@c.us' }, isAdmin: true },
        { id: { _serialized: '222@c.us' }, isSuperAdmin: true },
        { id: { _serialized: '333@c.us' }, username: 'drill_user' },
      ],
    });

    const info = await session.getGroup('123@g.us');

    expect(info.id).toBe('123@g.us');
    expect(info.subject).toBe('BunWa Drill');
    expect(info.description).toBe('A description');
    expect(info.participants?.map((p: any) => p.role)).toEqual([
      'admin',
      'superadmin',
      'participant',
    ]);
    expect(info.participants?.[2].username).toBe('drill_user');
  });
});
