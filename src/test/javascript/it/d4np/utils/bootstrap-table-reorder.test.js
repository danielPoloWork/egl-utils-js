// @vitest-environment jsdom
// Tests (roadmap 19.7, spec 06 §2 item F100, §6) for column reorder.
//
// The order model is the part that matters and the part jsdom can prove in full:
// what `getColumnOrder()` reports, what `setColumnOrder()` accepts and refuses,
// that every row mirroring the columns moves together, and that the cells are
// **moved rather than rebuilt**. What jsdom cannot do is decide which header a
// pointer is over — that needs layout — so the drag's geometry is asserted in the
// Playwright suite, on three engines.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bsTable } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

const ROWS = [
  { a: 'a1', b: 'b1', c: 'c1' },
  { a: 'a2', b: 'b2', c: 'c2' },
];

const COLUMNS = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

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

/**
 * A move handle, with the pointer-capture pair jsdom does not implement — the
 * same accommodation the F99 suite makes, and for the same reason: the source
 * calls them outright, because they are Safari 13 against a 16.4 floor.
 *
 * @param {string} key
 * @returns {Element}
 */
const handle = (key) => {
  const el = /** @type {any} */ (host.querySelector(`[data-egl-move="${key}"]`));
  el.setPointerCapture ??= () => {};
  el.releasePointerCapture ??= () => {};
  return el;
};

const headerKeys = () =>
  [...host.querySelectorAll('thead tr:first-child th')].map((th) =>
    th.textContent?.replace(/\s/g, ''),
  );
const bodyText = () =>
  [...host.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent));

/**
 * @param {Element} target
 * @param {string} key
 * @returns {Event}
 */
function press(target, key) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = /** @type {Element} */ (document.getElementById('host'));
  teardown = [];
});

afterEach(() => {
  for (const fn of teardown) fn();
});

describe('off by default', () => {
  it('renders no handle and exposes no order', () => {
    const instance = table();
    expect(host.querySelectorAll('[data-egl-move]')).toHaveLength(0);
    expect(instance.getColumnOrder).toBeUndefined();
    expect(instance.setColumnOrder).toBeUndefined();
  });
});

describe('what it builds', () => {
  it('gives every column a focusable handle with an accessible name', () => {
    table({ reorder: true });
    const grip = handle('a');
    expect(grip.getAttribute('role')).toBe('button');
    expect(grip.getAttribute('tabindex')).toBe('0');
    expect(grip.getAttribute('aria-label')).toBe('Move a');
  });

  it('names a column by its label, and takes a label function', () => {
    table({ columns: [{ key: 'a', label: 'Host' }], reorder: true });
    expect(handle('a').getAttribute('aria-label')).toBe('Move Host');
    document.body.innerHTML = '<div id="host2"></div>';
    host = /** @type {Element} */ (document.getElementById('host2'));
    table({ reorder: { label: (column) => `Sposta ${column.key}` } });
    expect(handle('b').getAttribute('aria-label')).toBe('Sposta b');
  });

  it('puts the handle on the leading edge, where the F99 grip is not', () => {
    table({ reorder: true, resize: true });
    const move = /** @type {any} */ (handle('a'));
    const grip = /** @type {any} */ (host.querySelector('[data-egl-resize="a"]'));
    // One control per edge: a table with both features has no overlap.
    expect(move.style.getPropertyValue('left')).toBe('0px');
    expect(move.style.getPropertyValue('right')).toBe('');
    expect(grip.style.getPropertyValue('right')).toBe('0px');
    expect(grip.style.getPropertyValue('left')).toBe('');
  });

  it('exempts a column that asked to be exempt', () => {
    table({ columns: [{ key: 'a' }, { key: 'b', movable: false }], reorder: true });
    expect(
      [...host.querySelectorAll('[data-egl-move]')].map((el) => el.getAttribute('data-egl-move')),
    ).toEqual(['a']);
  });

  it('does not fight a sticky header for the containing block', () => {
    table({ reorder: true, sticky: true });
    expect(
      /** @type {any} */ (host.querySelector('thead th')).style.getPropertyValue('position'),
    ).toBe('sticky');
  });
});

describe('the order model', () => {
  it('starts as the columns were declared', () => {
    expect(table({ reorder: true }).getColumnOrder()).toEqual(['a', 'b', 'c']);
  });

  it('hands back a copy, so a caller cannot reorder the table by mutating it', () => {
    const instance = table({ reorder: true });
    const order = instance.getColumnOrder();
    order.reverse();
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
  });

  it('moves the header and every body row together', () => {
    const instance = table({ reorder: true });
    instance.setColumnOrder(['c', 'a', 'b']);
    expect(instance.getColumnOrder()).toEqual(['c', 'a', 'b']);
    expect(headerKeys()).toEqual(['c', 'a', 'b']);
    expect(bodyText()).toEqual([
      ['c1', 'a1', 'b1'],
      ['c2', 'a2', 'b2'],
    ]);
  });

  it('survives a re-render, because the render reads the order', () => {
    const instance = table({ reorder: true });
    instance.setColumnOrder(['b', 'c', 'a']);
    // A pipeline change rebuilds the body from scratch; it must come back in the
    // order on screen, not the order the columns were declared in.
    instance.setData([{ a: 'x', b: 'y', c: 'z' }]);
    expect(bodyText()).toEqual([['y', 'z', 'x']]);
    expect(headerKeys()).toEqual(['b', 'c', 'a']);
  });

  it('leaves the selection column first', () => {
    const instance = table({ reorder: true, selection: true, rowKey: 'a' });
    instance.setColumnOrder(['c', 'b', 'a']);
    // The checkbox is ours, not one of the caller's columns: it is not in the
    // order and it does not move.
    expect(host.querySelector('tbody tr')?.firstElementChild?.querySelector('input')).not.toBe(
      null,
    );
    expect(bodyText()[0].slice(1)).toEqual(['c1', 'b1', 'a1']);
  });

  it('moves the F99 col elements with the columns they size', () => {
    const instance = table({
      columns: [
        { key: 'a', width: 100 },
        { key: 'b', width: 200 },
        { key: 'c', width: 300 },
      ],
      reorder: true,
      resize: true,
    });
    instance.setColumnOrder(['c', 'a', 'b']);
    // A `<col>` sizes whichever column sits in its slot, so it has to travel with
    // the header — otherwise every width lands on the wrong column.
    instance.setColumnWidths({ a: 111 });
    expect(
      [...instance.table.querySelectorAll('colgroup > col')].map((col) =>
        /** @type {any} */ (col).style.getPropertyValue('width'),
      ),
    ).toEqual(['300px', '111px', '200px']);
  });

  it('moves the F67 filter row too', () => {
    const instance = table({ reorder: true, controls: { filterRow: true } });
    instance.setColumnOrder(['c', 'b', 'a']);
    const inputs = [...host.querySelectorAll('thead tr:last-child input')];
    // Each filter input must stay under the column it filters; leaving the row
    // behind would put every filter under its neighbour.
    expect(inputs.map((input) => input.getAttribute('aria-label'))).toEqual([
      'Filter c',
      'Filter b',
      'Filter a',
    ]);
  });

  it('leaves the empty-state row alone', () => {
    const instance = table({ reorder: true, data: [], empty: 'Nothing here' });
    instance.setColumnOrder(['c', 'b', 'a']);
    const cells = [...(host.querySelector('tbody tr')?.children ?? [])];
    // One cell spanning every column: there is nothing in it to permute, and
    // touching it would be how a colspan gets lost.
    expect(cells).toHaveLength(1);
    expect(cells[0].getAttribute('colspan')).toBe('3');
    expect(cells[0].textContent).toBe('Nothing here');
  });
});

describe('what it never does', () => {
  it('moves cells rather than rebuilding them', () => {
    const instance = table({ reorder: true });
    const before = [...instance.table.querySelectorAll('tbody td')];
    instance.setColumnOrder(['c', 'b', 'a']);
    const after = [...instance.table.querySelectorAll('tbody td')];
    // Node identity: the same `<td>` objects in a different sequence. A rebuild
    // would produce equal-looking cells and pass a count.
    expect(new Set(after)).toEqual(new Set(before));
    expect(after).not.toEqual(before);
  });

  it('never tells the pipeline about the order', () => {
    const instance = table({ reorder: true });
    instance.pipeline.setFilter('a', 'a1');
    instance.setColumnOrder(['c', 'b', 'a']);
    // Reorder is presentation. Which column a filter addresses has nothing to do
    // with where that column is drawn, so the derived view is untouched.
    expect(instance.pipeline.view().filters).toEqual({ a: 'a1' });
    expect(instance.pipeline.view().rows).toHaveLength(1);
  });
});

describe('the keyboard path', () => {
  it('steps a column one slot per press, in both directions', () => {
    const instance = table({ reorder: true });
    press(handle('a'), 'ArrowRight');
    expect(instance.getColumnOrder()).toEqual(['b', 'a', 'c']);
    press(handle('a'), 'ArrowRight');
    expect(instance.getColumnOrder()).toEqual(['b', 'c', 'a']);
    press(handle('a'), 'ArrowLeft');
    expect(instance.getColumnOrder()).toEqual(['b', 'a', 'c']);
  });

  it('stops at the ends rather than wrapping', () => {
    const instance = table({ reorder: true });
    press(handle('a'), 'ArrowLeft');
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
    press(handle('c'), 'ArrowRight');
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
  });

  it('keeps the focus on the handle it moved', () => {
    table({ reorder: true });
    const grip = /** @type {any} */ (handle('a'));
    grip.focus();
    press(grip, 'ArrowRight');
    // Moving a node can drop the focus it was holding; without restoring it the
    // second arrow press would go nowhere.
    expect(document.activeElement).toBe(grip);
  });

  it('claims the arrow, and leaves every other key alone', () => {
    table({ reorder: true });
    expect(press(handle('a'), 'ArrowRight').defaultPrevented).toBe(true);
    expect(press(handle('a'), 'Enter').defaultPrevented).toBe(false);
  });

  it('ignores a key pressed anywhere but a handle', () => {
    const instance = table({ reorder: true });
    press(/** @type {Element} */ (host.querySelector('thead th')), 'ArrowRight');
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
  });
});

describe('the pointer path', () => {
  /**
   * @param {Element} target
   * @param {string} type
   * @param {number} [clientX]
   */
  const fire = (target, type, clientX = 0) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX, pointerId: 1 });
    target.dispatchEvent(event);
    return event;
  };

  /**
   * Give the headers widths jsdom will not.
   *
   * The swap rule is **arithmetic over displacement** — how far the pointer has
   * travelled against half the neighbour's width — and arithmetic is testable
   * here. What is not is which header a pointer is over, so the browser suite
   * still owns the geometry; this owns the rule.
   *
   * @param {number} width
   * @returns {void}
   */
  const stubWidths = (width) => {
    for (const th of host.querySelectorAll('thead th')) {
      /** @type {any} */ (th).getBoundingClientRect = () => ({ left: 0, width });
    }
  };

  it('swaps once the pointer passes half the neighbour', () => {
    const instance = table({ reorder: true });
    stubWidths(100);
    const grip = handle('a');
    fire(grip, 'pointerdown', 0);
    fire(grip, 'pointermove', 49);
    // Half the neighbour's width is the threshold, and 49 is not past it.
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
    fire(grip, 'pointermove', 51);
    expect(instance.getColumnOrder()).toEqual(['b', 'a', 'c']);
    fire(grip, 'pointerup', 51);
  });

  it('measures from where the gesture began, not from the grab point', () => {
    const instance = table({ reorder: true });
    stubWidths(100);
    const grip = handle('a');
    // The handle sits on the header's leading edge, so an absolute rule would
    // need a column's own width plus half the neighbour's before anything moved.
    // Displacement makes the grab point irrelevant: 51 px is 51 px.
    fire(grip, 'pointerdown', 640);
    fire(grip, 'pointermove', 691);
    expect(instance.getColumnOrder()).toEqual(['b', 'a', 'c']);
  });

  it('keeps swapping as the pointer keeps going, one slot per threshold', () => {
    const instance = table({ reorder: true });
    stubWidths(100);
    const grip = handle('a');
    fire(grip, 'pointerdown', 0);
    fire(grip, 'pointermove', 60);
    fire(grip, 'pointermove', 170);
    expect(instance.getColumnOrder()).toEqual(['b', 'c', 'a']);
    fire(grip, 'pointerup', 170);
  });

  it('comes back the way it went', () => {
    const instance = table({ reorder: true });
    stubWidths(100);
    const grip = handle('c');
    fire(grip, 'pointerdown', 0);
    fire(grip, 'pointermove', -60);
    expect(instance.getColumnOrder()).toEqual(['a', 'c', 'b']);
    fire(grip, 'pointermove', 0);
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
    fire(grip, 'pointerup', 0);
  });

  it('has nothing to pass at the ends', () => {
    const instance = table({ reorder: true });
    stubWidths(100);
    const grip = handle('a');
    fire(grip, 'pointerdown', 0);
    // A column at the leading edge has no neighbour behind it, however far the
    // pointer goes.
    fire(grip, 'pointermove', -5000);
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
    fire(grip, 'pointerup', -5000);
  });

  it('commits a drag that moved, and only that', () => {
    /** @type {unknown[]} */
    const seen = [];
    const instance = table({
      reorder: { onReorder: (order, key) => seen.push([key, [...order]]) },
    });
    stubWidths(100);
    const grip = handle('a');
    fire(grip, 'pointerdown', 0);
    fire(grip, 'pointermove', 60);
    fire(grip, 'pointermove', 80);
    fire(grip, 'pointerup', 80);
    // One commit for the gesture, not one per crossing and not one per move.
    expect(seen).toEqual([['a', ['b', 'a', 'c']]]);
    expect(instance.getColumnOrder()).toEqual(['b', 'a', 'c']);
  });

  it('opens a gesture on a handle and closes it on release', () => {
    const instance = table({ reorder: true });
    const grip = handle('a');
    fire(grip, 'pointerdown');
    expect(/** @type {any} */ (grip).style.getPropertyValue('cursor')).toBe('grabbing');
    fire(grip, 'pointerup');
    expect(/** @type {any} */ (grip).style.getPropertyValue('cursor')).toBe('grab');
    // jsdom measures every header at zero, so no midpoint is ever crossed and the
    // order cannot change here. The geometry is the browser suite's job.
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
  });

  it('ignores a move, a release and a press that no handle began', () => {
    const instance = table({ reorder: true });
    fire(handle('a'), 'pointermove', 500);
    fire(handle('a'), 'pointerup');
    fire(/** @type {Element} */ (host.querySelector('thead th')), 'pointerdown');
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
  });

  it('ends a cancelled gesture as it would a released one', () => {
    const instance = table({ reorder: true });
    const grip = handle('a');
    fire(grip, 'pointerdown');
    fire(grip, 'pointercancel');
    expect(/** @type {any} */ (grip).style.getPropertyValue('cursor')).toBe('grab');
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
  });

  it('does not sort the column it just moved', () => {
    const instance = table({
      columns: [{ key: 'a', sortable: true }, { key: 'b' }],
      reorder: true,
      controls: { search: true },
    });
    fire(handle('a'), 'pointerdown');
    fire(handle('a'), 'pointerup');
    fire(handle('a'), 'click');
    expect(instance.pipeline.view().sort).toEqual([]);
    // The header itself still sorts: the guard is about the handle, not the cell.
    /** @type {Element} */ (host.querySelector('th[data-sort-key]')).dispatchEvent(
      new window.Event('click', { bubbles: true, cancelable: true }),
    );
    expect(instance.pipeline.view().sort).toHaveLength(1);
  });
});

describe('the commit callback', () => {
  it('fires once per arrow press, with the new order and the key that moved', () => {
    /** @type {unknown[]} */
    const seen = [];
    table({ reorder: { onReorder: (order, key) => seen.push([key, [...order]]) } });
    press(handle('a'), 'ArrowRight');
    expect(seen).toEqual([['a', ['b', 'a', 'c']]]);
  });

  it('does not fire for a press that changed nothing', () => {
    /** @type {unknown[]} */
    const seen = [];
    table({ reorder: { onReorder: () => seen.push(1) } });
    press(handle('a'), 'ArrowLeft');
    expect(seen).toHaveLength(0);
  });

  it('does not fire for a programmatic order', () => {
    /** @type {unknown[]} */
    const seen = [];
    const instance = table({ reorder: { onReorder: () => seen.push(1) } });
    // The caller already knows: they just supplied it.
    instance.setColumnOrder(['c', 'b', 'a']);
    expect(seen).toHaveLength(0);
  });
});

describe('setColumnOrder refuses what it cannot mean', () => {
  it('refuses a partial order, naming what is missing', () => {
    const instance = table({ reorder: true });
    expect(() => instance.setColumnOrder(['c', 'a'])).toThrow(
      /needs every column key exactly once, and is missing 'b'/,
    );
  });

  it('refuses a duplicate', () => {
    const instance = table({ reorder: true });
    expect(() => instance.setColumnOrder(['a', 'a', 'b'])).toThrow(
      /needs every column key exactly once/,
    );
  });

  it('refuses a key that is not a column', () => {
    const instance = table({ reorder: true });
    expect(() => instance.setColumnOrder(['a', 'b', 'nope'])).toThrow(
      /names no such column 'nope'/,
    );
  });

  it('refuses anything that is not an array', () => {
    const instance = table({ reorder: true });
    expect(() => instance.setColumnOrder('abc')).toThrow(/expects an array of column keys/);
  });

  it('writes nothing when it refuses', () => {
    const instance = table({ reorder: true });
    expect(() => instance.setColumnOrder(['c', 'a'])).toThrow(TypeError);
    expect(instance.getColumnOrder()).toEqual(['a', 'b', 'c']);
    expect(headerKeys()).toEqual(['a', 'b', 'c']);
  });

  it('still places a column the user cannot pick up', () => {
    const instance = table({
      columns: [{ key: 'a' }, { key: 'b', movable: false }, { key: 'c' }],
      reorder: true,
    });
    // `movable: false` exempts the *user*, not the caller — the same rule
    // `resizable: false` follows for widths.
    instance.setColumnOrder(['b', 'c', 'a']);
    expect(headerKeys()).toEqual(['b', 'c', 'a']);
  });

  it('refuses to write after destroy', () => {
    const instance = table({ reorder: true });
    instance.destroy();
    expect(() => instance.setColumnOrder(['c', 'b', 'a'])).toThrow(
      /setColumnOrder\(\) was called after destroy\(\)/,
    );
  });
});

describe('the option contract', () => {
  it('rejects an unknown key in the reorder bag', () => {
    expect(() => table({ reorder: { handel: 4 } })).toThrow(
      /bsTable\.reorder: unknown option 'handel'/,
    );
  });

  it('rejects an unknown column property', () => {
    expect(() => table({ columns: [{ key: 'a', movible: true }], reorder: true })).toThrow(
      /unknown options\.columns\[0\] property 'movible'/,
    );
  });

  it('refuses a malformed handle width and a callback that is not one', () => {
    expect(() => table({ reorder: { handle: 0 } })).toThrow(
      /options\.reorder\.handle must be a positive number of pixels/,
    );
    expect(() => table({ reorder: { onReorder: 'yes' } })).toThrow(
      /options\.reorder\.onReorder must be a function/,
    );
    expect(() => table({ reorder: { label: 1 } })).toThrow(
      /options\.reorder\.label must be a function/,
    );
    expect(() => table({ reorder: 'yes' })).toThrow(TypeError);
  });

  it('treats false as off', () => {
    const instance = table({ reorder: false });
    expect(host.querySelectorAll('[data-egl-move]')).toHaveLength(0);
    expect(instance.getColumnOrder).toBeUndefined();
  });
});
