# egl-utils-js

> Universal JavaScript async, data, and event utilities for Node.js and modern browsers

![Status](https://img.shields.io/badge/Status-v0.2.0-blue)

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
import { httpClient, urlSearchParams, createResource } from 'egl-utils-js';

const api = httpClient({
  baseUrl: 'https://api.example.test/v1/',
  auth: () => tokenStore.current(), // called per request — never cached (ADR-0007)
});
const user = await api.get('users/42', { timeout: 5_000 });
await api.post('users', { json: { name: 'Ada' } });

urlSearchParams({ q: 'a b', tag: ['x', 'y'], page: 2, empty: undefined });
// -> 'q=a+b&tag=x&tag=y&page=2' — arrays repeat the key, nullish values are skipped

// One REST collection, six methods, one line. The client is a PARAMETER, never an
// import (ADR-0025): any object with get/post/put/patch/delete works — httpClient, a
// test double, another library's client — so this costs 505 B, not the 1.3 kB facade.
const users = createResource(api, 'users');
await users.list({ page: 2, tag: ['x'] }); // GET  users?page=2&tag=x
await users.get(42); //                       GET  users/42
await users.create({ name: 'Ada' }); //       POST users
await users.update(42, { name: 'Ada L.' }); //PUT  users/42
await users.remove(42, { timeout: 5_000 }); //DELETE users/42 — per-call options pass through
// An id is data: it is encoded as exactly ONE segment, so `../admin` addresses a key
// with that name and can never widen the path. A null/undefined id throws.
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
import { measure, parseDuration, formatDuration, normalizeError } from 'egl-utils-js';

const { result, ms } = await measure(() => expensiveSort(data)); // works for sync or async fn

parseDuration('1h30m'); // -> 5_400_000 (ms). Strict grammar: h > m > s, each at most once —
parseDuration('30m1h'); //    throws DurationParseError (out of order), never returns NaN

formatDuration(5_400_000); // -> '1h30m' — the exact inverse; the round-trip is a property test
formatDuration(ms); // takes measure()'s fractional ms; truncates, so under a second is '0s'

// A catch block receives `unknown`. This makes it loggable without losing it:
try {
  await api.get('/users');
} catch (error) {
  log.error(normalizeError(error)); // { name: 'HttpError', message, status: 503, detail, cause }
  throw error; //                      `cause` is the original, so rethrow is lossless
}
normalizeError('boom'); // { name: 'String', message: 'boom', cause: 'boom' } — never throws,
//                         whatever it is handed: primitives, null, symbols, hostile getters
```

### Package version (`egl-utils-js`)

`VERSION` is a meta export, outside the 25 numbered functional items — kept in lockstep
with `package.json` (ROADMAP 8.2, ADR-0018), for consumers that need the version at
runtime (diagnostics, telemetry, support requests).

```js
import { VERSION } from 'egl-utils-js';

VERSION; // -> '0.1.0'
```

### Text shaping (`egl-utils-js/text`)

Pure string helpers that measure in UTF-16 code units — the unit `String.length` reports —
and never emit a lone surrogate (ADR-0019). Its own entry, so nothing here reaches the
root bundle.

```js
import { truncate, wrapText, fixedWidth } from 'egl-utils-js/text';

truncate('The quick brown fox', 10); // 'The quick…' — marker counts toward the budget
truncate('short', 10); // 'short' — unchanged, so truncate is idempotent
truncate('/very/long/path/file.txt', 12, { position: 'start' }); // '…th/file.txt'

wrapText('the quick brown fox jumps', 10); // 'the quick\nbrown fox\njumps'
wrapText('supercalifragilistic', 8, { breakLongWords: true }); // splits the long word;
//                                       by default a long word overflows its own line

fixedWidth('INFO', 8); // 'INFO    ' — exactly 8 code units, always
fixedWidth('42', 6, { align: 'right', pad: '0' }); // '000042'
fixedWidth('com.example.Service', 12, { truncate: 'start' }); // 'mple.Service'
```

### Tabular query primitives (`egl-utils-js/table`)

The three operations every data table needs before it needs a table. Pure and Node-safe,
so they run server-side too; the spec-03 table pipeline will compose them on this entry.

```js
import { compileFilter, comparator, paginate } from 'egl-utils-js/table';

// A filter box compiles on every keystroke — the grammar is total, so a
// half-typed expression is a valid program, never an exception (ADR-0021).
const matches = compileFilter('>=100');
rows.filter((row) => matches(row.amount));

// text | =text | !=text | ^prefix | suffix$ | >n >=n <n <=n
// =null | =empty | =blank  (and !null / !empty / !blank) — the sentinels nest
compileFilter('^192.168')('192.168.1.10'); // true
compileFilter('!blank')('   '); // false
compileFilter('')(anything); // true — an empty filter filters nothing

// Custom operators plug into the same grammar, sharing its normalization:
compileFilter('~50', {
  operators: {
    '~': (operand, { toNumber }) => (value) => Math.abs(toNumber(value) - toNumber(operand)) <= 10,
  },
});

// A total order in every mode: blanks are pinned to one end regardless of
// direction, mixed types order by type then value, text collates naturally.
rows.sort(comparator({ type: 'number', direction: 'desc' }));
['item 10', 'item 9'].sort(comparator({ locale: 'en' })); // ['item 9', 'item 10']

paginate(rows, { page: 99, pageSize: 25 });
// { items, page: 4, pageCount: 4, total: 100 } — the page is clamped, not rejected
```

### IPv4 & CIDR (`egl-utils-js/net`)

Strict by design (ADR-0020): four decimal octets, no leading zeros, none of the legacy
`inet_aton` forms that different parsers resolve differently. Invalid content returns
`null` — only a wrong argument *type* throws.

```js
import {
  isIpv4,
  parseIpv4,
  formatIpv4,
  ipv4ToKey,
  ipv4FromKey,
  subnetMaskFromPrefix,
} from 'egl-utils-js/net';

isIpv4('192.168.1.10'); // true
isIpv4('192.168.01.10'); // false — a leading zero is ambiguous (octal elsewhere)
isIpv4('127.1'); // false — shorthand form

parseIpv4('192.168.1.10'); // [192, 168, 1, 10]
formatIpv4([192, 168, 1, 10]); // '192.168.1.10' — exact inverse

// Fixed-width keys sort as addresses, not as strings:
ipv4ToKey('192.168.1.10'); // '192168001010'
ipv4FromKey('192168001010'); // '192.168.1.10'
addresses.sort((a, b) => ipv4ToKey(a).localeCompare(ipv4ToKey(b)));

// A prefix key is a literal prefix of the key, so containment is startsWith:
ipv4ToKey('192.168.1.10').startsWith(ipv4ToKey('192.168', { octets: 2 })); // true

subnetMaskFromPrefix('/24'); // '255.255.255.0' — '/24', '24', and 24 are interchangeable
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
import {
  localStorageWrapper,
  sessionStorageWrapper,
  cookieHelper,
  pageSessionId,
} from 'egl-utils-js/storage';

localStorageWrapper.set('profile', { name: 'Ada', tags: ['x'] }); // JSON under the hood
localStorageWrapper.get('profile'); // -> { name: 'Ada', tags: ['x'] }
localStorageWrapper.isPersistent(); // false in Node / private browsing — silent in-memory
//                                      fallback keeps working either way (ADR-0010)

cookieHelper.set('theme', 'dark', { maxAge: 60 * 60 * 24 * 365 }); // SameSite=Lax, Secure
cookieHelper.get('theme'); //                                          on HTTPS by default
cookieHelper.remove('theme'); //                                       (ADR-0011)

pageSessionId(); // a v4 UUID that survives reloads, dies with the tab, differs per tab —
//                  for correlating logs and telemetry within one browsing session.
//                  A correlation id, NOT a credential: unauthenticated and readable by
//                  any script on the page (ADR-0024). Where storage is blocked it falls
//                  back to memory, so it is stable only for the realm — never throws.
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
| 8 | Post-0.1.0 follow-ups | ✅ done |
| 9 | Text, net & query utilities | ✅ done |
| 10 | Structured logging | ⏳ planned |


## License

MIT © 2026 Daniel Polo. See [`LICENSE`](LICENSE).
