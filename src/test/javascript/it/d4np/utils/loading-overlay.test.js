// @vitest-environment jsdom
// Example tests (roadmap 12.2, spec 03 §2 item F50, NFR-15, ADR-0032) for the
// reference-counted loading gate. The three properties that matter are the ones
// hand-rolled overlays get wrong: a concurrent owner tearing the overlay down
// early, a floor measured from the call instead of from the appearance, and a
// hide that arrives while the overlay is still appearing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadingOverlay } from '../../../../../main/javascript/it/d4np/utils/dom.js';

/** A presentation pair that records calls and can be made async on demand. */
function makeHooks() {
  const calls = [];
  /** @type {{ resolve?: () => void }} */
  const gate = {};
  return {
    calls,
    gate,
    onShow: vi.fn(() => {
      calls.push('show');
      if (gate.pending === true) {
        return new Promise((resolve) => {
          gate.resolve = () => resolve(undefined);
        });
      }
      return undefined;
    }),
    onHide: vi.fn(() => {
      calls.push('hide');
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Let the internal hook promises settle without advancing the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('loadingOverlay — the reference count', () => {
  it('shows once for concurrent owners and hides only after the last release', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    const releaseA = overlay.acquire();
    const releaseB = overlay.acquire();
    await settle();
    expect(onShow).toHaveBeenCalledTimes(1);

    releaseA();
    await vi.advanceTimersByTimeAsync(10);
    // B is still running: tearing the overlay down here is the classic bug.
    expect(onHide).not.toHaveBeenCalled();
    expect(overlay.isShown()).toBe(true);

    releaseB();
    await vi.advanceTimersByTimeAsync(10);
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(overlay.isShown()).toBe(false);
  });

  it('release is idempotent, so a double call cannot drop a sibling’s hold', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    const releaseA = overlay.acquire();
    overlay.acquire();
    await settle();

    releaseA();
    releaseA();
    releaseA();
    await vi.advanceTimersByTimeAsync(10);

    // The second owner is still holding it — the repeated releases did nothing.
    expect(onHide).not.toHaveBeenCalled();
    expect(overlay.isShown()).toBe(true);
  });

  it('re-acquiring after a full release shows again', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    overlay.acquire()();
    await vi.advanceTimersByTimeAsync(10);
    expect(onHide).toHaveBeenCalledTimes(1);

    overlay.acquire();
    await settle();
    expect(onShow).toHaveBeenCalledTimes(2);
    expect(overlay.isShown()).toBe(true);
  });

  it('a new owner arriving before the hide lands cancels it without blinking', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 500 });

    overlay.acquire()();
    // Inside the floor: the hide is owed but has not happened.
    overlay.acquire();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onHide).not.toHaveBeenCalled();
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(overlay.isShown()).toBe(true);
  });
});

describe('loadingOverlay — the minimum-visible floor', () => {
  it('keeps a fast operation’s overlay up for the floor', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 400 });

    const release = overlay.acquire();
    await settle();
    release(); // the "response" arrived in ~0 ms

    await vi.advanceTimersByTimeAsync(399);
    expect(onHide).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('measures the floor from when onShow SETTLES, not from show()', async () => {
    // The distinction this component exists for: an animated presentation that
    // takes 300 ms must not have that time counted against its own floor.
    const hooks = makeHooks();
    hooks.gate.pending = true;
    const { onShow, onHide } = hooks;
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 400 });

    const release = overlay.acquire();
    await vi.advanceTimersByTimeAsync(300); // still appearing
    hooks.gate.resolve?.();
    await settle();
    release();

    // If the floor had started at show(), 100 ms would be enough here.
    await vi.advanceTimersByTimeAsync(399);
    expect(hooks.onHide).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hooks.onHide).toHaveBeenCalledTimes(1);
  });

  it('honours a hide requested while the overlay is still appearing', async () => {
    const hooks = makeHooks();
    hooks.gate.pending = true;
    const { onShow, onHide } = hooks;
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 100 });

    const release = overlay.acquire();
    release(); // released before the presentation even finished

    expect(hooks.onHide).not.toHaveBeenCalled();
    hooks.gate.resolve?.();
    await settle();
    await vi.advanceTimersByTimeAsync(100);

    // Hidden exactly once, in order, and never left up by the race.
    expect(hooks.calls).toEqual(['show', 'hide']);
    expect(overlay.isShown()).toBe(false);
  });

  it('hides without delay when the floor is zero', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    overlay.acquire()();
    await settle();
    await vi.advanceTimersByTimeAsync(0);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('a slow operation hides as soon as it releases, with no extra wait', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 400 });

    const release = overlay.acquire();
    await vi.advanceTimersByTimeAsync(5_000); // the floor elapsed long ago
    release();
    await settle();

    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('loadingOverlay — wrap', () => {
  it('returns the operation’s value and releases', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    const promise = overlay.wrap(async () => 'result');
    await settle();
    await expect(promise).resolves.toBe('result');

    await vi.advanceTimersByTimeAsync(10);
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(overlay.isShown()).toBe(false);
  });

  it('releases when the operation rejects, and propagates the rejection', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    const failure = new Error('boom');
    const promise = overlay.wrap(async () => {
      throw failure;
    });
    await expect(promise).rejects.toBe(failure);

    await vi.advanceTimersByTimeAsync(10);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('releases when the operation throws synchronously', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    await expect(
      overlay.wrap(() => {
        throw new Error('sync');
      }),
    ).rejects.toThrow('sync');

    await vi.advanceTimersByTimeAsync(10);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('accepts a bare promise as well as a function', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    await expect(overlay.wrap(Promise.resolve(7))).resolves.toBe(7);
    await vi.advanceTimersByTimeAsync(10);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('nested wraps keep the overlay up until the last one settles', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    let releaseSlow = () => {};
    const slow = new Promise((resolve) => {
      releaseSlow = () => resolve('slow');
    });
    const both = Promise.all([overlay.wrap(async () => 'fast'), overlay.wrap(slow)]);

    await vi.advanceTimersByTimeAsync(50);
    expect(onHide).not.toHaveBeenCalled();

    releaseSlow();
    await both;
    await vi.advanceTimersByTimeAsync(10);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('loadingOverlay — focus', () => {
  /** @type {HTMLButtonElement} */
  let trigger;
  /** @type {HTMLElement} */
  let overlayRoot;

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="trigger">Save</button>
      <div id="overlay"><button id="inside">Cancel</button></div>
    `;
    trigger = /** @type {HTMLButtonElement} */ (document.getElementById('trigger'));
    overlayRoot = /** @type {HTMLElement} */ (document.getElementById('overlay'));
  });

  it('restores the element that was focused before showing', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({
      onShow,
      onHide,
      minVisibleMs: 0,
      focus: { save: true, root: overlayRoot },
    });

    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const release = overlay.acquire();
    await settle();
    /** @type {HTMLElement} */ (document.getElementById('inside')).focus();

    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(document.activeElement).toBe(trigger);
  });

  it('clears focus held inside the overlay before hiding it', async () => {
    // Hiding a container that still holds focus is what produces the
    // "blocked aria-hidden … retained focus" console warning.
    const seen = [];
    const overlay = loadingOverlay({
      onShow: () => {},
      onHide: () => {
        seen.push(document.activeElement?.id ?? 'none');
      },
      minVisibleMs: 0,
      focus: { save: true, root: overlayRoot },
    });

    overlay.acquire();
    await settle();
    /** @type {HTMLElement} */ (document.getElementById('inside')).focus();
    overlay.acquire()(); // extra acquire/release pair, count still 1
    expect(document.activeElement?.id).toBe('inside');

    // Release the remaining owner.
    const release = overlay.acquire();
    release();
    release();
    await vi.advanceTimersByTimeAsync(10);
  });

  it('does not refocus an element the operation removed from the document', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({
      onShow,
      onHide,
      minVisibleMs: 0,
      focus: { save: true, root: overlayRoot },
    });

    trigger.focus();
    const release = overlay.acquire();
    await settle();
    trigger.remove(); // the operation re-rendered and the button is gone

    release();
    await vi.advanceTimersByTimeAsync(10);
    // No throw, and focus is wherever the document put it — not on a detached node.
    expect(document.body.contains(/** @type {Node} */ (document.activeElement))).toBe(true);
  });

  it('needs no document at all when focus.save is off', async () => {
    // The gate's timing logic is pure: only focus handling makes it browser-only.
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });
    overlay.acquire()();
    await vi.advanceTimersByTimeAsync(10);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('loadingOverlay — contained presentation failures', () => {
  it('a rejected onShow leaves the gate consistent instead of stuck', async () => {
    const onShow = vi.fn(async () => {
      throw new Error('render failed');
    });
    const onHide = vi.fn();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    const release = overlay.acquire();
    await settle();
    release();
    await vi.advanceTimersByTimeAsync(10);

    // The failure never reached the caller, and the gate can be reused.
    expect(overlay.isShown()).toBe(false);
    expect(() => overlay.acquire()).not.toThrow();
  });

  it('a throwing onShow does not propagate out of show()', async () => {
    const overlay = loadingOverlay({
      onShow: () => {
        throw new Error('sync render failure');
      },
      onHide: () => {},
      minVisibleMs: 0,
    });

    expect(() => overlay.acquire()).not.toThrow();
    await settle();
  });

  it('a throwing onHide still completes the hide and restores focus', async () => {
    document.body.innerHTML = '<button id="t">t</button>';
    const trigger = /** @type {HTMLElement} */ (document.getElementById('t'));
    trigger.focus();

    const overlay = loadingOverlay({
      onShow: () => {},
      onHide: () => {
        throw new Error('dismiss failed');
      },
      minVisibleMs: 0,
      focus: { save: true },
    });

    const release = overlay.acquire();
    await settle();
    /** @type {HTMLElement} */ (document.body).focus();
    release();
    await vi.advanceTimersByTimeAsync(10);

    expect(overlay.isShown()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('loadingOverlay — teardown (NFR-15)', () => {
  it('destroy() hides immediately, bypassing the floor, and clears the timer', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 10_000 });

    overlay.acquire();
    await settle();
    overlay.destroy();
    await settle();

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(overlay.isShown()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroy() mid-appearance cannot be resurrected when onShow finally settles', async () => {
    // A component unmounted while the overlay is still animating in: the late
    // appearance must not flip the gate back to shown or leave a floor timer
    // ticking against an instance nobody owns any more.
    const hooks = makeHooks();
    hooks.gate.pending = true;
    const { onShow, onHide } = hooks;
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 10_000 });

    overlay.acquire();
    overlay.destroy();
    hooks.gate.resolve?.();
    await settle();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(overlay.isShown()).toBe(false);
    expect(hooks.onHide).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroy() is idempotent and safe before any show', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide });

    expect(() => overlay.destroy()).not.toThrow();
    expect(() => overlay.destroy()).not.toThrow();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('an aborted signal destroys the gate', async () => {
    const { onShow, onHide } = makeHooks();
    const controller = new AbortController();
    const overlay = loadingOverlay({
      onShow,
      onHide,
      minVisibleMs: 10_000,
      signal: controller.signal,
    });

    overlay.acquire();
    await settle();
    controller.abort();
    await settle();

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a signal already aborted at construction yields a destroyed gate', () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, signal: AbortSignal.abort() });

    expect(() => overlay.acquire()).toThrow(/after destroy/);
    expect(onShow).not.toHaveBeenCalled();
  });

  it('show() after destroy() throws rather than silently doing nothing', () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide });
    overlay.destroy();

    expect(() => overlay.acquire()).toThrow(TypeError);
  });

  it('a release held across destroy() cannot hide a second time', async () => {
    const { onShow, onHide } = makeHooks();
    const overlay = loadingOverlay({ onShow, onHide, minVisibleMs: 0 });

    const release = overlay.acquire();
    await settle();
    overlay.destroy();
    await settle();
    release();
    await vi.advanceTimersByTimeAsync(10);

    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('loadingOverlay — argument validation', () => {
  it.each([
    ['no options at all', undefined],
    ['a missing onHide', { onShow: () => {} }],
    ['a non-function onShow', { onShow: 'x', onHide: () => {} }],
  ])('rejects %s', (_label, options) => {
    expect(() => loadingOverlay(/** @type {never} */ (options))).toThrow(
      /onShow and options.onHide must be functions/,
    );
  });

  it.each([
    ['a negative floor', -1],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '400'],
    ['NaN', Number.NaN],
  ])('rejects %s as minVisibleMs', (_label, value) => {
    expect(() =>
      loadingOverlay({
        onShow: () => {},
        onHide: () => {},
        minVisibleMs: /** @type {never} */ (value),
      }),
    ).toThrow(/non-negative finite number/);
  });

  it('rejects a non-object focus and a non-Element focus root', () => {
    const hooks = { onShow: () => {}, onHide: () => {} };
    expect(() => loadingOverlay({ ...hooks, focus: /** @type {never} */ (null) })).toThrow(
      /options.focus must be an object/,
    );
    expect(() =>
      loadingOverlay({ ...hooks, focus: { root: /** @type {never} */ ('#x') } }),
    ).toThrow(/focus.root must be an Element/);
  });

  it('rejects a non-AbortSignal signal', () => {
    expect(() =>
      loadingOverlay({
        onShow: () => {},
        onHide: () => {},
        signal: /** @type {never} */ ({}),
      }),
    ).toThrow(/must be an AbortSignal/);
  });
});
