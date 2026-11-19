import { describe, expect, test } from 'bun:test';
import { chunkText } from '../core/knowledge/chunk';
import { extractDocumentText } from '../core/knowledge/extract';

describe('knowledge chunking', () => {
  test('keeps a short passage in one chunk', () => {
    const chunks = chunkText('Refunds take five working days.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('five working days');
  });

  test('splits a long document on paragraph boundaries and stays under the cap', () => {
    const paragraph = 'A customer can return an item within fourteen days. ';
    const text = Array.from({ length: 40 }, (_, index) => `Paragraph ${index}: ${paragraph}`).join('\n\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 900)).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount > 0)).toBe(true);
  });

  test('extracts plain text uploads', async () => {
    const file = new File(['Pickup is available on Saturdays.'], 'pickup.txt', { type: 'text/plain' });
    const extracted = await extractDocumentText(file);
    expect(extracted.text).toContain('Saturdays');
    expect(extracted.metadata.fileName).toBe('pickup.txt');
  });
});
