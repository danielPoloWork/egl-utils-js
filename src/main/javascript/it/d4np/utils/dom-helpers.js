/**
 * egl-utils-js — DOM helpers (spec 03 §2 items F43-F48).
 *
 * Browser-leaning by contract: every export here needs a live document, and
 * says so with a typed {@link DomContractError} rather than degrading. The
 * storage wrappers fall back silently because a degraded store still keeps a
 * value (ADR-0010); a `setVisible` that quietly does nothing has no meaning at
 * all — it would report success while the page stayed unchanged (ADR-0028).
 *
 * The document is resolved **lazily, per call** and never captured at module
 * scope, so importing this entry is side-effect-free and a bundler can shake it
 * (NFR-02); the same property is what lets a module be imported during a server
 * render and only fail when a function is actually called.
 *
 * @module egl-utils-js/dom
 */

import { DomContractError } from './errors.js';

/**
 * The live document, or `null` outside a browser.
 *
 * `globalThis.document` rather than a bare `document`, so the reference is a
 * property read that cannot throw where the global is absent.
 *
 * @returns {Document | null}
 */
function documentOrNull() {
  const candidate = globalThis.document;
  return candidate !== null && typeof candidate === 'object' ? candidate : null;
}

/**
 * Resolve the document, or fail with the contract error naming the caller.
 *
 * @param {string} api - Public function name, for the message.
 * @returns {Document}
 * @throws {DomContractError} When no DOM is present.
 */
export function requireDocument(api) {
  const doc = documentOrNull();
  if (doc === null) {
    throw new DomContractError(
      `${api} requires a DOM: no global document is present. ` +
        'The egl-utils-js/dom entry is browser-only — guard the call, or use ' +
        'egl-utils-js/table for the DOM-free half of the same feature.',
    );
  }
  return doc;
}

/**
 * True when `value` is an `Element` of the realm it belongs to.
 *
 * Structural rather than `instanceof`: a node from an iframe or a jsdom realm
 * fails a cross-realm `instanceof Element` while being a perfectly usable
 * element, the same cross-realm trap the error taxonomy avoids with stable
 * `.code` values (ADR-0003).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isElement(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    /** @type {{ nodeType?: unknown }} */ (value).nodeType === 1 &&
    typeof (/** @type {{ querySelector?: unknown }} */ (value).querySelector) === 'function'
  );
}

/**
 * @typedef {object} BindElementsOptions
 * @property {ParentNode} [root] - Where to search; defaults to the document.
 *   Pass a subtree root to scope a component's lookups.
 * @property {boolean} [strict=false] - Throw {@link DomContractError} when any
 *   selector matches nothing, instead of reporting it.
 */

/**
 * @template {Record<string, string>} T
 * @typedef {object} BoundElements
 * @property {{ [K in keyof T]: Element | null }} elements - One entry per name in
 *   the map; `null` where the selector matched nothing.
 * @property {string[]} missing - Names whose selector matched nothing, in map
 *   order. Empty when every element was found.
 */

/**
 * Resolve a `{name: selector}` map in one pass, reporting what is missing
 * (spec 03 F43).
 *
 * The point is the `missing` array. Binding elements one `querySelector` at a
 * time turns a typo in a selector into a `null` that travels — surfacing much
 * later as "cannot read properties of null", far from its cause. Resolving the
 * whole contract at once makes the startup check a single assertion: log
 * `missing`, or refuse to start with `strict`.
 *
 * The returned `elements` object is a plain snapshot, not a live view: an
 * element removed and re-rendered afterwards is a different node, which is why
 * event delegation (F44) is the right tool for anything that re-renders.
 *
 * @example
 * const { elements, missing } = bindElements({
 *   form: '#checkout-form',
 *   submit: '#checkout-submit',
 *   total: '[data-total]',
 * });
 * if (missing.length > 0) log.warn('markup contract drifted', missing);
 * elements.submit?.addEventListener('click', onSubmit);
 *
 * @example
 * // Fail the boot instead of limping along with half a page:
 * const { elements } = bindElements({ app: '#app' }, { strict: true });
 *
 * @template {Record<string, string>} T
 * @param {T} map - Names to CSS selectors.
 * @param {BindElementsOptions} [options]
 * @returns {BoundElements<T>}
 * @throws {TypeError} If `map` is not a plain object of string values, or if
 *   `root` is neither an element nor a document.
 * @throws {DomContractError} If no DOM is present, or — with `strict: true` — if
 *   any selector matched nothing. The error's `missing` property lists them.
 * @throws {DOMException} If a selector is not valid CSS: `querySelector`'s own
 *   `"SyntaxError"` DOMException propagates unwrapped, because it names the
 *   offending selector better than we could. Note it is a `DOMException` whose
 *   `.name` is `'SyntaxError'` — **not** a JavaScript `SyntaxError`, so match on
 *   `.name` rather than `instanceof` (the same reason the error taxonomy keys on
 *   stable codes, ADR-0003).
 */
export function bindElements(map, options = {}) {
  if (map === null || typeof map !== 'object' || Array.isArray(map)) {
    throw new TypeError('map must be an object of name -> selector');
  }
  const { root, strict = false } = options;

  const scope = root === undefined ? requireDocument('bindElements') : root;
  if (!isElement(scope) && !isDocumentLike(scope)) {
    throw new TypeError('options.root must be an Element or a Document');
  }

  /** @type {Record<string, Element | null>} */
  const elements = {};
  /** @type {string[]} */
  const missing = [];

  for (const [name, selector] of Object.entries(map)) {
    if (typeof selector !== 'string') {
      throw new TypeError(`map.${name} must be a selector string`);
    }
    const found = scope.querySelector(selector);
    elements[name] = found;
    if (found === null) missing.push(name);
  }

  if (strict && missing.length > 0) {
    throw new DomContractError(
      `bindElements: ${missing.length} of ${Object.keys(map).length} selectors matched nothing — ` +
        missing.map((name) => `${name} (${map[name]})`).join(', '),
      { missing },
    );
  }

  return /** @type {BoundElements<T>} */ ({ elements, missing });
}

/**
 * True for a `Document` or `DocumentFragment` — anything that can host a
 * `querySelector` scope without being an element.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isDocumentLike(value) {
  if (typeof value !== 'object' || value === null) return false;
  const nodeType = /** @type {{ nodeType?: unknown }} */ (value).nodeType;
  return (
    (nodeType === 9 || nodeType === 11) &&
    typeof (/** @type {{ querySelector?: unknown }} */ (value).querySelector) === 'function'
  );
}
