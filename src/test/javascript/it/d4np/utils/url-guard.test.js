// Example tests (roadmap 23.1, spec 09 §2 item F126 and §6, ADR-0084) for the
// URL guard.
//
// **The corpus is the requirement, not a courtesy.** Spec 09 NFR-48 lists the
// payloads by name, and each one is here with its verdict — including the three
// that are *allowed* and look like they should not be, because over-refusing a
// legitimate relative path is a bug too and only the parser knows which is
// which.
//
// Every expectation below was verified against the engine before it was written
// down, rather than reasoned about: the URL grammar's handling of tabs inside a
// scheme, of a percent-encoded colon and of an empty string are all facts, and a
// security test asserting a belief is worse than no test.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { safeUrl } from '../../../../../main/javascript/it/d4np/utils/sanitize.js';

describe('F126 — what a data-driven href may be', () => {
  it.each([
    ['an https URL', 'https://example.com/a?b=1#c'],
    ['an http URL', 'http://example.com'],
    ['a mailto', 'mailto:ada@example.com'],
    ['a tel', 'tel:+390123456789'],
    ['an absolute path', '/records/42'],
    ['a relative path', './sibling'],
    ['a parent path', '../up'],
    ['a fragment', '#section'],
    ['a query', '?page=2'],
    ['a path that merely looks odd', 'ht tp://not-a-scheme'],
  ])('allows %s', (_label, value) => {
    expect(safeUrl(value)).toBe(value);
  });

  it.each([
    ['the classic', 'javascript:alert(1)'],
    ['mixed case', 'JaVaScRiPt:alert(1)'],
    ['upper case', 'JAVASCRIPT:alert(1)'],
    ['a tab inside the scheme', 'java\tscript:alert(1)'],
    ['a newline inside the scheme', 'java\nscript:alert(1)'],
    ['a CRLF inside the scheme', 'java\r\nscript:alert(1)'],
    ['a leading space', ' javascript:alert(1)'],
    ['a leading NUL', '\u0000javascript:alert(1)'],
    ['an HTML data URL', 'data:text/html,<script>alert(1)</script>'],
    ['a base64 HTML data URL', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['a blob', 'blob:https://example.com/9a8b'],
    ['a file URL', 'file:///etc/passwd'],
    ['an unparseable authority', 'http://['],
    ['a scheme with no host', 'https://'],
  ])('refuses %s', (_label, value) => {
    expect(safeUrl(value)).toBeNull();
  });

  it('refuses the empty string, because an empty href is a link to this page', () => {
    // Not a technicality: resolved against any base, '' IS the base, so a guard
    // that only checked the parsed protocol would have called it https and
    // allowed it (F127 leaves the attribute unset instead).
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { href: 'https://example.com' }],
    ['an array', ['https://example.com']],
    ['a URL instance', new URL('https://example.com')],
  ])('refuses %s rather than coercing it', (_label, value) => {
    // `String({})` is '[object Object]', which is a relative path and would
    // otherwise be ALLOWED — a coercion that turns a programming error into a
    // rendered link.
    expect(safeUrl(/** @type {any} */ (value))).toBeNull();
  });

  it('allows a percent-encoded colon, and the browser agrees', () => {
    // The case a blocklist gets wrong in the expensive direction. This is not a
    // scheme: the URL grammar does not decode escapes in the scheme position, so
    // an engine resolves it as a PATH — and refusing it would break a legitimate
    // filename while protecting nothing.
    const value = '%6a%61%76%61script:alert(1)';
    expect(new URL(value, 'https://egl.invalid/').protocol).toBe('https:');
    expect(safeUrl(value)).toBe(value);
  });

  it.each([
    ['a protocol-relative URL', '//evil.example/path'],
    ['its backslash spelling', '\\\\evil.example/path'],
    ['credentials in a URL', 'https://user:pw@evil.example'],
  ])('allows %s, because the verdict is about the scheme', (_label, value) => {
    // Recorded rather than defended: these are external navigations and a
    // phishing question, not code execution. A caller who wants them refused
    // narrows the answer themselves — this guard widens, and says so.
    expect(safeUrl(value)).toBe(value);
  });
});

describe('F126 — the injected allow-list', () => {
  it('extends the default set rather than replacing it', () => {
    expect(safeUrl('app:open?id=1')).toBeNull();
    expect(safeUrl('app:open?id=1', { protocols: ['app:'] })).toBe('app:open?id=1');
    // …and the defaults are still there:
    expect(safeUrl('https://example.com', { protocols: ['app:'] })).toBe('https://example.com');
  });

  it.each([
    ['with the colon', 'data:'],
    ['without the colon', 'data'],
    ['in upper case', 'DATA:'],
  ])('accepts a protocol written %s', (_label, protocol) => {
    const value = 'data:image/png;base64,iVBOR';
    expect(safeUrl(value, { protocols: [protocol] })).toBe(value);
  });

  it('still refuses what the list does not name', () => {
    expect(safeUrl('vbscript:x', { protocols: ['data:', 'blob:'] })).toBeNull();
  });

  it.each([
    ['options that are not an object', 'nope', /options must be a plain object/],
    ['an unknown option', { allow: ['app:'] }, /unknown option 'allow'/],
    ['a non-array protocols', { protocols: 'app:' }, /options.protocols must be an array/],
    ['a protocol that is not one', { protocols: ['not a scheme'] }, /expected a scheme like/],
    ['a non-string protocol', { protocols: [7] }, /expected a scheme like/],
  ])('refuses %s, because that is the caller’s own configuration', (_label, options, message) => {
    // The ADR-0047 boundary: hostile INPUT is answered with null, a malformed
    // OPTION is a programming error and throws.
    expect(() => safeUrl('https://example.com', /** @type {any} */ (options))).toThrow(message);
  });
});

describe('F126 — totality', () => {
  it('returns a string or null for any string, and never throws', () => {
    // A security check that throws on hostile input has moved the failure rather
    // than removed it — a builder mid-render would lose the rest of the list.
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (value) => {
        const result = safeUrl(value);
        return result === null || result === value;
      }),
      { numRuns: 2000 },
    );
  });

  it('is total over strings built from the characters that break naive checks', () => {
    // The alphabet is the point: every character here appears in one of the
    // corpus payloads above, so the generator explores their combinations rather
    // than random Unicode that no attacker would send.
    const ALPHABET = [
      ...'javascript'.split(''),
      ':',
      '/',
      String.fromCharCode(92),
      String.fromCharCode(9),
      String.fromCharCode(10),
      String.fromCharCode(13),
      String.fromCharCode(0),
      '%',
      '6',
      'A',
      '.',
      '#',
      '?',
      ' ',
    ];
    const hostile = fc.string({ unit: fc.constantFrom(...ALPHABET), maxLength: 60 });

    fc.assert(
      fc.property(hostile, (value) => {
        const result = safeUrl(value);
        if (result === null) return true;
        // Whatever comes back, it is the caller's own string and its scheme is
        // one of the four — asserted here rather than assumed, because "returns
        // the input" is only safe if the verdict was actually made.
        if (result !== value) return false;
        const protocol = new URL(result, 'https://egl.invalid/').protocol;
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(protocol);
      }),
      { numRuns: 3000 },
    );
  });
});
