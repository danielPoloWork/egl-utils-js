/**
 * egl-utils-js — the Bootstrap navigation set: collapse, accordion, dropdown,
 * navs & tabs, navbar (spec 04 §2 items F72-F76, ADR-0042).
 *
 * Two shapes live here, and the difference is worth naming because it decides
 * what each one can promise:
 *
 * - **Wrappers** (`bsCollapse`, `bsDropdown`) drive markup the caller already
 *   has. They own a lifecycle and nothing else.
 * - **Managers** (`bsAccordion`, `bsTabs`, `bsNavbar`) *build* markup when given
 *   items, and adopt existing markup when not. Building is the whole point:
 *   Bootstrap's navigation components are the ones whose ARIA wiring is most
 *   often wrong by hand — `aria-controls` pointing at nothing, `aria-expanded`
 *   that never updates, a tab list with no `role="tablist"` — because the
 *   relationships are expressed through **ids**, and ids are what a template
 *   gets wrong. A manager that mints its own cannot mismatch them.
 *
 * Everything peer-facing goes through the F68 contract from
 * {@link module:egl-utils-js/bootstrap bootstrap-behaviors.js}: nothing is
 * imported, the namespace is resolved at the first operation, and a missing one
 * is a typed `EGL_PEER_MISSING` throw. The builders here need only a document,
 * so the markup half of every manager works with no peer at all.
 *
 * @module egl-utils-js/bootstrap
 */

import { isElement } from './dom-helpers.js';
import { assertAlive } from './lifecycle.js';
import { assertNoUnknownOptions } from './option-keys.js';
import {
  appendContent,
  applyClasses,
  assertPlainObject,
  assertToken,
  documentOf,
  renderContent,
  uniqueId,
} from './bootstrap-elements.js';
import {
  assertSignal,
  behaviourWrapper,
  instantiate,
  invoke,
  qualifyEvent,
  resolveComponent,
} from './bootstrap-behaviors.js';

/**
 * @typedef {import('./bootstrap-elements.js').Content} Content
 * @typedef {import('./bootstrap-elements.js').ClassOption} ClassOption
 * @typedef {import('./bootstrap-behaviors.js').BootstrapInstanceLike} BootstrapInstanceLike
 * @typedef {import('./bootstrap-behaviors.js').BehaviourWrapper} BehaviourWrapper
 */

/**
 * @typedef {object} BsCollapseOptions
 * @property {Element} [toggler] - A control the wrapper binds and keeps in sync:
 *   click toggles, and `aria-expanded` plus the `collapsed` class follow the
 *   component's own events.
 * @property {Element} [parent] - Accordion scoping, as Bootstrap's `parent`.
 * @property {boolean} [toggle=false] - Whether constructing also toggles.
 *   Defaulted **off**, unlike Bootstrap: resolution here is lazy, so the
 *   constructor runs at the first `show()`/`toggle()` call, and an implicit
 *   toggle there would fire twice.
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 */

/**
 * A Bootstrap collapse wrapper (spec 04 F72).
 *
 * With a `toggler` it does the job Bootstrap's `data-bs-toggle` attribute does —
 * click to toggle, `aria-expanded` kept truthful — but imperatively, which means
 * it can be torn down. The data-API cannot: markup with `data-bs-toggle` stays
 * live for as long as the node exists.
 *
 * @example
 * const panel = bsCollapse(document.querySelector('#details'), {
 *   toggler: document.querySelector('#details-toggle'),
 * });
 * panel.show();
 *
 * @param {Element} target - The collapsible element.
 * @param {BsCollapseOptions} [options]
 * @returns {BehaviourWrapper}
 * @throws {TypeError} On a malformed or unknown option or a non-Element target.
 * @throws {PeerMissingError} From the first operation, if `Collapse` is unreachable.
 */
export function bsCollapse(target, options = {}) {
  const api = 'bsCollapse';
  if (!isElement(target)) {
    throw new TypeError(`${api}: target must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const { toggler, parent, toggle = false, bootstrap, signal, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  if (toggler !== undefined && !isElement(toggler)) {
    throw new TypeError(`${api}: options.toggler must be an Element`);
  }
  if (parent !== undefined && !isElement(parent)) {
    throw new TypeError(`${api}: options.parent must be an Element`);
  }

  /** @type {Record<string, unknown>} */
  const config = { toggle };
  if (parent !== undefined) config.parent = parent;

  const wrapper = behaviourWrapper(
    target,
    { bootstrap, signal },
    {
      api,
      component: 'Collapse',
      ns: 'bs.collapse',
      config,
    },
  );

  if (toggler === undefined) return wrapper;

  // The accessible relationship, made true rather than assumed: a toggler needs
  // to say what it controls, and the target needs an id for it to point at.
  const doc = /** @type {Document} */ (target.ownerDocument);
  if (target.id === '') target.id = uniqueId(doc, 'egl-collapse');
  toggler.setAttribute('aria-controls', target.id);

  const expanded = target.classList.contains('show');
  toggler.setAttribute('aria-expanded', String(expanded));
  toggler.classList.toggle('collapsed', !expanded);

  /** @param {boolean} open */
  const reflect = (open) => {
    toggler.setAttribute('aria-expanded', String(open));
    toggler.classList.toggle('collapsed', !open);
  };
  const onClick = () => wrapper.toggle();
  const onShow = () => reflect(true);
  const onHide = () => reflect(false);

  toggler.addEventListener('click', onClick);
  // `show`/`hide` rather than `shown`/`hidden`: the state a control announces
  // should change when the transition starts, not when it finishes, or a screen
  // reader reads the old value for the length of the animation.
  target.addEventListener('show.bs.collapse', onShow);
  target.addEventListener('hide.bs.collapse', onHide);

  const { destroy } = wrapper;
  return {
    ...wrapper,
    destroy: () => {
      toggler.removeEventListener('click', onClick);
      target.removeEventListener('show.bs.collapse', onShow);
      target.removeEventListener('hide.bs.collapse', onHide);
      destroy();
    },
  };
}

/**
 * @typedef {object} BsAccordionItem
 * @property {Content} header - The button's content, escaped by default.
 * @property {Content} body
 * @property {boolean} [open=false] - Whether this item starts expanded.
 */

/**
 * @typedef {object} BsAccordionOptions
 * @property {BsAccordionItem[]} [items] - Build the structure. Omit to adopt
 *   existing `.accordion-item` markup instead.
 * @property {boolean} [alwaysOpen=false] - Drop the parent scoping, so opening
 *   one item does not close the others.
 * @property {boolean} [flush=false] - `accordion-flush`.
 * @property {boolean} [html=false] - Treat string content as markup.
 * @property {((html: string) => string) | false} [sanitize] - Required with
 *   `{ html: true }` (F52).
 * @property {ClassOption} [class]
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 * @property {Document} [document]
 */

/**
 * @typedef {object} BsAccordionInstance
 * @property {(index: number) => void} open
 * @property {(index: number) => void} close
 * @property {(index: number) => void} toggle
 * @property {(event: string, handler: (event: Event) => void) => () => void} on
 * @property {Element} element
 * @property {readonly BehaviourWrapper[]} items - One collapse wrapper per item,
 *   in order: the door out of the manager.
 * @property {() => void} destroy
 */

/**
 * A Bootstrap accordion (spec 04 F73).
 *
 * Given `items` it builds the whole structure — header button, collapsible
 * panel, and the `aria-expanded`/`aria-controls`/`aria-labelledby` triangle
 * between them, over ids minted against the live document so they cannot
 * collide. Given none, it adopts whatever `.accordion-item` markup is already
 * there. Either way each item is an F72 `bsCollapse`, so exclusivity is
 * Bootstrap's own `parent` behaviour rather than a second implementation of it.
 *
 * @example
 * const faq = bsAccordion(container, {
 *   items: [
 *     { header: 'What is it?', body: 'A toolkit.', open: true },
 *     { header: 'Why?', body: 'So the ARIA is right.' },
 *   ],
 * });
 * faq.open(1);
 *
 * @param {Element} container
 * @param {BsAccordionOptions} [options]
 * @returns {BsAccordionInstance}
 * @throws {TypeError} On a malformed or unknown option or a non-Element container.
 * @throws {PeerMissingError} From the first operation, if `Collapse` is unreachable.
 */
export function bsAccordion(container, options = {}) {
  const api = 'bsAccordion';
  if (!isElement(container)) {
    throw new TypeError(`${api}: container must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const {
    items,
    alwaysOpen = false,
    flush = false,
    html,
    sanitize,
    signal,
    bootstrap,
    class: extraClass,
    document: explicitDocument,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  if (items !== undefined && !Array.isArray(items)) {
    throw new TypeError(`${api}: options.items must be an array`);
  }

  const doc = documentOf(container, { document: explicitDocument }, api);
  /** @type {Element} */
  let root;

  if (items === undefined) {
    root = container;
  } else {
    root = doc.createElement('div');
    applyClasses(root, ['accordion', flush === true && 'accordion-flush'], extraClass, api);
    /** @type {Set<string>} */
    const reserved = new Set();
    root.id = uniqueId(doc, 'egl-accordion', reserved);

    const fragment = doc.createDocumentFragment();
    for (const [index, item] of items.entries()) {
      if (item === null || typeof item !== 'object') {
        throw new TypeError(`${api}: items[${index}] must be { header, body, open? }`);
      }
      const {
        header: itemHeader,
        body: itemBody,
        open: itemOpen,
        ...unknownItem
      } = /** @type {BsAccordionItem} */ (item);
      assertNoUnknownOptions(unknownItem, api, `items[${index}] property`);
      const paneId = uniqueId(doc, `${root.id}-pane`, reserved);
      const headerId = uniqueId(doc, `${root.id}-header`, reserved);
      const open = itemOpen === true;

      const wrapper = doc.createElement('div');
      wrapper.className = 'accordion-item';

      const heading = doc.createElement('h2');
      heading.className = 'accordion-header';
      heading.id = headerId;

      const button = doc.createElement('button');
      button.className = open ? 'accordion-button' : 'accordion-button collapsed';
      button.setAttribute('type', 'button');
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-controls', paneId);
      renderContent(button, itemHeader, { html, sanitize }, api);
      heading.append(button);

      const pane = doc.createElement('div');
      pane.id = paneId;
      pane.className = open ? 'accordion-collapse collapse show' : 'accordion-collapse collapse';
      pane.setAttribute('aria-labelledby', headerId);

      const body = doc.createElement('div');
      body.className = 'accordion-body';
      appendContent(body, itemBody, { html, sanitize }, api);
      pane.append(body);

      wrapper.append(heading);
      wrapper.append(pane);
      fragment.append(wrapper);
    }
    root.append(fragment);
    container.append(root);
  }

  // Built or adopted, the wiring is identical from here — which is the point of
  // adopting through the same query the builder's own output satisfies.
  /** @type {BehaviourWrapper[]} */
  const wrappers = [];
  for (const item of root.querySelectorAll('.accordion-item')) {
    const pane = item.querySelector('.accordion-collapse');
    const button = item.querySelector('.accordion-button');
    if (pane === null || button === null) continue;
    wrappers.push(
      bsCollapse(pane, {
        ...(button === null ? {} : { toggler: button }),
        ...(alwaysOpen === true ? {} : { parent: root }),
        ...(bootstrap === undefined ? {} : { bootstrap }),
      }),
    );
  }

  /** @type {Array<() => void>} */
  const subscriptions = [];
  let destroyed = false;

  /**
   * @param {number} index
   * @returns {BehaviourWrapper}
   */
  function at(index, method = 'at') {
    assertAlive(destroyed, api, method);
    const wrapper = wrappers[index];
    if (wrapper === undefined) {
      throw new TypeError(`${api}: no item at index ${index} (${wrappers.length} present)`);
    }
    return wrapper;
  }

  /**
   * @param {string} event
   * @param {(event: Event) => void} handler
   * @returns {() => void}
   */
  function on(event, handler) {
    assertAlive(destroyed, api, 'on');
    if (typeof handler !== 'function') {
      throw new TypeError(`${api}: handler must be a function`);
    }
    // Subscribed on the accordion rather than per pane: collapse events bubble,
    // so one listener sees every item and keeps working when items change.
    const name = qualifyEvent(event, 'bs.collapse', api);
    root.addEventListener(name, handler);
    let off = () => {
      root.removeEventListener(name, handler);
      off = () => {};
    };
    const unsubscribe = () => off();
    subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.length = 0;
    for (const wrapper of wrappers) wrapper.destroy();
    if (items !== undefined) root.remove();
    if (signal !== undefined) signal.removeEventListener('abort', destroy);
  }

  if (signal !== undefined) {
    if (signal.aborted) destroy();
    else signal.addEventListener('abort', destroy);
  }

  return {
    open: (index) => at(index, 'open').show(),
    close: (index) => at(index, 'close').hide(),
    toggle: (index) => at(index, 'toggle').toggle(),
    on,
    element: root,
    items: wrappers,
    destroy,
  };
}

/**
 * @typedef {object} BsDropdownOptions
 * @property {boolean | 'inside' | 'outside'} [autoClose] - Bootstrap's own option.
 * @property {Element} [reference] - Bootstrap's `reference` positioning anchor.
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 */

/**
 * A Bootstrap dropdown wrapper (spec 04 F74).
 *
 * `update()` is the one method worth the wrapper existing: a dropdown whose
 * trigger moved — a toolbar that re-flowed, a sticky header that changed height
 * — renders in the wrong place until Popper is told to recompute.
 *
 * @example
 * const menu = bsDropdown(document.querySelector('#actions'));
 * menu.show();
 *
 * @param {Element} toggler - The element carrying `dropdown-toggle`.
 * @param {BsDropdownOptions} [options]
 * @returns {BehaviourWrapper & { update: () => void }}
 * @throws {TypeError} On a malformed or unknown option or a non-Element toggler.
 * @throws {PeerMissingError} From the first operation, if `Dropdown` is unreachable.
 */
export function bsDropdown(toggler, options = {}) {
  const api = 'bsDropdown';
  if (!isElement(toggler)) {
    throw new TypeError(`${api}: toggler must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const { autoClose, reference, bootstrap, signal, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  /** @type {Record<string, unknown>} */
  const config = {};
  if (autoClose !== undefined) config.autoClose = autoClose;
  if (reference !== undefined) config.reference = reference;

  const wrapper = behaviourWrapper(
    toggler,
    { bootstrap, signal },
    {
      api,
      component: 'Dropdown',
      ns: 'bs.dropdown',
      config,
    },
  );

  return {
    ...wrapper,
    update: () => {
      const instance = wrapper.instance();
      const update = /** @type {{ update?: unknown }} */ (instance).update;
      if (typeof update === 'function') update.call(instance);
    },
  };
}

/**
 * @typedef {object} BsTabsItem
 * @property {Content} label - The tab's own content, escaped by default.
 * @property {Content} pane - The panel's content.
 * @property {boolean} [active=false]
 * @property {boolean} [disabled=false]
 */

/**
 * @typedef {object} BsTabsOptions
 * @property {BsTabsItem[]} [tabs] - Build the structure. Omit to adopt existing
 *   `[data-bs-toggle="tab"]` markup instead.
 * @property {'tabs' | 'pills' | 'underline'} [kind='tabs']
 * @property {boolean} [fade=true] - Whether panes cross-fade.
 * @property {boolean} [fill=false]
 * @property {boolean} [justified=false]
 * @property {boolean} [html=false]
 * @property {((html: string) => string) | false} [sanitize]
 * @property {ClassOption} [class]
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 * @property {Document} [document]
 */

/**
 * @typedef {object} BsTabsInstance
 * @property {(index: number) => void} select
 * @property {(event: string, handler: (event: Event) => void) => () => void} on
 * @property {Element} element
 * @property {readonly Element[]} triggers
 * @property {() => void} destroy
 */

/**
 * Bootstrap navs & tabs (spec 04 F75).
 *
 * The ARIA here is a five-part relationship — `role="tablist"`, a `role="tab"`
 * per trigger with `aria-selected` and `aria-controls`, a `role="tabpanel"` per
 * pane with `aria-labelledby`, and the ids joining them — which is precisely the
 * kind of thing that is written once by hand and then drifts. Built from
 * `tabs`, it cannot drift: every id is minted here and every relationship
 * written from the same pair.
 *
 * Keyboard behaviour is Bootstrap's own Tab plugin, deliberately: arrow-key
 * roving is its job, and a second implementation would fight it.
 *
 * @example
 * const tabs = bsTabs(container, {
 *   tabs: [
 *     { label: 'Overview', pane: overviewNode, active: true },
 *     { label: 'Details', pane: 'Plain text is escaped.' },
 *   ],
 * });
 * tabs.select(1);
 *
 * @param {Element} container
 * @param {BsTabsOptions} [options]
 * @returns {BsTabsInstance}
 * @throws {TypeError} On a malformed or unknown option or a non-Element container.
 * @throws {PeerMissingError} From `select`, if `Tab` is unreachable.
 */
export function bsTabs(container, options = {}) {
  const api = 'bsTabs';
  if (!isElement(container)) {
    throw new TypeError(`${api}: container must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const {
    tabs,
    kind = 'tabs',
    fade = true,
    fill = false,
    justified = false,
    html,
    sanitize,
    signal,
    bootstrap,
    class: extraClass,
    document: explicitDocument,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  if (tabs !== undefined && !Array.isArray(tabs)) {
    throw new TypeError(`${api}: options.tabs must be an array`);
  }
  assertToken(kind, 'options.kind', api);

  const doc = documentOf(container, { document: explicitDocument }, api);
  /** @type {Element} */
  let root = container;

  if (tabs !== undefined) {
    root = doc.createElement('div');
    applyClasses(root, [], extraClass, api);

    const list = doc.createElement('ul');
    applyClasses(
      list,
      ['nav', `nav-${kind}`, fill === true && 'nav-fill', justified === true && 'nav-justified'],
      undefined,
      api,
    );
    list.setAttribute('role', 'tablist');

    const content = doc.createElement('div');
    content.className = 'tab-content';

    const listFragment = doc.createDocumentFragment();
    const contentFragment = doc.createDocumentFragment();
    /** @type {Set<string>} */
    const reserved = new Set();
    const base = uniqueId(doc, 'egl-tabs', reserved);

    for (const [index, tab] of tabs.entries()) {
      if (tab === null || typeof tab !== 'object') {
        throw new TypeError(`${api}: tabs[${index}] must be { label, pane, active?, disabled? }`);
      }
      const {
        label: tabLabel,
        pane: tabPane,
        active: tabActive,
        disabled: tabDisabled,
        ...unknownTab
      } = /** @type {BsTabsItem} */ (tab);
      assertNoUnknownOptions(unknownTab, api, `tabs[${index}] property`);
      const paneId = uniqueId(doc, `${base}-pane`, reserved);
      const tabId = uniqueId(doc, `${base}-tab`, reserved);
      const active = tabActive === true;
      const disabled = tabDisabled === true;

      const li = doc.createElement('li');
      li.className = 'nav-item';
      li.setAttribute('role', 'presentation');

      const trigger = doc.createElement('button');
      applyClasses(
        trigger,
        ['nav-link', active && 'active', disabled && 'disabled'],
        undefined,
        api,
      );
      trigger.id = tabId;
      trigger.setAttribute('type', 'button');
      trigger.setAttribute('role', 'tab');
      trigger.setAttribute('data-bs-toggle', 'tab');
      trigger.setAttribute('data-bs-target', `#${paneId}`);
      trigger.setAttribute('aria-controls', paneId);
      trigger.setAttribute('aria-selected', String(active));
      if (disabled) trigger.setAttribute('disabled', '');
      renderContent(trigger, tabLabel, { html, sanitize }, api);
      li.append(trigger);
      listFragment.append(li);

      const pane = doc.createElement('div');
      applyClasses(
        pane,
        ['tab-pane', fade === true && 'fade', active && 'show', active && 'active'],
        undefined,
        api,
      );
      pane.id = paneId;
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', tabId);
      // A panel is a focus stop: a keyboard user arriving from the tab must be
      // able to reach content that is not itself focusable.
      pane.setAttribute('tabindex', '0');
      appendContent(pane, tabPane, { html, sanitize }, api);
      contentFragment.append(pane);
    }

    list.append(listFragment);
    content.append(contentFragment);
    root.append(list);
    root.append(content);
    container.append(root);
  }

  const triggers = [...root.querySelectorAll('[data-bs-toggle="tab"]')];
  /** @type {Array<() => void>} */
  const subscriptions = [];
  /** @type {BootstrapInstanceLike[]} */
  const instances = [];
  let destroyed = false;

  /**
   * @param {number} index
   * @returns {void}
   */
  function select(index) {
    assertAlive(destroyed, api, 'select');
    const trigger = triggers[index];
    if (trigger === undefined) {
      throw new TypeError(`${api}: no tab at index ${index} (${triggers.length} present)`);
    }
    const instance = instantiate(resolveComponent({ bootstrap }, api, 'Tab'), trigger, {});
    instances.push(instance);
    invoke(instance, 'show');
  }

  /**
   * @param {string} event
   * @param {(event: Event) => void} handler
   * @returns {() => void}
   */
  function on(event, handler) {
    assertAlive(destroyed, api, 'on');
    if (typeof handler !== 'function') {
      throw new TypeError(`${api}: handler must be a function`);
    }
    const name = qualifyEvent(event, 'bs.tab', api);
    root.addEventListener(name, handler);
    let off = () => {
      root.removeEventListener(name, handler);
      off = () => {};
    };
    const unsubscribe = () => off();
    subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.length = 0;
    for (const instance of instances) invoke(instance, 'dispose');
    instances.length = 0;
    if (tabs !== undefined) root.remove();
    if (signal !== undefined) signal.removeEventListener('abort', destroy);
  }

  if (signal !== undefined) {
    if (signal.aborted) destroy();
    else signal.addEventListener('abort', destroy);
  }

  return { select, on, element: root, triggers, destroy };
}

/**
 * @typedef {object} BsNavbarItem
 * @property {Content} label
 * @property {string} [href='#']
 * @property {boolean} [active=false]
 * @property {boolean} [disabled=false]
 * @property {BsNavbarItem[]} [children] - Renders a dropdown, managed by F74.
 */

/**
 * @typedef {object} BsNavbarOptions
 * @property {Content} [brand]
 * @property {string} [brandHref='#']
 * @property {BsNavbarItem[]} [items]
 * @property {'sm' | 'md' | 'lg' | 'xl' | 'xxl' | false} [expand='lg'] - The
 *   breakpoint above which the nav is laid out horizontally; `false` keeps it
 *   collapsed at every width.
 * @property {'fixed-top' | 'fixed-bottom' | 'sticky-top'} [placement]
 * @property {string} [variant] - Background colour, as `bg-<variant>`.
 * @property {string} [togglerLabel='Toggle navigation'] - Accessible name of the
 *   responsive toggler (NFR-21).
 * @property {boolean} [container='container-fluid'] - Inner container class.
 * @property {boolean} [html=false]
 * @property {((html: string) => string) | false} [sanitize]
 * @property {ClassOption} [class]
 * @property {Record<string, unknown>} [bootstrap]
 * @property {AbortSignal} [signal]
 * @property {Document} [document]
 */

/**
 * @typedef {object} BsNavbarInstance
 * @property {Element} element
 * @property {BehaviourWrapper} collapse - The F72 wrapper behind the responsive
 *   toggler.
 * @property {readonly (BehaviourWrapper & { update: () => void })[]} dropdowns
 * @property {() => void} destroy
 */

/**
 * A Bootstrap navbar (spec 04 F76).
 *
 * A composer rather than a wrapper: it assembles the brand, the nav items, the
 * responsive toggler and the collapsible region, then wires the toggler through
 * an F72 `bsCollapse` and each `children` list through an F74 `bsDropdown`. The
 * toggler wiring is the part worth having — `aria-controls` pointing at the real
 * region, `aria-expanded` that follows the transition, and a teardown that
 * detaches both.
 *
 * @example
 * const nav = bsNavbar(document.body, {
 *   brand: 'Acme',
 *   items: [
 *     { label: 'Home', href: '/', active: true },
 *     { label: 'More', children: [{ label: 'Settings', href: '/settings' }] },
 *   ],
 * });
 *
 * @param {Element} container
 * @param {BsNavbarOptions} [options]
 * @returns {BsNavbarInstance}
 * @throws {TypeError} On a malformed or unknown option or a non-Element container.
 * @throws {PeerMissingError} From the toggler or a dropdown, if the peer is unreachable.
 */
export function bsNavbar(container, options = {}) {
  const api = 'bsNavbar';
  if (!isElement(container)) {
    throw new TypeError(`${api}: container must be an Element`);
  }
  assertPlainObject(options, 'options', api);
  assertSignal(options, api);

  const {
    brand,
    brandHref = '#',
    items = [],
    expand = 'lg',
    placement,
    variant,
    togglerLabel = 'Toggle navigation',
    html,
    sanitize,
    signal,
    bootstrap,
    class: extraClass,
    document: explicitDocument,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  if (!Array.isArray(items)) {
    throw new TypeError(`${api}: options.items must be an array`);
  }
  if (expand !== false) assertToken(expand, 'options.expand', api);
  if (placement !== undefined) assertToken(placement, 'options.placement', api);
  if (variant !== undefined) assertToken(variant, 'options.variant', api);
  if (typeof togglerLabel !== 'string' || togglerLabel === '') {
    throw new TypeError(`${api}: options.togglerLabel must be a non-empty string`);
  }

  const doc = documentOf(container, { document: explicitDocument }, api);
  const contentOptions = { html, sanitize };

  const nav = doc.createElement('nav');
  applyClasses(
    nav,
    [
      'navbar',
      expand === false ? false : `navbar-expand-${expand}`,
      placement !== undefined && placement,
      variant !== undefined && `bg-${variant}`,
    ],
    extraClass,
    api,
  );

  const inner = doc.createElement('div');
  inner.className = 'container-fluid';

  if (brand !== undefined) {
    const brandEl = doc.createElement('a');
    brandEl.className = 'navbar-brand';
    brandEl.setAttribute('href', brandHref);
    renderContent(brandEl, brand, contentOptions, api);
    inner.append(brandEl);
  }

  const region = doc.createElement('div');
  region.className = 'collapse navbar-collapse';
  region.id = uniqueId(doc, 'egl-navbar');

  const toggler = doc.createElement('button');
  toggler.className = 'navbar-toggler';
  toggler.setAttribute('type', 'button');
  toggler.setAttribute('aria-label', togglerLabel);
  const icon = doc.createElement('span');
  icon.className = 'navbar-toggler-icon';
  toggler.append(icon);
  inner.append(toggler);

  const list = doc.createElement('ul');
  list.className = 'navbar-nav';

  /** @type {(BehaviourWrapper & { update: () => void })[]} */
  const dropdowns = [];

  /**
   * @param {BsNavbarItem} item
   * @param {number} index
   * @returns {Element}
   */
  function renderItem(item, index) {
    if (item === null || typeof item !== 'object') {
      throw new TypeError(`${api}: items[${index}] must be { label, href?, ... }`);
    }
    // A submenu child is the same declared shape but is rendered inline below
    // rather than through this function, so it carries its own check.
    const {
      label: itemLabel,
      href: itemHref,
      active: itemActive,
      disabled: itemDisabled,
      children,
      ...unknownItem
    } = /** @type {BsNavbarItem} */ (item);
    assertNoUnknownOptions(unknownItem, api, `items[${index}] property`);

    const li = doc.createElement('li');
    li.className = 'nav-item';

    const link = doc.createElement('a');
    const active = itemActive === true;
    const disabled = itemDisabled === true;
    const hasChildren = Array.isArray(children) && children.length > 0;

    applyClasses(
      link,
      ['nav-link', hasChildren && 'dropdown-toggle', active && 'active', disabled && 'disabled'],
      undefined,
      api,
    );
    link.setAttribute('href', itemHref ?? '#');
    // Which page you are on is an ARIA state, not a colour.
    if (active) link.setAttribute('aria-current', 'page');
    if (disabled) link.setAttribute('aria-disabled', 'true');
    renderContent(link, itemLabel, contentOptions, api);

    if (!hasChildren) {
      li.append(link);
      return li;
    }

    li.classList.add('dropdown');
    link.setAttribute('role', 'button');
    link.setAttribute('data-bs-toggle', 'dropdown');
    link.setAttribute('aria-expanded', 'false');
    li.append(link);

    const menu = doc.createElement('ul');
    menu.className = 'dropdown-menu';
    for (const [childIndex, child] of /** @type {BsNavbarItem[]} */ (children).entries()) {
      if (child === null || typeof child !== 'object') {
        throw new TypeError(`${api}: items[${index}].children[${childIndex}] must be an object`);
      }
      const {
        label: childLabel,
        href: childHref,
        active: childActive,
        disabled: childDisabled,
        children: childChildren,
        ...unknownChild
      } = /** @type {BsNavbarItem} */ (child);
      assertNoUnknownOptions(unknownChild, api, `items[${index}].children[${childIndex}] property`);
      const childLi = doc.createElement('li');
      const childLink = doc.createElement('a');
      applyClasses(childLink, ['dropdown-item', childActive === true && 'active'], undefined, api);
      childLink.setAttribute('href', childHref ?? '#');
      if (childActive === true) childLink.setAttribute('aria-current', 'page');
      renderContent(childLink, childLabel, contentOptions, api);
      childLi.append(childLink);
      menu.append(childLi);
    }
    li.append(menu);

    dropdowns.push(bsDropdown(link, bootstrap === undefined ? {} : { bootstrap }));
    return li;
  }

  const fragment = doc.createDocumentFragment();
  for (const [index, item] of items.entries()) fragment.append(renderItem(item, index));
  list.append(fragment);
  region.append(list);
  inner.append(region);
  nav.append(inner);
  container.append(nav);

  const collapse = bsCollapse(region, {
    toggler,
    ...(bootstrap === undefined ? {} : { bootstrap }),
  });

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    collapse.destroy();
    for (const dropdown of dropdowns) dropdown.destroy();
    nav.remove();
    if (signal !== undefined) signal.removeEventListener('abort', destroy);
  }

  if (signal !== undefined) {
    if (signal.aborted) destroy();
    else signal.addEventListener('abort', destroy);
  }

  return { element: nav, collapse, dropdowns, destroy };
}
