import { describe, it, expect } from 'vitest';
import { createResource, httpClient } from '../../../../../main/javascript/it/d4np/utils/web.js';

// Example tests (roadmap 9.6, spec 02 §2 item F38, ADR-0025) for createResource.

/**
 * A recording stand-in for the transport — the whole point of injecting the
 * client is that this needs no network and no mocking framework.
 *
 * @param {unknown} [result]
 */
function fakeClient(result = { ok: true }) {
  /** @type {Array<{ verb: string, path: string, options: Record<string, unknown> }>} */
  const calls = [];
  /** @param {string} verb */
  const record =
    (verb) => (/** @type {string} */ path, /** @type {Record<string, unknown>} */ options) => {
      calls.push({ verb, path, options });
      return Promise.resolve(result);
    };
  return {
    calls,
    last: () => calls[calls.length - 1],
    get: record('get'),
    post: record('post'),
    put: record('put'),
    patch: record('patch'),
    delete: record('delete'),
  };
}

describe('createResource — the six verbs', () => {
  it('maps each method to its verb and path', async () => {
    const client = fakeClient();
    const users = createResource(client, 'users');

    await users.list();
    expect(client.last()).toMatchObject({ verb: 'get', path: 'users' });

    await users.get(42);
    expect(client.last()).toMatchObject({ verb: 'get', path: 'users/42' });

    await users.create({ name: 'Ada' });
    expect(client.last()).toMatchObject({ verb: 'post', path: 'users' });

    await users.update(42, { name: 'Ada L.' });
    expect(client.last()).toMatchObject({ verb: 'put', path: 'users/42' });

    await users.patch(42, { name: 'A.' });
    expect(client.last()).toMatchObject({ verb: 'patch', path: 'users/42' });

    await users.remove(42);
    expect(client.last()).toMatchObject({ verb: 'delete', path: 'users/42' });
  });

  it('returns whatever the client returns', async () => {
    const users = createResource(fakeClient([{ id: 1 }]), 'users');
    await expect(users.list()).resolves.toEqual([{ id: 1 }]);
  });

  it('sends bodies as JSON', async () => {
    const client = fakeClient();
    const users = createResource(client, 'users');
    await users.create({ name: 'Ada' });
    expect(client.last().options).toEqual({ json: { name: 'Ada' } });
    await users.update(1, { name: 'B' });
    expect(client.last().options).toEqual({ json: { name: 'B' } });
  });

  it('omits the body entirely when none is given', async () => {
    const client = fakeClient();
    const users = createResource(client, 'users');
    await users.create();
    expect(client.last().options).toEqual({});
    await users.patch(1);
    expect(client.last().options).toEqual({});
  });
});

describe('createResource — query strings', () => {
  it('serializes a query object, arrays and all', async () => {
    const client = fakeClient();
    await createResource(client, 'users').list({ page: 2, tag: ['x', 'y'], skip: null });
    expect(client.last().path).toBe('users?page=2&tag=x&tag=y');
  });

  it('omits the "?" when the query is absent or serializes to nothing', async () => {
    const client = fakeClient();
    const users = createResource(client, 'users');
    await users.list();
    expect(client.last().path).toBe('users');
    await users.list(null);
    expect(client.last().path).toBe('users');
    await users.list({});
    expect(client.last().path).toBe('users');
    await users.list({ skip: undefined });
    expect(client.last().path).toBe('users');
  });

  it('rejects a query that is not a plain object', async () => {
    const users = createResource(fakeClient(), 'users');
    expect(() => users.list(/** @type {any} */ ('page=2'))).toThrow(TypeError);
  });
});

describe('createResource — paths and ids', () => {
  it('keeps the configured separators, so a nested collection nests', async () => {
    const client = fakeClient();
    await createResource(client, 'admin/users').get(7);
    expect(client.last().path).toBe('admin/users/7');
  });

  it('preserves a leading slash as the caller declaring an absolute path', async () => {
    const client = fakeClient();
    await createResource(client, '/v2/users').get(7);
    expect(client.last().path).toBe('/v2/users/7');
  });

  it('tolerates redundant separators in the configured path', async () => {
    const client = fakeClient();
    await createResource(client, 'admin//users/').get(7);
    expect(client.last().path).toBe('admin/users/7');
  });

  it('encodes a configured segment that needs it', async () => {
    const client = fakeClient();
    await createResource(client, 'my resources').list();
    expect(client.last().path).toBe('my%20resources');
  });

  it('encodes an id as exactly one segment, so it cannot widen the path', async () => {
    const client = fakeClient();
    const users = createResource(client, 'users');
    await users.get('../admin');
    expect(client.last().path).toBe('users/..%2Fadmin');
    await users.get('a/b');
    expect(client.last().path).toBe('users/a%2Fb');
    await users.remove('with space&amp');
    expect(client.last().path).toBe('users/with%20space%26amp');
  });

  it('refuses a null or undefined id rather than requesting .../undefined', async () => {
    const users = createResource(fakeClient(), 'users');
    for (const method of /** @type {const} */ (['get', 'remove'])) {
      expect(() => users[method](null)).toThrow(TypeError);
      expect(() => users[method](undefined)).toThrow(TypeError);
    }
    expect(() => users.update(null, {})).toThrow(TypeError);
    expect(() => users.patch(undefined, {})).toThrow(TypeError);
  });

  it('accepts a zero id, which is a real id and not a missing one', async () => {
    const client = fakeClient();
    await createResource(client, 'users').get(0);
    expect(client.last().path).toBe('users/0');
  });

  it('renders a composite key through the id option, as one segment', async () => {
    const client = fakeClient();
    const memberships = createResource(client, 'memberships', {
      id: (/** @type {any} */ key) => `${key.tenant}:${key.user}`,
    });
    await memberships.get({ tenant: 'acme', user: 'ada' });
    expect(client.last().path).toBe('memberships/acme%3Aada');
  });
});

describe('createResource — options pass-through', () => {
  it('forwards per-call request options untouched', async () => {
    const client = fakeClient();
    const controller = new AbortController();
    const users = createResource(client, 'users');
    const options = { signal: controller.signal, timeout: 5_000, headers: { 'x-trace': 'abc' } };

    await users.list({ page: 1 }, options);
    expect(client.last().options).toEqual(options);

    await users.get(1, options);
    expect(client.last().options).toEqual(options);

    await users.remove(1, options);
    expect(client.last().options).toEqual(options);
  });

  it('merges the body alongside the caller options without mutating them', async () => {
    const client = fakeClient();
    const options = { timeout: 1_000 };
    await createResource(client, 'users').create({ name: 'Ada' }, options);
    expect(client.last().options).toEqual({ timeout: 1_000, json: { name: 'Ada' } });
    expect(options).toEqual({ timeout: 1_000 });
  });
});

describe('createResource — rejected wiring (fails at build time)', () => {
  it('throws TypeError when the client lacks a verb', () => {
    const partial = fakeClient();
    for (const verb of /** @type {const} */ (['get', 'post', 'put', 'patch', 'delete'])) {
      const broken = { ...partial, [verb]: undefined };
      expect(() => createResource(/** @type {any} */ (broken), 'users')).toThrow(TypeError);
    }
    expect(() => createResource(/** @type {any} */ (null), 'users')).toThrow(TypeError);
    expect(() => createResource(/** @type {any} */ ({}), 'users')).toThrow(TypeError);
  });

  it('throws TypeError on an empty or non-string path', () => {
    expect(() => createResource(fakeClient(), '')).toThrow(TypeError);
    expect(() => createResource(fakeClient(), /** @type {any} */ (7))).toThrow(TypeError);
  });

  it('throws TypeError when options.id is not a function', () => {
    expect(() => createResource(fakeClient(), 'users', { id: /** @type {any} */ ('id') })).toThrow(
      TypeError,
    );
  });
});

describe('createResource — over a real httpClient', () => {
  it('drives the fetch facade end to end', async () => {
    /** @type {Array<{ url: string, method: string, body: string | undefined }>} */
    const seen = [];
    const client = httpClient({
      baseUrl: 'https://api.example.test/v1/',
      fetch: async (/** @type {any} */ url, /** @type {any} */ init) => {
        seen.push({ url: String(url), method: init.method, body: init.body });
        return new Response(JSON.stringify({ id: 42 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const users = createResource(client, 'users');

    await expect(users.get(42)).resolves.toEqual({ id: 42 });
    expect(seen[0]).toMatchObject({ url: 'https://api.example.test/v1/users/42', method: 'GET' });

    await users.create({ name: 'Ada' });
    expect(seen[1]).toMatchObject({
      url: 'https://api.example.test/v1/users',
      method: 'POST',
      body: '{"name":"Ada"}',
    });

    await users.list({ page: 2 });
    expect(seen[2].url).toBe('https://api.example.test/v1/users?page=2');
  });
});
