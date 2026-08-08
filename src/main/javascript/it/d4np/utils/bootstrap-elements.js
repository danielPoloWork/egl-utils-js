/**
 * egl-utils-js — Bootstrap 5 element builders (spec 04 §2 items F52-F60).
 *
 * The no-peer half of the toolkit. Bootstrap's *classes* are plain strings, so
 * everything here is ordinary DOM construction and the zero-runtime-dependency
 * promise holds untouched (NFR-06, NFR-18): nothing in this file references the
 * `bootstrap` package, and every builder runs with a document and nothing else.
 * Bootstrap's *behaviours* — Modal, Toast, Collapse — need the optional peer and
 * live in the behaviour file instead.
 *
 * Two contracts govern every export (F52, ADR-0037):
 *
 * 1. **Nodes, not markup.** A builder returns real elements created in a
 *    document, never an HTML string. That is what makes escaping structural: a
 *    template literal has no way to distinguish data from syntax, so the widely
 *    copied `` `<span>${value}</span>` `` shape is one hostile field away from
 *    injection every single time it is written. Here caller data reaches the DOM
 *    only through `textContent` and `setAttribute`, where it cannot be markup.
 * 2. **Markup by decision.** Rich content needs the explicit
 *    `{ html: true, sanitize }` pair — a sanitizer, or the literal `false` to
 *    declare the source trusted. Identical to {@link injectFragment} (F47) and
 *    {@link inlineAlert} (F49), for the identical reason: the dangerous choice
 *    must be the loud one, and a default sanitizer would bind this entry to the
 *    DOMPurify optional peer that F24 deliberately keeps optional.
 *
 * @module egl-utils-js/bootstrap
 */

import { isAbortSignal, isElement, requireDocument } from './dom-helpers.js';

/**
 * @typedef {object} BuilderDocumentOption
 * @property {Document} [document] - Where to create the nodes. Defaults to the
 *   ambient document, and is the reason an atom builder can run inside an iframe,
 *   a popup, or a server-side DOM implementation with no global one (NFR-20).
 */

/**
 * @typedef {string | string[]} ClassOption
 * Extra classes, appended after the Bootstrap ones so a utility class always
 * wins the "last declaration" tie in the stylesheet. A string may hold several
 * space-separated tokens.
 */

/**
 * @typedef {object} ContentOptions
 * @property {boolean} [html=false] - Treat string content as markup instead of
 *   text. Requires `sanitize`.
 * @property {((html: string) => string) | false} [sanitize] - Required with
 *   `{ html: true }`: a sanitizer, or the literal `false` to declare the markup
 *   trusted. There is deliberately no default.
 */

/**
 * @typedef {string | Node} Content
 * Text (escaped on the way in) or a node the caller built for this call.
 */

/**
 * @typedef {object} IconSet
 * @property {string} [tag='i'] - Element to create.
 * @property {string} [classTemplate] - Class list, with `{name}` replaced by the
 *   icon name — the shape of every class-per-icon font.
 * @property {boolean} [ligature=false] - Put the name in the element's text
 *   instead of its class, the shape Material Icons uses.
 * @property {(name: string, doc: Document) => Element} [render] - Full control,
 *   for a set that is neither of the above (an inline SVG sprite, say).
 */

/** Bootstrap Icons: one class per icon name. The default set. */
export const bootstrapIconsSet = /** @type {IconSet} */ (
  Object.freeze({ tag: 'i', classTemplate: 'bi bi-{name}' })
);

/** Material Icons: one class for all, the name carried as a ligature. */
export const materialIconsSet = /** @type {IconSet} */ (
  Object.freeze({ tag: 'span', classTemplate: 'material-icons', ligature: true })
);

/**
 * Resolve the document to build in: the explicit one, else the ambient one.
 *
 * @param {BuilderDocumentOption} options
 * @param {string} api - Public function name, for the contract error.
 * @returns {Document}
 * @throws {TypeError} If `options.document` is present but not a document.
 * @throws {DomContractError} If it is absent and there is no ambient document.
 */
function resolveDocument(options, api) {
  const explicit = options.document;
  if (explicit === undefined) return requireDocument(api);
  if (
    typeof explicit !== 'object' ||
    explicit === null ||
    typeof explicit.createElement !== 'function'
  ) {
    throw new TypeError(`${api}: options.document must be a Document`);
  }
  return explicit;
}

/**
 * Validate a single CSS class token.
 *
 * Whitespace and empty strings make `classList.add` throw a `DOMException`
 * ("InvalidCharacterError") — a platform error naming neither the option nor the
 * caller. Checking first turns a variant typo into the house error for a
 * programmer mistake, which is a `TypeError` with the option's name in it.
 *
 * @param {unknown} value
 * @param {string} name - Option path, for the message.
 * @param {string} api
 * @returns {string}
 * @throws {TypeError} If `value` is not a whitespace-free non-empty string.
 */
function assertToken(value, name, api) {
  if (typeof value !== 'string' || value === '' || /\s/.test(value)) {
    throw new TypeError(`${api}: ${name} must be a non-empty string without whitespace`);
  }
  return value;
}

/**
 * Apply Bootstrap classes then the caller's, each token validated.
 *
 * @param {Element} el
 * @param {Array<string | false | undefined | null>} base - Bootstrap classes;
 *   falsy entries are skipped so a flag reads as `flag && 'class'` at the call site.
 * @param {ClassOption | undefined} extra
 * @param {string} api
 * @returns {void}
 * @throws {TypeError} If `extra` is neither a string nor an array of strings.
 */
function applyClasses(el, base, extra, api) {
  for (const token of base) {
    if (typeof token === 'string' && token !== '') el.classList.add(token);
  }
  for (const token of extraTokens(extra, 'options.class', api)) {
    el.classList.add(token);
  }
}

/**
 * Split a class option into validated tokens.
 *
 * @param {ClassOption | undefined} extra
 * @param {string} name
 * @param {string} api
 * @returns {string[]}
 * @throws {TypeError} If the option is not a string or an array of strings.
 */
function extraTokens(extra, name, api) {
  if (extra === undefined) return [];
  const parts = Array.isArray(extra) ? extra : [extra];
  /** @type {string[]} */
  const tokens = [];
  for (const part of parts) {
    if (typeof part !== 'string') {
      throw new TypeError(`${api}: ${name} must be a string or an array of strings`);
    }
    // A space-separated string is how anyone writes classes, so split rather
    // than reject: 'mt-2 me-1' is one natural value, not a mistake.
    for (const token of part.split(/\s+/)) {
      if (token !== '') tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Write content into `target`: text as text, a node as itself, markup only with
 * the sanitize decision made.
 *
 * A node is appended rather than cloned — the caller built it for this call.
 * (Icons are the opposite case: an icon set is shared across instances, so
 * {@link renderIconInto} clones. The distinction is deliberate.)
 *
 * @param {Element} target
 * @param {Content} content
 * @param {ContentOptions} options
 * @param {string} api
 * @returns {void}
 * @throws {TypeError} If `content` is neither a string nor a node, if `html` is
 *   set without `sanitize`, or if the sanitizer does not return a string.
 */
function renderContent(target, content, options, api) {
  const { html = false, sanitize } = options;

  if (typeof content !== 'string') {
    if (!isNode(content)) {
      throw new TypeError(`${api}: content must be a string or a Node`);
    }
    target.append(content);
    return;
  }

  if (html !== true) {
    target.textContent = content;
    return;
  }
  if (sanitize === undefined) {
    throw new TypeError(
      `${api}: options.sanitize is required with { html: true } — pass a sanitizer ` +
        '(sanitizeHtml from egl-utils-js/sanitize fits) or false. There is no default.',
    );
  }
  if (sanitize !== false && typeof sanitize !== 'function') {
    throw new TypeError(`${api}: options.sanitize must be a function or false`);
  }
  const markup = sanitize === false ? content : sanitize(content);
  if (typeof markup !== 'string') {
    throw new TypeError(`${api}: the sanitizer must return a string`);
  }
  target.innerHTML = markup;
}

/**
 * Structural node check — cross-realm safe, like every type test on the DOM
 * entry (ADR-0003's reasoning applied to a platform type).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isNode(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (/** @type {{ nodeType?: unknown }} */ (value).nodeType) === 'number' &&
    typeof (/** @type {{ cloneNode?: unknown }} */ (value).cloneNode) === 'function'
  );
}

/**
 * A `visually-hidden` span — an accessible name that occupies no space. The
 * mechanism behind every icon-only control that is nonetheless announced.
 *
 * @param {Document} doc
 * @param {string} text
 * @returns {Element}
 */
function visuallyHidden(doc, text) {
  const span = doc.createElement('span');
  span.className = 'visually-hidden';
  span.textContent = text;
  return span;
}

/**
 * @typedef {object} BsIconOptions
 * @property {IconSet} [set=bootstrapIconsSet] - The icon convention to render
 *   through. Pass {@link materialIconsSet}, or any `{classTemplate}` /
 *   `{ligature}` / `{render}` shape.
 * @property {string} [label] - Accessible name. With it the icon is `role="img"`
 *   and announced; without it the icon is `aria-hidden` — decorative, which is
 *   what an icon beside a text label must be, or a screen reader says everything
 *   twice.
 * @property {ClassOption} [class]
 * @property {Document} [document]
 */

/**
 * An icon element from an injected icon set (spec 04 F53).
 *
 * The set is the adapter seam: two shipped presets cover the two conventions
 * every icon font uses — a class per icon ({@link bootstrapIconsSet}) or one
 * class plus a ligature ({@link materialIconsSet}) — and `render` covers
 * anything else. No icon font is bundled, imported, or assumed present; a set is
 * pure data (ADR-0037).
 *
 * @example
 * bsIcon('check-circle');                          // <i class="bi bi-check-circle" aria-hidden="true">
 * bsIcon('delete', { set: materialIconsSet });     // <span class="material-icons">delete</span>
 * bsIcon('trash', { label: 'Delete row' });        // role="img" + aria-label, announced
 *
 * @example
 * // An SVG sprite set — same interface, no library involved:
 * const sprites = {
 *   render: (name, doc) => {
 *     const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
 *     const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
 *     use.setAttribute('href', `#icon-${name}`);
 *     svg.append(use);
 *     return svg;
 *   },
 * };
 * bsIcon('save', { set: sprites });
 *
 * @param {string} name - Icon name, as the set spells it. Validated as a class
 *   token, since that is where it lands for a class-template set.
 * @param {BsIconOptions} [options]
 * @returns {Element}
 * @throws {TypeError} If `name` is not a whitespace-free non-empty string, if
 *   `set` is not an object, if `render` returns something that is not an element,
 *   or if `class`/`document` are of the wrong type.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsIcon(name, options = {}) {
  const api = 'bsIcon';
  assertToken(name, 'name', api);
  assertPlainObject(options, 'options', api);
  const { set = bootstrapIconsSet, label, class: extraClass } = options;
  assertPlainObject(set, 'options.set', api);

  const doc = resolveDocument(options, api);

  /** @type {Element} */
  let el;
  /** @type {string[]} */
  let setClasses = [];
  if (set.render !== undefined) {
    if (typeof set.render !== 'function') {
      throw new TypeError(`${api}: options.set.render must be a function`);
    }
    el = set.render(name, doc);
    if (!isElement(el)) {
      throw new TypeError(`${api}: options.set.render must return an Element`);
    }
  } else {
    el = doc.createElement(set.tag ?? 'i');
    if (set.classTemplate !== undefined) {
      if (typeof set.classTemplate !== 'string') {
        throw new TypeError(`${api}: options.set.classTemplate must be a string`);
      }
      // The template is the caller's, so it goes through the same tokeniser as
      // any other caller-supplied class rather than being trusted like our own
      // literals.
      setClasses = extraTokens(
        set.classTemplate.replace('{name}', name),
        'options.set.classTemplate',
        api,
      );
    }
    if (set.ligature === true) el.textContent = name;
  }

  applyClasses(el, setClasses, extraClass, api);

  if (label === undefined) {
    el.setAttribute('aria-hidden', 'true');
  } else {
    if (typeof label !== 'string') {
      throw new TypeError(`${api}: options.label must be a string`);
    }
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
  }
  return el;
}

/**
 * Render an icon specification into a parent: a name for the set to draw, or a
 * node to use.
 *
 * A supplied node is **cloned**, because an icon usually comes from a map shared
 * by many builders — appending it directly would move it out of the previous
 * button, so the second render would silently steal the first one's icon (F49's
 * lesson, same fix).
 *
 * @param {Element} parent
 * @param {IconSpec} icon
 * @param {IconSet | undefined} defaultSet
 * @param {Document} doc
 * @param {string} api
 * @returns {void}
 * @throws {TypeError} If the specification is not a name, a node, or an options object.
 */
function renderIconInto(parent, icon, defaultSet, doc, api) {
  if (typeof icon === 'string') {
    parent.append(bsIcon(icon, { set: defaultSet, document: doc }));
    return;
  }
  if (isNode(icon)) {
    parent.append(/** @type {Node} */ (icon).cloneNode(true));
    return;
  }
  const spec =
    /** @type {{ name?: unknown, set?: IconSet, label?: string, class?: ClassOption }} */ (icon);
  if (typeof spec !== 'object' || spec === null || typeof spec.name !== 'string') {
    throw new TypeError(
      `${api}: options.icon must be an icon name, a Node, or { name, set?, label? }`,
    );
  }
  const { name, ...rest } = spec;
  parent.append(bsIcon(name, { set: defaultSet, ...rest, document: doc }));
}

/**
 * @typedef {string | Node | { name: string, set?: IconSet, label?: string, class?: ClassOption }} IconSpec
 * An icon: a name for the ambient set to render, a node used as-is (cloned), or
 * full {@link bsIcon} options.
 */

/**
 * @typedef {object} BsBadgeOptions
 * @property {string} [variant='secondary'] - Bootstrap theme colour, rendered as
 *   `text-bg-<variant>`. Not validated against a fixed list: a custom
 *   `$theme-colors` entry is a legitimate variant and the library has no way to
 *   know the project's palette.
 * @property {boolean} [pill=false] - `rounded-pill`.
 * @property {boolean | string} [positioned=false] - Render the corner-positioned
 *   form (`position-absolute top-0 start-100 translate-middle`). A string is the
 *   visually-hidden text that says what the number means — "99+" alone announces
 *   a number with no noun.
 * @property {ClassOption} [class]
 * @property {Document} [document]
 * @property {boolean} [html]
 * @property {((html: string) => string) | false} [sanitize]
 */

/**
 * A Bootstrap badge (spec 04 F54).
 *
 * @example
 * bsBadge('New');                                    // <span class="badge text-bg-secondary">New</span>
 * bsBadge('99+', { variant: 'danger', pill: true });
 *
 * @example
 * // A counter pinned to a button's corner, with the noun a screen reader needs:
 * const button = bsButton({ label: 'Inbox', class: 'position-relative' });
 * button.append(bsBadge('99+', { variant: 'danger', pill: true, positioned: 'unread messages' }));
 *
 * @param {Content} content - Badge text (escaped) or a node.
 * @param {BsBadgeOptions} [options]
 * @returns {Element}
 * @throws {TypeError} On a malformed option, or on `{ html: true }` without `sanitize`.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsBadge(content, options = {}) {
  const api = 'bsBadge';
  assertPlainObject(options, 'options', api);
  const { variant = 'secondary', pill = false, positioned = false } = options;
  assertToken(variant, 'options.variant', api);

  const doc = resolveDocument(options, api);
  const el = doc.createElement('span');
  applyClasses(
    el,
    [
      'badge',
      `text-bg-${variant}`,
      (pill === true || typeof positioned === 'string' || positioned === true) && 'rounded-pill',
      positioned !== false && 'position-absolute',
      positioned !== false && 'top-0',
      positioned !== false && 'start-100',
      positioned !== false && 'translate-middle',
    ],
    options.class,
    api,
  );

  renderContent(el, content, options, api);
  if (typeof positioned === 'string') el.append(visuallyHidden(doc, positioned));
  return el;
}

/**
 * @typedef {object} BsButtonOptions
 * @property {Content} [label] - Visible text (escaped) or a node.
 * @property {string} [variant='primary'] - Theme colour.
 * @property {boolean} [outline=false] - `btn-outline-<variant>`.
 * @property {'sm' | 'lg' | string} [size] - `btn-<size>`.
 * @property {'button' | 'submit' | 'reset'} [type='button'] - Defaults to
 *   `button`, not the platform's `submit`: a button inside a form that posts it
 *   by accident is one of the most common and most confusing UI bugs.
 * @property {IconSpec} [icon] - Icon placed before the label, or instead of it.
 * @property {IconSet} [iconSet] - Set for a name-shaped `icon`.
 * @property {boolean} [labelHidden=false] - Render `label` visually-hidden, so
 *   an icon-only button still has an accessible name.
 * @property {string} [ariaLabel] - Accessible name, when there is no label to
 *   hide.
 * @property {boolean} [disabled=false]
 * @property {(event: Event) => void} [onClick] - Click handler, attached with
 *   `signal` teardown.
 * @property {AbortSignal} [signal] - Detaches `onClick` when aborted (NFR-15).
 * @property {ClassOption} [class]
 * @property {Document} [document]
 * @property {boolean} [html]
 * @property {((html: string) => string) | false} [sanitize]
 */

/**
 * A Bootstrap button (spec 04 F55).
 *
 * **An icon-only button must have an accessible name**, and asking for one
 * without one is a `TypeError` rather than a warning (NFR-21). A glyph is not a
 * label: an icon-only control with no name is announced as "button", which is
 * indistinguishable from every other unnamed button on the page. Since the fix
 * is one option, the toolkit refuses to build the broken thing — a warning in a
 * console nobody reads would ship it.
 *
 * @example
 * bsButton({ label: 'Save', onClick: () => form.submit() });
 * bsButton({ label: 'Cancel', variant: 'secondary', outline: true });
 * bsButton({ label: 'Add item', icon: 'plus-lg', size: 'sm' });
 *
 * @example
 * // Icon-only: the label is still there, just not visible.
 * bsButton({ icon: 'trash', label: 'Delete row', labelHidden: true, variant: 'danger' });
 * bsButton({ icon: 'x-lg', ariaLabel: 'Dismiss' }); // or name it directly
 *
 * @example
 * // Teardown rides one signal, like every other listener in the library:
 * const controller = new AbortController();
 * bsButton({ label: 'Refresh', onClick: reload, signal: controller.signal });
 * controller.abort(); // handler detached
 *
 * @param {BsButtonOptions} [options]
 * @returns {Element}
 * @throws {TypeError} On a malformed option, on `{ html: true }` without
 *   `sanitize`, or when neither a visible label, a hidden label, nor `ariaLabel`
 *   gives the button an accessible name.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsButton(options = {}) {
  const api = 'bsButton';
  assertPlainObject(options, 'options', api);
  const {
    label,
    variant = 'primary',
    outline = false,
    size,
    type = 'button',
    icon,
    iconSet,
    labelHidden = false,
    ariaLabel,
    disabled = false,
    onClick,
    signal,
  } = options;

  assertToken(variant, 'options.variant', api);
  if (size !== undefined) assertToken(size, 'options.size', api);
  if (!['button', 'submit', 'reset'].includes(type)) {
    throw new TypeError(`${api}: options.type must be 'button', 'submit' or 'reset'`);
  }
  if (ariaLabel !== undefined && typeof ariaLabel !== 'string') {
    throw new TypeError(`${api}: options.ariaLabel must be a string`);
  }
  if (onClick !== undefined && typeof onClick !== 'function') {
    throw new TypeError(`${api}: options.onClick must be a function`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  // The a11y contract, checked before anything is built: a control the user can
  // see but a screen reader cannot name is not a thing this toolkit produces.
  const hasVisibleLabel = label !== undefined && labelHidden !== true;
  const hasAccessibleName = label !== undefined || ariaLabel !== undefined;
  if (!hasAccessibleName) {
    throw new TypeError(
      `${api}: a button needs an accessible name — pass options.label, ` +
        'or options.ariaLabel for an icon-only button. A glyph is not a label.',
    );
  }

  const doc = resolveDocument(options, api);
  const el = doc.createElement('button');
  el.setAttribute('type', type);
  applyClasses(
    el,
    [
      'btn',
      `btn-${outline === true ? 'outline-' : ''}${variant}`,
      size !== undefined && `btn-${size}`,
    ],
    options.class,
    api,
  );
  if (disabled === true) el.setAttribute('disabled', '');
  if (ariaLabel !== undefined) el.setAttribute('aria-label', ariaLabel);

  if (icon !== undefined) renderIconInto(el, icon, iconSet, doc, api);

  if (label !== undefined) {
    if (!hasVisibleLabel) {
      if (typeof label !== 'string') {
        throw new TypeError(`${api}: options.label must be a string when labelHidden is set`);
      }
      el.append(visuallyHidden(doc, label));
    } else if (icon === undefined) {
      // No icon: the label is the button's only content, so it goes straight in
      // — `<button class="btn">Save</button>`, the markup everyone expects.
      renderContent(el, label, options, api);
    } else {
      // With an icon, the label needs its own box for a `gap` utility to act on.
      const slot = doc.createElement('span');
      renderContent(slot, label, options, api);
      el.append(slot);
    }
  }

  if (onClick !== undefined) {
    el.addEventListener('click', onClick, signal === undefined ? undefined : { signal });
  }
  return el;
}

/**
 * @typedef {object} BsButtonGroupOptions
 * @property {string} label - Accessible name for the group. **Required**: a
 *   `role="group"` with no name is an unlabelled landmark, which is worse for a
 *   screen reader than no grouping at all (NFR-21).
 * @property {'sm' | 'lg' | string} [size] - `btn-group-<size>`.
 * @property {boolean} [vertical=false] - `btn-group-vertical`.
 * @property {ClassOption} [class]
 * @property {Document} [document]
 */

/**
 * A Bootstrap button group (spec 04 F56).
 *
 * Children are appended through one `DocumentFragment`, so a group of ten
 * buttons costs the layout engine one insertion rather than ten (F52).
 *
 * @example
 * bsButtonGroup(
 *   [bsButton({ label: 'Left' }), bsButton({ label: 'Right' })],
 *   { label: 'Alignment' },
 * );
 *
 * @param {Element[]} buttons - Built buttons, or any existing elements.
 * @param {BsButtonGroupOptions} options
 * @returns {Element}
 * @throws {TypeError} If `buttons` is not a non-empty array of elements, or if
 *   `label` is missing.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsButtonGroup(buttons, options) {
  const api = 'bsButtonGroup';
  assertPlainObject(options, 'options', api);
  const { label, size, vertical = false } = options;

  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new TypeError(`${api}: buttons must be a non-empty array of Elements`);
  }
  for (const [index, button] of buttons.entries()) {
    if (!isElement(button)) {
      throw new TypeError(`${api}: buttons[${index}] must be an Element`);
    }
  }
  if (typeof label !== 'string' || label === '') {
    throw new TypeError(
      `${api}: options.label is required — a role="group" without an accessible name ` +
        'is announced as an unnamed group.',
    );
  }
  if (size !== undefined) assertToken(size, 'options.size', api);

  const doc = resolveDocument(options, api);
  const el = doc.createElement('div');
  applyClasses(
    el,
    [
      vertical === true ? 'btn-group-vertical' : 'btn-group',
      size !== undefined && `btn-group-${size}`,
    ],
    options.class,
    api,
  );
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', label);

  const fragment = doc.createDocumentFragment();
  for (const button of buttons) fragment.append(button);
  el.append(fragment);
  return el;
}

/**
 * @typedef {object} BsCloseButtonOptions
 * @property {string} [label='Close'] - Accessible name. Defaulted rather than
 *   required, because a close button's purpose is unambiguous — but injectable,
 *   because "Close" is an English string (NFR-21).
 * @property {boolean} [disabled=false]
 * @property {boolean} [white=false] - `btn-close-white`, for dark backgrounds.
 * @property {(event: Event) => void} [onClick]
 * @property {AbortSignal} [signal]
 * @property {ClassOption} [class]
 * @property {Document} [document]
 */

/**
 * A Bootstrap close button (spec 04 F57).
 *
 * @example
 * bsCloseButton({ onClick: () => toast.hide(), label: 'Chiudi' });
 *
 * @param {BsCloseButtonOptions} [options]
 * @returns {Element}
 * @throws {TypeError} On a malformed option.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsCloseButton(options = {}) {
  const api = 'bsCloseButton';
  assertPlainObject(options, 'options', api);
  const { label = 'Close', disabled = false, white = false, onClick, signal } = options;

  if (typeof label !== 'string' || label === '') {
    throw new TypeError(`${api}: options.label must be a non-empty string`);
  }
  if (onClick !== undefined && typeof onClick !== 'function') {
    throw new TypeError(`${api}: options.onClick must be a function`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const doc = resolveDocument(options, api);
  const el = doc.createElement('button');
  el.setAttribute('type', 'button');
  applyClasses(el, ['btn-close', white === true && 'btn-close-white'], options.class, api);
  el.setAttribute('aria-label', label);
  if (disabled === true) el.setAttribute('disabled', '');
  if (onClick !== undefined) {
    el.addEventListener('click', onClick, signal === undefined ? undefined : { signal });
  }
  return el;
}

/**
 * @typedef {object} BsSpinnerOptions
 * @property {'border' | 'grow'} [kind='border']
 * @property {'sm' | string} [size] - `spinner-<kind>-<size>`.
 * @property {string} [variant] - Theme colour, as `text-<variant>`.
 * @property {string} [label='Loading…'] - Visually-hidden status text.
 * @property {ClassOption} [class]
 * @property {Document} [document]
 */

/**
 * A Bootstrap spinner with its status text (spec 04 F58).
 *
 * `role="status"` plus a visually-hidden label is the whole point: a spinning
 * div announces nothing, so a screen-reader user gets no indication that
 * anything is happening.
 *
 * @example
 * bsSpinner();                                            // border, "Loading…"
 * bsSpinner({ kind: 'grow', size: 'sm', variant: 'primary', label: 'Caricamento…' });
 *
 * @param {BsSpinnerOptions} [options]
 * @returns {Element}
 * @throws {TypeError} On a malformed option.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsSpinner(options = {}) {
  const api = 'bsSpinner';
  assertPlainObject(options, 'options', api);
  const { kind = 'border', size, variant, label = 'Loading…' } = options;

  if (kind !== 'border' && kind !== 'grow') {
    throw new TypeError(`${api}: options.kind must be 'border' or 'grow'`);
  }
  if (size !== undefined) assertToken(size, 'options.size', api);
  if (variant !== undefined) assertToken(variant, 'options.variant', api);
  if (typeof label !== 'string') {
    throw new TypeError(`${api}: options.label must be a string`);
  }

  const doc = resolveDocument(options, api);
  const el = doc.createElement('div');
  applyClasses(
    el,
    [
      `spinner-${kind}`,
      size !== undefined && `spinner-${kind}-${size}`,
      variant !== undefined && `text-${variant}`,
    ],
    options.class,
    api,
  );
  el.setAttribute('role', 'status');
  if (label !== '') el.append(visuallyHidden(doc, label));
  return el;
}

/**
 * @typedef {object} BsProgressOptions
 * @property {number} [value=0] - Current value, clamped into `[min, max]`.
 * @property {number} [min=0]
 * @property {number} [max=100]
 * @property {string} [variant] - Theme colour of the bar, as `bg-<variant>`.
 * @property {boolean} [striped=false]
 * @property {boolean} [animated=false] - Implies striped, as Bootstrap requires.
 * @property {string} [label] - Accessible name for the bar.
 * @property {((value: number, range: { min: number, max: number }) => string) | false} [format=false]
 *   Visible text inside the bar, recomputed on every `update`. `false` shows
 *   none, which is Bootstrap's own default. A function rather than a boolean
 *   because "25%" is a human-readable string and this library does not ship
 *   those (NFR-21) — `(v) => \`${v}%\`` is the caller's one-line policy.
 * @property {string} [height] - CSS height for the track, e.g. `'4px'`.
 * @property {ClassOption} [class]
 * @property {Document} [document]
 */

/**
 * @typedef {object} BsProgressInstance
 * @property {Element} element - The track. Append this.
 * @property {(value: number) => void} update - Move the bar; re-runs `format`.
 * @property {() => void} destroy - Remove the element.
 */

/**
 * A Bootstrap progress bar (spec 04 F59).
 *
 * Returns an instance rather than an element because a progress bar exists to
 * change: `update(value)` keeps the width, the `aria-valuenow`, and the visible
 * text in one place, so the three cannot drift apart — which they do the moment
 * a caller sets the width by hand and forgets the ARIA value.
 *
 * @example
 * const progress = bsProgress({ max: totalBytes, label: 'Upload', format: (v, { max }) =>
 *   `${Math.round((v / max) * 100)}%` });
 * container.append(progress.element);
 * onChunk((sent) => progress.update(sent));
 *
 * @param {BsProgressOptions} [options]
 * @returns {BsProgressInstance}
 * @throws {TypeError} On a malformed option, or if `min`/`max` are not a finite
 *   ascending pair.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsProgress(options = {}) {
  const api = 'bsProgress';
  assertPlainObject(options, 'options', api);
  const {
    value = 0,
    min = 0,
    max = 100,
    variant,
    striped = false,
    animated = false,
    label,
    format = false,
    height,
  } = options;

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError(`${api}: options.value must be a number`);
  }
  if (typeof min !== 'number' || !Number.isFinite(min)) {
    throw new TypeError(`${api}: options.min must be a finite number`);
  }
  if (typeof max !== 'number' || !Number.isFinite(max)) {
    throw new TypeError(`${api}: options.max must be a finite number`);
  }
  if (!(min < max)) {
    throw new TypeError(`${api}: options.min must be less than options.max`);
  }
  if (variant !== undefined) assertToken(variant, 'options.variant', api);
  if (label !== undefined && typeof label !== 'string') {
    throw new TypeError(`${api}: options.label must be a string`);
  }
  if (format !== false && typeof format !== 'function') {
    throw new TypeError(`${api}: options.format must be a function or false`);
  }
  if (height !== undefined && typeof height !== 'string') {
    throw new TypeError(`${api}: options.height must be a CSS length string`);
  }

  const doc = resolveDocument(options, api);
  const track = doc.createElement('div');
  applyClasses(track, ['progress'], options.class, api);
  // Bootstrap 5.3 moved role and the aria-value triple to the track; the bar is
  // presentational, which is why the width lives there and the semantics here.
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', String(min));
  track.setAttribute('aria-valuemax', String(max));
  if (label !== undefined) track.setAttribute('aria-label', label);
  if (height !== undefined) {
    /** @type {{ style: CSSStyleDeclaration }} */ (track).style.height = height;
  }

  const bar = doc.createElement('div');
  applyClasses(
    bar,
    [
      'progress-bar',
      variant !== undefined && `bg-${variant}`,
      (striped === true || animated === true) && 'progress-bar-striped',
      animated === true && 'progress-bar-animated',
    ],
    undefined,
    api,
  );
  track.append(bar);

  /** @param {number} next */
  const update = (next) => {
    if (typeof next !== 'number' || Number.isNaN(next)) {
      throw new TypeError(`${api}: update(value) requires a number`);
    }
    const clamped = Math.min(max, Math.max(min, next));
    track.setAttribute('aria-valuenow', String(clamped));
    const ratio = (clamped - min) / (max - min);
    /** @type {{ style: CSSStyleDeclaration }} */ (bar).style.width = `${ratio * 100}%`;
    // Text, never markup: a format function is caller code, but its *output* is
    // data and is written as data (NFR-19).
    bar.textContent = format === false ? '' : String(format(clamped, { min, max }));
  };

  update(value);

  return { element: track, update, destroy: () => track.remove() };
}

/**
 * Widths for placeholder lines, cycled when the caller supplies none. Arbitrary
 * but **stable**: a skeleton that reshuffled on every render would draw the eye
 * to the loading state instead of away from it.
 */
const DEFAULT_PLACEHOLDER_WIDTHS = /** @type {const} */ ([12, 10, 11, 8]);

/**
 * @typedef {object} BsPlaceholderOptions
 * @property {number} [lines=1] - How many placeholder lines to draw.
 * @property {'xs' | 'sm' | 'lg' | string} [size] - `placeholder-<size>`.
 * @property {'glow' | 'wave' | false} [animation='glow']
 * @property {Array<number | string>} [widths] - Per-line width: a number 1-12
 *   renders Bootstrap's `col-<n>`, a string is used as a CSS width. Shorter than
 *   `lines` cycles.
 * @property {ClassOption} [class]
 * @property {Document} [document]
 */

/**
 * A Bootstrap placeholder / skeleton block (spec 04 F60).
 *
 * The whole block is `aria-hidden`: a skeleton is a picture of content that does
 * not exist yet, so announcing it means announcing nothing, repeatedly. The
 * loading *state* is a job for a live region or {@link bsSpinner}.
 *
 * @example
 * const skeleton = bsPlaceholder({ lines: 3 });
 * card.append(skeleton);
 * const rows = await load();
 * skeleton.remove();
 *
 * @param {BsPlaceholderOptions} [options]
 * @returns {Element}
 * @throws {TypeError} On a malformed option.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsPlaceholder(options = {}) {
  const api = 'bsPlaceholder';
  assertPlainObject(options, 'options', api);
  const { lines = 1, size, animation = 'glow', widths } = options;

  if (!Number.isInteger(lines) || lines < 1) {
    throw new TypeError(`${api}: options.lines must be a positive integer`);
  }
  if (size !== undefined) assertToken(size, 'options.size', api);
  if (animation !== false && animation !== 'glow' && animation !== 'wave') {
    throw new TypeError(`${api}: options.animation must be 'glow', 'wave' or false`);
  }
  if (widths !== undefined && (!Array.isArray(widths) || widths.length === 0)) {
    throw new TypeError(`${api}: options.widths must be a non-empty array`);
  }

  const doc = resolveDocument(options, api);
  const el = doc.createElement('p');
  applyClasses(el, [animation !== false && `placeholder-${animation}`], options.class, api);
  el.setAttribute('aria-hidden', 'true');

  const cycle = widths ?? DEFAULT_PLACEHOLDER_WIDTHS;
  const fragment = doc.createDocumentFragment();
  for (let index = 0; index < lines; index += 1) {
    const line = doc.createElement('span');
    const width = cycle[index % cycle.length];
    applyClasses(
      line,
      ['placeholder', size !== undefined && `placeholder-${size}`],
      undefined,
      api,
    );
    if (typeof width === 'number') {
      if (!Number.isInteger(width) || width < 1 || width > 12) {
        throw new TypeError(`${api}: a numeric width must be an integer from 1 to 12`);
      }
      line.classList.add(`col-${width}`);
    } else if (typeof width === 'string') {
      /** @type {{ style: CSSStyleDeclaration }} */ (line).style.width = width;
    } else {
      throw new TypeError(`${api}: options.widths entries must be numbers or CSS length strings`);
    }
    fragment.append(line);
  }
  el.append(fragment);
  return el;
}

/**
 * @param {unknown} value
 * @param {string} name
 * @param {string} api
 * @returns {void}
 * @throws {TypeError} If `value` is not a plain object.
 */
function assertPlainObject(value, name, api) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${api}: ${name} must be an object`);
  }
}
