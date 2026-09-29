import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { extractInteractiveReply } from '../core/engines/noweb/session.noweb.core';

/**
 * Structured interactive replies on the inbound payload: a tap must expose
 * {type, selectedId, selectedText, repliedToMessageId} alongside the plain
 * body, for all four response shapes the protocol uses.
 */

describe('extractInteractiveReply', () => {
  it('parses templateButtonReplyMessage (verified live shape)', () => {
    const reply = extractInteractiveReply({
      templateButtonReplyMessage: {
        selectedId: 'btn-yes',
        selectedDisplayText: 'Yes',
        contextInfo: { stanzaId: 'MSGID123' },
      },
    });
    expect(reply).toEqual({
      type: 'button',
      selectedId: 'btn-yes',
      selectedText: 'Yes',
      repliedToMessageId: 'MSGID123',
    });
  });

  it('parses buttonsResponseMessage', () => {
    const reply = extractInteractiveReply({
      buttonsResponseMessage: {
        selectedButtonId: 'btn-42',
        selectedDisplayText: 'Option A',
        contextInfo: { stanzaId: 'MSGID9' },
      },
    });
    expect(reply).toEqual({
      type: 'button',
      selectedId: 'btn-42',
      selectedText: 'Option A',
      repliedToMessageId: 'MSGID9',
    });
  });

  it('parses listResponseMessage row selection', () => {
    const reply = extractInteractiveReply({
      listResponseMessage: {
        title: 'Row title',
        singleSelectReply: { selectedRowId: 'row-7' },
        contextInfo: { stanzaId: 'MSGID7' },
      },
    });
    expect(reply).toEqual({
      type: 'list',
      selectedId: 'row-7',
      selectedText: 'Row title',
      repliedToMessageId: 'MSGID7',
    });
  });

  it('parses interactiveResponseMessage id out of paramsJson', () => {
    const reply = extractInteractiveReply({
      interactiveResponseMessage: {
        body: { text: 'Tapped', format: 'DEFAULT' },
        nativeFlowResponseMessage: {
          name: 'flow',
          paramsJson: JSON.stringify({ id: 'row-abc', display_text: 'Tapped' }),
          version: '3',
        },
        contextInfo: { stanzaId: 'MSGID5' },
      },
    });
    expect(reply).toEqual({
      type: 'flow',
      selectedId: 'row-abc',
      selectedText: 'Tapped',
      repliedToMessageId: 'MSGID5',
    });
  });

  it('falls back to body text when paramsJson has no id', () => {
    const reply = extractInteractiveReply({
      interactiveResponseMessage: {
        body: { text: 'Fallback label' },
        nativeFlowResponseMessage: { paramsJson: 'not json at all' },
      },
    });
    expect(reply).toEqual({
      type: 'flow',
      selectedId: null,
      selectedText: 'Fallback label',
      repliedToMessageId: null,
    });
  });

  it('returns null for plain messages', () => {
    expect(extractInteractiveReply(null)).toBe(null);
    expect(extractInteractiveReply({ conversation: 'hello' })).toBe(null);
    expect(extractInteractiveReply({ extendedTextMessage: { text: 'hi' } })).toBe(null);
  });
});
