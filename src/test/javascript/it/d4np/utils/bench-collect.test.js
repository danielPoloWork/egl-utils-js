// Tests for the benchmark report classifier (roadmap 13.3, ADR-0036).
//
// The defect 13.3 fixes was SILENCE: a benchmark group the collector could not
// pair with a baseline library was skipped by a bare `continue`, so every
// absolute suite ran in CI and was discarded. A comment promising "this is now
// collected" would be worth nothing; these tests are the proof, and they run
// without executing a single benchmark because classification is a pure
// function over the report (which is why bench-collect.mjs exists at all).
import { describe, it, expect } from 'vitest';
import {
  classifyReport,
  environmentTag,
  OURS_PREFIX,
} from '../../../../../../tools/bench-collect.mjs';

/**
 * Build a minimal `vitest bench --outputJson` report.
 *
 * @param {Array<{title: string, benchmarks: Array<{name: string, hz: number, mean?: number, p99?: number}>}>} groups
 * @returns {object} A report shaped like vitest's, with the fields the collector reads.
 */
function report(groups) {
  return {
    files: [
      {
        groups: groups.map((group) => ({
          fullName: `src/bench/javascript/it/d4np/utils/x.bench.js > ${group.title}`,
          benchmarks: group.benchmarks.map((benchmark) => ({
            mean: 1,
            p99: 2,
            ...benchmark,
          })),
        })),
      },
    ],
  };
}

describe('classifyReport — parity groups', () => {
  it('pairs our benchmark with the baseline library and keys on the group title', () => {
    const { entries, problems } = classifyReport(
      report([
        {
          title: 'uniq vs lodash.uniq',
          benchmarks: [
            { name: 'egl uniq', hz: 150, mean: 6.5, p99: 7.5 },
            { name: 'lodash.uniq', hz: 100 },
          ],
        },
      ]),
    );

    expect(problems).toEqual([]);
    expect([...entries.keys()]).toEqual(['uniq vs lodash.uniq']);
    expect(entries.get('uniq vs lodash.uniq')).toEqual({
      kind: 'parity',
      hz: 150,
      meanMs: 6.5,
      p99Ms: 7.5,
      baselineHz: 100,
      baselineName: 'lodash.uniq',
    });
  });

  it('identifies the baseline by the missing prefix, not by position', () => {
    // Declaration order is a style choice, never a semantic one: whichever way
    // round the two benchmarks are written, the ratio must have the same
    // numerator.
    const { entries } = classifyReport(
      report([
        {
          title: 'pick vs lodash.pick',
          benchmarks: [
            { name: 'lodash.pick', hz: 100 },
            { name: 'egl pick', hz: 400 },
          ],
        },
      ]),
    );

    const entry = entries.get('pick vs lodash.pick');
    expect(entry?.hz).toBe(400);
    expect(entry?.baselineHz).toBe(100);
  });
});

describe('classifyReport — absolute groups (the roadmap 13.3 defect)', () => {
  it('collects an ours-only group instead of discarding it', () => {
    const { entries, problems } = classifyReport(
      report([
        {
          title: 'tablePipeline.view() — NFR-13 budget',
          benchmarks: [{ name: 'egl view() full derivation', hz: 34, mean: 29.4, p99: 38 }],
        },
      ]),
    );

    expect(problems).toEqual([]);
    expect(
      entries.get('tablePipeline.view() — NFR-13 budget > egl view() full derivation'),
    ).toEqual({
      kind: 'absolute',
      hz: 34,
      meanMs: 29.4,
      p99Ms: 38,
      baselineHz: null,
      baselineName: null,
    });
  });

  it('keeps every benchmark of a multi-benchmark absolute group', () => {
    // The regression that motivated per-benchmark keys: `type guards` holds two
    // unrelated measurements, and the pipeline-stage suite three. Keying such a
    // group by its title alone would silently keep one and drop the rest.
    const { entries, problems } = classifyReport(
      report([
        {
          title: 'type guards',
          benchmarks: [
            { name: 'egl isObject over 1000 records', hz: 500 },
            { name: 'egl isEmpty over 1000 records', hz: 300 },
          ],
        },
      ]),
    );

    expect(problems).toEqual([]);
    expect([...entries.keys()]).toEqual([
      'type guards > egl isObject over 1000 records',
      'type guards > egl isEmpty over 1000 records',
    ]);
    expect([...entries.values()].map((entry) => entry.kind)).toEqual(['absolute', 'absolute']);
  });

  it('never invents a ratio between two of our own benchmarks', () => {
    // The latent trap the naming convention would have armed: the old collector
    // took "any other benchmark" as the baseline, so isEmpty would have become
    // isObject's pretend baseline library — and a meaningless ratio would have
    // been gated.
    const { entries } = classifyReport(
      report([
        {
          title: 'type guards',
          benchmarks: [
            { name: 'egl isObject over 1000 records', hz: 500 },
            { name: 'egl isEmpty over 1000 records', hz: 300 },
          ],
        },
      ]),
    );

    for (const entry of entries.values()) {
      expect(entry.baselineHz).toBeNull();
      expect(entry.baselineName).toBeNull();
    }
  });
});

describe('classifyReport — refuses to guess', () => {
  it('reports a group with no benchmark of ours rather than skipping it', () => {
    const { entries, problems } = classifyReport(
      report([
        {
          title: 'validateEmail (NFR-05 keeps this linear)',
          benchmarks: [{ name: 'mixed valid and invalid inputs', hz: 900 }],
        },
      ]),
    );

    expect(entries.size).toBe(0);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('validateEmail (NFR-05 keeps this linear)');
    expect(problems[0]).toContain(OURS_PREFIX);
    expect(problems[0]).toContain('mixed valid and invalid inputs');
  });

  it('reports an ambiguous pairing rather than picking one', () => {
    const { entries, problems } = classifyReport(
      report([
        {
          title: 'two of ours beside a baseline',
          benchmarks: [
            { name: 'egl a', hz: 1 },
            { name: 'egl b', hz: 2 },
            { name: 'lodash.thing', hz: 3 },
          ],
        },
      ]),
    );

    expect(entries.size).toBe(0);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ambiguous pairing');
  });

  it('reports two baseline candidates rather than taking the first', () => {
    const { problems } = classifyReport(
      report([
        {
          title: 'one of ours, two baselines',
          benchmarks: [
            { name: 'egl a', hz: 1 },
            { name: 'lodash.thing', hz: 2 },
            { name: 'ramda.thing', hz: 3 },
          ],
        },
      ]),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ambiguous pairing');
  });

  it('reports an empty group', () => {
    const { entries, problems } = classifyReport(
      report([{ title: 'nothing here', benchmarks: [] }]),
    );

    expect(entries.size).toBe(0);
    expect(problems[0]).toContain('no benchmarks');
  });

  it('tolerates a report with no files or groups at all', () => {
    expect(classifyReport({}).entries.size).toBe(0);
    expect(classifyReport({ files: [{}] }).problems).toEqual([]);
  });
});

describe('environmentTag', () => {
  it('distinguishes CI from a workstation on the same runtime', () => {
    const shared = { platform: 'linux', arch: 'x64', nodeVersion: 'v20.11.1' };

    expect(environmentTag({ ...shared, ci: true })).toBe('linux-x64-node20-ci');
    expect(environmentTag({ ...shared, ci: false })).toBe('linux-x64-node20-local');
  });

  it('keys on the Node major only, so a patch bump stays comparable', () => {
    const shared = { platform: 'linux', arch: 'x64', ci: true };

    expect(environmentTag({ ...shared, nodeVersion: 'v20.11.1' })).toBe(
      environmentTag({ ...shared, nodeVersion: '20.19.0' }),
    );
    expect(environmentTag({ ...shared, nodeVersion: 'v22.0.0' })).not.toBe(
      environmentTag({ ...shared, nodeVersion: 'v20.0.0' }),
    );
  });

  it('separates platforms and architectures', () => {
    const shared = { nodeVersion: 'v20.0.0', ci: true };

    expect(environmentTag({ ...shared, platform: 'win32', arch: 'x64' })).not.toBe(
      environmentTag({ ...shared, platform: 'linux', arch: 'x64' }),
    );
    expect(environmentTag({ ...shared, platform: 'linux', arch: 'arm64' })).not.toBe(
      environmentTag({ ...shared, platform: 'linux', arch: 'x64' }),
    );
  });
});
