import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { WhatsappSessionWebJs } from '../core/engines/webjs/session.webjs.core';
import { WhatsappSessionBunWebCore } from '../core/engines/bunweb/session.bunweb.core';

const silent = {
  child: () => ({ info() {}, debug() {}, warn() {}, error() {}, trace() {} }),
} as any;

const baseConfig = {
  printQR: false,
  loggerBuilder: silent,
  sessionStore: {} as any,
  mediaManager: {} as any,
  engineConfig: {},
  sessionConfig: {},
  ignore: { status: false, groups: false, channels: false, broadcast: false },
};

describe('engine capability map', () => {
  it('BUNWEB declares chat breadth and no calls', async () => {
    const session: any = new WhatsappSessionBunWebCore({ ...baseConfig, name: 'caps-bunweb' });
    const info = await session.getEngineInfo();
    expect(info.engine).toBe('BUNWEB');
    expect(info.capabilities).toMatchObject({
      text: true,
      media: true,
      buttons: true,
      channels: true,
      labels: true,
      lid: true,
      calls: false,
      mediaStorage: true,
    });
  });

  it('WEBJS declares calls, media storage and its narrower chat surface', async () => {
    const session: any = new WhatsappSessionWebJs({ ...baseConfig, name: 'caps-webjs' });
    const info = await session.getEngineInfo();
    expect(info.engine).toBe('WEBJS');
    expect(info.capabilities).toMatchObject({
      text: true,
      media: true,
      calls: true,
      mediaStorage: true,
      channels: false,
      labels: false,
      lid: false,
    });
  });
});
