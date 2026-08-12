import { describe, it, expect, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { sanitizeHtml } from '../../../../../main/javascript/it/d4np/utils/sanitize.js';
import { PeerMissingError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

// The ADR-0055 peer-resolution contract for /sanitize (roadmap 17.6, spec 05
// F82): the DOMPurify module is a **value looked up**, never an import —
// `options.dompurify`, then `globalThis.DOMPurify`, then a typed failure. The
// same order /bootstrap uses for its own peer (F68, ADR-0041).
//
// This file runs in the DEFAULT node environment, so neither the peer nor a DOM
// is ambient unless a test puts it there — which is what makes the absent case
// assertable at all.

/** A jsdom window, so the peer half is the only variable under test. */
const { window } = new JSDOM('');

afterEach(() => {
  vi.unstubAllGlobals();
  delete (/** @type {any} */ (globalThis).DOMPurify);
});

describe('the peer is injected', () => {
  it('uses options.dompurify with no global at all', () => {
    expect(/** @type {any} */ (globalThis).DOMPurify).toBeUndefined();
    expect(
      sanitizeHtml('<p>a</p><script>alert(1)</script>', { dompurify: DOMPurify, window }),
    ).toBe('<p>a</p>');
  });

  it('accepts a browser-shaped module — an instance that already has .sanitize', () => {
    // A `<script src=purify.min.js>` page exposes the bound instance, not the
    // factory. Both shapes are accepted (ADR-0055).
    const bound = DOMPurify(window);
    expect(typeof bound.sanitize).toBe('function');
    expect(sanitizeHtml('<p>b</p><script>x</script>', { dompurify: bound })).toBe('<p>b</p>');
  });
});

describe('the peer is ambient', () => {
  it('uses globalThis.DOMPurify with no option, as a script-tag page does', () => {
    /** @type {any} */ (globalThis).DOMPurify = DOMPurify;
    expect(sanitizeHtml('<p>c</p><script>alert(1)</script>', { window })).toBe('<p>c</p>');
  });

  it('is found when the global is installed AFTER this module was imported', () => {
    // Not memoized negatively: a late <script> is a normal loading order, not
    // an error to remember (the ADR-0041 rule, applied here).
    expect(() => sanitizeHtml('<p>d</p>', { window })).toThrow(PeerMissingError);
    /** @type {any} */ (globalThis).DOMPurify = DOMPurify;
    expect(sanitizeHtml('<p>d</p>', { window })).toBe('<p>d</p>');
  });
});

describe('the injected module wins over the ambient one', () => {
  it('prefers options.dompurify when both are reachable', () => {
    // A double that reports which surface ran, so precedence is observable
    // rather than inferred.
    /** @type {any} */ (globalThis).DOMPurify = DOMPurify;
    const injected = { sanitize: () => '<p>from-injected</p>' };
    expect(sanitizeHtml('<p>anything</p>', { dompurify: injected, window })).toBe(
      '<p>from-injected</p>',
    );
    // …and the ambient one still serves the call that does not inject.
    expect(sanitizeHtml('<p>e</p>', { window })).toBe('<p>e</p>');
  });
});

describe('the peer is absent', () => {
  it('throws PeerMissingError with the frozen code and .peer, not a module error', () => {
    let thrown;
    try {
      sanitizeHtml('<p>a</p>', { window });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PeerMissingError);
    expect(/** @type {any} */ (thrown).code).toBe('EGL_PEER_MISSING');
    expect(/** @type {any} */ (thrown).peer).toBe('dompurify');
  });

  it('names both remedies in the message — install and inject, or load the global', () => {
    expect(() => sanitizeHtml('<p>a</p>', { window })).toThrow(/dompurify/);
    expect(() => sanitizeHtml('<p>a</p>', { window })).toThrow(/purify\.min\.js/);
  });

  it('never returns unsanitized HTML — absence is loud, never a silent pass-through', () => {
    // The security property the whole contract exists to keep: with no
    // sanitizer reachable there is no output at all, rather than the input back.
    expect(() => sanitizeHtml('<img src=x onerror=alert(1)>', { window })).toThrow(
      PeerMissingError,
    );
  });

  it('reports the missing peer before the missing DOM — two failures, two remedies', () => {
    // Neither reachable: the peer is the more fundamental packaging fault, and
    // you cannot bind a sanitizer to a window without the sanitizer.
    expect(() => sanitizeHtml('<p>a</p>')).toThrow(PeerMissingError);
    // With the peer supplied, the DOM complaint is what surfaces.
    expect(() => sanitizeHtml('<p>a</p>', { dompurify: DOMPurify })).toThrow(/requires a DOM/);
  });

  it('treats an explicitly null module as absent rather than as an object', () => {
    expect(() => sanitizeHtml('<p>a</p>', { dompurify: null, window })).toThrow(PeerMissingError);
  });

  it('still validates the call before reaching for the peer', () => {
    // A programmer error in the arguments is not masked by the packaging fault.
    expect(() => sanitizeHtml(/** @type {any} */ (42))).toThrow(/html must be a string/);
    expect(() => sanitizeHtml('<p>a</p>', { allowedUriSchemes: ['no spaces'] })).toThrow(
      /invalid scheme/,
    );
  });
});

describe('a module that is present but not a sanitizer', () => {
  it('is a TypeError naming the shape, not a peer-missing error', () => {
    // Reachable but unusable is a different fault from unreachable: the remedy
    // is fixing what was passed, not installing anything.
    expect(() => sanitizeHtml('<p>a</p>', { dompurify: { nope: true }, window })).toThrow(
      TypeError,
    );
  });
});
