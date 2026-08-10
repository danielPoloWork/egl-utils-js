/**
 * egl-utils-js — HTML fragment injection, textarea auto-grow, and URL parameter
 * merging (spec 03 §2 items F46-F48).
 *
 * Three helpers that look unrelated and share one theme: each replaces a snippet
 * people write from memory and get subtly wrong — trusting remote markup,
 * measuring a textarea against a stale height, or appending a query parameter to
 * a URL that already has one.
 *
 * @module egl-utils-js/dom
 */

import { HttpError } from './errors.js';
import { controllerFor, isAbortSignal, isElement } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {asserts value is string}
 */
function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

/**
 * @param {unknown} el
 * @param {string} api
 * @returns {asserts el is Element}
 */
function assertElement(el, api) {
  if (!isElement(el)) {
    throw new TypeError(`${api}: target must be an Element`);
  }
}

/** Where injected markup goes relative to the target's existing content. */
const POSITIONS = /** @type {const} */ (['replace', 'beforeend', 'afterbegin']);

/**
 * @typedef {object} InjectFragmentOptions
 * @property {((html: string) => string) | false} sanitize - **Required.** A
 *   sanitizer for the fetched markup — `sanitizeHtml` from
 *   `egl-utils-js/sanitize` fits — or the literal `false` to declare the source
 *   trusted. There is no default: see {@link injectFragment}.
 * @property {'replace' | 'beforeend' | 'afterbegin'} [position='replace'] - Where
 *   the markup lands. `'replace'` overwrites the target's content; the other two
 *   insert around it, leaving existing nodes and their listeners intact.
 * @property {typeof fetch} [fetch] - Fetch implementation; defaults to
 *   `globalThis.fetch`. Injectable for tests, polyfills, and instrumented
 *   transports.
 * @property {AbortSignal} [signal] - Passed straight to `fetch`, so an aborted
 *   request rejects rather than injecting late.
 * @property {HeadersInit} [headers] - Extra request headers.
 */

/**
 * Fetch an HTML fragment and insert it into an element (spec 03 F47).
 *
 * **`sanitize` has no default, on purpose.** A default sanitizer would make this
 * function silently depend on the DOMPurify optional peer; a default of "no
 * sanitizing" would make the dangerous choice the quiet one. So the decision is
 * the caller's and it is recorded at the call site: pass a sanitizer, or pass
 * `false` to state in code that the source is trusted. Omitting it throws.
 *
 * **Errors propagate.** A non-2xx response rejects with `HttpError` carrying the
 * status and the body text; a network failure or abort rejects with whatever
 * `fetch` produced. Nothing is swallowed and no dialog appears — a caller that
 * injects a page shell in several pieces can tell a complete render from a
 * partial one, which is impossible if the failure only reached a `console.error`.
 *
 * `'beforeend'`/`'afterbegin'` use `insertAdjacentHTML`, which parses the markup
 * and appends nodes; `innerHTML +=` would instead re-serialise and re-parse
 * everything already there, destroying existing nodes and every listener bound
 * to them.
 *
 * @example
 * import { sanitizeHtml } from 'egl-utils-js/sanitize';
 * await injectFragment(host, '/partials/menu.html', { sanitize: sanitizeHtml });
 *
 * @example
 * // A trusted, same-origin build artifact — the choice is explicit and greppable:
 * await injectFragment(host, '/dist/shell.html', { sanitize: false });
 *
 * @example
 * // Add to the target instead of replacing it, keeping existing listeners:
 * await injectFragment(list, '/partials/next-page.html', {
 *   sanitize: sanitizeHtml,
 *   position: 'beforeend',
 * });
 *
 * @param {Element} target - Element to inject into.
 * @param {string} url - Fragment URL, passed to `fetch` as given.
 * @param {InjectFragmentOptions} options - Required, because `sanitize` is: a
 *   type-checked consumer cannot omit the decision, and a plain-JS one gets the
 *   `TypeError` below. Both halves of the same rule.
 * @returns {Promise<void>} Resolves once the markup is in the document.
 * @throws {TypeError} If `target` is not an element, `url` is not a non-empty
 *   string, `sanitize` is missing or is neither a function nor `false`, `position`
 *   is not one of the three, `fetch` is not a function, or the sanitizer returns
 *   something other than a string.
 * @throws {HttpError} If the response status is not 2xx; `.status` and `.body`
 *   carry the response status and text.
 */
export async function injectFragment(target, url, options) {
  assertElement(target, 'injectFragment');
  assertNonEmptyString(url, 'url');

  // The parameter is declared required so a type-checked caller must supply the
  // sanitize decision; it is read as partial so an untyped caller who omits it
  // reaches the explicit TypeError rather than a destructuring failure.
  const {
    sanitize,
    position = 'replace',
    fetch: fetchImpl = globalThis.fetch,
    signal,
    headers,
    ...unknown
  } = /** @type {Partial<InjectFragmentOptions>} */ (options ?? {});
  assertNoUnknownOptions(unknown, 'injectFragment');

  if (sanitize === undefined) {
    throw new TypeError(
      'injectFragment: options.sanitize is required — pass a sanitizer (for example ' +
        'sanitizeHtml from egl-utils-js/sanitize), or the literal false to declare the ' +
        'source trusted. There is deliberately no default.',
    );
  }
  if (sanitize !== false && typeof sanitize !== 'function') {
    throw new TypeError('injectFragment: options.sanitize must be a function or false');
  }
  if (!POSITIONS.includes(/** @type {never} */ (position))) {
    throw new TypeError(`injectFragment: options.position must be one of: ${POSITIONS.join(', ')}`);
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('injectFragment: options.fetch must be a function');
  }

  const response = await fetchImpl(url, { signal, headers });
  const raw = await response.text();

  if (!response.ok) {
    // The body is included because a fragment endpoint's error page is usually
    // the only explanation available, and it is already read.
    throw new HttpError(`HTTP ${response.status} for GET ${url}`, {
      status: response.status,
      body: raw,
    });
  }

  const html = sanitize === false ? raw : sanitize(raw);
  if (typeof html !== 'string') {
    throw new TypeError('injectFragment: the sanitizer must return a string');
  }

  if (position === 'replace') {
    target.innerHTML = html;
  } else {
    target.insertAdjacentHTML(position, html);
  }
}

/**
 * @typedef {object} AutoGrowMeasurement
 * @property {number} contentHeight - Height the content needs, in pixels
 *   (`scrollHeight` once the inline height is released).
 * @property {number} lineHeight - One line's height in pixels, used only to turn
 *   `maxRows` into a pixel cap.
 */

/**
 * @typedef {object} AutoGrowOptions
 * @property {number} [maxRows] - Stop growing past this many rows and scroll
 *   instead. Approximate by nature: rows × the computed line height.
 * @property {(textarea: Element) => AutoGrowMeasurement} [measure] - Layout
 *   reader. Defaults to `scrollHeight` plus the computed `line-height`. Inject it
 *   to test the behaviour where layout does not exist — jsdom reports every
 *   height as 0, so without this seam none of this is verifiable off a browser.
 * @property {AbortSignal} [signal] - Detaches the listener when aborted.
 */

/**
 * Keep a textarea's height equal to its content (spec 03 F46).
 *
 * The measurement order is the part that is easy to get wrong: the inline height
 * must be released **before** reading `scrollHeight`, or the value read is the
 * height already set and the field can only ever grow. So each pass clears the
 * inline height, measures, then writes.
 *
 * Detaching restores the inline `height` and `overflow-y` exactly as they were,
 * so attach/detach is symmetric and leaves no residue in the style attribute.
 *
 * @example
 * const detach = autoGrow(elements.comment, { maxRows: 8 });
 * // …later
 * detach();
 *
 * @example
 * // Under jsdom every height is 0, so inject the measurement:
 * autoGrow(area, { measure: () => ({ contentHeight: 64, lineHeight: 16 }) });
 *
 * @param {Element} textarea - The textarea (any element with a `value` and a
 *   `style` works, which is what makes it testable).
 * @param {AutoGrowOptions} [options]
 * @returns {() => void} Idempotent detach, restoring the original inline styles.
 * @throws {TypeError} If `textarea` is not an element, if `maxRows` is not a
 *   positive integer, if `measure` is not a function, or if `signal` is not an
 *   `AbortSignal`.
 */
export function autoGrow(textarea, options = {}) {
  assertElement(textarea, 'autoGrow');
  const { maxRows, measure = defaultMeasure, signal, ...unknown } = options;
  assertNoUnknownOptions(unknown, 'autoGrow');

  if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows < 1)) {
    throw new TypeError('autoGrow: options.maxRows must be a positive integer');
  }
  if (typeof measure !== 'function') {
    throw new TypeError('autoGrow: options.measure must be a function');
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError('autoGrow: options.signal must be an AbortSignal');
  }

  const element = /** @type {Element & { style: any }} */ (textarea);
  const originalHeight = element.style.height;
  const originalOverflow = element.style.overflowY;

  const controller = controllerFor(element);
  let detached = false;
  const detach = () => {
    if (detached) return;
    detached = true;
    controller.abort();
    element.style.height = originalHeight;
    element.style.overflowY = originalOverflow;
  };

  if (signal?.aborted === true) return detach;

  const resize = () => {
    // Release the previous height first: reading scrollHeight while an explicit
    // height is set measures that height, so the field could only ever grow.
    element.style.height = 'auto';
    const { contentHeight, lineHeight } = measure(textarea);
    const cap = maxRows === undefined ? Number.POSITIVE_INFINITY : maxRows * lineHeight;
    const height = Math.min(contentHeight, cap);
    element.style.height = `${height}px`;
    element.style.overflowY = contentHeight > cap ? 'auto' : 'hidden';
  };

  element.addEventListener('input', resize, { signal: controller.signal });
  signal?.addEventListener('abort', detach, { once: true, signal: controller.signal });
  // Fit the initial content, so a prefilled field starts at the right height.
  resize();

  return detach;
}

/**
 * Default layout reader: `scrollHeight` for the content, the computed
 * `line-height` for the row cap.
 *
 * A computed `line-height` of `normal` is not a pixel value, so it falls back to
 * 1.2 × font size — the ratio browsers use for `normal` — and to 0 if even that
 * is unavailable, which simply disables the `maxRows` cap rather than producing a
 * nonsensical one.
 *
 * @param {Element} textarea
 * @returns {AutoGrowMeasurement}
 */
function defaultMeasure(textarea) {
  const style = getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const fontSize = Number.parseFloat(style.fontSize);
  return {
    contentHeight: /** @type {Element & { scrollHeight: number }} */ (textarea).scrollHeight,
    lineHeight: Number.isFinite(lineHeight)
      ? lineHeight
      : Number.isFinite(fontSize)
        ? fontSize * 1.2
        : 0,
  };
}

/**
 * Merge parameters into a URL's query string (spec 03 F48).
 *
 * Written because the obvious one-liner — `` `${url}?${params}` `` — produces a
 * second `?` the moment the URL already has a query string, and the resulting
 * malformed URL usually still "works" against a lenient server, so the bug ships.
 * Building through `URLSearchParams` makes that impossible.
 *
 * Pure and SSR-safe: it never touches `document`, `location`, or the `URL`
 * constructor, so a **relative** URL is handled as readily as an absolute one
 * (`new URL('/a?b=1')` would throw without a base). Any fragment is preserved and
 * stays last, where it belongs.
 *
 * Nullish values are **skipped, not deleted** — the same contract as
 * `urlSearchParams` (F17). To drop a key, build the URL without it.
 *
 * @example
 * withUrlParams('/api/items?page=1', { page: 2, tag: ['x', 'y'] });
 * // '/api/items?page=2&tag=x&tag=y'  — page replaced, arrays repeat the key
 *
 * @example
 * withUrlParams('/docs#section', { v: buildId }); // cache busting, fragment kept
 * // '/docs?v=abc123#section'
 *
 * @param {string} url - Absolute or relative URL, with or without a query string
 *   or fragment.
 * @param {Record<string, unknown>} params - Values to merge. Arrays repeat the
 *   key; nullish values are skipped.
 * @returns {string}
 * @throws {TypeError} If `url` is not a string or `params` is not a plain object.
 */
export function withUrlParams(url, params) {
  if (typeof url !== 'string') {
    throw new TypeError('url must be a string');
  }
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('params must be an object');
  }

  // Split by hand rather than through `URL`, which needs an absolute input.
  const hashAt = url.indexOf('#');
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  const base = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);

  const search = new URLSearchParams(queryAt === -1 ? '' : withoutHash.slice(queryAt + 1));
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      // Replace the key wholesale, then repeat it once per entry — otherwise a
      // merge would append to whatever the URL already carried.
      search.delete(key);
      for (const entry of value) {
        if (entry !== null && entry !== undefined) search.append(key, String(entry));
      }
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return `${base}${query === '' ? '' : `?${query}`}${hash}`;
}
