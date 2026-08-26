# ADR-0073: Bootstrap's own attribute, a preference that is not a third state, and a snippet that cannot drift

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** Daniel Polo
- **Related:** [spec 07](../specs/07_spec_application_ux.md) §2 F106–F107, §6,
  NFR-31/NFR-33/NFR-34/NFR-35; ROADMAP 20.3;
  [ADR-0071](0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md) and
  [ADR-0072](0072-a-queue-a-rule-nobody-has-to-guess-and-one-toast-per-story.md) (the `/ui`
  entry and the manager shape this is the third instance of),
  [ADR-0017](0017-platform-api-floor-gate.md) and
  [ADR-0064](0064-a-scanner-that-tokenizes-and-a-test-per-evasion.md) (the floor gate this
  amends, and the scanner that has to be able to see the amendment),
  [ADR-0010](0010-storage-in-memory-fallback-contract.md) (the F21 wrapper, and why private
  mode degrades instead of throwing), [ADR-0050](0050-the-1x-runtime-floor.md) (the Safari
  16.4 floor the `change` event is checked against),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the F52 class helper
  the control is built with, and the no-icon-font rule),
  [ADR-0049](0049-commands-throw-queries-answer.md) (commands throw, queries answer)

## Context

Bootstrap 5.3 themes off one attribute, `data-bs-theme`. F106 is explicit that this manager
uses *"Bootstrap 5.3's own mechanism, not a parallel one"* — so most of what a theme library
usually invents (a class, a CSS-variable set, a `<html data-theme>` of its own) is out of
scope by requirement, and what is left is three problems every hand-rolled theme switch has.

**"Follow the system" and "no choice yet" are the same fact, and are usually stored as
different ones.** Tracking `prefers-color-scheme` is easy. *Stopping* when the user has
expressed a preference is the half that gets forgotten, and it is why a site that remembered
your choice at 6 pm has lost it by 7, when the OS switches.

**The flash is not a polish problem.** A theme applied by a module shows one frame of the
wrong theme, every load, because the module runs after first paint. The fix has to be a
synchronous script in `<head>`, above the stylesheets — a moment no module can reach.

**A toggle usually says what the page *is*.** A control labelled "Dark" on a dark page is
ambiguous, and worst exactly where ambiguity costs most: a screen reader announces it as a
statement of fact, not an offer.

And one thing this item discovered rather than inherited: **it needs the `matchMedia` api-floor
amendment that spec 07 NFR-34 attributed to F108/F111.** "Follow the system" is a media query.
The roadmap and the M20 journal both said 20.3 needed no floor amendment; both were wrong, and
the amendment lands here.

## Decision

**1. The attribute is `data-bs-theme` and is not an option.** A configurable attribute name is
how a second mechanism starts: the moment it exists, the library owns a theming scheme beside
Bootstrap's and has to keep the two in step. `root` *is* an option — a caller may theme a
subtree — but what is written there is fixed.

**2. The preference is `'light' | 'dark' | 'auto'`, and `'auto'` is the absence of a stored
value.** `set('auto')` **removes** the key rather than storing a third state, which makes "no
choice yet" and "follow the system" literally the same condition — there is no way for the two
to disagree, because there is only one of them. `get()` answers the preference and `resolved()`
answers what is on the attribute, because a settings UI needs to know whether "System" is
selected and a component needs to know which colours to draw, and one value cannot answer
both.

**3. The preference is held in memory, with storage as its mirror.** This started as the
opposite — every read derived from storage — and a test caught it: with a storage that throws
on write (a quota failure, a blocked-cookies context), the attribute said `dark` while
`resolved()` said `light`, and the next system change would have flipped the page back. So the
value is read from storage **once**, at construction, and `set` updates memory, applies, and
*then* persists. Two consequences, both deliberate:

- **A failed persist does not undo the choice.** The theme takes effect for this page and is
  simply not remembered for the next one.
- **The `StorageError` still propagates**, after the effect. Failing to remember must not stop
  a choice taking effect, and must not be silent either; the caller learns, with the page
  already correct.

It also keeps a value components read on every render off the storage accessor.

**4. `themeSnippet()` emits the before-first-paint script rather than documenting it.** It is a
pure function — no DOM, no storage, no globals — returning JavaScript source for a server
render or a build step to inline. The reason is drift: a snippet in a README shares a storage
key and an attribute name with this module by *coincidence*, and the coincidence ends the first
time either changes. Emitting it from the same constants makes them one fact, and the suite
asserts it by running the string and comparing the result with what `createTheme` would do.

Three details in the snippet are each a frame of the wrong theme avoided: it decodes the F21
wrapper's JSON **and** accepts a bare `dark`, so a key set by other means still works; anything
that is not a theme falls through to the system query rather than being applied; and the whole
thing is in a `try`, because storage can throw on access alone in a blocked-cookies context and
a theme is never worth a page error. Interpolated values are JSON-encoded **and** have `<`
escaped, so no key can close the `<script>` early.

**5. The control names the state it will move to, and relabels itself.** Including on a system
change it did not cause — which is why the manager keeps a relabel hook per control rather than
leaving the label to the caller. Icons are the caller's nodes (ADR-0037: no icon font is
bundled, imported or assumed); with icons the label becomes the accessible name only, and
without them it is the visible text. Classes go through the F52 `applyClasses` helper rather
than a hand-rolled join, so a malformed token is a `TypeError` naming the option and there is
no second implementation of "apply these classes" to keep in step.

**6. `destroy()` stops managing and does **not** un-theme the page.** The attribute is the
page's state, not this manager's node — the opposite of the toast container, which the manager
built and therefore removes. Removing it on teardown would flash the default theme at every
navigation, which is the defect F107 exists to prevent, reintroduced from the other end.
Queries keep answering after destroy; commands throw (ADR-0049).

**7. The NFR-34 floor amendment lands here, with three entries.** `matchMedia` is added to the
scanner's policed globals — so a bare use is *visible* to the deny-by-default gate, which it
was not before — and three inventory entries are declared: `matchMedia` (Safari 5.1),
`MediaQueryList.matches` (5.1) and **`MediaQueryList.change`** (Safari **14**). The last is the
one worth checking rather than assuming: it is what makes the deprecated `addListener`
unnecessary at a 16.4 floor, and it is recent enough by this file's standards that "probably
fine" was not an answer. All three are `context`-guarded, because Node has none of them and
`/ui` is an entry a server render legitimately loads.

**8. Absence of `matchMedia` is a documented degradation, not a throw.** With no way to ask the
system, `'auto'` resolves to the `fallback` option and no tracking happens. But a seam that
returns something *unsubscribable* **is** a `TypeError` at construction: a caller-supplied fake
missing `addEventListener` is a mistake, not a host limitation, and the two must not look the
same.

**9. NFR-22 re-derived a fourth time, to 60 kB** (60 914 B). `/ui` grew 1 464 B, and
`/storage` grew **3 B without changing a line** — the theme manager persists through the F21
wrapper, so the two entries now share a chunk and esbuild re-split it.

## Alternatives Considered

- **Storing `'auto'` as a value.** Symmetrical, and it makes `get()` a plain storage read.
  Rejected: it creates two representations of one state — an absent key and a stored `'auto'` —
  which then have to agree forever, and the snippet would have to know about both before the
  manager exists.
- **Deriving the preference from storage on every read.** What the first implementation did.
  Rejected by decision 3: it makes a failed write silently revert the manager's own view, so the
  attribute and `resolved()` disagree and the next system change undoes the user's choice.
- **Documenting the `<head>` snippet in the README instead of exporting it.** No new export, and
  it is what every theme guide does. Rejected: the snippet and the manager would share a key by
  coincidence, and 421 B is a cheap price for making them share it by construction — measured,
  and the only export on `/ui` that imports nothing.
- **Subscribing to the media query only while the preference is `'auto'`.** Fewer listener-hours.
  Rejected: the subscription would itself become state to keep in step with the preference, and
  one listener whose handler asks the question is simpler to reason about — the F106 clause then
  lives in exactly one place.
- **A `prefers-color-scheme` read with no subscription at all**, resolving on each call.
  Rejected: nothing would re-apply the attribute when the OS switches, so "follows the system"
  would mean "followed the system once, at load".
- **Reverting the attribute on `destroy()`.** Tidier by the usual rule that a component undoes
  what it did. Rejected per decision 6: it reintroduces the flash at every navigation, and the
  attribute was never the manager's to own.
- **Widening the `matchMedia` inventory entry to `Window` and stopping there.** Rejected: the
  `change` event is the part with a floor worth checking (Safari 14 against `addListener`'s 5.1),
  and an entry that does not name it would pass the gate while telling a reader nothing.

## Consequences

- **The public surface goes from 128 exports to 130** — `createTheme` and `themeSnippet` — with
  **no new `exports`-map path**. NFR-31's additive-only clause holds.
- **The floor gate can now see `matchMedia`**, which is a small permanent improvement beyond
  this item: any future bare use anywhere in the library is checked rather than invisible.
- **20.4 and 20.6 inherit the amendment.** F108's `BreakpointObserver` and F111's
  reduced-motion helper need exactly these three entries and now find them declared; what they
  still owe is their own decisions, not the floor work.
- **`/ui` now depends on `/storage`.** Free for a bundler consumer (1 464 B), and 4 612 B plus
  two extra requests for a deep-ESM page, because that route downloads whole files. Reusing the
  F21 wrapper is a spec requirement and the right call; it is also the clearest example on the
  F87 table of one decision costing two consumers very differently, which is why that table
  exists.
- **The before-first-paint claim is asserted in a browser**, on three engines, by reading the
  attribute *and* the computed background inside the first `requestAnimationFrame` — because
  "the attribute was set" and "the frame was right" are different claims, and only the second
  is what F107 promises.
- **One documentation error is corrected**: ROADMAP 20.4 and the M20 journal both said the
  `matchMedia` amendment belonged to 20.4. It belonged to whichever item first needed a media
  query, which was this one.

## References

- [spec 07](../specs/07_spec_application_ux.md) §2 F106–F107, §6, NFR-33/NFR-34/NFR-35.
- [spec 05](../specs/05_spec_browser_distribution.md) NFR-22, re-derived here a fourth time.
- BCD: `api.Window.matchMedia` (Safari 5.1), `api.MediaQueryList.matches` (5.1),
  `api.MediaQueryList.change_event` (**Safari 14**) — looked up by the gate rather than typed
  here.
- `src/test/browser/ui-theme.spec.js` — the first-paint assertion, which has no jsdom
  equivalent.
