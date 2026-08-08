// @vitest-environment jsdom
// Example tests (roadmap 14.1, spec 04 §2 items F52-F60, NFR-19/NFR-20/NFR-21,
// ADR-0037) for the Bootstrap element builders. Two properties carry most of the
// weight: the markup and ARIA surface each builder produces (NFR-21 is a
// contract, so it is asserted per builder rather than reviewed), and the fact
// that a class-token mistake surfaces as the house TypeError instead of the
// platform's DOMException.
import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapIconsSet,
  bsBadge,
  bsButton,
  bsButtonGroup,
  bsCloseButton,
  bsIcon,
  bsPlaceholder,
  bsProgress,
  bsSpinner,
  materialIconsSet,
} from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

describe('bsIcon — icon-set adapter', () => {
  it('renders the Bootstrap Icons preset by default, decorative', () => {
    const icon = bsIcon('check-circle');
    expect(icon.tagName).toBe('I');
    expect([...icon.classList]).toEqual(['bi', 'bi-check-circle']);
    // No accessible name means decorative: an icon beside a text label must not
    // be announced, or the label is read twice.
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.hasAttribute('role')).toBe(false);
  });

  it('renders a ligature set by putting the name in the text', () => {
    const icon = bsIcon('delete', { set: materialIconsSet });
    expect(icon.tagName).toBe('SPAN');
    expect([...icon.classList]).toEqual(['material-icons']);
    expect(icon.textContent).toBe('delete');
  });

  it('announces the icon when a label is supplied', () => {
    const icon = bsIcon('trash', { label: 'Delete row' });
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('aria-label')).toBe('Delete row');
    expect(icon.hasAttribute('aria-hidden')).toBe(false);
  });

  it('delegates to a custom render function', () => {
    const set = {
      render: (/** @type {string} */ name, /** @type {Document} */ doc) => {
        const el = doc.createElement('svg');
        el.dataset.icon = name;
        return el;
      },
    };
    const icon = bsIcon('save', { set });
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(/** @type {HTMLElement} */ (icon).dataset.icon).toBe('save');
  });

  it('appends caller classes after the set’s own', () => {
    const icon = bsIcon('gear', { class: ['fs-4', 'me-1 text-muted'] });
    expect([...icon.classList]).toEqual(['bi', 'bi-gear', 'fs-4', 'me-1', 'text-muted']);
  });

  it('builds in an explicitly supplied document', () => {
    const other = document.implementation.createHTMLDocument('other');
    const icon = bsIcon('star', { document: other });
    expect(icon.ownerDocument).toBe(other);
    expect(icon.ownerDocument).not.toBe(document);
  });

  it.each([
    ['a name with whitespace', () => bsIcon('two words'), /name must be a non-empty string/],
    ['an empty name', () => bsIcon(''), /name must be a non-empty string/],
    [
      'a non-string name',
      () => bsIcon(/** @type {never} */ (7)),
      /name must be a non-empty string/,
    ],
    [
      'a non-object options',
      () => bsIcon('x', /** @type {never} */ (7)),
      /options must be an object/,
    ],
    [
      'a non-object set',
      () => bsIcon('x', { set: /** @type {never} */ (7) }),
      /set must be an object/,
    ],
    [
      'a non-function render',
      () => bsIcon('x', { set: { render: /** @type {never} */ ('nope') } }),
      /render must be a function/,
    ],
    [
      'a render returning a non-element',
      () => bsIcon('x', { set: { render: () => /** @type {never} */ ('<i>') } }),
      /render must return an Element/,
    ],
    [
      'a non-string classTemplate',
      () => bsIcon('x', { set: { classTemplate: /** @type {never} */ (7) } }),
      /classTemplate must be a string/,
    ],
    [
      'a non-string label',
      () => bsIcon('x', { label: /** @type {never} */ (7) }),
      /label must be a string/,
    ],
    [
      'a non-document document',
      () => bsIcon('x', { document: /** @type {never} */ ({}) }),
      /document must be a Document/,
    ],
    [
      'a non-string class entry',
      () => bsIcon('x', { class: /** @type {never} */ ([7]) }),
      /must be a string/,
    ],
  ])('rejects %s', (_label, act, message) => {
    expect(act).toThrow(TypeError);
    expect(act).toThrow(message);
  });
});

describe('bsBadge', () => {
  it('renders the default secondary badge with escaped text', () => {
    const badge = bsBadge('New');
    expect(badge.tagName).toBe('SPAN');
    expect([...badge.classList]).toEqual(['badge', 'text-bg-secondary']);
    expect(badge.textContent).toBe('New');
  });

  it('applies variant and pill', () => {
    const badge = bsBadge('99+', { variant: 'danger', pill: true });
    expect([...badge.classList]).toEqual(['badge', 'text-bg-danger', 'rounded-pill']);
  });

  it('renders the positioned form, and a string positions AND names it', () => {
    const badge = bsBadge('99+', { positioned: 'unread messages' });
    expect([...badge.classList]).toContain('position-absolute');
    expect([...badge.classList]).toContain('translate-middle');
    // "99+" alone announces a number with no noun; the hidden span supplies it.
    const hidden = badge.querySelector('.visually-hidden');
    expect(hidden?.textContent).toBe('unread messages');
    expect(badge.textContent).toBe('99+unread messages');
  });

  it('accepts a node as content and uses it as-is', () => {
    const node = document.createElement('em');
    node.textContent = 'live';
    const badge = bsBadge(node);
    expect(badge.firstElementChild).toBe(node);
  });

  it('rejects an invalid variant token before classList does', () => {
    // classList.add would throw a DOMException naming neither the option nor the
    // caller; the house error names both.
    expect(() => bsBadge('x', { variant: 'a b' })).toThrow(TypeError);
    expect(() => bsBadge('x', { variant: 'a b' })).toThrow(/variant must be a non-empty string/);
  });

  it('rejects content that is neither a string nor a node', () => {
    expect(() => bsBadge(/** @type {never} */ (7))).toThrow(/content must be a string or a Node/);
  });
});

describe('bsButton', () => {
  it('renders type=button by default, not submit', () => {
    const button = bsButton({ label: 'Save' });
    // The platform default is submit, which posts the surrounding form by
    // accident — a bug too common to inherit.
    expect(button.getAttribute('type')).toBe('button');
    expect([...button.classList]).toEqual(['btn', 'btn-primary']);
    expect(button.textContent).toBe('Save');
    expect(button.children).toHaveLength(0);
  });

  it('renders the outline and size variants', () => {
    const button = bsButton({ label: 'Cancel', variant: 'secondary', outline: true, size: 'sm' });
    expect([...button.classList]).toEqual(['btn', 'btn-outline-secondary', 'btn-sm']);
  });

  it('places an icon before the label, and boxes the label for spacing', () => {
    const button = bsButton({ label: 'Add item', icon: 'plus-lg' });
    const [icon, label] = [...button.children];
    expect(icon.classList.contains('bi-plus-lg')).toBe(true);
    expect(label.tagName).toBe('SPAN');
    expect(label.textContent).toBe('Add item');
  });

  it('accepts an icon as a node, cloning it so a shared map is not consumed', () => {
    const shared = document.createElement('i');
    shared.className = 'bi bi-star';
    const first = bsButton({ label: 'One', icon: shared });
    const second = bsButton({ label: 'Two', icon: shared });
    expect(first.firstElementChild).not.toBe(shared);
    expect(second.firstElementChild).not.toBe(shared);
    expect(first.firstElementChild?.className).toBe('bi bi-star');
    // The original is still unattached — neither button stole it.
    expect(shared.parentElement).toBeNull();
  });

  it('accepts an icon as full options, with its own set', () => {
    const button = bsButton({
      label: 'Remove',
      icon: { name: 'delete', set: materialIconsSet },
    });
    expect(button.firstElementChild?.textContent).toBe('delete');
  });

  it('names an icon-only button through a visually-hidden label', () => {
    const button = bsButton({ icon: 'trash', label: 'Delete row', labelHidden: true });
    expect(button.textContent).toBe('Delete row');
    expect(button.querySelector('.visually-hidden')?.textContent).toBe('Delete row');
  });

  it('names an icon-only button through ariaLabel', () => {
    const button = bsButton({ icon: 'x-lg', ariaLabel: 'Dismiss' });
    expect(button.getAttribute('aria-label')).toBe('Dismiss');
  });

  it('refuses to build an unnamed button (NFR-21)', () => {
    // A warning would ship the broken control; the fix is one option, so this
    // is a hard error.
    expect(() => bsButton({ icon: 'gear' })).toThrow(TypeError);
    expect(() => bsButton({ icon: 'gear' })).toThrow(/needs an accessible name/);
    expect(() => bsButton()).toThrow(/needs an accessible name/);
  });

  it('wires onClick and detaches it on abort', () => {
    const onClick = vi.fn();
    const controller = new AbortController();
    const button = bsButton({ label: 'Refresh', onClick, signal: controller.signal });

    button.dispatchEvent(new Event('click'));
    expect(onClick).toHaveBeenCalledTimes(1);

    controller.abort();
    button.dispatchEvent(new Event('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('wires onClick with no signal at all', () => {
    const onClick = vi.fn();
    const button = bsButton({ label: 'Go', onClick });
    button.dispatchEvent(new Event('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders submit and disabled when asked', () => {
    const button = bsButton({ label: 'Send', type: 'submit', disabled: true });
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it.each([
    ['an invalid type', { label: 'x', type: /** @type {never} */ ('link') }, /type must be/],
    [
      'a non-string ariaLabel',
      { ariaLabel: /** @type {never} */ (7) },
      /ariaLabel must be a string/,
    ],
    [
      'a non-function onClick',
      { label: 'x', onClick: /** @type {never} */ (7) },
      /onClick must be a function/,
    ],
    [
      'a non-signal signal',
      { label: 'x', signal: /** @type {never} */ ({}) },
      /must be an AbortSignal/,
    ],
    ['an invalid size token', { label: 'x', size: 'a b' }, /size must be a non-empty string/],
    [
      'a hidden non-string label',
      { label: /** @type {never} */ (document.createElement('b')), labelHidden: true },
      /label must be a string when labelHidden/,
    ],
    [
      'a malformed icon spec',
      { label: 'x', icon: /** @type {never} */ ({}) },
      /options\.icon must be/,
    ],
  ])('rejects %s', (_label, options, message) => {
    expect(() => bsButton(options)).toThrow(TypeError);
    expect(() => bsButton(options)).toThrow(message);
  });
});

describe('bsButtonGroup', () => {
  it('renders a named group around its buttons', () => {
    const buttons = [bsButton({ label: 'Left' }), bsButton({ label: 'Right' })];
    const group = bsButtonGroup(buttons, { label: 'Alignment' });

    expect([...group.classList]).toEqual(['btn-group']);
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Alignment');
    expect([...group.children]).toEqual(buttons);
  });

  it('renders the vertical and sized variants', () => {
    const group = bsButtonGroup([bsButton({ label: 'A' })], {
      label: 'Tools',
      vertical: true,
      size: 'lg',
    });
    expect([...group.classList]).toEqual(['btn-group-vertical', 'btn-group-lg']);
  });

  it.each([
    [
      'no options at all',
      () => bsButtonGroup([], /** @type {never} */ (undefined)),
      /options must be an object/,
    ],
    ['an empty array', () => bsButtonGroup([], { label: 'x' }), /non-empty array/],
    [
      'a non-array',
      () => bsButtonGroup(/** @type {never} */ ('x'), { label: 'y' }),
      /non-empty array/,
    ],
    [
      'a non-element entry',
      () => bsButtonGroup([/** @type {never} */ ('<button>')], { label: 'x' }),
      /buttons\[0\] must be an Element/,
    ],
    [
      'a missing label',
      () => bsButtonGroup([bsButton({ label: 'a' })], /** @type {never} */ ({})),
      /options\.label is required/,
    ],
    [
      'an empty label',
      () => bsButtonGroup([bsButton({ label: 'a' })], { label: '' }),
      /options\.label is required/,
    ],
    [
      'an invalid size',
      () => bsButtonGroup([bsButton({ label: 'a' })], { label: 'x', size: 'a b' }),
      /size must be a non-empty string/,
    ],
  ])('rejects %s', (_label, act, message) => {
    expect(act).toThrow(TypeError);
    expect(act).toThrow(message);
  });
});

describe('bsCloseButton', () => {
  it('renders a named, non-submitting close control', () => {
    const close = bsCloseButton();
    expect(close.tagName).toBe('BUTTON');
    expect(close.getAttribute('type')).toBe('button');
    expect([...close.classList]).toEqual(['btn-close']);
    expect(close.getAttribute('aria-label')).toBe('Close');
  });

  it('takes an injected label — "Close" is an English string', () => {
    expect(bsCloseButton({ label: 'Chiudi' }).getAttribute('aria-label')).toBe('Chiudi');
  });

  it('renders the white and disabled variants and wires onClick', () => {
    const onClick = vi.fn();
    const close = bsCloseButton({ white: true, disabled: true, onClick });
    expect([...close.classList]).toEqual(['btn-close', 'btn-close-white']);
    expect(close.hasAttribute('disabled')).toBe(true);
    close.dispatchEvent(new Event('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('detaches onClick on abort', () => {
    const onClick = vi.fn();
    const controller = new AbortController();
    const close = bsCloseButton({ onClick, signal: controller.signal });
    controller.abort();
    close.dispatchEvent(new Event('click'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty label', { label: '' }, /label must be a non-empty string/],
    ['a non-function onClick', { onClick: /** @type {never} */ (7) }, /onClick must be a function/],
    ['a non-signal signal', { signal: /** @type {never} */ ({}) }, /must be an AbortSignal/],
  ])('rejects %s', (_label, options, message) => {
    expect(() => bsCloseButton(options)).toThrow(TypeError);
    expect(() => bsCloseButton(options)).toThrow(message);
  });
});

describe('bsSpinner', () => {
  it('announces itself: role=status plus hidden text', () => {
    const spinner = bsSpinner();
    // A spinning div announces nothing at all, which is the failure this fixes.
    expect([...spinner.classList]).toEqual(['spinner-border']);
    expect(spinner.getAttribute('role')).toBe('status');
    expect(spinner.querySelector('.visually-hidden')?.textContent).toBe('Loading…');
  });

  it('renders the grow kind with size and variant', () => {
    const spinner = bsSpinner({
      kind: 'grow',
      size: 'sm',
      variant: 'primary',
      label: 'Attendere…',
    });
    expect([...spinner.classList]).toEqual(['spinner-grow', 'spinner-grow-sm', 'text-primary']);
    expect(spinner.querySelector('.visually-hidden')?.textContent).toBe('Attendere…');
  });

  it('omits the hidden text when the label is deliberately empty', () => {
    // For a spinner inside an already-labelled live region, a second name is noise.
    expect(bsSpinner({ label: '' }).querySelector('.visually-hidden')).toBeNull();
  });

  it.each([
    ['an invalid kind', { kind: /** @type {never} */ ('pulse') }, /kind must be/],
    ['a non-string label', { label: /** @type {never} */ (7) }, /label must be a string/],
    ['an invalid size', { size: 'a b' }, /size must be a non-empty string/],
    ['an invalid variant', { variant: '' }, /variant must be a non-empty string/],
  ])('rejects %s', (_label, options, message) => {
    expect(() => bsSpinner(options)).toThrow(TypeError);
    expect(() => bsSpinner(options)).toThrow(message);
  });
});

describe('bsProgress', () => {
  it('sets the whole aria-value triple on the track (Bootstrap 5.3 shape)', () => {
    const { element } = bsProgress({ value: 25, label: 'Upload' });
    expect(element.getAttribute('role')).toBe('progressbar');
    expect(element.getAttribute('aria-valuemin')).toBe('0');
    expect(element.getAttribute('aria-valuemax')).toBe('100');
    expect(element.getAttribute('aria-valuenow')).toBe('25');
    expect(element.getAttribute('aria-label')).toBe('Upload');
    expect(/** @type {HTMLElement} */ (element.firstElementChild).style.width).toBe('25%');
  });

  it('keeps width, aria-valuenow and visible text in step on update', () => {
    const progress = bsProgress({
      max: 200,
      format: (value, { max }) => `${(value / max) * 100}%`,
    });
    const bar = /** @type {HTMLElement} */ (progress.element.firstElementChild);

    expect(progress.element.getAttribute('aria-valuenow')).toBe('0');
    progress.update(50);
    // The three cannot drift, which is the reason this returns an instance.
    expect(progress.element.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.style.width).toBe('25%');
    expect(bar.textContent).toBe('25%');
  });

  it('clamps out-of-range values instead of drawing past the track', () => {
    const progress = bsProgress({ min: 10, max: 20 });
    progress.update(999);
    expect(progress.element.getAttribute('aria-valuenow')).toBe('20');
    progress.update(-999);
    expect(progress.element.getAttribute('aria-valuenow')).toBe('10');
  });

  it('shows no text by default, matching Bootstrap', () => {
    expect(bsProgress({ value: 40 }).element.firstElementChild?.textContent).toBe('');
  });

  it('renders variant, striped, animated and height', () => {
    const { element } = bsProgress({ variant: 'success', animated: true, height: '4px' });
    expect(/** @type {HTMLElement} */ (element).style.height).toBe('4px');
    // Bootstrap requires striped for the animation to be visible, so animated implies it.
    expect([...(element.firstElementChild?.classList ?? [])]).toEqual([
      'progress-bar',
      'bg-success',
      'progress-bar-striped',
      'progress-bar-animated',
    ]);
  });

  it('renders striped without animated', () => {
    const { element } = bsProgress({ striped: true });
    expect([...(element.firstElementChild?.classList ?? [])]).toEqual([
      'progress-bar',
      'progress-bar-striped',
    ]);
  });

  it('destroy() removes the track', () => {
    const progress = bsProgress();
    document.body.append(progress.element);
    progress.destroy();
    expect(progress.element.parentElement).toBeNull();
  });

  it.each([
    ['a non-number min', { min: /** @type {never} */ ('0') }, /min must be a finite number/],
    ['an infinite max', { max: Number.POSITIVE_INFINITY }, /max must be a finite number/],
    ['an inverted range', { min: 10, max: 10 }, /min must be less than options\.max/],
    ['a non-string label', { label: /** @type {never} */ (7) }, /label must be a string/],
    [
      'a non-function format',
      { format: /** @type {never} */ ('pct') },
      /format must be a function or false/,
    ],
    [
      'a non-string height',
      { height: /** @type {never} */ (4) },
      /height must be a CSS length string/,
    ],
    ['an invalid variant', { variant: 'a b' }, /variant must be a non-empty string/],
    ['a NaN initial value', { value: Number.NaN }, /options\.value must be a number/],
    // Named for the option the caller actually passed, not for the internal
    // setter it would otherwise have been routed through.
    [
      'a non-number initial value',
      { value: /** @type {never} */ ('50') },
      /options\.value must be a number/,
    ],
  ])('rejects %s', (_label, options, message) => {
    expect(() => bsProgress(options)).toThrow(TypeError);
    expect(() => bsProgress(options)).toThrow(message);
  });

  it('rejects a non-numeric update', () => {
    const progress = bsProgress();
    expect(() => progress.update(/** @type {never} */ ('50'))).toThrow(
      /update\(value\) requires a number/,
    );
  });
});

describe('bsPlaceholder', () => {
  it('is aria-hidden: a skeleton has nothing to announce', () => {
    const block = bsPlaceholder();
    expect(block.tagName).toBe('P');
    expect([...block.classList]).toEqual(['placeholder-glow']);
    expect(block.getAttribute('aria-hidden')).toBe('true');
    expect(block.children).toHaveLength(1);
  });

  it('cycles a stable default width across lines', () => {
    const block = bsPlaceholder({ lines: 6 });
    const widths = [...block.children].map((line) =>
      [...line.classList].find((c) => c.startsWith('col-')),
    );
    // Stable, not random: a skeleton that reshuffles draws the eye to itself.
    expect(widths).toEqual(['col-12', 'col-10', 'col-11', 'col-8', 'col-12', 'col-10']);
  });

  it('accepts numeric and CSS widths', () => {
    const block = bsPlaceholder({ lines: 2, widths: [6, '75%'], size: 'lg', animation: 'wave' });
    expect([...block.classList]).toEqual(['placeholder-wave']);
    expect([...block.children[0].classList]).toEqual(['placeholder', 'placeholder-lg', 'col-6']);
    expect(/** @type {HTMLElement} */ (block.children[1]).style.width).toBe('75%');
  });

  it('renders without animation when asked', () => {
    expect([...bsPlaceholder({ animation: false }).classList]).toEqual([]);
  });

  it.each([
    ['zero lines', { lines: 0 }, /lines must be a positive integer/],
    ['fractional lines', { lines: 1.5 }, /lines must be a positive integer/],
    ['an invalid animation', { animation: /** @type {never} */ ('spin') }, /animation must be/],
    [
      'a non-array widths',
      { widths: /** @type {never} */ ('12') },
      /widths must be a non-empty array/,
    ],
    ['an empty widths', { widths: [] }, /widths must be a non-empty array/],
    ['an out-of-range column', { widths: [13] }, /integer from 1 to 12/],
    ['a fractional column', { widths: [1.5] }, /integer from 1 to 12/],
    [
      'a width of the wrong type',
      { widths: [/** @type {never} */ (null)] },
      /must be numbers or CSS/,
    ],
    ['an invalid size', { size: 'a b' }, /size must be a non-empty string/],
  ])('rejects %s', (_label, options, message) => {
    expect(() => bsPlaceholder(options)).toThrow(TypeError);
    expect(() => bsPlaceholder(options)).toThrow(message);
  });
});

describe('the F52 class option', () => {
  it.each([
    ['bsBadge', () => bsBadge('x', { class: 'mt-2 me-1' })],
    ['bsButton', () => bsButton({ label: 'x', class: ['mt-2', 'me-1'] })],
    [
      'bsButtonGroup',
      () => bsButtonGroup([bsButton({ label: 'x' })], { label: 'g', class: 'mt-2 me-1' }),
    ],
    ['bsCloseButton', () => bsCloseButton({ class: ['mt-2 me-1'] })],
    ['bsSpinner', () => bsSpinner({ class: 'mt-2 me-1' })],
    ['bsProgress', () => bsProgress({ class: 'mt-2 me-1' }).element],
    ['bsPlaceholder', () => bsPlaceholder({ class: 'mt-2 me-1' })],
  ])('%s appends caller classes last, so a utility wins the tie', (_name, build) => {
    const el = build();
    const classes = [...el.classList];
    expect(classes.slice(-2)).toEqual(['mt-2', 'me-1']);
    // Appended, not replacing: the Bootstrap classes are still there in front.
    expect(classes.length).toBeGreaterThan(2);
  });

  it('rejects a class option that is not a string or an array of strings', () => {
    expect(() => bsBadge('x', { class: /** @type {never} */ (7) })).toThrow(TypeError);
    expect(() => bsSpinner({ class: /** @type {never} */ ([{}]) })).toThrow(
      /options\.class must be a string or an array of strings/,
    );
  });
});

describe('the icon-set presets', () => {
  it('are frozen data, not code — so one map safely serves a whole app', () => {
    expect(Object.isFrozen(bootstrapIconsSet)).toBe(true);
    expect(Object.isFrozen(materialIconsSet)).toBe(true);
    expect(bootstrapIconsSet).toEqual({ tag: 'i', classTemplate: 'bi bi-{name}' });
    expect(materialIconsSet).toEqual({
      tag: 'span',
      classTemplate: 'material-icons',
      ligature: true,
    });
  });
});
