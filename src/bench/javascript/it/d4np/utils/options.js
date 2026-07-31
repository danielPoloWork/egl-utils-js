/**
 * Shared tinybench options for every NFR-04 benchmark (roadmap 7.1/7.2,
 * ADR-0014).
 *
 * The defaults are too short to be trustworthy here. Measured against an
 * unchanged codebase, the default settings produced a ratio for `uniq` of
 * 1.49 / 1.29 / 1.30 on consecutive runs — a between-run spread far wider than
 * NFR-04's 10% threshold, which would make any gate a noise detector. With the
 * warmup below the same comparison settles at ~2.40 (±1%), and the higher
 * figure is the more truthful one: the short default never let V8 finish
 * optimizing either side, so it was comparing two half-warm functions.
 *
 * A residual bimodality remains (V8 occasionally settles in a slower tier),
 * which is why the gate takes the MEDIAN of several runs rather than trusting
 * any single one — a threshold cannot fix a bimodal distribution.
 *
 * @module bench/options
 */

/** @type {{ time: number, warmupTime: number, warmupIterations: number }} */
export const BENCH_OPTIONS = Object.freeze({
  time: 1000,
  warmupTime: 400,
  warmupIterations: 50,
});
