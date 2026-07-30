import { describe, it, expect, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { sanitizeHtml } from '../../../../../main/javascript/it/d4np/utils/sanitize.js';

// Node-side contract (roadmap 6.3, ADR-003/ADR-0012). This file deliberately
// runs in the DEFAULT node environment — no `window` — so it proves the two
// halves of the documented Node story: without a DOM the call fails loudly
// with actionable guidance, and with an explicit jsdom window it works.

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
});

describe('sanitizeHtml — an ambient window installed after import', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The `global-jsdom` pattern: the app (or a test setup) assigns
  // globalThis.window *after* this module — and therefore DOMPurify — was
  // imported, so DOMPurify never auto-bound. sanitizeHtml must still find the
  // DOM without an explicit `window` option.
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
