// The benchmark report classifier (roadmap 13.3; contract in ADR-0036).
//
// WHY THIS IS A SEPARATE, PURE MODULE.
//
// Roadmap 13.3 exists because the collector inside bench-regression.mjs
// SILENTLY DROPPED every benchmark it could not pair with a baseline library:
// a group without an `egl `-prefixed entry hit a bare `continue`. Every
// absolute suite — no-baseline.bench.js and the NFR-13 pipeline case — ran on
// every CI benchmark job and was then discarded, so `no-baseline.bench.js`
// documented itself as feeding a gate that never saw it.
//
// Silence was the defect, not the pairing rule. So classification lives here,
// as a pure function over the report, with two properties the old inline
// version could not have:
//
//   1. It is TOTAL over the report: every benchmark is either classified or
//      named in `problems`, and the caller refuses to pass on a problem. A
//      naming mistake now fails the gate instead of shrinking it.
//   2. It is unit-testable without running a benchmark (bench-collect.test.js),
//      which is what makes property 1 provable rather than asserted in a
//      comment.
//
// It also fixes a latent trap the naming convention would otherwise have armed:
// the old code took the baseline as "any other benchmark in the group", so two
// of OUR benchmarks under one `describe` would have made the second one a
// pretend baseline library and gated a meaningless ratio. Baselines are now
// identified by the ABSENCE of the prefix, never by position.

/**
 * Prefix marking a benchmark as ours rather than a baseline library's.
 *
 * Every benchmark this project writes carries it — in parity suites so the
 * ratio has a numerator, and in absolute suites so a group can be recognised
 * as ours-only rather than mistaken for an unpaired comparison.
 */
export const OURS_PREFIX = 'egl ';

/**
 * Build the environment tag that decides whether two absolute measurements are
 * comparable at all.
 *
 * Absolute throughput does not cancel machine speed the way a same-run ratio
 * does (ADR-0014), so a figure recorded on a workstation says nothing about the
 * same code on a shared CI runner. The tag makes that mechanical: the gate
 * enforces an absolute floor only when the recorded tag equals the running
 * one, and reports "not comparable" otherwise instead of inventing a verdict.
 *
 * Node's MAJOR version only: the runtime is held constant per ADR-0014, and a
 * patch bump is not a different machine.
 *
 * @param {object} source - The ambient facts, injected so tests can vary them.
 * @param {string} source.platform - As `process.platform`.
 * @param {string} source.arch - As `process.arch`.
 * @param {string} source.nodeVersion - As `process.version` (leading `v` optional).
 * @param {boolean} source.ci - Whether this is a CI runner rather than a workstation.
 * @returns {string} A stable tag, e.g. `'linux-x64-node20-ci'`.
 */
export function environmentTag({ platform, arch, nodeVersion, ci }) {
  const major = String(nodeVersion).replace(/^v/, '').split('.')[0];
  return `${platform}-${arch}-node${major}-${ci ? 'ci' : 'local'}`;
}

/**
 * @typedef {object} ParityEntry
 * @property {'parity'} kind
 * @property {number} hz - Our throughput.
 * @property {number} meanMs - Our mean time per iteration.
 * @property {number} p99Ms - Our p99 time per iteration.
 * @property {number} baselineHz - The baseline library's throughput, same run.
 * @property {string} baselineName - The baseline benchmark's name, for the record.
 */

/**
 * @typedef {object} AbsoluteEntry
 * @property {'absolute'} kind
 * @property {number} hz
 * @property {number} meanMs
 * @property {number} p99Ms
 * @property {null} baselineHz - Absolute by construction: there is nothing to divide by.
 * @property {null} baselineName
 */

/**
 * Reduce one vitest benchmark report to gate-ready entries.
 *
 * Group shapes, and what each means:
 *
 * - **exactly one ours + exactly one baseline** — a parity group. Keyed by the
 *   `describe` title, carrying both throughputs so the caller can enforce the
 *   NFR-04 ratio floor.
 * - **ours only (any count)** — an absolute group. Keyed
 *   `'<title> > <benchmark>'`, one entry per benchmark, because several
 *   unrelated absolute measurements legitimately share one `describe` (the
 *   type-guard and pipeline-stage suites do) and collapsing them to the title
 *   would lose all but one.
 * - **anything else** — a `problems` entry: no ours (nothing to gate), or an
 *   ambiguous pairing (two ours beside a baseline, or two baselines). Refusing
 *   to guess is the point of roadmap 13.3.
 *
 * @param {object} report - Parsed `vitest bench --outputJson` output.
 * @returns {{entries: Map<string, ParityEntry | AbsoluteEntry>, problems: string[]}}
 *   `entries` keyed as described; `problems` naming every benchmark the rules
 *   could not place, so the caller can fail loudly instead of gating less.
 */
export function classifyReport(report) {
  /** @type {Map<string, ParityEntry | AbsoluteEntry>} */
  const entries = new Map();
  /** @type {string[]} */
  const problems = [];

  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      // `fullName` is '<filepath> > <describe title>'; the title is the stable
      // identity across machines and checkouts, so the path is stripped.
      const title = String(group.fullName).split(' > ').slice(1).join(' > ');
      const benchmarks = group.benchmarks ?? [];
      const ours = benchmarks.filter((entry) => String(entry.name).startsWith(OURS_PREFIX));
      const others = benchmarks.filter((entry) => !String(entry.name).startsWith(OURS_PREFIX));

      if (ours.length === 0) {
        const listed = benchmarks.map((entry) => `'${entry.name}'`).join(', ') || 'no benchmarks';
        problems.push(
          `${title}: no '${OURS_PREFIX}'-prefixed benchmark (${listed}) — nothing to gate. ` +
            `Prefix ours with '${OURS_PREFIX}' so the group is collected.`,
        );
        continue;
      }

      if (others.length === 0) {
        for (const entry of ours) {
          entries.set(`${title} > ${entry.name}`, {
            kind: 'absolute',
            hz: entry.hz,
            meanMs: entry.mean,
            p99Ms: entry.p99,
            baselineHz: null,
            baselineName: null,
          });
        }
        continue;
      }

      if (ours.length > 1 || others.length > 1) {
        problems.push(
          `${title}: ambiguous pairing — ${ours.length} '${OURS_PREFIX}' benchmark(s) and ` +
            `${others.length} baseline candidate(s). A parity group needs exactly one of each; ` +
            `split it, or drop the prefix mismatch that made a benchmark look like a baseline.`,
        );
        continue;
      }

      entries.set(title, {
        kind: 'parity',
        hz: ours[0].hz,
        meanMs: ours[0].mean,
        p99Ms: ours[0].p99,
        baselineHz: others[0].hz,
        baselineName: String(others[0].name),
      });
    }
  }

  return { entries, problems };
}
