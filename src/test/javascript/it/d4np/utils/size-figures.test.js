// Tests for the declared-figure gate's parse and verdict (roadmap 22.1,
// ADR-0082).
//
// These exist for the reason ADR-0064 gave when the api-floor scanner got its
// own suite: **this gate reads prose with a regular expression**, and a regex
// fixed without a test is only the next blind spot. The shapes that must be
// SEEN are here, and so are the shapes that must stay ignored — which is the
// half that keeps a gate usable rather than merely strict.
//
// The band is asserted at its edges too, because it is the whole design: it has
// to separate the drift a shared-chunk re-split causes (a byte or two on a row
// nobody touched) from the drift that means a real cost was never recorded.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  auditRows,
  BAND,
  declaredFigure,
  declaredLimit,
} from '../../../../../../tools/size-figures.js';

/**
 * @param {number} declared
 * @param {number} actual
 * @returns {import('../../../../../../tools/size-figures.js').FigureDrift[]}
 */
function drift(declared, actual) {
  return auditRows([{ name: `single: x (measured ${declared} B)`, size: actual }]).drifted;
}

describe('the figure a row advertises', () => {
  it.each([
    [
      'a plain figure',
      'single: bsIcon (NFR-17; measured 933 B incl. the option-key contract)',
      933,
    ],
    ['a spaced figure', '/bootstrap - full import (measured 24 632 B against the clause)', 24632],
    ['the FIRST of two', 'single: createForm (measured 1888 B against a 7844 B entry)', 1888],
    ['a figure mid-sentence', 'x (…, ADR-0056: measured 2242 B, +149 B for the checks)', 2242],
  ])('is read from %s', (_label, name, expected) => {
    expect(declaredFigure(name)).toBe(expected);
  });

  it.each([
    ['a ceiling-only row', 'single: delay (NFR-01 <= 1 kB / NFR-02)'],
    ['a row quoting a limit', 'single: bsTable (14.2 kB - documented NFR-17 composing-facade row)'],
    ['prose that says measured without a figure', 'x (measured against the clause)'],
    ['an empty name', ''],
  ])('is absent from %s, which is not a defect', (_label, name) => {
    expect(declaredFigure(name)).toBeNull();
  });

  it('does not mistake a limit in kB for a measurement in bytes', () => {
    // The trap this gate could most easily fall into: every row names its limit
    // in kB in the same sentence.
    expect(declaredFigure('single: bsAlert (NFR-17 <= 2 kB composing row; measured 1685 B)')).toBe(
      1685,
    );
  });
});

describe('the verdict', () => {
  it('says nothing about a row that matches', () => {
    expect(drift(1000, 1000)).toEqual([]);
  });

  it('counts the rows that carry a figure and the rows that do not', () => {
    const audit = auditRows([
      { name: 'a (measured 100 B)', size: 100 },
      { name: 'b (measured 100 B)', size: 400 },
      { name: 'c (NFR-01 <= 1 kB)', size: 999 },
    ]);
    expect(audit).toMatchObject({ checked: 2, undeclared: 1 });
    expect(audit.drifted).toHaveLength(1);
  });

  it('reports a small drift without failing on it', () => {
    // The 21.3 case: one frozen constant moved an untouched row by a byte.
    const [row] = drift(2100, 2101);
    expect(row).toMatchObject({ delta: 1, stale: false });
  });

  it('fails a row that has quietly grown', () => {
    // The 22.1 case: bsScrollspy advertised 1040 B and measured 1118 B.
    const [row] = drift(1040, 1118);
    expect(row).toMatchObject({ delta: 78, stale: true });
    expect(row.pct).toBeCloseTo(7.5, 1);
  });

  it('fails a row that shrank as loudly as one that grew', () => {
    // A drop is information too: it usually means a shared chunk moved, and the
    // row is no longer describing what a consumer downloads.
    expect(drift(1000, 900)[0]).toMatchObject({ delta: -100, stale: true });
  });

  it('holds the byte floor for a small row', () => {
    // 8 B on a 194 B row is 4.1% — over the fraction, under the floor, so the
    // floor is what decides. Two bytes of jitter on the smallest row in the file
    // must not fail the build.
    expect(drift(194, 194 + BAND.floorBytes)[0].stale).toBe(false);
    expect(drift(194, 194 + BAND.floorBytes + 1)[0].stale).toBe(true);
  });

  it('holds the fraction for a large row', () => {
    // 45 B on a 13 475 B row is 0.3%: over the floor, well under the fraction.
    expect(drift(13475, 13430)[0].stale).toBe(false);
    const overFraction = Math.ceil(13475 * BAND.fraction) + 1;
    expect(drift(13475, 13475 + overFraction)[0].stale).toBe(true);
  });

  it('orders the report by how far each row has moved', () => {
    const audit = auditRows([
      { name: 'small (measured 1000 B)', size: 1010 },
      { name: 'big (measured 1000 B)', size: 1500 },
      { name: 'middling (measured 1000 B)', size: 800 },
    ]);
    expect(audit.drifted.map((row) => row.label)).toEqual(['big', 'middling', 'small']);
  });

  it('refuses a report it cannot read rather than passing it', () => {
    // The failure this gate must never commit itself: answering "all good" for a
    // report it did not understand.
    expect(() => auditRows([{ name: 'x (measured 100 B)' }])).toThrow(/no size reported/);
    expect(() => auditRows([{ name: 'x (measured 100 B)', size: 'nope' }])).toThrow(
      /no size reported/,
    );
  });
});

describe('the limit a row restates in its own opening words', () => {
  it.each([
    ['the house shorthand', 'single: bsButton (2.02 kB - documented NFR-17 row, ADR-0037)', 2020],
    ['a whole number', 'single: bsTable (14.2 kB - documented composing-facade row)', 14200],
  ])('is read from %s', (_label, name, expected) => {
    expect(declaredLimit(name)).toBe(expected);
  });

  it.each([
    // A ceiling this row sits UNDER is not this row's limit, and demanding they
    // match would make the gate ask for the wrong thing.
    [
      'a clause quoted mid-sentence',
      'single: bsIcon (NFR-17 <= 1.2 kB per ADR-0037; measured 950 B)',
    ],
    ['a row that names no figure first', 'single: delay (NFR-01 <= 1 kB / NFR-02)'],
    ['a figure in bytes', 'x (400 B - the errors entry)'],
  ])('is absent from %s', (_label, name) => {
    expect(declaredLimit(name)).toBeNull();
  });

  it('reports a row whose opening words disagree with the limit beside them', () => {
    const audit = auditRows([
      { name: 'single: bsButton (1.9 kB - the old figure)', size: 1872, limit: '2.02 kB' },
      { name: 'single: bsTabs (2.3 kB - agreeing)', size: 2147, limit: '2.3 kB' },
      { name: 'single: delay (NFR-01 <= 1 kB / NFR-02)', size: 364, limit: '1 kB' },
    ]);
    expect(audit.contradictions).toEqual([{ label: 'single: bsButton', said: 1900, limit: 2020 }]);
  });

  it('reads the limit from size-limit’s own report shape too', () => {
    // `.size-limit.json` carries `limit: '2.02 kB'`; the JSON report carries
    // `sizeLimit: 2020`. Both have to be understood, because this gate runs
    // against the report and its tests run against the config.
    const audit = auditRows([{ name: 'x (1.9 kB - stale)', size: 1872, sizeLimit: 2020 }]);
    expect(audit.contradictions).toHaveLength(1);
  });
});

describe('the live configuration', () => {
  it('has a figure on every row that names a measurement, and none of them is zero', () => {
    /** @type {{ name: string }[]} */
    const rows = JSON.parse(readFileSync('.size-limit.json', 'utf8'));
    const figures = rows.map((row) => declaredFigure(row.name)).filter((f) => f !== null);

    // A guard against the regex silently stopping to match after an edit to the
    // house prose style: if this drops to a handful, the gate has gone blind
    // while staying green — the ADR-0064 failure mode exactly.
    expect(figures.length).toBeGreaterThan(50);
    expect(figures.every((figure) => Number.isInteger(figure) && figure > 0)).toBe(true);
  });

  it('has no row whose opening words disagree with its own limit', () => {
    /** @type {{ name: string, limit: string, size?: number }[]} */
    const rows = JSON.parse(readFileSync('.size-limit.json', 'utf8'));
    // Sizes are irrelevant here and deliberately absent: this assertion is about
    // two fields of the same object agreeing, which needs no build at all.
    const audit = auditRows(rows.map((row) => ({ name: row.name, limit: row.limit, size: 0 })));
    expect(audit.contradictions).toEqual([]);
  });
});
