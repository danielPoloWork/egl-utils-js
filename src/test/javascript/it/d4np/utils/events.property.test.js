import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { EventEmitter } from '../../../../../main/javascript/it/d4np/utils/events.js';

// Property suite (roadmap 2.6 template) for the events module.

describe('EventEmitter — delivery laws (spec §2 item 6)', () => {
  // Invariant: a subscribed listener receives exactly the emitted payload
  // sequence, in order; a once listener receives exactly the first payload.
  it('on receives every payload in order; once receives only the first', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 20 }), (payloads) => {
        /** @type {EventEmitter<{ n: number, error: unknown }>} */
        const emitter = new EventEmitter();
        /** @type {number[]} */
        const seenByOn = [];
        /** @type {number[]} */
        const seenByOnce = [];
        emitter.on('n', (n) => seenByOn.push(n));
        emitter.once('n', (n) => seenByOnce.push(n));
        for (const n of payloads) emitter.emit('n', n);
        expect(seenByOn).toEqual(payloads);
        expect(seenByOnce).toEqual([payloads[0]]);
      }),
      { numRuns: 100 },
    );
  });

  // Invariant: with L listeners and E emits, total deliveries = L × E, and
  // every listener sees the same ordered sequence.
  it('delivers each emit to each listener exactly once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.array(fc.integer(), { maxLength: 15 }),
        (listenerCount, payloads) => {
          /** @type {EventEmitter<{ n: number, error: unknown }>} */
          const emitter = new EventEmitter();
          /** @type {number[][]} */
          const logs = Array.from({ length: listenerCount }, () => []);
          for (const log of logs) emitter.on('n', (n) => log.push(n));
          for (const n of payloads) emitter.emit('n', n);
          for (const log of logs) expect(log).toEqual(payloads);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Invariant (isolation): for any subset of throwing listeners, every
  // non-throwing listener still receives every payload, and the error
  // listener receives exactly one report per throwing listener per emit.
  it('isolates any subset of throwing listeners without losing deliveries or reports', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
        (throwsFlags, payloads) => {
          /** @type {EventEmitter<{ n: number, error: unknown }>} */
          const emitter = new EventEmitter();
          let delivered = 0;
          let reported = 0;
          emitter.on('error', () => {
            reported += 1;
          });
          for (const shouldThrow of throwsFlags) {
            emitter.on('n', () => {
              delivered += 1;
              if (shouldThrow) throw new Error('listener failure');
            });
          }
          for (const n of payloads) emitter.emit('n', n);

          const throwers = throwsFlags.filter(Boolean).length;
          expect(delivered).toBe(throwsFlags.length * payloads.length); // everyone always ran
          expect(reported).toBe(throwers * payloads.length); // one report per failure
        },
      ),
      { numRuns: 100 },
    );
  });
});
