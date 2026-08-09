# egl-utils-js

> Universal JavaScript async, data, and event utilities for Node.js and modern browsers

![Status](https://img.shields.io/badge/Status-v0.9.0-blue)

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
so they run server-side too; [`tablePipeline`](#table-pipeline-egl-utils-jstable) composes
them on this same entry.

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

### Table pipeline (`egl-utils-js/table`)

Filtering and sorting *compose*, because one object owns the rows and derives one view —
`source → filters (AND) → search (OR) → sort → paginate` (ADR-0034). Stateful, but still
DOM-free: it runs unchanged on a server, and `bindTableControls` wires it to inputs.

```js
import { tablePipeline } from 'egl-utils-js/table';

const table = tablePipeline({
  source: rows,
  pageSize: 25,
  columns: [
    { key: 'name', searchable: true },
    { key: 'seen', type: 'date' },
    { key: 'score', type: 'number' },
    // Any ordering you can express, including one that reads a second field:
    { key: 'ip', compare: (a, b) => ipv4ToKey(a).localeCompare(ipv4ToKey(b)) },
  ],
});

// One event carries the derived view — the identical object `view()` returns.
const off = table.on('change', (view) => render(view.rows, view.page, view.pageCount));

table.setFilter('name', '^ada'); // the F33 grammar, or your own predicate
table.setSearch('gateway'); //     OR across the searchable columns
table.toggleSort('seen'); //       asc -> desc -> unsorted
// Neither command discarded the other: both are still in effect.

table.view();
// { rows, total, totalFiltered, page, pageCount, sort, filters, search }
table.view() === table.view(); // true — memoized until the next command

// One re-render instead of three:
table.batch(() => {
  table.setSource(freshRows);
  table.setSort([
    { key: 'seen', direction: 'desc' },
    { key: 'name', direction: 'asc' },
  ]);
  table.setPageSize(50);
});

off(); // and `emit` was never yours to call — subscribers observe, they don't announce
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

### DOM helpers (`egl-utils-js/dom`)

Browser-only by contract: every export here needs a live document and says so with a typed
`DomContractError` instead of degrading (ADR-0028). Importing the entry is safe anywhere —
the document is resolved per call — so a server render fails on *use*, with a message
naming the DOM-free alternative, rather than on import.

```js
import { bindElements, isElement } from 'egl-utils-js/dom';

// Resolve a whole markup contract in one pass, and learn what is missing:
const { elements, missing } = bindElements({
  form: '#checkout-form',
  submit: '#checkout-submit',
  total: '[data-total]',
});
if (missing.length > 0) log.warn('markup contract drifted', missing); // e.g. ['total']
elements.submit?.addEventListener('click', onSubmit);

// Or refuse to boot at all rather than limp along with half a page:
bindElements({ app: '#app' }, { strict: true }); // throws DomContractError, .missing = ['app']

// Scope lookups to a subtree — a component need not know the whole document:
bindElements({ title: '.panel-title' }, { root: panelEl });

isElement(node); // structural (nodeType + querySelector), so a node from an iframe
//                  or a second jsdom realm passes where `instanceof Element` fails
```

Binding one element at a time turns a selector typo into a `null` that travels and
resurfaces much later as *"cannot read properties of null"*, far from its cause. The
`missing` array is the point: one report, at startup, next to the contract it describes.

The returned `elements` object is a **snapshot, not a live view** — after a re-render the
nodes are different objects. For anything that re-renders, delegate instead:

```js
import { delegate, setEnabled, setVisible, setValue } from 'egl-utils-js/dom';

// ONE listener for a table that re-renders on every keystroke. Nodes come and go
// beneath it and nothing needs rebinding — no per-row bind, no teardown pass to forget.
const off = delegate(tbody, 'click', 'tr[data-id]', (event, row) => {
  openRecord(row.dataset.id); // `row` is the MATCHED element, not event.target,
}); //                            which may be a cell or an icon inside it
off(); // detach — idempotent; or pass { signal } and let an AbortSignal do it

// `focus` does not bubble, so delegation needs the capture phase:
delegate(form, 'focus', 'input', highlight, { capture: true });

// Setters: no-ops on null, so an optional element needs no guard at the call site.
setEnabled(elements.submit, form.checkValidity());
setVisible(elements.spinner, isLoading); //           drives the `hidden` attribute
setVisible(elements.panel, false, { hiddenClass: 'is-hidden' }); // that class INSTEAD

setValue(elements.name, record.name); //   text, textarea
setValue(elements.subscribed, true); //    checkbox / radio -> checked
setValue(elements.country, 'IT'); //       select -> selects that option
setValue(elements.tags, ['a', 'b']); //    multiple select
setValue(elements.name, null); //          clears, rather than writing "null"
```

`setVisible` drives **one** mechanism, never two: hide and show therefore always undo each
other, which is not true of the common hand-rolled pair that clears two mechanisms and sets
one. `setValue` dispatches **no** `input` or `change` event — a plain assignment does not
either, and synthesising one could re-enter the handler that called it; dispatch explicitly
when a listener must run.

```js
import { injectFragment, autoGrow, withUrlParams } from 'egl-utils-js/dom';
import { sanitizeHtml } from 'egl-utils-js/sanitize';

// `sanitize` is REQUIRED and has no default (ADR-0030). A sanitizing default would drag
// the DOMPurify optional peer into every /dom import; a non-sanitizing one would make the
// dangerous choice the quiet one. So the decision is yours, in code, and greppable:
await injectFragment(host, '/partials/menu.html', { sanitize: sanitizeHtml });
await injectFragment(host, '/dist/shell.html', { sanitize: false }); // trusted, and it SAYS so

// Add to the target instead of replacing it: `insertAdjacentHTML`, so existing nodes and
// their listeners survive (`innerHTML +=` would re-parse and destroy them).
await injectFragment(list, '/partials/next-page.html', {
  sanitize: sanitizeHtml,
  position: 'beforeend',
});
// A non-2xx rejects with HttpError{status, body} and every error propagates — no dialog,
// nothing swallowed — so a shell assembled from several fragments can be trusted or blamed.

const detach = autoGrow(elements.comment, { maxRows: 8 }); // grows AND shrinks: the inline
detach(); //  height is released before measuring, and detach restores the original styles

withUrlParams('/api/items?page=1', { page: 2, tag: ['x', 'y'] });
// '/api/items?page=2&tag=x&tag=y' — one `?`, ever. Pure, SSR-safe, works on relative URLs.
withUrlParams('/docs#section', { v: buildId }); // '/docs?v=abc#section' — fragment kept last
```

### UI components (`egl-utils-js/dom`)

Instance-based and framework-agnostic. Each alert owns its nodes, its timer, and its close
binding, so a page-level alert and a dialog-level one cannot cancel each other's auto-hide
or write into each other's container — the defect a static singleton guarantees
(ADR-0031). No design system is assumed: the defaults are inert BEM class names and no icon
set, and adopting a framework is one `classes` map.

```js
import { inlineAlert } from 'egl-utils-js/dom';

const alerts = inlineAlert(document.querySelector('#form-alert'));
alerts.show('success', 'Saved.', { autoHideMs: 3_000 });
alerts.show('danger', savedError.message); // textContent — markup in the message is SHOWN,
//                                            never parsed, so a stray `<` is never an XSS

// Adopt any design system by passing its names; the library never learns it exists:
const bs = inlineAlert(host, {
  classes: { base: 'alert', success: 'alert-success', close: 'btn-close' },
  icons: { success: '✓', danger: '⚠' }, // string, Node (cloned per render), or a factory
  closeLabel: 'Chiudi', // the accessible name — a glyph is not a label
});

// Rich content takes the same explicit decision as injectFragment (ADR-0030/0031):
import { sanitizeHtml } from 'egl-utils-js/sanitize';
alerts.show('info', '<b>3</b> items imported', { html: true, sanitize: sanitizeHtml });

alerts.destroy(); // removes its node, its listener, and any pending timer — an aborted
//                   `signal` does the same, and show() after destroy() throws rather
//                   than quietly doing nothing
```

`loadingOverlay` owns *when* an overlay is visible; your `onShow`/`onHide` own *what* is
visible — so one gate drives a modal, a spinner, or a bar (ADR-0032). It fixes the three
things hand-rolled overlays get wrong: a concurrent operation tearing the overlay down
early, a minimum-visible floor measured from the call instead of from the appearance, and a
hide that arrives while the overlay is still animating in.

```js
import { loadingOverlay } from 'egl-utils-js/dom';

const overlay = loadingOverlay({
  onShow: () => modal.show(),
  onHide: () => modal.hide(),
  minVisibleMs: 400, // measured from when onShow SETTLES, so an animation is not
  focus: { save: true, root: modalElement }, // counted against the overlay's own floor
});

const release = overlay.show(); // reference counted: two overlapping operations show once
try {
  await save();
} finally {
  release(); // idempotent — hides only when the LAST holder releases
}

// Same thing without the try/finally, releasing on success, rejection, and sync throw:
const user = await overlay.wrap(() => api.get('users/42'));
await Promise.all([overlay.wrap(loadA()), overlay.wrap(loadB())]); // stays up for both

overlay.isShown(); // true from the first show(), including while still appearing
overlay.destroy(); // hides now, bypassing the floor, and clears the timer
```

A failing `onShow`/`onHide` is contained: the gate returns to a consistent state and never
throws into your code — a spinner that cannot render must not fail the save it decorates
(the rule `logger` applies to a failing sink). Only `focus.save` needs a document, so the
gate's timing logic runs under Node too.

### Table controls (`egl-utils-js/dom`)

The bridge between a [table pipeline](#table-pipeline-egl-utils-jstable) and its controls
— and the only place the two halves meet. Commands flow one way, state reflects back, and
**row rendering stays yours** (ADR-0035).

```js
import { bindTableControls, delegate } from 'egl-utils-js/dom';

const unbind = bindTableControls(
  table,
  {
    filters: { name: '#f-name', status: '#f-status' }, // debounced -> setFilter
    search: '#q', //                                      debounced -> setSearch
    sortHeaders: { root: 'thead', selector: 'th[data-sort-key]' },
    pagination: { prev: '#prev', next: '#next', status: '#page' },
    pageSize: '#page-size', // a blank value ("All") stops paginating
  },
  { debounceMs: 200 },
);

// Rows are yours to render — and ONE delegated listener outlives every re-render,
// so there is no per-row rebinding to forget:
table.on('change', (view) => {
  tbody.replaceChildren(...view.rows.map(toRow));
});
delegate(tbody, 'click', 'tr[data-id]', (event, row) => open(row.dataset.id));

unbind(); // detaches every listener, cancels every pending debounce, unsubscribes
```

Sort headers receive `aria-sort` on every change and pagination buttons are enabled from
the derived view. The status text defaults to `'1 / 4'` — digits only, no language
assumed; pass `formatStatus: (view) => \`Pagina ${view.page} di ${view.pageCount}\`` for
words. Filter inputs are deliberately **not** written back: a control that rewrites the
field you are typing in fights its own user. A selector that matches nothing throws
`DomContractError` rather than binding a control that silently does nothing — omit the
binding for controls your table does not have.

### Structured logging (`egl-utils-js/logging`)

One threshold instead of a flag per severity, and every seam injected: destination
(`sink`), line shape (`format`), clock (`now`), correlation id (`id`). Stateful by
contract — a logger holds its configuration (ADR-0027).

```js
import { logger, formatLogLine, formatTimestamp, LOG_LEVELS } from 'egl-utils-js/logging';

const log = logger({ level: 'debug', name: 'checkout' });
log.info('order placed', { id: 42 }); // args stay separate, so a console still
log.debug('cart contents', cart); //     renders them as inspectable objects
log.trace('not emitted — below the threshold');

// 2026-08-06 09:30:12.007 INFO  --- [            checkout] order placed
// The level and name columns are fixed-width, and the name is cut from the LEFT, so
// the specific tail of `it.d4np.utils.checkout.PaymentService` stays aligned and legible.

const db = log.child('db'); // named 'checkout.db' — an explicit string, so it survives
db.warn('slow query'); //      minification (reflection over fn.name does not)

// A sink receives the record AND the formatter, so it chooses whether to format at all:
logger({ sink: (record) => queue.push(JSON.stringify(record)) }); // structured, no line built
logger({ sink: (record, format) => appendFile(format(record) + '\n') }); // text

// Logging never throws into your code: a dead transport, a throwing clock, a hostile
// toString — each costs that one record and is reported once via console.error.
logger({ sink: () => { throw new Error('transport down'); } }).info('still returns');

// Tests need no console spy: freeze the clock, capture the records.
const lines = [];
const test = logger({ now: () => 0, sink: (r, format) => lines.push(format(r)) });

formatTimestamp(Date.now(), { fractional: false }); // '2026-08-06 09:30:12' — no trailing dot
LOG_LEVELS; // ['trace','debug','info','warn','error','silent'] — frozen; 'silent' is a floor
```

CR and LF are collapsed to a space in the message **and** in the name and id columns, so
one record is always exactly one line — a newline arriving through an injected `id` cannot
forge a log entry (log injection).

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

### Bootstrap 5 toolkit (`egl-utils-js/bootstrap`)

**Every component in the Bootstrap 5 catalogue — all 24** (Accordion, Alerts, Badge,
Breadcrumb, Buttons, Button group, Card, Carousel, Close button, Collapse, Dropdowns, List
group, Modal, Navbar, Navs & tabs, Offcanvas, Pagination, Placeholders, Popovers, Progress,
Scrollspy, Spinners, Toasts, Tooltips) — plus `bsTable`, `bsIcon` and `bsLoadingOverlay`.
One entry, 29 named exports, each individually tree-shakeable: adopting one costs you
nothing of the rest.

Opt-in, and layered **on top of** the framework-agnostic entries — the core never imports
it, so a project on a different design system pays nothing. Bootstrap's classes are plain
strings, so the element builders keep the zero-runtime-dependency promise and work with no
peer installed at all; only the behaviour wrappers reach the optional `bootstrap` peer, and
they resolve it at the first call rather than at import. **You** supply Bootstrap's CSS and
any icon font; this toolkit emits markup and class names only.

Builders return **real DOM nodes**, never HTML strings, so caller data cannot become
markup by accident (ADR-0037):

```js
import {
  bsBadge, bsButton, bsButtonGroup, bsCloseButton,
  bsIcon, bsPlaceholder, bsProgress, bsSpinner,
  materialIconsSet,
} from 'egl-utils-js/bootstrap';

// Text is escaped on the way in — a record field containing markup is displayed, not parsed.
container.append(bsBadge(record.status, { variant: 'danger', pill: true }));

bsButton({ label: 'Save', icon: 'check-lg', onClick: save, signal: controller.signal });

// An icon-only control MUST be named — asking for one without a name is a TypeError,
// not a warning, because an unnamed button is announced as just "button" (NFR-21).
bsButton({ icon: 'trash', label: 'Delete row', labelHidden: true, variant: 'danger' });

bsIcon('gear');                                  // <i class="bi bi-gear" aria-hidden="true">
bsIcon('delete', { set: materialIconsSet });     // any icon convention, injected as data

// A progress bar is an instance, so width, aria-valuenow and text cannot drift apart:
const progress = bsProgress({ max: total, label: 'Upload', format: (v) => `${v} / ${total}` });
onChunk((sent) => progress.update(sent));

bsSpinner({ label: 'Caricamento…' });    // role="status" + a visually-hidden name
bsPlaceholder({ lines: 3 });             // skeleton block, aria-hidden by design
```

Markup requires the explicit `{ html: true, sanitize }` pair — the same contract as
`injectFragment` and `inlineAlert`, and there is deliberately no default:

```js
import { sanitizeHtml } from 'egl-utils-js/sanitize';

bsBadge('<b>3</b> new', { html: true, sanitize: sanitizeHtml });
bsBadge(trustedMarkup, { html: true, sanitize: false }); // a signed decision, not a silence
```

Every builder also takes `{ document }`, so it works inside an iframe or a server-side DOM
with no ambient global; without one, a builder that needs the ambient document throws
`DomContractError` rather than a bare `ReferenceError`.

The composites assemble those atoms — and two of them **compose the framework-agnostic
components instead of reimplementing them**, so a fix to either engine reaches both entries:

```js
import { bsAlert, bsBreadcrumb, bsCard, bsListGroup, bsPagination } from 'egl-utils-js/bootstrap';

// Slots take a string (escaped), a node, or an array of either:
container.append(
  bsCard({
    image: { src: '/cover.jpg', alt: '' },  // alt is required; '' declares it decorative
    title: order.customer,
    text: [order.summary, bsBadge(order.status, { variant: 'success' })],
    actions: bsButton({ label: 'Open', size: 'sm' }),
  }),
);

// One delegated listener survives every update() — no per-row rebinding, nothing to leak:
const list = bsListGroup(rows.map((row) => ({ content: row.name, value: row, badge: row.count })), {
  onSelect: (item) => open(item.value),
});
list.update(nextRows.map((row) => ({ content: row.name, value: row })));

// The last crumb is the current page: no link, and aria-current="page".
bsBreadcrumb([{ content: 'Home', href: '/' }, { content: 'Orders', href: '/orders' }, '4821']);

// bsAlert IS inlineAlert (F49) in Bootstrap's costume — same instance API and timers:
const alerts = bsAlert(document.querySelector('#form-alert'));
alerts.show('success', 'Saved.', { autoHideMs: 3_000 });

// bsPagination speaks the shape tablePipeline.view() already returns — no adapter:
const pager = bsPagination(footer, { onPage: (n) => table.setPage(n) });
table.on('change', (view) => pager.update(view));
```

`bsTable` is the toolkit's flagship: a complete Bootstrap table over the same
`tablePipeline` the framework-agnostic entry exposes — and it keeps that pipeline **public**,
so the facade is a shortcut rather than a ceiling.

```js
import { bsTable } from 'egl-utils-js/bootstrap';

const table = bsTable(container, {
  columns: [
    { key: 'host', label: 'Host', sortable: true },
    { key: 'ip', label: 'Address', sortable: true, align: 'end' },
    // A value that is not a primitive needs a format — the library never picks
    // a date format, or stringifies an object, on your behalf:
    { key: 'seen', label: 'Last seen', type: 'date', format: (v) => v.toLocaleString('it') },
    // A node needs no markup decision at all; { html, sanitize } opens ONE column:
    { key: 'up', label: 'State', format: (v) => bsBadge(v ? 'up' : 'down', {
      variant: v ? 'success' : 'danger',
    }) },
  ],
  data: hosts,
  pageSize: 25,
  striped: true,
  hover: true,
  responsive: true,
  rowKey: 'id',                       // stamped as data-key on each row
  empty: 'No hosts match these filters.',
  onRowClick: (row) => open(row.id),  // one delegated listener, and Enter/Space work
});

// The pipeline is the same F42 instance — commands re-render the table:
table.pipeline.setFilter('ip', '^192.168');   // the F33 filter grammar
table.pipeline.toggleSort('seen');            // asc → desc → none
table.setData(await refresh());               // = pipeline.setSource, render wired

// Already hold a pipeline (a server-rendered first page, one shared with a chart)?
// Pass it: bsTable renders it and, on destroy(), unsubscribes without tearing it down.
bsTable(container, { columns, pipeline: existing });
```

Filter, sort and page **compose** — applying one never discards the other — because the
derivation belongs to the pipeline, not to the table.

Add `controls` and the table grows the parts a user touches — a filter row, a search box,
a page-size select and a pagination bar — wired to that same pipeline through its public
commands only:

```js
const table = bsTable(container, {
  columns,
  data: hosts,
  pageSize: 25,
  controls: {
    filterRow: true,   // one box per filterable column, speaking the F33 grammar
    search: true,      // over the columns marked `searchable`
    pageSize: true,    // digits; add `{ allLabel: 'All' }` for an unpaginated choice
    pagination: true,  // the F65 numbered bar, plus a status element
    toolbar: myButtons,
  },
});

table.controls.search.focus();          // the control nodes are yours too
table.controls.filters.ip.value = '^10.'; // …though the pipeline is the honest way in
```

Every human-readable string is injectable and nothing English is rendered unasked: the
status text defaults to `'1 / 4'` (digits), page sizes are digits, and an "all" option
exists only if you supply its word. Accessible names — `Search`, `Rows per page`,
`Filter <column>` — do default to English, because a name has to be words; pass `label`
to replace them.

```js
controls: {
  search: { label: 'Cerca' },
  filterRow: { label: (column) => `Filtra ${column.label}` },
  pageSize: { options: [25, 50], allLabel: 'Tutte' },
  formatStatus: (view) => `Pagina ${view.page} di ${view.pageCount}`,
}
```

Custom filter operators belong to the pipeline, so a box speaks them without knowing they
exist:

```js
const pipeline = tablePipeline({
  source: hosts,
  columns,
  operators: { '~': (suffix) => (value) => String(value).endsWith(suffix) },
});
bsTable(container, { columns, pipeline, controls: { filterRow: true } });
// typing `~01` in a filter box now matches gw-01 and srv-01
```

Everything above needs a document and nothing else. The wrappers below drive Bootstrap's
**JavaScript**, so they need the `bootstrap` package — an **optional peer**, resolved when
you first use one and never imported, so a project that only wants a badge installs
nothing:

```js
import { bsToast, bsModal, bsLoadingOverlay } from 'egl-utils-js/bootstrap';

// Toasts stack in a container; each show builds a fresh node, so a danger toast
// and the info toast after it share no classes. Each disposes and leaves the DOM
// once hidden.
const toasts = bsToast(document.querySelector('.toast-container'));
toasts.show('Saved.');
toasts.show('Could not save.', { variant: 'danger', title: 'Error', autohide: false });

// A modal wrapper for the lifecycle, not the API: `on` returns an unsubscribe,
// and destroy() hides first, then disposes — disposing a shown dialog is what
// leaves a stuck backdrop and a scroll-locked <body>.
const modal = bsModal(document.querySelector('#confirm'));
const off = modal.on('hidden', () => form.reset());   // or 'hidden.bs.modal'
modal.show();
modal.instance();                                     // the Bootstrap object, if you need it

// A loading overlay: reference-counted, so concurrent callers cannot tear it
// down early, and held for a minimum visible time measured from when the dialog
// finished appearing — so a fast response cannot produce a flash.
const overlay = bsLoadingOverlay({ message: 'Caricamento…', focus: { save: true } });
await overlay.wrap(() => api.get('/slow'));
```

The navigation components go a step further: given items they **build** the markup,
because a navigation component's accessibility lives in the ids joining its parts —
`aria-controls`, `aria-labelledby`, `data-bs-target` — and ids are what hand-written
templates get wrong. Every one is minted against the live document, so it cannot collide
with markup that is already there:

```js
import { bsAccordion, bsTabs, bsNavbar, bsCollapse, bsDropdown } from 'egl-utils-js/bootstrap';

// An accordion, with the aria-expanded / aria-controls / aria-labelledby triangle
// written for you. Exclusivity is Bootstrap's own parent scoping.
const faq = bsAccordion(container, {
  items: [
    { header: 'What is it?', body: 'A toolkit.', open: true },
    { header: 'Why build the markup?', body: someNode },
  ],
});
faq.open(1);
faq.items[1].isShown();          // one F72 collapse wrapper per item

// Tabs: role="tablist", each trigger bound to its panel both ways, panels reachable
// from the keyboard. Arrow-key roving stays Bootstrap's Tab plugin.
const tabs = bsTabs(container, {
  tabs: [
    { label: 'Overview', pane: 'Escaped by default.', active: true },
    { label: 'Details', pane: detailsNode },
  ],
  kind: 'pills',
});
tabs.select(1);

// A navbar composes the two: its toggler is a collapse, each `children` a dropdown,
// and both are handed back rather than hidden.
const nav = bsNavbar(document.body, {
  brand: 'Acme',
  items: [
    { label: 'Home', href: '/', active: true },       // gets aria-current="page"
    { label: 'More', children: [{ label: 'Settings', href: '/settings' }] },
  ],
});
nav.collapse.hide();
```

Given no items, each manager **adopts** the markup already on the page instead — same
wiring, same teardown, and `destroy()` removes only what it built:

```js
bsAccordion(document.querySelector('#faq'));            // adopts .accordion-item markup
bsCollapse(panel, { toggler });                          // aria-expanded kept truthful
bsDropdown(document.querySelector('#actions')).update(); // reposition after a reflow
```

Overlays and observation follow the same split — an offcanvas is a wrapper, a carousel
builds, and a scrollspy does neither:

```js
import { bsOffcanvas, bsCarousel, bsScrollspy } from 'egl-utils-js/bootstrap';

bsOffcanvas(document.querySelector('#filters')).show();

// A carousel that labels its own indicators — otherwise a row of identical,
// unlabelled buttons. `alt` is what declares a slide an image, and '' is a
// legitimate declaration, so an image cannot reach the page unlabelled.
const gallery = bsCarousel(container, {
  items: [
    { content: '/harbour.jpg', alt: 'A harbour at dawn', caption: 'Genova', active: true },
    { content: '/pattern.jpg', alt: '' },        // decorative, declared
    { content: someNode },                       // not an image at all
  ],
  indicators: true,
  labels: { previous: 'Precedente', next: 'Successiva' },
});
gallery.next();
// Autoplay is off unless you ask: pass { ride: 'carousel', interval: 5000 }.

// Scrollspy marks the nav for whatever is in view. `refresh()` is the method
// worth having — it computes its targets once, so content added later is
// invisible to it until told.
const spy = bsScrollspy(document.body, { nav: '#toc', smoothScroll: true });
spy.on('activate', (event) => console.log(event.relatedTarget.hash));
```

Tooltips and popovers close the catalogue, and they are the only pair that hands content
to Bootstrap to render — so exactly **one sanitizer runs, and it is yours**:

```js
import { bsTooltip, bsPopover } from 'egl-utils-js/bootstrap';
import { sanitizeHtml } from 'egl-utils-js/sanitize';

// A plain string is text: no sanitizer runs on either side, and markup in it is
// displayed rather than parsed.
bsTooltip(button, { title: 'Save the current draft' }).show();

// Markup needs the explicit pair. Your sanitizer runs here, and Bootstrap's own
// is switched off for this content — so the profile that applies is the one you
// chose, not a second invisible one narrowing it.
const help = bsPopover(button, {
  title: '<b>Draft saved</b>',
  content: '<em>Kept locally until you publish.</em>',
  html: true,
  sanitize: sanitizeHtml,
  trigger: 'focus',
});
help.setContent({ content: 'Replaced — and the tip stays open.' });
```

These two also need **Popper**, which Bootstrap uses to position them. It is bundled in
`bootstrap.bundle.js`; with the plain build, install `@popperjs/core` too. When it is
missing you are told which package it is, not just that something is:

```js
try {
  help.show();
} catch (error) {
  error.code; // 'EGL_PEER_MISSING'
  error.peer; // '@popperjs/core' — bootstrap itself is fine
}
```

If you bundle rather than load Bootstrap from a `<script>`, there is no
`window.bootstrap` to find — pass it once:

```js
import * as bootstrap from 'bootstrap';

const modal = bsModal(element, { bootstrap });
```

Either way the failure is typed, at the call that needed it, never at import:

```js
try {
  modal.show();
} catch (error) {
  if (error.code === 'EGL_PEER_MISSING') console.error(`install ${error.peer}`);
}
```

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
| 10 | Structured logging | ✅ done |
| 11 | DOM foundation | ✅ done |
| 12 | UI components | ✅ done |
| 13 | Composable table pipeline | ✅ done |
| 14 | Bootstrap element builders | ✅ done |
| 15 | Bootstrap table manager | ✅ done |
| 16 | Bootstrap interactive wrappers | ✅ done |


## License

MIT © 2026 Daniel Polo. See [`LICENSE`](LICENSE).
