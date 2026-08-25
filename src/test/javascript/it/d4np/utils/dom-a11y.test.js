// @vitest-environment jsdom
// Tests (roadmap 20.5, spec 07 §2 items F109–F110, §6) for the accessibility
// primitives.
//
// jsdom implements focus and `activeElement` faithfully enough to prove the
// *model* — which element the trap hands focus to, what it restores, what it
// refuses to leave — and it does not implement the browser's own Tab traversal,
// which is why every wrap here is asserted through the handler rather than by
// pressing Tab and hoping. Real tab order on real engines is the Playwright
// suite's job.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  focusTrap,
  liveRegion,
  saveFocus,
} from '../../../../../main/javascript/it/d4np/utils/dom.js';

/** @type {Element} */
let host;
/** @type {(() => void)[]} */
let teardown;

/**
 * @param {string} html
 * @returns {Element}
 */
function mount(html) {
  host.innerHTML = html;
  return /** @type {Element} */ (host.firstElementChild);
}

/**
 * A Tab press, as the handler sees it.
 *
 * @param {Element} target
 * @param {boolean} [shiftKey]
 * @returns {Event}
 */
function tab(target, shiftKey = false) {
  const event = new window.KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

const active = () => document.activeElement;

beforeEach(() => {
  document.body.innerHTML = '<button id="outside">outside</button><div id="host"></div>';
  host = /** @type {Element} */ (document.getElementById('host'));
  teardown = [];
});

afterEach(() => {
  for (const fn of teardown) fn();
  document.body.innerHTML = '';
});

/** @param {Element} root @param {object} [options] */
function trap(root, options = {}) {
  const release = focusTrap(root, options);
  teardown.push(release);
  return release;
}

describe('focusTrap — where focus starts', () => {
  it('moves focus to the first tabbable element', () => {
    const root = mount('<div><button id="a">a</button><button id="b">b</button></div>');
    trap(root);
    expect(active()?.id).toBe('a');
  });

  it('takes an explicit target instead', () => {
    const root = mount('<div><button id="a">a</button><button id="b">b</button></div>');
    trap(root, { initialFocus: /** @type {Element} */ (document.getElementById('b')) });
    expect(active()?.id).toBe('b');
  });

  it('leaves focus alone when asked to', () => {
    /** @type {any} */ (document.getElementById('outside')).focus();
    const root = mount('<div><button id="a">a</button></div>');
    trap(root, { initialFocus: false });
    expect(active()?.id).toBe('outside');
  });

  it('focuses the root itself when there is nothing tabbable inside', () => {
    const root = mount('<div><p>nothing to focus</p></div>');
    trap(root);
    // Not `<body>`: the one place a trap must never leave anyone is outside
    // itself, and an empty root still has to hold focus.
    expect(active()).toBe(root);
    expect(root.getAttribute('tabindex')).toBe('-1');
  });

  it('does not touch a tabindex the caller set', () => {
    const root = mount('<div tabindex="0"><p>nothing</p></div>');
    const release = trap(root);
    expect(root.getAttribute('tabindex')).toBe('0');
    release();
    expect(root.getAttribute('tabindex')).toBe('0');
  });
});

describe('focusTrap — the wrap', () => {
  it('sends Tab from the last element back to the first', () => {
    const root = mount('<div><button id="a">a</button><button id="b">b</button></div>');
    trap(root);
    /** @type {any} */ (document.getElementById('b')).focus();
    const event = tab(/** @type {Element} */ (document.getElementById('b')));
    expect(event.defaultPrevented).toBe(true);
    expect(active()?.id).toBe('a');
  });

  it('sends Shift+Tab from the first element back to the last', () => {
    const root = mount('<div><button id="a">a</button><button id="b">b</button></div>');
    trap(root);
    const event = tab(/** @type {Element} */ (document.getElementById('a')), true);
    expect(event.defaultPrevented).toBe(true);
    expect(active()?.id).toBe('b');
  });

  it('leaves a Tab in the middle to the browser', () => {
    const root = mount(
      '<div><button id="a">a</button><button id="b">b</button><button id="c">c</button></div>',
    );
    trap(root);
    /** @type {any} */ (document.getElementById('b')).focus();
    const event = tab(/** @type {Element} */ (document.getElementById('b')));
    // Nothing to correct: the platform's own tab order is right here, and a trap
    // that reimplements it is a trap that gets it wrong.
    expect(event.defaultPrevented).toBe(false);
    expect(active()?.id).toBe('b');
  });

  it('pulls focus in when the key arrives with focus on the root', () => {
    const root = mount('<div><button id="a">a</button><button id="b">b</button></div>');
    trap(root, { initialFocus: false });
    /** @type {any} */ (root).focus();
    tab(root);
    expect(active()?.id).toBe('a');
  });

  it('holds the key when the root has nothing to cycle through', () => {
    const root = mount('<div><p>nothing</p></div>');
    trap(root);
    const event = tab(root);
    // The empty-root case, and the one that turns a trap into a lock if it is
    // handled by cycling: there is nothing to cycle to, so the key is simply not
    // allowed to move focus out.
    expect(event.defaultPrevented).toBe(true);
    expect(active()).toBe(root);
  });

  it('ignores every key that is not Tab', () => {
    const root = mount('<div><button id="a">a</button><button id="b">b</button></div>');
    trap(root);
    const event = new window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('focusTrap — what counts as tabbable', () => {
  /** @param {string} html @returns {string | undefined} */
  const firstFocused = (html) => {
    const root = mount(html);
    trap(root);
    return active()?.id;
  };

  it('skips a disabled control', () => {
    expect(
      firstFocused('<div><button id="a" disabled>a</button><button id="b">b</button></div>'),
    ).toBe('b');
  });

  it('skips a hidden control, and one inside a hidden ancestor', () => {
    expect(
      firstFocused('<div><button id="a" hidden>a</button><button id="b">b</button></div>'),
    ).toBe('b');
    expect(
      firstFocused(
        '<div><span hidden><button id="a">a</button></span><button id="b">b</button></div>',
      ),
    ).toBe('b');
  });

  it('skips one hidden from assistive technology', () => {
    expect(
      firstFocused(
        '<div><button id="a" aria-hidden="true">a</button><button id="b">b</button></div>',
      ),
    ).toBe('b');
  });

  it('skips a negative tabindex, which is focusable but not tabbable', () => {
    expect(
      firstFocused('<div><button id="a" tabindex="-1">a</button><button id="b">b</button></div>'),
    ).toBe('b');
  });

  it('takes an element the author opted in with tabindex', () => {
    expect(firstFocused('<div><span id="a" tabindex="0">a</span></div>')).toBe('a');
  });

  it('takes a link with an href and not one without', () => {
    expect(firstFocused('<div><a id="a">a</a><a id="b" href="#x">b</a></div>')).toBe('b');
  });
});

describe('focusTrap — release', () => {
  it('restores focus to where it came from', () => {
    /** @type {any} */ (document.getElementById('outside')).focus();
    const root = mount('<div><button id="a">a</button></div>');
    const release = trap(root);
    expect(active()?.id).toBe('a');
    release();
    expect(active()?.id).toBe('outside');
  });

  it('does not restore when asked not to', () => {
    /** @type {any} */ (document.getElementById('outside')).focus();
    const root = mount('<div><button id="a">a</button></div>');
    trap(root, { restore: false })();
    expect(active()?.id).toBe('a');
  });

  it('does not restore focus to a node the operation removed', () => {
    const gone = document.createElement('button');
    document.body.append(gone);
    gone.focus();
    const root = mount('<div><button id="a">a</button></div>');
    const release = trap(root);
    gone.remove();
    // Refocusing a detached node either throws or silently focuses nothing;
    // neither is a restoration, so it simply does not happen.
    expect(() => release()).not.toThrow();
    expect(active()?.id).toBe('a');
  });

  it('is idempotent, and stops trapping', () => {
    const root = mount('<div><button id="a">a</button><button id="b">b</button></div>');
    const release = trap(root);
    release();
    release();
    /** @type {any} */ (document.getElementById('b')).focus();
    const event = tab(/** @type {Element} */ (document.getElementById('b')));
    expect(event.defaultPrevented).toBe(false);
    expect(root.getAttribute('tabindex')).toBe(null);
  });

  it('releases on an aborted signal, and starts released when already aborted', () => {
    const root = mount('<div><button id="a">a</button><button id="b">b</button></div>');
    const controller = new AbortController();
    focusTrap(root, { signal: controller.signal });
    controller.abort();
    expect(tab(/** @type {Element} */ (document.getElementById('b'))).defaultPrevented).toBe(false);

    const already = new AbortController();
    already.abort();
    const second = mount('<div><button id="c">c</button></div>');
    focusTrap(second, { signal: already.signal });
    expect(second.getAttribute('tabindex')).toBe(null);
  });
});

describe('focusTrap — the contract', () => {
  it('refuses a root that is not an Element', () => {
    expect(() => focusTrap(null)).toThrow(/root must be an Element/);
  });

  it('refuses an unknown option and a malformed one', () => {
    const root = mount('<div><button>a</button></div>');
    expect(() => focusTrap(root, { restor: true })).toThrow(/focusTrap: unknown option 'restor'/);
    expect(() => focusTrap(root, { restore: 'yes' })).toThrow(/restore must be a boolean/);
    expect(() => focusTrap(root, { initialFocus: 'a' })).toThrow(
      /initialFocus must be an Element or false/,
    );
    expect(() => focusTrap(root, { signal: 'no' })).toThrow(/signal must be an AbortSignal/);
    expect(() => focusTrap(root, null)).toThrow(/options must be an object/);
  });
});

describe('liveRegion', () => {
  /** @param {object} [options] */
  function announcer(options = {}) {
    const instance = liveRegion(options);
    teardown.push(() => instance.destroy());
    return instance;
  }

  it('builds a polite, atomic region that is hidden but not removed', () => {
    const { element } = announcer();
    expect(element.getAttribute('role')).toBe('status');
    expect(element.getAttribute('aria-live')).toBe('polite');
    expect(element.getAttribute('aria-atomic')).toBe('true');
    // `display: none` would take it out of the accessibility tree along with the
    // screen, which is the mistake that makes a live region silent.
    const style = element.getAttribute('style') ?? '';
    expect(style).toContain('position:absolute');
    expect(style).not.toContain('display:none');
    expect(element.parentElement).toBe(document.body);
  });

  it('builds an assertive region as an alert', () => {
    const { element } = announcer({ politeness: 'assertive' });
    expect(element.getAttribute('role')).toBe('alert');
    expect(element.getAttribute('aria-live')).toBe('assertive');
  });

  it('takes a class instead of the inline styles', () => {
    const { element } = announcer({ class: 'visually-hidden' });
    expect(element.getAttribute('class')).toBe('visually-hidden');
    expect(element.getAttribute('style')).toBe(null);
  });

  it('says what it is told', () => {
    const region = announcer();
    region.announce('Column moved to position 2 of 3');
    expect(region.element.textContent).toBe('Column moved to position 2 of 3');
  });

  it('makes the same message twice differ, so it is read twice', () => {
    const region = announcer();
    region.announce('Saved');
    region.announce('Saved');
    // A live region is announced when its content *changes*; identical text is
    // silence the second time. The trailing space differs without changing a word
    // of what is read.
    expect(region.element.textContent).toBe('Saved ');
    region.announce('Saved');
    expect(region.element.textContent).toBe('Saved');
  });

  it('never moves focus', () => {
    /** @type {any} */ (document.getElementById('outside')).focus();
    const region = announcer();
    region.announce('something happened');
    // The entire point: a screen-reader user hears it without being thrown
    // anywhere, which is what makes it usable from a keyboard handler.
    expect(active()?.id).toBe('outside');
  });

  it('builds in an injected document', () => {
    const other = document.implementation.createHTMLDocument('other');
    const region = liveRegion({ document: other });
    expect(region.element.ownerDocument).toBe(other);
    expect(other.body.contains(region.element)).toBe(true);
    region.destroy();
  });

  it('destroys once, and refuses to speak afterwards', () => {
    const region = liveRegion();
    const { element } = region;
    region.destroy();
    region.destroy();
    expect(element.parentElement).toBe(null);
    expect(() => region.announce('too late')).toThrow(/announce\(\) was called after destroy\(\)/);
  });

  it('destroys on an aborted signal, and starts destroyed when already aborted', () => {
    const controller = new AbortController();
    const region = liveRegion({ signal: controller.signal });
    controller.abort();
    expect(region.element.parentElement).toBe(null);

    const already = new AbortController();
    already.abort();
    const second = liveRegion({ signal: already.signal });
    expect(second.element.parentElement).toBe(null);
  });

  it('refuses an unknown option, a malformed one and a message that is not a string', () => {
    expect(() => liveRegion({ polite: true })).toThrow(/liveRegion: unknown option 'polite'/);
    expect(() => liveRegion({ politeness: 'shouty' })).toThrow(
      /politeness must be 'polite' or 'assertive'/,
    );
    expect(() => liveRegion({ class: 1 })).toThrow(/options\.class must be a string/);
    expect(() => liveRegion({ document: 'no' })).toThrow(/options\.document must be a Document/);
    expect(() => liveRegion({ signal: 'no' })).toThrow(/signal must be an AbortSignal/);
    expect(() => liveRegion(null)).toThrow(/options must be an object/);
    const region = announcer();
    expect(() => region.announce(42)).toThrow(/message must be a string/);
  });
});

describe('saveFocus — the half that already existed', () => {
  it('puts focus back where it was', () => {
    /** @type {any} */ (document.getElementById('outside')).focus();
    const restore = saveFocus();
    const later = mount('<div><button id="a">a</button></div>');
    /** @type {any} */ (later.firstElementChild).focus();
    expect(active()?.id).toBe('a');
    restore();
    expect(active()?.id).toBe('outside');
  });

  it('is idempotent', () => {
    /** @type {any} */ (document.getElementById('outside')).focus();
    const restore = saveFocus();
    restore();
    const later = mount('<div><button id="a">a</button></div>');
    /** @type {any} */ (later.firstElementChild).focus();
    // The second call is a no-op, not a second restoration: a teardown that
    // steals focus back later is worse than one that runs once.
    restore();
    expect(active()?.id).toBe('a');
  });

  it('does not refocus a node that has left the document', () => {
    const gone = document.createElement('button');
    document.body.append(gone);
    gone.focus();
    const restore = saveFocus();
    gone.remove();
    const later = mount('<div><button id="a">a</button></div>');
    /** @type {any} */ (later.firstElementChild).focus();
    expect(() => restore()).not.toThrow();
    expect(active()?.id).toBe('a');
  });

  it('reads an injected document', () => {
    const other = document.implementation.createHTMLDocument('other');
    // Nothing has focus there; restoring is a no-op rather than a throw.
    expect(() => saveFocus({ document: other })()).not.toThrow();
  });

  it('refuses an unknown option and a malformed one', () => {
    expect(() => saveFocus({ doc: document })).toThrow(/saveFocus: unknown option 'doc'/);
    expect(() => saveFocus({ document: 'no' })).toThrow(/options\.document must be a Document/);
    expect(() => saveFocus(null)).toThrow(/options must be an object/);
  });
});
