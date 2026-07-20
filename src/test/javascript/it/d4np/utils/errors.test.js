import { describe, it, expect } from 'vitest';
import {
  EglError,
  TimeoutError,
  AbortError,
  RetryExhaustedError,
  HttpError,
  CloneError,
  StorageError,
  DurationParseError,
} from '../../../../../main/javascript/it/d4np/utils/errors.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

/** Every concrete class with its frozen public code (ADR-0003). */
const TAXONOMY = [
  { Ctor: EglError, name: 'EglError', code: 'EGL_ERROR' },
  { Ctor: TimeoutError, name: 'TimeoutError', code: 'EGL_TIMEOUT' },
  { Ctor: AbortError, name: 'AbortError', code: 'EGL_ABORT' },
  { Ctor: RetryExhaustedError, name: 'RetryExhaustedError', code: 'EGL_RETRY_EXHAUSTED' },
  { Ctor: HttpError, name: 'HttpError', code: 'EGL_HTTP' },
  { Ctor: CloneError, name: 'CloneError', code: 'EGL_CLONE' },
  { Ctor: StorageError, name: 'StorageError', code: 'EGL_STORAGE' },
  { Ctor: DurationParseError, name: 'DurationParseError', code: 'EGL_DURATION_PARSE' },
];

/** @param {new (message: string, details: any) => Error} Ctor */
function construct(Ctor) {
  // Classes with required payloads get a well-formed details bag.
  if (Ctor === RetryExhaustedError) return new Ctor('boom', { attempts: 1, errors: [] });
  if (Ctor === HttpError) return new Ctor('boom', { status: 500 });
  if (Ctor === CloneError) return new Ctor('boom', { path: 'a', valueType: 'function' });
  return new Ctor('boom', undefined);
}

describe('error taxonomy (spec §3, ADR-0003)', () => {
  it.each(TAXONOMY)('$name carries name and stable code $code', ({ Ctor, name, code }) => {
    const err = construct(/** @type {any} */ (Ctor));
    expect(err.name).toBe(name);
    expect(/** @type {EglError} */ (err).code).toBe(code);
  });

  it.each(TAXONOMY)('$name extends Error and EglError', ({ Ctor }) => {
    const err = construct(/** @type {any} */ (Ctor));
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EglError);
  });

  it('codes are unique across the taxonomy', () => {
    const codes = TAXONOMY.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('propagates message and cause through every constructor', () => {
    const cause = new Error('root cause');
    expect(new EglError('m', { cause }).cause).toBe(cause);
    expect(new TimeoutError('m', { cause }).cause).toBe(cause);
    expect(new AbortError('m', { cause }).cause).toBe(cause);
    expect(new StorageError('m', { cause }).cause).toBe(cause);
    expect(new DurationParseError('m', { cause }).cause).toBe(cause);
    expect(new RetryExhaustedError('m', { attempts: 1, errors: [], cause }).cause).toBe(cause);
    expect(new HttpError('m', { status: 500, cause }).cause).toBe(cause);
    expect(new CloneError('m', { path: 'a', valueType: 'symbol', cause }).cause).toBe(cause);
    expect(new EglError('m').cause).toBeUndefined();
  });

  it('TimeoutError and AbortError provide sensible default messages', () => {
    expect(new TimeoutError().message).toBe('Operation timed out');
    expect(new AbortError().message).toBe('The operation was aborted');
    expect(new TimeoutError('custom').message).toBe('custom');
  });

  it('AbortError follows the DOM naming convention for ecosystem checks', () => {
    const err = new AbortError();
    // The convention generic abort-detection code relies on:
    expect(err.name).toBe('AbortError');
  });

  it('RetryExhaustedError carries attempts and per-attempt errors in order', () => {
    const failures = [new Error('first'), new Error('second')];
    const err = new RetryExhaustedError('all retries failed', {
      attempts: 2,
      errors: failures,
      cause: failures[1],
    });
    expect(err.attempts).toBe(2);
    expect(err.errors).toEqual(failures);
    expect(err.cause).toBe(failures[1]);
  });

  it('HttpError carries status and optional body', () => {
    const err = new HttpError('HTTP 404', { status: 404, body: { detail: 'missing' } });
    expect(err.status).toBe(404);
    expect(err.body).toEqual({ detail: 'missing' });
    expect(new HttpError('HTTP 500', { status: 500 }).body).toBeUndefined();
  });

  it('CloneError names the offending path and value type (ADR-002)', () => {
    const err = new CloneError('config.handlers[2] is a function', {
      path: 'config.handlers[2]',
      valueType: 'function',
    });
    expect(err.path).toBe('config.handlers[2]');
    expect(err.valueType).toBe('function');
  });
});

describe('cross-realm identity contract (ADR-001/ADR-0003)', () => {
  it('code-based checks recognize a foreign-realm instance that instanceof misses', () => {
    // Simulate the dual-package hazard: an error constructed by "the other"
    // module instance is a plain Error carrying the same name and code.
    const foreign = Object.assign(new Error('Operation timed out'), {
      name: 'TimeoutError',
      code: 'EGL_TIMEOUT',
    });
    expect(foreign).not.toBeInstanceOf(TimeoutError); // instanceof fails across realms
    expect(/** @type {any} */ (foreign).code).toBe(new TimeoutError().code); // code does not
  });
});

describe('root re-export (spec §6)', () => {
  it('exposes the same class objects from the root entry and /errors', () => {
    expect(rootEntry.TimeoutError).toBe(TimeoutError);
    expect(rootEntry.EglError).toBe(EglError);
    expect(rootEntry.RetryExhaustedError).toBe(RetryExhaustedError);
    expect(rootEntry.HttpError).toBe(HttpError);
    expect(rootEntry.CloneError).toBe(CloneError);
    expect(rootEntry.StorageError).toBe(StorageError);
    expect(rootEntry.DurationParseError).toBe(DurationParseError);
    expect(rootEntry.AbortError).toBe(AbortError);
  });
});
