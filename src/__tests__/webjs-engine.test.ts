import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'bun:test';
import { container } from 'tsyringe';
import { configureContainer } from '../di/container';
import { SessionManager } from '../core/manager.core';
import { WAHAEngine } from '../structures/enums.dto';

describe('WEBJS engine', () => {
  let manager: SessionManager;

  beforeAll(() => {
    configureContainer();
    manager = container.resolve(SessionManager);
  });

  describe('engine selection', () => {
    it('getEngine(WEBJS) returns the WEBJS engine class', () => {
      const EngineClass = manager.getEngine(WAHAEngine.WEBJS);
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
      const EngineClass = manager.getEngine(WAHAEngine.WEBJS);
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
    it('getEngine(NOWEB) returns the NOWEB class', () => {
      const EngineClass = manager.getEngine(WAHAEngine.NOWEB);
      expect(EngineClass).toBeDefined();
      expect(typeof EngineClass).toBe('function');
    });

    it('WEBJS and NOWEB return different classes', () => {
      const webjs = manager.getEngine(WAHAEngine.WEBJS);
      const noweb = manager.getEngine(WAHAEngine.NOWEB);
      expect(webjs).not.toBe(noweb);
    });
  });
});
