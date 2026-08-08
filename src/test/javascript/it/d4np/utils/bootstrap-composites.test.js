// @vitest-environment jsdom
// Example tests (roadmap 14.2, spec 04 §2 items F61-F65, NFR-19/NFR-21,
// ADR-0038) for the Bootstrap composite builders.
//
// Three properties carry the weight here, because they are the ones a composite
// can get wrong in ways an atom cannot: the ARIA surface of a *structure* (a
// breadcrumb's current page, a pager's active step), the fact that a re-render
// does not rebind or leak listeners, and that the two compositions — bsAlert
// over F49, bsPagination over F42's read model — genuinely delegate instead of
// reimplementing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bsAlert,
  bsBadge,
  bsBreadcrumb,
  bsButton,
  bsCard,
  bsListGroup,
  bsPagination,
} from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** @returns {HTMLElement} */
function host() {
  document.body.innerHTML = '<div id="host"></div>';
  return /** @type {HTMLElement} */ (document.getElementById('host'));
}

describe('bsCard', () => {
  it('renders only the slots that were supplied', () => {
    const card = bsCard({ title: 'Total', text: '€ 12.480' });
    expect([...card.classList]).toEqual(['card']);
    expect(card.querySelector('.card-header')).toBeNull();
    expect(card.querySelector('.card-footer')).toBeNull();
    const body = card.querySelector('.card-body');
    expect(body?.querySelector('.card-title')?.textContent).toBe('Total');
    expect(body?.querySelector('.card-text')?.textContent).toBe('€ 12.480');
  });

  it('omits the body wrapper entirely when nothing goes in it', () => {
    // An empty card-body is visible padding, which reads as a rendering bug.
    const card = bsCard({ header: 'Only a header' });
    expect(card.querySelector('.card-body')).toBeNull();
    expect(card.querySelector('.card-header')?.textContent).toBe('Only a header');
  });

  it('orders image, header, body, list group and footer', () => {
    const list = bsListGroup(['a'], { flush: true });
    const card = bsCard({
      image: { src: '/cover.jpg', alt: 'Cover' },
      header: 'H',
      title: 'T',
      listGroup: list.element,
      footer: 'F',
    });
    expect([...card.children].map((el) => el.className.split(' ')[0])).toEqual([
      'card-img-top',
      'card-header',
      'card-body',
      'list-group',
      'card-footer',
    ]);
  });

  it('places a bottom image last', () => {
    const card = bsCard({ text: 'x', image: { src: '/i.png', alt: '', position: 'bottom' } });
    const image = card.lastElementChild;
    expect(image?.className).toBe('card-img-bottom');
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('renders actions into the footer, creating one if needed', () => {
    const card = bsCard({ actions: bsButton({ label: 'Open' }) });
    const footer = card.querySelector('.card-footer');
    expect(footer?.querySelector('button')?.textContent).toBe('Open');
  });

  it('accepts an array slot, rendering members in order through one insertion', () => {
    const card = bsCard({ text: ['Total: ', bsBadge('42', { variant: 'success' })] });
    const text = card.querySelector('.card-text');
    expect(text?.childNodes).toHaveLength(2);
    expect(text?.textContent).toBe('Total: 42');
    expect(text?.querySelector('.badge')?.className).toBe('badge text-bg-success');
  });

  it('honours a heading level so the document outline survives', () => {
    expect(bsCard({ title: 'x', titleTag: 'h3' }).querySelector('.card-title')?.tagName).toBe('H3');
  });

  it('renders subtitle and free body content in order after the title', () => {
    const extra = document.createElement('form');
    const card = bsCard({ title: 'T', subtitle: 'S', text: 'X', body: extra });
    const body = /** @type {Element} */ (card.querySelector('.card-body'));
    expect([...body.children].map((el) => el.tagName)).toEqual(['H5', 'H6', 'P', 'FORM']);
    const subtitle = body.querySelector('.card-subtitle');
    expect([...(subtitle?.classList ?? [])]).toEqual([
      'card-subtitle',
      'mb-2',
      'text-body-secondary',
    ]);
    expect(subtitle?.textContent).toBe('S');
    expect(body.querySelector('form')).toBe(extra);
  });

  it('routes markup through the caller’s sanitizer, in every slot', () => {
    const sanitize = vi.fn((/** @type {string} */ html) => html);
    const card = bsCard({
      header: '<b>H</b>',
      title: '<i>T</i>',
      html: true,
      sanitize,
    });
    expect(sanitize).toHaveBeenCalledTimes(2);
    expect(card.querySelector('.card-header b')?.textContent).toBe('H');
    expect(card.querySelector('.card-title i')?.textContent).toBe('T');
  });

  it('requires alt on an image, and accepts the empty string for a decorative one', () => {
    // Silence is the failure mode: a missing alt makes a screen reader read the
    // file name aloud.
    expect(() =>
      bsCard({ image: { src: '/i.png', alt: /** @type {never} */ (undefined) } }),
    ).toThrow(/image\.alt is required/);
    expect(() => bsCard({ image: { src: '', alt: '' } })).toThrow(/image\.src must be/);
    expect(bsCard({ image: { src: '/i.png', alt: '' } }).querySelector('img')).not.toBeNull();
  });

  it('rejects a non-element list group and a bad title tag', () => {
    expect(() => bsCard({ listGroup: /** @type {never} */ ('<ul>') })).toThrow(
      /listGroup must be an Element/,
    );
    expect(() => bsCard({ title: 'x', titleTag: 'h 5' })).toThrow(/titleTag must be/);
  });
});

describe('bsListGroup', () => {
  it('renders a plain ul/li list by default', () => {
    const list = bsListGroup(['Alpha', 'Beta']);
    expect(list.element.tagName).toBe('UL');
    expect([...list.element.children].map((el) => el.tagName)).toEqual(['LI', 'LI']);
    expect(list.element.textContent).toBe('AlphaBeta');
  });

  it('renders buttons when items are actionable, and links when they have href', () => {
    const list = bsListGroup([{ content: 'A' }, { content: 'B', href: '/b' }], {
      onSelect: () => {},
    });
    expect(list.element.tagName).toBe('DIV');
    const [first, second] = [...list.element.children];
    expect(first.tagName).toBe('BUTTON');
    expect(first.getAttribute('type')).toBe('button');
    expect(second.tagName).toBe('A');
    expect(second.getAttribute('href')).toBe('/b');
    expect(first.classList.contains('list-group-item-action')).toBe(true);
  });

  it('renders an ordered list when numbered', () => {
    const list = bsListGroup(['a'], { numbered: true, flush: true, horizontal: 'md' });
    expect(list.element.tagName).toBe('OL');
    expect([...list.element.classList]).toEqual([
      'list-group',
      'list-group-flush',
      'list-group-numbered',
      'list-group-horizontal-md',
    ]);
  });

  it('marks active and disabled items so both are announced correctly', () => {
    const list = bsListGroup(
      [
        { content: 'A', active: true },
        { content: 'B', disabled: true },
        { content: 'C', disabled: true, href: '/c' },
      ],
      { onSelect: () => {} },
    );
    const [active, disabledButton, disabledLink] = [...list.element.children];
    expect(active.getAttribute('aria-current')).toBe('true');
    expect(disabledButton.hasAttribute('disabled')).toBe(true);
    // A link has no native disabled state, so it needs both to be inert.
    expect(disabledLink.getAttribute('aria-disabled')).toBe('true');
    expect(disabledLink.getAttribute('tabindex')).toBe('-1');
  });

  it('renders a trailing badge from the shorthand and the object form', () => {
    const list = bsListGroup([
      { content: 'A', badge: 14 },
      { content: 'B', badge: { content: 'new', variant: 'danger', pill: false } },
    ]);
    const [first, second] = [...list.element.children];
    expect(first.classList.contains('justify-content-between')).toBe(true);
    expect(first.querySelector('.badge')?.textContent).toBe('14');
    expect(second.querySelector('.badge')?.className).toBe('badge text-bg-danger');
  });

  it('delivers the item, its index and its opaque value to onSelect', () => {
    const onSelect = vi.fn();
    const record = { id: 7 };
    const list = bsListGroup([{ content: 'A', value: record }], { onSelect });
    host().append(list.element);

    /** @type {HTMLElement} */ (list.element.children[0]).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [item, index] = onSelect.mock.calls[0];
    expect(item.value).toBe(record);
    expect(index).toBe(0);
  });

  it('accepts a node and an array as item content', () => {
    const node = document.createElement('strong');
    node.textContent = 'N';
    const list = bsListGroup([node, ['A', document.createElement('em')]]);
    expect(list.element.children[0].firstElementChild).toBe(node);
    expect(list.element.children[1].childNodes).toHaveLength(2);
  });

  it('ignores a click that matches no item', () => {
    const onSelect = vi.fn();
    const list = bsListGroup(['A'], { onSelect });
    host().append(list.element);
    // The container itself is inside the root but is not an item.
    list.element.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onSelect).not.toHaveBeenCalled();

    // An event whose target is not an element at all — a text node, which only
    // synthetic dispatch produces — must not reach for `closest` on it. The
    // handler declines rather than throwing.
    const text = /** @type {Text} */ (list.element.firstChild?.firstChild);
    expect(text.nodeType).toBe(3);
    expect(() => text.dispatchEvent(new Event('click', { bubbles: true }))).not.toThrow();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a nested list group does not fire the outer one’s handler', () => {
    // Bootstrap encourages nesting a list inside a card inside an item. Both
    // lists mark their items the same way, so a naive `closest` would hand the
    // outer handler the INNER index — a different record, or none.
    const outer = vi.fn();
    const inner = vi.fn();
    const outerList = bsListGroup([{ content: 'row' }, { content: 'row2' }], { onSelect: outer });
    const innerList = bsListGroup([{ content: 'a' }, { content: 'b' }], { onSelect: inner });
    outerList.element.children[0].append(innerList.element);
    host().append(outerList.element);

    /** @type {HTMLElement} */ (innerList.element.children[1]).click();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner.mock.calls[0][1]).toBe(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('ignores a foreign node someone appended into the container', () => {
    const onSelect = vi.fn();
    const list = bsListGroup(['A'], { onSelect });
    const stray = document.createElement('li');
    stray.setAttribute('data-egl-index', '9');
    list.element.append(stray);
    host().append(list.element);

    stray.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies a per-item contextual variant', () => {
    const list = bsListGroup([{ content: 'A', variant: 'warning' }]);
    expect(list.element.children[0].classList.contains('list-group-item-warning')).toBe(true);
  });

  it('marks link items actionable even without onSelect', () => {
    const list = bsListGroup([{ content: 'A', href: '/a' }], { horizontal: true });
    const item = list.element.children[0];
    expect(item.tagName).toBe('A');
    expect(item.classList.contains('list-group-item-action')).toBe(true);
    expect(list.element.classList.contains('list-group-horizontal')).toBe(true);
  });

  it('does not fire for a disabled item', () => {
    const onSelect = vi.fn();
    const list = bsListGroup([{ content: 'A', disabled: true }], { onSelect });
    /** @type {HTMLElement} */ (list.element.children[0]).click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps ONE listener across re-renders — the rebind cycle F44 exists to end', () => {
    const onSelect = vi.fn();
    const list = bsListGroup(['A'], { onSelect });
    const added = vi.spyOn(list.element, 'addEventListener');

    list.update(['B', 'C']);
    list.update(['D']);

    // Not one per render, and not one per item.
    expect(added).not.toHaveBeenCalled();
    expect(list.element.children).toHaveLength(1);
    /** @type {HTMLElement} */ (list.element.children[0]).click();
    expect(onSelect.mock.calls[0][0].content).toBe('D');
  });

  it('destroy() detaches the listener and removes the element', () => {
    const onSelect = vi.fn();
    const list = bsListGroup(['A'], { onSelect });
    const container = host();
    container.append(list.element);

    list.destroy();
    expect(container.children).toHaveLength(0);
    list.element.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onSelect).not.toHaveBeenCalled();
    // Idempotent, and refuses to be used afterwards.
    expect(() => list.destroy()).not.toThrow();
    expect(() => list.update(['B'])).toThrow(/update\(\) was called after destroy\(\)/);
  });

  it('an aborted signal destroys it, before or after construction (NFR-15)', () => {
    const late = new AbortController();
    const list = bsListGroup(['A'], { signal: late.signal });
    host().append(list.element);
    late.abort();
    expect(list.element.parentElement).toBeNull();

    const already = new AbortController();
    already.abort();
    const dead = bsListGroup(['A'], { signal: already.signal });
    expect(() => dead.update(['B'])).toThrow(/after destroy/);
  });

  it.each([
    ['a non-array items', () => bsListGroup(/** @type {never} */ ('a')), /items must be an array/],
    [
      'a null item',
      () => bsListGroup([/** @type {never} */ (null)]),
      /items\[0\] must be content or an item object/,
    ],
    ['a contentless item', () => bsListGroup([{}]), /items\[0\]\.content is required/],
    [
      'a bad variant',
      () => bsListGroup([{ content: 'a', variant: 'a b' }]),
      /items\[0\]\.variant must be/,
    ],
    [
      'a non-string href',
      () => bsListGroup([{ content: 'a', href: /** @type {never} */ (7) }]),
      /items\[0\]\.href must be a string/,
    ],
    [
      'a non-function onSelect',
      () => bsListGroup(['a'], { onSelect: /** @type {never} */ (7) }),
      /onSelect must be a function/,
    ],
    [
      'a non-signal signal',
      () => bsListGroup(['a'], { signal: /** @type {never} */ ({}) }),
      /must be an AbortSignal/,
    ],
    [
      'a bad horizontal breakpoint',
      () => bsListGroup(['a'], { horizontal: 'a b' }),
      /horizontal must be/,
    ],
    [
      'a malformed badge',
      () => bsListGroup([{ content: 'a', badge: /** @type {never} */ (true) }]),
      /badge must be an object/,
    ],
  ])('rejects %s', (_label, act, message) => {
    expect(act).toThrow(TypeError);
    expect(act).toThrow(message);
  });
});

describe('bsBreadcrumb', () => {
  it('marks the last item as the current page, without a link', () => {
    const nav = bsBreadcrumb([{ content: 'Home', href: '/' }, 'Orders']);
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe('breadcrumb');

    const [first, last] = [...(nav.querySelector('.breadcrumb')?.children ?? [])];
    expect(first.querySelector('a')?.getAttribute('href')).toBe('/');
    // The point of a breadcrumb for a screen-reader user: where am I, not just
    // what is the trail.
    expect(last.getAttribute('aria-current')).toBe('page');
    expect(last.classList.contains('active')).toBe(true);
    expect(last.querySelector('a')).toBeNull();
  });

  it('honours an explicit current flag', () => {
    const nav = bsBreadcrumb([
      { content: 'A', current: true },
      { content: 'B', href: '/b', current: false },
    ]);
    const [first, second] = [...(nav.querySelector('.breadcrumb')?.children ?? [])];
    expect(first.getAttribute('aria-current')).toBe('page');
    expect(second.querySelector('a')).not.toBeNull();
  });

  it('renders a linkless intermediate item as plain text', () => {
    const nav = bsBreadcrumb(['A', 'B', 'C']);
    const items = [...(nav.querySelector('.breadcrumb')?.children ?? [])];
    expect(items[1].querySelector('a')).toBeNull();
    expect(items[1].textContent).toBe('B');
  });

  it('accepts a node and an array as item content', () => {
    const node = document.createElement('strong');
    const nav = bsBreadcrumb([node, ['A', document.createElement('em')]]);
    const items = [...(nav.querySelector('.breadcrumb')?.children ?? [])];
    expect(items[0].firstElementChild).toBe(node);
    expect(items[1].childNodes).toHaveLength(2);
  });

  it('sets the divider as a custom property, not as markup', () => {
    const nav = bsBreadcrumb(['A'], { divider: "'>'", label: 'Percorso' });
    // A separator is presentation; injecting it as a node would put it in the
    // accessibility tree and in textContent.
    expect(/** @type {HTMLElement} */ (nav).style.getPropertyValue('--bs-breadcrumb-divider')).toBe(
      "'>'",
    );
    expect(nav.textContent).toBe('A');
    expect(nav.getAttribute('aria-label')).toBe('Percorso');
  });

  it.each([
    ['an empty list', () => bsBreadcrumb([]), /non-empty array/],
    ['a non-array', () => bsBreadcrumb(/** @type {never} */ ('a')), /non-empty array/],
    ['an empty label', () => bsBreadcrumb(['a'], { label: '' }), /label must be a non-empty/],
    [
      'a non-string divider',
      () => bsBreadcrumb(['a'], { divider: /** @type {never} */ (7) }),
      /divider must be a CSS value string/,
    ],
    ['a contentless item', () => bsBreadcrumb([{}]), /items\[0\] must be content or/],
  ])('rejects %s', (_label, act, message) => {
    expect(act).toThrow(TypeError);
    expect(act).toThrow(message);
  });
});

describe('bsAlert — the F49 engine in Bootstrap’s costume', () => {
  it('renders Bootstrap alert markup with a working close button', () => {
    const container = host();
    const alerts = bsAlert(container);
    alerts.show('success', 'Saved.');

    const root = container.querySelector('.alert');
    expect(root?.className).toBe('alert alert-dismissible fade show alert-success');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.textContent).toBe('Saved.');

    const close = container.querySelector('.btn-close');
    // The regression this milestone found: `.btn-close` draws its glyph in CSS,
    // so its content is empty — and an empty icon used to HIDE the control,
    // leaving a dismissible alert nobody could dismiss.
    expect(close).not.toBeNull();
    expect(/** @type {HTMLElement} */ (close).hidden).toBe(false);
    expect(close?.textContent).toBe('');
    expect(close?.getAttribute('aria-label')).toBe('Close');
  });

  it('hides on the close button, and takes an injected close label', () => {
    const container = host();
    const alerts = bsAlert(container, { closeLabel: 'Chiudi' });
    alerts.show('danger', 'Boom');
    const close = /** @type {HTMLElement} */ (container.querySelector('.btn-close'));
    expect(close.getAttribute('aria-label')).toBe('Chiudi');

    close.click();
    expect(/** @type {HTMLElement} */ (container.querySelector('.alert')).hidden).toBe(true);
  });

  it('maps the severities to Bootstrap variants and the right ARIA role', () => {
    const container = host();
    const alerts = bsAlert(container);
    for (const [kind, variant, role] of /** @type {const} */ ([
      ['success', 'alert-success', 'status'],
      ['info', 'alert-info', 'status'],
      ['warning', 'alert-warning', 'alert'],
      ['danger', 'alert-danger', 'alert'],
    ])) {
      alerts.show(kind, kind);
      const root = container.querySelector('.alert');
      expect(root?.classList.contains(variant)).toBe(true);
      expect(root?.getAttribute('role')).toBe(role);
    }
  });

  it('reaches a variant outside the four through the class map', () => {
    // F49's kind vocabulary stays frozen; the costume is what varies.
    const container = host();
    bsAlert(container, { classes: { info: 'alert-primary' } }).show('info', 'x');
    expect(container.querySelector('.alert')?.classList.contains('alert-primary')).toBe(true);
  });

  it('delegates the F49 behaviours rather than reimplementing them', () => {
    vi.useFakeTimers();
    const container = host();
    const alerts = bsAlert(container, { autoHideMs: 1_000 });

    alerts.show('info', 'first');
    vi.advanceTimersByTime(900);
    alerts.show('info', 'second');
    // Re-showing cancels the pending timer, so the newer message gets its full
    // time — an F49 property, inherited, not rebuilt.
    vi.advanceTimersByTime(900);
    expect(/** @type {HTMLElement} */ (container.querySelector('.alert')).hidden).toBe(false);
    vi.advanceTimersByTime(200);
    expect(/** @type {HTMLElement} */ (container.querySelector('.alert')).hidden).toBe(true);

    // Escaping, too, is the engine's:
    alerts.show('info', '<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
    expect(() => alerts.show('info', '<b>x</b>', { html: true })).toThrow(/sanitize is required/);
  });

  it('renders no close button when it is not dismissible', () => {
    const container = host();
    bsAlert(container, { dismissible: false }).show('info', 'x');
    expect(container.querySelector('.btn-close')).toBeNull();
  });

  it('rejects malformed options', () => {
    expect(() => bsAlert(host(), { classes: /** @type {never} */ (7) })).toThrow(
      /classes must be an object/,
    );
    expect(() => bsAlert(host(), { icons: /** @type {never} */ (7) })).toThrow(
      /icons must be an object/,
    );
  });
});

describe('bsPagination', () => {
  /** @param {number} page @param {number} pageCount */
  function pagerFor(page, pageCount, options = {}) {
    const container = host();
    const onPage = vi.fn();
    const pager = bsPagination(container, { onPage, ...options });
    pager.update({ page, pageCount });
    return { container, pager, onPage };
  }

  /** @param {Element} container */
  const rendered = (container) =>
    [...container.querySelectorAll('.page-link')].map((el) => el.textContent);

  it('renders prev/next around the page window', () => {
    const { container } = pagerFor(1, 3);
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Pagination');
    expect(rendered(container)).toEqual(['‹', '1', '2', '3', '›']);
    expect(container.querySelector('.page-item')?.classList.contains('disabled')).toBe(true);
  });

  it('marks the active page for assistive technology, not only visually', () => {
    const { container } = pagerFor(2, 3);
    const active = container.querySelector('.page-item.active');
    expect(active?.getAttribute('aria-current')).toBe('page');
    expect(active?.textContent).toBe('2');
  });

  it('elides long ranges, keeping the ends and the current page reachable', () => {
    expect(rendered(pagerFor(1, 5).container)).toEqual(['‹', '1', '2', '…', '5', '›']);
    expect(rendered(pagerFor(10, 20).container)).toEqual([
      '‹',
      '1',
      '…',
      '9',
      '10',
      '11',
      '…',
      '20',
      '›',
    ]);
    // siblingCount: 0 asks for no neighbours, and gets none.
    expect(rendered(pagerFor(5, 9, { siblingCount: 0 }).container)).toEqual([
      '‹',
      '1',
      '…',
      '5',
      '…',
      '9',
      '›',
    ]);
  });

  it('never hides a single page behind an ellipsis', () => {
    // A one-page gap costs the same width as the ellipsis that would hide it,
    // so the number wins.
    expect(rendered(pagerFor(1, 4).container)).toEqual(['‹', '1', '2', '3', '4', '›']);
    expect(rendered(pagerFor(5, 9, { siblingCount: 1, boundaryCount: 2 }).container)).toEqual([
      '‹',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '›',
    ]);
  });

  it('renders the gap as a span, so it is not a control that does nothing', () => {
    const { container } = pagerFor(10, 20);
    const gap = [...container.querySelectorAll('.page-link')].find((el) => el.textContent === '…');
    expect(gap?.tagName).toBe('SPAN');
    expect(gap?.hasAttribute('data-egl-page')).toBe(false);
  });

  it('uses buttons, not fake fragment links', () => {
    const { container } = pagerFor(1, 2);
    const pages = [...container.querySelectorAll('[data-egl-page]')];
    expect(pages.every((el) => el.tagName === 'BUTTON')).toBe(true);
    expect(container.querySelector('a')).toBeNull();
  });

  it('calls onPage for a real move and stays silent otherwise', () => {
    const { container, onPage } = pagerFor(2, 5);
    const click = (/** @type {string} */ text) => {
      const el = [...container.querySelectorAll('.page-link')].find((n) => n.textContent === text);
      /** @type {HTMLElement} */ (el).click();
    };

    click('3');
    expect(onPage).toHaveBeenLastCalledWith(3);
    click('‹');
    expect(onPage).toHaveBeenLastCalledWith(1);
    // The current page and a disabled step are no-ops, not events.
    click('2');
    expect(onPage).toHaveBeenCalledTimes(2);
  });

  it('does not move past the ends', () => {
    const { container, onPage } = pagerFor(1, 3);
    const prev = /** @type {HTMLElement} */ (container.querySelector('.page-link'));
    expect(prev.hasAttribute('disabled')).toBe(true);
    prev.click();
    expect(onPage).not.toHaveBeenCalled();
  });

  it('takes the pipeline’s view shape unchanged, and clamps a stale one', () => {
    // update() is fed straight from tablePipeline.view() — no adapter.
    const { container } = pagerFor(99, 3);
    expect(container.querySelector('.page-item.active')?.textContent).toBe('3');
  });

  it('injects every human-readable string; the glyphs stay language-neutral', () => {
    const { container } = pagerFor(2, 3, {
      labels: {
        nav: 'Navigazione',
        previous: 'Precedente',
        next: 'Successiva',
        previousText: '«',
        nextText: '»',
        page: (/** @type {number} */ n) => `Pagina ${n}`,
      },
    });
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Navigazione');
    const links = [...container.querySelectorAll('.page-link')];
    expect(links[0].textContent).toBe('«');
    expect(links[0].getAttribute('aria-label')).toBe('Precedente');
    expect(links.at(-1)?.getAttribute('aria-label')).toBe('Successiva');
    expect(links[1].getAttribute('aria-label')).toBe('Pagina 1');
  });

  it('keeps one listener across re-renders and tears down completely', () => {
    const { container, pager, onPage } = pagerFor(1, 5);
    const added = vi.spyOn(container.querySelector('.pagination'), 'addEventListener');
    pager.update({ page: 3, pageCount: 5 });
    expect(added).not.toHaveBeenCalled();

    pager.destroy();
    expect(container.children).toHaveLength(0);
    expect(onPage).not.toHaveBeenCalled();
    expect(() => pager.destroy()).not.toThrow();
    expect(() => pager.update({ page: 1, pageCount: 1 })).toThrow(/after destroy\(\)/);
  });

  it('an aborted signal destroys it, before or after construction (NFR-15)', () => {
    const controller = new AbortController();
    const container = host();
    const pager = bsPagination(container, { onPage: () => {}, signal: controller.signal });
    controller.abort();
    expect(pager.element.parentElement).toBeNull();

    const already = new AbortController();
    already.abort();
    const dead = bsPagination(host(), { onPage: () => {}, signal: already.signal });
    expect(() => dead.update({ page: 1, pageCount: 1 })).toThrow(/after destroy\(\)/);
  });

  it('ignores a click that lands on no page control', () => {
    const { container, onPage } = pagerFor(1, 3);
    /** @type {HTMLElement} */ (container.querySelector('.pagination')).dispatchEvent(
      new Event('click', { bubbles: true }),
    );
    expect(onPage).not.toHaveBeenCalled();
  });

  it('drops the boundaries when boundaryCount is zero', () => {
    expect(rendered(pagerFor(5, 9, { boundaryCount: 0 }).container)).toEqual([
      '‹',
      '4',
      '5',
      '6',
      '›',
    ]);
  });

  it('renders the sized variant', () => {
    const { container } = pagerFor(1, 2, { size: 'sm' });
    expect([...(container.querySelector('.pagination')?.classList ?? [])]).toEqual([
      'pagination',
      'pagination-sm',
    ]);
  });

  it.each([
    [
      'a non-element container',
      () => bsPagination(/** @type {never} */ (null), { onPage() {} }),
      /container must be an Element/,
    ],
    [
      'missing options',
      () => bsPagination(host(), /** @type {never} */ (undefined)),
      /options must be an object/,
    ],
    [
      'a non-function onPage',
      () => bsPagination(host(), { onPage: /** @type {never} */ (7) }),
      /onPage must be a function/,
    ],
    [
      'a negative siblingCount',
      () => bsPagination(host(), { onPage() {}, siblingCount: -1 }),
      /siblingCount must be a non-negative integer/,
    ],
    [
      'a fractional boundaryCount',
      () => bsPagination(host(), { onPage() {}, boundaryCount: 1.5 }),
      /boundaryCount must be a non-negative integer/,
    ],
    ['a bad size', () => bsPagination(host(), { onPage() {}, size: 'a b' }), /size must be/],
    [
      'non-object labels',
      () => bsPagination(host(), { onPage() {}, labels: /** @type {never} */ (7) }),
      /labels must be an object/,
    ],
    [
      'a non-function page label',
      () => bsPagination(host(), { onPage() {}, labels: { page: /** @type {never} */ ('x') } }),
      /labels\.page must be a function/,
    ],
    [
      'a non-signal signal',
      () => bsPagination(host(), { onPage() {}, signal: /** @type {never} */ ({}) }),
      /must be an AbortSignal/,
    ],
  ])('rejects %s', (_label, act, message) => {
    expect(act).toThrow(TypeError);
    expect(act).toThrow(message);
  });

  it('rejects a malformed view', () => {
    const { pager } = pagerFor(1, 2);
    expect(() => pager.update(/** @type {never} */ (null))).toThrow(
      /update\(view\) must be an object/,
    );
    expect(() => pager.update({ page: Number.NaN, pageCount: 2 })).toThrow(
      /finite page and pageCount/,
    );
  });
});
