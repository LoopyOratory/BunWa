/**
 * Engine Factory — creates the right WhatsApp engine adapter based on configuration.
 * Supports Baileys (noweb) and whatsapp-web.js (webjs) engines.
 */

import type { EngineType, IWhatsAppEngine, EngineSessionConfig } from './interface';

let BaileysAdapter: any;
let WhatsAppWebJsAdapter: any;

/** Lazily load engine adapters to avoid loading Chrome when not needed */
async function loadEngine(type: EngineType, sessionConfig?: EngineSessionConfig): Promise<IWhatsAppEngine> {
  if (type === 'noweb' || type === 'baileys') {
    if (!BaileysAdapter) {
      // Baileys adapter is in the existing WAHA-Bun codebase
      // Import from the noweb session module
      const mod = await import('../core/engines/noweb/session.noweb.core');
      BaileysAdapter = mod.WhatsappSessionNoWebCore;
    }
    return new BaileysAdapter() as IWhatsAppEngine;
  }

  if (type === 'webjs') {
    if (!WhatsAppWebJsAdapter) {
      try {
        const mod = await import('./adapters/whatsapp-web-js.adapter');
        WhatsAppWebJsAdapter = mod.WhatsAppWebJsAdapter;
      } catch (err) {
        throw new Error(
          'whatsapp-web.js adapter not found. Run: bun add whatsapp-web.js\n' +
          'Also ensure Chrome is installed at /usr/bin/google-chrome'
        );
      }
    }
    const adapter = new WhatsAppWebJsAdapter();
    return adapter;
  }

  throw new Error(`Unknown engine type: ${type}`);
}

export { loadEngine };

/**
 * Get the default engine type from environment or config.
 * Defaults to 'noweb' (Baileys) — fastest, no Chrome needed.
 */
export function getDefaultEngineType(): EngineType {
  const env = (process.env.ENGINE_TYPE || '').toLowerCase();
  if (env === 'webjs' || env === 'whatsapp-web.js') return 'webjs';
  return 'noweb';
}

/**
 * Get Chrome path for whatsapp-web.js.
 * Checks common locations.
 */
export function getChromePath(): string {
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) return envPath;

  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const p of candidates) {
    const { existsSync } = require('fs');
    if (existsSync(p)) return p;
  }

  throw new Error(
    'Chrome not found. Install it or set CHROME_PATH environment variable.\n' +
    'On Ubuntu: sudo apt install google-chrome-stable'
  );
}
