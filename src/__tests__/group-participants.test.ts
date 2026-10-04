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
      participants: ['233553919737@c.us', '233553919737'],
    });

    expect(received.name).toBe('Drill');
    expect(received.participants).toEqual([
      '233553919737@s.whatsapp.net',
      '233553919737@s.whatsapp.net',
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

    await session.addParticipants('123@g.us', { participants: ['233553919737'] });
    await session.removeParticipants('123@g.us', { participants: ['233553919737@c.us'] });

    expect(calls).toEqual([
      { id: '123@g.us', participants: ['233553919737@s.whatsapp.net'], action: 'add' },
      { id: '123@g.us', participants: ['233553919737@s.whatsapp.net'], action: 'remove' },
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
      participants: ['233553919737', '233553919737@c.us', { id: '15551234567' } as any],
    });

    expect(received).toEqual([
      '233553919737@c.us',
      '233553919737@c.us',
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
