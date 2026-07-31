import { bench, describe } from 'vitest';
import { BENCH_OPTIONS } from './options.js';
import {
  validateEmail,
  parseDuration,
  urlSearchParams,
  uuid,
  isEmpty,
  isObject,
} from '../../../../../main/javascript/it/d4np/utils/index.js';
import { EMAILS, DURATIONS, QUERY_PARAMS, RECORDS } from './fixtures.js';

// Absolute benchmarks for functions with NO lodash/p-* equivalent (roadmap
// 7.1). There is nothing to claim parity against, so these carry **no NFR-04
// claim** — they exist to give the nightly regression gate (roadmap 7.2) a
// baseline of our own, and to keep an eye on the functions whose cost profile
// is a documented guarantee.
//
// Publishing a "we are faster" number against an unlike function would be the
// dishonest version of this file; that is why it is separate from the parity
// suites rather than mixed in with them.

describe('validateEmail (NFR-05 keeps this linear — no regex anywhere)', () => {
  // The absolute figure matters here beyond regression tracking: ADR-0005
  // chose a hand-rolled scan precisely so cost stays linear in input length.
  // The adversarial worst case has its own un-instrumented gate in
  // validate-email.redos.test.js; this is the ordinary-input cost.
  bench(
    'mixed valid and invalid inputs',
    () => {
      for (const email of EMAILS) validateEmail(email);
    },
    BENCH_OPTIONS,
  );
});

describe('parseDuration', () => {
  bench(
    'valid duration strings',
    () => {
      for (const duration of DURATIONS) parseDuration(duration);
    },
    BENCH_OPTIONS,
  );
});

describe('urlSearchParams', () => {
  bench(
    'object with arrays and skipped values',
    () => {
      urlSearchParams(QUERY_PARAMS);
    },
    BENCH_OPTIONS,
  );
});

describe('uuid (bounded by the platform CSPRNG, not by our code)', () => {
  // Mostly measures crypto.randomUUID; tracked so a regression in the
  // fallback-assembly path (ADR-0008) would show up.
  bench(
    'uuid()',
    () => {
      uuid();
    },
    BENCH_OPTIONS,
  );
});

describe('type guards', () => {
  bench(
    'isObject over 1000 records',
    () => {
      for (const record of RECORDS) isObject(record);
    },
    BENCH_OPTIONS,
  );

  bench(
    'isEmpty over 1000 records',
    () => {
      for (const record of RECORDS) isEmpty(record);
    },
    BENCH_OPTIONS,
  );
});
