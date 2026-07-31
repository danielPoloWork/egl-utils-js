# ADR-0017: Verifying the platform-API floor — BCD data plus a deny-by-default inventory

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §3 NFR-07, ADR-0004 (`anySignal`), ADR-0008 (`#webcrypto`), ADR-0014 (rejecting a metric that measured the wrong thing), ROADMAP 7.6 (which found the defect), ROADMAP 8.1

## Context

The v0.1.0 readiness review (7.6) found that `AbortSignal.timeout` — added in **Safari 16.0** —
was called unconditionally while NFR-07 declares **Safari ≥ 15.4** supported. `timeout()` and
`httpClient()` were therefore broken on a browser the spec promises, and had been for six
milestones.

The defect is uninteresting; **how it survived is the problem.** Every other NFR has a gate.
NFR-07's browser clause had only the Playwright suite, and Playwright runs **one recent build
per engine** — it can never exercise an old Safari, so this entire class of defect was
structurally invisible. A verification blind spot, not an oversight.

## Decision

### Rejected first: `eslint-plugin-compat`

The obvious candidate, and it was tried rather than assumed. Configured with a `browserslist`
resolving to 34 targets including `safari 15.4`, with the probe file confirmed linted (ESLint's
JSON formatter reported 1 file, 0 messages, 0 suppressed), it reported **nothing** for
`AbortSignal.timeout`, `Object.groupBy`, `checkVisibility`, `ResizeObserver`, or
`navigator.clipboard`. Its rule coverage simply does not include them.

Adopting it would have produced a **green gate that checks nothing** — precisely the
false-confidence failure ADR-0014 rejected when vitest's `rme` looked like a noise estimate
while measuring the wrong noise. A gate that cannot fail on the defect it exists for is worse
than no gate, because it stops anyone looking.

(A secondary problem confirmed the choice: `eslint-plugin-compat@7` requires Node ≥ 22, and the
last version compatible with both the Node 18 floor and ESLint 9 is 6.x.)

### Adopted: MDN browser-compat-data as the source of floors, plus a deny-by-default inventory

The plugin's *rules* were the weak part; the *data* is authoritative and machine-readable.
`@mdn/browser-compat-data` records `api.AbortSignal.timeout_static` → safari 16 and
`api.structuredClone` → safari 15.4. So `tools/check-api-floor.mjs` reads BCD directly and adds
the part a linter cannot: an explicit inventory (`tools/api-floor-inventory.js`) of every Web
platform API the library touches, enforced in **both** directions.

Three checks, all of which must pass:

1. **Every inventory entry resolves to a real BCD path.** A typo fails, so the inventory cannot
   quietly stop checking something.
2. **Every entry whose floor is newer than the support matrix must be `guarded`**, naming the
   fallback that covers the gap. Floors are looked up in BCD, never hand-typed — a hand-typed
   version is exactly the kind of claim that rots (the defect 7.4 found in ADR-0013).
3. **Deny-by-default over the source.** A platform global referenced in `src/main` but absent
   from the inventory **fails**. This is what makes it a gate rather than documentation: a newly
   introduced API cannot ship unrecorded, which is the exact failure mode 7.6 uncovered.

### `guardReason` distinguishes two kinds of guard

An early draft flagged `crypto.subtle`'s and `crypto.randomUUID`'s guards as *obsolete*, purely
because Safari 15.4 meets their version floor. That was the checker being wrong: those guards
exist because the APIs are only exposed in a **secure context**, which BCD cannot express as a
version at all.

So each guarded entry declares **why**:

- `version` — the BCD floor is newer than the matrix. The checker validates the guard is still
  needed and *warns* if the floor has since caught up (a stale guard is either dead code or a
  wrong reason).
- `context` — availability depends on something BCD does not model (a secure context, a DOM
  being present). Accepted, never called stale.

A `guarded` entry with no `guardReason` is a hard failure, so the distinction cannot be skipped.

### Scope boundary

This gate covers **Web platform APIs**, where the version risk lives. ES language features are
governed by `tsconfig`'s `target`/`lib` and esbuild's `target: es2022`; Safari 15.4 supports
ES2022, so they are not re-checked. Stating the boundary matters: a gate whose coverage is
unclear invites the same false confidence as one that checks nothing.

`chrome`/`firefox` are deliberately absent from the matrix — NFR-07 asks only for the last two
evergreen versions there, which nothing in this library approaches. **Safari is the binding
constraint**, and Node is the runtime floor.

## Consequences

- **Proven non-vacuous on three distinct failure modes**, not asserted: removing the
  `AbortSignal.timeout` guard reproduces the original 7.6 defect and exits 1; adding an
  un-inventoried `queueMicrotask()` call to the source exits 1; a typo'd BCD path exits 1.
- 21 APIs are inventoried. Two are version-guarded (`AbortSignal.timeout`, `AbortSignal.any`),
  five context-guarded (`crypto.randomUUID`, `crypto.subtle`, `document.cookie`, and the two
  storage objects), and fourteen are within the matrix unguarded.
- The gate also produced a useful by-product: a **readable, evidence-backed statement of the
  library's platform requirements**, generated from MDN data rather than folklore.
- It runs in the existing `consistency` job (BCD lookups and a source scan; no browsers), so no
  new CI job and no meaningful time cost.
- **Maintenance:** `@mdn/browser-compat-data` will report new floors as it updates, which is the
  point — but a BCD update *could* turn a previously-green entry red. That is a true signal
  (MDN corrected its data or a range changed), not a flake, and the failure names the entry.
- A residual gap remains and is stated rather than papered over: this verifies **API
  availability**, not **behavioural** differences between engine versions. An API present on
  Safari 15.4 but subtly different there would still pass. Closing that needs real old-Safari
  runs (a device farm), which is out of proportion for this library.

## Alternatives considered

- **`eslint-plugin-compat`** — rejected on evidence; see above.
- **Hand-maintained version numbers in the inventory** — simpler, no dependency, and it rots.
  The 7.4 finding (documentation asserting a pin the manifest did not have) is this project's
  own precedent for why derived beats declared.
- **Only an inventory, without the source scan** — pure documentation. It would not have caught
  7.6's defect, because the defect was a *newly used* API nobody recorded.
- **Only the source scan, without BCD** — would catch new APIs but could not say whether one is
  actually below the floor, so every addition would need a manual lookup.
- **A real old-Safari device farm** — the only way to catch behavioural divergence, and wildly
  disproportionate here. Recorded as the residual gap instead.
- **Raise NFR-07's floor to Safari 16 and delete the fallback** — would have made the original
  defect disappear by narrowing the promise. That is the owner's call, and it remains open
  (7.6 §1.1); this gate is useful either way, since it enforces *whatever* floor is declared.
