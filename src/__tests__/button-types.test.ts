import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { buttonToJson } from '../core/engines/noweb/noweb.buttons';
import { ButtonType } from '../structures/chatting.buttons.dto';

/**
 * Locks every button type WhatsApp supports (without Meta infrastructure) to
 * the native flow name and parameters the client expects. A wrong name renders
 * a button that does nothing when tapped, which is exactly the bug this file
 * exists to prevent from coming back.
 */
describe('interactive button types', () => {
  const cases: Array<[Record<string, unknown>, string, Record<string, unknown>]> = [
    [{ type: ButtonType.REPLY, text: 'Yes' }, 'quick_reply', { display_text: 'Yes' }],
    [
      { type: ButtonType.URL, text: 'Docs', url: 'https://example.com' },
      'cta_url',
      { url: 'https://example.com', merchant_url: 'https://example.com' },
    ],
    [{ type: ButtonType.CALL, text: 'Call', phoneNumber: '+233200000000' }, 'cta_call', { phone_number: '+233200000000' }],
    [{ type: ButtonType.COPY, text: 'Copy', copyCode: 'CODE10' }, 'cta_copy', { copy_code: 'CODE10' }],
    [{ type: ButtonType.CATALOG, text: 'Catalog' }, 'cta_catalog', { display_text: 'Catalog' }],
    [{ type: ButtonType.LOCATION, text: 'Location' }, 'send_location', { display_text: 'Location' }],
    [
      { type: ButtonType.FLOW, text: 'Open flow', flowId: '1234567890', flowToken: 'tok', flowCta: 'Open' },
      'flow',
      { flow_id: '1234567890', flow_token: 'tok', flow_cta: 'Open', flow_action: 'navigate', flow_message_version: '3' },
    ],
  ];

  for (const [button, name, expected] of cases) {
    it(`${button.type} maps to ${name}`, () => {
      const json = buttonToJson(button as never);
      expect(json.name).toBe(name);
      const params = JSON.parse(json.buttonParamsJson);
      expect(params.display_text).toBe(button.text);
      for (const [key, value] of Object.entries(expected)) {
        expect(params[key]).toBe(value);
      }
    });
  }

  it('only sends catalog_id when a catalog is named', () => {
    const withoutCatalog = JSON.parse(buttonToJson({ type: ButtonType.CATALOG, text: 'Shop' } as never).buttonParamsJson);
    expect(withoutCatalog.catalog_id).toBeUndefined();
    const withCatalog = JSON.parse(
      buttonToJson({ type: ButtonType.CATALOG, text: 'Shop', catalogId: '999' } as never).buttonParamsJson,
    );
    expect(withCatalog.catalog_id).toBe('999');
  });

  it('gives every button a stable id so replies can be attributed', () => {
    const first = JSON.parse(buttonToJson({ type: ButtonType.REPLY, text: 'Yes' } as never).buttonParamsJson);
    const second = JSON.parse(buttonToJson({ type: ButtonType.REPLY, text: 'Yes' } as never).buttonParamsJson);
    expect(first.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
  });
});
