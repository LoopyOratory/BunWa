import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'bun:test';
import { container } from 'tsyringe';
import { configureContainer } from '../di/container';
import { SessionManager } from '../core/manager.core';
import { BUNWAEngine } from '../structures/enums.dto';

describe('WEBJS engine', () => {
  let manager: SessionManager;

  beforeAll(() => {
    configureContainer();
    manager = container.resolve(SessionManager);
  });

  describe('engine selection', () => {
    it('getEngine(WEBJS) returns the WEBJS engine class', () => {
      const EngineClass = manager.getEngine(BUNWAEngine.WEBJS);
      expect(EngineClass).toBeDefined();
      expect(typeof EngineClass).toBe('function');
      // The engine class name includes "WebJs" — confirms the require() loaded the
      // right module and didn't throw module-not-found.
      expect(EngineClass.name).toBe('WhatsappSessionWebJs');
    });

    it('constructing WEBJS engine does not throw (static imports resolve)', () => {
      // Constructing with minimal config exercises the static import path at the
      // top of the file (whatsapp-web.js, node-cache, rxjs). Chrome is NOT launched
      // by the constructor — only by .start() / buildClient().
      const EngineClass = manager.getEngine(BUNWAEngine.WEBJS);
      expect(() => {
        new EngineClass({
          name: 'test-webjs',
          printQR: false,
          mediaManager: null as any,
          loggerBuilder: {
            child: () => ({ info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }),
          } as any,
          sessionStore: null as any,
          proxyConfig: undefined,
          sessionConfig: {},
          engineConfig: {},
          ignore: { status: false, groups: false, channels: false, broadcast: false },
        });
      }).not.toThrow();
    });
  });

  describe('engine type resolution', () => {
    it('getEngine(BUNWEB) returns the BUNWEB class', () => {
      const EngineClass = manager.getEngine(BUNWAEngine.BUNWEB);
      expect(EngineClass).toBeDefined();
      expect(typeof EngineClass).toBe('function');
    });

    it('WEBJS and BUNWEB return different classes', () => {
      const webjs = manager.getEngine(BUNWAEngine.WEBJS);
      const bunweb = manager.getEngine(BUNWAEngine.BUNWEB);
      expect(webjs).not.toBe(bunweb);
    });
  });
});
