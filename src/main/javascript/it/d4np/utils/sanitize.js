/**
 * egl-utils-js/sanitize — allowlist-based HTML sanitization.
 *
 * `sanitizeHtml` **delegates to DOMPurify** (an optional `peerDependency`,
 * reachable only from this subpath) and contributes what a utilities library
 * can honestly own: a **curated default allowlist profile**, a stable typed
 * API, and documented non-goals. Sanitizers are not reimplemented in-house —
 * mXSS is an adversarial, browser-parser-coupled problem with a dedicated
 * research community and one mainstream answer (ADR-003, ADR-0012).
 *
 * Consumers who never sanitize pay zero bytes and zero audit surface: this
 * entry is kept off the root (NFR-06), and DOMPurify is never a `dependencies`
 * entry.
 *
 * Browser-first. In Node the sanitizer needs a real DOM — pass a `jsdom`
 * window via `options.window`. That cost is stated, not implied.
 *
 * Every options bag on this entry **rejects a key it does not know** with a
 * `TypeError` naming it: the destructuring is the schema (ADR-0047).
 *
 * @module egl-utils-js/sanitize
 */

import createDOMPurify from 'dompurify';

import { assertNoUnknownOptions } from './option-keys.js';

/**
 * Curated default tag allowlist (ADR-0012): structural and formatting
 * elements for rich text. Deliberately absent — `form`/`input`/`button`
 * (phishing surface), `style`/`script` (code execution), `iframe`/`object`/
 * `embed` (framing and plugin content), and `svg`/`math` (their own mXSS
 * vector classes). An allowlist excludes everything unnamed **by
 * construction**, so nothing new is admitted as HTML evolves.
 */
const DEFAULT_ALLOWED_TAGS = Object.freeze([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/**
 * Curated default attribute allowlist (ADR-0012). Because this is an
 * allowlist, **every** `on*` event handler and `style` are excluded without
 * being enumerated. Deliberately absent — `id` (DOM clobbering, and
 * duplicate-id collisions with the host page), `target` (reverse tabnabbing),
 * `style` (CSS-based exfiltration; CSS sanitization is a stated non-goal), and
 * `srcset`/`formaction`-style URL carriers that the scheme check does not vet.
 */
const DEFAULT_ALLOWED_ATTR = Object.freeze([
  'alt',
  'class',
  'colspan',
  'dir',
  'height',
  'href',
  'lang',
  'rowspan',
  'scope',
  'src',
  'title',
  'width',
]);

/** URI schemes permitted in `href`/`src` by default (ADR-003). */
const DEFAULT_ALLOWED_URI_SCHEMES = Object.freeze(['http', 'https', 'mailto']);

/**
 * Build the `ALLOWED_URI_REGEXP` DOMPurify uses to vet `href`/`src` values.
 *
 * Mirrors the structure of DOMPurify's own default so **relative** URLs stay
 * usable while absolute ones are restricted to the allowed schemes: match
 * either `scheme:`, or a value starting with a non-letter (`/x`, `./x`,
 * `#frag`, `?q=`), or a run of scheme-ish characters that turns out not to be
 * a scheme at all (`foo/bar`, `page.html`).
 *
 * Schemes are validated against a strict shape first, so a caller-supplied
 * list can never inject regex syntax into this pattern.
 *
 * @param {readonly string[]} schemes
 * @returns {RegExp}
 */
function buildUriRegExp(schemes) {
  const escaped = schemes.map((scheme) => {
    if (typeof scheme !== 'string' || !/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
      throw new TypeError(
        `allowedUriSchemes contains an invalid scheme ${JSON.stringify(scheme)} ` +
          '(expected a name like "https", starting with a letter)',
      );
    }
    return scheme.toLowerCase().replaceAll('.', '\\.').replaceAll('+', '\\+');
  });
  return new RegExp(`^(?:(?:${escaped.join('|')}):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))`, 'i');
}

/**
 * The DOMPurify instance, resolved lazily and memoized per window. Resolution
 * never happens at module load, so importing this module has no side effects
 * (`sideEffects: false`, NFR-02) and the environment may be prepared after the
 * import.
 *
 * @type {{ target: unknown, instance: { sanitize: (html: string, config: object) => string } } | undefined}
 */
let resolved;

/**
 * @param {Window} [explicitWindow]
 * @returns {{ sanitize: (html: string, config: object) => string }}
 */
function resolveSanitizer(explicitWindow) {
  const ambient = /** @type {any} */ (globalThis).window;
  const target = explicitWindow ?? ambient;

  if (resolved !== undefined && resolved.target === target) {
    return resolved.instance;
  }

  /** @type {any} */
  const purify = createDOMPurify;

  // In a browser DOMPurify's default export is already bound to `window` and
  // exposes `sanitize` directly. In Node it is only a factory and needs a DOM
  // to bind to.
  /** @type {any} */
  let instance;
  if (explicitWindow !== undefined) {
    instance = purify(explicitWindow);
  } else if (typeof purify.sanitize === 'function') {
    instance = purify;
  } else if (target !== undefined && target !== null && target.document !== undefined) {
    instance = purify(target);
  } else {
    throw new TypeError(
      'sanitizeHtml requires a DOM: no browser window was found and no `window` ' +
        'option was given. In Node, install jsdom and pass a window — e.g. ' +
        "sanitizeHtml(html, { window: new JSDOM('').window }).",
    );
  }

  if (typeof instance?.sanitize !== 'function') {
    throw new TypeError(
      'sanitizeHtml could not initialize DOMPurify against the given window ' +
        '(no `sanitize` method). Is the `window` option a real DOM window?',
    );
  }

  resolved = { target, instance };
  return instance;
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertStringArray(value, name) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${name} must be an array of strings`);
  }
}

/**
 * @typedef {object} SanitizeOptions
 * @property {readonly string[]} [allowedTags] - **Replace** the default tag
 *   allowlist. Mutually exclusive with `additionalTags` — opting out of the
 *   curated profile and extending it are different intents.
 * @property {readonly string[]} [allowedAttributes] - **Replace** the default
 *   attribute allowlist. Mutually exclusive with `additionalAttributes`.
 * @property {readonly string[]} [additionalTags] - Tags to allow **in addition
 *   to** the curated default profile.
 * @property {readonly string[]} [additionalAttributes] - Attributes to allow in
 *   addition to the curated default profile.
 * @property {readonly string[]} [allowedUriSchemes] - Schemes accepted in
 *   `href`/`src`; default `['http', 'https', 'mailto']`. Relative URLs are
 *   always allowed.
 * @property {boolean} [allowDataAttributes] - Allow `data-*` attributes
 *   (default `false`: an injection surface for frameworks that read them, with
 *   no sanitization benefit).
 * @property {Window} [window] - The DOM to sanitize against. Required in Node
 *   (a `jsdom` window); unnecessary in a browser, where the page's window is
 *   used.
 */

/**
 * Sanitize an untrusted HTML string against a curated allowlist (spec §2 item
 * 24, ADR-003 / ADR-0012).
 *
 * Delegates the parsing and filtering to DOMPurify — including its mXSS and
 * DOM-clobbering defenses — and supplies a **deny-by-default profile**: only
 * the curated tags and attributes survive, so every `on*` handler, `style`,
 * `<script>`, `<iframe>`, `<form>`, and every SVG/MathML vector is removed
 * without being enumerated. `href`/`src` values are restricted to
 * `http:`/`https:`/`mailto:` (relative URLs still work), which is what stops
 * `javascript:` and `data:` URIs.
 *
 * **Non-goals** (documented, not accidental): no CSS sanitization (`style` is
 * simply not allowed), no URL rewriting or link-safety policy (`img src`
 * permits remote loads, so a tracking pixel is possible — a Content Security
 * Policy is the answer, not this function), no protection for values later
 * interpolated into *attribute* positions by a templating layer, and no
 * streaming. Sanitize once, at the trust boundary, and insert the result as
 * HTML.
 *
 * @example
 * // Browser: zero configuration.
 * element.innerHTML = sanitizeHtml(userHtml);
 *
 * @example
 * // Node: an explicit DOM, as documented.
 * import { JSDOM } from 'jsdom';
 * sanitizeHtml(userHtml, { window: new JSDOM('').window });
 *
 * @param {string} html - The untrusted HTML to sanitize.
 * @param {SanitizeOptions} [options]
 * @returns {string} Sanitized HTML, safe to assign to `innerHTML`.
 * @throws {TypeError} If `html` is not a string, an option is invalid, or no
 *   DOM is available (see `options.window`).
 */
export function sanitizeHtml(html, options = {}) {
  if (typeof html !== 'string') {
    throw new TypeError('html must be a string');
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }

  const {
    allowedTags,
    allowedAttributes,
    additionalTags,
    additionalAttributes,
    allowedUriSchemes = DEFAULT_ALLOWED_URI_SCHEMES,
    allowDataAttributes = false,
    window: explicitWindow,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, 'sanitizeHtml');

  if (allowedTags !== undefined && additionalTags !== undefined) {
    throw new TypeError('allowedTags and additionalTags are mutually exclusive');
  }
  if (allowedAttributes !== undefined && additionalAttributes !== undefined) {
    throw new TypeError('allowedAttributes and additionalAttributes are mutually exclusive');
  }
  assertStringArray(allowedTags, 'allowedTags');
  assertStringArray(allowedAttributes, 'allowedAttributes');
  assertStringArray(additionalTags, 'additionalTags');
  assertStringArray(additionalAttributes, 'additionalAttributes');
  if (!Array.isArray(allowedUriSchemes) || allowedUriSchemes.length === 0) {
    throw new TypeError('allowedUriSchemes must be a non-empty array of scheme names');
  }
  if (typeof allowDataAttributes !== 'boolean') {
    throw new TypeError('allowDataAttributes must be a boolean');
  }

  const tags = allowedTags ?? [...DEFAULT_ALLOWED_TAGS, ...(additionalTags ?? [])];
  const attributes = allowedAttributes ?? [
    ...DEFAULT_ALLOWED_ATTR,
    ...(additionalAttributes ?? []),
  ];

  // The URI pattern is built before resolving the DOM so an invalid scheme is
  // reported even in an environment that could not sanitize anyway.
  const uriRegExp = buildUriRegExp(allowedUriSchemes);
  const sanitizer = resolveSanitizer(explicitWindow);

  // NOTE: USE_PROFILES is deliberately NOT used — inside DOMPurify it
  // *overrides* ALLOWED_TAGS, which would silently replace this curated
  // profile with DOMPurify's much broader built-in HTML list.
  return sanitizer.sanitize(html, {
    ALLOWED_TAGS: [...tags],
    ALLOWED_ATTR: [...attributes],
    ALLOWED_URI_REGEXP: uriRegExp,
    ALLOW_DATA_ATTR: allowDataAttributes,
    ALLOW_ARIA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SANITIZE_DOM: true,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    WHOLE_DOCUMENT: false,
    IN_PLACE: false,
  });
}

/**
 * The curated default profile, exposed for inspection and for deriving a
 * stricter or looser one. Frozen: these lists are the library's security
 * promise and must not be mutable by a consumer at a distance.
 */
export const defaultSanitizeProfile = Object.freeze({
  tags: DEFAULT_ALLOWED_TAGS,
  attributes: DEFAULT_ALLOWED_ATTR,
  uriSchemes: DEFAULT_ALLOWED_URI_SCHEMES,
});
