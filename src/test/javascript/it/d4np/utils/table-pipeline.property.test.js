// Property suites (roadmap 13.1, spec 03 §6) for tablePipeline. These are the
// invariants the design exists to guarantee — that filtering and sorting
// compose in either order, that a transaction is one event, that the memo is
// referential, that the page is always real, and that the source is untouched.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { tablePipeline } from '../../../../../main/javascript/it/d4np/utils/table.js';

/** Rows with a few shapes a real table sees: text, numbers, gaps. */
const row = fc.record({
  name: fc.oneof(fc.string({ maxLength: 8 }), fc.constant(''), fc.constant(null)),
  size: fc.oneof(fc.integer({ min: -50, max: 50 }), fc.constant(null)),
  tag: fc.constantFrom('alpha', 'beta', 'gamma', ''),
});

const rows = fc.array(row, { maxLength: 40 });

/** Filter expressions across the whole F33 grammar, including half-typed ones. */
const expression = fc.oneof(
  fc.string({ maxLength: 6 }),
  fc.constantFrom('alpha', '^a', 'a$', '!=beta', '>0', '<=10', '=empty', '!null', '!blank', '>'),
);

describe('tablePipeline — filtering and sorting compose', () => {
  it('reaches the same view whichever order the commands arrive in', () => {
    fc.assert(
      fc.property(rows, expression, fc.constantFrom('asc', 'desc'), (source, expr, direction) => {
        const filterFirst = tablePipeline({ source });
        filterFirst.setFilter('tag', expr);
        filterFirst.setSort([{ key: 'name', direction }]);

        const sortFirst = tablePipeline({ source });
        sortFirst.setSort([{ key: 'name', direction }]);
        sortFirst.setFilter('tag', expr);

        expect(sortFirst.view().rows).toEqual(filterFirst.view().rows);
        expect(sortFirst.view().totalFiltered).toBe(filterFirst.view().totalFiltered);
      }),
    );
  });

  it('never lets one stage discard the other', () => {
    fc.assert(
      fc.property(rows, expression, (source, expr) => {
        const table = tablePipeline({ source });
        table.setFilter('tag', expr);
        const filteredCount = table.view().totalFiltered;

        table.setSort([{ key: 'size', direction: 'desc' }]);
        const view = table.view();

        expect(view.totalFiltered).toBe(filteredCount);
        expect(view.sort).toEqual([{ key: 'size', direction: 'desc' }]);
        expect(view.filters.tag).toBe(expr === '' ? undefined : expr);
      }),
    );
  });
});

describe('tablePipeline — the derived rows are a subsequence of a sorted permutation', () => {
  it('only ever selects source rows, never invents or duplicates one', () => {
    fc.assert(
      fc.property(rows, expression, fc.integer({ min: 1, max: 8 }), (source, expr, pageSize) => {
        const table = tablePipeline({ source, pageSize });
        table.setFilter('tag', expr);
        table.setSort([{ key: 'name', direction: 'asc' }]);
        const view = table.view();

        expect(view.rows.length).toBeLessThanOrEqual(pageSize);
        expect(view.total).toBe(source.length);
        expect(view.totalFiltered).toBeLessThanOrEqual(source.length);

        const pool = source.slice();
        for (const derived of view.rows) {
          const at = pool.indexOf(derived);
          expect(at).toBeGreaterThanOrEqual(0); // identity, not equality
          pool.splice(at, 1); // consumed once, so no row appears twice
        }
      }),
    );
  });

  it('leaves the source array untouched', () => {
    fc.assert(
      fc.property(rows, expression, (source, expr) => {
        const snapshot = source.slice();
        const table = tablePipeline({ source });
        table.setFilter('name', expr);
        table.setSearch('a');
        table.setSort([{ key: 'size', direction: 'desc' }]);
        table.view();
        expect(source).toEqual(snapshot);
      }),
    );
  });
});

describe('tablePipeline — the page is always real', () => {
  it('keeps page within [1, pageCount] for any requested page', () => {
    fc.assert(
      fc.property(
        rows,
        fc.integer({ min: -20, max: 200 }),
        fc.integer({ min: 1, max: 10 }),
        (source, page, pageSize) => {
          const table = tablePipeline({ source, pageSize });
          table.setPage(page);
          const view = table.view();

          expect(view.pageCount).toBeGreaterThanOrEqual(1);
          expect(view.page).toBeGreaterThanOrEqual(1);
          expect(view.page).toBeLessThanOrEqual(view.pageCount);
          expect(view.rows.length).toBeLessThanOrEqual(pageSize);
        },
      ),
    );
  });
});

describe('tablePipeline — transactions', () => {
  it('emits exactly one change per command, and one per batch', () => {
    fc.assert(
      fc.property(rows, fc.array(expression, { maxLength: 6 }), (source, expressions) => {
        const table = tablePipeline({ source, pageSize: 5 });
        let events = 0;
        table.on('change', () => {
          events += 1;
        });

        for (const expr of expressions) table.setFilter('tag', expr);
        expect(events).toBe(expressions.length);

        events = 0;
        table.batch(() => {
          for (const expr of expressions) table.setFilter('name', expr);
          table.setPage(2);
        });
        expect(events).toBe(1);
      }),
    );
  });

  it('hands subscribers the identical object view() returns', () => {
    fc.assert(
      fc.property(rows, expression, (source, expr) => {
        const table = tablePipeline({ source });
        let received = null;
        table.on('change', (view) => {
          received = view;
        });
        table.setFilter('tag', expr);
        expect(received).toBe(table.view());
      }),
    );
  });
});

describe('tablePipeline — the read model is memoized', () => {
  it('is referentially stable between commands and fresh after each one', () => {
    fc.assert(
      fc.property(rows, fc.array(expression, { minLength: 1, maxLength: 5 }), (source, exprs) => {
        const table = tablePipeline({ source, pageSize: 4 });
        let previous = table.view();
        expect(table.view()).toBe(previous);

        for (const expr of exprs) {
          table.setFilter('tag', expr);
          const current = table.view();
          expect(current).not.toBe(previous);
          expect(table.view()).toBe(current);
          previous = current;
        }
      }),
    );
  });
});

describe('tablePipeline — totality of the filter surface', () => {
  it('accepts any string expression on any column without throwing', () => {
    fc.assert(
      fc.property(rows, fc.string(), fc.string(), (source, expr, search) => {
        const table = tablePipeline({ source });
        expect(() => {
          table.setFilter('name', expr);
          table.setSearch(search);
          table.view();
        }).not.toThrow();
      }),
    );
  });
});
