// Property suites (roadmap 10.1, spec 02 §6, ADR-0027) for the laws the
// /logging entry promises: one record renders as exactly one line, a timestamp
// has a fixed width, and the threshold gates exactly the levels below it.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  LOG_LEVELS,
  formatLogLine,
  formatTimestamp,
  logger,
} from '../../../../../main/javascript/it/d4np/utils/logging.js';

/** Levels a logger actually emits — `'silent'` is a threshold only. */
const EMITTED = LOG_LEVELS.filter((level) => level !== 'silent');

/** Records built from arbitrary strings, including line breaks and controls. */
const arbRecord = fc.record({
  ts: fc.integer({ min: -8_640_000_000_000, max: 8_640_000_000_000 }),
  level: fc.constantFrom(...EMITTED),
  name: fc.string(),
  id: fc.string(),
  message: fc.string(),
  args: fc.constant([]),
});

describe('formatLogLine — one record, exactly one line', () => {
  it('never emits a CR or LF, whatever the record carries', () => {
    fc.assert(
      fc.property(arbRecord, (rec) => {
        expect(formatLogLine(rec)).not.toMatch(/[\r\n]/);
      }),
    );
  });

  it('always renders the whole message content, breaks aside', () => {
    fc.assert(
      fc.property(arbRecord, (rec) => {
        // Every non-break run of the message survives into the line.
        for (const chunk of rec.message.split(/[\r\n]+/)) {
          if (chunk !== '') expect(formatLogLine(rec)).toContain(chunk);
        }
      }),
    );
  });
});

describe('formatTimestamp — fixed width', () => {
  it('is 23 code units with milliseconds and 19 without', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8_640_000_000_000 }),
        fc.boolean(),
        (ts, fractional) => {
          const line = formatTimestamp(ts, { fractional });
          expect(line).toHaveLength(fractional ? 23 : 19);
        },
      ),
    );
  });

  it('never ends on a separator', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8_640_000_000_000 }),
        fc.boolean(),
        (ts, fractional) => {
          expect(formatTimestamp(ts, { fractional })).not.toMatch(/[.:\-\s]$/);
        },
      ),
    );
  });
});

describe('logger — the threshold gates exactly the levels below it', () => {
  it('emits a call iff its level ranks at or above the configured level', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LOG_LEVELS),
        fc.constantFrom(...EMITTED),
        (threshold, called) => {
          /** @type {string[]} */
          const seen = [];
          const log = logger({
            level: threshold,
            now: () => 0,
            sink: (rec) => seen.push(rec.level),
          });
          log[called]('x');

          const expected =
            LOG_LEVELS.indexOf(called) >= LOG_LEVELS.indexOf(threshold) ? [called] : [];
          expect(seen).toEqual(expected);
        },
      ),
    );
  });

  it('gives a child the parent threshold, so gating is inherited exactly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LOG_LEVELS),
        fc.constantFrom(...EMITTED),
        (threshold, called) => {
          /** @type {string[]} */
          const parentSeen = [];
          /** @type {string[]} */
          const childSeen = [];
          const parent = logger({
            level: threshold,
            now: () => 0,
            sink: (rec) => parentSeen.push(rec.level),
          });
          parent[called]('x');

          const child = logger({
            level: threshold,
            now: () => 0,
            sink: (rec) => childSeen.push(rec.level),
          }).child('sub');
          child[called]('x');

          expect(childSeen).toEqual(parentSeen);
        },
      ),
    );
  });
});
