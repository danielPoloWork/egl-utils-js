// @vitest-environment jsdom
// Contract tests (roadmap 17.9, ADR-0049) for the instance lifecycle, swept
// across every shape the library returns.
//
// A per-component test proves a component; this file proves the *rule*, which is
// the thing a 1.0 freezes and every 1.x component will copy. Three claims:
// a command on a destroyed instance throws and names itself, a query still
// answers, and `destroy()` never punishes being called twice.
import { describe, expect, it } from 'vitest';

import * as bootstrap from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';
import { inlineAlert, loadingOverlay } from '../../../../../main/javascript/it/d4np/utils/dom.js';

/** @returns {Element} */
function host() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

/**
 * A Bootstrap namespace double: construction is all these tests need, since the
 * contract under test is ours and not Bootstrap's.
 *
 * @returns {Record<string, unknown>}
 */
function peer() {
  class Fake {
    show() {}
    hide() {}
    toggle() {}
    dispose() {}
    enable() {}
    disable() {}
    toggleEnabled() {}
    update() {}
    setContent() {}
    refresh() {}
    to() {}
    prev() {}
    next() {}
    cycle() {}
    pause() {}
  }
  return {
    Modal: Fake,
    Toast: Fake,
    Collapse: Fake,
    Dropdown: Fake,
    Offcanvas: Fake,
    Carousel: Fake,
    ScrollSpy: Fake,
    Tooltip: Fake,
    Popover: Fake,
    Tab: Fake,
  };
}

/**
 * Every instance shape, with one command each and the arguments it needs.
 *
 * @type {Array<[string, () => any, string, unknown[]]>}
 */
const SHAPES = [
  ['bsCollapse', () => bootstrap.bsCollapse(host(), { bootstrap: peer() }), 'show', []],
  ['bsDropdown', () => bootstrap.bsDropdown(host(), { bootstrap: peer() }), 'toggle', []],
  ['bsOffcanvas', () => bootstrap.bsOffcanvas(host(), { bootstrap: peer() }), 'hide', []],
  ['bsModal', () => bootstrap.bsModal(host(), { bootstrap: peer() }), 'show', []],
  ['bsToast', () => bootstrap.bsToast(host(), { bootstrap: peer() }), 'add', ['hi']],
  ['bsToast.hide', () => bootstrap.bsToast(host(), { bootstrap: peer() }), 'hide', []],
  ['bsLoadingOverlay', () => bootstrap.bsLoadingOverlay({ bootstrap: peer() }), 'acquire', []],
  ['loadingOverlay', () => loadingOverlay({ onShow() {}, onHide() {} }), 'acquire', []],
  ['inlineAlert', () => inlineAlert(host()), 'show', ['info', 'x']],
  ['inlineAlert.hide', () => inlineAlert(host()), 'hide', []],
  ['bsAlert', () => bootstrap.bsAlert(host()), 'show', ['info', 'x']],
  ['bsListGroup', () => bootstrap.bsListGroup(['a']), 'setData', [['b']]],
  [
    'bsPagination',
    () => bootstrap.bsPagination(host(), { onPageChange() {} }),
    'setView',
    [{ page: 1, pageCount: 2 }],
  ],
  ['bsProgress', () => bootstrap.bsProgress(), 'setValue', [50]],
  [
    'bsAccordion',
    () =>
      bootstrap.bsAccordion(host(), {
        items: [{ header: 'h', body: 'b' }],
        bootstrap: peer(),
      }),
    'open',
    [0],
  ],
  [
    'bsTabs',
    () => bootstrap.bsTabs(host(), { tabs: [{ label: 'a', pane: 'p' }], bootstrap: peer() }),
    'select',
    [0],
  ],
  [
    'bsCarousel',
    () => bootstrap.bsCarousel(host(), { items: [{ content: 'a' }], bootstrap: peer() }),
    'next',
    [],
  ],
  ['bsScrollspy', () => bootstrap.bsScrollspy(host(), { bootstrap: peer() }), 'refresh', []],
  ['bsTooltip', () => bootstrap.bsTooltip(host(), { bootstrap: peer() }), 'show', []],
  ['bsPopover', () => bootstrap.bsPopover(host(), { bootstrap: peer() }), 'setContent', [{}]],
  [
    'bsTable',
    () => bootstrap.bsTable(host(), { columns: [{ key: 'a' }], data: [{ a: 1 }] }),
    'setData',
    [[{ a: 2 }]],
  ],
];

describe('a command after destroy() throws, and names the method', () => {
  it.each(SHAPES)('%s', (name, make, method, args) => {
    const instance = make();
    const api = name.split('.')[0];
    instance.destroy();
    expect(() => instance[method](...args)).toThrow(TypeError);
    // The message names the API *and* the method the caller used — not the
    // internal chokepoint the guard happens to sit on (ADR-0049).
    expect(() => instance[method](...args)).toThrow(
      `${api}: ${method}() was called after destroy()`,
    );
  });

  it('names the composing entry, not the engine it borrows', () => {
    // `bsAlert` is `inlineAlert` in a Bootstrap costume (ADR-0038); before 17.9
    // its failures said `inlineAlert`, which named a function the caller never
    // invoked.
    const alerts = bootstrap.bsAlert(host());
    alerts.destroy();
    expect(() => alerts.show('info', 'x')).toThrow('bsAlert: show() was called after destroy()');
    const engine = inlineAlert(host());
    engine.destroy();
    expect(() => engine.show('info', 'x')).toThrow(
      'inlineAlert: show() was called after destroy()',
    );
  });

  it('refuses `on` and `instance` too — a subscription is a command', () => {
    const modal = bootstrap.bsModal(host(), { bootstrap: peer() });
    modal.destroy();
    expect(() => modal.on('shown', () => {})).toThrow('bsModal: on() was called after destroy()');
    expect(() => modal.instance()).toThrow('bsModal: instance() was called after destroy()');
  });
});

describe('a query still answers after destroy()', () => {
  it.each([
    ['bsCollapse', () => bootstrap.bsCollapse(host(), { bootstrap: peer() })],
    ['bsModal', () => bootstrap.bsModal(host(), { bootstrap: peer() })],
    ['bsTooltip', () => bootstrap.bsTooltip(host(), { bootstrap: peer() })],
    ['bsToast', () => bootstrap.bsToast(host(), { bootstrap: peer() })],
    ['inlineAlert', () => inlineAlert(host())],
    ['loadingOverlay', () => loadingOverlay({ onShow() {}, onHide() {} })],
  ])('%s.isShown() is false rather than a throw', (_name, make) => {
    // A destroyed component is not shown. That is true, not merely convenient —
    // throwing would make a caller guard a question that has an answer.
    const instance = make();
    instance.destroy();
    expect(instance.isShown()).toBe(false);
  });
});

describe('destroy() is idempotent everywhere', () => {
  it.each(SHAPES)('%s', (_name, make) => {
    const instance = make();
    instance.destroy();
    expect(() => instance.destroy()).not.toThrow();
  });
});

describe('every instance that owns a node exposes `element`', () => {
  it.each([
    ['bsCollapse', () => bootstrap.bsCollapse(host(), { bootstrap: peer() })],
    ['bsModal', () => bootstrap.bsModal(host(), { bootstrap: peer() })],
    ['bsToast', () => bootstrap.bsToast(host(), { bootstrap: peer() })],
    ['bsLoadingOverlay', () => bootstrap.bsLoadingOverlay({ bootstrap: peer() })],
    ['inlineAlert', () => inlineAlert(host())],
    ['bsAlert', () => bootstrap.bsAlert(host())],
    ['bsListGroup', () => bootstrap.bsListGroup(['a'])],
    ['bsPagination', () => bootstrap.bsPagination(host(), { onPageChange() {} })],
    ['bsProgress', () => bootstrap.bsProgress()],
    ['bsTooltip', () => bootstrap.bsTooltip(host(), { bootstrap: peer() })],
    ['bsScrollspy', () => bootstrap.bsScrollspy(host(), { bootstrap: peer() })],
    ['bsTable', () => bootstrap.bsTable(host(), { columns: [{ key: 'a' }], data: [{ a: 1 }] })],
  ])('%s', (_name, make) => {
    const instance = make();
    expect(instance.element).toBeInstanceOf(Element);
    // Still readable after teardown: a property is not a command, and a detached
    // node is exactly what a caller inspecting a torn-down component wants.
    instance.destroy();
    expect(instance.element).toBeInstanceOf(Element);
  });

  it('exempts the F50 gate, which owns no node by design', () => {
    // The gate owns *when* an overlay is visible; the presentation lives entirely
    // in the caller's onShow/onHide (ADR-0032). There is nothing to hand back, and
    // inventing one would be a lie.
    const gate = loadingOverlay({ onShow() {}, onHide() {} });
    expect(gate).not.toHaveProperty('element');
  });
});

describe('the three container-taking managers resolve a document alike', () => {
  it('takes the container document by default and an override when named', () => {
    // 17.8 left this asymmetric: `bsToast` accepted a `document` override while
    // `bsPagination` and `bsTable` rejected it as an unknown option.
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const foreign = /** @type {Document} */ (
      /** @type {HTMLIFrameElement} */ (frame).contentDocument
    );
    const inFrame = foreign.createElement('div');
    foreign.body.append(inFrame);

    expect(bootstrap.bsPagination(inFrame, { onPageChange() {} }).element.ownerDocument).toBe(
      foreign,
    );
    expect(
      bootstrap.bsTable(inFrame, { columns: [{ key: 'a' }], data: [] }).element.ownerDocument,
    ).toBe(foreign);

    expect(() => bootstrap.bsPagination(host(), { onPageChange() {}, document })).not.toThrow();
    expect(() =>
      bootstrap.bsTable(host(), { columns: [{ key: 'a' }], data: [], document }),
    ).not.toThrow();
  });
});
