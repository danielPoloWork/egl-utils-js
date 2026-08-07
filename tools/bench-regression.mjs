// The benchmark gate (roadmap 7.2 and 13.3; design in ADR-0014, collector
// contract in ADR-0036).
//
// TWO GATES, BECAUSE THERE ARE TWO KINDS OF CLAIM.
//
// 1. NFR-04 PARITY FLOOR (roadmap 7.2). NFR-04 does not ask "are we slower than
// yesterday" — it asks for parity with the baseline libraries:
// "retry/parallelLimit within 10% of p-retry/p-limit; data functions within 10%
// of lodash equivalents or faster". That is a floor on one number:
// ourHz / baselineLibraryHz >= 0.9, both measured in the SAME run on the SAME
// machine so machine speed cancels.
//
// Enforcing a floor instead of diffing against stored history is what makes it
// usable. Measured on a development machine the per-run spread of these ratios
// reaches 14-47% — V8 settles into different optimization tiers between runs —
// so a gate comparing a fresh run against a stored previous run fails
// constantly on unchanged code. An earlier attempt did exactly that: 1-3
// spurious failures per run. Against a fixed floor the same noise is harmless,
// because the ratios sit at 1.2-6.5 while the floor is 0.9: an order of
// magnitude of headroom, which only a real defect crosses. The regression this
// project actually shipped — `uniq` and `groupBy` at ratio 0.37-0.50 — would
// have been caught immediately.
//
// 2. ABSOLUTE COLLAPSE FLOOR (roadmap 13.3). Our absolute suites have no
// baseline library to divide by, so until 13.3 they were collected by nothing
// and enforced by nothing: `no-baseline.bench.js` and the NFR-13 pipeline case
// ran on every CI benchmark job and were discarded (see bench-collect.mjs).
// They are now collected, reported in milliseconds, recorded, and held to a
// DELIBERATELY WIDE floor against their recorded figure — a collapse floor, not
// a parity floor.
//
// Why wide, and why environment-tagged: an absolute figure does not cancel
// machine speed. Same code, this workstation, minutes apart: the isolated
// two-key sort measured 38 ms in roadmap 13.1 and 88 ms while 13.3 was being
// written — a 2.3x swing from ambient load alone, and a shared CI runner adds
// its neighbours on top. Genuine algorithmic collapse is a different order:
// a regex reaching `validateEmail` (ADR-0005 exists to prevent exactly that) or
// an accidental O(n^2) over 10,000 rows costs 10x and up. The floor is set at
// 0.25 — 4x slower fails — which sits in the empty band between those two
// populations, and it is enforced only when the recorded figure carries the same
// environment tag as the running one. A workstation number never judges a CI
// run. Anything tighter would flake; anything looser would miss the collapse.
//
// The stored baseline file is therefore a RECORD for the parity gate — drift
// against it is reported, never fatal — and a COMPARAND for the collapse floor,
// which is why absolute entries carry the environment they were taken in.
//
// Usage:
//   node tools/bench-regression.mjs            # enforce both floors
//   node tools/bench-regression.mjs --update   # refresh the recorded position
//   node tools/bench-regression.mjs --runs 5   # override the run count
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyReport, environmentTag, OURS_PREFIX } from './bench-collect.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASELINE_PATH = resolve(ROOT, 'docs/benchmarks/baseline.json');
const REPORT_PATH = resolve(ROOT, 'bench-results.json');

/** NFR-04's tolerance: we may be at most this fraction slower than a baseline. */
const THRESHOLD = 0.1;

/** The enforced floor on ourHz / baselineHz, within one run. */
const FLOOR = 1 - THRESHOLD;

/**
 * The enforced floor on observedHz / recordedHz for an absolute benchmark, in a
 * matching environment. Wide by design — see the header: measured ambient swing
 * on one machine reaches 2.3x, algorithmic collapse starts around 10x.
 */
const ABSOLUTE_COLLAPSE_FLOOR = 0.25;

/** Runs to aggregate. Odd, so the median is an observed value. */
const DEFAULT_RUNS = 3;

/** This machine's comparability tag; absolute floors apply only within it. */
const ENVIRONMENT = environmentTag({
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  ci: Boolean(process.env.CI),
});

/**
 * Comparisons excluded from the parity floor for a SEMANTIC reason — the ratio
 * does not express a performance claim, so enforcing anything on it is
 * meaningless. Measurement noise is NOT a reason to appear here: the floor
 * tolerates noise by design (ADR-0014).
 */
const SEMANTICALLY_UNGATED = new Map([
  [
    'deepMerge vs lodash.merge — array-heavy input (NOT a parity claim)',
    'the ratio reflects a semantic difference (we replace arrays, lodash merges element-wise), not speed (ADR-0013)',
  ],
  [
    'retry — two transient failures, zero backoff (orchestration overhead)',
    'the only comparison whose true value is GENUINE PARITY (~1.0), so it sits at the floor ' +
      'rather than far above it; its timer-bound ±10% swing therefore can and does cross 0.9 ' +
      '(observed 0.85). Parity here is real and verified by the 7.1 suite — it simply cannot be ' +
      'gated at a 10% tolerance (ADR-0013, ADR-0014)',
  ],
]);

const argv = process.argv.slice(2);
const update = argv.includes('--update');
const runsIndex = argv.indexOf('--runs');
const runs = runsIndex === -1 ? DEFAULT_RUNS : Number(argv[runsIndex + 1]);
if (!Number.isInteger(runs) || runs < 1) {
  console.error('bench-regression: --runs must be a positive integer');
  process.exit(1);
}

/**
 * Format a millisecond figure without rounding a fast benchmark to '0.0'.
 *
 * The absolute suites span six orders of magnitude — a 19 ms pipeline
 * derivation beside a 0.0008 ms `uuid()` — and a fixed precision makes one of
 * the two unreadable. The whole point of printing milliseconds is that a
 * reviewer can compare the figure against a spec clause (NFR-13's 50 ms), so
 * significant digits are kept for the small ones.
 *
 * @param {number} value @returns {string}
 */
function formatMs(value) {
  return value >= 1 ? value.toFixed(1) : value.toPrecision(2);
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Execute one benchmark pass and classify it.
 *
 * @returns {ReturnType<typeof classifyReport>}
 */
function runOnce() {
  execFileSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/vitest/vitest.mjs'),
      'bench',
      '--run',
      `--outputJson=${REPORT_PATH}`,
    ],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return classifyReport(JSON.parse(readFileSync(REPORT_PATH, 'utf8')));
}

/**
 * @type {Map<string, {
 *   kind: 'parity' | 'absolute',
 *   ratios: number[], hz: number[], meanMs: number[], p99Ms: number[],
 *   baselineName: string | null,
 * }>}
 */
const collected = new Map();
/** @type {string[]} */
const problems = [];

for (let pass = 1; pass <= runs; pass += 1) {
  process.stderr.write(`bench-regression: pass ${pass}/${runs}\n`);
  const { entries, problems: passProblems } = runOnce();
  for (const problem of passProblems) {
    if (!problems.includes(problem)) problems.push(problem);
  }
  // A classification problem is a naming mistake, not a measurement: it will
  // reproduce identically on every remaining pass, so stop paying for them.
  if (problems.length > 0) break;
  for (const [key, entry] of entries) {
    const existing = collected.get(key) ?? {
      kind: entry.kind,
      ratios: [],
      hz: [],
      meanMs: [],
      p99Ms: [],
      baselineName: entry.baselineName,
    };
    existing.hz.push(entry.hz);
    existing.meanMs.push(entry.meanMs);
    existing.p99Ms.push(entry.p99Ms);
    if (entry.baselineHz !== null) existing.ratios.push(entry.hz / entry.baselineHz);
    collected.set(key, existing);
  }
}
rmSync(REPORT_PATH, { force: true });

// A benchmark the rules could not place is the roadmap-13.3 defect itself: the
// gate would quietly shrink. Refuse to pass, and refuse to record a partial
// picture as if it were the whole one.
if (problems.length > 0) {
  console.error(
    `bench-regression: ${problems.length} benchmark group(s) could not be classified — ` +
      'refusing to proceed (roadmap 13.3, ADR-0036):',
  );
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

if (collected.size === 0) {
  console.error('bench-regression: no benchmarks in the report — refusing to pass.');
  process.exit(1);
}

const sorted = [...collected].sort(([a], [b]) => a.localeCompare(b));

if (update) {
  /** @type {Record<string, object>} */
  const groups = {};
  for (const [key, entry] of sorted) {
    if (entry.kind === 'absolute') {
      groups[key] = {
        hz: Number(median(entry.hz).toFixed(2)),
        meanMs: Number(median(entry.meanMs).toPrecision(4)),
        p99Ms: Number(median(entry.p99Ms).toPrecision(4)),
        environment: ENVIRONMENT,
        enforced: true,
        gate:
          `absolute collapse floor ${ABSOLUTE_COLLAPSE_FLOOR} of the recorded hz, enforced ` +
          `only while running in '${ENVIRONMENT}' (an absolute figure does not cancel machine speed)`,
        ...(entry.hz.length > 1
          ? {
              observedSpread: `${Math.min(...entry.hz).toFixed(0)}..${Math.max(...entry.hz).toFixed(0)} hz`,
            }
          : {}),
      };
      continue;
    }

    const ratio = entry.ratios.length > 0 ? Number(median(entry.ratios).toFixed(4)) : null;
    const semantic = SEMANTICALLY_UNGATED.get(key);
    groups[key] = {
      ratio,
      baselineName: entry.baselineName,
      enforced: ratio !== null && semantic === undefined,
      ...(semantic !== undefined ? { notEnforcedBecause: semantic } : {}),
      ...(entry.ratios.length > 1
        ? {
            observedSpread: `${Math.min(...entry.ratios).toFixed(3)}..${Math.max(...entry.ratios).toFixed(3)}`,
          }
        : {}),
    };
  }
  const baseline = {
    $comment:
      'Recorded benchmark position. TWO KINDS OF ENTRY. A parity entry (`ratio`) records the ' +
      'NFR-04 median of ours / baseline library and is a RECORD FOR REVIEWERS, NOT the gate ' +
      'input — that gate enforces a fixed floor on the ratio, so it neither depends on this ' +
      'file nor drifts with it. An absolute entry (`hz`, `meanMs`, `p99Ms`) has no baseline ' +
      'library to divide by, so it IS the comparand for the collapse floor, and it carries the ' +
      '`environment` it was taken in: the floor is enforced only when that tag matches the ' +
      'running machine, because absolute throughput does not cancel machine speed. ' +
      '`observedSpread` shows the per-run min..max, i.e. how noisy each measurement inherently ' +
      'is; those spreads are why both gates are wide floors rather than diffs (ADR-0014, ' +
      'ADR-0036). Refresh with `pnpm bench:baseline` — on the environment you intend to gate ' +
      'in (see docs/benchmarks/README.md for recording on CI hardware).',
    threshold: THRESHOLD,
    floor: FLOOR,
    absoluteCollapseFloor: ABSOLUTE_COLLAPSE_FLOOR,
    environment: ENVIRONMENT,
    runs,
    groups,
  };
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(
    `bench-regression: recorded ${Object.keys(groups).length} entries in ${BASELINE_PATH} ` +
      `(environment ${ENVIRONMENT})`,
  );
  process.exit(0);
}

const stored = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : { groups: {} };

/** @type {string[]} */
const failures = [];
/** @type {string[]} */
const parityNotes = [];
/** @type {string[]} */
const absoluteNotes = [];

for (const [key, entry] of sorted) {
  if (entry.kind === 'absolute') {
    const observedHz = median(entry.hz);
    const figures =
      `${formatMs(median(entry.meanMs))} ms mean, ${formatMs(median(entry.p99Ms))} ms p99, ` +
      `${observedHz.toFixed(0)} hz`;
    const spread =
      entry.hz.length > 1
        ? ` (${runs} runs ${Math.min(...entry.hz).toFixed(0)}..${Math.max(...entry.hz).toFixed(0)} hz)`
        : '';
    const recorded = stored.groups?.[key];
    const recordedHz = typeof recorded?.hz === 'number' ? recorded.hz : null;
    const recordedEnvironment = recorded?.environment ?? stored.environment ?? null;

    if (recordedHz === null) {
      absoluteNotes.push(`  · ${key}: ${figures}${spread} | not yet recorded`);
      continue;
    }
    if (recordedEnvironment !== ENVIRONMENT) {
      absoluteNotes.push(
        `  · ${key}: ${figures}${spread} | recorded in '${recordedEnvironment}', running in ` +
          `'${ENVIRONMENT}' — not comparable, floor not enforced`,
      );
      continue;
    }

    const share = observedHz / recordedHz;
    const line =
      `${key}: ${figures}${spread} | recorded ${recordedHz.toFixed(0)} hz ` +
      `(${(share * 100).toFixed(0)}% of it)`;
    if (share < ABSOLUTE_COLLAPSE_FLOOR) {
      failures.push(
        `  ✗ ${line} — below the collapse floor of ${ABSOLUTE_COLLAPSE_FLOOR} ` +
          `(${(1 / ABSOLUTE_COLLAPSE_FLOOR).toFixed(0)}x slower than recorded)`,
      );
    } else {
      absoluteNotes.push(`  ✓ ${line}`);
    }
    continue;
  }

  const observed = median(entry.ratios);
  const spread = `${Math.min(...entry.ratios).toFixed(2)}..${Math.max(...entry.ratios).toFixed(2)}`;
  const recorded = stored.groups?.[key]?.ratio;
  const drift =
    typeof recorded === 'number'
      ? ` | recorded ${recorded.toFixed(2)} (${observed >= recorded ? '+' : ''}${(((observed - recorded) / recorded) * 100).toFixed(0)}%)`
      : ' | not yet recorded';
  const line = `${key}: ratio ${observed.toFixed(3)} (${runs} runs ${spread})${drift}`;

  const semantic = SEMANTICALLY_UNGATED.get(key);
  if (semantic !== undefined) {
    parityNotes.push(`  · ${line} — not enforced: ${semantic}`);
  } else if (observed < FLOOR) {
    failures.push(`  ✗ ${line} — below the NFR-04 floor of ${FLOOR}`);
  } else {
    parityNotes.push(`  ✓ ${line}`);
  }
}

// A recorded entry nobody measured is the 13.3 failure mode in its other
// direction: a benchmark renamed or deleted takes its gate with it, silently.
const observedKeys = new Set(collected.keys());
const stale = Object.keys(stored.groups ?? {}).filter((key) => !observedKeys.has(key));

console.log(
  `NFR-04 parity gate — ratio of ours / baseline library, median of ${runs} runs, floor ${FLOOR}:`,
);
for (const note of parityNotes) console.log(note);

console.log(
  `\nAbsolute benchmarks (no baseline library) — collapse floor ${ABSOLUTE_COLLAPSE_FLOOR} ` +
    `within environment '${ENVIRONMENT}':`,
);
for (const note of absoluteNotes) console.log(note);

if (stale.length > 0) {
  console.log(
    `\n${stale.length} recorded entr(y/ies) were not measured in this run — renamed, removed, ` +
      'or no longer collected. Refresh the record with `pnpm bench:baseline`:',
  );
  for (const key of stale) console.log(`  · ${key}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} benchmark(s) fell below a floor:`);
  for (const failure of failures) console.error(failure);
  console.error(
    `\nA parity failure means NFR-04's "within 10% of the baseline library, or faster" no longer ` +
      'holds. A collapse failure means an absolute benchmark is at least ' +
      `${(1 / ABSOLUTE_COLLAPSE_FLOOR).toFixed(0)}x slower than its recorded figure on this same ` +
      'environment. Both floors sit far below the normal operating range precisely so ' +
      'measurement noise cannot reach them — these are defects, not variance.',
  );
  process.exit(1);
}

console.log(
  `\nAll enforced comparisons at or above their floor (parity ${FLOOR}, absolute ` +
    `${ABSOLUTE_COLLAPSE_FLOOR}). Every benchmark was classified — a group with no ` +
    `'${OURS_PREFIX}' benchmark would have failed this run (roadmap 13.3).`,
);
console.log('Drift against the recorded position is informational — see ADR-0014.');
