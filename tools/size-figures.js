/**
 * The pure half of the declared-figure gate (roadmap 22.1, ADR-0082).
 *
 * Split out of `check-size-figures.mjs` for the reason ADR-0064 gave when the
 * api-floor scanner was split out of its runner: **this gate reads prose with a
 * regular expression**, and a regex fixed without a test is only the next blind
 * spot. Keeping the parse and the verdict in a dependency-free, side-effect-free
 * module means the test suite can exercise them on strings — including the
 * shapes that must be seen and the shapes that must stay ignored.
 *
 * @module tools/size-figures
 */

/**
 * The tolerance, derived from the v1.4.0 audit rather than chosen.
 *
 * Two clusters separated cleanly in that data:
 *
 * - **noise** — chunk re-splits and toolchain jitter on rows whose source never
 *   changed: 33 rows, every one inside 1.6% and 45 B (`single: bsTable` moved
 *   -45 B, which is 0.3% of it);
 * - **rot** — a real cost that was never recorded: 12 rows, every one at or
 *   above 4.7% (`/net` +8.6%, `single: bsScrollspy` +7.5%, `single: bsPopover`
 *   +7.3%).
 *
 * A 2% band sits in the gap between them. The 8 B floor keeps a small row — the
 * smallest carrying a figure is 194 B — from failing on two bytes of the same
 * jitter, and it is also what absorbs any cross-platform difference between the
 * machine a figure was measured on and the Linux runner that checks it.
 *
 * @type {{ fraction: number, floorBytes: number }}
 */
export const BAND = { fraction: 0.02, floorBytes: 8 };

/**
 * `measured 1160 B`, or `measured 24 632 B` — the **first** one in a row's name.
 *
 * First, deliberately: a row often quotes a second figure in another role
 * ("measured 1888 B against a 7844 B entry"), and only the leading one is this
 * row's own measurement.
 */
const FIGURE = /measured ([\d ]+?) B/;

/**
 * The figure a row advertises, or `null` when it advertises none.
 *
 * A row with no figure is not a defect: the `<= 1 kB / NFR-02` per-function rows
 * assert a ceiling rather than a measurement, and 51 of them say so.
 *
 * @param {string} name - The row's `name` from `.size-limit.json`.
 * @returns {number | null}
 */
export function declaredFigure(name) {
  const match = FIGURE.exec(String(name));
  if (match === null) return null;
  const digits = match[1].replace(/ /g, '');
  return digits === '' ? null : Number(digits);
}

/**
 * The house shorthand a row sometimes opens with: `single: bsButton (2.02 kB -
 * documented NFR-17 composing row, …)`. That leading figure **is** the row's
 * limit restated in prose, so it can contradict the `limit` beside it — the same
 * defect as a stale measurement, one field over. Ten rows did at v1.4.0.
 *
 * Only the leading form counts. A clause figure quoted mid-sentence ("NFR-17
 * <= 1.2 kB per ADR-0037") is a *ceiling this row sits under*, not this row's
 * limit, and conflating the two would make the gate demand the wrong thing.
 */
const LEADING_LIMIT = /^[^(]*\((\d+(?:\.\d+)?) kB - /;

/**
 * Bytes from a size-limit limit, in either of the two shapes it appears in:
 * `'2.02 kB'` / `'400 B'` in `.size-limit.json`, and a plain `2020` in the JSON
 * report. Both matter — this gate reads the report, and its own tests read the
 * config — and taking only the string form is how the contradiction check would
 * have done nothing at all in the real run while passing on paper.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
function bytesOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(kB|B)\s*$/.exec(String(value ?? ''));
  if (match === null) return null;
  return Number(match[1]) * (match[2] === 'kB' ? 1000 : 1);
}

/**
 * The limit a row restates in its own opening words, or `null` when it does not.
 *
 * @param {string} name
 * @returns {number | null}
 */
export function declaredLimit(name) {
  const match = LEADING_LIMIT.exec(String(name));
  return match === null ? null : Number(match[1]) * 1000;
}

/**
 * @typedef {object} FigureDrift
 * @property {string} name - The row's full name.
 * @property {string} label - Its leading identifier, for a one-line report.
 * @property {number} declared - What the row says it measures.
 * @property {number} actual - What the build measures.
 * @property {number} delta - `actual - declared`.
 * @property {number} pct - That, as a percentage of `declared`.
 * @property {boolean} stale - Beyond {@link BAND}, and therefore a failure.
 */

/**
 * @typedef {object} FigureAudit
 * @property {number} checked - Rows carrying a figure.
 * @property {number} undeclared - Rows carrying none, by design.
 * @property {FigureDrift[]} drifted - Every row whose figure moved at all,
 *   largest movement first, each flagged `stale` or not.
 * @property {{ label: string, said: number, limit: number }[]} contradictions -
 *   Rows whose opening words restate a limit that is not the one they carry.
 *   Never banded: this is one field disagreeing with another in the same object,
 *   not a measurement.
 */

/**
 * Compare what each row advertises against what size-limit measured.
 *
 * @param {readonly { name?: unknown, size?: unknown }[]} rows - size-limit's
 *   JSON report.
 * @returns {FigureAudit}
 * @throws {TypeError} When a row carries a figure but no usable size, which
 *   means the report is not the one this gate can read — reporting "all good"
 *   for that is the failure mode the gate exists to remove.
 */
export function auditRows(rows) {
  /** @type {FigureDrift[]} */
  const drifted = [];
  /** @type {{ label: string, said: number, limit: number }[]} */
  const contradictions = [];
  let checked = 0;
  let undeclared = 0;

  for (const row of rows) {
    const name = String(row?.name ?? '');
    const said = declaredLimit(name);
    const limit = bytesOf(row?.limit) ?? bytesOf(row?.sizeLimit);
    if (said !== null && limit !== null && said !== limit) {
      contradictions.push({ label: name.split('(')[0].trim() || name.slice(0, 40), said, limit });
    }
    const declared = declaredFigure(name);
    if (declared === null) {
      undeclared += 1;
      continue;
    }
    const actual = Number(row?.size);
    if (!Number.isFinite(actual)) {
      throw new TypeError(`size-figures: no size reported for "${name.slice(0, 60)}"`);
    }
    checked += 1;
    const delta = actual - declared;
    if (delta === 0) continue;
    const magnitude = Math.abs(delta);
    drifted.push({
      name,
      label: name.split('(')[0].trim() || name.slice(0, 40),
      declared,
      actual,
      delta,
      pct: (delta / declared) * 100,
      stale: magnitude > BAND.floorBytes && magnitude > declared * BAND.fraction,
    });
  }

  drifted.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { checked, undeclared, drifted, contradictions };
}
