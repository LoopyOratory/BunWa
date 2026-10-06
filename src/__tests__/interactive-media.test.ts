import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { normalizeInteractiveMedia } from '../plus/session.noweb.plus';

/**
 * A header image on an interactive message can be a plain string (a URL, or a
 * data URL holding the bytes) as well as an object. Reading it with
 * `'url' in file` threw "Cannot use 'in' operator to search for 'url' in
 * https://..." and sendButtons answered a 500, so the shape is settled before
 * any property access. The 500 was reproduced live with a product photo URL.
 */
describe('interactive message media', () => {
  it('accepts a plain URL string', () => {
    expect(normalizeInteractiveMedia('https://api.vivita.store/static/photo.jpg')).toEqual({
      url: 'https://api.vivita.store/static/photo.jpg',
    });
  });

  it('accepts a data URL and keeps only the payload', () => {
    expect(normalizeInteractiveMedia('data:image/jpeg;base64,AAAA')).toEqual({ data: 'AAAA' });
  });

  it('accepts the object forms the DTO documents', () => {
    expect(normalizeInteractiveMedia({ url: 'https://example.com/a.jpg' })).toEqual({
      url: 'https://example.com/a.jpg',
    });
    expect(normalizeInteractiveMedia({ data: 'AAAA', mimetype: 'image/jpeg' })).toEqual({
      data: 'AAAA',
    });
  });

  it('answers undefined instead of throwing for anything unusable', () => {
    expect(normalizeInteractiveMedia(undefined)).toBeUndefined();
    expect(normalizeInteractiveMedia(null)).toBeUndefined();
    expect(normalizeInteractiveMedia('')).toBeUndefined();
    expect(normalizeInteractiveMedia('data:image/jpeg;base64,')).toBeUndefined();
    expect(normalizeInteractiveMedia({})).toBeUndefined();
    expect(normalizeInteractiveMedia({ url: 42 })).toBeUndefined();
    expect(normalizeInteractiveMedia(123)).toBeUndefined();
  });
});
