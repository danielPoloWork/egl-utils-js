import { describe, it, expect } from 'vitest';
import { validateEmail } from '../../../../../main/javascript/it/d4np/utils/validation.js';

// NFR-05 timing gate — run UN-instrumented (`pnpm test:redos`; the coverage
// run excludes `*.redos.test.js`): v8 coverage instrumentation multiplies the
// per-call cost ~20x and injects pauses, so measuring wall-clock under it
// gates the instrumentation, not the function. Functional coverage of
// validateEmail lives in validate-email.test.js; this file only times.

describe('validateEmail — NFR-05 ReDoS gate: 10^6 adversarial inputs, each < 1 ms', () => {
  it('never exceeds 1 ms per input across one million adversarial validations', () => {
    // Adversarial corpus: shapes that force the longest possible scans or
    // target classic ReDoS patterns (long runs, ambiguous boundaries,
    // almost-valid inputs failing only at the very end).
    const a64 = 'a'.repeat(64);
    const label63 = 'a'.repeat(63);
    const domain255 = [label63, label63, label63, label63].join('.');
    /** @type {string[]} */
    const corpus = [];
    const push = (/** @type {string} */ s) => corpus.push(s);

    push(`${a64}@${domain255}`); // maximal valid — full 320-char scan
    push(`${a64}@${domain255.slice(0, 254)}!`); // fails at the last char
    push(`${'a.'.repeat(31)}a@${domain255}`); // dot-heavy local
    push(`${a64}@${'a.'.repeat(126)}ab`); // dot-heavy domain, valid
    push(`${a64}@${'a.'.repeat(126)}a.`); // trailing dot, fails at end
    push(`${a64}@${'a-'.repeat(31)}a.${label63}`); // hyphen-heavy labels
    push('a'.repeat(320)); // no @ at all — indexOf scans everything
    push('@'.repeat(320)); // all separators
    push(`${'.'.repeat(64)}@${domain255}`); // all dots local
    push(`${a64}@${'-'.repeat(255)}`); // all hyphens domain
    push(`${a64}@${'.'.repeat(255)}`); // all dots domain
    push(`a@${label63}.${label63}.${label63}.${label63}`); // deep labels
    push(`${a64}${'@'}${domain255.slice(0, 200)}@${'a'.repeat(50)}`); // second @ late
    push(`${'!'.repeat(64)}@${domain255}`); // atext symbol run
    push(`${a64}@${'xn--'.repeat(60)}co`); // punycode-ish churn
    // Length-cap probes just inside and outside every boundary.
    push(`${'a'.repeat(65)}@example.co`);
    push(`u@${domain255}a`);
    push('a'.repeat(321));
    // Classic ReDoS payload shapes (would explode a backtracking regex).
    for (let n = 8; n <= 256; n *= 2) {
      push(`${'a'.repeat(n)}!@example.co`);
      push(`${'a.'.repeat(Math.min(n, 32))}@example.co`);
      push(`a@${'a.'.repeat(Math.min(n, 120))}!`);
    }

    // Warm-up so JIT tiering does not pollute the measurement.
    for (let i = 0; i < 10_000; i += 1) {
      validateEmail(corpus[i % corpus.length]);
    }

    const RUNS = 1_000_000;
    let worst = 0;
    for (let i = 0; i < RUNS; i += 1) {
      const input = corpus[i % corpus.length];
      const start = performance.now();
      validateEmail(input);
      const elapsed = performance.now() - start;
      if (elapsed > worst) worst = elapsed;
    }

    expect(worst).toBeLessThan(1); // NFR-05: every input under 1 ms
  }, 120_000); // generous timeout: the gate itself typically runs in ~2 s
});
