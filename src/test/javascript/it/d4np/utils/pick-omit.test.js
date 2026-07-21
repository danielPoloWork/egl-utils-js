import { describe, it, expect } from 'vitest';
import { pick, omit } from '../../../../../main/javascript/it/d4np/utils/data.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

describe('pick (spec §2 item 11)', () => {
  it('keeps only the listed keys', () => {
    expect(pick({ id: 1, name: 'a', secret: 'x' }, ['id', 'name'])).toEqual({ id: 1, name: 'a' });
  });

  it('skips listed keys not present on the object (no undefined entries)', () => {
    const result = pick(/** @type {any} */ ({ a: 1 }), ['a', 'missing']);
    expect(result).toEqual({ a: 1 });
    expect('missing' in result).toBe(false);
  });

  it('keeps a key whose value is undefined when it is an own property', () => {
    const result = pick({ a: undefined, b: 2 }, ['a']);
    expect('a' in result).toBe(true);
    expect(result.a).toBeUndefined();
  });

  it('copies only own properties, never inherited ones', () => {
    const proto = { inherited: 'nope' };
    const obj = Object.assign(Object.create(proto), { own: 1 });
    expect(pick(/** @type {any} */ (obj), ['own', 'inherited'])).toEqual({ own: 1 });
  });

  it('does not mutate the input and returns a distinct object', () => {
    const input = { a: 1, b: 2 };
    const result = pick(input, ['a']);
    expect(input).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(input);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.pick).toBe(pick);
  });
});

describe('omit (spec §2 item 11)', () => {
  it('drops the listed keys, keeping the rest', () => {
    expect(omit({ id: 1, name: 'a', secret: 'x' }, ['secret'])).toEqual({ id: 1, name: 'a' });
  });

  it('ignores listed keys not present on the object', () => {
    expect(omit(/** @type {any} */ ({ a: 1 }), ['missing'])).toEqual({ a: 1 });
  });

  it('copies only own enumerable properties', () => {
    const proto = { inherited: 'nope' };
    const obj = Object.assign(Object.create(proto), { own: 1, drop: 2 });
    expect(omit(/** @type {any} */ (obj), ['drop'])).toEqual({ own: 1 });
  });

  it('does not mutate the input and returns a distinct object', () => {
    const input = { a: 1, b: 2 };
    const result = omit(input, ['b']);
    expect(input).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(input);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.omit).toBe(omit);
  });
});

describe('pick/omit — safety and validation', () => {
  it('pick assigns a __proto__ key as an own property, not the prototype', () => {
    const malicious = JSON.parse('{ "__proto__": { "polluted": true }, "safe": 1 }');
    const result = pick(malicious, ['__proto__', 'safe']);
    expect(/** @type {any} */ ({}).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(result.safe).toBe(1);
  });

  it('throws TypeError on a non-object first argument', () => {
    expect(() => pick(/** @type {any} */ (null), [])).toThrow(TypeError);
    expect(() => omit(/** @type {any} */ ('str'), [])).toThrow(TypeError);
  });

  it('throws TypeError on a non-array keys argument', () => {
    expect(() => pick({}, /** @type {any} */ ('a'))).toThrow(TypeError);
    expect(() => omit({}, /** @type {any} */ (42))).toThrow(TypeError);
  });
});
