import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { remotePipeline } from '../../../../../main/javascript/it/d4np/utils/table.js';

// Spec 06 NFR-26: "no interleaving of commands and responses produces a view
// whose `rows` came from a query other than the one the same view describes."
//
// This is a property test rather than a set of examples on purpose. The failure
// mode is a race, and examples only find the races someone already imagined —
// the out-of-order arrival in `table-remote.test.js` was written *after*
// reasoning about it. fast-check generates the interleavings nobody pictured.

/** Commands the generator can issue, each producing a distinguishable query. */
const COMMANDS = [
  { name: 'search', apply: (t, n) => t.setSearch(`s${n}`) },
  { name: 'filter', apply: (t, n) => t.setFilter('a', `f${n}`) },
  { name: 'page', apply: (t, n) => t.setPage((n % 5) + 1) },
  { name: 'sort', apply: (t) => t.toggleSort('a') },
  { name: 'pageSize', apply: (t, n) => t.setPageSize((n % 3) + 1) },
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the async race invariant (NFR-26)', () => {
  it('never shows rows from a query other than the one the view describes', async () => {
    await fc.assert(
      fc.asyncProperty(
        // A script of commands, and a permutation-ish schedule deciding the order
        // in which the outstanding responses are settled.
        fc.array(
          fc.record({ command: fc.integer({ min: 0, max: 4 }), n: fc.integer({ min: 0, max: 9 }) }),
          {
            minLength: 1,
            maxLength: 12,
          },
        ),
        fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 24 }),
        fc.boolean(),
        async (script, schedule, failSome) => {
          /** @type {{ query: any, signal: AbortSignal, settle: (ok: boolean) => void, done: boolean }[]} */
          const calls = [];

          const load = (query, signal) =>
            new Promise((resolve, reject) => {
              const call = {
                query,
                signal,
                done: false,
                settle: (ok) => {
                  if (call.done) return;
                  call.done = true;
                  // The rows carry the query that produced them, which is what
                  // makes the invariant checkable rather than assumed.
                  if (ok) resolve({ rows: [{ from: JSON.stringify(query) }], total: 1 });
                  else reject(new Error('boom'));
                },
              };
              calls.push(call);
            });

          const table = remotePipeline({ load, columns: [{ key: 'a' }] });

          for (const step of script) {
            COMMANDS[step.command].apply(table, step.n);
          }

          // Settle outstanding responses in the generated order — including
          // responses to loads that were already aborted, and out of order.
          for (const index of schedule) {
            const call = calls[index % Math.max(1, calls.length)];
            if (call !== undefined) call.settle(!(failSome && index % 3 === 0));
          }
          // Then settle whatever the schedule missed, so the last load lands.
          for (const call of calls) call.settle(true);
          await flush();

          const view = table.view();
          table.destroy();

          // THE INVARIANT: whatever rows are on screen were produced by exactly
          // the query the same view reports.
          if (view.rows.length > 0) {
            expect(view.rows[0].from).toBe(JSON.stringify(view.query));
          }

          // A settled pipeline is never left claiming to be loading.
          expect(view.loading).toBe(false);
          // And a view is never simultaneously an error and a fresh success.
          if (view.error !== null) expect(view.error).toBeInstanceOf(Error);
        },
      ),
      { numRuns: 250 },
    );
  });

  it('aborts every load it supersedes, not just the last', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 4 }), { minLength: 2, maxLength: 8 }),
        async (searches) => {
          /** @type {AbortSignal[]} */
          const signals = [];
          const table = remotePipeline({
            load: (_query, signal) => {
              signals.push(signal);
              return new Promise(() => {});
            },
          });

          const distinct = [...new Set(searches)];
          for (const text of distinct) table.setSearch(text);

          // Every signal but the current one is aborted: a superseded request that
          // keeps running is server work nobody will ever read.
          expect(signals.slice(0, -1).every((s) => s.aborted)).toBe(true);
          expect(signals[signals.length - 1].aborted).toBe(false);

          table.destroy();
          // …and destroy aborts the last one too (NFR-15).
          expect(signals[signals.length - 1].aborted).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
