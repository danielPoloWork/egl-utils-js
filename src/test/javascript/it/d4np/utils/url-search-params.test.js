import { describe, it, expect } from 'vitest';
import { urlSearchParams } from '../../../../../main/javascript/it/d4np/utils/web.js';

// Example tests (roadmap 5.2, spec §2 item 17) for the plain-object query
// string builder.

describe('urlSearchParams — object to query string (spec §2 item 17)', () => {
  it('serializes scalar values', () => {
    expect(urlSearchParams({ q: 'a', page: 2 })).toBe('q=a&page=2');
  });

  it('percent-encodes reserved and space characters', () => {
    expect(urlSearchParams({ q: 'a b&c=d' })).toBe('q=a+b%26c%3Dd');
  });

  it('repeats the key once per array element, in array order', () => {
    expect(urlSearchParams({ tag: ['x', 'y', 'z'] })).toBe('tag=x&tag=y&tag=z');
  });

  it('skips null and undefined values entirely', () => {
    expect(urlSearchParams({ a: 1, b: null, c: undefined, d: 2 })).toBe('a=1&d=2');
  });

  it('skips null/undefined elements inside an array without leaving a hole', () => {
    expect(urlSearchParams({ tag: ['x', null, undefined, 'y'] })).toBe('tag=x&tag=y');
  });

  it('an array of only null/undefined produces no pairs for that key', () => {
    expect(urlSearchParams({ tag: [null, undefined], q: 'a' })).toBe('q=a');
  });

  it('coerces non-string scalars with String(...)', () => {
    expect(urlSearchParams({ n: 0, b: false, big: 10n })).toBe('n=0&b=false&big=10');
  });

  it('an empty object produces an empty string', () => {
    expect(urlSearchParams({})).toBe('');
  });

  it('preserves key insertion order', () => {
    expect(urlSearchParams({ z: 1, a: 2 })).toBe('z=1&a=2');
  });

  it('an empty array for a key produces no pairs', () => {
    expect(urlSearchParams({ tag: [], q: 'a' })).toBe('q=a');
  });

  it('rejects a non-object argument', () => {
    expect(() => urlSearchParams(/** @type {any} */ ('x'))).toThrow(TypeError);
    expect(() => urlSearchParams(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => urlSearchParams(/** @type {any} */ (undefined))).toThrow(TypeError);
  });

  it('rejects an array argument (not a plain object)', () => {
    expect(() => urlSearchParams(/** @type {any} */ (['a', 'b']))).toThrow(TypeError);
  });
});
