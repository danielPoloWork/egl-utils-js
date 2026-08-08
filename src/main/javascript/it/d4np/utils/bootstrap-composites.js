/**
 * egl-utils-js — Bootstrap 5 composite builders (spec 04 §2 items F61-F65).
 *
 * The second half of the no-peer surface: components assembled from several
 * elements, or from a mechanism the earlier waves already own. Both kinds share
 * the F52 contract with the atoms — nodes over strings, escaping by
 * construction, injected policy, owned teardown — so this file adds structure
 * and Bootstrap's class vocabulary, never a second way of doing any of it
 * (ADR-0037, ADR-0038).
 *
 * Split from `bootstrap-elements.js` for the reason `/dom` split into five
 * files behind one barrel: the entry stays single, the files stay readable. The
 * shared builder internals are imported from the sibling rather than copied,
 * which is what keeps the contract literally one implementation.
 *
 * Two of the five are **compositions rather than components**: {@link bsAlert}
 * is the F49 alert engine in Bootstrap's costume, and {@link bsPagination}
 * speaks the `view()` shape F42 already returns. Neither reimplements the
 * behaviour it presents — a fix to the engine reaches both entries at once.
 *
 * @module egl-utils-js/bootstrap
 */

import { isAbortSignal, isElement } from './dom-helpers.js';
import { inlineAlert } from './dom-components.js';
import {
  appendContent,
  applyClasses,
  assertPlainObject,
  assertToken,
  bsBadge,
  closestWithin,
  isNode,
  renderContent,
  resolveDocument,
} from './bootstrap-elements.js';

/**
 * @typedef {import('./bootstrap-elements.js').Content} Content
 * @typedef {import('./bootstrap-elements.js').ClassOption} ClassOption
 * @typedef {import('./bootstrap-elements.js').ContentOptions} ContentOptions
 */

/**
 * @typedef {object} BsCardImage
 * @property {string} src
 * @property {string} alt - **Required**, and `''` is a legitimate value: it
 *   declares the image decorative. What is not acceptable is silence, because a
 *   missing `alt` makes a screen reader read the file name aloud.
 * @property {'top' | 'bottom'} [position='top']
 * @property {ClassOption} [class]
 */

/**
 * @typedef {object} BsCardOptions
 * @property {Content} [header] - `card-header` content.
 * @property {Content} [title] - `card-title`, inside the body.
 * @property {Content} [subtitle] - `card-subtitle`, under the title.
 * @property {Content} [text] - A `card-text` paragraph.
 * @property {Content} [body] - Free body content, after title/subtitle/text.
 * @property {Content} [footer] - `card-footer` content.
 * @property {Content} [actions] - Rendered into the footer after `footer`;
 *   supplying it without a footer creates one.
 * @property {BsCardImage} [image]
 * @property {Element} [listGroup] - A flush list group between body and footer,
 *   typically a {@link bsListGroup} element.
 * @property {string} [titleTag='h5'] - Heading level for the title, so a card
 *   inside a section can keep the document outline correct.
 * @property {ClassOption} [class]
 * @property {Document} [document]
 * @property {boolean} [html]
 * @property {((html: string) => string) | false} [sanitize]
 */

/**
 * A Bootstrap card (spec 04 F61).
 *
 * A composer, not a template: every slot is optional and only what is supplied
 * gets rendered, so one function produces both a bare content card and a full
 * image/header/body/list/footer stack. The `card-body` wrapper appears only when
 * something needs to go in it — an empty one is visible padding that reads as a
 * rendering bug.
 *
 * @example
 * container.append(bsCard({ title: 'Total', text: '€ 12.480' }));
 *
 * @example
 * bsCard({
 *   image: { src: '/cover.jpg', alt: '' },   // decorative — declared, not omitted
 *   header: `Order #${order.id}`,
 *   title: order.customer,
 *   text: [order.summary, bsBadge(order.status, { variant: 'success' })],
 *   actions: bsButton({ label: 'Open', size: 'sm' }),
 * });
 *
 * @param {BsCardOptions} [options]
 * @returns {Element}
 * @throws {TypeError} On a malformed option, on an image without a string `alt`,
 *   or on `{ html: true }` without `sanitize`.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsCard(options = {}) {
  const api = 'bsCard';
  assertPlainObject(options, 'options', api);
  const {
    header,
    title,
    subtitle,
    text,
    body,
    footer,
    actions,
    image,
    listGroup,
    titleTag = 'h5',
  } = options;

  assertToken(titleTag, 'options.titleTag', api);
  if (listGroup !== undefined && !isElement(listGroup)) {
    throw new TypeError(`${api}: options.listGroup must be an Element`);
  }

  const doc = resolveDocument(options, api);
  const el = doc.createElement('div');
  applyClasses(el, ['card'], options.class, api);

  const fragment = doc.createDocumentFragment();
  const imageEl = image === undefined ? undefined : buildCardImage(image, doc, api);
  if (imageEl !== undefined && image?.position !== 'bottom') fragment.append(imageEl);

  if (header !== undefined) {
    fragment.append(slot(doc, 'div', ['card-header'], header, options, api));
  }

  if (title !== undefined || subtitle !== undefined || text !== undefined || body !== undefined) {
    const bodyEl = doc.createElement('div');
    applyClasses(bodyEl, ['card-body'], undefined, api);
    if (title !== undefined) {
      bodyEl.append(slot(doc, titleTag, ['card-title'], title, options, api));
    }
    if (subtitle !== undefined) {
      const classes = ['card-subtitle', 'mb-2', 'text-body-secondary'];
      bodyEl.append(slot(doc, 'h6', classes, subtitle, options, api));
    }
    if (text !== undefined) {
      bodyEl.append(slot(doc, 'p', ['card-text'], text, options, api));
    }
    if (body !== undefined) appendContent(bodyEl, body, options, api);
    fragment.append(bodyEl);
  }

  if (listGroup !== undefined) fragment.append(listGroup);

  if (footer !== undefined || actions !== undefined) {
    const footerEl = doc.createElement('div');
    applyClasses(footerEl, ['card-footer'], undefined, api);
    if (footer !== undefined) appendContent(footerEl, footer, options, api);
    if (actions !== undefined) appendContent(footerEl, actions, options, api);
    fragment.append(footerEl);
  }

  if (imageEl !== undefined && image?.position === 'bottom') fragment.append(imageEl);

  el.append(fragment);
  return el;
}

/**
 * One card slot: an element of `tag`, classed and filled.
 *
 * @param {Document} doc
 * @param {string} tag
 * @param {string[]} classes
 * @param {Content} content
 * @param {ContentOptions} options
 * @param {string} api
 * @returns {Element}
 */
function slot(doc, tag, classes, content, options, api) {
  const el = doc.createElement(tag);
  applyClasses(el, classes, undefined, api);
  renderContent(el, content, options, api);
  return el;
}

/**
 * @param {BsCardImage} image
 * @param {Document} doc
 * @param {string} api
 * @returns {Element}
 * @throws {TypeError} If `src` is not a non-empty string or `alt` is missing.
 */
function buildCardImage(image, doc, api) {
  assertPlainObject(image, 'options.image', api);
  if (typeof image.src !== 'string' || image.src === '') {
    throw new TypeError(`${api}: options.image.src must be a non-empty string`);
  }
  if (typeof image.alt !== 'string') {
    throw new TypeError(
      `${api}: options.image.alt is required — pass '' to declare the image decorative. ` +
        'Omitting it makes a screen reader fall back to reading the file name.',
    );
  }
  const el = doc.createElement('img');
  el.setAttribute('src', image.src);
  el.setAttribute('alt', image.alt);
  applyClasses(
    el,
    [image.position === 'bottom' ? 'card-img-bottom' : 'card-img-top'],
    image.class,
    api,
  );
  return el;
}

/**
 * @typedef {object} BsListGroupItem
 * @property {Content} content
 * @property {string} [variant] - `list-group-item-<variant>`.
 * @property {boolean} [active=false]
 * @property {boolean} [disabled=false]
 * @property {string} [href] - Renders the item as a link.
 * @property {string | number | { content: Content, variant?: string, pill?: boolean }} [badge]
 *   A trailing badge; the item gains the flex classes Bootstrap's example uses.
 * @property {unknown} [value] - Opaque payload handed back to `onSelect`, so a
 *   caller never has to map an index back to its record.
 */

/**
 * @typedef {object} BsListGroupOptions
 * @property {boolean} [flush=false] - `list-group-flush`, for a list inside a card.
 * @property {boolean} [numbered=false] - `list-group-numbered` on an `<ol>`.
 * @property {boolean | string} [horizontal=false] - `list-group-horizontal[-<breakpoint>]`.
 * @property {(item: BsListGroupItem, index: number, event: Event) => void} [onSelect]
 *   Makes items actionable, through **one** delegated listener.
 * @property {AbortSignal} [signal]
 * @property {ClassOption} [class]
 * @property {Document} [document]
 * @property {boolean} [html]
 * @property {((html: string) => string) | false} [sanitize]
 */

/**
 * @typedef {object} BsListGroupInstance
 * @property {Element} element
 * @property {(items: Array<Content | BsListGroupItem>) => void} update
 * @property {() => void} destroy
 */

/**
 * A Bootstrap list group (spec 04 F62).
 *
 * This returns an instance rather than an element because of `update()`. A list
 * that reflects data is re-rendered often, and the per-item click binding is
 * exactly what gets forgotten on the second render — the rebind-per-row cycle
 * F44 exists to end. One delegated listener is attached once and survives every
 * replacement, so `update(items)` is a pure re-render with no listener
 * bookkeeping and nothing to leak.
 *
 * @example
 * const list = bsListGroup(['Alpha', 'Beta'], { flush: true });
 * card.append(list.element);
 *
 * @example
 * const list = bsListGroup(
 *   rows.map((row) => ({ content: row.name, value: row, badge: row.count })),
 *   { onSelect: (item) => open(item.value) },
 * );
 * list.update(nextRows.map((row) => ({ content: row.name, value: row })));
 *
 * @param {Array<Content | BsListGroupItem>} items
 * @param {BsListGroupOptions} [options]
 * @returns {BsListGroupInstance}
 * @throws {TypeError} On a malformed option or item, or on `update()` after
 *   `destroy()`.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsListGroup(items, options = {}) {
  const api = 'bsListGroup';
  assertPlainObject(options, 'options', api);
  const { flush = false, numbered = false, horizontal = false, onSelect, signal } = options;

  if (onSelect !== undefined && typeof onSelect !== 'function') {
    throw new TypeError(`${api}: options.onSelect must be a function`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }
  if (typeof horizontal === 'string') assertToken(horizontal, 'options.horizontal', api);

  const doc = resolveDocument(options, api);
  const interactive = onSelect !== undefined;
  // Bootstrap's three shapes: <ol> when numbered (the counter is CSS on the
  // list), a <div> of links/buttons when actionable, a plain <ul> otherwise.
  const el = doc.createElement(numbered === true ? 'ol' : interactive ? 'div' : 'ul');
  applyClasses(
    el,
    [
      'list-group',
      flush === true && 'list-group-flush',
      numbered === true && 'list-group-numbered',
      horizontal === true && 'list-group-horizontal',
      typeof horizontal === 'string' && `list-group-horizontal-${horizontal}`,
    ],
    options.class,
    api,
  );

  const controller = new AbortController();
  /** @type {BsListGroupItem[]} */
  let normalized = [];

  /** @param {Array<Content | BsListGroupItem>} next */
  const render = (next) => {
    if (!Array.isArray(next)) throw new TypeError(`${api}: items must be an array`);
    normalized = next.map((entry, index) => normalizeItem(entry, index, api));

    const fragment = doc.createDocumentFragment();
    for (const [index, item] of normalized.entries()) {
      fragment.append(buildListItem(item, index, { doc, numbered, interactive, options, api }));
    }
    el.replaceChildren(fragment);
  };

  render(items);

  if (interactive) {
    // One listener for the life of the instance: items may be replaced any
    // number of times beneath it and nothing needs rebinding (F44, NFR-15).
    el.addEventListener(
      'click',
      (event) => {
        const match = closestWithin(el, event, '[data-egl-index]');
        // Direct children only. A list group nested inside one of our items —
        // which Bootstrap encourages — carries the same marker, and `closest`
        // would hand us *its* index to look up in *our* array: silently the
        // wrong record, or none at all.
        if (match === null || match.parentElement !== el) return;
        const index = Number(match.getAttribute('data-egl-index'));
        const item = normalized[index];
        // A foreign node someone appended into our container is not ours to act on.
        if (item === undefined || item.disabled === true) return;
        onSelect(item, index, event);
      },
      { signal: controller.signal },
    );
  }

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    controller.abort();
    el.remove();
  };

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return {
    element: el,
    update: (next) => {
      if (destroyed) throw new TypeError(`${api}: update() was called after destroy()`);
      render(next);
    },
    destroy,
  };
}

/**
 * Build one list-group item.
 *
 * @param {BsListGroupItem} item
 * @param {number} index
 * @param {{ doc: Document, numbered: boolean, interactive: boolean, options: BsListGroupOptions, api: string }} context
 * @returns {Element}
 */
function buildListItem(item, index, context) {
  const { doc, numbered, interactive, options, api } = context;
  const tag =
    numbered === true ? 'li' : item.href !== undefined ? 'a' : interactive ? 'button' : 'li';
  const el = doc.createElement(tag);
  const hasBadge = item.badge !== undefined;
  applyClasses(
    el,
    [
      'list-group-item',
      (interactive || item.href !== undefined) && 'list-group-item-action',
      item.variant !== undefined && `list-group-item-${item.variant}`,
      item.active === true && 'active',
      item.disabled === true && 'disabled',
      hasBadge && 'd-flex',
      hasBadge && 'justify-content-between',
      hasBadge && 'align-items-center',
    ],
    undefined,
    api,
  );
  if (tag === 'button') el.setAttribute('type', 'button');
  if (item.href !== undefined) el.setAttribute('href', item.href);
  if (item.active === true) el.setAttribute('aria-current', 'true');
  if (item.disabled === true) {
    // A link has no native disabled state, so it needs the ARIA flag *and*
    // removal from the tab order to be genuinely inert; a button has one.
    el.setAttribute('aria-disabled', 'true');
    if (tag === 'a') el.setAttribute('tabindex', '-1');
    else if (tag === 'button') el.setAttribute('disabled', '');
  }
  el.setAttribute('data-egl-index', String(index));

  appendContent(el, item.content, options, api);
  if (hasBadge) {
    el.append(
      renderItemBadge(
        /** @type {NonNullable<BsListGroupItem['badge']>} */ (item.badge),
        doc,
        options,
        api,
      ),
    );
  }
  return el;
}

/**
 * Normalise a list entry into its object form.
 *
 * @param {Content | BsListGroupItem} entry
 * @param {number} index
 * @param {string} api
 * @returns {BsListGroupItem}
 * @throws {TypeError} If the entry is malformed.
 */
function normalizeItem(entry, index, api) {
  if (typeof entry === 'string' || Array.isArray(entry) || isNode(entry)) {
    return { content: /** @type {Content} */ (entry) };
  }
  if (entry === null || typeof entry !== 'object') {
    throw new TypeError(`${api}: items[${index}] must be content or an item object`);
  }
  const item = /** @type {BsListGroupItem} */ (entry);
  if (item.content === undefined) {
    throw new TypeError(`${api}: items[${index}].content is required`);
  }
  if (item.variant !== undefined) assertToken(item.variant, `items[${index}].variant`, api);
  if (item.href !== undefined && typeof item.href !== 'string') {
    throw new TypeError(`${api}: items[${index}].href must be a string`);
  }
  return item;
}

/**
 * Render an item's trailing badge, accepting the shorthand forms.
 *
 * @param {string | number | { content: Content, variant?: string, pill?: boolean }} badge
 * @param {Document} doc
 * @param {ContentOptions} options
 * @param {string} api
 * @returns {Element}
 * @throws {TypeError} If the badge is malformed.
 */
function renderItemBadge(badge, doc, options, api) {
  if (typeof badge === 'string' || typeof badge === 'number') {
    return bsBadge(String(badge), { variant: 'primary', pill: true, document: doc });
  }
  assertPlainObject(badge, 'items[].badge', api);
  const { content, variant = 'primary', pill = true } = badge;
  return bsBadge(content, {
    variant,
    pill,
    document: doc,
    html: options.html,
    sanitize: options.sanitize,
  });
}

/**
 * @typedef {object} BsBreadcrumbItem
 * @property {Content} content
 * @property {string} [href]
 * @property {boolean} [current] - Marks the current page. Defaults to true for
 *   the last item, which is what a breadcrumb almost always means.
 */

/**
 * @typedef {object} BsBreadcrumbOptions
 * @property {string} [label='breadcrumb'] - The nav's accessible name.
 * @property {string} [divider] - A CSS value for `--bs-breadcrumb-divider`,
 *   e.g. `"'>'"`. Set as a custom property rather than injected as markup, so the
 *   separator stays presentation and never becomes a node.
 * @property {ClassOption} [class]
 * @property {Document} [document]
 * @property {boolean} [html]
 * @property {((html: string) => string) | false} [sanitize]
 */

/**
 * A Bootstrap breadcrumb (spec 04 F63).
 *
 * The last item is the current page: rendered without a link and carrying
 * `aria-current="page"`, which is what tells a screen-reader user *where they
 * are* rather than merely showing a trail.
 *
 * @example
 * bsBreadcrumb([
 *   { content: 'Home', href: '/' },
 *   { content: 'Orders', href: '/orders' },
 *   '4821',
 * ]);
 *
 * @param {Array<Content | BsBreadcrumbItem>} items
 * @param {BsBreadcrumbOptions} [options]
 * @returns {Element}
 * @throws {TypeError} On a malformed option or item.
 * @throws {DomContractError} If there is no document to build in.
 */
export function bsBreadcrumb(items, options = {}) {
  const api = 'bsBreadcrumb';
  assertPlainObject(options, 'options', api);
  const { label = 'breadcrumb', divider } = options;

  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError(`${api}: items must be a non-empty array`);
  }
  if (typeof label !== 'string' || label === '') {
    throw new TypeError(`${api}: options.label must be a non-empty string`);
  }
  if (divider !== undefined && typeof divider !== 'string') {
    throw new TypeError(`${api}: options.divider must be a CSS value string`);
  }

  const doc = resolveDocument(options, api);
  const nav = doc.createElement('nav');
  nav.setAttribute('aria-label', label);
  applyClasses(nav, [], options.class, api);
  if (divider !== undefined) {
    /** @type {{ style: CSSStyleDeclaration }} */ (nav).style.setProperty(
      '--bs-breadcrumb-divider',
      divider,
    );
  }

  const list = doc.createElement('ol');
  applyClasses(list, ['breadcrumb'], undefined, api);

  const fragment = doc.createDocumentFragment();
  for (const [index, entry] of items.entries()) {
    const item =
      typeof entry === 'string' || Array.isArray(entry) || isNode(entry)
        ? { content: /** @type {Content} */ (entry) }
        : /** @type {BsBreadcrumbItem} */ (entry);
    if (item === null || typeof item !== 'object' || item.content === undefined) {
      throw new TypeError(
        `${api}: items[${index}] must be content or { content, href?, current? }`,
      );
    }
    const isCurrent = item.current ?? index === items.length - 1;

    const li = doc.createElement('li');
    applyClasses(li, ['breadcrumb-item', isCurrent && 'active'], undefined, api);
    if (isCurrent) {
      li.setAttribute('aria-current', 'page');
      appendContent(li, item.content, options, api);
    } else if (typeof item.href === 'string') {
      const link = doc.createElement('a');
      link.setAttribute('href', item.href);
      appendContent(link, item.content, options, api);
      li.append(link);
    } else {
      appendContent(li, item.content, options, api);
    }
    fragment.append(li);
  }
  list.append(fragment);
  nav.append(list);
  return nav;
}

/**
 * Bootstrap's alert classes in the shape {@link inlineAlert} expects. Frozen
 * data: the component is the F49 engine, and this is only its costume.
 */
const BOOTSTRAP_ALERT_CLASSES = /* @__PURE__ */ Object.freeze({
  base: 'alert alert-dismissible fade show',
  success: 'alert-success',
  info: 'alert-info',
  warning: 'alert-warning',
  danger: 'alert-danger',
  icon: 'me-2',
  message: '',
  close: 'btn-close',
});

/**
 * @typedef {object} BsAlertOptions
 * @property {Partial<Record<'base' | 'success' | 'info' | 'warning' | 'danger' | 'icon' | 'message' | 'close', string>>} [classes]
 *   Merged over the Bootstrap defaults. This is also how a kind reaches a
 *   variant outside the four — `{ info: 'alert-primary' }` — without widening
 *   F49's frozen kind vocabulary.
 * @property {Record<string, unknown>} [icons] - Per-kind icons, as F49 defines
 *   them. The close slot defaults to empty, because `.btn-close` draws its own
 *   glyph in CSS.
 * @property {number} [autoHideMs]
 * @property {boolean} [dismissible=true]
 * @property {string} [closeLabel='Close']
 * @property {AbortSignal} [signal]
 */

/**
 * A Bootstrap alert (spec 04 F64).
 *
 * **Composed, not reimplemented.** Every behaviour — the per-instance timer, the
 * cancel-on-re-show rule, `textContent` by default with the `{html, sanitize}`
 * opt-in, the `role="alert"`/`"status"` split, teardown on `destroy()` or an
 * aborted signal — is {@link inlineAlert} (F49). This function contributes
 * Bootstrap's class map and nothing else, so a fix to the alert engine reaches
 * both entries at once and the two can never drift.
 *
 * @example
 * const alerts = bsAlert(document.querySelector('#form-alert'));
 * alerts.show('danger', error.message);
 * alerts.show('success', 'Saved.', { autoHideMs: 3_000 });
 *
 * @example
 * // Bootstrap's other variants are reached by retargeting a kind, which keeps
 * // F49's four-kind contract intact:
 * const alerts = bsAlert(host, { classes: { info: 'alert-primary' } });
 *
 * @param {Element} container
 * @param {BsAlertOptions} [options]
 * @returns {ReturnType<typeof inlineAlert>}
 * @throws {TypeError} On a malformed option, as F49 defines them.
 * @throws {DomContractError} If there is nowhere to build the alert.
 */
export function bsAlert(container, options = {}) {
  assertPlainObject(options, 'options', 'bsAlert');
  const { classes = {}, icons = {}, ...rest } = options;
  assertPlainObject(classes, 'options.classes', 'bsAlert');
  assertPlainObject(icons, 'options.icons', 'bsAlert');

  return inlineAlert(container, {
    ...rest,
    classes: { ...BOOTSTRAP_ALERT_CLASSES, ...classes },
    // `''` leaves the button visible with no glyph of ours — `.btn-close`
    // supplies one through CSS. That an empty icon no longer hides the control
    // is the F49 fix this component needed (ADR-0038).
    icons: { close: '', ...icons },
  });
}

/**
 * @typedef {object} BsPaginationLabels
 * @property {string} [nav='Pagination'] - The nav's accessible name.
 * @property {string} [previous='Previous'] - Accessible name of the previous step.
 * @property {string} [next='Next'] - Accessible name of the next step.
 * @property {string} [previousText='‹'] - Visible glyph for the previous step.
 * @property {string} [nextText='›'] - Visible glyph for the next step.
 * @property {string} [ellipsis='…'] - Visible gap marker.
 * @property {(page: number) => string} [page] - Accessible name per page button.
 */

/**
 * @typedef {object} BsPaginationOptions
 * @property {(page: number) => void} onPage - Called with the requested page.
 * @property {number} [siblingCount=1] - Pages shown either side of the current one.
 * @property {number} [boundaryCount=1] - Pages always shown at each end.
 * @property {string} [size] - `pagination-<size>`.
 * @property {BsPaginationLabels} [labels]
 * @property {AbortSignal} [signal]
 * @property {ClassOption} [class]
 */

/**
 * @typedef {object} BsPaginationInstance
 * @property {Element} element
 * @property {(view: { page: number, pageCount: number }) => void} update
 * @property {() => void} destroy
 */

/**
 * A Bootstrap pagination bar (spec 04 F65).
 *
 * `update({page, pageCount})` takes the shape `tablePipeline.view()` already
 * returns (F42), so wiring the two is one subscription and no adapter — which is
 * the point of having defined the pipeline's read model first. Clicks arrive
 * through **one** delegated listener that survives every re-render.
 *
 * Buttons, not `<a href="#">`: a pager is script-driven, and a fake fragment
 * link pollutes history and misleads anything that follows links. The gap marker
 * is a `<span>`, so an ellipsis never appears in the tab order as a control that
 * does nothing.
 *
 * Accessible names carry English defaults and are injectable; the *visible*
 * marks default to glyphs, which need no translation. A name has to be words, so
 * "language-neutral default" is not available for it — the F57 `closeLabel`
 * precedent, stated (ADR-0038).
 *
 * @example
 * const pager = bsPagination(footer, { onPage: (n) => table.setPage(n) });
 * table.on('change', (view) => pager.update(view));
 *
 * @example
 * bsPagination(footer, {
 *   onPage: goTo,
 *   labels: { nav: 'Navigazione pagine', previous: 'Precedente', next: 'Successiva' },
 * });
 *
 * @param {Element} container
 * @param {BsPaginationOptions} options
 * @returns {BsPaginationInstance}
 * @throws {TypeError} On a malformed option, or on `update()` after `destroy()`.
 * @throws {DomContractError} If there is nowhere to build the bar.
 */
export function bsPagination(container, options) {
  const api = 'bsPagination';
  if (!isElement(container)) {
    throw new TypeError(`${api}: container must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  const { onPage, siblingCount = 1, boundaryCount = 1, size, labels = {}, signal } = options;

  if (typeof onPage !== 'function') {
    throw new TypeError(`${api}: options.onPage must be a function`);
  }
  if (!Number.isInteger(siblingCount) || siblingCount < 0) {
    throw new TypeError(`${api}: options.siblingCount must be a non-negative integer`);
  }
  if (!Number.isInteger(boundaryCount) || boundaryCount < 0) {
    throw new TypeError(`${api}: options.boundaryCount must be a non-negative integer`);
  }
  if (size !== undefined) assertToken(size, 'options.size', api);
  assertPlainObject(labels, 'options.labels', api);
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const {
    nav = 'Pagination',
    previous = 'Previous',
    next = 'Next',
    previousText = '‹',
    nextText = '›',
    ellipsis = '…',
    page: pageLabel,
  } = labels;
  if (pageLabel !== undefined && typeof pageLabel !== 'function') {
    throw new TypeError(`${api}: options.labels.page must be a function`);
  }

  // The container supplies the realm, so this builder needs no `document`
  // option: an Element always has an `ownerDocument` (only a Document's own is
  // null, and `isElement` has already excluded that).
  const doc = /** @type {Document} */ (container.ownerDocument);
  const navEl = doc.createElement('nav');
  navEl.setAttribute('aria-label', nav);
  const list = doc.createElement('ul');
  applyClasses(
    list,
    ['pagination', size !== undefined && `pagination-${size}`],
    options.class,
    api,
  );
  navEl.append(list);

  const controller = new AbortController();
  let current = 1;
  let total = 1;

  /**
   * @param {string} content
   * @param {{ page?: number, disabled?: boolean, active?: boolean, name?: string }} state
   * @returns {Element}
   */
  const step = (content, state) => {
    const li = doc.createElement('li');
    applyClasses(
      li,
      ['page-item', state.disabled === true && 'disabled', state.active === true && 'active'],
      undefined,
      api,
    );
    // A gap marker is not a control: a <span> keeps it out of the tab order and
    // out of the accessibility tree's button count.
    const inner = doc.createElement(state.page === undefined ? 'span' : 'button');
    applyClasses(inner, ['page-link'], undefined, api);
    inner.textContent = content;
    if (state.page !== undefined) {
      inner.setAttribute('type', 'button');
      inner.setAttribute('data-egl-page', String(state.page));
      if (state.disabled === true) inner.setAttribute('disabled', '');
      if (state.name !== undefined) inner.setAttribute('aria-label', state.name);
    }
    if (state.active === true) li.setAttribute('aria-current', 'page');
    li.append(inner);
    return li;
  };

  /** @param {{ page: number, pageCount: number }} view */
  const update = (view) => {
    assertPlainObject(view, 'update(view)', api);
    if (!Number.isFinite(view.page) || !Number.isFinite(view.pageCount)) {
      throw new TypeError(`${api}: update(view) requires finite page and pageCount numbers`);
    }
    total = Math.max(1, Math.trunc(view.pageCount));
    current = Math.min(total, Math.max(1, Math.trunc(view.page)));

    const fragment = doc.createDocumentFragment();
    fragment.append(
      step(previousText, { page: current - 1, disabled: current <= 1, name: previous }),
    );
    for (const entry of paginationWindow(current, total, siblingCount, boundaryCount)) {
      fragment.append(
        entry === null
          ? step(ellipsis, {})
          : step(String(entry), {
              page: entry,
              active: entry === current,
              name: pageLabel === undefined ? undefined : pageLabel(entry),
            }),
      );
    }
    fragment.append(step(nextText, { page: current + 1, disabled: current >= total, name: next }));
    list.replaceChildren(fragment);
  };

  update({ page: 1, pageCount: 1 });
  container.append(navEl);

  list.addEventListener(
    'click',
    (event) => {
      const match = closestWithin(list, event, '[data-egl-page]');
      if (match === null) return;
      const requested = Number(match.getAttribute('data-egl-page'));
      if (requested < 1 || requested > total || requested === current) return;
      onPage(requested);
    },
    { signal: controller.signal },
  );

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    controller.abort();
    navEl.remove();
  };

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return {
    element: navEl,
    update: (view) => {
      if (destroyed) throw new TypeError(`${api}: update() was called after destroy()`);
      update(view);
    },
    destroy,
  };
}

/**
 * The page numbers to show, with `null` marking an elided run.
 *
 * Boundary pages stay visible so the ends are always one click away, and
 * siblings keep the current page centred. A gap of exactly one page renders as
 * that page: an ellipsis hiding a single number costs the same space and gives
 * the user less.
 *
 * @param {number} page
 * @param {number} pageCount
 * @param {number} siblingCount
 * @param {number} boundaryCount
 * @returns {Array<number | null>}
 */
function paginationWindow(page, pageCount, siblingCount, boundaryCount) {
  const wanted = new Set([page]);
  for (let offset = 1; offset <= siblingCount; offset += 1) {
    wanted.add(page - offset);
    wanted.add(page + offset);
  }
  for (let index = 1; index <= boundaryCount; index += 1) {
    wanted.add(index);
    wanted.add(pageCount - index + 1);
  }

  const shown = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  /** @type {Array<number | null>} */
  const out = [];
  let last = 0;
  for (const n of shown) {
    if (last !== 0 && n - last > 1) {
      if (n - last === 2) out.push(last + 1);
      else out.push(null);
    }
    out.push(n);
    last = n;
  }
  return out;
}
