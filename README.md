# egl-utils-js

> Universal JavaScript async, data, and event utilities for Node.js and modern browsers

![Status](https://img.shields.io/badge/Status-v0.0.0-blue)

A
library written in **JavaScript (ES2023)**, built and governed to an enterprise quality
bar: full CI matrix, static analysis, sanitizers, documented design decisions, and SemVer
releases.

## What it is

A universal JavaScript utilities library (Node.js >= 18 and modern evergreen browsers)
providing async combinators with first-class AbortSignal cancellation, pure data-manipulation
functions, typed event helpers, and web/crypto/storage utilities — published on npm as
egl-utils-js with named exports only, dual ESM/CJS via an exports map, zero runtime
dependencies in the root entry, and a typed error hierarchy (EglError base with stable
.code). Pure by default, stateful by contract: the data and async modules never mutate
inputs; events, storage, http, and cookie modules are labeled stateful (spec §1, §3).

The frozen specification is in
[`docs/specs/01_spec_utils.md`](docs/specs/01_spec_utils.md). The full generated API
reference (roadmap 7.5) builds with `pnpm docs:api` into `docs/api/` (not committed —
see [`docs/workflow/documentation.md`](docs/workflow/documentation.md)).

## Build, test, run

```bash
pnpm build
pnpm test
```

- **Toolchain:** tsup (esbuild) — dual ESM/CJS + .d.ts generated from JSDoc types (ADR-001), Vitest (+ fast-check property tests; Playwright browser smoke from M6), Prettier, ESLint (flat config) + tsc --noEmit with checkJs (JSDoc type-check).
- **Supported platforms:** Linux (Node.js 18, 20, 22).
- Consumers import the public surface via: `import { parallelLimit, retry } from 'egl-utils-js';`.

See [`docs/development/local-build.md`](docs/development/local-build.md) for the full local
setup.

## Usage

Every example below is runnable as written against the published package. Root-entry
functions are pure and never mutate their inputs unless noted; `EventEmitter`, the
storage wrappers, `cookieHelper`, and `httpClient` are stateful by contract.

### Async combinators (`egl-utils-js`)

Signal-first cancellation throughout (ADR-0004): pass `{ signal }`, get `AbortError` on
abort, never a silently hung promise.

```js
import { delay, timeout, retry, parallelLimit, asyncQueue } from 'egl-utils-js';

// delay: cancellable wait
await delay(200, { signal: controller.signal });

// timeout: the operation receives the merged signal, so it can actually stop
const data = await timeout((signal) => fetch('/slow', { signal }), 5_000);

// retry: exponential backoff with full jitter
const result = await retry((signal) => fetch('/flaky', { signal }), {
  retries: 4,
  minDelay: 200,
  onAttempt: ({ attempt, error }) => console.warn(`attempt ${attempt} failed`, error),
});

// parallelLimit: bounded concurrency, order-preserving results
const pages = await parallelLimit(
  urls.map((url) => () => fetch(url).then((r) => r.json())),
  4, // at most 4 in flight
);

// asyncQueue: FIFO serial execution
const queue = asyncQueue({ signal: controller.signal });
const first = queue.push((signal) => writeThing(a, { signal }));
const second = queue.push((signal) => writeThing(b, { signal })); // runs after `first`
await queue.onIdle();
```

### Data utilities (`egl-utils-js`)

Pure — every function returns a new value and never mutates its arguments.

```js
import { deepClone, deepMerge, pick, omit, groupBy, uniq, isObject, isEmpty } from 'egl-utils-js';

deepClone({ a: [1, 2, { b: new Date() }] }); // deep copy via structuredClone

deepMerge({ a: { x: 1 } }, { a: { y: 2 }, b: 3 });
// -> { a: { x: 1, y: 2 }, b: 3 } — arrays are REPLACED, not concatenated, by default

pick({ a: 1, b: 2, c: 3 }, ['a', 'c']); // -> { a: 1, c: 3 }
omit({ a: 1, b: 2, c: 3 }, ['b']); // -> { a: 1, c: 3 }

groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? 'even' : 'odd'));
// -> Map { 'odd' => [1, 3], 'even' => [2, 4] } — a Map, not a plain object,
//    so an arbitrary key like '__proto__' is just a key, never a hazard

uniq([1, 2, 2, NaN, NaN]); // -> [1, 2, NaN]  (SameValueZero)
uniq([{ id: 1 }, { id: 1 }, { id: 2 }], (x) => x.id); // dedupe by a derived key

isObject({}); // true — plain objects only, not Date/Map/class instances
isEmpty(''); // true — also [], {}, null, undefined, empty Map/Set
```

### Validation (`egl-utils-js`)

```js
import { validateEmail } from 'egl-utils-js';

validateEmail('user@example.com'); // true — linear-time scan, no regex anywhere (NFR-05)
validateEmail('not an email'); // false
```

### Typed events (`egl-utils-js`)

```js
import { EventEmitter, debounce, throttle } from 'egl-utils-js';

/** @type {EventEmitter<{ save: { id: string }, error: Error }>} */
const bus = new EventEmitter();
const off = bus.on('save', ({ id }) => console.log('saved', id));
bus.emit('save', { id: 'abc' });
off(); // unsubscribe

const saveDraft = debounce((text) => localStorage.setItem('draft', text), 300, {
  maxWait: 2_000, // guarantees a save at least every 2s during continuous typing
});
saveDraft('draft text'); // fires ~300ms after typing stops

const onScroll = throttle((event) => updatePosition(event), 100); // at most once per 100ms
```

### Web (`egl-utils-js`)

```js
import { httpClient, urlSearchParams } from 'egl-utils-js';

const api = httpClient({
  baseUrl: 'https://api.example.test/v1/',
  auth: () => tokenStore.current(), // called per request — never cached (ADR-0007)
});
const user = await api.get('users/42', { timeout: 5_000 });
await api.post('users', { json: { name: 'Ada' } });

urlSearchParams({ q: 'a b', tag: ['x', 'y'], page: 2, empty: undefined });
// -> 'q=a+b&tag=x&tag=y&page=2' — arrays repeat the key, nullish values are skipped
```

### Crypto (`egl-utils-js`)

Web Crypto only — `Math.random` is never used, even as a fallback (ADR-0008).

```js
import { uuid, hashString } from 'egl-utils-js';

uuid(); // '36b8f84d-df4e-4d49-b662-bcde71a8764f' — RFC 4122 v4
await hashString('abc'); // 'ba7816bf...' — SHA-256 hex by default
await hashString('abc', 'SHA-512'); // SHA-256 / SHA-384 / SHA-512 only
```

### Diagnostics (`egl-utils-js`)

```js
import { measure, parseDuration } from 'egl-utils-js';

const { result, ms } = await measure(() => expensiveSort(data)); // works for sync or async fn

parseDuration('1h30m'); // -> 5_400_000 (ms). Strict grammar: h > m > s, each at most once —
parseDuration('30m1h'); //    throws DurationParseError (out of order), never returns NaN
```

### Errors (`egl-utils-js/errors`)

One base class, one stable `.code` per subtype — check identity via `.code`, never
cross-realm `instanceof` (ADR-0003).

```js
import { EglError, TimeoutError, RetryExhaustedError, HttpError } from 'egl-utils-js/errors';

try {
  await retry(() => api.get('/x'), { retries: 2 });
} catch (error) {
  if (error.code === 'EGL_RETRY_EXHAUSTED') {
    console.error(`gave up after ${error.attempts} attempts`, error.errors);
  }
}
```

### Storage & cookies (`egl-utils-js/storage`)

Browser-leaning; kept off the root entry so Node-only consumers pull none of it in.

```js
import { localStorageWrapper, sessionStorageWrapper, cookieHelper } from 'egl-utils-js/storage';

localStorageWrapper.set('profile', { name: 'Ada', tags: ['x'] }); // JSON under the hood
localStorageWrapper.get('profile'); // -> { name: 'Ada', tags: ['x'] }
localStorageWrapper.isPersistent(); // false in Node / private browsing — silent in-memory
//                                      fallback keeps working either way (ADR-0010)

cookieHelper.set('theme', 'dark', { maxAge: 60 * 60 * 24 * 365 }); // SameSite=Lax, Secure
cookieHelper.get('theme'); //                                          on HTTPS by default
cookieHelper.remove('theme'); //                                       (ADR-0011)
```

### Sanitize (`egl-utils-js/sanitize`)

Delegates to DOMPurify (optional peer dependency — install it yourself) behind a curated
deny-by-default allowlist (ADR-0012). Zero bytes and zero audit surface if you never
import this subpath.

```js
import { sanitizeHtml } from 'egl-utils-js/sanitize';

// Browser: zero configuration.
element.innerHTML = sanitizeHtml(userSuppliedHtml);

// Node: requires an explicit DOM.
import { JSDOM } from 'jsdom';
sanitizeHtml(userSuppliedHtml, { window: new JSDOM('').window });
```

See [`SECURITY.md`](SECURITY.md#sanitizehtml-non-goals) for what `sanitizeHtml`
deliberately does not cover.

## How this project is run

| Document | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | How AI agents (and humans) work in this repo — the contract. |
| [`ROADMAP.md`](ROADMAP.md) | The numbered plan and what is done. |
| [`docs/adr/`](docs/adr/) | Why it is built the way it is (Architecture Decision Records). |
| [`docs/patterns/`](docs/patterns/) | Design patterns adopted, rejected, or considered. |
| [`docs/workflow/`](docs/workflow/) | Git, documentation, release, and maintenance conventions. |
| [`CHANGELOG.md`](CHANGELOG.md) | User-visible changes per release. |
| [`SECURITY.md`](SECURITY.md) | How to report a vulnerability. |

## Milestones

| # | Title | Status |
|---|---|---|
| 1 | Project bootstrap & CI | ✅ done |
| 2 | Errors & async core | ✅ done |
| 3 | Data & validation | ✅ done |
| 4 | Events | ✅ done |
| 5 | Web, crypto & diagnostics | ✅ done |
| 6 | Storage & sanitize subpaths | ✅ done |
| 7 | Benchmarks & release readiness | ✅ done |
| 8 | Post-0.1.0 follow-ups | ⏳ planned |


## License

MIT © 2026 Daniel Polo. See [`LICENSE`](LICENSE).
