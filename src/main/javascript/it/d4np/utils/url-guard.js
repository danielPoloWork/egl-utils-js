/**
 * egl-utils-js — the URL guard (spec 09 §2 items F126-F127).
 *
 * **A URL is not text, and this library only protected text.** Escape-by-default
 * (F52, ADR-0037) guarantees that a record's *content* cannot become markup: it
 * reaches the DOM through `textContent`, and markup needs the explicit
 * `{html, sanitize}` pair. It says nothing about a record's *URL*, because an
 * `href` is not text — it is an instruction. A field containing
 * `javascript:fetch('/api/keys').then(…)` becomes a live link executing with the
 * page's full authority, and every escape in this library is irrelevant to it.
 *
 * **Parse, then decide.** That order is the whole security argument, and it is
 * the reason this file contains no regular expression over the input. Every
 * hand-rolled version of this check inspects the string — `startsWith('javascript:')`,
 * a `/^\s*javascript/i` test — and every one of them is wrong in the same four
 * ways, because the URL grammar removes tabs and newlines *inside* the scheme,
 * ignores leading control characters, lower-cases the scheme, and treats a
 * percent-encoded colon as an ordinary path character. `new URL()` implements
 * that grammar; a `Set` lookup on the result implements the policy.
 *
 * | Input | Naive test | This guard | Because |
 * |---|---|---|---|
 * | `JaVaScRiPt:alert(1)` | passes | refused | the scheme is case-insensitive |
 * | `java\tscript:alert(1)` | passes | refused | tabs are removed before parsing |
 * | `%6a%61%76%61script:x` | refused | **allowed** | it is a *path*, and the browser agrees |
 *
 * The third row is the one that matters most, and it is why a blocklist cannot
 * do this job: over-refusing a legitimate relative path is a bug too, and only
 * the parser knows which is which.
 *
 * **The default list is what an `href` may be; a `src` says so at the call
 * site.** `http:`, `https:`, `mailto:` and `tel:` plus relative references cover
 * every navigable URL an application renders from data. `data:` and `blob:` are
 * *absent on purpose*: `data:text/html` in an `href` is a script, while the same
 * value in an `<img src>` is an inert picture — so the two image call sites pass
 * `protocols` and the context lives where the context is known (ADR-0084).
 *
 * **What it does not decide.** The verdict is about the *scheme*, and two
 * allowed shapes are worth naming because a reader will ask. A
 * protocol-relative `//host` and its backslash spelling both resolve to
 * the page's own scheme, so they pass — they are an external navigation, which
 * is a link, not an execution. `https://user:pw@host` passes for the same
 * reason: credentials in a URL are a phishing question, not a scheme question,
 * and a caller who wants them refused narrows the answer themselves. Widening
 * is what this option does; narrowing stays where the policy is.
 *
 * @module egl-utils-js
 */

import { assertNoUnknownOptions } from './option-keys.js';

/**
 * The protocols a data-driven `href` may carry, with the trailing colon
 * `URL.protocol` reports.
 *
 * Exported for the **hot path**: the Bootstrap builders check a protocol against
 * this set directly rather than calling {@link safeUrl}, so `/bootstrap` links
 * the parse and the lookup without the option-validation half it never needs
 * (ADR-0084 records the measurement that forced the split).
 *
 * @type {ReadonlySet<string>}
 */
export const DEFAULT_PROTOCOLS = /* @__PURE__ */ new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * A base for judging relative references, and it can never resolve: `.invalid`
 * is reserved by RFC 2606 for exactly this.
 *
 * Resolving against a probe rather than catching a parse failure is what makes
 * the verdict uniform — `/path`, `./path`, `#fragment`, `?query` and the
 * protocol-relative `//host` all become an absolute URL whose scheme can be
 * looked up, instead of four special cases guessing at each other. The caller's
 * own string is what comes back, so the probe never reaches a page.
 */
const PROBE = 'https://egl.invalid/';

/** A protocol token's shape — a typo like `htp:` still fails to match, but a value that is not a scheme at all fails loudly. */
const PROTOCOL_SHAPE = /^[a-z][a-z0-9+.-]*:?$/i;

/**
 * The protocol a value would resolve to, or `null` when there is none to read.
 *
 * The parse half of the guard, on its own so the builders can have it without
 * the policy half: `null` means "no verdict is possible" — an empty string, a
 * non-string, or a URL no engine can parse — and every one of those is refused
 * by both callers.
 *
 * @param {unknown} value
 * @returns {string | null} A lowercase scheme with its colon (`'https:'`).
 */
export function protocolOf(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    // An empty string is refused for a reason worth stating: resolved against
    // any base it IS the base, so a guard that only read the parsed protocol
    // would have called it `https:` and allowed it — and as an `href` an empty
    // value is a link to the current page, which is a different lie from no
    // link at all (F127 leaves the attribute unset instead).
    return null;
  }
  try {
    return new URL(value, PROBE).protocol;
  } catch {
    // Reached, and asserted: a value that carries a scheme ignores the base, so
    // a malformed absolute URL — `http://[`, or `https://` with no host — throws
    // rather than resolving. "The parser could not read it" and "the parser read
    // a scheme I do not trust" get the same verdict, because a URL no engine can
    // parse is not one this library will put in an attribute.
    return null;
  }
}

/**
 * @typedef {object} SafeUrlOptions
 * @property {readonly string[]} [protocols] - Extra protocols this call trusts,
 *   with or without the trailing colon and in any case. **Extends** the default
 *   set rather than replacing it: `['app:', 'ms-excel:']` for a desktop
 *   integration, `['data:', 'blob:']` for an image source. A caller who needs to
 *   *narrow* the set checks the URL themselves — there is one direction here on
 *   purpose, because a "safe URL" that a caller widened is still their decision
 *   and one they made explicitly.
 */

/**
 * Whether a value may be put in an `href` or a `src` — and the value itself when
 * it may (spec 09 F126).
 *
 * **It answers rather than throws, and that is a contract.** A builder rendering
 * fifty records cannot let one hostile field discard the other forty-nine, so a
 * refusal is `null` and the caller decides what a refused URL looks like. A
 * caller who wants an exception writes `?? raise()`; a caller who wants a
 * fallback writes `?? '#'`. Nothing here is thrown on the *input*, because a
 * security check that throws on hostile input has moved the failure rather than
 * removed it — only a malformed **option** (the caller's own configuration)
 * throws, per ADR-0047.
 *
 * **Total by construction.** Any input at all — a number, `null`, a 4 000-character
 * string of control characters — produces a string or `null`, never an
 * exception, which the property suite asserts rather than assumes.
 *
 * @example
 * safeUrl('https://example.com/a?b=1#c'); // → the string
 * safeUrl('/relative/path');              // → the string (a relative reference)
 * safeUrl('#section');                    // → the string
 * safeUrl('mailto:ada@example.com');      // → the string
 *
 * safeUrl('javascript:alert(1)');         // → null
 * safeUrl('JaVaScRiPt:alert(1)');         // → null (the scheme is case-insensitive)
 * safeUrl('java\tscript:alert(1)');       // → null (tabs are removed before parsing)
 * safeUrl('data:text/html,<script>x</script>'); // → null
 * safeUrl('');                            // → null (an empty href is a link to this page)
 *
 * @example
 * // An image source is a different context, so it says so:
 * safeUrl(record.thumbnail, { protocols: ['data:', 'blob:'] });
 *
 * @param {unknown} value - The candidate URL. A non-string is refused rather
 *   than coerced: `String(value)` on an object produces `[object Object]`, which
 *   is a relative path and would be *allowed*.
 * @param {SafeUrlOptions} [options]
 * @returns {string | null} The value unchanged when its protocol is allowed,
 *   `null` when it is not.
 * @throws {TypeError} On a malformed `options` bag, an unknown option key, or a
 *   `protocols` entry that is not a scheme.
 */
export function safeUrl(value, options = {}) {
  const api = 'safeUrl';
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(`${api}: options must be a plain object`);
  }
  const { protocols, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);

  /** @type {ReadonlySet<string>} */
  let allowed = DEFAULT_PROTOCOLS;
  if (protocols !== undefined) {
    if (!Array.isArray(protocols)) {
      throw new TypeError(`${api}: options.protocols must be an array of protocol strings`);
    }
    const extra = new Set(DEFAULT_PROTOCOLS);
    for (const protocol of protocols) {
      if (typeof protocol !== 'string' || !PROTOCOL_SHAPE.test(protocol)) {
        throw new TypeError(
          `${api}: options.protocols contains '${String(protocol)}' — expected a scheme like 'app:'`,
        );
      }
      extra.add(normalizeProtocol(protocol));
    }
    allowed = extra;
  }

  const protocol = protocolOf(value);
  return protocol !== null && allowed.has(protocol) ? /** @type {string} */ (value) : null;
}

/**
 * A protocol token as `URL.protocol` reports it: lowercase, with the colon.
 *
 * Shared with the builders' hot path so the two cannot disagree about whether
 * `'DATA'` and `'data:'` are the same thing — they are.
 *
 * @param {string} protocol
 * @returns {string}
 */
export function normalizeProtocol(protocol) {
  const lower = protocol.toLowerCase();
  return lower.endsWith(':') ? lower : `${lower}:`;
}
