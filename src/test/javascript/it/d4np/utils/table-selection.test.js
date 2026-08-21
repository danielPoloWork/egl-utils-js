// @vitest-environment node
// Tests (roadmap 19.3, spec 06 §2 item F94, §6) for the keyed selection model.
//
// The environment is pinned to node rather than inherited: "a selection needs no
// DOM" is half of what makes it usable on a server, and a future switch of the
// project default must not quietly turn this suite into a jsdom run that proves
// the opposite (the table-pipeline.test.js precedent).
import { describe, expect, it, vi } from 'vitest';
import { tableSelection } from '../../../../../main/javascript/it/d4np/utils/table.js';

/** @param {number} n */
const rows = (n) => Array.from({ length: n }, (_unused, index) => ({ id: index + 1 }));

const THREE = rows(3);

describe('keys', () => {
  it('reads a key by property name', () => {
    const picked = tableSelection({ rowKey: 'id' });
    picked.select(THREE[0]);
    expect(picked.getSelection()).toEqual(['1']);
  });

  it('reads a key through an extractor, which sees the index', () => {
    const picked = tableSelection({ rowKey: (row, index) => `${row.id}-${index}` });
    picked.select(THREE[1], 1);
    expect(picked.getSelection()).toEqual(['2-1']);
  });

  it('compares keys as strings, so 1 and "1" are one row', () => {
    const picked = tableSelection({ rowKey: 'id' });
    picked.select({ id: 1 });
    picked.select({ id: '1' });
    expect(picked.getSelection()).toEqual(['1']);
    expect(picked.hasKey(1)).toBe(true);
    expect(picked.hasKey('1')).toBe(true);
  });

  it('exposes the key rule, so a renderer cannot invent a second one', () => {
    const picked = tableSelection({ rowKey: 'id' });
    expect(picked.keyOf(THREE[2])).toBe('3');
  });

  it('refuses a row with no key rather than selecting an anonymous one', () => {
    const picked = tableSelection({ rowKey: 'id' });
    expect(() => picked.select({ name: 'ada' })).toThrow(/produced no key/);
    expect(() => picked.select({ id: {} })).toThrow(/produced a object/);
    expect(() => picked.select('not a row')).toThrow(/must be an object/);
  });
});

describe('multiple mode', () => {
  it('accumulates, and a repeat select is not a change', () => {
    const picked = tableSelection({ rowKey: 'id' });
    const changes = vi.fn();
    picked.on('change', changes);

    picked.select(THREE[0]);
    picked.select(THREE[0]);
    picked.select(THREE[1]);

    expect(picked.getSelection()).toEqual(['1', '2']);
    // Two changes, not three: a no-op stays silent, or every click on an already
    // ticked checkbox would redraw a table for nothing.
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('reports what changed, not just that something did', () => {
    const picked = tableSelection({ rowKey: 'id', initial: [1, 2] });
    const changes = vi.fn();
    picked.on('change', changes);

    picked.deselect(THREE[0]);

    expect(changes).toHaveBeenCalledWith({ keys: ['2'], added: [], removed: ['1'] });
  });

  it('toggles, returning the state after the toggle', () => {
    const picked = tableSelection({ rowKey: 'id' });
    expect(picked.toggle(THREE[0])).toBe(true);
    expect(picked.toggle(THREE[0])).toBe(false);
    expect(picked.count()).toBe(0);
  });

  it('selects and deselects exactly the rows it is handed', () => {
    const picked = tableSelection({ rowKey: 'id' });
    picked.selectAll(THREE);
    expect(picked.getSelection()).toEqual(['1', '2', '3']);

    picked.deselectAll(THREE.slice(0, 2));
    expect(picked.getSelection()).toEqual(['3']);
  });

  it('clears everything in one change', () => {
    const picked = tableSelection({ rowKey: 'id', initial: [1, 2, 3] });
    const changes = vi.fn();
    picked.on('change', changes);
    picked.clear();
    expect(picked.count()).toBe(0);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(changes.mock.calls[0][0].removed).toEqual(['1', '2', '3']);
  });

  it('hands out a copy, never the live set', () => {
    const picked = tableSelection({ rowKey: 'id', initial: [1] });
    const first = picked.getSelection();
    first.push('999');
    expect(picked.getSelection()).toEqual(['1']);
  });
});

describe('single mode', () => {
  it('replaces rather than accumulating, in one transaction', () => {
    const picked = tableSelection({ rowKey: 'id', mode: 'single' });
    const changes = vi.fn();
    picked.on('change', changes);

    picked.select(THREE[0]);
    picked.select(THREE[1]);

    expect(picked.getSelection()).toEqual(['2']);
    // Two changes, and the second carries both halves — a listener never sees the
    // empty moment between the removal and the addition.
    expect(changes).toHaveBeenCalledTimes(2);
    expect(changes.mock.calls[1][0]).toEqual({ keys: ['2'], added: ['2'], removed: ['1'] });
  });

  it('refuses selectAll rather than picking one row for you', () => {
    const picked = tableSelection({ rowKey: 'id', mode: 'single' });
    expect(() => picked.selectAll(THREE)).toThrow(/meaningless in 'single' mode/);
  });

  it('refuses an initial selection of more than one key', () => {
    expect(() => tableSelection({ rowKey: 'id', mode: 'single', initial: [1, 2] })).toThrow(
      /holds 2 distinct keys in 'single' mode/,
    );
    // One key, repeated, is one key.
    expect(tableSelection({ rowKey: 'id', mode: 'single', initial: [1, 1] }).count()).toBe(1);
  });

  it('exposes its mode, so a renderer draws radios without being told twice', () => {
    expect(tableSelection({ rowKey: 'id', mode: 'single' }).mode).toBe('single');
    expect(tableSelection({ rowKey: 'id' }).mode).toBe('multiple');
  });
});

describe('the select-all-under-a-filter question (F94)', () => {
  it('counts what is selected off the rows passed — the number a dialog owes the user', () => {
    const all = rows(10);
    const picked = tableSelection({ rowKey: 'id' });
    picked.selectAll(all);

    // The user then narrows the filter to two rows and clicks "delete selected".
    const filtered = all.slice(0, 2);
    expect(picked.stats(filtered)).toEqual({
      onPage: 2,
      offPage: 8,
      total: 10,
      all: true,
      some: false,
      none: false,
    });
  });

  it('describes the page for the header control, not the whole selection', () => {
    const page = rows(4);
    const picked = tableSelection({ rowKey: 'id' });

    expect(picked.stats(page)).toMatchObject({ all: false, some: false, none: true });
    picked.select(page[0]);
    expect(picked.stats(page)).toMatchObject({ all: false, some: true, none: false });
    picked.selectAll(page);
    expect(picked.stats(page)).toMatchObject({ all: true, some: false, none: false });
  });

  it('calls an empty page neither all nor some', () => {
    // `all: true` for zero rows would make a header checkbox tick itself on an
    // empty table, which reads as "everything is selected".
    const picked = tableSelection({ rowKey: 'id', initial: [7] });
    expect(picked.stats([])).toEqual({
      onPage: 0,
      offPage: 1,
      total: 1,
      all: false,
      some: false,
      none: true,
    });
  });
});

describe('rows leaving the source', () => {
  it('keeps a selected key that is no longer anywhere in view', () => {
    // The contract, asserted: keeping is what makes "select forty, filter, act"
    // act on forty. Pruning would make it act on eleven, silently.
    const picked = tableSelection({ rowKey: 'id' });
    picked.selectAll(rows(5));
    expect(picked.stats([]).total).toBe(5);
    expect(picked.count()).toBe(5);
  });

  it('prunes only when asked, by name', () => {
    const picked = tableSelection({ rowKey: 'id' });
    picked.selectAll(rows(5));

    picked.prune(rows(2));

    expect(picked.getSelection()).toEqual(['1', '2']);
  });

  it('does not emit when a prune removed nothing', () => {
    const picked = tableSelection({ rowKey: 'id', initial: [1, 2] });
    const changes = vi.fn();
    picked.on('change', changes);
    picked.prune(rows(3));
    expect(changes).not.toHaveBeenCalled();
  });
});

describe('contract', () => {
  it('requires a rowKey, because index and identity are what F94 forbids', () => {
    expect(() => tableSelection({})).toThrow(/rowKey must be a property name or a function/);
    expect(() => tableSelection({ rowKey: '' })).toThrow(/non-empty property name/);
    expect(() => tableSelection()).toThrow(/options must be an object with a rowKey/);
  });

  it('rejects a malformed mode, initial, or unknown key', () => {
    expect(() => tableSelection({ rowKey: 'id', mode: 'many' })).toThrow(
      /options.mode must be 'single' or 'multiple'/,
    );
    expect(() => tableSelection({ rowKey: 'id', initial: 'x' })).toThrow(
      /options.initial must be an array/,
    );
    expect(() => tableSelection({ rowKey: 'id', initial: [null] })).toThrow(/produced no key/);
    expect(() => tableSelection({ rowKey: 'id', keyRow: 'id' })).toThrow(/unknown option 'keyRow'/);
  });

  it('requires an array where it takes rows', () => {
    const picked = tableSelection({ rowKey: 'id' });
    for (const method of ['selectAll', 'deselectAll', 'prune', 'stats']) {
      expect(() => picked[method]('nope')).toThrow(/requires an array of rows/);
    }
  });

  it('throws from every command after destroy, naming the command', () => {
    const picked = tableSelection({ rowKey: 'id', initial: [1] });
    picked.destroy();
    expect(picked.count()).toBe(0);
    expect(() => picked.select(THREE[0])).toThrow(/select\(\) was called after destroy/);
    expect(() => picked.clear()).toThrow(/clear\(\) was called after destroy/);
    expect(() => picked.selectAll(THREE)).toThrow(/selectAll\(\) was called after destroy/);
    expect(() => picked.prune(THREE)).toThrow(/prune\(\) was called after destroy/);
  });

  it('is idempotent on destroy, and announces nothing on the way out', () => {
    const picked = tableSelection({ rowKey: 'id', initial: [1] });
    const changes = vi.fn();
    picked.on('change', changes);
    picked.destroy();
    picked.destroy();
    expect(changes).not.toHaveBeenCalled();
  });

  it('unsubscribes through the returned function (F6)', () => {
    const picked = tableSelection({ rowKey: 'id' });
    const changes = vi.fn();
    const off = picked.on('change', changes);
    picked.select(THREE[0]);
    off();
    picked.select(THREE[1]);
    expect(changes).toHaveBeenCalledTimes(1);
  });
});

describe('NFR-27 — the shape of the cost', () => {
  it('stores keys, not rows: memory is O(selected), never O(source)', () => {
    // The claim is structural, so it is asserted structurally rather than timed:
    // a selection over 10,000 rows with one selected holds exactly one key, and
    // nothing it holds references a row object.
    const many = rows(10_000);
    const picked = tableSelection({ rowKey: 'id' });
    picked.select(many[5000], 5000);
    expect(picked.count()).toBe(1);
    expect(picked.getSelection()).toEqual(['5001']);
    // Every row can be mutated or dropped without the selection noticing, which
    // is the property that makes a server round-trip survivable.
    many.length = 0;
    expect(picked.hasKey('5001')).toBe(true);
  });

  it('selects 10,000 rows and reads them back', () => {
    // The millisecond budget is the bench's job (table-selection.bench.js); this
    // asserts the operations are correct at that size, which the bench does not.
    const many = rows(10_000);
    const picked = tableSelection({ rowKey: 'id' });
    picked.selectAll(many);
    expect(picked.count()).toBe(10_000);
    expect(picked.getSelection()).toHaveLength(10_000);
    expect(picked.stats(many.slice(0, 50))).toMatchObject({ onPage: 50, offPage: 9950 });
  });
});
