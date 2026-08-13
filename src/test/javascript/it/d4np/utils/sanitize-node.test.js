import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { sanitizeHtml } from '../../../../../main/javascript/it/d4np/utils/sanitize.js';

// Node-side contract (roadmap 6.3, ADR-003/ADR-0012). This file deliberately
// runs in the DEFAULT node environment — no `window` — so it proves the two
// halves of the documented Node story: without a DOM the call fails loudly
// with actionable guidance, and with an explicit jsdom window it works.
//
// Since ADR-0055 the peer is looked up rather than imported, so these suites
// publish it as the global once. That keeps every assertion below about the
// DOM half of the contract, which is what this file is for — the peer half
// (injected, ambient, absent, precedence) is sanitize-peer.test.js.
beforeAll(() => {
  /** @type {any} */ (globalThis).DOMPurify = DOMPurify;
});

describe('sanitizeHtml — Node without a DOM', () => {
  it('throws TypeError naming the jsdom remedy, rather than failing obscurely', () => {
    expect(() => sanitizeHtml('<p>a</p>')).toThrow(TypeError);
    expect(() => sanitizeHtml('<p>a</p>')).toThrow(/requires a DOM/);
    expect(() => sanitizeHtml('<p>a</p>')).toThrow(/jsdom/);
  });

  it('validates its arguments before reporting the missing DOM', () => {
    // A programmer error in the call is reported as such, not masked by the
    // environment complaint.
    expect(() => sanitizeHtml(/** @type {any} */ (42))).toThrow(/html must be a string/);
    expect(() => sanitizeHtml('<p>a</p>', { allowedUriSchemes: ['no spaces'] })).toThrow(
      /invalid scheme/,
    );
  });

  it('rejects a window option that is not a DOM window', () => {
    expect(() => sanitizeHtml('<p>a</p>', /** @type {any} */ ({ window: {} }))).toThrow(TypeError);
    expect(() => sanitizeHtml('<p>a</p>', /** @type {any} */ ({ window: 42 }))).toThrow(TypeError);
  });
});

describe('sanitizeHtml — Node with an explicit jsdom window', () => {
  const { window } = new JSDOM('');

  it('sanitizes against the supplied DOM', () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script>', { window })).toBe('<p>a</p>');
  });

  it('applies the same curated profile as in a browser', () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">', { window })).not.toContain('onerror');
    expect(sanitizeHtml('<a href="javascript:alert(1)">l</a>', { window })).not.toContain(
      'javascript',
    );
    expect(sanitizeHtml('<p style="x" id="y" data-z="1">t</p>', { window })).toBe('<p>t</p>');
  });

  it('reuses the memoized instance across calls with the same window', () => {
    // Same window twice: both calls must behave identically (the second goes
    // through the memoized branch).
    expect(sanitizeHtml('<b>1</b>', { window })).toBe('<b>1</b>');
    expect(sanitizeHtml('<b>2</b>', { window })).toBe('<b>2</b>');
  });

  it('re-resolves when a different window is supplied', () => {
    const other = new JSDOM('').window;
    expect(sanitizeHtml('<b>x</b>', { window: other })).toBe('<b>x</b>');
    expect(sanitizeHtml('<b>y</b>', { window })).toBe('<b>y</b>');
  });

  it('honours option overrides with an explicit window', () => {
    expect(sanitizeHtml('<section>s</section>', { window, additionalTags: ['section'] })).toBe(
      '<section>s</section>',
    );
  });

  it('works with the module injected instead of global, DOM and peer together', () => {
    // The documented Node call in full: both halves supplied explicitly.
    expect(
      sanitizeHtml('<p>a</p><script>alert(1)</script>', { dompurify: DOMPurify, window }),
    ).toBe('<p>a</p>');
  });
});

describe('sanitizeHtml — an ambient window installed after import', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The `global-jsdom` pattern: the app (or a test setup) assigns
  // globalThis.window *after* this module was imported. sanitizeHtml must still
  // find the DOM without an explicit `window` option.
  it('binds to globalThis.window with no explicit option', () => {
    vi.stubGlobal('window', new JSDOM('').window);
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script>')).toBe('<p>a</p>');
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).not.toContain('onerror');
  });

  it('still refuses a global that is not a DOM window', () => {
    vi.stubGlobal('window', { notADocument: true });
    expect(() => sanitizeHtml('<p>a</p>')).toThrow(/requires a DOM/);
  });
});
