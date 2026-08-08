// @vitest-environment jsdom
// Example tests (roadmap 16.2, spec 04 §2 items F72-F76, NFR-15/NFR-18/NFR-21,
// ADR-0042) for the Bootstrap navigation set. Most of the weight is on the ARIA
// relationships the managers build — `aria-controls` and `aria-labelledby`
// pointing at ids that exist and belong to the right node — because that is the
// thing hand-written navigation markup gets wrong, and the reason these three
// build rather than only wrap.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bsAccordion,
  bsCollapse,
  bsDropdown,
  bsNavbar,
  bsTabs,
} from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

/**
 * A stand-in for Bootstrap's namespace, dispatching the real lifecycle events.
 *
 * @param {string[]} [components]
 * @returns {{ namespace: Record<string, unknown>, created: object[] }}
 */
function makeBootstrap(components = ['Collapse', 'Dropdown', 'Tab']) {
  const created = [];

  /** @param {string} ns */
  const make = (ns) =>
    class Fake {
      /**
       * @param {Element} element
       * @param {Record<string, unknown>} [config]
       */
      constructor(element, config) {
        this.element = element;
        this.config = config ?? {};
        this.ns = ns;
        this.shown = false;
        this.disposed = false;
        created.push(this);
      }

      /** @param {string} type */
      fire(type) {
        this.element.dispatchEvent(new Event(`${type}.${this.ns}`, { bubbles: true }));
      }

      show() {
        this.shown = true;
        this.fire('show');
        this.fire('shown');
      }

      hide() {
        this.shown = false;
        this.fire('hide');
        this.fire('hidden');
      }

      toggle() {
        if (this.shown) this.hide();
        else this.show();
      }

      update() {
        this.updated = true;
      }

      dispose() {
        this.disposed = true;
      }
    };

  /** @type {Record<string, unknown>} */
  const namespace = {};
  for (const name of components) {
    namespace[name] = make(`bs.${name.toLowerCase()}`);
  }
  return { namespace, created };
}

/** @returns {Element} */
function host() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('F72 — bsCollapse', () => {
  it('wires a toggler to the target and keeps aria-expanded truthful', () => {
    const { namespace } = makeBootstrap();
    const target = host();
    const toggler = host();

    const panel = bsCollapse(target, { toggler, bootstrap: namespace });

    // The target got an id so the toggler could point at it.
    expect(target.id).not.toBe('');
    expect(toggler.getAttribute('aria-controls')).toBe(target.id);
    expect(toggler.getAttribute('aria-expanded')).toBe('false');
    expect(toggler.classList.contains('collapsed')).toBe(true);

    toggler.dispatchEvent(new Event('click'));
    expect(toggler.getAttribute('aria-expanded')).toBe('true');
    expect(toggler.classList.contains('collapsed')).toBe(false);

    panel.hide();
    expect(toggler.getAttribute('aria-expanded')).toBe('false');
  });

  it('reads its initial state from the markup rather than assuming closed', () => {
    const { namespace } = makeBootstrap();
    const target = host();
    target.classList.add('show');
    const toggler = host();

    bsCollapse(target, { toggler, bootstrap: namespace });

    expect(toggler.getAttribute('aria-expanded')).toBe('true');
    expect(toggler.classList.contains('collapsed')).toBe(false);
  });

  it('keeps an id the markup already had', () => {
    const { namespace } = makeBootstrap();
    const target = host();
    target.id = 'details';
    const toggler = host();

    bsCollapse(target, { toggler, bootstrap: namespace });

    expect(target.id).toBe('details');
    expect(toggler.getAttribute('aria-controls')).toBe('details');
  });

  it('does not toggle on construction, unlike Bootstrap default', () => {
    // Resolution is lazy, so the constructor runs at the first call; a config
    // toggle there would fire twice.
    const { namespace, created } = makeBootstrap();
    const panel = bsCollapse(host(), { bootstrap: namespace });
    panel.show();

    expect(created[0].config.toggle).toBe(false);
  });

  it('detaches the toggler on destroy (NFR-15)', () => {
    const { namespace } = makeBootstrap();
    const target = host();
    const toggler = host();
    const panel = bsCollapse(target, { toggler, bootstrap: namespace });

    panel.destroy();
    toggler.dispatchEvent(new Event('click'));

    // The click did nothing: no state change, and the wrapper refuses reuse.
    expect(toggler.getAttribute('aria-expanded')).toBe('false');
    expect(() => panel.show()).toThrow(TypeError);
  });

  it('rejects malformed targets and options', () => {
    expect(() => bsCollapse(null)).toThrow(TypeError);
    expect(() => bsCollapse(host(), { toggler: '#x' })).toThrow(TypeError);
    expect(() => bsCollapse(host(), { parent: 'x' })).toThrow(TypeError);
  });
});

describe('F73 — bsAccordion', () => {
  /** @returns {import('vitest').TestAPI extends never ? never : any} */
  const build = (namespace, extra = {}) =>
    bsAccordion(host(), {
      items: [
        { header: 'One', body: 'First', open: true },
        { header: 'Two', body: 'Second' },
      ],
      bootstrap: namespace,
      ...extra,
    });

  it('builds the full ARIA triangle over ids that exist', () => {
    const { namespace } = makeBootstrap();
    const accordion = build(namespace);

    const items = accordion.element.querySelectorAll('.accordion-item');
    expect(items).toHaveLength(2);

    for (const item of items) {
      const button = item.querySelector('.accordion-button');
      const pane = item.querySelector('.accordion-collapse');
      const header = item.querySelector('.accordion-header');

      // Each half points at the other, and both targets resolve.
      expect(button.getAttribute('aria-controls')).toBe(pane.id);
      expect(pane.getAttribute('aria-labelledby')).toBe(header.id);
      expect(document.getElementById(pane.id)).toBe(pane);
      expect(document.getElementById(header.id)).toBe(header);
    }

    const [first, second] = items;
    expect(first.querySelector('.accordion-button').getAttribute('aria-expanded')).toBe('true');
    expect(first.querySelector('.accordion-collapse').classList.contains('show')).toBe(true);
    expect(second.querySelector('.accordion-button').getAttribute('aria-expanded')).toBe('false');
    expect(second.querySelector('.accordion-button').classList.contains('collapsed')).toBe(true);
  });

  it('mints ids that do not collide with ones already in the document', () => {
    // The reason ids are asked of the document rather than of a counter: a
    // second library instance, or the host's own markup, may have taken them.
    const squatter = document.createElement('div');
    squatter.id = 'egl-accordion-1';
    document.body.append(squatter);

    const { namespace } = makeBootstrap();
    const accordion = build(namespace);

    expect(accordion.element.id).not.toBe('egl-accordion-1');
    expect(document.getElementById('egl-accordion-1')).toBe(squatter);
  });

  it('escapes header and body by default', () => {
    const { namespace } = makeBootstrap();
    const accordion = bsAccordion(host(), {
      items: [{ header: '<b>h</b>', body: '<img src=x onerror=alert(1)>' }],
      bootstrap: namespace,
    });

    expect(accordion.element.querySelector('.accordion-button').textContent).toBe('<b>h</b>');
    expect(accordion.element.querySelector('img')).toBeNull();
  });

  it('scopes items to the accordion unless alwaysOpen', () => {
    const { namespace, created } = makeBootstrap();
    const accordion = build(namespace);
    accordion.open(0);

    expect(created[0].config.parent).toBe(accordion.element);

    const other = build(namespace, { alwaysOpen: true });
    other.open(0);
    expect(created.at(-1).config.parent).toBeUndefined();
  });

  it('exposes one collapse wrapper per item, and drives them by index', () => {
    const { namespace } = makeBootstrap();
    const accordion = build(namespace);

    expect(accordion.items).toHaveLength(2);
    accordion.open(1);
    expect(accordion.items[1].isShown()).toBe(true);
    accordion.close(1);
    expect(accordion.items[1].isShown()).toBe(false);
    accordion.toggle(1);
    expect(accordion.items[1].isShown()).toBe(true);

    expect(() => accordion.open(5)).toThrow(/no item at index 5/);
  });

  it('subscribes once for every item, because collapse events bubble', () => {
    const { namespace } = makeBootstrap();
    const accordion = build(namespace);
    const seen = vi.fn();

    const off = accordion.on('shown', seen);
    accordion.open(0);
    accordion.open(1);
    expect(seen).toHaveBeenCalledTimes(2);

    off();
    accordion.open(0);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('adopts existing markup when given no items', () => {
    const { namespace } = makeBootstrap();
    const container = host();
    container.innerHTML = `
      <div class="accordion-item">
        <h2 class="accordion-header" id="h1"><button class="accordion-button collapsed"></button></h2>
        <div id="p1" class="accordion-collapse collapse" aria-labelledby="h1"></div>
      </div>`;

    const accordion = bsAccordion(container, { bootstrap: namespace });

    expect(accordion.items).toHaveLength(1);
    // Adoption wires the same relationship the builder would have written.
    expect(container.querySelector('.accordion-button').getAttribute('aria-controls')).toBe('p1');
  });

  it('removes what it built on destroy, and leaves what it adopted', () => {
    const { namespace } = makeBootstrap();
    const container = host();
    const built = bsAccordion(container, {
      items: [{ header: 'a', body: 'b' }],
      bootstrap: namespace,
    });
    built.destroy();
    expect(container.children).toHaveLength(0);
    expect(() => built.open(0)).toThrow(TypeError);

    const adoptedHost = host();
    adoptedHost.innerHTML =
      '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button"></button></h2><div class="accordion-collapse collapse"></div></div>';
    bsAccordion(adoptedHost, { bootstrap: namespace }).destroy();
    expect(adoptedHost.children).toHaveLength(1);
  });

  it('is destroyed by an aborted signal (NFR-15)', () => {
    const { namespace } = makeBootstrap();
    const controller = new AbortController();
    const container = host();
    bsAccordion(container, {
      items: [{ header: 'a', body: 'b' }],
      bootstrap: namespace,
      signal: controller.signal,
    });

    controller.abort();
    expect(container.children).toHaveLength(0);
  });

  it('rejects malformed input', () => {
    const { namespace } = makeBootstrap();
    expect(() => bsAccordion(null)).toThrow(TypeError);
    expect(() => bsAccordion(host(), { items: 'nope' })).toThrow(TypeError);
    expect(() => bsAccordion(host(), { items: [null] })).toThrow(/items\[0\]/);
    expect(() => build(namespace).on('shown', 'not a function')).toThrow(TypeError);

    const destroyed = build(namespace);
    destroyed.destroy();
    expect(() => destroyed.on('shown', () => {})).toThrow(TypeError);
  });
});

describe('F74 — bsDropdown', () => {
  it('drives the instance and forwards autoClose', () => {
    const { namespace, created } = makeBootstrap();
    const menu = bsDropdown(host(), { bootstrap: namespace, autoClose: 'outside' });

    menu.show();
    expect(created[0].shown).toBe(true);
    expect(created[0].config.autoClose).toBe('outside');
  });

  it('exposes update(), the reason the wrapper earns its place', () => {
    const { namespace, created } = makeBootstrap();
    const menu = bsDropdown(host(), { bootstrap: namespace });

    menu.update();
    expect(created[0].updated).toBe(true);
  });

  it('survives a namespace whose instance has no update()', () => {
    const Dropdown = class {
      show() {}
      dispose() {}
    };
    const menu = bsDropdown(host(), { bootstrap: { Dropdown } });
    expect(() => menu.update()).not.toThrow();
  });

  it('rejects a non-Element toggler', () => {
    expect(() => bsDropdown('#menu')).toThrow(TypeError);
  });
});

describe('F75 — bsTabs', () => {
  const tabs = [
    { label: 'One', pane: 'First', active: true },
    { label: 'Two', pane: 'Second' },
  ];

  it('builds a tablist whose every relationship resolves', () => {
    const { namespace } = makeBootstrap();
    const instance = bsTabs(host(), { tabs, bootstrap: namespace });

    const list = instance.element.querySelector('.nav');
    expect(list.getAttribute('role')).toBe('tablist');
    expect(list.classList.contains('nav-tabs')).toBe(true);

    const triggers = instance.element.querySelectorAll('[role="tab"]');
    const panes = instance.element.querySelectorAll('[role="tabpanel"]');
    expect(triggers).toHaveLength(2);
    expect(panes).toHaveLength(2);

    for (const [index, trigger] of triggers.entries()) {
      const pane = panes[index];
      expect(trigger.getAttribute('aria-controls')).toBe(pane.id);
      expect(pane.getAttribute('aria-labelledby')).toBe(trigger.id);
      expect(document.getElementById(pane.id)).toBe(pane);
      // A panel must be reachable from the keyboard even with no focusable
      // content inside it.
      expect(pane.getAttribute('tabindex')).toBe('0');
    }

    expect(triggers[0].getAttribute('aria-selected')).toBe('true');
    expect(triggers[1].getAttribute('aria-selected')).toBe('false');
    expect(panes[0].classList.contains('active')).toBe(true);
    expect(panes[0].classList.contains('fade')).toBe(true);
  });

  it('renders pills and disabled tabs', () => {
    const { namespace } = makeBootstrap();
    const instance = bsTabs(host(), {
      tabs: [
        { label: 'a', pane: 'A' },
        { label: 'b', pane: 'B', disabled: true },
      ],
      kind: 'pills',
      fade: false,
      bootstrap: namespace,
    });

    expect(instance.element.querySelector('.nav').classList.contains('nav-pills')).toBe(true);
    const [, second] = instance.element.querySelectorAll('[role="tab"]');
    expect(second.classList.contains('disabled')).toBe(true);
    expect(second.hasAttribute('disabled')).toBe(true);
    expect(instance.element.querySelector('.tab-pane').classList.contains('fade')).toBe(false);
  });

  it('escapes labels and panes by default', () => {
    const { namespace } = makeBootstrap();
    const instance = bsTabs(host(), {
      tabs: [{ label: '<b>x</b>', pane: '<img src=x onerror=alert(1)>' }],
      bootstrap: namespace,
    });

    expect(instance.element.querySelector('[role="tab"]').textContent).toBe('<b>x</b>');
    expect(instance.element.querySelector('img')).toBeNull();
  });

  it('accepts a node as a pane', () => {
    const { namespace } = makeBootstrap();
    const pane = document.createElement('form');
    const instance = bsTabs(host(), { tabs: [{ label: 'f', pane }], bootstrap: namespace });

    expect(instance.element.querySelector('form')).toBe(pane);
  });

  it('selects through Bootstrap Tab, and refuses an index that is not there', () => {
    const { namespace, created } = makeBootstrap();
    const instance = bsTabs(host(), { tabs, bootstrap: namespace });

    instance.select(1);
    expect(created).toHaveLength(1);
    expect(created[0].element).toBe(instance.triggers[1]);
    expect(created[0].shown).toBe(true);

    expect(() => instance.select(9)).toThrow(/no tab at index 9/);
  });

  it('subscribes over bs.tab and unsubscribes', () => {
    const { namespace } = makeBootstrap();
    const instance = bsTabs(host(), { tabs, bootstrap: namespace });
    const seen = vi.fn();

    const off = instance.on('shown', seen);
    instance.select(1);
    expect(seen).toHaveBeenCalledTimes(1);

    off();
    instance.select(0);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('adopts existing markup when given no tabs', () => {
    const { namespace } = makeBootstrap();
    const container = host();
    container.innerHTML =
      '<button data-bs-toggle="tab" id="t1"></button><button data-bs-toggle="tab" id="t2"></button>';

    const instance = bsTabs(container, { bootstrap: namespace });

    expect(instance.triggers).toHaveLength(2);
    instance.select(0);
    expect(instance.element).toBe(container);
  });

  it('disposes every instance it made and removes what it built (NFR-15)', () => {
    const { namespace, created } = makeBootstrap();
    const container = host();
    const instance = bsTabs(container, { tabs, bootstrap: namespace });
    instance.select(1);

    instance.destroy();

    expect(created[0].disposed).toBe(true);
    expect(container.children).toHaveLength(0);
    expect(() => instance.select(0)).toThrow(TypeError);
  });

  it('rejects malformed input', () => {
    expect(() => bsTabs(null)).toThrow(TypeError);
    expect(() => bsTabs(host(), { tabs: 'no' })).toThrow(TypeError);
    expect(() => bsTabs(host(), { tabs: [null] })).toThrow(/tabs\[0\]/);
    expect(() => bsTabs(host(), { tabs: [], kind: 'bad kind' })).toThrow(TypeError);
    expect(() => bsTabs(host(), { tabs: [], document: 'nope' })).toThrow(TypeError);
    expect(() => bsTabs(host(), { tabs, bootstrap: {} }).on('shown', 'no')).toThrow(TypeError);
  });

  it('refuses to subscribe after destroy, and honours an aborted signal', () => {
    const { namespace } = makeBootstrap();
    const container = host();
    const instance = bsTabs(container, { tabs, bootstrap: namespace });
    instance.destroy();
    expect(() => instance.on('shown', () => {})).toThrow(TypeError);

    const other = host();
    bsTabs(other, { tabs, bootstrap: namespace, signal: AbortSignal.abort() });
    expect(other.children).toHaveLength(0);

    const controller = new AbortController();
    const third = host();
    bsTabs(third, { tabs, bootstrap: namespace, signal: controller.signal });
    controller.abort();
    expect(third.children).toHaveLength(0);
  });

  it('builds in an explicitly supplied document', () => {
    // The iframe/server-render path: nodes must belong to the document that was
    // named, not to the ambient one.
    const foreign = document.implementation.createHTMLDocument('other');
    const container = foreign.createElement('div');
    foreign.body.append(container);

    const instance = bsTabs(container, {
      tabs: [{ label: 'a', pane: 'A' }],
      document: foreign,
      bootstrap: makeBootstrap().namespace,
    });

    expect(instance.element.ownerDocument).toBe(foreign);
    expect(foreign.querySelector('[role="tablist"]')).not.toBeNull();
  });
});

describe('F76 — bsNavbar', () => {
  it('composes brand, items, toggler and the collapsible region', () => {
    const { namespace } = makeBootstrap();
    const nav = bsNavbar(host(), {
      brand: 'Acme',
      items: [
        { label: 'Home', href: '/', active: true },
        { label: 'Docs', href: '/docs' },
      ],
      bootstrap: namespace,
    });

    expect(nav.element.tagName).toBe('NAV');
    expect(nav.element.classList.contains('navbar-expand-lg')).toBe(true);
    expect(nav.element.querySelector('.navbar-brand').textContent).toBe('Acme');

    const toggler = nav.element.querySelector('.navbar-toggler');
    const region = nav.element.querySelector('.navbar-collapse');
    // The toggler names the region it actually controls.
    expect(toggler.getAttribute('aria-controls')).toBe(region.id);
    expect(toggler.getAttribute('aria-expanded')).toBe('false');
    expect(toggler.getAttribute('aria-label')).toBe('Toggle navigation');

    const [home] = nav.element.querySelectorAll('.nav-link');
    expect(home.getAttribute('aria-current')).toBe('page');
  });

  it('opens the region through its own collapse wrapper', () => {
    const { namespace } = makeBootstrap();
    const nav = bsNavbar(host(), { items: [{ label: 'a' }], bootstrap: namespace });
    const toggler = nav.element.querySelector('.navbar-toggler');

    toggler.dispatchEvent(new Event('click'));

    expect(toggler.getAttribute('aria-expanded')).toBe('true');
    expect(nav.collapse.isShown()).toBe(true);
  });

  it('renders children as a managed dropdown', () => {
    const { namespace } = makeBootstrap();
    const nav = bsNavbar(host(), {
      items: [{ label: 'More', children: [{ label: 'Settings', href: '/s', active: true }] }],
      bootstrap: namespace,
    });

    const item = nav.element.querySelector('.nav-item');
    expect(item.classList.contains('dropdown')).toBe(true);
    const toggle = item.querySelector('.dropdown-toggle');
    expect(toggle.getAttribute('data-bs-toggle')).toBe('dropdown');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(item.querySelector('.dropdown-item').getAttribute('aria-current')).toBe('page');
    // Managed, not just markup: the F74 wrapper is exposed.
    expect(nav.dropdowns).toHaveLength(1);
  });

  it('marks a disabled item for assistive technology, not only visually', () => {
    const { namespace } = makeBootstrap();
    const nav = bsNavbar(host(), {
      items: [{ label: 'Soon', disabled: true }],
      bootstrap: namespace,
    });

    const link = nav.element.querySelector('.nav-link');
    expect(link.classList.contains('disabled')).toBe(true);
    expect(link.getAttribute('aria-disabled')).toBe('true');
  });

  it('escapes brand and labels by default', () => {
    const { namespace } = makeBootstrap();
    const nav = bsNavbar(host(), {
      brand: '<b>A</b>',
      items: [{ label: '<img src=x onerror=alert(1)>' }],
      bootstrap: namespace,
    });

    expect(nav.element.querySelector('.navbar-brand').textContent).toBe('<b>A</b>');
    expect(nav.element.querySelector('img')).toBeNull();
  });

  it('honours placement, variant and an injected toggler label', () => {
    const { namespace } = makeBootstrap();
    const nav = bsNavbar(host(), {
      placement: 'fixed-top',
      variant: 'dark',
      expand: false,
      togglerLabel: 'Apri menu',
      bootstrap: namespace,
    });

    expect(nav.element.classList.contains('fixed-top')).toBe(true);
    expect(nav.element.classList.contains('bg-dark')).toBe(true);
    expect([...nav.element.classList].some((c) => c.startsWith('navbar-expand'))).toBe(false);
    expect(nav.element.querySelector('.navbar-toggler').getAttribute('aria-label')).toBe(
      'Apri menu',
    );
  });

  it('tears down the navbar, its collapse and every dropdown (NFR-15)', () => {
    const { namespace } = makeBootstrap();
    const container = host();
    const nav = bsNavbar(container, {
      items: [{ label: 'More', children: [{ label: 'One' }] }],
      bootstrap: namespace,
    });
    const toggler = nav.element.querySelector('.navbar-toggler');

    nav.destroy();

    expect(container.children).toHaveLength(0);
    toggler.dispatchEvent(new Event('click'));
    expect(toggler.getAttribute('aria-expanded')).toBe('false');
    expect(() => nav.dropdowns[0].show()).toThrow(TypeError);
  });

  it('is destroyed by an aborted signal (NFR-15)', () => {
    const { namespace } = makeBootstrap();
    const controller = new AbortController();
    const container = host();
    bsNavbar(container, { items: [], bootstrap: namespace, signal: controller.signal });

    controller.abort();
    expect(container.children).toHaveLength(0);
  });

  it('rejects malformed input', () => {
    expect(() => bsNavbar(null)).toThrow(TypeError);
    expect(() => bsNavbar(host(), { items: 'no' })).toThrow(TypeError);
    expect(() => bsNavbar(host(), { items: [null] })).toThrow(/items\[0\]/);
    expect(() => bsNavbar(host(), { togglerLabel: '' })).toThrow(TypeError);
    expect(() => bsNavbar(host(), { items: [{ label: 'a', children: [null] }] })).toThrow(
      /children\[0\]/,
    );
  });
});

describe('NFR-18 — the peer is still resolved at the operation', () => {
  it('constructs every navigation component with no peer, and fails typed on use', () => {
    // The markup half needs a document and nothing else; only driving needs
    // Bootstrap. Proved per component, since each resolves a different one.
    const container = host();
    const collapse = bsCollapse(host());
    const accordion = bsAccordion(container, { items: [{ header: 'a', body: 'b' }] });
    const dropdown = bsDropdown(host());
    const tabsInstance = bsTabs(host(), { tabs: [{ label: 'a', pane: 'A' }] });
    const nav = bsNavbar(host(), { items: [{ label: 'a' }] });

    // The building already happened, with no peer anywhere.
    expect(container.querySelector('.accordion-item')).not.toBeNull();
    expect(nav.element.querySelector('.navbar-toggler')).not.toBeNull();

    for (const act of [
      () => collapse.show(),
      () => accordion.open(0),
      () => dropdown.show(),
      () => tabsInstance.select(0),
      () => nav.collapse.show(),
    ]) {
      let caught;
      try {
        act();
      } catch (error) {
        caught = error;
      }
      expect(caught?.code).toBe('EGL_PEER_MISSING');
    }
  });

  it('names the component that is missing from a partial namespace', () => {
    const instance = bsTabs(host(), {
      tabs: [{ label: 'a', pane: 'A' }],
      bootstrap: { Collapse: class {} },
    });
    expect(() => instance.select(0)).toThrow(/bootstrap\.Tab/);
  });
});
