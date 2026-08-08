// @vitest-environment jsdom
// Example tests (roadmap 16.4, spec 04 §2 items F80-F81, NFR-15/NFR-18/NFR-19,
// ADR-0044) for the Popper-backed overlays — the last two components of the
// catalogue. Two properties carry the weight, and both are unique to this pair:
// the second peer is reported as itself rather than as Bootstrap, and exactly
// one sanitizer runs over content handed to a third-party renderer.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bsPopover, bsTooltip } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

/**
 * A stand-in for Bootstrap's namespace.
 *
 * @param {{ popperMissing?: boolean }} [config] - With `popperMissing`, `show`
 *   throws the exact complaint Bootstrap raises when Popper is absent — from
 *   inside `show`, as Bootstrap does, not from the constructor.
 * @returns {{ namespace: Record<string, unknown>, created: object[] }}
 */
function makeBootstrap(config = {}) {
  const created = [];

  /** @param {string} ns */
  const make = (ns) =>
    class Fake {
      /**
       * @param {Element} element
       * @param {Record<string, unknown>} [options]
       */
      constructor(element, options) {
        this.element = element;
        this.config = options ?? {};
        this.ns = ns;
        this.shown = false;
        this.disposed = false;
        this.calls = [];
        this.slots = undefined;
        created.push(this);
      }

      /** @param {string} type */
      fire(type) {
        this.element.dispatchEvent(new Event(`${type}.${this.ns}`, { bubbles: true }));
      }

      show() {
        if (config.popperMissing === true) {
          throw new TypeError(
            "Bootstrap's tooltips require Popper (https://popper.js.org/docs/v2/)",
          );
        }
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

      enable() {
        this.calls.push('enable');
      }

      disable() {
        this.calls.push('disable');
      }

      toggleEnabled() {
        this.calls.push('toggleEnabled');
      }

      update() {
        this.calls.push('update');
      }

      /** @param {Record<string, unknown>} slots */
      setContent(slots) {
        this.slots = slots;
        this.calls.push('setContent');
      }

      dispose() {
        this.disposed = true;
      }
    };

  return {
    namespace: { Tooltip: make('bs.tooltip'), Popover: make('bs.popover') },
    created,
  };
}

/** @returns {Element} */
function host() {
  const el = document.createElement('button');
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('F80 — bsTooltip', () => {
  it('passes a plain string as text, involving no sanitizer at all', () => {
    const { namespace, created } = makeBootstrap();
    const tip = bsTooltip(host(), { title: 'Save the draft', bootstrap: namespace });

    tip.show();

    expect(created[0].config.title).toBe('Save the draft');
    // Neither flag is set, so Bootstrap writes textContent and nothing is parsed.
    expect(created[0].config.html).toBeUndefined();
    expect(created[0].config.sanitize).toBeUndefined();
  });

  it('runs the caller’s sanitizer and switches Bootstrap’s own off (NFR-19)', () => {
    // The one-sanitizer rule: our pass happens first, and Bootstrap must then
    // neither escape nor re-filter what it is handed.
    const { namespace, created } = makeBootstrap();
    const sanitize = vi.fn((markup) => markup.replace(/<script[\s\S]*?<\/script>/g, ''));
    const tip = bsTooltip(host(), {
      title: '<b>Bold</b><script>alert(1)</script>',
      html: true,
      sanitize,
      bootstrap: namespace,
    });

    tip.show();

    expect(sanitize).toHaveBeenCalledTimes(1);
    expect(created[0].config.title).toBe('<b>Bold</b>');
    expect(created[0].config.html).toBe(true);
    expect(created[0].config.sanitize).toBe(false);
  });

  it('requires the sanitize half of the pair, and rejects a bad sanitizer', () => {
    const { namespace } = makeBootstrap();
    expect(() =>
      bsTooltip(host(), { title: '<b>x</b>', html: true, bootstrap: namespace }),
    ).toThrow(/options.sanitize is required/);
    expect(() =>
      bsTooltip(host(), { title: 'x', html: true, sanitize: 'no', bootstrap: namespace }),
    ).toThrow(TypeError);
    expect(() =>
      bsTooltip(host(), { title: 'x', html: true, sanitize: () => 42, bootstrap: namespace }),
    ).toThrow(/must return a string/);
  });

  it('accepts `sanitize: false` as a signed declaration of trust', () => {
    const { namespace, created } = makeBootstrap();
    bsTooltip(host(), {
      title: '<em>trusted</em>',
      html: true,
      sanitize: false,
      bootstrap: namespace,
    }).show();

    expect(created[0].config.title).toBe('<em>trusted</em>');
    expect(created[0].config.sanitize).toBe(false);
  });

  it('hands an element over untouched', () => {
    const { namespace, created } = makeBootstrap();
    const node = document.createElement('span');
    bsTooltip(host(), { title: node, bootstrap: namespace }).show();

    expect(created[0].config.title).toBe(node);
  });

  it('forwards the positioning options a caller sets, and only those', () => {
    const { namespace, created } = makeBootstrap();
    bsTooltip(host(), {
      title: 'x',
      placement: 'right',
      trigger: 'click',
      container: 'body',
      delay: { show: 200, hide: 0 },
      customClass: 'egl-tip',
      bootstrap: namespace,
    }).show();

    expect(created[0].config).toEqual({
      title: 'x',
      placement: 'right',
      trigger: 'click',
      container: 'body',
      delay: { show: 200, hide: 0 },
      customClass: 'egl-tip',
    });
  });

  it('drives enable, disable and update', () => {
    const { namespace, created } = makeBootstrap();
    const tip = bsTooltip(host(), { title: 'x', bootstrap: namespace });

    tip.disable();
    tip.enable();
    tip.toggleEnabled();
    tip.update();

    expect(created[0].calls).toEqual(['disable', 'enable', 'toggleEnabled', 'update']);
  });

  it('replaces content through the tooltip’s own slot, under the same rule', () => {
    const { namespace, created } = makeBootstrap();
    const sanitize = vi.fn((markup) => markup);
    const tip = bsTooltip(host(), { title: 'a', html: true, sanitize, bootstrap: namespace });

    tip.setContent({ title: '<i>b</i>' });

    expect(created[0].slots).toEqual({ '.tooltip-inner': '<i>b</i>' });
    // Once at construction, once here — never twice for one value.
    expect(sanitize).toHaveBeenCalledTimes(2);
  });

  it('sequences a replacement on a shown tip: hide, replace, show', () => {
    // Bootstrap's own setContent removes a live tip and does not restore it
    // (measured against Bootstrap directly). Replacing content is not a request
    // to close, so the wrapper hides first and shows again once the tip has
    // actually gone — the same hide-then-act idiom `destroy` uses.
    const { namespace, created } = makeBootstrap();
    const tip = bsTooltip(host(), { title: 'a', bootstrap: namespace });
    tip.show();
    expect(created[0].shown).toBe(true);

    tip.setContent({ title: 'b' });

    expect(created[0].slots).toEqual({ '.tooltip-inner': 'b' });
    // Back on screen, not left closed by the replacement.
    expect(created[0].shown).toBe(true);
    expect(created[0].calls).toContain('setContent');
  });

  it('applies straight through when the tip is not on screen', () => {
    const { namespace, created } = makeBootstrap();
    const tip = bsTooltip(host(), { title: 'a', bootstrap: namespace });

    tip.setContent({ title: 'b' });

    expect(created[0].slots).toEqual({ '.tooltip-inner': 'b' });
    expect(created[0].shown).toBe(false);
  });

  it('refuses popover-only content, rather than dropping it silently', () => {
    const { namespace } = makeBootstrap();
    expect(() => bsTooltip(host(), { content: 'x', bootstrap: namespace })).toThrow(/use title/);
    expect(() =>
      bsTooltip(host(), { title: 'x', bootstrap: namespace }).setContent({ content: 'y' }),
    ).toThrow(/use title/);
  });

  it('closes before disposing, and honours an aborted signal (NFR-15)', () => {
    const { namespace, created } = makeBootstrap();
    const controller = new AbortController();
    const tip = bsTooltip(host(), {
      title: 'x',
      bootstrap: namespace,
      signal: controller.signal,
    });
    tip.show();
    tip.hide();

    controller.abort();

    expect(created[0].disposed).toBe(true);
    expect(() => tip.show()).toThrow(TypeError);
  });

  it('subscribes over bs.tooltip and unsubscribes', () => {
    const { namespace } = makeBootstrap();
    const target = host();
    const tip = bsTooltip(target, { title: 'x', bootstrap: namespace });
    const seen = vi.fn();

    const off = tip.on('shown', seen);
    target.dispatchEvent(new Event('shown.bs.tooltip'));
    expect(seen).toHaveBeenCalledTimes(1);

    off();
    target.dispatchEvent(new Event('shown.bs.tooltip'));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed input', () => {
    expect(() => bsTooltip(null)).toThrow(TypeError);
    expect(() => bsTooltip(host(), { title: 42 })).toThrow(/must be a string or an Element/);
    expect(() => bsTooltip(host(), { placement: 'top left' })).toThrow(TypeError);
    expect(() => bsTooltip(host(), { trigger: 7 })).toThrow(TypeError);
    expect(() => bsTooltip(host(), { customClass: 7 })).toThrow(TypeError);
    expect(() => bsTooltip(host(), { title: 'x', bootstrap: {} }).setContent('no')).toThrow(
      TypeError,
    );
  });
});

describe('F81 — bsPopover', () => {
  it('carries both slots, and sanitizes each exactly once', () => {
    const { namespace, created } = makeBootstrap();
    const sanitize = vi.fn((markup) => markup);
    const help = bsPopover(host(), {
      title: '<b>Saved</b>',
      content: '<p>Kept locally.</p>',
      html: true,
      sanitize,
      bootstrap: namespace,
    });

    help.show();

    expect(created[0].config.title).toBe('<b>Saved</b>');
    expect(created[0].config.content).toBe('<p>Kept locally.</p>');
    expect(created[0].config.sanitize).toBe(false);
    expect(sanitize).toHaveBeenCalledTimes(2);
  });

  it('replaces both slots by their Bootstrap selectors', () => {
    const { namespace, created } = makeBootstrap();
    const help = bsPopover(host(), { title: 'a', content: 'b', bootstrap: namespace });

    help.setContent({ title: 'c', content: 'd' });

    expect(created[0].slots).toEqual({ '.popover-header': 'c', '.popover-body': 'd' });
  });

  it('leaves an untouched slot alone', () => {
    const { namespace, created } = makeBootstrap();
    const help = bsPopover(host(), { title: 'a', content: 'b', bootstrap: namespace });

    help.setContent({ content: 'only the body' });

    expect(created[0].slots).toEqual({
      '.popover-header': undefined,
      '.popover-body': 'only the body',
    });
  });

  it('uses its own event namespace', () => {
    const { namespace } = makeBootstrap();
    const target = host();
    const help = bsPopover(target, { title: 'x', bootstrap: namespace });
    const seen = vi.fn();

    help.on('hidden', seen);
    target.dispatchEvent(new Event('hidden.bs.popover'));
    expect(seen).toHaveBeenCalledTimes(1);

    // Not the tooltip's — a wrapper that listened to both would fire twice on a
    // page carrying each.
    target.dispatchEvent(new Event('hidden.bs.tooltip'));
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('the second peer (spec 04 F68, NFR-18)', () => {
  it('reports Popper as itself, not as bootstrap', () => {
    // The distinction that matters to whoever has to fix it: `bootstrap` is
    // installed and working; the missing package is Popper.
    const { namespace } = makeBootstrap({ popperMissing: true });
    const tip = bsTooltip(host(), { title: 'x', bootstrap: namespace });

    let caught;
    try {
      tip.show();
    } catch (error) {
      caught = error;
    }

    expect(caught?.code).toBe('EGL_PEER_MISSING');
    expect(caught?.peer).toBe('@popperjs/core');
    expect(caught?.message).toMatch(/bootstrap\.bundle/);
    // The original diagnostic is kept rather than discarded.
    expect(caught?.cause).toBeInstanceOf(TypeError);
  });

  it('translates the complaint from every path that can reach Popper', () => {
    const { namespace } = makeBootstrap({ popperMissing: true });
    const help = bsPopover(host(), { title: 'x', bootstrap: namespace });

    expect(() => help.show()).toThrow(expect.objectContaining({ peer: '@popperjs/core' }));
    expect(() => help.toggle()).toThrow(expect.objectContaining({ peer: '@popperjs/core' }));
  });

  it('forwards the remaining positioning options too', () => {
    const { namespace, created } = makeBootstrap();
    const boundary = host();
    bsPopover(host(), {
      title: 'x',
      offset: [0, 8],
      animation: false,
      fallbackPlacements: ['top', 'bottom'],
      boundary,
      bootstrap: namespace,
    }).show();

    expect(created[0].config).toMatchObject({
      offset: [0, 8],
      animation: false,
      fallbackPlacements: ['top', 'bottom'],
      boundary,
    });
  });

  it('passes a thrown non-Error through untouched', () => {
    const Tooltip = class {
      show() {
        throw 'a string, not an Error';
      }
      dispose() {}
    };
    expect(() => bsTooltip(host(), { title: 'x', bootstrap: { Tooltip } }).show()).toThrow(
      'a string, not an Error',
    );
  });

  it('does not mistranslate an unrelated failure', () => {
    // Turning any error into a packaging one would send the caller to the wrong
    // fix; only Bootstrap's own Popper complaint is translated.
    const Tooltip = class {
      show() {
        throw new RangeError('something else entirely');
      }
      dispose() {}
    };
    const tip = bsTooltip(host(), { title: 'x', bootstrap: { Tooltip } });

    expect(() => tip.show()).toThrow(RangeError);
  });

  it('still reports a missing bootstrap namespace as bootstrap', () => {
    const tip = bsTooltip(host(), { title: 'x' });
    let caught;
    try {
      tip.show();
    } catch (error) {
      caught = error;
    }
    expect(caught?.code).toBe('EGL_PEER_MISSING');
    expect(caught?.peer).toBe('bootstrap');
  });

  it('constructs both with no peer at all', () => {
    expect(() => bsTooltip(host(), { title: 'x' })).not.toThrow();
    expect(() => bsPopover(host(), { title: 'x', content: 'y' })).not.toThrow();
  });
});
