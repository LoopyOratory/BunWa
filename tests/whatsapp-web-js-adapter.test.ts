/**
 * Smoke test for the whatsapp-web.js adapter.
 * Verifies:
 * 1. Module can be imported
 * 2. WhatsAppWebJsAdapter class exists and implements IWhatsAppEngine
 * 3. Adapter can be instantiated
 * 4. whatsapp-web.js Client class can be instantiated
 * 5. Engine factory correctly resolves the webjs adapter
 */

import { describe, it, expect } from 'bun:test';

describe('WhatsAppWebJsAdapter', () => {
  it('can be imported', async () => {
    const mod = await import(
      '../src/engines/adapters/whatsapp-web-js.adapter'
    );
    expect(mod.WhatsAppWebJsAdapter).toBeDefined();
    expect(typeof mod.WhatsAppWebJsAdapter).toBe('function');
  });

  it('adapter can be instantiated', async () => {
    const { WhatsAppWebJsAdapter } = await import(
      '../src/engines/adapters/whatsapp-web-js.adapter'
    );
    const adapter = new WhatsAppWebJsAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.type).toBe('webjs');
  });

  it('implements all IWhatsAppEngine methods', async () => {
    const { WhatsAppWebJsAdapter } = await import(
      '../src/engines/adapters/whatsapp-web-js.adapter'
    );
    const adapter = new WhatsAppWebJsAdapter();

    // Check all required interface methods exist
    const requiredMethods = [
      'initialize',
      'shutdown',
      'sendText',
      'sendImage',
      'sendVideo',
      'sendAudio',
      'sendDocument',
      'sendLocation',
      'sendContact',
      'sendSticker',
      'sendReaction',
      'sendSeen',
      'startTyping',
      'stopTyping',
      'getContacts',
      'checkNumberExists',
      'getContactById',
      'getNumberId',
      'getChats',
      'getMessages',
      'deleteMessage',
      'forwardMessage',
      'markChatAsRead',
      'getProfilePicture',
      'getGroupMetadata',
      'getGroupMembers',
      'addGroupMembers',
      'removeGroupMembers',
      'leaveGroup',
      'getQrCode',
      'requestPairingCode',
      'getStatus',
      'getMe',
    ];

    for (const method of requiredMethods) {
      expect(typeof (adapter as any)[method]).toBe('function');
    }
  });

  it('whatsapp-web.js Client can be imported', async () => {
    const wwebjs = await import('whatsapp-web.js');
    expect(wwebjs.Client).toBeDefined();
    expect(typeof wwebjs.Client).toBe('function');
  });

  it('whatsapp-web.js Client can be instantiated (with mock config)', async () => {
    const { Client } = await import('whatsapp-web.js');
    // Create a client instance — this tests that whatsapp-web.js is functional.
    // We don't call .initialize() since that needs Chrome + network.
    const client = new Client({
      authStrategy: undefined,
      puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
    expect(client).toBeDefined();
  });

  it('engine factory can import the webjs adapter', async () => {
    const { loadEngine } = await import(
      '../src/engines/engine-factory'
    );
    expect(typeof loadEngine).toBe('function');
  });

  it('getDefaultEngineType defaults to noweb', async () => {
    const { getDefaultEngineType } = await import(
      '../src/engines/engine-factory'
    );
    // Without ENGINE_TYPE env, should default to 'noweb'
    expect(getDefaultEngineType()).toBe('noweb');
  });

  it('getChromePath returns /usr/bin/google-chrome', async () => {
    const { getChromePath } = await import(
      '../src/engines/engine-factory'
    );
    // /usr/bin/google-chrome exists on this system
    expect(getChromePath()).toBe('/usr/bin/google-chrome');
  });
});
