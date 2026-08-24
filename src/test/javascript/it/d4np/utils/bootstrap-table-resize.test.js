// @vitest-environment jsdom
// Tests (roadmap 19.6, spec 06 §2 item F99, §6) for column resize.
//
// The split follows what jsdom can honestly establish. It has **no layout**:
// every `getBoundingClientRect()` returns zeros, so "the column is now 240 px
// wide on screen" is not a question this file can ask. What it can prove is the
// whole contract around that: which nodes carry the widths, that a resize never
// touches a row, that the floor holds, that the keyboard path reaches the same
// state the pointer one does, and that a saved layout round-trips. Whether the
// pointer drag actually moves a boundary in a real engine is asserted in the
// Playwright suite, on three of them.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bsTable } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

const ROWS = Array.from({ length: 4 }, (_unused, index) => ({
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

/** @param {import('vitest').Assertion} _unused */
const grips = () => [...host.querySelectorAll('[data-egl-resize]')];
/**
 * A grip, with the two pointer-capture methods jsdom does not implement.
 *
 * The suite already fabricates the pointer events themselves — jsdom has no
 * `PointerEvent` — so supplying the capture pair is the same accommodation, not a
 * new one. The source calls them outright rather than optionally, because they
 * are Safari 13 against a 16.4 floor: an optional call would be a branch no
 * supported runtime takes.
 *
 * @param {string} key
 * @returns {Element}
 */
const grip = (key) => {
  const el = /** @type {any} */ (host.querySelector(`[data-egl-resize="${key}"]`));
  el.setPointerCapture ??= () => {};
  el.releasePointerCapture ??= () => {};
  return el;
};
/** @param {Element} el @param {string} property */
const style = (el, property) => /** @type {any} */ (el).style.getPropertyValue(property);

/**
 * A pointer gesture, as the engine delivers it: `pointerdown` on the grip, then
 * moves and the release retargeted to it by pointer capture (which jsdom does
 * not implement, so the test does what capture would have done).
 *
 * @param {Element} target
 * @param {number[]} xs - `clientX` at the press, then at each move. The release
 *   happens where the last move left the pointer, which is what an engine
 *   delivers: `pointerup` is always preceded by a move to its own coordinate.
 * @returns {void}
 */
function drag(target, xs) {
  const [start, ...moves] = xs;
  const fire = (/** @type {string} */ type, /** @type {number} */ clientX) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX, pointerId: 1 });
    target.dispatchEvent(event);
  };
  fire('pointerdown', start);
  for (const x of moves) fire('pointermove', x);
  fire('pointerup', moves.at(-1) ?? start);
}

/**
 * @param {Element} target
 * @param {string} key
 * @param {boolean} [shiftKey]
 * @returns {Event}
 */
function press(target, key, shiftKey = false) {
  const event = new window.KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
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
  it('renders no colgroup, no grip and no instance methods', () => {
    const instance = table();
    expect(host.querySelector('colgroup')).toBe(null);
    expect(grips()).toHaveLength(0);
    expect(instance.getColumnWidths).toBeUndefined();
    expect(instance.setColumnWidths).toBeUndefined();
  });
});

describe('what it builds', () => {
  it('gives every column a col, in order, after the caption', () => {
    const instance = table({ resize: true, caption: 'Hosts' });
    const children = [...instance.table.children].map((node) => node.tagName.toLowerCase());
    // `<caption>` must stay first; `<colgroup>` belongs between it and the
    // sections, which is where the HTML parser would have put it.
    expect(children).toEqual(['caption', 'colgroup', 'thead', 'tbody']);
    expect(instance.table.querySelectorAll('colgroup > col')).toHaveLength(COLUMNS.length);
  });

  it('gives the selection column a col of its own and no grip', () => {
    const instance = table({ resize: true, selection: true, rowKey: 'id' });
    // One more `<col>` than there are columns: without it, `table-layout: fixed`
    // hands the checkbox column an equal share of the table.
    expect(instance.table.querySelectorAll('colgroup > col')).toHaveLength(COLUMNS.length + 1);
    expect(grips().map((g) => g.getAttribute('data-egl-resize'))).toEqual(['id', 'name']);
  });

  it('builds each grip as a focusable separator with an accessible name', () => {
    table({ resize: true });
    const handle = grip('id');
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('tabindex')).toBe('0');
    expect(handle.getAttribute('aria-valuemin')).toBe('48');
    expect(handle.getAttribute('aria-label')).toBe('Resize id');
  });

  it('takes a label function for any UI that is not English', () => {
    table({ resize: { label: (column) => `Ridimensiona ${column.key}` } });
    expect(grip('name').getAttribute('aria-label')).toBe('Ridimensiona name');
  });

  it('names a column by its label rather than its key when it has one', () => {
    table({ columns: [{ key: 'id', label: 'Identificativo' }], resize: true });
    expect(grip('id').getAttribute('aria-label')).toBe('Resize Identificativo');
  });

  it('exempts a column that asked to be exempt', () => {
    table({ columns: [{ key: 'id' }, { key: 'name', resizable: false }], resize: true });
    expect(grips().map((g) => g.getAttribute('data-egl-resize'))).toEqual(['id']);
    // Still a `<col>`: it has no grip, not no width.
    expect(host.querySelectorAll('colgroup > col')).toHaveLength(2);
  });

  it('makes the header a containing block, and does not fight a sticky one', () => {
    table({ resize: true });
    expect(style(/** @type {Element} */ (host.querySelector('thead th')), 'position')).toBe(
      'relative',
    );
    document.body.innerHTML = '<div id="host2"></div>';
    host = /** @type {Element} */ (document.getElementById('host2'));
    table({ resize: true, sticky: true });
    // `sticky` is already a containing block; overwriting it with `relative`
    // would silently unstick the header — the one interaction between F98 and
    // F99, and the combination a caller reaches for first.
    expect(style(/** @type {Element} */ (host.querySelector('thead th')), 'position')).toBe(
      'sticky',
    );
  });

  it('gives the grip a pointer-sized target that will not scroll the page', () => {
    table({ resize: { handle: 12 } });
    const handle = grip('id');
    expect(style(handle, 'width')).toBe('12px');
    expect(style(handle, 'cursor')).toBe('col-resize');
    expect(style(handle, 'user-select')).toBe('none');
    // `touch-action: none` — without which the browser claims a touch drag as a
    // scroll before the first `pointermove` is delivered — is written too, but
    // jsdom's CSS parser drops the property entirely rather than storing it, so
    // there is nothing here to read back. Asserted in the Playwright suite,
    // against engines that implement it.
  });
});

describe('the layout is pinned lazily', () => {
  it('leaves the table alone until something actually changes', () => {
    const instance = table({ resize: true });
    // Enabling a capability must not re-lay-out a table nobody has touched:
    // under `table-layout: fixed` a column with no width takes an equal share
    // instead of being sized to its content.
    expect(style(instance.table, 'table-layout')).toBe('');
    expect(
      [...instance.table.querySelectorAll('col')].every(
        (col) => col.getAttribute('style') === null,
      ),
    ).toBe(true);
  });

  it('freezes every column on the first change, once', () => {
    const instance = table({ resize: true });
    press(grip('id'), 'ArrowRight');
    expect(style(instance.table, 'table-layout')).toBe('fixed');
    // Every column, not only the one that moved — the point of pinning.
    for (const col of instance.table.querySelectorAll('col')) {
      expect(style(col, 'width')).not.toBe('');
    }
  });

  it('pins the selection column too, so fixed layout cannot inflate it', () => {
    const instance = table({ resize: true, selection: true, rowKey: 'id' });
    const [selectionColumn] = instance.table.querySelectorAll('colgroup > col');
    expect(style(selectionColumn, 'width')).toBe('');
    press(grip('id'), 'ArrowRight');
    // A checkbox column with no width of its own takes an equal share of the
    // table the moment the data columns are pinned. jsdom measures every node at
    // zero, so what lands here is the 1 px floor rather than a real width — the
    // branch is what matters, and a real engine measures a checkbox.
    expect(style(selectionColumn, 'width')).toBe('1px');
  });

  it('keeps a declared width instead of measuring over it', () => {
    const instance = table({
      columns: [{ key: 'id', width: 90 }, { key: 'name' }],
      resize: true,
    });
    press(grip('name'), 'ArrowRight');
    expect(instance.getColumnWidths().id).toBe(90);
  });
});

describe('the keyboard path', () => {
  it('widens and narrows by one step per press', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: true });
    press(grip('id'), 'ArrowRight');
    expect(instance.getColumnWidths().id).toBe(116);
    press(grip('id'), 'ArrowLeft');
    expect(instance.getColumnWidths().id).toBe(100);
  });

  it('takes a coarse step with shift, the way every slider does', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: { step: 10 } });
    press(grip('id'), 'ArrowRight', true);
    expect(instance.getColumnWidths().id).toBe(140);
  });

  it('reports the width it reached', () => {
    table({ columns: [{ key: 'id', width: 100 }], resize: true });
    press(grip('id'), 'ArrowRight');
    expect(grip('id').getAttribute('aria-valuenow')).toBe('116');
  });

  it('claims the arrow, so the wrapper does not scroll under the resize', () => {
    table({ resize: true });
    expect(press(grip('id'), 'ArrowRight').defaultPrevented).toBe(true);
    // Anything else is left alone: Tab must still leave, and Enter must still
    // reach whatever the application put there.
    expect(press(grip('id'), 'Enter').defaultPrevented).toBe(false);
  });

  it('ignores a key pressed anywhere but a grip', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: true });
    press(/** @type {Element} */ (host.querySelector('thead th')), 'ArrowRight');
    expect(style(instance.table, 'table-layout')).toBe('');
  });
});

describe('the pointer path', () => {
  it('follows the gesture from where it started', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: true });
    drag(grip('id'), [200, 240, 260]);
    expect(instance.getColumnWidths().id).toBe(160);
  });

  it('measures from the origin, so crossing the floor and coming back is lossless', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: true });
    // An incremental delta would clamp at 48 on the way down and then add the
    // return trip to *that*, leaving the column narrower than it started.
    drag(grip('id'), [200, 100, 60, 200]);
    expect(instance.getColumnWidths().id).toBe(100);
  });

  it('does not sort the column it just resized', () => {
    const instance = table({
      columns: [{ key: 'id', width: 100, sortable: true }],
      resize: true,
      controls: { search: true },
    });
    drag(grip('id'), [200, 260]);
    const click = new window.Event('click', { bubbles: true, cancelable: true });
    grip('id').dispatchEvent(click);
    expect(instance.pipeline.view().sort).toEqual([]);
    // The header itself still sorts: the guard is about the grip, not the cell.
    /** @type {Element} */ (host.querySelector('th[data-sort-key]')).dispatchEvent(
      new window.Event('click', { bubbles: true, cancelable: true }),
    );
    expect(instance.pipeline.view().sort).toHaveLength(1);
  });

  it('ignores a move that no press began', () => {
    const instance = table({ resize: true });
    const stray = new window.Event('pointermove', { bubbles: true });
    Object.assign(stray, { clientX: 400 });
    grip('id').dispatchEvent(stray);
    expect(style(instance.table, 'table-layout')).toBe('');
  });

  it('ends on a cancelled pointer as it would on a release', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: true });
    const handle = grip('id');
    const down = new window.Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(down, { clientX: 200, pointerId: 1 });
    handle.dispatchEvent(down);
    const cancel = new window.Event('pointercancel', { bubbles: true });
    Object.assign(cancel, { pointerId: 1 });
    handle.dispatchEvent(cancel);
    const move = new window.Event('pointermove', { bubbles: true });
    Object.assign(move, { clientX: 900 });
    handle.dispatchEvent(move);
    // The cancelled gesture is over: a later move is somebody else's.
    expect(instance.getColumnWidths().id).toBe(100);
  });

  it('ignores a release that no press began', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: true });
    const up = new window.Event('pointerup', { bubbles: true });
    Object.assign(up, { pointerId: 1 });
    grip('id').dispatchEvent(up);
    // Nothing was pinned and nothing committed: the release belongs to whatever
    // else on the page was dragging.
    expect(style(instance.table, 'table-layout')).toBe('');
  });

  it('ignores a press anywhere but a grip', () => {
    const instance = table({ resize: true });
    const down = new window.Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(down, { clientX: 10, pointerId: 1 });
    /** @type {Element} */ (host.querySelector('thead th')).dispatchEvent(down);
    expect(style(instance.table, 'table-layout')).toBe('');
  });
});

describe('the floor', () => {
  it('refuses to go below the default minimum', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: true });
    drag(grip('id'), [200, 0]);
    expect(instance.getColumnWidths().id).toBe(48);
  });

  it('takes a table-wide floor and a per-column one', () => {
    const instance = table({
      columns: [
        { key: 'id', width: 200 },
        { key: 'name', width: 200, minWidth: 120 },
      ],
      resize: { min: 80 },
    });
    expect(grip('id').getAttribute('aria-valuemin')).toBe('80');
    expect(grip('name').getAttribute('aria-valuemin')).toBe('120');
    drag(grip('id'), [500, 0]);
    drag(grip('name'), [500, 0]);
    expect(instance.getColumnWidths()).toEqual({ id: 80, name: 120 });
  });
});

describe('reading and restoring', () => {
  it('round-trips a saved layout', () => {
    const first = table({
      columns: [
        { key: 'id', width: 90 },
        { key: 'name', width: 150 },
      ],
      resize: true,
    });
    press(grip('id'), 'ArrowRight');
    const saved = first.getColumnWidths();
    expect(saved).toEqual({ id: 106, name: 150 });

    first.destroy();
    document.body.innerHTML = '<div id="host3"></div>';
    host = /** @type {Element} */ (document.getElementById('host3'));
    const second = table({ resize: true });
    second.setColumnWidths(saved);
    expect(second.getColumnWidths()).toEqual(saved);
  });

  it('is partial: a key left out keeps what it had', () => {
    const instance = table({
      columns: [
        { key: 'id', width: 90 },
        { key: 'name', width: 150 },
      ],
      resize: true,
    });
    instance.setColumnWidths({ id: 200 });
    expect(instance.getColumnWidths()).toEqual({ id: 200, name: 150 });
  });

  it('clamps a restored width to the floor rather than trusting the store', () => {
    const instance = table({ resize: true });
    instance.setColumnWidths({ id: 4 });
    expect(instance.getColumnWidths().id).toBe(48);
  });

  it('refuses a layout naming a column that does not exist', () => {
    const instance = table({ resize: true });
    expect(() => instance.setColumnWidths({ nope: 100 })).toThrow(
      /setColumnWidths\(\) names no resizable column 'nope'/,
    );
  });

  it('still sets an exempt column, because the exemption is from the user', () => {
    const instance = table({
      columns: [{ key: 'id' }, { key: 'name', width: 150, resizable: false }],
      resize: true,
    });
    // `resizable: false` withholds the *affordance*, not the width: the caller
    // exempted their user, not themselves, and a saved layout that could not
    // restore one of its own columns would be a strange thing to hand back.
    instance.setColumnWidths({ name: 300 });
    expect(instance.getColumnWidths().name).toBe(300);
  });

  it('refuses a malformed width, and writes nothing at all when it does', () => {
    const instance = table({
      columns: [
        { key: 'id', width: 90 },
        { key: 'name', width: 150 },
      ],
      resize: true,
    });
    expect(() => instance.setColumnWidths({ id: 200, name: -1 })).toThrow(
      /width for 'name' must be a positive number of pixels/,
    );
    // Validated in full before anything is written: one bad entry in a saved
    // layout must not leave the table half-applied.
    expect(instance.getColumnWidths()).toEqual({ id: 90, name: 150 });
    expect(() => instance.setColumnWidths(null)).toThrow(TypeError);
  });

  it('refuses to write after destroy', () => {
    const instance = table({ resize: true });
    instance.destroy();
    expect(() => instance.setColumnWidths({ id: 100 })).toThrow(
      /setColumnWidths\(\) was called after destroy\(\)/,
    );
  });
});

describe('what it never does', () => {
  it('re-renders no row', () => {
    const instance = table({ resize: true });
    const before = [...instance.table.querySelectorAll('tbody tr')];
    const cells = [...instance.table.querySelectorAll('tbody td')];
    drag(grip('id'), [200, 400]);
    instance.setColumnWidths({ name: 300 });
    press(grip('id'), 'ArrowLeft');
    // Node identity, not counts: a re-render would produce equal-looking rows.
    expect([...instance.table.querySelectorAll('tbody tr')]).toEqual(before);
    expect([...instance.table.querySelectorAll('tbody td')]).toEqual(cells);
  });

  it('detaches every listener on destroy', () => {
    const instance = table({ columns: [{ key: 'id', width: 100 }], resize: true });
    const handle = grip('id');
    instance.destroy();
    press(handle, 'ArrowRight');
    // The node is detached and the controller aborted; nothing answers.
    expect(handle.getAttribute('aria-valuenow')).toBe(null);
  });
});

describe('the commit callback', () => {
  it('fires once per completed gesture, with every width and the key that moved', () => {
    /** @type {unknown[]} */
    const seen = [];
    table({
      columns: [
        { key: 'id', width: 100 },
        { key: 'name', width: 150 },
      ],
      resize: { onResize: (widths, key) => seen.push([key, widths]) },
    });
    drag(grip('id'), [200, 250, 300]);
    // One call for the whole drag, not one per move: this exists so a caller can
    // persist a layout, and persisting on every frame is a defect.
    expect(seen).toEqual([['id', { id: 200, name: 150 }]]);
    press(grip('name'), 'ArrowRight');
    expect(seen).toHaveLength(2);
    expect(seen.at(-1)).toEqual(['name', { id: 200, name: 166 }]);
  });

  it('does not fire for a programmatic restore', () => {
    /** @type {unknown[]} */
    const seen = [];
    const instance = table({ resize: { onResize: () => seen.push(1) } });
    // The caller already knows: they just supplied the widths.
    instance.setColumnWidths({ id: 120 });
    expect(seen).toHaveLength(0);
  });
});

describe('the option contract', () => {
  it('rejects an unknown key in the resize bag', () => {
    expect(() => table({ resize: { minimum: 10 } })).toThrow(
      /bsTable\.resize: unknown option 'minimum'/,
    );
  });

  it('rejects an unknown column property', () => {
    expect(() => table({ columns: [{ key: 'id', widht: 10 }], resize: true })).toThrow(
      /unknown options\.columns\[0\] property 'widht'/,
    );
  });

  it('refuses a non-positive measurement', () => {
    for (const bag of [{ min: 0 }, { step: -1 }, { handle: Number.NaN }]) {
      expect(() => table({ resize: bag })).toThrow(/must be a positive number of pixels/);
    }
    expect(() => table({ columns: [{ key: 'id', width: 0 }], resize: true })).toThrow(
      /columns\[0\]\.width must be a positive number of pixels/,
    );
    expect(() => table({ columns: [{ key: 'id', minWidth: '10' }], resize: true })).toThrow(
      /columns\[0\]\.minWidth must be a positive number of pixels/,
    );
  });

  it('refuses a callback that is not one', () => {
    expect(() => table({ resize: { onResize: 'yes' } })).toThrow(
      /options\.resize\.onResize must be a function/,
    );
    expect(() => table({ resize: { label: 'yes' } })).toThrow(
      /options\.resize\.label must be a function/,
    );
  });

  it('refuses a resize bag that is not an object', () => {
    expect(() => table({ resize: 'yes' })).toThrow(TypeError);
  });

  it('treats false as off', () => {
    const instance = table({ resize: false });
    expect(host.querySelector('colgroup')).toBe(null);
    expect(instance.getColumnWidths).toBeUndefined();
  });
});
