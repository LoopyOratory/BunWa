import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';
import { evaluateFilters } from '../common/security/webhook-filters';

/**
 * Inbound commerce typing: an order or product message must arrive on
 * WAMessage with a canonical type and a parsed payload, so a workflow can
 * branch on it without decoding the raw proto in _data. The fixtures below
 * are shaped exactly like the live NOWEB messages.upsert events WhatsApp
 * sends for a cart shared from a catalog and for a product card.
 */

const BUYER = '233553919737@c.us';
const BUSINESS = '233209933360@s.whatsapp.net';

function makeSession(): WhatsappSessionNoWebCore {
  return new WhatsappSessionNoWebCore({
    name: 'commerce-test',
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
  });
}

const ORDER_EVENT = {
  key: { id: '3EB0ORDER0001', remoteJid: BUYER, fromMe: false },
  messageTimestamp: 1791139000,
  pushName: 'Shop Owner',
  message: {
    orderMessage: {
      orderId: 'AR4H2B7XQ1',
      itemCount: 2,
      status: 1,
      surface: 1,
      message: '2 items\n\nT-Shirt Blue M x1 R$ 49,90\nMug x1 R$ 29,90\nSubtotal: R$ 79,80',
      orderTitle: 'Order',
      sellerJid: BUSINESS,
      token: 'AR4H2B7XQ1',
      totalAmount1000: 79800,
      totalCurrencyCode: 'BRL',
      messageVersion: 2,
      catalogType: 'NATIVE',
    },
  },
};

const PRODUCT_EVENT = {
  key: { id: '3EB0PRODUCT01', remoteJid: BUYER, fromMe: false },
  messageTimestamp: 1791139100,
  message: {
    productMessage: {
      product: {
        productId: '1234567890123456',
        title: 'Blue T-Shirt M',
        description: '100 percent cotton',
        currencyCode: 'BRL',
        priceAmount1000: 49900,
        salePriceAmount1000: 39900,
        retailerId: 'TS-BLUE-M',
        url: 'https://wa.me/p/1234567890123456/233209933360',
        productImageCount: 3,
      },
      businessOwnerJid: BUSINESS,
      body: 'Blue T-Shirt M',
      footer: 'Shop now',
    },
  },
};

describe('inbound order message', () => {
  it('is typed order and carries the parsed order payload', () => {
    const session = makeSession();
    const message = (session as any).toWAMessage(ORDER_EVENT);
    expect(message.type).toBe('order');
    expect(message.order).toEqual({
      orderId: 'AR4H2B7XQ1',
      itemCount: 2,
      status: 'INQUIRY',
      surface: 'CATALOG',
      message:
        '2 items\n\nT-Shirt Blue M x1 R$ 49,90\nMug x1 R$ 29,90\nSubtotal: R$ 79,80',
      orderTitle: 'Order',
      sellerJid: '233209933360@c.us',
      token: 'AR4H2B7XQ1',
      totalAmount: 79.8,
      currencyCode: 'BRL',
      messageVersion: 2,
      catalogType: 'NATIVE',
    });
    // Not media, and the cart summary stays available in body form only via
    // the structured payload (body is null for an orderMessage today).
    expect(message.hasMedia).toBe(false);
  });

  it('keeps an order with missing optional fields renderable', () => {
    const session = makeSession();
    const message = (session as any).toWAMessage({
      key: { id: '3EB0ORDER0002', remoteJid: BUYER, fromMe: false },
      messageTimestamp: 1791139001,
      message: { orderMessage: { orderId: 'ONLY-ID' } },
    });
    expect(message.type).toBe('order');
    expect(message.order.orderId).toBe('ONLY-ID');
    expect(message.order.itemCount).toBeNull();
    expect(message.order.totalAmount).toBeNull();
    expect(message.order.status).toBeNull();
    expect(message.order.sellerJid).toBeNull();
  });
});

describe('inbound product message', () => {
  it('is typed product and carries the parsed snapshot', () => {
    const session = makeSession();
    const message = (session as any).toWAMessage(PRODUCT_EVENT);
    expect(message.type).toBe('product');
    expect(message.product).toEqual({
      productId: '1234567890123456',
      title: 'Blue T-Shirt M',
      description: '100 percent cotton',
      currencyCode: 'BRL',
      price: 49.9,
      salePrice: 39.9,
      retailerId: 'TS-BLUE-M',
      url: 'https://wa.me/p/1234567890123456/233209933360',
      businessOwnerJid: '233209933360@c.us',
      body: 'Blue T-Shirt M',
      footer: 'Shop now',
    });
  });
});

describe('message type extraction', () => {
  const cases: Array<[string, any, string]> = [
    ['text', { conversation: 'hello' }, 'text'],
    ['extended text', { extendedTextMessage: { text: 'hi' } }, 'text'],
    ['image', { imageMessage: { caption: 'pic' } }, 'image'],
    ['video', { videoMessage: {} }, 'video'],
    ['audio', { audioMessage: {} }, 'audio'],
    ['voice note', { audioMessage: { ptt: true } }, 'voice'],
    ['document', { documentMessage: {} }, 'document'],
    ['sticker', { stickerMessage: {} }, 'sticker'],
    ['location', { locationMessage: {} }, 'location'],
    ['contact', { contactMessage: {} }, 'contact'],
    ['poll', { pollCreationMessage: {} }, 'poll'],
    ['poll vote', { pollUpdateMessage: {} }, 'poll_vote'],
    ['order', { orderMessage: {} }, 'order'],
    ['product', { productMessage: {} }, 'product'],
    ['unknown', { someFutureMessage: {} }, 'unknown'],
  ];

  for (const [label, content, expected] of cases) {
    it(`maps ${label} to ${expected}`, () => {
      const session = makeSession();
      const message = (session as any).toWAMessage({
        key: { id: `T-${label}`, remoteJid: BUYER, fromMe: false },
        messageTimestamp: 1,
        message: content,
      });
      expect(message.type).toBe(expected);
    });
  }
});

describe('webhook type filter', () => {
  it('matches an inbound order by type', () => {
    const session = makeSession();
    const message = (session as any).toWAMessage(ORDER_EVENT);
    const filters = {
      conditions: [{ field: 'type', operator: 'is', value: 'order' }],
    };
    expect(evaluateFilters(filters as any, 'message', message)).toBe(true);
    expect(
      evaluateFilters(
        { conditions: [{ field: 'type', operator: 'is', value: 'product' }] } as any,
        'message',
        message,
      ),
    ).toBe(false);
  });
});
