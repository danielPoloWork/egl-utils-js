import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { httpClient } from '../../../../../main/javascript/it/d4np/utils/web.js';
import { HttpError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

// Property suite (roadmap 2.6 template) for the web module — fake fetch, no
// network. numRuns kept moderate: each run spins a client and a Response.

describe('httpClient — request/response laws (spec §2 item 16)', () => {
  // Invariant: any JSON-serializable payload sent via `json` round-trips —
  // the wire body is its JSON string, and a JSON echo response parses back
  // deep-equal to it.
  it('round-trips any JSON-serializable payload through json option and JSON response', async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (payload) => {
        /** @type {string | undefined} */
        let wireBody;
        const impl = async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
          wireBody = /** @type {string} */ (init.body);
          return new Response(wireBody ?? '', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        };
        const api = httpClient({ fetch: /** @type {any} */ (impl) });
        const echoed = await api.post('https://h.test/echo', { json: payload });
        expect(wireBody).toBe(JSON.stringify(payload));
        // JSON round-trip: undefined only for payloads JSON cannot represent
        // at the top level (JSON.stringify(undefined) is undefined — excluded
        // by fc.jsonValue), so the echo must deep-equal the payload.
        expect(echoed).toEqual(JSON.parse(JSON.stringify(payload)));
      }),
      { numRuns: 75 },
    );
  });

  // Invariant: every non-2xx status rejects with HttpError carrying exactly
  // that status; every 2xx resolves. The classifier is response.ok, nothing
  // subtler.
  it('rejects HttpError for any non-2xx status and resolves for any 2xx', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.integer({ min: 200, max: 299 }), fc.integer({ min: 300, max: 599 })),
        async (status) => {
          // 204/205/304 are null-body statuses — the Response constructor
          // rejects a body for them (a platform rule, not an httpClient one).
          const nullBody = status === 204 || status === 205 || status === 304;
          const impl = async () =>
            new Response(nullBody ? null : '{"k":1}', {
              status,
              headers: { 'content-type': 'application/json' },
            });
          const api = httpClient({ fetch: /** @type {any} */ (impl) });
          const outcome = await api.get('https://h.test/').then(
            () => ({ ok: true }),
            (error) => ({ ok: false, error }),
          );
          if (status >= 200 && status <= 299) {
            expect(outcome.ok).toBe(true);
          } else {
            expect(outcome.ok).toBe(false);
            const err = /** @type {{ error: HttpError }} */ (outcome).error;
            expect(err).toBeInstanceOf(HttpError);
            expect(err.status).toBe(status);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
