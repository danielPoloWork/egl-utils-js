import { bench, describe } from 'vitest';
import { BENCH_OPTIONS } from './options.js';
import { tableSelection } from '../../../../../main/javascript/it/d4np/utils/table.js';
import { TABLE_ROWS } from './fixtures.js';

// The NFR-27 selection budgets (roadmap 19.3, spec 06 §3): selecting all on a
// 10,000-row source, and reading `getSelection()` with 10,000 keys held, are each
// <= 10 ms on the benchmark machine.
//
// Absolute budgets on our own fixture, not parity claims — there is no
// third-party selection whose keying rules mean the same thing as ours, so a
// ratio against one would compare two different jobs (ADR-0013). Read as
// millisecond figures instead, directly comparable to the 10 ms clause, and
// recorded against the collapse floor the way the NFR-13 derivation bench is
// (ADR-0036). Names begin with `egl ` so the collector recognises the groups as
// ours-only.
//
// The third clause of NFR-27 — selection memory is O(selected), never O(source)
// — is deliberately NOT benchmarked. It is a structural property of holding a
// `Set` of keys rather than a flag per row, and it is asserted as such in
// table-selection.test.js: one key held over a 10,000-row source, and the rows
// dropped afterwards without the selection noticing. Timing an allocation would
// measure the collector, not the design.

/** The 10,000 rows the budget names, keyed by the `id` the fixture already has. */
const ROWS = TABLE_ROWS;

describe('tableSelection.selectAll() — NFR-27 budget: 10k rows <= 10 ms', () => {
  const picked = tableSelection({ rowKey: 'id' });

  bench(
    'egl selectAll(10k rows)',
    () => {
      // Cleared each iteration so every run does the full 10,000 key
      // computations and insertions rather than 10,000 no-ops on the second
      // pass — the same reason the NFR-13 bench flips the page.
      picked.clear();
      picked.selectAll(ROWS);
    },
    BENCH_OPTIONS,
  );
});

describe('tableSelection.getSelection() — NFR-27 budget: 10k keys <= 10 ms', () => {
  const picked = tableSelection({ rowKey: 'id' });
  picked.selectAll(ROWS);

  bench(
    'egl getSelection() with 10k selected',
    () => {
      // A fresh array every call is the contract (the live Set is never handed
      // out), so this measures exactly what a caller pays to read a full
      // selection — the figure the budget is about.
      picked.getSelection();
    },
    BENCH_OPTIONS,
  );
});
