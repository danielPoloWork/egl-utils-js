// @vitest-environment jsdom
// Example tests (roadmap 12.1, spec 03 §2 item F49, NFR-15, ADR-0031) for the
// inline alert component. The two properties worth the most attention here are
// instance isolation (two alerts on one page never share a timer or a container)
// and teardown completeness — both are what the static-singleton shape gets
// wrong, and both are asserted directly rather than inferred.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineAlert } from '../../../../../main/javascript/it/d4np/utils/dom.js';

/** @type {HTMLElement} */
let host;

beforeEach(() => {
  document.body.innerHTML =
    '<div id="host"><p id="sibling">existing</p></div><div id="other"></div>';
  host = /** @type {HTMLElement} */ (document.getElementById('host'));
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('inlineAlert — the close control is not an icon slot', () => {
  it('stays visible when its icon is deliberately empty', () => {
    // Found by 14.2/F64: a design system that draws the close glyph in CSS
    // (Bootstrap's `.btn-close` background image) supplies an empty icon, and
    // hiding the control for that leaves a dismissible alert nobody can
    // dismiss. `dismissible: false` is how a caller asks for no button; an
    // empty glyph asks for no *glyph*.
    const alerts = inlineAlert(host, { icons: { close: '' } });
    alerts.show('info', 'Message');

    const close = /** @type {HTMLElement} */ (host.querySelector('button'));
    expect(close).not.toBeNull();
    expect(close.hidden).toBe(false);
    expect(close.textContent).toBe('');

    close.click();
    expect(/** @type {HTMLElement} */ (host.querySelector('div')).hidden).toBe(true);
  });

  it('still hides an empty decorative icon slot', () => {
    // The rule is right for the icon span, which is why it stays there.
    const alerts = inlineAlert(host, { icons: { success: '' } });
    alerts.show('success', 'Saved');
    const icon = /** @type {HTMLElement} */ (host.querySelector('.egl-alert__icon'));
    expect(icon.hidden).toBe(true);
  });
});

/** @param {Element} container */
const alertIn = (container) => container.querySelector('.egl-alert');

describe('inlineAlert — rendering', () => {
  it('creates nothing until the first show', () => {
    inlineAlert(host);
    expect(alertIn(host)).toBeNull();
    expect(host.children).toHaveLength(1);
  });

  it('renders the message as text and keeps the container’s other children', () => {
    inlineAlert(host).show('success', 'Saved.');

    const alert = /** @type {HTMLElement} */ (alertIn(host));
    expect(alert.querySelector('.egl-alert__message')?.textContent).toBe('Saved.');
    expect(document.getElementById('sibling')).not.toBeNull();
  });

  it('never parses a message containing markup', () => {
    inlineAlert(host).show('danger', '<img src=x onerror="alert(1)">');

    const message = /** @type {HTMLElement} */ (host.querySelector('.egl-alert__message'));
    expect(message.querySelector('img')).toBeNull();
    expect(message.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it.each([
    ['success', 'status'],
    ['info', 'status'],
    ['warning', 'alert'],
    ['danger', 'alert'],
  ])('%s carries the neutral kind class and role=%s', (kind, role) => {
    inlineAlert(host).show(/** @type {never} */ (kind), 'message');

    const alert = /** @type {HTMLElement} */ (alertIn(host));
    expect(alert.className).toBe(`egl-alert egl-alert--${kind}`);
    expect(alert.getAttribute('role')).toBe(role);
  });

  it('reuses the same node when shown again, rather than stacking alerts', () => {
    const alerts = inlineAlert(host);
    alerts.show('info', 'first');
    const first = alertIn(host);
    alerts.show('danger', 'second');

    expect(host.querySelectorAll('.egl-alert')).toHaveLength(1);
    expect(alertIn(host)).toBe(first);
    expect(host.querySelector('.egl-alert__message')?.textContent).toBe('second');
  });

  it('takes injected class names, so a design system needs no library change', () => {
    inlineAlert(host, {
      classes: { base: 'alert', success: 'alert-success', message: 'alert-body' },
    }).show('success', 'ok');

    const alert = /** @type {HTMLElement} */ (host.querySelector('.alert'));
    expect(alert.className).toBe('alert alert-success');
    expect(alert.querySelector('.alert-body')?.textContent).toBe('ok');
  });
});

describe('inlineAlert — icons', () => {
  it('renders a string icon as text and hides the slot when a kind has none', () => {
    const alerts = inlineAlert(host, { icons: { success: '✓' } });

    alerts.show('success', 'ok');
    const icon = /** @type {HTMLElement} */ (host.querySelector('.egl-alert__icon'));
    expect(icon.textContent).toBe('✓');
    expect(icon.hidden).toBe(false);

    alerts.show('info', 'no icon for this kind');
    expect(icon.hidden).toBe(true);
    expect(icon.textContent).toBe('');
  });

  it('clones a node icon, so one map can serve several instances', () => {
    const template = document.createElement('svg');
    template.id = 'icon-source';
    const alerts = inlineAlert(host, { icons: { info: template } });

    alerts.show('info', 'one');
    alerts.show('info', 'two');

    // The original never moves into the alert — it is still detached.
    expect(template.parentNode).toBeNull();
    const rendered = host.querySelectorAll('#icon-source');
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).not.toBe(template);
  });

  it('accepts a factory and passes it the kind', () => {
    const icon = vi.fn((kind) => `[${kind}]`);
    inlineAlert(host, { icons: { warning: icon } }).show('warning', 'careful');

    expect(icon).toHaveBeenCalledWith('warning');
    expect(host.querySelector('.egl-alert__icon')?.textContent).toBe('[warning]');
  });

  it('rejects an icon that is neither a string, a node, nor a function', () => {
    const alerts = inlineAlert(host, { icons: { danger: /** @type {never} */ (42) } });
    expect(() => alerts.show('danger', 'x')).toThrow(TypeError);
  });
});

describe('inlineAlert — the close button', () => {
  it('is type=button, so it cannot submit a surrounding form', () => {
    inlineAlert(host).show('info', 'inside a form');

    const close = /** @type {HTMLButtonElement} */ (host.querySelector('.egl-alert__close'));
    expect(close.type).toBe('button');
    expect(close.getAttribute('aria-label')).toBe('Close');
  });

  it('takes a custom label and glyph', () => {
    inlineAlert(host, { closeLabel: 'Chiudi', icons: { close: '✕' } }).show('info', 'x');

    const close = /** @type {HTMLElement} */ (host.querySelector('.egl-alert__close'));
    expect(close.getAttribute('aria-label')).toBe('Chiudi');
    expect(close.textContent).toBe('✕');
  });

  it('hides the alert when clicked', () => {
    inlineAlert(host).show('info', 'dismiss me');
    const alert = /** @type {HTMLElement} */ (alertIn(host));
    expect(alert.hidden).toBe(false);

    /** @type {HTMLElement} */ (host.querySelector('.egl-alert__close')).click();
    expect(alert.hidden).toBe(true);
  });

  it('is absent when dismissible is false', () => {
    inlineAlert(host, { dismissible: false }).show('info', 'sticky');
    expect(host.querySelector('.egl-alert__close')).toBeNull();
  });
});

describe('inlineAlert — auto-hide timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('hides after the configured delay, and not before', () => {
    inlineAlert(host, { autoHideMs: 3_000 }).show('success', 'saved');
    const alert = /** @type {HTMLElement} */ (alertIn(host));

    vi.advanceTimersByTime(2_999);
    expect(alert.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(alert.hidden).toBe(true);
  });

  it('stays open when no auto-hide is configured', () => {
    inlineAlert(host).show('info', 'stays');

    vi.advanceTimersByTime(60_000);
    expect(/** @type {HTMLElement} */ (alertIn(host)).hidden).toBe(false);
  });

  it('gives a newer message its full time instead of the older timer’s tail', () => {
    // The defect this component exists to prevent: the first alert's pending
    // timer closing the second one early.
    const alerts = inlineAlert(host, { autoHideMs: 1_000 });
    alerts.show('info', 'first');
    vi.advanceTimersByTime(900);
    alerts.show('danger', 'second');

    vi.advanceTimersByTime(900);
    expect(/** @type {HTMLElement} */ (alertIn(host)).hidden).toBe(false);
    vi.advanceTimersByTime(100);
    expect(/** @type {HTMLElement} */ (alertIn(host)).hidden).toBe(true);
  });

  it('takes a per-show override, including pinning the alert open', () => {
    const alerts = inlineAlert(host, { autoHideMs: 1_000 });
    alerts.show('info', 'pinned', { autoHideMs: 0 });

    vi.advanceTimersByTime(10_000);
    expect(/** @type {HTMLElement} */ (alertIn(host)).hidden).toBe(false);

    alerts.show('info', 'brief', { autoHideMs: 50 });
    vi.advanceTimersByTime(50);
    expect(/** @type {HTMLElement} */ (alertIn(host)).hidden).toBe(true);
  });

  it('an explicit hide() cancels a pending timer', () => {
    const alerts = inlineAlert(host, { autoHideMs: 500 });
    alerts.show('info', 'x');
    alerts.hide();
    alerts.show('info', 'y', { autoHideMs: 5_000 });

    // If hide() had left the first timer running, this would already be hidden.
    vi.advanceTimersByTime(600);
    expect(/** @type {HTMLElement} */ (alertIn(host)).hidden).toBe(false);
  });

  it('hide() before any show is a no-op, not a crash', () => {
    expect(() => inlineAlert(host).hide()).not.toThrow();
  });
});

describe('inlineAlert — instance isolation', () => {
  it('two instances never share a container, a node, or a timer', () => {
    vi.useFakeTimers();
    const other = /** @type {HTMLElement} */ (document.getElementById('other'));
    const page = inlineAlert(host, { autoHideMs: 1_000 });
    const dialog = inlineAlert(other);

    page.show('danger', 'page-level');
    dialog.show('info', 'dialog-level');

    expect(host.querySelector('.egl-alert__message')?.textContent).toBe('page-level');
    expect(other.querySelector('.egl-alert__message')?.textContent).toBe('dialog-level');

    // The page alert's auto-hide must not touch the dialog's alert.
    vi.advanceTimersByTime(1_000);
    expect(/** @type {HTMLElement} */ (alertIn(host)).hidden).toBe(true);
    expect(/** @type {HTMLElement} */ (alertIn(other)).hidden).toBe(false);
  });

  it('destroying one instance leaves the other working', () => {
    const other = /** @type {HTMLElement} */ (document.getElementById('other'));
    const first = inlineAlert(host);
    const second = inlineAlert(other);
    first.show('info', 'one');
    second.show('info', 'two');

    first.destroy();
    expect(alertIn(host)).toBeNull();
    expect(alertIn(other)).not.toBeNull();
    expect(() => second.show('success', 'still fine')).not.toThrow();
  });
});

describe('inlineAlert — teardown (NFR-15)', () => {
  it('destroy() removes the node, the listener, and any pending timer', () => {
    vi.useFakeTimers();
    const alerts = inlineAlert(host, { autoHideMs: 1_000 });
    alerts.show('info', 'x');
    const close = /** @type {HTMLElement} */ (host.querySelector('.egl-alert__close'));
    const removed = /** @type {HTMLElement} */ (alertIn(host));

    alerts.destroy();

    expect(alertIn(host)).toBeNull();
    expect(host.contains(removed)).toBe(false);
    // The detached button's listener is gone too: clicking it must not throw or
    // re-enter a destroyed instance.
    expect(() => close.click()).not.toThrow();
    // And no timer survives to fire into the torn-down instance.
    expect(() => vi.advanceTimersByTime(5_000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroy() is idempotent', () => {
    const alerts = inlineAlert(host);
    alerts.show('info', 'x');
    alerts.destroy();
    expect(() => alerts.destroy()).not.toThrow();
  });

  it('destroy() before any show leaves the container untouched', () => {
    const alerts = inlineAlert(host);
    expect(() => alerts.destroy()).not.toThrow();
    expect(host.children).toHaveLength(1);
  });

  it('an aborted signal destroys the instance', () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const alerts = inlineAlert(host, { autoHideMs: 1_000, signal: controller.signal });
    alerts.show('info', 'x');

    controller.abort();

    expect(alertIn(host)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a signal already aborted at construction yields a destroyed instance', () => {
    const alerts = inlineAlert(host, { signal: AbortSignal.abort() });
    expect(() => alerts.show('info', 'x')).toThrow(/after destroy/);
    expect(alertIn(host)).toBeNull();
  });

  it('show() after destroy() throws rather than silently doing nothing', () => {
    const alerts = inlineAlert(host);
    alerts.destroy();
    expect(() => alerts.show('info', 'x')).toThrow(TypeError);
  });

  it('hide() after destroy() throws, like every other command', () => {
    // Changed in 17.8 (ADR-0049). It used to be "harmless", which made the
    // component inconsistent with itself: `show()` already threw. A command on a
    // destroyed instance that silently does nothing is the failure mode this
    // library refuses everywhere else.
    const alerts = inlineAlert(host);
    alerts.show('info', 'x');
    alerts.destroy();
    expect(() => alerts.hide()).toThrow('inlineAlert: hide() was called after destroy()');
  });
});

describe('inlineAlert — markup requires the sanitize decision (F47 parity)', () => {
  it('throws when html is true and sanitize is missing', () => {
    const alerts = inlineAlert(host);
    expect(() => alerts.show('info', '<b>x</b>', { html: true })).toThrow(/sanitize is required/);
  });

  it('runs the supplied sanitizer and inserts what it returns', () => {
    const sanitize = vi.fn(() => '<b>clean</b>');
    inlineAlert(host).show('info', '<b>dirty</b><script>x()</script>', { html: true, sanitize });

    expect(sanitize).toHaveBeenCalledWith('<b>dirty</b><script>x()</script>');
    const message = /** @type {HTMLElement} */ (host.querySelector('.egl-alert__message'));
    expect(message.innerHTML).toBe('<b>clean</b>');
  });

  it('accepts sanitize: false as an explicit trust declaration', () => {
    inlineAlert(host).show('info', '<b>trusted</b>', { html: true, sanitize: false });
    expect(host.querySelector('.egl-alert__message')?.innerHTML).toBe('<b>trusted</b>');
  });

  it('rejects a sanitize value that is neither a function nor false', () => {
    const alerts = inlineAlert(host);
    expect(() =>
      alerts.show('info', 'x', { html: true, sanitize: /** @type {never} */ ('nope') }),
    ).toThrow(TypeError);
  });

  it('rejects a sanitizer that returns something other than a string', () => {
    const alerts = inlineAlert(host);
    expect(() =>
      alerts.show('info', 'x', { html: true, sanitize: /** @type {never} */ (() => 42) }),
    ).toThrow(/must return a string/);
  });
});

describe('inlineAlert — argument validation', () => {
  it.each([
    ['a selector string', '#host'],
    ['null', null],
    ['a plain object', {}],
  ])('rejects %s as the container', (_label, value) => {
    expect(() => inlineAlert(/** @type {never} */ (value))).toThrow(TypeError);
  });

  it.each([
    ['classes', { classes: /** @type {never} */ ([]) }],
    ['icons', { icons: /** @type {never} */ (null) }],
  ])('rejects a non-object %s map', (_label, options) => {
    expect(() => inlineAlert(host, options)).toThrow(TypeError);
  });

  it.each([
    ['a string', '3000'],
    ['NaN', Number.NaN],
    ['zero', 0],
    ['negative', -1],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s as the instance autoHideMs', (_label, value) => {
    expect(() => inlineAlert(host, { autoHideMs: /** @type {never} */ (value) })).toThrow(
      TypeError,
    );
  });

  it('rejects a negative per-show autoHideMs', () => {
    const alerts = inlineAlert(host);
    expect(() => alerts.show('info', 'x', { autoHideMs: -5 })).toThrow(TypeError);
  });

  it('rejects a non-AbortSignal signal', () => {
    expect(() => inlineAlert(host, { signal: /** @type {never} */ ({}) })).toThrow(TypeError);
  });

  it('rejects an unknown kind and a non-string message', () => {
    const alerts = inlineAlert(host);
    expect(() => alerts.show(/** @type {never} */ ('fatal'), 'x')).toThrow(/kind must be one of/);
    expect(() => alerts.show('info', /** @type {never} */ (42))).toThrow(
      /message must be a string/,
    );
  });
});
