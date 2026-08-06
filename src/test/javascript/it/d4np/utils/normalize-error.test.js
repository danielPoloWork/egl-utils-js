import { describe, it, expect } from 'vitest';
import { normalizeError } from '../../../../../main/javascript/it/d4np/utils/diagnostics.js';
import { HttpError, TimeoutError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

// Example tests (roadmap 9.4, spec 02 §2 item F37, ADR-0023) for normalizeError.

describe('normalizeError — errors', () => {
  it('reads name, message and stack from a plain Error', () => {
    const error = new TypeError('boom');
    const record = normalizeError(error);
    expect(record.name).toBe('TypeError');
    expect(record.message).toBe('boom');
    expect(typeof record.stack).toBe('string');
    expect(record.cause).toBe(error);
  });

  it('lifts the stable code from this library’s errors', () => {
    const record = normalizeError(new TimeoutError('too slow'));
    expect(record).toMatchObject({
      name: 'TimeoutError',
      message: 'too slow',
      code: 'EGL_TIMEOUT',
    });
  });

  it('lifts status and body from an HttpError', () => {
    const record = normalizeError(
      new HttpError('Not Found', { status: 404, body: { error: 'missing' } }),
    );
    expect(record).toMatchObject({
      name: 'HttpError',
      code: 'EGL_HTTP',
      status: 404,
      detail: { error: 'missing' },
    });
  });

  it('keeps the original untouched, so it can still be rethrown', () => {
    const error = new Error('original');
    const record = normalizeError(error);
    expect(record.cause).toBe(error);
    expect(error.message).toBe('original');
    expect(Object.keys(error)).toHaveLength(0);
  });
});

describe('normalizeError — response-shaped objects', () => {
  it('lifts a numeric status and the response body', () => {
    expect(normalizeError({ status: 500, body: 'server error' })).toMatchObject({
      name: 'Object',
      status: 500,
      detail: 'server error',
    });
  });

  it('accepts the statusCode spelling too', () => {
    expect(normalizeError({ statusCode: 503 }).status).toBe(503);
  });

  it('prefers status over statusCode when both are present', () => {
    expect(normalizeError({ status: 400, statusCode: 500 }).status).toBe(400);
  });

  it('reads the common body spellings in order', () => {
    expect(normalizeError({ data: 'axios-style' }).detail).toBe('axios-style');
    expect(normalizeError({ responseText: 'xhr-style' }).detail).toBe('xhr-style');
    expect(normalizeError({ body: 'ours', data: 'theirs' }).detail).toBe('ours');
  });

  it('ignores a non-numeric status', () => {
    expect(normalizeError({ status: '500' }).status).toBeUndefined();
  });

  it('lifts a numeric code as well as a string one', () => {
    expect(normalizeError({ code: 'ENOENT' }).code).toBe('ENOENT');
    expect(normalizeError({ code: -2 }).code).toBe(-2);
    expect(normalizeError({ code: {} }).code).toBeUndefined();
  });
});

describe('normalizeError — thrown non-errors', () => {
  it('names a primitive by its type and describes it', () => {
    expect(normalizeError('boom')).toEqual({ name: 'String', message: 'boom', cause: 'boom' });
    expect(normalizeError(42)).toEqual({ name: 'Number', message: '42', cause: 42 });
    expect(normalizeError(null)).toEqual({ name: 'Null', message: 'null', cause: null });
    expect(normalizeError(undefined)).toEqual({
      name: 'Undefined',
      message: 'undefined',
      cause: undefined,
    });
    expect(normalizeError(false)).toEqual({ name: 'Boolean', message: 'false', cause: false });
  });

  it('handles a thrown symbol, which template literals cannot stringify', () => {
    const symbol = Symbol('nope');
    const record = normalizeError(symbol);
    expect(record.name).toBe('Symbol');
    expect(record.message).toBe('Symbol(nope)');
    expect(record.cause).toBe(symbol);
  });

  it('handles a thrown bigint', () => {
    expect(normalizeError(7n)).toMatchObject({ name: 'Bigint', message: '7' });
  });

  it('describes a plain object as JSON when it carries no message', () => {
    expect(normalizeError({ a: 1 }).message).toBe('{"a":1}');
  });

  it('names an object by its constructor when it has no name', () => {
    class Failure {}
    expect(normalizeError(new Failure()).name).toBe('Failure');
  });

  it('falls back to Object for a null-prototype value', () => {
    const bare = Object.create(null);
    bare.detail = 'x';
    const record = normalizeError(bare);
    expect(record.name).toBe('Object');
    expect(record.cause).toBe(bare);
  });

  it('handles a thrown function', () => {
    const thrown = function boom() {};
    expect(normalizeError(thrown).name).toBe('boom');
  });
});

describe('normalizeError — totality (never throws)', () => {
  it('survives a message getter that throws', () => {
    const hostile = {
      name: 'Hostile',
      get message() {
        throw new Error('getter');
      },
    };
    const record = normalizeError(hostile);
    expect(record.name).toBe('Hostile');
    expect(typeof record.message).toBe('string');
    expect(record.cause).toBe(hostile);
  });

  it('survives a name getter that throws', () => {
    const hostile = {
      get name() {
        throw new Error('getter');
      },
      message: 'still readable',
    };
    expect(normalizeError(hostile)).toMatchObject({ name: 'Object', message: 'still readable' });
  });

  it('survives every other property getter throwing', () => {
    const hostile = {
      message: 'ok',
      get stack() {
        throw new Error('getter');
      },
      get code() {
        throw new Error('getter');
      },
      get status() {
        throw new Error('getter');
      },
      get statusCode() {
        throw new Error('getter');
      },
      get body() {
        throw new Error('getter');
      },
      get data() {
        throw new Error('getter');
      },
      get responseText() {
        throw new Error('getter');
      },
    };
    const record = normalizeError(hostile);
    expect(record.message).toBe('ok');
    expect(record.stack).toBeUndefined();
    expect(record.detail).toBeUndefined();
  });

  it('survives a circular object, which JSON.stringify cannot render', () => {
    /** @type {Record<string, unknown>} */
    const circular = {};
    circular.self = circular;
    expect(normalizeError(circular).message).toBe('[object Object]');
  });

  it('survives a value that cannot be stringified at all', () => {
    const unstringifiable = {
      toString() {
        throw new Error('nope');
      },
      toJSON() {
        throw new Error('nope');
      },
    };
    expect(normalizeError(unstringifiable).message).toBe('');
  });

  it('survives an object whose constructor is not a function', () => {
    const odd = Object.create({ constructor: 'not-a-function' });
    expect(normalizeError(odd).name).toBe('Object');
  });

  it('ignores an empty name and falls back to the constructor', () => {
    const error = new Error('x');
    Object.defineProperty(error, 'name', { value: '' });
    expect(normalizeError(error).name).toBe('Error');
  });

  it('ignores a non-string stack', () => {
    const error = new Error('x');
    Object.defineProperty(error, 'stack', { value: 42 });
    expect(normalizeError(error).stack).toBeUndefined();
  });
});
