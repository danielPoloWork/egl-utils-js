import { describe, it, expect, afterEach, vi } from 'vitest';
import { cookieHelper } from '../../../../../main/javascript/it/d4np/utils/storage.js';

// Example tests (roadmap 6.2, spec §2 item 23, ADR-0011). Under vitest/Node
// there is no `document`, so the statically-imported helper exercises the
// no-op path; the browser behaviour runs against a fake `document.cookie`
// that models the real accessor pair (assignment appends/replaces one cookie,
// reads return the joined name=value list — attributes are never echoed back,
// exactly like a browser).

const STORAGE_MODULE = '../../../../../main/javascript/it/d4np/utils/storage.js';

/**
 * A `document`-like object whose `cookie` accessor behaves as browsers do.
 * `writes` records the raw assigned strings so attribute emission can be
 * asserted — the part a real browser hides.
 */
function fakeDocument(initial = {}) {
  /** @type {Map<string, string>} */
  const jar = new Map(Object.entries(initial));
  /** @type {string[]} */
  const writes = [];
  return {
    writes,
    jar,
    get cookie() {
      return Array.from(jar, ([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(raw) {
      writes.push(raw);
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      // Max-Age=0 deletes, mirroring browser behaviour.
      if (/;\s*Max-Age=0(?:;|$)/i.test(raw)) jar.delete(name);
      else jar.set(name, value);
    },
  };
}

/**
 * Re-import the module against stubbed globals so the one-time warning flag
 * and the document lookup are fresh per test.
 * @param {Record<string, unknown>} globals
 */
async function freshHelper(globals) {
  vi.resetModules();
  for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value);
  const mod = await import(STORAGE_MODULE);
  return mod.cookieHelper;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('cookieHelper — Node (no document): no-ops with one warning', () => {
  it('isSupported() is false and reads return empty values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const helper = await freshHelper({ document: undefined });
    expect(helper.isSupported()).toBe(false);
    expect(helper.get('a')).toBeUndefined();
    expect(helper.getAll()).toEqual({});
    expect(() => helper.set('a', 'b')).not.toThrow();
    expect(() => helper.remove('a')).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('warns at most once across many calls (no log flooding in SSR)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const helper = await freshHelper({ document: undefined });
    for (let i = 0; i < 25; i += 1) {
      helper.get('a');
      helper.set('a', 'b');
      helper.getAll();
      helper.remove('a');
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/no-op/);
  });

  it('still validates arguments in Node — a bad name throws, it does not silently no-op', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const helper = await freshHelper({ document: undefined });
    expect(() => helper.get('bad;name')).toThrow(TypeError);
    expect(() => helper.set('bad name', 'v')).toThrow(TypeError);
    expect(() => helper.remove('')).toThrow(TypeError);
  });

  it('treats a document without a string cookie property as unsupported', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const helper = await freshHelper({ document: {} });
    expect(helper.isSupported()).toBe(false);
  });

  it('treats a throwing document global as unsupported (exotic embedding)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const mod = await import(STORAGE_MODULE);
      expect(mod.cookieHelper.isSupported()).toBe(false);
      expect(mod.cookieHelper.get('a')).toBeUndefined();
    } finally {
      delete (/** @type {any} */ (globalThis).document);
    }
  });

  it('the statically-imported helper is in no-op mode under vitest/Node', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cookieHelper.isSupported()).toBe(false);
  });
});

describe('cookieHelper — read', () => {
  it('reads a value by name', async () => {
    const helper = await freshHelper({ document: fakeDocument({ theme: 'dark', lang: 'it' }) });
    expect(helper.get('theme')).toBe('dark');
    expect(helper.get('lang')).toBe('it');
  });

  it('returns undefined for an absent cookie', async () => {
    const helper = await freshHelper({ document: fakeDocument({ a: '1' }) });
    expect(helper.get('missing')).toBeUndefined();
  });

  it('does not match on a prefix or substring of another name', async () => {
    const helper = await freshHelper({ document: fakeDocument({ session_id: 'x' }) });
    expect(helper.get('session')).toBeUndefined();
    expect(helper.get('id')).toBeUndefined();
    expect(helper.get('session_id')).toBe('x');
  });

  it('percent-decodes values, including "=" and ";" inside them', async () => {
    const helper = await freshHelper({
      document: fakeDocument({ t: encodeURIComponent('a=b; c') }),
    });
    expect(helper.get('t')).toBe('a=b; c');
  });

  it('returns an undecodable value verbatim instead of throwing (server-written raw %)', async () => {
    const helper = await freshHelper({ document: fakeDocument({ t: '100%' }) });
    expect(helper.get('t')).toBe('100%');
  });

  it('reads a valueless cookie (no "=" at all) as an empty string', async () => {
    const doc = fakeDocument();
    // A bare `flag` with no '=' is legal in document.cookie; the fake jar
    // always emits `k=v`, so the raw string is overridden here.
    Object.defineProperty(doc, 'cookie', {
      configurable: true,
      get: () => 'flag; a=1',
    });
    const helper = await freshHelper({ document: doc });
    expect(helper.get('flag')).toBe('');
    expect(helper.get('a')).toBe('1');
    expect(helper.getAll()).toEqual({ flag: '', a: '1' });
  });

  it('reads a cookie stored with an empty value ("name=") as an empty string', async () => {
    const doc = fakeDocument({ flag: '' });
    const helper = await freshHelper({ document: doc });
    expect(helper.get('flag')).toBe('');
  });

  it('getAll() returns every cookie, first occurrence winning', async () => {
    const doc = fakeDocument();
    Object.defineProperty(doc, 'cookie', {
      configurable: true,
      get: () => 'a=1; b=2; a=most-specific-came-first',
    });
    const helper = await freshHelper({ document: doc });
    expect(helper.getAll()).toEqual({ a: '1', b: '2' });
  });

  it('getAll() has a null prototype — a cookie named __proto__ is data, not a mutation', async () => {
    const doc = fakeDocument();
    Object.defineProperty(doc, 'cookie', {
      configurable: true,
      get: () => '__proto__=polluted; ok=1',
    });
    const helper = await freshHelper({ document: doc });
    const all = helper.getAll();
    expect(Object.getPrototypeOf(all)).toBeNull();
    expect(all['__proto__']).toBe('polluted');
    expect(/** @type {any} */ ({}).polluted).toBeUndefined();
    expect(Object.prototype.toString.call({})).toBe('[object Object]');
  });

  it('tolerates whitespace and empty segments in the cookie string', async () => {
    const doc = fakeDocument();
    Object.defineProperty(doc, 'cookie', {
      configurable: true,
      get: () => '  a=1 ;; b=2 ; ',
    });
    const helper = await freshHelper({ document: doc });
    expect(helper.getAll()).toEqual({ a: '1', b: '2' });
  });

  it('returns {} for an empty cookie string', async () => {
    const helper = await freshHelper({ document: fakeDocument() });
    expect(helper.getAll()).toEqual({});
  });
});

describe('cookieHelper — write and the security defaults (the feature)', () => {
  it('applies SameSite=Lax and Path=/ by default', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    helper.set('a', '1');
    expect(doc.writes[0]).toBe('a=1; Path=/; SameSite=Lax');
  });

  it('adds Secure automatically on an HTTPS page', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'https:' } });
    helper.set('a', '1');
    expect(doc.writes[0]).toContain('; Secure');
  });

  it('omits Secure on http so localhost development works', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    helper.set('a', '1');
    expect(doc.writes[0]).not.toContain('Secure');
  });

  it('never drops an explicitly requested Secure, even on http', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    helper.set('a', '1', { secure: true });
    expect(doc.writes[0]).toContain('; Secure');
  });

  it('honours an explicit secure: false on an HTTPS page', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'https:' } });
    helper.set('a', '1', { secure: false });
    expect(doc.writes[0]).not.toContain('Secure');
  });

  it('emits Max-Age, Path, Domain and SameSite when asked', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'https:' } });
    helper.set('a', '1', {
      maxAge: 3600,
      path: '/app',
      domain: 'example.test',
      sameSite: 'Strict',
    });
    const [write] = doc.writes;
    expect(write).toContain('; Path=/app');
    expect(write).toContain('; Domain=example.test');
    expect(write).toContain('; Max-Age=3600');
    expect(write).toContain('; SameSite=Strict');
  });

  it('omits Domain by default — host-only is the narrower scope', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'https:' } });
    helper.set('a', '1');
    expect(doc.writes[0]).not.toContain('Domain');
  });

  it('accepts sameSite case-insensitively and normalizes it', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'https:' } });
    helper.set('a', '1', { sameSite: /** @type {any} */ ('strict') });
    helper.set('b', '2', { sameSite: /** @type {any} */ ('LAX') });
    expect(doc.writes[0]).toContain('; SameSite=Strict');
    expect(doc.writes[1]).toContain('; SameSite=Lax');
  });

  it('treats maxAge as seconds and accepts 0 via set (an immediate expiry)', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    helper.set('a', '1', { maxAge: 0 });
    expect(doc.writes[0]).toContain('; Max-Age=0');
  });

  it('round-trips a written value through a read', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'https:' },
    });
    helper.set('theme', 'dark mode');
    expect(helper.get('theme')).toBe('dark mode');
  });

  it('works when there is no location global at all', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: undefined });
    helper.set('a', '1');
    expect(doc.writes[0]).not.toContain('Secure'); // cannot prove HTTPS → no flag
  });

  it('omits Secure when reading location throws, instead of failing the write', async () => {
    const doc = fakeDocument();
    vi.resetModules();
    vi.stubGlobal('document', doc);
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const mod = await import(STORAGE_MODULE);
      mod.cookieHelper.set('a', '1');
      expect(doc.writes[0]).toBe('a=1; Path=/; SameSite=Lax');
      // And SameSite=None is refused, since HTTPS could not be proven.
      expect(() => mod.cookieHelper.set('b', '2', { sameSite: 'None' })).toThrow(TypeError);
    } finally {
      delete (/** @type {any} */ (globalThis).location);
    }
  });
});

describe('cookieHelper — injection resistance (ADR-0011)', () => {
  it('encodes a value that tries to append attributes, storing it as data', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'https:' } });
    helper.set('a', 'x; Domain=evil.example; Secure');
    const [write] = doc.writes;
    // Exactly one Domain-free attribute list, and the payload is encoded.
    expect(write).not.toContain('Domain=evil.example');
    expect(write).toContain('%3B'); // the ';' survived only as an escape
    // And it reads back as the literal string it was.
    expect(helper.get('a')).toBe('x; Domain=evil.example; Secure');
  });

  it('encodes newline/CRLF payloads in a value', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    helper.set('a', 'x\r\nSet-Cookie: b=2');
    expect(doc.writes[0]).not.toContain('\r');
    expect(doc.writes[0]).not.toContain('\n');
    expect(helper.get('a')).toBe('x\r\nSet-Cookie: b=2');
  });

  it('rejects a name carrying a separator or control character', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'http:' },
    });
    for (const bad of [
      'a;b',
      'a=b',
      'a b',
      'a,b',
      'a\tb',
      'a\nb',
      'a"b',
      'a/b',
      'a[b]',
      'a{b}',
      'a@b',
      'a:b',
      'a\\b',
      'a<b>',
      'a?b',
      'a',
      'caffè',
    ]) {
      expect(() => helper.set(bad, 'v'), `name ${JSON.stringify(bad)}`).toThrow(TypeError);
    }
  });

  it('accepts the full RFC 6265 token alphabet as a name', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    for (const good of ["a!#$%&'*+-.^_`|~b", 'Session_Id', 'x9']) {
      expect(() => helper.set(good, 'v')).not.toThrow();
      expect(helper.get(good)).toBe('v');
    }
  });

  it('rejects a path or domain containing ";"', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'http:' },
    });
    expect(() => helper.set('a', '1', { path: '/x; Secure' })).toThrow(TypeError);
    expect(() => helper.set('a', '1', { domain: 'x; Secure' })).toThrow(TypeError);
  });
});

describe('cookieHelper — HttpOnly is refused, not ignored', () => {
  it('throws TypeError with an explanation when httpOnly is passed', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'https:' },
    });
    expect(() => helper.set('a', '1', /** @type {any} */ ({ httpOnly: true }))).toThrow(TypeError);
    expect(() => helper.set('a', '1', /** @type {any} */ ({ httpOnly: true }))).toThrow(
      /invisible to document\.cookie|Set-Cookie/,
    );
  });

  it('refuses even httpOnly: false — the option does not exist here', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'https:' },
    });
    expect(() => helper.set('a', '1', /** @type {any} */ ({ httpOnly: false }))).toThrow(TypeError);
  });
});

describe('cookieHelper — SameSite=None requires Secure', () => {
  it('refuses sameSite None without Secure on http', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'http:' },
    });
    expect(() => helper.set('a', '1', { sameSite: 'None' })).toThrow(/requires secure/i);
  });

  it('refuses sameSite None with an explicit secure: false', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'https:' },
    });
    expect(() => helper.set('a', '1', { sameSite: 'None', secure: false })).toThrow(TypeError);
  });

  it('allows sameSite None on HTTPS, where Secure is implied', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'https:' } });
    helper.set('a', '1', { sameSite: 'None' });
    expect(doc.writes[0]).toContain('; SameSite=None');
    expect(doc.writes[0]).toContain('; Secure');
  });
});

describe('cookieHelper — remove', () => {
  it('deletes a cookie by expiring it', async () => {
    const doc = fakeDocument({ a: '1' });
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    helper.remove('a');
    expect(doc.writes[0]).toContain('; Max-Age=0');
    expect(helper.get('a')).toBeUndefined();
  });

  it('forwards path and domain, which must match to delete', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    helper.remove('a', { path: '/app', domain: 'example.test' });
    expect(doc.writes[0]).toContain('; Path=/app');
    expect(doc.writes[0]).toContain('; Domain=example.test');
  });

  it('defaults to Path=/ and omits Domain', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    helper.remove('a');
    expect(doc.writes[0]).toContain('; Path=/');
    expect(doc.writes[0]).not.toContain('Domain');
  });

  it('removing an absent cookie is a harmless no-op', async () => {
    const doc = fakeDocument();
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    expect(() => helper.remove('nope')).not.toThrow();
    expect(helper.get('nope')).toBeUndefined();
  });
});

describe('cookieHelper — argument validation', () => {
  it('rejects a non-string name and a non-string value', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'http:' },
    });
    for (const bad of [42, null, undefined, {}, ['a']]) {
      expect(() => helper.get(/** @type {any} */ (bad))).toThrow(TypeError);
      expect(() => helper.set(/** @type {any} */ (bad), 'v')).toThrow(TypeError);
    }
    for (const bad of [42, null, undefined, {}, ['a'], 1n]) {
      expect(() => helper.set('a', /** @type {any} */ (bad))).toThrow(TypeError);
    }
  });

  it('rejects a non-plain-object attribute bag with a clear message', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'http:' },
    });
    for (const bad of [null, 42, 'x', ['a']]) {
      expect(() => helper.set('a', '1', /** @type {any} */ (bad))).toThrow(
        /attributes must be a plain object/,
      );
      expect(() => helper.remove('a', /** @type {any} */ (bad))).toThrow(
        /attributes must be a plain object/,
      );
    }
  });

  it('rejects an invalid maxAge', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'http:' },
    });
    for (const bad of [-1, 1.5, Number.NaN, Infinity, '3600', Number.MAX_VALUE]) {
      expect(() => helper.set('a', '1', { maxAge: /** @type {any} */ (bad) })).toThrow(TypeError);
    }
  });

  it('rejects an unknown sameSite value and a non-boolean secure', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'http:' },
    });
    expect(() => helper.set('a', '1', { sameSite: /** @type {any} */ ('nope') })).toThrow(
      TypeError,
    );
    expect(() => helper.set('a', '1', { sameSite: /** @type {any} */ (42) })).toThrow(TypeError);
    expect(() => helper.set('a', '1', { secure: /** @type {any} */ ('yes') })).toThrow(TypeError);
  });

  it('rejects a non-string path or domain', async () => {
    const helper = await freshHelper({
      document: fakeDocument(),
      location: { protocol: 'http:' },
    });
    expect(() => helper.set('a', '1', { path: /** @type {any} */ (42) })).toThrow(TypeError);
    expect(() => helper.set('a', '1', { domain: /** @type {any} */ (42) })).toThrow(TypeError);
  });

  it('validates before writing — a rejected call leaves the jar untouched', async () => {
    const doc = fakeDocument({ keep: '1' });
    const helper = await freshHelper({ document: doc, location: { protocol: 'http:' } });
    expect(() => helper.set('a', '1', { maxAge: -1 })).toThrow(TypeError);
    expect(doc.writes).toHaveLength(0);
    expect(helper.getAll()).toEqual({ keep: '1' });
  });
});
