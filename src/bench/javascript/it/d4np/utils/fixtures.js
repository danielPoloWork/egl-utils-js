/**
 * Deterministic benchmark inputs (roadmap 7.1, NFR-04).
 *
 * Every fixture is built **once, at module load**, from a seeded generator —
 * never inside a timed region and never from `Math.random`. Two reasons:
 * allocation would be measured instead of the function under test, and the
 * nightly regression gate (roadmap 7.2) can only compare runs that were given
 * identical input.
 *
 * @module bench/fixtures
 */

/**
 * A tiny deterministic PRNG (mulberry32). Seeded, so `pnpm bench` on two
 * machines or two days apart measures the same work.
 *
 * @param {number} seed
 * @returns {() => number} Values in [0, 1).
 */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seededRandom(0x5eed);

/** @param {number} n @returns {number} */
const int = (n) => Math.floor(random() * n);

/**
 * A nested plain-object graph that BOTH `structuredClone` and lodash's
 * `cloneDeep` fully support — no functions, symbols, or cycles. Comparing on
 * inputs only one side can handle would not be a comparison.
 */
export const NESTED_OBJECT = Object.freeze({
  id: 'root',
  meta: { created: '2026-01-01', tags: ['a', 'b', 'c'], nested: { deep: { deeper: 42 } } },
  items: Array.from({ length: 40 }, (_unused, index) => ({
    index,
    label: `item-${index}`,
    values: [index, index * 2, index * 3],
    flags: { active: index % 2 === 0, weight: index / 40 },
  })),
});

/** A second graph that overlaps NESTED_OBJECT, for merge benchmarks. */
export const MERGE_SOURCE = Object.freeze({
  meta: { updated: '2026-06-01', nested: { deep: { extra: true } } },
  items: Array.from({ length: 20 }, (_unused, index) => ({ index, label: `patched-${index}` })),
  added: { a: 1, b: { c: 2 } },
});

/**
 * An ARRAY-FREE nested pair. `deepMerge` replaces arrays while lodash merges
 * them element-wise, so any array in the input makes the two do a different
 * amount of work and the ratio stops being a performance comparison. With no
 * arrays present that divergence cannot arise, which makes this the honest
 * like-for-like merge measurement (ADR-0013).
 */
export const ARRAY_FREE_TARGET = Object.freeze({
  a: { b: { c: 1, d: 2 }, e: 3 },
  f: { g: { h: { i: 4 } } },
  ...Object.fromEntries(
    Array.from({ length: 20 }, (_unused, index) => [`branch${index}`, { value: index, on: true }]),
  ),
});

export const ARRAY_FREE_SOURCE = Object.freeze({
  a: { b: { c: 99 }, j: 5 },
  f: { g: { h: { k: 6 } } },
  ...Object.fromEntries(
    Array.from({ length: 20 }, (_unused, index) => [`branch${index}`, { value: index * 2 }]),
  ),
});

/** A wide flat object for pick/omit. */
export const WIDE_OBJECT = Object.freeze(
  Object.fromEntries(Array.from({ length: 50 }, (_unused, index) => [`key${index}`, index])),
);

/** Ten keys out of WIDE_OBJECT's fifty. */
export const PICK_KEYS = Object.freeze(
  Array.from({ length: 10 }, (_unused, index) => `key${index * 5}`),
);

/** 1000 records with a low-cardinality group key. */
export const RECORDS = Object.freeze(
  Array.from({ length: 1000 }, (_unused, index) => ({
    index,
    group: `g${int(12)}`,
    score: int(100),
  })),
);

/** 1000 primitives, roughly half duplicates. */
export const DUPLICATED_NUMBERS = Object.freeze(Array.from({ length: 1000 }, () => int(500)));

/** Email inputs: a realistic mix of valid and invalid, so neither branch dominates. */
export const EMAILS = Object.freeze([
  'user@example.com',
  'first.last@sub.domain.co.uk',
  "quoted!#$%&'*+-/=?^_`{|}~@example.org",
  'no-at-sign.example.com',
  'double@@example.com',
  'trailing.dot.@example.com',
  'a@b.co',
  `${'x'.repeat(70)}@example.com`, // over the 64-char local cap
  'unicode-café@example.com',
  '@example.com',
]);

/** Duration strings that all parse, so the benchmark measures the happy path. */
export const DURATIONS = Object.freeze(['2h', '30m', '5s', '1h30m', '1h30m45s', '90m', '123s']);

/** A query-parameter object with arrays and skipped values. */
export const QUERY_PARAMS = Object.freeze({
  q: 'search terms',
  tag: ['alpha', 'beta', 'gamma'],
  page: 2,
  perPage: 50,
  sort: 'created_at',
  skipMe: null,
  alsoSkipped: undefined,
  active: true,
});

/**
 * Task arrays for the concurrency benchmarks. Tasks resolve immediately: the
 * measurement target is orchestration overhead, and any real delay would make
 * both implementations look identical (see ADR-0013).
 *
 * @param {number} count
 * @returns {Array<() => Promise<number>>}
 */
export function immediateTasks(count) {
  return Array.from({ length: count }, (_unused, index) => async () => index);
}

/** Statuses and regions for {@link TABLE_ROWS}, kept small so filters actually match. */
const STATUSES = ['active', 'pending', 'archived', 'blocked'];
const REGIONS = ['north', 'south', 'east', 'west'];

/**
 * The pinned 10,000-row table fixture for the NFR-13 derivation budget
 * (spec 03; roadmap 13.1).
 *
 * Shaped like a real table rather than like a benchmark: mixed types, a text
 * column worth collating, a numeric column worth comparing, and ~8% missing
 * values so the empties-last branch is exercised on every sort. The row count
 * is the number the budget names, so the bench measures the requirement rather
 * than a convenient approximation of it.
 */
export const TABLE_ROWS = Object.freeze(
  Array.from({ length: 10_000 }, (_unused, index) => ({
    id: index + 1,
    name: `host-${int(9000).toString().padStart(4, '0')}-${index}`,
    status: STATUSES[int(STATUSES.length)],
    region: REGIONS[int(REGIONS.length)],
    score: int(100) < 8 ? null : int(1000),
    seen: `2026-${String(1 + int(12)).padStart(2, '0')}-${String(1 + int(28)).padStart(2, '0')}`,
  })),
);
