import { bench, describe } from 'vitest';
import { BENCH_OPTIONS } from './options.js';
import { tablePipeline } from '../../../../../main/javascript/it/d4np/utils/table.js';
import { TABLE_ROWS } from './fixtures.js';

// The NFR-13 derivation budget (roadmap 13.1, spec 03 §3): one `view()` over
// 10,000 rows with 3 active filters and a 2-key sort must complete in <= 50 ms.
//
// This is an **absolute budget on our own fixture, not a parity claim** — there
// is no third-party pipeline whose filtering, collation, and empties-last
// ordering mean the same thing as ours, so a ratio against one would compare
// two different jobs (ADR-0013). It is read as a millisecond figure instead:
// mean time per iteration IS the budget, directly comparable to the 50 ms
// clause, and the gate prints it that way on every run.
//
// Names begin with `egl ` so the collector recognises these groups as ours-only
// (roadmap 13.3, ADR-0036); the recorded figure is then held to the absolute
// collapse floor, which catches a derivation regression of the O(n^2) kind
// without pretending a shared runner's milliseconds are reproducible.
//
// The memoization half of NFR-13 is deliberately NOT benchmarked. It is
// asserted by object identity in table-pipeline.property.test.js, where it
// cannot flake; timing a cache hit would measure the harness.

/** @returns {ReturnType<typeof tablePipeline>} A pipeline already under load. */
function loadedPipeline() {
  const table = tablePipeline({
    source: TABLE_ROWS,
    pageSize: 50,
    columns: [
      { key: 'name', searchable: true },
      { key: 'status' },
      { key: 'region' },
      { key: 'score', type: 'number' },
      { key: 'seen', type: 'date' },
    ],
  });
  table.batch(() => {
    table.setFilter('status', '!=archived'); // not-equals: every row is tested
    table.setFilter('score', '>100'); // numeric comparison + the null rows
    table.setFilter('name', 'host'); // substring over a long-ish string
    table.setSort([
      { key: 'region', direction: 'asc' }, // collated text
      { key: 'score', direction: 'desc' }, // numeric, with empties last
    ]);
  });
  return table;
}

describe('tablePipeline.view() — NFR-13 budget: 10k rows, 3 filters, 2-key sort <= 50 ms', () => {
  const table = loadedPipeline();
  let page = 1;

  bench(
    'egl view() full derivation (filter -> search -> sort -> paginate)',
    () => {
      // Any command invalidates the memo, so this times a real derivation and
      // not a cache hit. Paging is the cheapest possible invalidation: it moves
      // one integer, leaving the measured work to the pipeline itself.
      page = page === 1 ? 2 : 1;
      table.setPage(page);
      table.view();
    },
    BENCH_OPTIONS,
  );
});

describe('tablePipeline.view() — the stages, so a regression can be located', () => {
  // Same fixture, one stage at a time. When the composed figure above moves,
  // these say which stage moved — without them a regression is a bisect.
  const filterOnly = tablePipeline({ source: TABLE_ROWS });
  filterOnly.setFilter('status', '!=archived');

  const sortOnly = tablePipeline({
    source: TABLE_ROWS,
    columns: [{ key: 'region' }, { key: 'score', type: 'number' }],
  });
  sortOnly.setSort([
    { key: 'region', direction: 'asc' },
    { key: 'score', direction: 'desc' },
  ]);

  const searchOnly = tablePipeline({ source: TABLE_ROWS });
  searchOnly.setSearch('host');

  let flip = 1;

  bench(
    'egl view() with one filter over 10k rows',
    () => {
      flip = flip === 1 ? 2 : 1;
      filterOnly.setPage(flip);
      filterOnly.view();
    },
    BENCH_OPTIONS,
  );

  bench(
    'egl view() with a two-key sort over 10k rows',
    () => {
      flip = flip === 1 ? 2 : 1;
      sortOnly.setPage(flip);
      sortOnly.view();
    },
    BENCH_OPTIONS,
  );

  bench(
    'egl view() with a global search over 10k rows',
    () => {
      flip = flip === 1 ? 2 : 1;
      searchOnly.setPage(flip);
      searchOnly.view();
    },
    BENCH_OPTIONS,
  );
});
