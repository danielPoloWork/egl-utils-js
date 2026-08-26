// @vitest-environment jsdom
// Tests for the reduced-motion helper (roadmap 20.6, spec 07 §2 item F111,
// NFR-31/NFR-34/NFR-35, ADR-0075).
//
// Same division of labour as the F108 suite this one is modelled on: unit tests
// over an injected `matchMedia` fake covering the current-value read, subscribe
// and teardown; one browser test for the claim only an engine can make.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reducedMotion } from '../../../../../main/javascript/it/d4np/utils/dom.js';

/**
 * A `matchMedia` fake for exactly one query — the one this helper asks.
 *
 * @param {boolean} reduced
 */
function fakePreference(reduced) {
  let matches = reduced;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const seam = vi.fn((query) => {
    if (query !== '(prefers-reduced-motion: reduce)') {
      throw new Error(`the fake was asked an unexpected query: ${query}`);
    }
    return {
      get matches() {
        return matches;
      },
      addEventListener: (type, listener) => {
        if (type === 'change') listeners.add(listener);
      },
      removeEventListener: (type, listener) => {
        if (type === 'change') listeners.delete(listener);
      },
    };
  });
  return {
    seam,
    get listeners() {
      return listeners.size;
    },
    /**
     * Always fires listeners, even when the value does not change — the
     * dedup this exists to test is the MODULE's, not the fake's.
     *
     * @param {boolean} next
     */
    set(next) {
      matches = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('F111 — the current-value read', () => {
  it('reports true when the visitor has asked for less motion', () => {
    const helper = reducedMotion({ matchMedia: fakePreference(true).seam });
    expect(helper.prefersReduced()).toBe(true);
    helper.destroy();
  });

  it('reports false otherwise', () => {
    const helper = reducedMotion({ matchMedia: fakePreference(false).seam });
    expect(helper.prefersReduced()).toBe(false);
    helper.destroy();
  });

  it('asks Bootstrap’s own query — the one its CSS checks', () => {
    const preference = fakePreference(false);
    reducedMotion({ matchMedia: preference.seam }).destroy();
    expect(preference.seam).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('reports false when there is no way to ask — the safe default', () => {
    // Node, or an exotic host: no evidence of a preference is not evidence of
    // one, so the default is to animate as designed rather than assume every
    // host wants less motion.
    const helper = reducedMotion();
    expect(helper.prefersReduced()).toBe(false);
    helper.destroy();
  });

  it('keeps answering after destroy — a query, not a command (ADR-0049)', () => {
    const preference = fakePreference(true);
    const helper = reducedMotion({ matchMedia: preference.seam });
    helper.destroy();
    expect(helper.prefersReduced()).toBe(true);
  });
});

describe('F111 — the subscribe API', () => {
  it('notifies with the new value when the preference changes', () => {
    const preference = fakePreference(false);
    const helper = reducedMotion({ matchMedia: preference.seam });
    /** @type {boolean[]} */
    const seen = [];
    helper.on((value) => seen.push(value));

    preference.set(true);
    preference.set(false);

    expect(seen).toEqual([true, false]);
    helper.destroy();
  });

  it('says nothing when the query does not actually change', () => {
    const preference = fakePreference(false);
    const helper = reducedMotion({ matchMedia: preference.seam });
    let calls = 0;
    helper.on(() => {
      calls += 1;
    });
    preference.set(false);
    expect(calls).toBe(0);
    helper.destroy();
  });

  it('serves several subscribers, and one unsubscribing leaves the others', () => {
    const preference = fakePreference(false);
    const helper = reducedMotion({ matchMedia: preference.seam });
    const calls = [0, 0];
    const off = helper.on(() => {
      calls[0] += 1;
    });
    helper.on(() => {
      calls[1] += 1;
    });
    preference.set(true);
    off();
    preference.set(false);
    expect(calls).toEqual([1, 2]);
    helper.destroy();
  });

  it('unsubscribes idempotently', () => {
    const preference = fakePreference(false);
    const helper = reducedMotion({ matchMedia: preference.seam });
    let calls = 0;
    const off = helper.on(() => {
      calls += 1;
    });
    off();
    off();
    preference.set(true);
    expect(calls).toBe(0);
    helper.destroy();
  });

  it('rejects a handler that is not a function', () => {
    const helper = reducedMotion({ matchMedia: fakePreference(false).seam });
    expect(() => helper.on('later')).toThrow(/handler must be a function/);
    helper.destroy();
  });

  it('throws if on() is called after destroy — a command, unlike the query', () => {
    const helper = reducedMotion({ matchMedia: fakePreference(false).seam });
    helper.destroy();
    expect(() => helper.on(() => {})).toThrow(/reducedMotion: on\(\) was called after destroy/);
  });
});

describe('teardown', () => {
  it('detaches the media listener on destroy', () => {
    const preference = fakePreference(false);
    const helper = reducedMotion({ matchMedia: preference.seam });
    expect(preference.listeners).toBe(1);
    helper.destroy();
    expect(preference.listeners).toBe(0);
  });

  it('is idempotent', () => {
    const helper = reducedMotion({ matchMedia: fakePreference(false).seam });
    helper.destroy();
    expect(() => helper.destroy()).not.toThrow();
  });

  it('destroys on its signal, and is born destroyed by an aborted one', () => {
    const controller = new AbortController();
    const preference = fakePreference(false);
    const helper = reducedMotion({ matchMedia: preference.seam, signal: controller.signal });
    controller.abort();
    expect(preference.listeners).toBe(0);
    expect(() => helper.on(() => {})).toThrow(/after destroy/);

    const already = reducedMotion({
      matchMedia: fakePreference(false).seam,
      signal: AbortSignal.abort(),
    });
    expect(() => already.on(() => {})).toThrow(/after destroy/);
  });
});

describe('the media seam', () => {
  it('prefers the injected seam over the ambient one', () => {
    const ambient = vi.fn(() => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.stubGlobal('matchMedia', ambient);
    const preference = fakePreference(false);
    const helper = reducedMotion({ matchMedia: preference.seam });
    expect(ambient).not.toHaveBeenCalled();
    expect(helper.prefersReduced()).toBe(false);
    helper.destroy();
  });

  it('uses the ambient seam when none is injected', () => {
    const ambient = vi.fn(() => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.stubGlobal('matchMedia', ambient);
    const helper = reducedMotion();
    expect(ambient).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(helper.prefersReduced()).toBe(true);
    helper.destroy();
  });

  it('refuses a seam that is not a function, and one that answers unsubscribably', () => {
    expect(() => reducedMotion({ matchMedia: '(prefers-reduced-motion: reduce)' })).toThrow(
      /options\.matchMedia must be a function/,
    );
    expect(() => reducedMotion({ matchMedia: () => ({ matches: true }) })).toThrow(
      /must return a MediaQueryList with addEventListener/,
    );
    // Absence degrades; a malformed injection throws — the two must not look
    // the same.
    expect(() => reducedMotion()).not.toThrow();
  });

  it('rejects a non-object options bag', () => {
    expect(() => reducedMotion(null)).toThrow(/options must be an object/);
    expect(() => reducedMotion('reduce')).toThrow(/options must be an object/);
  });

  it('rejects an unknown option and a malformed signal', () => {
    expect(() => reducedMotion({ query: '(prefers-reduced-motion: reduce)' })).toThrow(
      /reducedMotion: unknown option 'query'/,
    );
    expect(() => reducedMotion({ signal: 'later' })).toThrow(
      /options\.signal must be an AbortSignal/,
    );
  });
});

describe('NFR-35 — no module state', () => {
  it('two helpers on one page observe independently', () => {
    const a = fakePreference(true);
    const b = fakePreference(false);
    const first = reducedMotion({ matchMedia: a.seam });
    const second = reducedMotion({ matchMedia: b.seam });

    expect(first.prefersReduced()).toBe(true);
    expect(second.prefersReduced()).toBe(false);

    first.destroy();
    expect(b.listeners).toBe(1);
    expect(second.prefersReduced()).toBe(false);
    second.destroy();
  });
});
