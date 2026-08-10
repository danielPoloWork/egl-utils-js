# ADR-0047: An unknown option key is a `TypeError` — and the destructuring is the schema

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Daniel Polo
- **Related:** ROADMAP 17.7, filed by the
  [v1.0.0 readiness review](../releases/v1.0.0-readiness-review.md) §2.1;
  [ADR-0003](0003-error-taxonomy-stable-codes.md) (why this is a `TypeError` and not an
  `EglError`), [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the
  shared builder contract this extends, and the "measured shared floor" precedent),
  [ADR-0030](0030-sanitize-is-a-required-parameter.md) and
  [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md) (the fail-fast
  posture this completes), [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md),
  [ADR-0022](0022-comparator-total-order-semantics.md),
  [ADR-0024](0024-page-session-id-scope-and-budget.md),
  [ADR-0027](0027-logging-formatter-sink-split.md) (the four budget exceptions this
  amends with new measured figures)

## Context

The 17.1 readiness review measured the surface a 1.0 is about to freeze and found **52
option typedefs behind 110 exports**, none of which rejected a key it did not know:

```js
bsBadge('x', { varient: 'danger', pil: true });
// → <span class="badge text-bg-secondary">x</span>   — both typos simply gone
```

Three things make that worth a decision rather than a shrug.

**It contradicts the posture the rest of the library keeps.** `/dom` fails fast rather than
degrading (ADR-0028). `injectFragment` makes `sanitize` a required parameter (ADR-0030).
`{ html: true }` without a sanitizer throws. An icon-only button with no accessible name
throws, and `bsButton`'s own JSDoc says why: *"a warning in a console nobody reads would
ship it."* Every builder already validates the options it **does** know, naming the option
in the message. Unknown keys were the one hole left, and the hole is the loudest possible
place for silence: the caller believes they configured something.

**The silence compounds a drift the same review found.** Auto-dismiss is `autoHideMs` on
the alerts and `autohide`/`delay` on `bsToast` (review §2.3, filed as 17.8). A caller who
learns one and applies it to the other gets a toast that ignores it and hides on
Bootstrap's default instead — no warning, no throw, wrong behaviour. **Strictness has to
land before the 17.8 renames**, or those renames turn working code into silently
mis-configured code instead of a `TypeError` naming the key that moved.

**It cannot be added later.** Code that passes an unknown key "works" today, so a 1.x that
started rejecting one would break consumers, and a 2.0 is what the 1.0 exists to avoid.
This is a decision with an expiry date.

Against all that stands a real argument for silence: an ignored key keeps a caller's config
object **forward-compatible** — passing next version's option to this version degrades
instead of crashing. And a third route exists: reject in development, ignore in production.

## Decision

**An unknown own-enumerable key in any options bag is a `TypeError` naming it.** Applied
across all 52 bags, at every entry, including nested bags (`bsToast.show`,
`inlineAlert.show`, `loadingOverlay.focus`) and the `cookieHelper` attribute bags, where
the message says *attribute* rather than *option*.

**The accepted set is the destructuring pattern, not a list.** Each function destructures
what it implements with a rest element, and a shared helper asserts the rest is empty:

```js
const { variant = 'secondary', pill = false, positioned = false, ...rest } = options;
const common = commonOptions(rest, api);   // strips class/document/html/sanitize, rejects the rest
```

`commonOptions` (content builders) and `commonNodeOptions` (builders that render no caller
content, so accept no `{html, sanitize}` pair) split off the shared F52 contract keys and
return them in exactly the shape `resolveDocument`, `applyClasses` and `renderContent`
already read — so no builder signature or helper signature changed to accommodate the
check.

**Development-only strictness is rejected.** A library that must work with no bundler and
no `process.env` (spec 05's whole premise) has no reliable development signal, so the
"middle route" would in practice mean *no* check where consumers actually ship, plus two
behaviours to document and test.

**The message names the first unknown key, not all of them.** A deliberate limit: this
function is linked into every entry, and listing every key costs every consumer bytes to
save one re-run of a build that already failed.

**It is a `TypeError`, not an `EglError`.** ADR-0003's taxonomy is for operational failures
a caller can branch on; a typo is a programming error, is not recoverable, and matches how
every other argument violation in this library is reported (~280 sites). The boundary is now
written down: **`EGL_*` codes for what can happen at runtime, platform errors for what the
programmer got wrong.**

**The escape hatch stays open.** Where a caller legitimately needs something this library
does not model, the typed channel is unchanged: `bootstrap` on every behaviour wrapper
(vendor config), `operators` on `compileFilter`, `classes` on the alert engine. Strictness
closes the accidental door, not the deliberate one.

**Scope boundary:** *option bags*, not caller-supplied **descriptor** shapes — table column
definitions, carousel/accordion/navbar items, control configs. Those are read by key too and
deserve the same rule; they are filed as **17.13** rather than folded in, because the
descriptor shapes are per-item and their validation lives on a different code path.

### What it cost, measured

Verified by three cases in this repository's own code and tests, all of them previously
silent and all found the moment the check existed:

| Where | What was being dropped |
|---|---|
| `bsTable` → `bsPagination` | the whole controls config spread in, including `status`/`statusClass`, which are not pager options |
| node-safety suite → `bsAlert` | `{ document }`, which `bsAlert` has never accepted |
| node-safety suite → `bsPagination` | `{ document }`, likewise |

The byte cost is a **shared floor**, the same phenomenon ADR-0037 measured for the F52
contract: the helper is linked once per entry, so a single-function import carries all of it
and the whole-entry rows barely move. **Seventeen of the 98 size rows re-baselined** to
measured + ~3%; the figures below are each row's recorded landing measurement, where its
name carried one, against the measurement taken in this PR:

| Row | Recorded → now | Clause |
|---|---|---|
| root full import | 5806 → **5914 B** (+108) | inside NFR-01's 6 kB ceiling |
| `/bootstrap` entry | 19163 → **19805 B** | inside the 20.5 kB row and ADR-0041's 25 kB clause |
| `/storage` full import | 2027 → **2106 B** (+79) | NFR-01 divergence 2.1 → **2.15 kB** |
| `single: bsCloseButton` | 763 → **835 B** (+72) | inside NFR-17's 1.2 kB |
| `single: comparator` | 1006 → **1067 B** (+61) | NFR-08 exception 1.05 → **1.1 kB** |
| `single: logger` | 1361 → **1462 B** (+101) | NFR-08 exception 1.45 → **1.5 kB** |
| `single: httpClient` | **1371 B** | NFR-01 exception 1.35 → **1.4 kB** |
| `single: compileFilter` | **1010 B** | **new named NFR-08 exception at 1.03 kB** — ten bytes over the 1 kB clause, all of it this check |

(The `/bootstrap` entry figure also carries M16's own growth since that row was last
re-baselined; the entry's slack is what makes the per-function floor affordable.)

The four amended exceptions and the one new one are amended in spec 01 NFR-01 and spec 02
NFR-08 in this PR, by the mechanism those clauses already define (a named, measured
exception row documented ADR-0015-style). No component or builder clause moved: every
NFR-12 and NFR-17 ceiling still holds on the measured figure.

## Alternatives Considered

- **Keep ignoring unknown keys (the status quo).** Rejected: it is the only silent failure
  mode left in a library that otherwise refuses to build the broken thing, and the 17.8
  renames would inherit it. The forward-compatibility argument is real but weak here —
  consumers pin a version range, and "silently did nothing" is a worse answer than a throw
  for an option the caller believed was live.
- **A declarative per-function key schema** validated by one shared checker — the
  *Specification* pattern (compose predicates to validate an object). Rejected on two
  counts: a hand-maintained array of names **drifts from the implementation** the first time
  an option is added and nobody updates the list, and the names would be string literals
  that survive minification, where a destructuring rest element compiles away. Recorded in
  the patterns catalogue under *Rejected*.
- **Reject in development, ignore in production.** Rejected: see above — no reliable
  development signal on the bundler-free path this library commits to serving.
- **A `strict: false` opt-out option.** Rejected: it makes the safety property optional
  exactly where it is needed, adds an option to all 52 bags to police the other options,
  and would itself be MAJOR-protected at 1.0.
- **Name every unknown key in one message.** Measured at ~25 B per import and seven more
  rows to re-baseline, three of them clause amendments. Rejected as a bad trade for one
  saved re-run.

## Consequences

- The option surface has a spell-checker. `bsBadge('x', { varient: 'danger' })` now says
  `bsBadge: unknown option 'varient'` instead of returning a grey badge.
- **Breaking**, deliberately and in the window built for it: code passing a key this library
  does not model now throws. The remedies are named — drop the key, or route a vendor option
  through `bootstrap`.
- The 17.8 renames become diagnosable: a moved option name surfaces as a `TypeError` naming
  the key rather than as configuration that quietly stopped applying.
- Every future options-taking export inherits the rule, and the contract suite
  (`option-keys.test.js`) sweeps **every** entry point, so one added without the check fails
  the build rather than shipping the hole again.
- Cost: one rest element and one call per function, a shared helper per entry, and the
  seventeen re-baselined rows above. Four documented budget exceptions grew by 12–71 B and
  one new named exception exists.
- The own-enumerable boundary is documented: a key inherited from a prototype is invisible
  to the check **and** to the destructuring it complements, so the two can never disagree.

## References

- [v1.0.0 readiness review](../releases/v1.0.0-readiness-review.md) §2.1 (the finding), §2.3
  (the vocabulary drift that makes silence expensive), §6 (the item it filed).
- `src/main/javascript/it/d4np/utils/option-keys.js` — the helper and the rule.
- `src/test/javascript/it/d4np/utils/option-keys.test.js` — the per-entry sweep.
- Spec 01 §3 NFR-01 and spec 02 §3 NFR-08 — the amended budget clauses.
