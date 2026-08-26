// @vitest-environment jsdom
// Tests for breakpoint observation (roadmap 20.4, spec 07 §2 item F108,
// NFR-31/NFR-34/NFR-35, ADR-0074).
//
// Spec 07 §6 asks for these over an **injected `matchMedia` fake** covering
// subscribe, current value and teardown, with one browser test per helper that the
// real `MediaQueryList` is wired — *"the fake proves the logic and only an engine
// proves the wiring"*.
//
// The fake here models a viewport width rather than a set of booleans, so a test
// says "the window is 800 px" and every query answers consistently. Hand-setting
// five independent `matches` flags would let a test assert a viewport that cannot
// exist — `up('lg')` true while `up('md')` false — and then pass.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  BOOTSTRAP_BREAKPOINTS,
  createBreakpoints,
} from '../../../../../main/javascript/it/d4np/utils/ui.js';

/**
 * A `matchMedia` fake backed by one viewport width.
 *
 * Only `(min-width: Npx)` is understood, because that is the only shape the
 * observer emits — and a fake that silently answered anything else would hide the
 * day that stopped being true.
 *
 * @param {number} width
 */
function fakeViewport(width) {
  /** @type {Array<{ min: number, matches: boolean, listeners: Set<() => void> }>} */
  const opened = [];
  let current = width;

  /**
   * @param {string} query
   * @returns {any}
   */
  const seam = (query) => {
    const parsed = /^\(min-width: (\d+(?:\.\d+)?)px\)$/.exec(query);
    if (parsed === null) throw new Error(`the fake was asked an unexpected query: ${query}`);
    const min = Number(parsed[1]);
    /** @type {Set<() => void>} */
    const listeners = new Set();
    const entry = {
      min,
      get matches() {
        return current >= min;
      },
      listeners,
      addEventListener: (type, listener) => {
        if (type === 'change') listeners.add(listener);
      },
      removeEventListener: (type, listener) => {
        if (type === 'change') listeners.delete(listener);
      },
    };
    opened.push(/** @type {any} */ (entry));
    return entry;
  };

  return {
    seam,
    opened,
    /** @param {number} next */
    resize(next) {
      const before = opened.map((query) => query.matches);
      current = next;
      // Only the queries whose answer actually changed fire, which is what a real
      // MediaQueryList does — and it is what makes "the observer notifies once
      // per crossing" a claim about the observer rather than about the fake.
      opened.forEach((query, at) => {
        if (query.matches !== before[at]) for (const listener of [...query.listeners]) listener();
      });
    },
    get queries() {
      return opened.length;
    },
    get listeners() {
      return opened.reduce((total, query) => total + query.listeners.size, 0);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the breakpoint map', () => {
  it('exposes Bootstrap’s own $grid-breakpoints, frozen', () => {
    // Read from `scss/_variables.scss` rather than remembered, and exported so a
    // caller can use the same numbers the observer does.
    expect(BOOTSTRAP_BREAKPOINTS).toEqual({
      xs: 0,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200,
      xxl: 1400,
    });
    expect(Object.isFrozen(BOOTSTRAP_BREAKPOINTS)).toBe(true);
  });

  it('opens one min-width query per breakpoint above zero, and none for the base', () => {
    // Five, not eleven: `down`/`only`/`between` are complements and intersections
    // of the `up` set, so no `max-width` query is needed — which is also why the
    // 0.02px subtraction never appears in the implementation.
    const media = fakeViewport(1000);
    const screen = createBreakpoints({ matchMedia: media.seam });
    expect(media.queries).toBe(5);
    expect(media.opened.map((query) => query.min)).toEqual([576, 768, 992, 1200, 1400]);
    screen.destroy();
  });

  it('names the breakpoints in ascending order', () => {
    const screen = createBreakpoints({ matchMedia: fakeViewport(0).seam });
    expect(screen.names).toEqual(['xs', 'sm', 'md', 'lg', 'xl', 'xxl']);
    expect(Object.isFrozen(screen.names)).toBe(true);
  });
});

describe('F108 — the current value', () => {
  it.each([
    [0, 'xs'],
    [575, 'xs'],
    [576, 'sm'],
    [767, 'sm'],
    [768, 'md'],
    [991, 'md'],
    [992, 'lg'],
    [1199, 'lg'],
    [1200, 'xl'],
    [1399, 'xl'],
    [1400, 'xxl'],
    [3840, 'xxl'],
  ])('reports %ipx as %s', (width, expected) => {
    const screen = createBreakpoints({ matchMedia: fakeViewport(width).seam });
    expect(screen.current()).toBe(expected);
    screen.destroy();
  });

  it('reports the smallest breakpoint when there is no way to ask', () => {
    // Node, or an exotic host: a documented degradation rather than a throw, and
    // the smallest breakpoint is the honest answer because nothing has claimed a
    // minimum width.
    const screen = createBreakpoints();
    expect(screen.current()).toBe('xs');
    expect(screen.up('xs')).toBe(true);
    expect(screen.up('md')).toBe(false);
    screen.destroy();
  });
});

describe('F108 — Bootstrap’s four predicates, with Bootstrap’s meanings', () => {
  it('up is “this and wider”, and always true for the base', () => {
    const screen = createBreakpoints({ matchMedia: fakeViewport(992).seam });
    expect(screen.up('xs')).toBe(true);
    expect(screen.up('sm')).toBe(true);
    expect(screen.up('md')).toBe(true);
    expect(screen.up('lg')).toBe(true);
    expect(screen.up('xl')).toBe(false);
    expect(screen.up('xxl')).toBe(false);
  });

  it('down is “narrower than this” — the Bootstrap 5 meaning, not the name’s', () => {
    // The gotcha this exists to get right: `media-breakpoint-down(md)` is
    // `max-width: 767.98px`, so it EXCLUDES md.
    const atMd = createBreakpoints({ matchMedia: fakeViewport(768).seam });
    expect(atMd.down('md')).toBe(false);
    expect(atMd.down('lg')).toBe(true);

    const belowMd = createBreakpoints({ matchMedia: fakeViewport(767).seam });
    expect(belowMd.down('md')).toBe(true);
  });

  it('refuses down on the base, where Bootstrap’s own answer is an artefact', () => {
    // Bootstrap's mixin returns true there because its `@if $max` falls through,
    // not because anything is narrower than zero. A plausible boolean would be
    // worse than a refusal.
    const screen = createBreakpoints({ matchMedia: fakeViewport(0).seam });
    expect(() => screen.down('xs')).toThrow(/nothing is narrower than 'xs'/);
  });

  it('only is “this and nothing wider”', () => {
    const screen = createBreakpoints({ matchMedia: fakeViewport(800).seam });
    expect(screen.only('md')).toBe(true);
    expect(screen.only('sm')).toBe(false);
    expect(screen.only('lg')).toBe(false);
  });

  it('only on the base and on the widest, which are the mixin’s two degenerate arms', () => {
    const tiny = createBreakpoints({ matchMedia: fakeViewport(100).seam });
    expect(tiny.only('xs')).toBe(true);
    expect(tiny.only('xxl')).toBe(false);

    const huge = createBreakpoints({ matchMedia: fakeViewport(2000).seam });
    expect(huge.only('xxl')).toBe(true);
    expect(huge.only('xs')).toBe(false);
  });

  it('between is inclusive of lower and exclusive of upper, as the mixin is', () => {
    // `media-breakpoint-between(md, xl)` is 768…1199.98 — xl itself is out.
    const at768 = createBreakpoints({ matchMedia: fakeViewport(768).seam });
    expect(at768.between('md', 'xl')).toBe(true);
    const at1199 = createBreakpoints({ matchMedia: fakeViewport(1199).seam });
    expect(at1199.between('md', 'xl')).toBe(true);
    const at1200 = createBreakpoints({ matchMedia: fakeViewport(1200).seam });
    expect(at1200.between('md', 'xl')).toBe(false);
    const at767 = createBreakpoints({ matchMedia: fakeViewport(767).seam });
    expect(at767.between('md', 'xl')).toBe(false);
  });

  it('refuses a between whose bounds cannot contain anything', () => {
    // `between('lg','md')` is always false — a silent always-false is a caller
    // mistake wearing a valid answer.
    const screen = createBreakpoints({ matchMedia: fakeViewport(800).seam });
    expect(() => screen.between('lg', 'md')).toThrow(/upper must be wider than lower/);
    expect(() => screen.between('md', 'md')).toThrow(/upper must be wider than lower/);
  });

  it('names the vocabulary when asked about a breakpoint that does not exist', () => {
    const screen = createBreakpoints({ matchMedia: fakeViewport(800).seam });
    expect(() => screen.up('tablet')).toThrow(
      /up: name must be one of xs, sm, md, lg, xl, xxl — got "tablet"/,
    );
    expect(() => screen.down('tablet')).toThrow(/down: name must be one of/);
    expect(() => screen.only('tablet')).toThrow(/only: name must be one of/);
    expect(() => screen.between('tablet', 'lg')).toThrow(/between: lower must be one of/);
    expect(() => screen.between('sm', 'tablet')).toThrow(/between: upper must be one of/);
  });
});

describe('F108 — the subscribe API', () => {
  it('reports a crossing with the new and previous names', () => {
    const media = fakeViewport(500);
    const screen = createBreakpoints({ matchMedia: media.seam });
    /** @type {any[]} */
    const seen = [];
    screen.on((change) => seen.push(change));

    media.resize(800);
    media.resize(1500);
    media.resize(300);

    expect(seen).toEqual([
      { current: 'md', previous: 'xs' },
      { current: 'xxl', previous: 'md' },
      { current: 'xs', previous: 'xxl' },
    ]);
    screen.destroy();
  });

  it('says nothing when a resize crosses no boundary', () => {
    // The reason the handler is not just "on any media change": a drag from 800 to
    // 900 px changes nothing a component cares about, and notifying would hand the
    // debouncing problem straight back to the caller.
    const media = fakeViewport(800);
    const screen = createBreakpoints({ matchMedia: media.seam });
    let calls = 0;
    screen.on(() => {
      calls += 1;
    });

    media.resize(850);
    media.resize(900);
    media.resize(991);
    expect(calls).toBe(0);

    media.resize(992);
    expect(calls).toBe(1);
    screen.destroy();
  });

  it('notifies once per crossing even when several queries flip together', () => {
    // 500 → 1500 flips four of the five queries at once; a naive implementation
    // notifies four times.
    const media = fakeViewport(500);
    const screen = createBreakpoints({ matchMedia: media.seam });
    let calls = 0;
    screen.on(() => {
      calls += 1;
    });
    media.resize(1500);
    expect(calls).toBe(1);
    screen.destroy();
  });

  it('unsubscribes, idempotently', () => {
    const media = fakeViewport(500);
    const screen = createBreakpoints({ matchMedia: media.seam });
    let calls = 0;
    const off = screen.on(() => {
      calls += 1;
    });
    off();
    off();
    media.resize(1500);
    expect(calls).toBe(0);
    screen.destroy();
  });

  it('serves several subscribers, and one unsubscribing leaves the others', () => {
    const media = fakeViewport(500);
    const screen = createBreakpoints({ matchMedia: media.seam });
    const calls = [0, 0];
    const off = screen.on(() => {
      calls[0] += 1;
    });
    screen.on(() => {
      calls[1] += 1;
    });
    media.resize(800);
    off();
    media.resize(1500);
    expect(calls).toEqual([1, 2]);
    screen.destroy();
  });

  it('rejects a handler that is not a function', () => {
    const screen = createBreakpoints({ matchMedia: fakeViewport(0).seam });
    expect(() => screen.on('later')).toThrow(/handler must be a function/);
  });
});

describe('teardown', () => {
  it('detaches every media listener on destroy', () => {
    const media = fakeViewport(500);
    const screen = createBreakpoints({ matchMedia: media.seam });
    expect(media.listeners).toBe(5);

    screen.destroy();
    expect(media.listeners).toBe(0);
    // And nothing is listening, so a resize reaches no subscriber.
    media.resize(1500);
  });

  it('destroys on its signal, and is born destroyed by an aborted one', () => {
    const controller = new AbortController();
    const media = fakeViewport(500);
    const screen = createBreakpoints({ matchMedia: media.seam, signal: controller.signal });
    controller.abort();
    expect(media.listeners).toBe(0);
    expect(() => screen.current()).toThrow(/after destroy/);

    const already = createBreakpoints({
      matchMedia: fakeViewport(500).seam,
      signal: AbortSignal.abort(),
    });
    expect(() => already.up('md')).toThrow(/after destroy/);
  });

  it('throws after destroy, on every question', () => {
    const screen = createBreakpoints({ matchMedia: fakeViewport(800).seam });
    screen.destroy();
    expect(() => screen.current()).toThrow(
      /createBreakpoints: current\(\) was called after destroy/,
    );
    expect(() => screen.up('md')).toThrow(/up\(\) was called after destroy/);
    expect(() => screen.down('md')).toThrow(/down\(\) was called after destroy/);
    expect(() => screen.only('md')).toThrow(/only\(\) was called after destroy/);
    expect(() => screen.between('sm', 'lg')).toThrow(/between\(\) was called after destroy/);
    expect(() => screen.on(() => {})).toThrow(/on\(\) was called after destroy/);
    // `names` is data rather than a question, so it keeps answering.
    expect(screen.names).toEqual(['xs', 'sm', 'md', 'lg', 'xl', 'xxl']);
    expect(() => screen.destroy()).not.toThrow();
  });
});

describe('a caller-supplied breakpoint map', () => {
  it('uses it, names and all', () => {
    const media = fakeViewport(800);
    const screen = createBreakpoints({
      breakpoints: { xs: 0, tablet: 700, desktop: 1100 },
      matchMedia: media.seam,
    });
    expect(screen.names).toEqual(['xs', 'tablet', 'desktop']);
    expect(screen.current()).toBe('tablet');
    expect(screen.up('tablet')).toBe(true);
    expect(screen.down('desktop')).toBe(true);
    expect(media.queries).toBe(2);
    screen.destroy();
  });

  it('refuses a map that would make the derivation lie', () => {
    // `current` as the largest match and `down` as a complement both rest on the
    // set being nested. An out-of-order map produces answers that look plausible
    // and are wrong — the failure mode worth a throw. Bootstrap asserts the same
    // property about $grid-breakpoints.
    expect(() => createBreakpoints({ breakpoints: {} })).toThrow(/must have at least one entry/);
    expect(() => createBreakpoints({ breakpoints: { xs: 0, md: 768, sm: 576 } })).toThrow(
      /must ascend — 'sm' is not wider than 'md'/,
    );
    expect(() => createBreakpoints({ breakpoints: { xs: 0, sm: 0 } })).toThrow(/must ascend/);
    expect(() => createBreakpoints({ breakpoints: { sm: 576 } })).toThrow(
      /must start at 0 — 'sm' is 576/,
    );
    expect(() => createBreakpoints({ breakpoints: { xs: 0, sm: '576' } })).toThrow(
      /options\.breakpoints\.sm must be a non-negative finite number of pixels/,
    );
    expect(() => createBreakpoints({ breakpoints: { xs: 0, sm: Number.NaN } })).toThrow(
      /finite number/,
    );
    expect(() => createBreakpoints({ breakpoints: { xs: -1 } })).toThrow(/non-negative/);
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
    const media = fakeViewport(0);
    const screen = createBreakpoints({ matchMedia: media.seam });
    expect(ambient).not.toHaveBeenCalled();
    expect(media.queries).toBe(5);
    screen.destroy();
  });

  it('uses the ambient seam when none is injected', () => {
    const ambient = vi.fn((query) => ({
      matches: /min-width: (576|768)px/.test(query),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.stubGlobal('matchMedia', ambient);
    const screen = createBreakpoints();
    expect(ambient).toHaveBeenCalledWith('(min-width: 768px)');
    expect(screen.current()).toBe('md');
    screen.destroy();
  });

  it('refuses a seam that is not a function, and one that answers unsubscribably', () => {
    expect(() => createBreakpoints({ matchMedia: '(min-width: 768px)' })).toThrow(
      /options\.matchMedia must be a function/,
    );
    expect(() => createBreakpoints({ matchMedia: () => ({ matches: true }) })).toThrow(
      /must return a MediaQueryList with addEventListener/,
    );
    // Absence degrades; a malformed injection throws. The two must not look the
    // same, which is the whole reason the seam validates what it opens.
    expect(() => createBreakpoints()).not.toThrow();
  });

  it('rejects an unknown option, naming it', () => {
    expect(() => createBreakpoints({ breakPoints: BOOTSTRAP_BREAKPOINTS })).toThrow(
      /createBreakpoints: unknown option 'breakPoints'/,
    );
    expect(() => createBreakpoints({ signal: 'later' })).toThrow(
      /options\.signal must be an AbortSignal/,
    );
  });
});

describe('NFR-35 — no module state', () => {
  it('two observers on one page see their own viewports', () => {
    const narrow = fakeViewport(400);
    const wide = fakeViewport(1500);
    const a = createBreakpoints({ matchMedia: narrow.seam });
    const b = createBreakpoints({ matchMedia: wide.seam });

    expect(a.current()).toBe('xs');
    expect(b.current()).toBe('xxl');

    a.destroy();
    expect(wide.listeners).toBe(5);
    expect(b.current()).toBe('xxl');
    b.destroy();
  });
});

describe('the predicates agree with the current value, at every width', () => {
  it('holds the four invariants a caller would assume', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), (width) => {
        const screen = createBreakpoints({ matchMedia: fakeViewport(width).seam });
        const names = screen.names;
        const active = screen.current();
        const at = names.indexOf(active);

        for (const [index, name] of names.entries()) {
          // 1. `up` is exactly "at or below the active one in the order" — which
          //    is what makes the matching set nested rather than arbitrary.
          expect(screen.up(name)).toBe(index <= at);
          // 2. `down` is its exact complement, everywhere it is defined.
          if (index > 0) expect(screen.down(name)).toBe(index > at);
          // 3. `only` is true for exactly one breakpoint: the active one.
          expect(screen.only(name)).toBe(index === at);
        }

        // 4. `between` contains the active breakpoint iff the active one is in
        //    [lower, upper) — the half-open interval Bootstrap's mixin defines.
        for (const [lowerAt, lower] of names.entries()) {
          for (const upper of names.slice(lowerAt + 1)) {
            const upperAt = names.indexOf(upper);
            expect(screen.between(lower, upper)).toBe(at >= lowerAt && at < upperAt);
          }
        }

        screen.destroy();
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
