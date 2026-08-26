// @vitest-environment jsdom
// Tests for the toast manager (roadmap 20.2, spec 07 §2 items F104-F105,
// NFR-31/NFR-35/NFR-36, ADR-0072).
//
// Spec 07 §6 names four things, and they are the four sections below: admission
// (dedupe, update-by-id, the cap), the **property** the cap exists for — never
// more than n visible, and never a queued toast that is never shown — F105's
// pass-through in both directions, and two managers that share nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createToasts } from '../../../../../main/javascript/it/d4np/utils/ui.js';

/**
 * A stand-in for Bootstrap's namespace.
 *
 * It dispatches the real lifecycle events, because those are the contract F69 is
 * written against — `hidden.bs.toast` is what frees a slot, and a double that only
 * recorded calls would leave the whole queue untested. `show()` on an
 * already-shown toast restarts the timer rather than doing nothing, which is
 * Bootstrap's own behaviour and the one the dedupe rule leans on.
 *
 * @param {{ async?: boolean }} [config] - With `async`, transitions settle on a
 *   later turn, as an animated one does.
 * @returns {{ namespace: Record<string, unknown>, created: any[] }}
 */
function makeBootstrap(config = {}) {
  /** @type {any[]} */
  const created = [];

  class Toast {
    /**
     * @param {Element} element
     * @param {Record<string, unknown>} [options]
     */
    constructor(element, options) {
      this.element = element;
      this.options = options ?? {};
      this.shown = false;
      this.disposed = false;
      this.shows = 0;
      created.push(this);
    }

    /**
     * Bootstrap's `getOrCreateInstance`: one instance per element, so hiding a
     * toast from the manager reaches the same object F69 created.
     *
     * @param {Element} element
     * @param {Record<string, unknown>} [options]
     * @returns {Toast}
     */
    static getOrCreateInstance(element, options) {
      const existing = created.find((instance) => instance.element === element);
      return existing ?? new Toast(element, options);
    }

    /** @param {string} type */
    #fire(type) {
      this.element.dispatchEvent(new Event(type, { bubbles: true }));
    }

    show() {
      this.shows += 1;
      this.shown = true;
      const done = () => this.#fire('shown.bs.toast');
      if (config.async === true) queueMicrotask(done);
      else done();
    }

    hide() {
      if (!this.shown) return;
      this.shown = false;
      const done = () => this.#fire('hidden.bs.toast');
      if (config.async === true) queueMicrotask(done);
      else done();
    }

    dispose() {
      this.disposed = true;
    }
  }

  return { namespace: { Toast }, created };
}

/**
 * @param {Record<string, any>} [options]
 * @param {{ async?: boolean }} [config]
 */
function withBootstrap(options = {}, config = {}) {
  const peer = makeBootstrap(config);
  return { peer, toasts: createToasts({ bootstrap: peer.namespace, ...options }) };
}

/** @returns {Element[]} */
const nodes = () => [...document.querySelectorAll('.toast')];

/** @returns {string[]} */
const bodies = () => nodes().map((el) => el.querySelector('.toast-body')?.textContent ?? '');

/**
 * Hide the nth visible toast the way the user would — through its own close
 * control, which carries Bootstrap's data-API attribute.
 *
 * @param {any} peer
 * @param {number} index
 */
function userHides(peer, index) {
  const element = nodes()[index];
  const instance = peer.created.find((candidate) => candidate.element === element);
  instance.hide();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = '';
  delete (/** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap);
  vi.restoreAllMocks();
});

describe('the container', () => {
  it('builds and owns one when none is given, positioned with Bootstrap’s own utilities', () => {
    const { toasts } = withBootstrap({ placement: 'bottom-end' });
    const container = document.querySelector('.toast-container');
    expect(container).not.toBeNull();
    expect(container?.className).toContain('position-fixed');
    expect(container?.className).toContain('bottom-0 end-0');
    expect(toasts.element).toBe(container);

    toasts.destroy();
    // Owned means owned: destroy leaves the page as it found it.
    expect(document.querySelector('.toast-container')).toBeNull();
  });

  it('fills a container it is given, and leaves it behind on destroy', () => {
    const given = document.createElement('div');
    given.className = 'toast-container';
    document.body.append(given);

    const { toasts } = withBootstrap({ container: given });
    expect(toasts.element).toBe(given);
    toasts.add('Saved.');
    expect(given.querySelectorAll('.toast')).toHaveLength(1);

    toasts.destroy();
    expect(document.body.contains(given)).toBe(true);
    expect(given.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('rejects an unknown placement, naming the vocabulary', () => {
    expect(() => createToasts({ placement: 'top-right' })).toThrow(
      /options\.placement must be one of top-start, top-center, top-end/,
    );
  });
});

describe('F104 — the cap', () => {
  it('shows up to maxVisible and queues the rest, in arrival order', () => {
    const { toasts } = withBootstrap({ maxVisible: 2 });
    const ids = ['a', 'b', 'c', 'd'].map((text) => toasts.add(text));

    expect(nodes()).toHaveLength(2);
    expect(bodies()).toEqual(['a', 'b']);
    expect(toasts.state()).toEqual({ visible: [ids[0], ids[1]], queued: [ids[2], ids[3]] });
  });

  it('promotes the next queued toast when a slot frees', () => {
    const { peer, toasts } = withBootstrap({ maxVisible: 2 });
    ['a', 'b', 'c', 'd'].forEach((text) => toasts.add(text));

    userHides(peer, 0);
    expect(bodies()).toEqual(['b', 'c']);

    userHides(peer, 0);
    expect(bodies()).toEqual(['c', 'd']);

    userHides(peer, 0);
    userHides(peer, 0);
    expect(nodes()).toHaveLength(0);
    expect(toasts.state()).toEqual({ visible: [], queued: [] });
  });

  it('promotes more than one when the cap allows it', () => {
    // Two slots open at once: the loop, not a single promotion, is what covers it.
    const { peer, toasts } = withBootstrap({ maxVisible: 2 });
    ['a', 'b', 'c', 'd'].forEach((text) => toasts.add(text));
    const first = peer.created[0];
    const second = peer.created[1];
    // Hidden together, before either `hidden` event is processed.
    first.shown = false;
    second.shown = false;
    first.element.dispatchEvent(new Event('hidden.bs.toast', { bubbles: true }));
    second.element.dispatchEvent(new Event('hidden.bs.toast', { bubbles: true }));
    expect(bodies()).toEqual(['c', 'd']);
  });

  it('rejects a cap that cannot hold anything', () => {
    expect(() => createToasts({ maxVisible: 0 })).toThrow(
      /options\.maxVisible must be an integer >= 1/,
    );
    expect(() => createToasts({ maxVisible: 1.5 })).toThrow(/integer/);
  });
});

describe('F104 — dedupe, and what “identical” means', () => {
  it('drops an identical message rather than showing it twice', () => {
    const { toasts } = withBootstrap();
    const first = toasts.add('Saved.');
    const second = toasts.add('Saved.');
    expect(second).toBe(first);
    expect(nodes()).toHaveLength(1);
  });

  it('restarts the lifetime of the toast already up, rather than redrawing it', () => {
    // The contract's second half: a repeated event still reads as recent. This is
    // Bootstrap's own `show()` clearing its pending timeout, which is why no timer
    // of ours appears anywhere in this module.
    const { peer, toasts } = withBootstrap();
    toasts.add('Saved.');
    const node = nodes()[0];
    toasts.add('Saved.');
    expect(nodes()[0]).toBe(node);
    expect(peer.created).toHaveLength(1);
    expect(peer.created[0].shows).toBe(2);
  });

  it('treats variant and title as part of the identity', () => {
    const { toasts } = withBootstrap({ maxVisible: 9 });
    toasts.add('Saved.');
    toasts.add('Saved.', { variant: 'success' });
    toasts.add('Saved.', { title: 'Done' });
    expect(nodes()).toHaveLength(3);
  });

  it('never deduplicates node content, and says so rather than comparing references', () => {
    const { toasts } = withBootstrap({ maxVisible: 9 });
    const build = () => {
      const p = document.createElement('p');
      p.textContent = 'same words';
      return p;
    };
    toasts.add(build());
    toasts.add(build());
    // Two nodes, deliberately: reference equality would never match a caller who
    // builds per call, and deep comparison is not a rule anyone could predict.
    expect(nodes()).toHaveLength(2);
  });

  it('exempts a string message with a node title too', () => {
    const { toasts } = withBootstrap({ maxVisible: 9 });
    const title = () => {
      const el = document.createElement('em');
      el.textContent = 'Done';
      return el;
    };
    toasts.add('Saved.', { title: title() });
    toasts.add('Saved.', { title: title() });
    expect(nodes()).toHaveLength(2);
  });

  it('takes an explicit dedupeKey where the derived one is not what you mean', () => {
    const { toasts } = withBootstrap({ maxVisible: 9 });
    const first = toasts.add('Timed out reading /a', { dedupeKey: 'network' });
    const second = toasts.add('Timed out reading /b', { dedupeKey: 'network' });
    expect(second).toBe(first);
    expect(nodes()).toHaveLength(1);
  });

  it('deduplicates against a queued toast, not only a visible one', () => {
    const { toasts } = withBootstrap({ maxVisible: 1 });
    toasts.add('first');
    const queued = toasts.add('second');
    const again = toasts.add('second');
    expect(again).toBe(queued);
    expect(toasts.state().queued).toEqual([queued]);
  });

  it('can be turned off per manager and per call', () => {
    const { toasts } = withBootstrap({ maxVisible: 9, dedupe: false });
    toasts.add('Saved.');
    toasts.add('Saved.');
    expect(nodes()).toHaveLength(2);

    const strict = withBootstrap({ maxVisible: 9 });
    strict.toasts.add('Saved.');
    strict.toasts.add('Saved.', { dedupe: false });
    expect(strict.toasts.state().visible).toHaveLength(2);
  });
});

describe('F104 — update by id', () => {
  it('updates a visible toast in place rather than joining it with a second', async () => {
    const { toasts } = withBootstrap();
    toasts.add('Uploading…', { id: 'upload', autoHideMs: false });
    expect(bodies()).toEqual(['Uploading…']);

    toasts.add('Uploaded.', { id: 'upload', variant: 'success' });
    await flush();

    expect(nodes()).toHaveLength(1);
    expect(bodies()).toEqual(['Uploaded.']);
    expect(nodes()[0].className).toContain('text-bg-success');
    expect(toasts.state().visible).toEqual(['upload']);
  });

  it('updates a queued toast without drawing anything', () => {
    const { toasts } = withBootstrap({ maxVisible: 1 });
    toasts.add('holding the slot');
    toasts.add('first text', { id: 'later' });
    toasts.add('second text', { id: 'later' });

    expect(bodies()).toEqual(['holding the slot']);
    expect(toasts.state().queued).toEqual(['later']);
  });

  it('keeps the updated toast in its own slot, ahead of newer arrivals', async () => {
    // The reason an update does not go through the queue: a burst of newer
    // toasts must not overtake the one being updated.
    const { toasts } = withBootstrap({ maxVisible: 1 });
    toasts.add('v1', { id: 'x', autoHideMs: false });
    toasts.add('newer');
    toasts.add('v2', { id: 'x' });
    await flush();

    expect(bodies()).toEqual(['v2']);
    expect(toasts.state()).toEqual({ visible: ['x'], queued: expect.any(Array) });
    expect(toasts.state().queued).toHaveLength(1);
  });

  it('an update outranks the dedupe rule', async () => {
    const { toasts } = withBootstrap({ maxVisible: 9 });
    toasts.add('Saved.', { id: 'a' });
    toasts.add('Saved.', { id: 'b' });
    // 'b' would have been a duplicate of 'a' by content, but an id is identity.
    expect(toasts.state().visible).toEqual(['a', 'b']);
    toasts.add('Saved.', { id: 'b', variant: 'success' });
    await flush();
    expect(toasts.state().visible).toEqual(['a', 'b']);
  });
});

describe('dismiss and clear', () => {
  it('dismisses one visible toast and promotes its replacement from the queue', () => {
    const { toasts } = withBootstrap({ maxVisible: 1 });
    const first = toasts.add('a');
    toasts.add('b');
    toasts.dismiss(first);
    expect(bodies()).toEqual(['b']);
  });

  it('drops a queued toast without ever drawing it', () => {
    const { toasts } = withBootstrap({ maxVisible: 1 });
    toasts.add('a');
    const queued = toasts.add('b');
    toasts.dismiss(queued);
    expect(toasts.state().queued).toEqual([]);
    expect(bodies()).toEqual(['a']);
  });

  it('ignores an unknown id, because that is a race and not a mistake', () => {
    const { toasts } = withBootstrap();
    expect(() => toasts.dismiss('never-existed')).not.toThrow();
  });

  it('a dismissal outranks a pending update', async () => {
    const { toasts } = withBootstrap();
    toasts.add('v1', { id: 'x', autoHideMs: false });
    toasts.add('v2', { id: 'x' });
    // The update is in flight — the old node is hiding. Dismissing now means the
    // caller wants it gone, not replaced.
    toasts.dismiss('x');
    await flush();
    expect(nodes()).toHaveLength(0);
    expect(toasts.state()).toEqual({ visible: [], queued: [] });
  });

  it('clears the queue and hides everything up', () => {
    const { toasts } = withBootstrap({ maxVisible: 2 });
    ['a', 'b', 'c', 'd'].forEach((text) => toasts.add(text));
    toasts.clear();
    expect(nodes()).toHaveLength(0);
    expect(toasts.state()).toEqual({ visible: [], queued: [] });
  });
});

describe('F105 — one toast for one operation', () => {
  it('shows one toast, then transitions it, and never a second', async () => {
    const { toasts } = withBootstrap();
    let settle;
    const work = new Promise((resolve) => {
      settle = resolve;
    });
    const returned = toasts.promise(work, {
      pending: 'Saving…',
      success: 'Saved.',
      error: 'Failed.',
    });

    expect(bodies()).toEqual(['Saving…']);
    // No auto-hide while in flight: an operation of unknown duration has no
    // honest timer.
    expect(nodes()).toHaveLength(1);

    settle('ok');
    await returned;
    await flush();

    expect(nodes()).toHaveLength(1);
    expect(bodies()).toEqual(['Saved.']);
    expect(nodes()[0].className).toContain('text-bg-success');
  });

  it('passes the resolution value through untouched', async () => {
    const { toasts } = withBootstrap();
    const value = { rows: 3 };
    const returned = toasts.promise(Promise.resolve(value), {
      pending: 'Saving…',
      success: 'Saved.',
      error: 'Failed.',
    });
    await expect(returned).resolves.toBe(value);
  });

  it('passes the rejection reason through untouched, with its identity intact', async () => {
    const { toasts } = withBootstrap();
    const reason = new TypeError('nope');
    const returned = toasts.promise(Promise.reject(reason), {
      pending: 'Saving…',
      success: 'Saved.',
      error: 'Failed.',
    });
    await expect(returned).rejects.toBe(reason);
    await flush();
    expect(bodies()).toEqual(['Failed.']);
    expect(nodes()[0].className).toContain('text-bg-danger');
  });

  it('returns the caller’s own promise, so it observes without swallowing', async () => {
    const { toasts } = withBootstrap();
    const work = Promise.resolve(1);
    const returned = toasts.promise(work, { pending: 'p', success: 's', error: 'e' });
    expect(returned).toBe(work);
    await returned;
  });

  it('builds the settled message from the value or the reason', async () => {
    const { toasts } = withBootstrap();
    await toasts.promise(Promise.resolve([1, 2, 3]), {
      pending: 'Saving…',
      success: (rows) => `Saved ${rows.length} rows.`,
      error: 'Failed.',
    });
    await flush();
    expect(bodies()).toEqual(['Saved 3 rows.']);

    const failed = toasts.promise(Promise.reject(new Error('offline')), {
      pending: 'Saving…',
      success: 'Saved.',
      error: (error) => `Could not save: ${error.message}`,
    });
    await expect(failed).rejects.toThrow('offline');
    await flush();
    expect(bodies()).toContain('Could not save: offline');
  });

  it('respects a caller-supplied id, so the story can be found and dismissed', async () => {
    const { toasts } = withBootstrap();
    const returned = toasts.promise(
      Promise.resolve(1),
      {
        pending: 'Saving…',
        success: 'Saved.',
        error: 'Failed.',
      },
      { id: 'save' },
    );
    expect(toasts.state().visible).toEqual(['save']);
    await returned;
    await flush();
    expect(toasts.state().visible).toEqual(['save']);
  });

  it('settles the caller’s promise even when the manager is destroyed in flight', async () => {
    // A page that navigated away: the operation still settles for the caller, it
    // simply has nowhere left to be announced.
    const { toasts } = withBootstrap();
    const returned = toasts.promise(Promise.resolve('done'), {
      pending: 'Saving…',
      success: 'Saved.',
      error: 'Failed.',
    });
    toasts.destroy();
    await expect(returned).resolves.toBe('done');
    expect(nodes()).toHaveLength(0);
  });

  it('rejects a malformed call, naming what is missing', () => {
    const { toasts } = withBootstrap();
    expect(() =>
      toasts.promise('not a promise', { pending: 'p', success: 's', error: 'e' }),
    ).toThrow(/promise must be a promise/);
    expect(() => toasts.promise(Promise.resolve(1), { pending: 'p', success: 's' })).toThrow(
      /messages\.pending, \.success and \.error are all required/,
    );
    expect(() =>
      toasts.promise(Promise.resolve(1), { pending: 'p', success: 's', error: 'e', done: 'd' }),
    ).toThrow(/unknown message 'done'/);
    expect(() =>
      toasts.promise(Promise.resolve(1), { pending: 'p', success: 's', error: 'e' }, { colour: 1 }),
    ).toThrow(/unknown option 'colour'/);
  });
});

describe('the cap invariant, over randomised arrival sequences', () => {
  it('never exceeds maxVisible, and never leaves a queued toast unshown', () => {
    // The property the cap exists for (spec 07 §6). `add` and `hide` interleaved
    // at random, then drained: every toast that was admitted must have been shown
    // at some point, and the visible count must never have exceeded the cap.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        (maxVisible, script) => {
          document.body.innerHTML = '';
          const peer = makeBootstrap();
          const toasts = createToasts({ bootstrap: peer.namespace, maxVisible, dedupe: false });

          /** @type {Set<string>} */
          const admitted = new Set();
          /** @type {Set<string>} */
          const everShown = new Set();
          let arrivals = 0;

          for (const arrive of script) {
            if (arrive) {
              arrivals += 1;
              admitted.add(toasts.add(`message ${arrivals}`));
            } else {
              const up = toasts.state().visible;
              if (up.length > 0) toasts.dismiss(up[0]);
            }
            const state = toasts.state();
            for (const id of state.visible) everShown.add(id);
            // The invariant, checked after every single step rather than at the
            // end, because a transient breach is still a breach.
            expect(state.visible.length).toBeLessThanOrEqual(maxVisible);
          }

          // Drain: every remaining toast leaves, and the queue must empty itself
          // through promotion rather than stranding anything.
          for (let guard = 0; guard < 200; guard += 1) {
            const up = toasts.state().visible;
            if (up.length === 0) break;
            for (const id of up) everShown.add(id);
            toasts.dismiss(up[0]);
          }

          const drained = toasts.state();
          expect(drained.visible).toEqual([]);
          expect(drained.queued).toEqual([]);
          // Nothing admitted was silently dropped.
          expect([...admitted].filter((id) => !everShown.has(id))).toEqual([]);

          toasts.destroy();
          return true;
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe('NFR-36 — a toast is announced', () => {
  it('inherits F69’s live-region pair, polite by default and assertive for danger', () => {
    const { toasts } = withBootstrap({ maxVisible: 9 });
    toasts.add('Saved.');
    toasts.add('Could not save.', { variant: 'danger' });
    const [polite, assertive] = nodes();
    expect(polite.getAttribute('role')).toBe('status');
    expect(polite.getAttribute('aria-live')).toBe('polite');
    expect(assertive.getAttribute('role')).toBe('alert');
    expect(assertive.getAttribute('aria-live')).toBe('assertive');
  });

  it('escapes string content by default and refuses markup without a sanitizer', () => {
    const { toasts } = withBootstrap();
    toasts.add('<img src=x onerror=alert(1)>');
    expect(nodes()[0].querySelector('img')).toBeNull();

    const strict = withBootstrap();
    expect(() => strict.toasts.add('<b>bold</b>', { html: true })).toThrow(/sanitize/);
  });
});

describe('options, and the rest element as the schema', () => {
  it('rejects an unknown key on the manager and on add', () => {
    expect(() => createToasts({ maxVisibile: 3 })).toThrow(
      /createToasts: unknown option 'maxVisibile'/,
    );
    const { toasts } = withBootstrap();
    expect(() => toasts.add('x', { autohide: false })).toThrow(
      /createToasts\.add: unknown option 'autohide'/,
    );
  });

  it('rejects malformed options, naming the option', () => {
    const { toasts } = withBootstrap();
    expect(() => createToasts({ container: 'body' })).toThrow(
      /options\.container must be an Element/,
    );
    expect(() => createToasts({ dedupe: 'yes' })).toThrow(/options\.dedupe must be a boolean/);
    expect(() => createToasts({ signal: 'later' })).toThrow(
      /options\.signal must be an AbortSignal/,
    );
    expect(() => toasts.add('x', { id: '' })).toThrow(/options\.id must be a non-empty string/);
    expect(() => toasts.add('x', { dedupe: 'no' })).toThrow(/options\.dedupe must be a boolean/);
    expect(() => toasts.add('x', { dedupeKey: 7 })).toThrow(/options\.dedupeKey must be a string/);
    expect(() => toasts.add('x', { variant: 'not a token' })).toThrow(/options\.variant/);
    expect(() => toasts.dismiss(7)).toThrow(/id must be a string/);
  });

  it('takes manager defaults and lets a call override them', () => {
    const { toasts } = withBootstrap({ variant: 'info', maxVisible: 9 });
    toasts.add('inherited');
    toasts.add('overridden', { variant: 'warning' });
    expect(nodes()[0].className).toContain('text-bg-info');
    expect(nodes()[1].className).toContain('text-bg-warning');
  });

  it('throws after destroy, on every command', () => {
    const { toasts } = withBootstrap();
    toasts.destroy();
    expect(() => toasts.add('x')).toThrow(/createToasts: add\(\) was called after destroy/);
    expect(() => toasts.dismiss('x')).toThrow(/dismiss\(\) was called after destroy/);
    expect(() => toasts.clear()).toThrow(/clear\(\) was called after destroy/);
    expect(() =>
      toasts.promise(Promise.resolve(1), { pending: 'p', success: 's', error: 'e' }),
    ).toThrow(/promise\(\) was called after destroy/);
    expect(() => toasts.destroy()).not.toThrow();
  });

  it('is born destroyed when its signal was already aborted', () => {
    const peer = makeBootstrap();
    const toasts = createToasts({ bootstrap: peer.namespace, signal: AbortSignal.abort() });
    expect(() => toasts.add('x')).toThrow(/after destroy/);
    expect(document.querySelector('.toast-container')).toBeNull();
  });

  it('destroys when its signal aborts, taking the queue with it', () => {
    const controller = new AbortController();
    const peer = makeBootstrap();
    const toasts = createToasts({
      bootstrap: peer.namespace,
      maxVisible: 1,
      signal: controller.signal,
    });
    toasts.add('a');
    toasts.add('b');
    controller.abort();
    expect(nodes()).toHaveLength(0);
    expect(document.querySelector('.toast-container')).toBeNull();
  });

  it('rejects EGL_PEER_MISSING at the first toast, not at construction', () => {
    // The F68 contract, inherited: wiring up a manager at startup must not be
    // where a packaging mistake surfaces.
    const toasts = createToasts();
    let caught;
    try {
      toasts.add('Saved.');
    } catch (error) {
      caught = error;
    }
    expect(caught?.code).toBe('EGL_PEER_MISSING');
    expect(caught?.peer).toBe('bootstrap');
  });

  it('prefers the injected namespace over the ambient global', () => {
    const ambient = makeBootstrap();
    const injected = makeBootstrap();
    /** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap = ambient.namespace;
    createToasts({ bootstrap: injected.namespace }).add('Saved.');
    expect(injected.created).toHaveLength(1);
    expect(ambient.created).toHaveLength(0);
  });
});

describe('what the manager forwards, and what it does not own', () => {
  it('passes every manager-level presentation option through to F69', () => {
    const peer = makeBootstrap();
    const toasts = createToasts({
      bootstrap: peer.namespace,
      variant: 'info',
      autoHideMs: 1000,
      animation: false,
      dismissible: false,
      closeLabel: 'Chiudi',
      class: 'shadow',
      html: true,
      sanitize: (html) => html.replace(/<script[\s\S]*?<\/script>/g, ''),
    });

    toasts.add('<b>bold</b><script>bad()</script>');
    const node = nodes()[0];

    expect(node.className).toContain('text-bg-info');
    expect(node.className).toContain('shadow');
    expect(node.querySelector('b')?.textContent).toBe('bold');
    expect(node.querySelector('script')).toBeNull();
    // `dismissible: false` means no close control anywhere in the toast.
    expect(node.querySelector('.btn-close')).toBeNull();
    // Translated to Bootstrap's own pair at the F69 boundary, which is the only
    // place that vocabulary belongs (ADR-0048).
    expect(peer.created[0].options).toMatchObject({
      animation: false,
      autohide: true,
      delay: 1000,
    });
    toasts.destroy();
  });

  it('names the close control when one is asked for', () => {
    const { toasts } = withBootstrap({ closeLabel: 'Chiudi' });
    toasts.add('Saved.');
    expect(nodes()[0].querySelector('.btn-close')?.getAttribute('aria-label')).toBe('Chiudi');
    toasts.destroy();
  });

  it('passes per-call title, markup and lifetime through', () => {
    const { peer, toasts } = withBootstrap();
    toasts.add('<em>done</em>', {
      title: 'Import',
      html: true,
      sanitize: (html) => html,
      autoHideMs: false,
    });
    const node = nodes()[0];
    expect(node.querySelector('.toast-header')?.textContent).toContain('Import');
    expect(node.querySelector('em')?.textContent).toBe('done');
    // `false` means no timer at all, which is F69's own translation of it.
    expect(peer.created[0].options.autohide).toBe(false);
    expect(peer.created[0].options.delay).toBeUndefined();
    toasts.destroy();
  });

  it('carries the promise helper’s title, markup and settled lifetime', async () => {
    const { peer, toasts } = withBootstrap();
    const returned = toasts.promise(
      Promise.resolve('ok'),
      { pending: '<i>saving</i>', success: '<i>saved</i>', error: 'failed' },
      {
        title: 'Save',
        html: true,
        sanitize: (html) => html,
        autoHideMs: 2000,
        pendingVariant: 'secondary',
      },
    );
    expect(nodes()[0].className).toContain('text-bg-secondary');
    expect(nodes()[0].querySelector('.toast-header')?.textContent).toContain('Save');
    expect(nodes()[0].querySelector('i')?.textContent).toBe('saving');
    // The pending state never auto-hides, whatever autoHideMs says.
    expect(peer.created[0].options.autohide).toBe(false);

    await returned;
    await flush();

    expect(nodes()[0].querySelector('i')?.textContent).toBe('saved');
    // The settled state takes the caller's lifetime.
    const settled = peer.created.at(-1);
    expect(settled.options).toMatchObject({ autohide: true, delay: 2000 });
    toasts.destroy();
  });

  it('ignores a hidden event from a toast it did not admit', () => {
    // A supplied container may hold toasts this manager never built — a page
    // migrating to it one call site at a time. Their comings and goings are not
    // its slots to reclaim.
    const given = document.createElement('div');
    given.className = 'toast-container';
    document.body.append(given);
    const { toasts } = withBootstrap({ container: given, maxVisible: 1 });
    toasts.add('mine');
    toasts.add('queued');

    const foreign = document.createElement('div');
    foreign.className = 'toast';
    given.append(foreign);
    foreign.dispatchEvent(new Event('hidden.bs.toast', { bubbles: true }));

    // Nothing promoted, nothing lost: the queue is still the queue, and the
    // foreign node is still the page's business rather than ours.
    const state = toasts.state();
    expect(state.visible).toHaveLength(1);
    expect(state.queued).toHaveLength(1);
    expect(given.querySelectorAll('.toast-body')).toHaveLength(1);
    toasts.destroy();
    // Tearing down took only what it built.
    expect(given.contains(foreign)).toBe(true);
  });
});

describe('NFR-35 — no module state', () => {
  it('two managers on one page share no queue, no cap and no container', () => {
    const first = withBootstrap({ maxVisible: 1 });
    const second = withBootstrap({ maxVisible: 1 });

    first.toasts.add('first-a');
    first.toasts.add('first-b');
    second.toasts.add('second-a');

    // One visible each, one queued in the first only: the second manager's cap is
    // its own.
    expect(first.toasts.state().queued).toHaveLength(1);
    expect(second.toasts.state().queued).toHaveLength(0);
    expect(document.querySelectorAll('.toast-container')).toHaveLength(2);
    expect(first.toasts.element).not.toBe(second.toasts.element);

    first.toasts.destroy();
    expect(second.toasts.state().visible).toHaveLength(1);
    expect(document.querySelectorAll('.toast-container')).toHaveLength(1);
    second.toasts.destroy();
  });

  it('keeps identical ids in two managers apart', () => {
    const first = withBootstrap();
    const second = withBootstrap();
    first.toasts.add('one', { id: 'shared' });
    second.toasts.add('two', { id: 'shared' });
    expect(bodies()).toEqual(['one', 'two']);
  });
});
