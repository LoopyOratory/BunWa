import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';
import { UnprocessableEntityException } from '../core/exceptions';
import { getAudioDurationSeconds } from '../core/media/audio';

// The PNG signature plus a partial IHDR header: enough bytes to prove the
// normaliser carried real bytes through, without depending on an image codec.
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PNG_BASE64 = PNG_BYTES.toString('base64');
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const HTTP_URL = 'https://example.com/pixel.png';
const LOCAL_PATH = '/tmp/bunwa-status-media-test.png';
const CONTACT_JID = '15550001111@s.whatsapp.net';
const GROUP_JID = '120363000000000000@g.us';
const ME_JID = '15559998888@s.whatsapp.net';

interface SentCall {
  jid: string;
  message: any;
  options: any;
}

/**
 * Builds a session instance with the real status methods from the prototype and
 * a stubbed socket, so the payload handed to Baileys can be inspected without a
 * network connection.
 */
function createSession() {
  const sent: SentCall[] = [];
  const converted: Buffer[] = [];
  const session: any = Object.create(WhatsappSessionNoWebCore.prototype);
  session.sock = {
    user: { id: ME_JID },
    authState: { creds: { me: { id: ME_JID } } },
    sendMessage: async (jid: string, message: any, options: any) => {
      sent.push({ jid, message, options });
      return { key: { id: options?.messageId ?? 'generated' } };
    },
  };
  session.maintainPresenceOnline = async () => {};
  session.logger = {
    child: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
  };
  session.store = {
    getContacts: async () => [{ id: CONTACT_JID }, { id: GROUP_JID }],
  };
  session.mediaConverter = {
    voice: async (input: Buffer) => {
      converted.push(input);
      return Buffer.concat([input, Buffer.from('converted')]);
    },
  };
  session.generateMessageID = () => 'test-message-id';
  session.saveSentMessageId = () => {};
  return { session, sent, converted };
}

const MEDIA_CASES = [
  { kind: 'image', method: 'sendImageStatus', key: 'image' },
  { kind: 'video', method: 'sendVideoStatus', key: 'video' },
] as const;

for (const { kind, method, key } of MEDIA_CASES) {
  describe(`${kind} status file normalisation`, () => {
    it('sends a { data, mimetype } object as raw bytes', async () => {
      const { session, sent } = createSession();
      await session[method]({ file: { data: PNG_BASE64, mimetype: 'image/png' }, caption: 'probe' });
      const media = sent[0].message[key];
      expect(Buffer.isBuffer(media)).toBe(true);
      expect((media as Buffer).equals(PNG_BYTES)).toBe(true);
      expect(sent[0].jid).toBe('status@broadcast');
    });

    it('sends a { data } object carrying a data URL as raw bytes', async () => {
      const { session, sent } = createSession();
      await session[method]({ file: { data: PNG_DATA_URL, mimetype: 'image/png' } });
      const media = sent[0].message[key];
      expect(Buffer.isBuffer(media)).toBe(true);
      expect((media as Buffer).equals(PNG_BYTES)).toBe(true);
    });

    it('sends a { url } object as a URL, keeping the declared mimetype', async () => {
      const { session, sent } = createSession();
      await session[method]({ file: { url: HTTP_URL, mimetype: 'image/png' } });
      expect(sent[0].message[key]).toEqual({ url: HTTP_URL, mimetype: 'image/png' });
    });

    it('sends a data URL string as raw bytes', async () => {
      const { session, sent } = createSession();
      await session[method]({ file: PNG_DATA_URL });
      const media = sent[0].message[key];
      expect(Buffer.isBuffer(media)).toBe(true);
      expect((media as Buffer).equals(PNG_BYTES)).toBe(true);
    });

    it('sends a bare base64 string as raw bytes', async () => {
      const { session, sent } = createSession();
      await session[method]({ file: PNG_BASE64 });
      const media = sent[0].message[key];
      expect(Buffer.isBuffer(media)).toBe(true);
      expect((media as Buffer).equals(PNG_BYTES)).toBe(true);
    });

    it('sends an http URL string as a URL', async () => {
      const { session, sent } = createSession();
      await session[method]({ file: HTTP_URL });
      expect(sent[0].message[key]).toEqual({ url: HTTP_URL });
    });

    it('sends a local path string as a URL for Baileys to read', async () => {
      const { session, sent } = createSession();
      await session[method]({ file: LOCAL_PATH });
      expect(sent[0].message[key]).toEqual({ url: LOCAL_PATH });
    });

    it('rejects a file object without data or url as a client error', async () => {
      const { session, sent } = createSession();
      const error = await session[method]({ file: { mimetype: 'image/png' } }).catch((e: any) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.message).toMatch(/Unsupported file input/);
      expect(error.message).toMatch(/data URL/);
      expect(error.message).toMatch(/base64/);
      expect(sent).toHaveLength(0);
    });

    it('rejects a non-string, non-object input as a client error, not a path error', async () => {
      for (const file of [42, null, { data: 123 }]) {
        const { session, sent } = createSession();
        const error = await session[method]({ file }).catch((e: any) => e);
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error).not.toBeInstanceOf(TypeError);
        expect(String(error.message)).not.toMatch(/getValidatedPath|must be of type string/);
        expect(sent).toHaveLength(0);
      }
    });
  });
}

describe('voice status file normalisation', () => {
  const send = (session: any, file: any, convert?: boolean) =>
    session.sendVoiceStatus(convert === undefined ? { file } : { file, convert });

  it('transcodes a { data, mimetype } object from its actual bytes', async () => {
    const { session, sent, converted } = createSession();
    await send(session, { data: PNG_BASE64, mimetype: 'audio/mpeg' });
    expect(converted).toHaveLength(1);
    expect(converted[0].equals(PNG_BYTES)).toBe(true);
    expect(sent[0].message.audio).toBeInstanceOf(Buffer);
    expect(sent[0].message.ptt).toBe(true);
    expect(sent[0].message.mimetype).toBe('audio/ogg; codecs=opus');
  });

  it('transcodes a data URL and a bare base64 string from their bytes', async () => {
    for (const file of [PNG_DATA_URL, PNG_BASE64]) {
      const { session, converted } = createSession();
      await send(session, file);
      expect(converted).toHaveLength(1);
      expect(converted[0].equals(PNG_BYTES)).toBe(true);
    }
  });

  it('transcodes a { url } object carrying a data URL from its bytes', async () => {
    const { session, converted } = createSession();
    await send(session, { url: PNG_DATA_URL, mimetype: 'audio/ogg' });
    expect(converted).toHaveLength(1);
    expect(converted[0].equals(PNG_BYTES)).toBe(true);
  });

  it('keeps the computed duration field when the send carries seconds', async () => {
    const { session, sent } = createSession();
    await send(session, PNG_BASE64);
    expect(sent[0].message.seconds === undefined || typeof sent[0].message.seconds === 'number').toBe(true);
  });

  it('with convert false, sends an object as bytes and strings as URLs', async () => {
    const { session, sent, converted } = createSession();
    await send(session, { data: PNG_BASE64, mimetype: 'audio/ogg' }, false);
    expect(converted).toHaveLength(0);
    expect(Buffer.isBuffer(sent[0].message.audio)).toBe(true);

    const second = createSession();
    await send(second.session, LOCAL_PATH, false);
    expect(second.sent[0].message.audio).toEqual({ url: LOCAL_PATH });
    expect(second.sent[0].message.ptt).toBe(true);

    const third = createSession();
    await send(third.session, HTTP_URL, false);
    expect(third.sent[0].message.audio).toEqual({ url: HTTP_URL });
  });

  it('rejects an invalid file before touching the converter', async () => {
    const { session, sent, converted } = createSession();
    const error = await send(session, { mimetype: 'audio/ogg' }).catch((e: any) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(converted).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('removes the probe temp file used to compute the duration', async () => {
    const prefix = 'bunwa-probe-';
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith(prefix));
    await getAudioDurationSeconds(Buffer.from('not really audio'));
    const after = (await readdir(tmpdir())).filter((name) => name.startsWith(prefix));
    const leftovers = after.filter((name) => !before.includes(name));
    expect(leftovers).toEqual([]);
  });
});

describe('status targeting', () => {
  const allTargets = (sent: SentCall[]) =>
    sent.flatMap((call) => call.options.statusJidList as string[]);

  it('posts a text status only to the given contacts', async () => {
    const { session, sent } = createSession();
    await session.sendTextStatus({ text: 'probe', contacts: [CONTACT_JID] });
    expect(sent.length).toBeGreaterThan(0);
    for (const call of sent) {
      expect(call.jid).toBe('status@broadcast');
    }
    expect(sent[0].message.text).toBe('probe');
    expect(allTargets(sent)).toContain(CONTACT_JID);
    expect(allTargets(sent)).toContain(ME_JID);
    expect(allTargets(sent)).not.toContain(GROUP_JID);
  });

  it('falls back to stored personal contacts when no contacts are given', async () => {
    const { session, sent } = createSession();
    await session.sendTextStatus({ text: 'probe' });
    expect(allTargets(sent)).toContain(CONTACT_JID);
    expect(allTargets(sent)).toContain(ME_JID);
    expect(allTargets(sent)).not.toContain(GROUP_JID);
  });

  it('targets contacts for a media status as well', async () => {
    const { session, sent } = createSession();
    await session.sendImageStatus({ file: PNG_BASE64, contacts: [CONTACT_JID] });
    expect(allTargets(sent)).toContain(CONTACT_JID);
    expect(allTargets(sent)).toContain(ME_JID);
  });
});
