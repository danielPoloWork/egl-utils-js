import { describe, it, expect } from 'vitest';
import { isObject, isEmpty } from '../../../../../main/javascript/it/d4np/utils/data.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

describe('isObject (spec §2 item 14)', () => {
  it('is true for a plain object literal', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
  });

  it('is true for an Object.create(null) object', () => {
    expect(isObject(Object.create(null))).toBe(true);
  });

  it('is false for arrays', () => {
    expect(isObject([])).toBe(false);
    expect(isObject([1, 2])).toBe(false);
  });

  it('is false for null and undefined', () => {
    expect(isObject(null)).toBe(false);
    expect(isObject(undefined)).toBe(false);
  });

  it('is false for built-ins that are not plain data (Date, Map, Set, RegExp)', () => {
    expect(isObject(new Date())).toBe(false);
    expect(isObject(new Map())).toBe(false);
    expect(isObject(new Set())).toBe(false);
    expect(isObject(/x/)).toBe(false);
  });

  it('is false for functions and class instances', () => {
    expect(isObject(() => 1)).toBe(false);
    class Box {}
    expect(isObject(new Box())).toBe(false);
  });

  it('is false for primitives', () => {
    expect(isObject(42)).toBe(false);
    expect(isObject('str')).toBe(false);
    expect(isObject(true)).toBe(false);
    expect(isObject(Symbol('s'))).toBe(false);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.isObject).toBe(isObject);
  });
});

describe('isEmpty (spec §2 item 14)', () => {
  it('is true for null and undefined', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it('is true for an empty string, false for a non-empty one', () => {
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('x')).toBe(false);
  });

  it('is true for an empty array, false for a non-empty one', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([1])).toBe(false);
  });

  it('is true for an empty plain object, false for one with own keys', () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ a: 1 })).toBe(false);
  });

  it('is true for an Object.create(null) object with no own keys', () => {
    // A null-prototype object is still plain (isObject/isPlainObject scope);
    // an object with a non-null custom prototype is not (see isObject tests).
    expect(isEmpty(Object.create(null))).toBe(true);
  });

  it('is true for an empty Map/Set, false for a populated one', () => {
    expect(isEmpty(new Map())).toBe(true);
    expect(isEmpty(new Map([['k', 'v']]))).toBe(false);
    expect(isEmpty(new Set())).toBe(true);
    expect(isEmpty(new Set([1]))).toBe(false);
  });

  it('is false for values that are never "empty" (numbers, booleans, functions, class instances)', () => {
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty(() => 1)).toBe(false);
    class Box {}
    expect(isEmpty(new Box())).toBe(false);
  });

  it('is false for non-plain objects even with no configured content (Date)', () => {
    expect(isEmpty(new Date())).toBe(false);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.isEmpty).toBe(isEmpty);
  });
});
