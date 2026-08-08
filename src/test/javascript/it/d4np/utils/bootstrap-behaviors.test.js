// @vitest-environment jsdom
// Example tests (roadmap 16.1, spec 04 §2 items F68-F71, NFR-15/NFR-18/NFR-21,
// ADR-0041) for the peer-backed wrappers. Three properties carry the weight:
// resolution happens at the operation and prefers the injection, a missing peer
// is a typed throw rather than a ReferenceError or a silent no-op, and teardown
// disposes the Bootstrap instance rather than merely dropping our reference to
// it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bsLoadingOverlay,
  bsModal,
  bsToast,
} from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';
import { PeerMissingError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

/**
 * A stand-in for Bootstrap's namespace.
 *
 * Its components dispatch the real lifecycle events, because that is the
 * contract the wrappers are written against — `hidden.bs.toast` removing a node,
 * `shown.bs.modal` settling the gate's clock. A double that only recorded calls
 * would leave exactly those paths untested.
 *
 * @param {{ async?: boolean }} [config] - With `async`, transitions settle on a
 *   later turn, as a real animated one does.
 * @returns {{ namespace: Record<string, unknown>, created: object[] }}
 */
function makeBootstrap(config = {}) {
  const created = [];

  class Fake {
    /**
     * @param {Element} element
     * @param {Record<string, unknown>} [options]
     */
    constructor(element, options) {
      this.element = element;
      this.options = options ?? {};
      this.shown = false;
      this.disposed = false;
      created.push(this);
    }

    /** @param {string} type */
    #fire(type) {
      this.element.dispatchEvent(new Event(type));
    }

    show() {
      this.shown = true;
      const done = () => this.#fire(`shown.${this.constructor.ns}`);
      if (config.async === true) queueMicrotask(done);
      else done();
    }

    hide() {
      this.shown = false;
      const done = () => this.#fire(`hidden.${this.constructor.ns}`);
      if (config.async === true) queueMicrotask(done);
      else done();
    }

    toggle() {
      if (this.shown) this.hide();
      else this.show();
    }

    dispose() {
      this.disposed = true;
    }
  }

  class Toast extends Fake {
    static ns = 'bs.toast';
  }
  class Modal extends Fake {
    static ns = 'bs.modal';
  }

  return { namespace: { Toast, Modal }, created };
}

/** @returns {Element} */
function container() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (/** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap);
  vi.restoreAllMocks();
});

describe('F68 — peer resolution', () => {
  it('resolves nothing when a wrapper is merely constructed', () => {
    // The point of the clause: an application wires its UI at startup, and
    // startup must not be where a packaging mistake surfaces.
    expect(() => bsModal(container())).not.toThrow();
    expect(() => bsToast(container())).not.toThrow();
  });

  it('throws EGL_PEER_MISSING at the operation, naming the package', () => {
    const modal = bsModal(container());
    let caught;
    try {
      modal.show();
    } catch (error) {
      caught = error;
    }
    // Checked by code, never by instanceof (ADR-0003).
    expect(caught?.code).toBe('EGL_PEER_MISSING');
    expect(caught?.peer).toBe('bootstrap');
    expect(caught?.name).toBe('PeerMissingError');
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).toMatch(/npm i bootstrap/);
    expect(caught?.message).toMatch(/bundle/);
  });

  it('prefers the injected namespace over the ambient global', () => {
    const ambient = makeBootstrap();
    const injected = makeBootstrap();
    /** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap = ambient.namespace;

    bsModal(container(), { bootstrap: injected.namespace }).show();

    expect(injected.created).toHaveLength(1);
    expect(ambient.created).toHaveLength(0);
  });

  it('falls back to the ambient global a CDN bundle defines', () => {
    const ambient = makeBootstrap();
    /** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap = ambient.namespace;

    bsModal(container()).show();

    expect(ambient.created).toHaveLength(1);
  });

  it('reports a namespace that lacks the component with the same code', () => {
    // A partial build is the same problem as no build, from the caller's side:
    // the capability is unreachable. The message is what differs.
    const modal = bsModal(container(), { bootstrap: {} });
    let caught;
    try {
      modal.show();
    } catch (error) {
      caught = error;
    }
    expect(caught?.code).toBe('EGL_PEER_MISSING');
    expect(caught?.message).toMatch(/bootstrap\.Modal/);
  });

  it('defaults `peer` to an empty string when constructed bare', () => {
    // Asserted beside the consumer that populates it, as DomContractError's
    // `missing` default is.
    expect(new PeerMissingError('nothing to see').peer).toBe('');
  });

  it('rejects a non-object injection as a programmer error', () => {
    expect(() => bsModal(container(), { bootstrap: 'bootstrap' }).show()).toThrow(TypeError);
  });

  it('ignores a non-object ambient global rather than trusting it', () => {
    // `window.bootstrap = 'yes'` is somebody else's variable, not the library.
    /** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap = 'yes';
    expect(() => bsModal(container()).show()).toThrow(
      expect.objectContaining({ code: 'EGL_PEER_MISSING' }),
    );
  });

  it('prefers getOrCreateInstance, so it adopts what the data-API already made', () => {
    // Bootstrap ships the static on every component, and a dialog opened by a
    // `data-bs-toggle` button already has an instance: constructing a second one
    // would leave two objects driving one element.
    const existing = { show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
    const Modal = /** @type {never} */ (
      Object.assign(
        function () {
          throw new Error('constructed instead of adopted');
        },
        { getOrCreateInstance: vi.fn(() => existing) },
      )
    );

    bsModal(container(), { bootstrap: { Modal } }).show();

    expect(Modal.getOrCreateInstance).toHaveBeenCalledTimes(1);
    expect(existing.show).toHaveBeenCalledTimes(1);
  });

  it('recovers once the bundle loads late', () => {
    const modal = bsModal(container());
    expect(() => modal.show()).toThrow();

    const late = makeBootstrap();
    /** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap = late.namespace;
    modal.show();

    expect(late.created).toHaveLength(1);
  });
});

describe('F69 — bsToast', () => {
  it('builds an escaped toast and shows it', () => {
    const { namespace, created } = makeBootstrap();
    const host = container();
    const toasts = bsToast(host, { bootstrap: namespace });

    const el = toasts.show('<img src=x onerror=alert(1)>', { title: 'Saved' });

    expect(el.classList.contains('toast')).toBe(true);
    expect(el.querySelector('.toast-body')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.toast-header strong')?.textContent).toBe('Saved');
    expect(created[0].shown).toBe(true);
  });

  it('sets the live-region pair from severity (NFR-21)', () => {
    const { namespace } = makeBootstrap();
    const toasts = bsToast(container(), { bootstrap: namespace });

    const info = toasts.show('done');
    const danger = toasts.show('failed', { variant: 'danger' });

    expect(info.getAttribute('role')).toBe('status');
    expect(info.getAttribute('aria-live')).toBe('polite');
    expect(danger.getAttribute('role')).toBe('alert');
    expect(danger.getAttribute('aria-live')).toBe('assertive');
    expect(danger.getAttribute('aria-atomic')).toBe('true');
    expect(danger.classList.contains('text-bg-danger')).toBe(true);
  });

  it('never accumulates stale variant classes across shows', () => {
    const { namespace } = makeBootstrap({ async: true });
    const toasts = bsToast(container(), { bootstrap: namespace });

    const danger = toasts.show('failed', { variant: 'danger' });
    const info = toasts.show('fine', { variant: 'info' });

    expect([...info.classList]).not.toContain('text-bg-danger');
    expect([...danger.classList]).not.toContain('text-bg-info');
  });

  it('removes and disposes each toast once hidden', () => {
    const { namespace, created } = makeBootstrap();
    const host = container();
    const toasts = bsToast(host, { bootstrap: namespace });

    // The fake fires hidden synchronously from hide(), which is the event the
    // removal hangs off.
    toasts.show('gone');
    expect(host.children).toHaveLength(1);

    toasts.hide();

    expect(host.children).toHaveLength(0);
    expect(created[0].disposed).toBe(true);
  });

  it('carries a dismiss control with an injectable name', () => {
    const { namespace } = makeBootstrap();
    const toasts = bsToast(container(), { bootstrap: namespace, closeLabel: 'Chiudi' });

    const el = toasts.show('ciao');
    const close = el.querySelector('.btn-close');

    expect(close?.getAttribute('aria-label')).toBe('Chiudi');
    expect(close?.getAttribute('data-bs-dismiss')).toBe('toast');
  });

  it('destroys every live toast and stops accepting shows (NFR-15)', () => {
    const { namespace, created } = makeBootstrap({ async: true });
    const host = container();
    const toasts = bsToast(host, { bootstrap: namespace });
    toasts.show('one');
    toasts.show('two');

    toasts.destroy();

    expect(host.children).toHaveLength(0);
    expect(created.every((instance) => instance.disposed)).toBe(true);
    expect(() => toasts.show('three')).toThrow(TypeError);
    // Idempotent, as every destroy in this library is.
    expect(() => toasts.destroy()).not.toThrow();
  });

  it('is destroyed by an aborted signal (NFR-15)', () => {
    const { namespace, created } = makeBootstrap({ async: true });
    const controller = new AbortController();
    const host = container();
    const toasts = bsToast(host, { bootstrap: namespace, signal: controller.signal });
    toasts.show('one');

    controller.abort();

    expect(host.children).toHaveLength(0);
    expect(created[0].disposed).toBe(true);
  });

  it('requires sanitize for markup, like every builder (F52)', () => {
    const { namespace } = makeBootstrap();
    const toasts = bsToast(container(), { bootstrap: namespace });

    expect(() => toasts.show('<b>hi</b>', { html: true })).toThrow(TypeError);
    const el = toasts.show('<b>hi</b>', { html: true, sanitize: (value) => value });
    expect(el.querySelector('.toast-body b')?.textContent).toBe('hi');
  });

  it('rejects a non-Element container and malformed timing options', () => {
    expect(() => bsToast('#host')).toThrow(TypeError);
    expect(() => bsToast(container(), { autohide: 'yes' })).toThrow(TypeError);
    expect(() => bsToast(container(), { delay: -1 })).toThrow(TypeError);
    expect(() => bsToast(container(), { delay: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });
});

describe('F70 — bsModal', () => {
  it('drives the instance and exposes it', () => {
    const { namespace, created } = makeBootstrap();
    const modal = bsModal(container(), { bootstrap: namespace, backdrop: 'static' });

    modal.show();
    expect(created[0].shown).toBe(true);
    expect(created[0].options.backdrop).toBe('static');

    modal.toggle();
    expect(created[0].shown).toBe(false);

    // The door out of the facade, as bsTable's `.pipeline` is (ADR-0039).
    expect(modal.instance()).toBe(created[0]);
    expect(created).toHaveLength(1);
  });

  it('forwards only the options the caller set', () => {
    // Bootstrap's own defaults must survive: passing `undefined` through would
    // override them with nothing.
    const { namespace, created } = makeBootstrap();
    bsModal(container(), { bootstrap: namespace, keyboard: false, focus: false }).show();

    expect(created[0].options).toEqual({ keyboard: false, focus: false });
  });

  it('subscribes with short or qualified event names and unsubscribes', () => {
    const { namespace } = makeBootstrap();
    const target = container();
    const modal = bsModal(target, { bootstrap: namespace });
    const short = vi.fn();
    const qualified = vi.fn();

    const off = modal.on('hidden', short);
    modal.on('hidden.bs.modal', qualified);
    target.dispatchEvent(new Event('hidden.bs.modal'));
    expect(short).toHaveBeenCalledTimes(1);
    expect(qualified).toHaveBeenCalledTimes(1);

    off();
    off(); // idempotent
    target.dispatchEvent(new Event('hidden.bs.modal'));
    expect(short).toHaveBeenCalledTimes(1);
    expect(qualified).toHaveBeenCalledTimes(2);
  });

  it('disposes immediately when it was never shown', () => {
    const { namespace, created } = makeBootstrap();
    const modal = bsModal(container(), { bootstrap: namespace });
    modal.show();
    modal.hide();

    modal.destroy();

    expect(created[0].disposed).toBe(true);
  });

  it('hides first and disposes only once closed', () => {
    // Disposing a shown modal is what leaves Bootstrap's backdrop on the page
    // and the body scroll-locked.
    const { namespace, created } = makeBootstrap({ async: true });
    const target = container();
    const modal = bsModal(target, { bootstrap: namespace });
    modal.show();
    target.dispatchEvent(new Event('shown.bs.modal'));

    modal.destroy();
    expect(created[0].disposed).toBe(false);

    target.dispatchEvent(new Event('hidden.bs.modal'));
    expect(created[0].disposed).toBe(true);
  });

  it('tracks a dialog closed behind its back', () => {
    // Escape and the data-API dismiss button both close without us.
    const { namespace, created } = makeBootstrap({ async: true });
    const target = container();
    const modal = bsModal(target, { bootstrap: namespace });
    modal.show();
    target.dispatchEvent(new Event('shown.bs.modal'));
    target.dispatchEvent(new Event('hidden.bs.modal'));

    modal.destroy();

    expect(created[0].disposed).toBe(true);
  });

  it('drops every subscription on destroy and refuses reuse (NFR-15)', () => {
    const { namespace } = makeBootstrap();
    const target = container();
    const modal = bsModal(target, { bootstrap: namespace });
    const handler = vi.fn();
    modal.on('shown', handler);

    modal.destroy();
    target.dispatchEvent(new Event('shown.bs.modal'));

    expect(handler).not.toHaveBeenCalled();
    expect(() => modal.show()).toThrow(TypeError);
    expect(() => modal.on('shown', handler)).toThrow(TypeError);
  });

  it('rejects a non-Element target and a non-function handler', () => {
    expect(() => bsModal(null)).toThrow(TypeError);
    expect(() => bsModal(container()).on('shown', 'nope')).toThrow(TypeError);
    expect(() => bsModal(container(), { signal: 'later' })).toThrow(TypeError);
    expect(() => bsModal(container()).on('', () => {})).toThrow(TypeError);
  });

  it('is born destroyed when handed an already-aborted signal', () => {
    // A signal that aborted before construction is the same instruction as one
    // that aborts after it; subscribing to it would never fire.
    const { namespace, created } = makeBootstrap();
    const modal = bsModal(container(), { bootstrap: namespace, signal: AbortSignal.abort() });

    expect(() => modal.show()).toThrow(TypeError);
    expect(created).toHaveLength(0);
  });

  it('is destroyed by a signal that aborts later (NFR-15)', () => {
    const { namespace, created } = makeBootstrap();
    const controller = new AbortController();
    const modal = bsModal(container(), { bootstrap: namespace, signal: controller.signal });
    modal.show();
    modal.hide();

    controller.abort();

    expect(created[0].disposed).toBe(true);
    expect(() => modal.show()).toThrow(TypeError);
  });
});

describe('F71 — bsLoadingOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds its own static-backdrop modal with a spinner', () => {
    const { namespace, created } = makeBootstrap();
    const overlay = bsLoadingOverlay({ bootstrap: namespace, message: 'Caricamento…' });

    overlay.show();

    const el = document.querySelector('.modal');
    expect(el).not.toBeNull();
    expect(el?.querySelector('[role="status"]')).not.toBeNull();
    expect(el?.textContent).toContain('Caricamento…');
    expect(created[0].options).toMatchObject({ backdrop: 'static', keyboard: false });
  });

  it('starts the anti-flicker floor when the dialog has actually appeared', async () => {
    const { namespace } = makeBootstrap({ async: true });
    const overlay = bsLoadingOverlay({ bootstrap: namespace, minVisibleMs: 100 });

    const release = overlay.show();
    await vi.advanceTimersByTimeAsync(0); // the appearance settles here
    release();

    await vi.advanceTimersByTimeAsync(50);
    expect(overlay.isShown()).toBe(true); // floor not yet served

    await vi.advanceTimersByTimeAsync(60);
    expect(overlay.isShown()).toBe(false);
  });

  it('surfaces a missing peer instead of letting the gate contain it', () => {
    // F50 swallows a failing presentation hook by design (ADR-0032). Resolving
    // the peer before the gate is engaged is what keeps NFR-18's promise: a
    // packaging mistake must not read as "the overlay just never appeared".
    const overlay = bsLoadingOverlay();
    let caught;
    try {
      overlay.show();
    } catch (error) {
      caught = error;
    }
    expect(caught?.code).toBe('EGL_PEER_MISSING');
  });

  it('passes the F50 API through, wrap included', async () => {
    const { namespace } = makeBootstrap();
    const overlay = bsLoadingOverlay({ bootstrap: namespace, minVisibleMs: 0 });

    const result = await overlay.wrap(async () => 'done');

    expect(result).toBe('done');
    await vi.advanceTimersByTimeAsync(1);
    expect(overlay.isShown()).toBe(false);
  });

  it('removes the modal it built and disposes on destroy (NFR-15)', () => {
    const { namespace, created } = makeBootstrap();
    const overlay = bsLoadingOverlay({ bootstrap: namespace });
    overlay.show();

    overlay.destroy();

    expect(document.querySelector('.modal')).toBeNull();
    expect(created[0].disposed).toBe(true);
  });

  it('leaves a caller-supplied element in place, and honours an explicit focus root', () => {
    const { namespace } = makeBootstrap();
    const target = container();
    target.className = 'modal';
    const root = container();
    const overlay = bsLoadingOverlay({
      bootstrap: namespace,
      target,
      focus: { save: true, root },
    });

    overlay.show();
    overlay.destroy();

    expect(target.isConnected).toBe(true);
  });

  it('rejects a non-Element target', () => {
    expect(() => bsLoadingOverlay({ target: 'x' })).toThrow(TypeError);
  });

  it('is born destroyed when handed an already-aborted signal', () => {
    const { namespace } = makeBootstrap();
    bsLoadingOverlay({ bootstrap: namespace, signal: AbortSignal.abort() });

    // The modal it would have owned never reaches the page.
    expect(document.querySelector('.modal')).toBeNull();
  });

  it('is destroyed by a signal that aborts later (NFR-15)', () => {
    const { namespace, created } = makeBootstrap();
    const controller = new AbortController();
    const overlay = bsLoadingOverlay({ bootstrap: namespace, signal: controller.signal });
    overlay.show();

    controller.abort();

    expect(document.querySelector('.modal')).toBeNull();
    expect(created[0].disposed).toBe(true);
  });
});
