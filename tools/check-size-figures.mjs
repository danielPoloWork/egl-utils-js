// The declared-figure gate for `.size-limit.json` (roadmap 22.1, ADR-0082).
//
// WHY THIS EXISTS.
//
// Every row in `.size-limit.json` carries two numbers: a `limit`, which CI
// enforces, and a **measured figure written into the row's `name`** — "measured
// 1160 B" — which nothing enforced. The second one is what every budget
// conversation in this repository actually reads: an ADR quotes it, a journal
// entry diffs against it, and the next item's "+N B for X" is computed from it.
//
// It rotted. At v1.4.0, **45 of the 66 rows carrying a figure were wrong**, a
// dozen of them by 5-8%, because of the one mechanism nobody was watching: **a
// row is re-pinned only when its LIMIT fails.** Roadmap 20.x's descriptor checks
// (ADR-0056) added a shared cost to every Bootstrap builder and wrapper and
// re-pinned the three rows that went red; the other eleven grew too, stayed
// under their limits, and kept advertising figures from before. The esbuild 0.28
// security override in #115 moved the same family again. Nothing failed, and the
// numbers people were quoting were simply not the numbers.
//
// The damage is not aesthetic. `single: bsDropdown` reached **1 byte** under its
// limit while its row claimed 79 B of margin, so the next dependency bump would
// have failed a component nobody had touched — and the row's own text would have
// made that look impossible.
//
// So the figure becomes a gate. Not a hard equality: a shared-chunk re-split
// moves unrelated rows by a byte or two (roadmap 21.3 cost `single: bsTooltip`
// exactly one), and a gate that fails on that is a gate people re-pin blindly.
// The band is derived from the drift this audit measured — see `BAND` in
// ./size-figures.js, which also holds the parse and the verdict so both are
// testable on strings (the ADR-0064 lesson: a regex fixed without a test is only
// the next blind spot).
//
// Reads size-limit's own JSON report on **stdin**, so the suite runs size-limit
// once:
//
//     size-limit --json | node tools/check-size-figures.mjs
import { auditRows, BAND } from './size-figures.js';

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (text += chunk));
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', reject);
  });
}

const raw = await readStdin();
if (raw.trim() === '') {
  console.error(
    'check-size-figures: nothing on stdin. Run it as `size-limit --json | node tools/check-size-figures.mjs`.',
  );
  process.exit(1);
}

/** @type {unknown} */
let report;
try {
  // size-limit writes its warnings to stderr and JSON to stdout, but a run can
  // still leave a banner ahead of it; take the array.
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  report = JSON.parse(start === -1 || end === -1 ? raw : raw.slice(start, end + 1));
} catch (failure) {
  console.error(`check-size-figures: stdin is not size-limit JSON — ${failure.message}`);
  process.exit(1);
}

if (!Array.isArray(report)) {
  // A config error comes back as `{"error": "SizeLimitError: …"}`, and reporting
  // "0 rows checked, all good" for that would be this gate committing the exact
  // failure it exists to catch.
  const message =
    report !== null && typeof report === 'object' && 'error' in report
      ? String(/** @type {{ error: unknown }} */ (report).error)
      : 'expected an array of rows';
  console.error(`check-size-figures: size-limit did not report rows — ${message}`);
  process.exit(1);
}

/** @type {import('./size-figures.js').FigureAudit} */
let audit;
try {
  audit = auditRows(report);
} catch (failure) {
  console.error(`check-size-figures: ${failure.message}`);
  process.exit(1);
}

console.log(
  `.size-limit.json declared figures — ${audit.checked} rows carry one, ${audit.undeclared} do ` +
    `not, band ${BAND.fraction * 100}% or ${BAND.floorBytes} B`,
);
for (const row of audit.drifted) {
  console.log(
    `${row.stale ? '  ✗' : '  ·'} ${row.label}: declares ${row.declared} B, measures ` +
      `${row.actual} B (${row.delta > 0 ? '+' : ''}${row.delta} B, ${row.pct.toFixed(1)}%)`,
  );
}

for (const row of audit.contradictions) {
  console.log(
    `  ✗ ${row.label}: opens by calling its limit ${row.said} B, and carries ${row.limit} B`,
  );
}

if (audit.contradictions.length > 0) {
  console.error(
    `
${audit.contradictions.length} row(s) restate a limit they do not carry. The opening ` +
      `"N kB -" in a row's name IS its limit in the house shorthand, so it has to be the limit ` +
      `beside it — ten rows disagreed at v1.4.0 (ADR-0082).`,
  );
  process.exit(1);
}

const stale = audit.drifted.filter((row) => row.stale);
if (stale.length > 0) {
  console.error(
    `\n${stale.length} row(s) advertise a figure they no longer measure. Re-pin the figure in ` +
      `.size-limit.json **with the cause written into the row**, the way every budget change in ` +
      `this repository is recorded — and look at the row's remaining headroom while you are ` +
      `there, because that is what rots next (ADR-0082).`,
  );
  process.exit(1);
}

console.log(
  audit.drifted.length === 0
    ? '\nEvery declared figure matches what the build measures.'
    : `\nEvery declared figure is inside the band; ${audit.drifted.length} row(s) drifted by less.`,
);
