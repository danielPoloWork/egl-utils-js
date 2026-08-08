// @vitest-environment jsdom
// Example tests (roadmap 16.3, spec 04 §2 items F77-F79, NFR-15/NFR-18/NFR-21,
// ADR-0043) for the overlay and observation set. The carousel carries most of
// the weight, because it is the one that builds: an indicator row is a line of
// identical buttons unless each one names the slide it moves to, and an image
// whose `alt` was merely forgotten reads its file name aloud.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bsCarousel,
  bsOffcanvas,
  bsScrollspy,
} from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

/**
 * A stand-in for Bootstrap's namespace, dispatching the real lifecycle events.
 *
 * @param {string[]} [components]
 * @param {{ async?: boolean }} [config] - With `async`, transitions settle on a
 *   later turn, as an animated one does — which is the only way to observe an
 *   ordering that a synchronous double collapses.
 * @returns {{ namespace: Record<string, unknown>, created: object[] }}
 */
function makeBootstrap(components = ['Offcanvas', 'Carousel', 'ScrollSpy'], config = {}) {
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
        this.calls = [];
        created.push(this);
      }

      /** @param {string} type */
      fire(type) {
        this.element.dispatchEvent(new Event(`${type}.${this.ns}`, { bubbles: true }));
      }

      show() {
        this.shown = true;
        this.fire('show');
        if (config.async === true) queueMicrotask(() => this.fire('shown'));
        else this.fire('shown');
      }

      hide() {
        this.shown = false;
        this.fire('hide');
        if (config.async === true) queueMicrotask(() => this.fire('hidden'));
        else this.fire('hidden');
      }

      toggle() {
        if (this.shown) this.hide();
        else this.show();
      }

      /** @param {number} index */
      to(index) {
        this.calls.push(`to:${index}`);
      }

      prev() {
        this.calls.push('prev');
      }

      next() {
        this.calls.push('next');
      }

      cycle() {
        this.calls.push('cycle');
      }

      pause() {
        this.calls.push('pause');
      }

      refresh() {
        this.calls.push('refresh');
      }

      dispose() {
        this.disposed = true;
      }
    };

  /** @type {Record<string, unknown>} */
  const namespace = {};
  for (const name of components) namespace[name] = make(`bs.${name.toLowerCase()}`);
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

describe('F77 — bsOffcanvas', () => {
  it('drives the instance and forwards its options', () => {
    const { namespace, created } = makeBootstrap();
    const drawer = bsOffcanvas(host(), {
      bootstrap: namespace,
      backdrop: false,
      scroll: true,
      keyboard: false,
    });

    drawer.show();
    expect(created[0].shown).toBe(true);
    expect(created[0].config).toEqual({ backdrop: false, scroll: true, keyboard: false });

    drawer.toggle();
    expect(created[0].shown).toBe(false);
  });

  it('forwards only what the caller set, so Bootstrap keeps its defaults', () => {
    const { namespace, created } = makeBootstrap();
    bsOffcanvas(host(), { bootstrap: namespace }).show();
    expect(created[0].config).toEqual({});
  });

  it('closes before disposing, like every other openable component', () => {
    // The teardown the shared wrapper exists for: disposing an open offcanvas
    // strands Bootstrap's backdrop exactly as it does for a modal.
    const { namespace, created } = makeBootstrap(undefined, { async: true });
    const target = host();
    const drawer = bsOffcanvas(target, { bootstrap: namespace });
    drawer.show();
    target.dispatchEvent(new Event('shown.bs.offcanvas'));

    // The fade is still running, so the wrapper has seen `shown` and not yet
    // `hidden`: disposing here is what strands a backdrop.
    drawer.destroy();
    expect(created[0].disposed).toBe(false);

    target.dispatchEvent(new Event('hidden.bs.offcanvas'));
    expect(created[0].disposed).toBe(true);
  });

  it('subscribes and unsubscribes over bs.offcanvas', () => {
    const { namespace } = makeBootstrap();
    const target = host();
    const drawer = bsOffcanvas(target, { bootstrap: namespace });
    const seen = vi.fn();

    const off = drawer.on('hidden', seen);
    target.dispatchEvent(new Event('hidden.bs.offcanvas'));
    expect(seen).toHaveBeenCalledTimes(1);

    off();
    target.dispatchEvent(new Event('hidden.bs.offcanvas'));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('is destroyed by an aborted signal, and refuses reuse (NFR-15)', () => {
    const { namespace, created } = makeBootstrap();
    const controller = new AbortController();
    const drawer = bsOffcanvas(host(), { bootstrap: namespace, signal: controller.signal });
    drawer.show();
    drawer.hide();

    controller.abort();

    expect(created[0].disposed).toBe(true);
    expect(() => drawer.show()).toThrow(TypeError);
  });

  it('rejects a non-Element target', () => {
    expect(() => bsOffcanvas('#drawer')).toThrow(TypeError);
  });
});

describe('F78 — bsCarousel', () => {
  const items = [{ content: 'One', active: true }, { content: 'Two' }];

  it('builds slides, controls and named indicators', () => {
    const { namespace } = makeBootstrap();
    const gallery = bsCarousel(host(), { items, indicators: true, bootstrap: namespace });

    expect(gallery.element.classList.contains('carousel')).toBe(true);
    expect(gallery.element.id).not.toBe('');

    const slides = gallery.element.querySelectorAll('.carousel-item');
    expect(slides).toHaveLength(2);
    expect(slides[0].classList.contains('active')).toBe(true);
    expect(slides[1].classList.contains('active')).toBe(false);

    // Each indicator points at this carousel and says which slide it moves to —
    // the reason this manager builds rather than only wraps.
    const buttons = gallery.element.querySelectorAll('.carousel-indicators button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-bs-target')).toBe(`#${gallery.element.id}`);
    expect(buttons[0].getAttribute('data-bs-slide-to')).toBe('0');
    expect(buttons[0].getAttribute('aria-label')).toBe('1');
    expect(buttons[0].getAttribute('aria-current')).toBe('true');
    expect(buttons[1].getAttribute('aria-label')).toBe('2');
    expect(buttons[1].hasAttribute('aria-current')).toBe(false);

    const prev = gallery.element.querySelector('.carousel-control-prev');
    expect(prev.getAttribute('data-bs-slide')).toBe('prev');
    expect(prev.querySelector('.visually-hidden').textContent).toBe('Previous');
    expect(prev.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('takes injected labels, and numbers slides by default (NFR-21)', () => {
    const { namespace } = makeBootstrap();
    const gallery = bsCarousel(host(), {
      items,
      indicators: true,
      labels: {
        previous: 'Precedente',
        next: 'Successiva',
        slide: (index, total) => `Foto ${index + 1} di ${total}`,
      },
      bootstrap: namespace,
    });

    expect(
      gallery.element.querySelector('.carousel-control-prev .visually-hidden').textContent,
    ).toBe('Precedente');
    expect(
      gallery.element.querySelector('.carousel-control-next .visually-hidden').textContent,
    ).toBe('Successiva');
    expect(
      gallery.element.querySelector('.carousel-indicators button').getAttribute('aria-label'),
    ).toBe('Foto 1 di 2');
  });

  it('omits controls and indicators unless asked', () => {
    const { namespace } = makeBootstrap();
    const gallery = bsCarousel(host(), { items, controls: false, bootstrap: namespace });

    expect(gallery.element.querySelector('.carousel-control-prev')).toBeNull();
    expect(gallery.element.querySelector('.carousel-indicators button')).toBeNull();
  });

  it('does not start moving on its own unless asked', () => {
    // Autoplay is a motion-accessibility decision, so it stays the caller's.
    const { namespace, created } = makeBootstrap();
    bsCarousel(host(), { items, bootstrap: namespace }).next();
    expect(created[0].config.ride).toBeUndefined();

    bsCarousel(host(), { items, ride: 'carousel', interval: 4000, bootstrap: namespace }).next();
    expect(created.at(-1).config).toMatchObject({ ride: 'carousel', interval: 4000 });
  });

  it('renders an image only when alt declares one', () => {
    const { namespace } = makeBootstrap();
    const gallery = bsCarousel(host(), {
      items: [
        { content: '/one.jpg', alt: 'A harbour', active: true },
        { content: '/two.jpg', alt: '' },
      ],
      bootstrap: namespace,
    });

    const images = gallery.element.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('/one.jpg');
    expect(images[0].getAttribute('alt')).toBe('A harbour');
    // '' is a legitimate declaration — decorative, stated rather than omitted.
    expect(images[1].getAttribute('alt')).toBe('');
  });

  it('escapes slide content and captions by default', () => {
    const { namespace } = makeBootstrap();
    const gallery = bsCarousel(host(), {
      items: [{ content: '<img src=x onerror=alert(1)>', caption: '<b>c</b>' }],
      bootstrap: namespace,
    });

    expect(gallery.element.querySelector('img')).toBeNull();
    expect(gallery.element.querySelector('.carousel-item').textContent).toContain('<img');
    expect(gallery.element.querySelector('.carousel-caption').textContent).toBe('<b>c</b>');
  });

  it('accepts a node as slide content', () => {
    const { namespace } = makeBootstrap();
    const figure = document.createElement('figure');
    const gallery = bsCarousel(host(), { items: [{ content: figure }], bootstrap: namespace });

    expect(gallery.element.querySelector('figure')).toBe(figure);
  });

  it('drives the instance through every method', () => {
    const { namespace, created } = makeBootstrap();
    const gallery = bsCarousel(host(), { items, bootstrap: namespace });

    gallery.next();
    gallery.prev();
    gallery.to(1);
    gallery.cycle();
    gallery.pause();

    expect(created[0].calls).toEqual(['next', 'prev', 'to:1', 'cycle', 'pause']);
    expect(created).toHaveLength(1);
    expect(gallery.instance()).toBe(created[0]);
    expect(() => gallery.to(-1)).toThrow(TypeError);
    expect(() => gallery.to(1.5)).toThrow(TypeError);
  });

  it('adopts existing markup, giving it an id only if it lacks one', () => {
    const { namespace } = makeBootstrap();
    const container = host();
    container.className = 'carousel slide';
    container.innerHTML =
      '<div class="carousel-inner"><div class="carousel-item active"></div></div>';

    const gallery = bsCarousel(container, { bootstrap: namespace });
    expect(gallery.element).toBe(container);
    expect(container.id).not.toBe('');

    const named = host();
    named.id = 'gallery';
    bsCarousel(named, { bootstrap: namespace });
    expect(named.id).toBe('gallery');
  });

  it('subscribes over bs.carousel and tears everything down (NFR-15)', () => {
    const { namespace, created } = makeBootstrap();
    const container = host();
    const gallery = bsCarousel(container, { items, bootstrap: namespace });
    const seen = vi.fn();
    gallery.on('slid', seen);
    gallery.next();

    gallery.element.dispatchEvent(new Event('slid.bs.carousel'));
    expect(seen).toHaveBeenCalledTimes(1);

    gallery.destroy();
    gallery.element.dispatchEvent(new Event('slid.bs.carousel'));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(created[0].disposed).toBe(true);
    expect(container.children).toHaveLength(0);
    expect(() => gallery.next()).toThrow(TypeError);
    expect(() => gallery.on('slid', seen)).toThrow(TypeError);
  });

  it('is destroyed by an aborted signal (NFR-15)', () => {
    const { namespace } = makeBootstrap();
    const controller = new AbortController();
    const container = host();
    bsCarousel(container, { items, bootstrap: namespace, signal: controller.signal });

    controller.abort();
    expect(container.children).toHaveLength(0);
  });

  it('rejects malformed input', () => {
    expect(() => bsCarousel(null)).toThrow(TypeError);
    expect(() => bsCarousel(host(), { items: 'no' })).toThrow(TypeError);
    expect(() => bsCarousel(host(), { items: [null] })).toThrow(/items\[0\]/);
    expect(() => bsCarousel(host(), { items: [{ content: '/a.jpg', alt: 7 }] })).toThrow(
      /alt must be a string/,
    );
    expect(() => bsCarousel(host(), { items: [{ content: 42, alt: 'x' }] })).toThrow(
      /image source string/,
    );
    expect(() => bsCarousel(host(), { items: [], labels: { slide: 'no' } })).toThrow(TypeError);
    expect(() => bsCarousel(host(), { items: [], labels: { previous: '' } })).toThrow(TypeError);
    expect(() => bsCarousel(host(), { items: [], labels: 'no' })).toThrow(TypeError);
    expect(() => bsCarousel(host(), { items: [] }).on('slid', 'not a function')).toThrow(TypeError);
  });
});

describe('F79 — bsScrollspy', () => {
  it('maps nav to Bootstrap’s target config and forwards the rest', () => {
    const { namespace, created } = makeBootstrap();
    const nav = host();
    const spy = bsScrollspy(host(), {
      nav,
      rootMargin: '0px 0px -40%',
      smoothScroll: true,
      bootstrap: namespace,
    });

    spy.refresh();
    expect(created[0].config).toEqual({
      target: nav,
      rootMargin: '0px 0px -40%',
      smoothScroll: true,
    });
    expect(created[0].calls).toEqual(['refresh']);
  });

  it('accepts a selector string for the nav', () => {
    const { namespace, created } = makeBootstrap();
    bsScrollspy(host(), { nav: '#toc', bootstrap: namespace }).refresh();
    expect(created[0].config.target).toBe('#toc');
  });

  it('subscribes to activate, the event it exists to surface', () => {
    const { namespace } = makeBootstrap();
    const target = host();
    const spy = bsScrollspy(target, { bootstrap: namespace });
    const seen = vi.fn();

    const off = spy.on('activate', seen);
    target.dispatchEvent(new Event('activate.bs.scrollspy'));
    expect(seen).toHaveBeenCalledTimes(1);

    off();
    target.dispatchEvent(new Event('activate.bs.scrollspy'));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('has no open state, and disposes immediately on destroy', () => {
    // Nothing to close first: this is the component the shared wrapper does not
    // model, and the reason it is written plainly.
    const { namespace, created } = makeBootstrap();
    const spy = bsScrollspy(host(), { bootstrap: namespace });
    spy.refresh();

    spy.destroy();

    expect(created[0].disposed).toBe(true);
    expect(() => spy.refresh()).toThrow(TypeError);
    expect(() => spy.on('activate', () => {})).toThrow(TypeError);
    expect(() => spy.destroy()).not.toThrow();
  });

  it('is destroyed by an aborted signal, before and after construction (NFR-15)', () => {
    const { namespace, created } = makeBootstrap();
    const controller = new AbortController();
    const spy = bsScrollspy(host(), { bootstrap: namespace, signal: controller.signal });
    spy.refresh();
    controller.abort();
    expect(created[0].disposed).toBe(true);

    const born = bsScrollspy(host(), { bootstrap: namespace, signal: AbortSignal.abort() });
    expect(() => born.refresh()).toThrow(TypeError);
  });

  it('survives an instance with no refresh()', () => {
    const ScrollSpy = class {
      dispose() {}
    };
    expect(() => bsScrollspy(host(), { bootstrap: { ScrollSpy } }).refresh()).not.toThrow();
  });

  it('rejects malformed input', () => {
    expect(() => bsScrollspy(null)).toThrow(TypeError);
    expect(() => bsScrollspy(host(), { nav: 42 })).toThrow(TypeError);
    expect(() => bsScrollspy(host(), { bootstrap: {} }).on('activate', 'no')).toThrow(TypeError);
  });
});

describe('NFR-18 — the peer is still resolved at the operation', () => {
  it('builds a carousel with no peer, and fails typed on every driver', () => {
    const container = host();
    const gallery = bsCarousel(container, { items: [{ content: 'a' }], indicators: true });
    const drawer = bsOffcanvas(host());
    const spy = bsScrollspy(host());

    // Built already, with no peer anywhere.
    expect(container.querySelector('.carousel-item')).not.toBeNull();
    expect(container.querySelector('.carousel-indicators button')).not.toBeNull();

    for (const act of [() => gallery.next(), () => drawer.show(), () => spy.refresh()]) {
      let caught;
      try {
        act();
      } catch (error) {
        caught = error;
      }
      expect(caught?.code).toBe('EGL_PEER_MISSING');
    }
  });

  it('names the component missing from a partial namespace', () => {
    const spy = bsScrollspy(host(), { bootstrap: { Carousel: class {} } });
    expect(() => spy.refresh()).toThrow(/bootstrap\.ScrollSpy/);
  });
});
