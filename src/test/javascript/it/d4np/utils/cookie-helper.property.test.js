import { describe, it, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { cookieHelper } from '../../../../../main/javascript/it/d4np/utils/storage.js';

// Property suite (roadmap 2.6 template) for cookieHelper (spec §2 item 23,
// ADR-0011). The headline law is injection immunity: no VALUE, however
// crafted, may add or alter a cookie attribute.
//
// The module resolves `globalThis.document` on every call (never caches it),
// so swapping the stubbed global per run is enough — no module reload, which
// keeps these suites fast enough to run at a useful numRuns.

/** RFC 6265 token characters — the accepted cookie-name alphabet. */
const TOKEN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&'*+-.^_`|~";
const tokenName = fc.string({
  unit: fc.constantFrom(...TOKEN_CHARS.split('')),
  minLength: 1,
  maxLength: 24,
});

/** A fresh `document`-like jar, installed as the global. */
function installJar(protocol = 'https:') {
  /** @type {Map<string, string>} */
  const jar = new Map();
  /** @type {string[]} */
  const writes = [];
  const doc = {
    writes,
    get cookie() {
      return Array.from(jar, ([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(raw) {
      writes.push(raw);
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    },
  };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', { protocol });
  return doc;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cookieHelper — round-trip law', () => {
  // Invariant: for any token name and ANY string value (unicode, delimiters,
  // control characters included), set then get returns the value verbatim.
  it('set then get recovers any string value for any valid name', () => {
    fc.assert(
      fc.property(tokenName, fc.string({ unit: 'binary' }), (name, value) => {
        installJar();
        cookieHelper.set(name, value);
        expect(cookieHelper.get(name)).toBe(value);
      }),
      { numRuns: 200 },
    );
  });

  // Invariant: whatever was set is visible in getAll under its own name.
  it('a set cookie appears in getAll with the same value', () => {
    fc.assert(
      fc.property(tokenName, fc.string(), (name, value) => {
        installJar();
        cookieHelper.set(name, value);
        expect(cookieHelper.getAll()[name]).toBe(value);
      }),
      { numRuns: 200 },
    );
  });
});

describe('cookieHelper — injection immunity law (the security property)', () => {
  // Invariant: for ANY value, the emitted cookie string decomposes into
  // exactly `name=<encoded>` plus the attribute list the CALLER asked for —
  // never more. A value can therefore never introduce Domain, Secure,
  // SameSite, Max-Age, Expires, or a second cookie.
  it('no value can add or alter an attribute', () => {
    fc.assert(
      fc.property(
        tokenName,
        fc.oneof(
          fc.string({ unit: 'binary' }),
          // Deliberately adversarial shapes, so the property does not rely on
          // random chance to produce an attack string.
          fc.constantFrom(
            '; Domain=evil.example',
            'x; Secure; HttpOnly',
            'x; SameSite=None',
            'x; Max-Age=99999999',
            'x; Expires=Thu, 01 Jan 2099 00:00:00 GMT',
            'x\r\nSet-Cookie: injected=1',
            'x=y; path=/',
            ' ; Secure',
          ),
        ),
        (name, value) => {
          const doc = installJar('http:'); // http → Secure must be absent
          cookieHelper.set(name, value);
          const [write] = doc.writes;

          // Exactly the attributes requested by default: Path and SameSite.
          const segments = write.split('; ');
          expect(segments).toHaveLength(3);
          expect(segments[1]).toBe('Path=/');
          expect(segments[2]).toBe('SameSite=Lax');

          // The name=value head carries no delimiter that could split it.
          const head = segments[0];
          expect(head.includes(';')).toBe(false);
          expect(head.includes(',')).toBe(false);
          expect(head.includes('\r')).toBe(false);
          expect(head.includes('\n')).toBe(false);
          expect(head.indexOf('=')).toBe(head.lastIndexOf('=')); // exactly one '='

          // Nothing an attacker aimed for reached a directive position.
          const attributes = segments.slice(1).join('; ').toLowerCase();
          expect(attributes).not.toContain('domain=');
          expect(attributes).not.toContain('secure');
          expect(attributes).not.toContain('httponly');
          expect(attributes).not.toContain('max-age=');
          expect(attributes).not.toContain('expires=');
        },
      ),
      { numRuns: 250 },
    );
  });

  // Invariant: names outside the RFC 6265 token alphabet are always refused,
  // so a crafted name cannot reach the cookie string either.
  it('rejects every name containing a non-token character', () => {
    installJar('http:');
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 12 })
          .filter((s) => Array.from(s).some((ch) => !TOKEN_CHARS.includes(ch))),
        (name) => {
          expect(() => cookieHelper.set(name, 'v')).toThrow(TypeError);
          expect(() => cookieHelper.get(name)).toThrow(TypeError);
        },
      ),
      { numRuns: 250 },
    );
  });
});
