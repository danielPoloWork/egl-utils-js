// @vitest-environment jsdom
// Tests (roadmap 19.5, spec 06 §2 item F98, §6) for the sticky header.
//
// What jsdom can establish is what this file asserts: which declarations are
// emitted, onto which nodes, and that the contract refuses the configuration that
// would silently do nothing. Whether the header **actually stays put when a
// container scrolls** is a layout question, and jsdom has no layout — that
// assertion lives in the Playwright suite, on three engines.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bsTable } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

const ROWS = Array.from({ length: 5 }, (_unused, index) => ({
  id: index + 1,
  name: `n${index + 1}`,
}));

const COLUMNS = [{ key: 'id', sortable: true }, { key: 'name' }];

/** @type {Element} */
let host;
/** @type {(() => void)[]} */
let teardown;

/** @param {object} [options] */
function table(options = {}) {
  const instance = bsTable(host, { columns: COLUMNS, data: ROWS, ...options });
  teardown.push(() => instance.destroy());
  return instance;
}

const headers = () => [...host.querySelectorAll('thead th')];

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = /** @type {Element} */ (document.getElementById('host'));
  teardown = [];
});

afterEach(() => {
  for (const fn of teardown) fn();
  vi.restoreAllMocks();
});

describe('off by default', () => {
  it('emits no positioning at all', () => {
    table();
    for (const th of headers()) {
      expect(th.getAttribute('style')).toBe(null);
    }
  });
});

describe('what it emits', () => {
  it('sticks every header cell, not the section', () => {
    // Per cell rather than on `thead`/`tr`: engines disagreed about sticky on a
    // table *section* for years, and a cell is where every engine has always
    // honoured it.
    table({ sticky: true });
    const cells = headers();
    expect(cells).toHaveLength(2);
    for (const th of cells) {
      expect(th.style.position).toBe('sticky');
      expect(th.style.top).toBe('0px');
      expect(th.style.zIndex).toBe('2');
    }
    // And nothing was put on the section or the row.
    expect(host.querySelector('thead').getAttribute('style')).toBe(null);
    expect(host.querySelector('thead tr').getAttribute('style')).toBe(null);
  });

  it('redraws the bottom rule as an inset shadow', () => {
    // `border-collapse: collapse` — Bootstrap's default — draws the rule on a
    // shared edge that does not travel with a sticky cell, so a scrolled header
    // loses it. An inset shadow lives inside the cell and travels with it.
    table({ sticky: true });
    expect(headers()[0].style.boxShadow).toBe(
      'inset 0 -1px 0 var(--bs-border-color, currentColor)',
    );
  });

  it('gives the cell an opaque background, from Bootstrap’s own variables', () => {
    // A table cell is transparent by default, so without this the rows scroll
    // visibly *through* the header. Read from `--bs-*` so a theme keeps its
    // colours rather than being overridden by ours.
    table({ sticky: true });
    expect(headers()[0].style.backgroundColor).toBe(
      'var(--bs-table-bg, var(--bs-body-bg, inherit))',
    );
  });

  it('takes a resting offset and a stacking order', () => {
    table({ sticky: { top: '2.5rem', zIndex: 5 } });
    expect(headers()[0].style.top).toBe('2.5rem');
    expect(headers()[0].style.zIndex).toBe('5');
  });

  it('bounds the responsive wrapper when asked, and makes it scroll', () => {
    const instance = table({ responsive: true, sticky: { maxHeight: '400px' } });
    const wrapper = instance.element;
    expect(wrapper.classList.contains('table-responsive')).toBe(true);
    expect(/** @type {any} */ (wrapper).style.maxHeight).toBe('400px');
    // `.table-responsive` only asks for overflow-x; a height with nothing to
    // scroll it is a header that never sticks.
    expect(/** @type {any} */ (wrapper).style.overflowY).toBe('auto');
  });

  it('bounds the scrolling wrapper, never the controls band around it', () => {
    // With controls, `element` is the outer band wrapper. Bounding that would
    // scroll the filter row and the pager out of view with the rows — the
    // opposite of what a sticky header is for.
    const instance = table({
      responsive: true,
      controls: { search: true },
      sticky: { maxHeight: '300px' },
    });
    expect(/** @type {any} */ (instance.element).style.maxHeight).toBe('');
    const scroller = instance.element.querySelector('.table-responsive');
    expect(/** @type {any} */ (scroller).style.maxHeight).toBe('300px');
    expect(scroller.contains(instance.table)).toBe(true);
  });

  it('leaves the container alone when no height was asked for', () => {
    const instance = table({ responsive: true, sticky: true });
    expect(/** @type {any} */ (instance.element).style.maxHeight).toBe('');
    expect(headers()[0].style.position).toBe('sticky');
  });
});

describe('composition', () => {
  it('sticks the selection column with the rest, because it is another th', () => {
    table({ rowKey: 'id', selection: true, sticky: true });
    const cells = headers();
    expect(cells).toHaveLength(3);
    for (const th of cells) expect(th.style.position).toBe('sticky');
  });

  it('leaves the sort control and its aria-sort working', () => {
    // F98's other clause: sticky is CSS, so nothing about sorting may change.
    const instance = table({ sticky: true, controls: { pagination: false } });
    const sortable = host.querySelector('th[data-sort-key="id"]');
    expect(sortable).not.toBe(null);

    instance.pipeline.toggleSort('id');
    expect(instance.pipeline.view().sort).toEqual([{ key: 'id', direction: 'asc' }]);
    // Still sticky, still a sort header.
    expect(/** @type {any} */ (sortable).style.position).toBe('sticky');
    expect(sortable.getAttribute('data-sort-key')).toBe('id');
  });

  it('does not touch the caption', () => {
    // A caption is not a header cell; making it stick would be a second decision
    // nobody asked for.
    table({ sticky: true, caption: 'Hosts', captionTop: true });
    expect(host.querySelector('caption').getAttribute('style')).toBe(null);
  });
});

describe('contract', () => {
  it('refuses a maxHeight with nowhere of ours to put it', () => {
    // The configuration that would silently do nothing: no wrapper, no scroll
    // container, no sticking, and no error to explain it.
    expect(() =>
      bsTable(host, { columns: COLUMNS, data: ROWS, sticky: { maxHeight: '400px' } }),
    ).toThrow(/options.sticky.maxHeight needs options.responsive/);
  });

  it('rejects malformed sticky options and unknown keys', () => {
    const base = { columns: COLUMNS, data: ROWS };
    expect(() => bsTable(host, { ...base, sticky: { top: 0 } })).toThrow(
      /options.sticky.top must be a non-empty CSS length/,
    );
    expect(() => bsTable(host, { ...base, sticky: { top: '' } })).toThrow(/non-empty CSS length/);
    expect(() => bsTable(host, { ...base, responsive: true, sticky: { maxHeight: 400 } })).toThrow(
      /options.sticky.maxHeight must be a non-empty CSS length/,
    );
    expect(() => bsTable(host, { ...base, sticky: { zIndex: 1.5 } })).toThrow(
      /options.sticky.zIndex must be an integer/,
    );
    expect(() => bsTable(host, { ...base, sticky: { stickyTop: '0' } })).toThrow(
      /unknown option 'stickyTop'/,
    );
    expect(() => bsTable(host, { ...base, sticky: 'yes' })).toThrow(
      /options.sticky must be an object/,
    );
  });

  it('takes sticky: false as off', () => {
    table({ sticky: false });
    expect(headers()[0].getAttribute('style')).toBe(null);
  });
});
