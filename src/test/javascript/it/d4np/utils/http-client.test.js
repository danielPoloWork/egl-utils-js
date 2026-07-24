import { describe, it, expect, vi } from 'vitest';
import { httpClient } from '../../../../../main/javascript/it/d4np/utils/web.js';
import {
  HttpError,
  TimeoutError,
  AbortError,
} from '../../../../../main/javascript/it/d4np/utils/errors.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

/**
 * A recording fake fetch: captures (url, init) and returns responses built by
 * the queued factories in order (repeating the last one). Factories, not
 * instances: a Response body is one-shot, so each request needs a fresh one.
 * @param {...(() => Response)} factories
 */
function fakeFetch(...factories) {
  /** @type {Array<{ url: string, init: RequestInit }>} */
  const calls = [];
  let index = 0;
  const impl = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
    calls.push({ url, init });
    const factory = factories[Math.min(index, factories.length - 1)];
    index += 1;
    return factory();
  });
  return { impl, calls };
}

/** @param {unknown} body @param {number} [status] @param {string} [contentType] */
function jsonResponse(body, status = 200, contentType = 'application/json') {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': contentType },
    });
}

describe('httpClient — request shaping (spec §2 item 16, ADR-0007)', () => {
  it('resolves paths against baseUrl and parses JSON responses', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({ id: 42 }));
    const api = httpClient({ baseUrl: 'https://api.example.test/v1/', fetch: impl });
    const result = await api.get('users/42');
    expect(result).toEqual({ id: 42 });
    expect(calls[0].url).toBe('https://api.example.test/v1/users/42');
    expect(calls[0].init.method).toBe('GET');
  });

  it('uses the path as-is when no baseUrl is configured', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({}));
    const api = httpClient({ fetch: impl });
    await api.get('https://absolute.example.test/x');
    expect(calls[0].url).toBe('https://absolute.example.test/x');
  });

  it('wires every verb helper to its method', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({}));
    const api = httpClient({ fetch: impl });
    await api.post('https://h.test/');
    await api.put('https://h.test/');
    await api.patch('https://h.test/');
    await api.delete('https://h.test/');
    expect(calls.map((c) => c.init.method)).toEqual(['POST', 'PUT', 'PATCH', 'DELETE']);
  });

  it('json option stringifies the body and sets content-type unless overridden', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({}));
    const api = httpClient({ fetch: impl });
    await api.post('https://h.test/', { json: { a: 1 } });
    expect(calls[0].init.body).toBe('{"a":1}');
    expect(/** @type {Headers} */ (calls[0].init.headers).get('content-type')).toBe(
      'application/json',
    );

    await api.post('https://h.test/', {
      json: { a: 1 },
      headers: { 'Content-Type': 'application/vnd.custom+json' },
    });
    expect(/** @type {Headers} */ (calls[1].init.headers).get('content-type')).toBe(
      'application/vnd.custom+json',
    );
  });

  it('merges headers case-insensitively, request over client', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({}));
    const api = httpClient({
      fetch: impl,
      headers: { 'X-Trace': 'base', Accept: 'application/json' },
    });
    await api.get('https://h.test/', { headers: { 'x-trace': 'request' } });
    const headers = /** @type {Headers} */ (calls[0].init.headers);
    expect(headers.get('x-trace')).toBe('request'); // request wins, case-insensitive
    expect(headers.get('accept')).toBe('application/json'); // base preserved
  });

  it('rejects json+body together and non-string paths with TypeError', async () => {
    const api = httpClient({ fetch: fakeFetch(jsonResponse({})).impl });
    await expect(api.post('https://h.test/', { json: {}, body: 'x' })).rejects.toBeInstanceOf(
      TypeError,
    );
    await expect(api.get(/** @type {any} */ (42))).rejects.toBeInstanceOf(TypeError);
  });

  it('validates configuration eagerly', () => {
    expect(() => httpClient({ auth: /** @type {any} */ ('token') })).toThrow(TypeError);
    expect(() => httpClient({ timeout: 0 })).toThrow(TypeError);
    expect(() => httpClient({ timeout: -5 })).toThrow(TypeError);
    expect(() => httpClient({ baseUrl: /** @type {any} */ (42) })).toThrow(TypeError);
    expect(() => httpClient({ fetch: /** @type {any} */ ('nope') })).toThrow(TypeError);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.httpClient).toBe(httpClient);
  });
});

describe('httpClient — response parsing by content type', () => {
  it('parses +json structured suffixes as JSON', async () => {
    const { impl } = fakeFetch(
      jsonResponse({ title: 'oops' }, 200, 'application/problem+json; charset=utf-8'),
    );
    const api = httpClient({ fetch: impl });
    await expect(api.get('https://h.test/')).resolves.toEqual({ title: 'oops' });
  });

  it('returns text for non-JSON content types', async () => {
    const { impl } = fakeFetch(
      () => new Response('plain text', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const api = httpClient({ fetch: impl });
    await expect(api.get('https://h.test/')).resolves.toBe('plain text');
  });

  it('returns undefined for 204 and for an empty JSON body', async () => {
    const { impl } = fakeFetch(() => new Response(null, { status: 204 }));
    const api = httpClient({ fetch: impl });
    await expect(api.delete('https://h.test/')).resolves.toBeUndefined();

    const empty = fakeFetch(
      () => new Response('', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const api2 = httpClient({ fetch: empty.impl });
    await expect(api2.get('https://h.test/')).resolves.toBeUndefined();
  });

  it('returns text when the response declares no content-type at all', async () => {
    const { impl } = fakeFetch(() => {
      const response = new Response('mystery bytes', { status: 200 });
      response.headers.delete('content-type'); // Response defaults one; remove it
      return response;
    });
    const api = httpClient({ fetch: impl });
    await expect(api.get('https://h.test/')).resolves.toBe('mystery bytes');
  });

  it('propagates the SyntaxError for a mislabeled malformed JSON body', async () => {
    const { impl } = fakeFetch(
      () =>
        new Response('not json at all', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const api = httpClient({ fetch: impl });
    await expect(api.get('https://h.test/')).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe('httpClient — auth: the no-token-storage contract (ADR-0007)', () => {
  it('attaches Authorization: Bearer from the auth callback, fresh per request', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({}));
    let generation = 0;
    const api = httpClient({
      fetch: impl,
      auth: () => {
        generation += 1;
        return `token-${generation}`;
      },
    });
    await api.get('https://h.test/');
    await api.get('https://h.test/');
    const auth = (/** @type {number} */ i) =>
      /** @type {Headers} */ (calls[i].init.headers).get('authorization');
    expect(auth(0)).toBe('Bearer token-1');
    expect(auth(1)).toBe('Bearer token-2'); // rotation observed — nothing was cached
  });

  it('supports an async auth callback', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({}));
    const api = httpClient({ fetch: impl, auth: async () => 'async-token' });
    await api.get('https://h.test/');
    expect(/** @type {Headers} */ (calls[0].init.headers).get('authorization')).toBe(
      'Bearer async-token',
    );
  });

  it('sends no Authorization header when auth returns undefined', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({}));
    const api = httpClient({ fetch: impl, auth: () => undefined });
    await api.get('https://h.test/');
    expect(/** @type {Headers} */ (calls[0].init.headers).has('authorization')).toBe(false);
  });

  it('fails closed: a throwing auth rejects the request before fetch runs', async () => {
    const boom = new Error('token service down');
    const { impl } = fakeFetch(jsonResponse({}));
    const api = httpClient({
      fetch: impl,
      auth: () => {
        throw boom;
      },
    });
    await expect(api.get('https://h.test/')).rejects.toBe(boom);
    expect(impl).not.toHaveBeenCalled(); // nothing was sent unauthenticated
  });

  it('an explicit Authorization header wins and auth is not called', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({}));
    const auth = vi.fn(() => 'should-not-be-used');
    const api = httpClient({ fetch: impl, auth });
    await api.get('https://h.test/', { headers: { Authorization: 'Basic abc' } });
    expect(/** @type {Headers} */ (calls[0].init.headers).get('authorization')).toBe('Basic abc');
    expect(auth).not.toHaveBeenCalled();
  });

  it('rejects a non-string truthy token with TypeError', async () => {
    const api = httpClient({
      fetch: fakeFetch(jsonResponse({})).impl,
      auth: () => /** @type {any} */ (12345),
    });
    await expect(api.get('https://h.test/')).rejects.toBeInstanceOf(TypeError);
  });
});

describe('httpClient — failures and cancellation (ADR-0003/0004)', () => {
  it('rejects HttpError with status and parsed JSON body on non-2xx', async () => {
    const { impl } = fakeFetch(jsonResponse({ error: 'nope' }, 403));
    const api = httpClient({ fetch: impl });
    const err = /** @type {HttpError} */ (await api.get('https://h.test/x').catch((e) => e));
    expect(err).toBeInstanceOf(HttpError);
    expect(err.code).toBe('EGL_HTTP');
    expect(err.status).toBe(403);
    expect(err.body).toEqual({ error: 'nope' });
    expect(err.message).toContain('403');
  });

  it('carries a text body on non-JSON error responses', async () => {
    const { impl } = fakeFetch(
      () =>
        new Response('gateway exploded', {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        }),
    );
    const api = httpClient({ fetch: impl });
    const err = /** @type {HttpError} */ (await api.get('https://h.test/').catch((e) => e));
    expect(err.status).toBe(502);
    expect(err.body).toBe('gateway exploded');
  });

  it('rejects TimeoutError when the budget expires, aborting the underlying fetch', async () => {
    /** @type {AbortSignal | undefined} */
    let seenSignal;
    const impl = vi.fn(
      (/** @type {string} */ _url, /** @type {RequestInit} */ init) =>
        new Promise((_, reject) => {
          seenSignal = /** @type {AbortSignal} */ (init.signal);
          seenSignal.addEventListener('abort', () => reject(seenSignal?.reason), { once: true });
        }),
    );
    const api = httpClient({ fetch: /** @type {any} */ (impl), timeout: 25 });
    const err = await api.get('https://h.test/slow').catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(seenSignal?.aborted).toBe(true); // the fetch genuinely stopped
  });

  it('per-request timeout overrides the client default', async () => {
    const impl = vi.fn(() => new Promise(() => {}));
    const api = httpClient({ fetch: /** @type {any} */ (impl), timeout: 60_000 });
    const err = await api.get('https://h.test/', { timeout: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
  });

  it('caller signal abort rejects AbortError with the reason as cause', async () => {
    const impl = vi.fn(() => new Promise(() => {}));
    const api = httpClient({ fetch: /** @type {any} */ (impl) });
    const controller = new AbortController();
    const reason = new Error('user navigated away');
    const pending = api.get('https://h.test/', { signal: controller.signal });
    controller.abort(reason);
    const err = await pending.catch((e) => e);
    expect(err).toBeInstanceOf(AbortError);
    expect(err.cause).toBe(reason);
  });

  it('a pre-aborted signal rejects before fetch is ever called', async () => {
    const impl = vi.fn(() => new Promise(() => {}));
    const api = httpClient({ fetch: /** @type {any} */ (impl) });
    const controller = new AbortController();
    controller.abort();
    await expect(api.get('https://h.test/', { signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(impl).not.toHaveBeenCalled();
  });
});
