# Software Specification: Application UX — Dialogs, Notifications, Theme & Accessibility (JavaScript (ES2023))

> Seventh-wave contract for `egl-utils-js` (milestone M20). Frozen once accepted: diverging
> implementation updates this spec in the same PR or adds an ADR superseding the relevant
> section. Functional numbering continues the global sequence
> ([`01_spec_utils.md`](01_spec_utils.md) owns F1–F25,
> [`02_spec_core_extensions.md`](02_spec_core_extensions.md) owns F26–F41,
> [`03_spec_dom_ui_table.md`](03_spec_dom_ui_table.md) owns F42–F51,
> [`04_spec_bootstrap_toolkit.md`](04_spec_bootstrap_toolkit.md) owns F52–F81,
> [`05_spec_browser_distribution.md`](05_spec_browser_distribution.md) owns F82–F87,
> [`06_spec_table_data.md`](06_spec_table_data.md) owns F88–F100): this document owns
> **F101–F111** and **NFR-31–NFR-36**.
>
> **Two ceilings bind this wave before any of it is written**, and §3 settles both. That is
> the reason this planning document exists rather than the first item discovering it.

## 1. Objective & Business Context

The catalogue is finished. Spec 04 delivered all 24 Bootstrap 5 components and spec 06 gave
the table the ergonomics a user expects from one. What none of them delivered is the layer an
application actually writes on top: **behaviour that outlives a single component**.

Three concrete shapes, taken from the triage in
[ADR-0046](../adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md):

- **A dialog is a question, and a question has an answer.** `bsModal` opens and closes a
  dialog. Every application then writes the same twenty lines around it: wire the confirm
  button, wire the cancel button, wire Escape and the backdrop, remember which element had
  focus, put it back, and resolve *something* to the code that asked. That code is identical
  every time and wrong in a different way every time — usually the focus half, which nobody
  notices until somebody navigates by keyboard.
- **A notification is a stream, not an event.** `bsToast` shows a toast. An application that
  toasts on every save needs a **queue**: a cap on how many are visible, a rule for the
  duplicate that arrives twice, a way to update the one already on screen rather than stack a
  second beside it, and a way to say "this promise is running / it worked / it failed" as one
  thing rather than three.
- **A preference is state, and state has a lifetime.** A theme, a viewport breakpoint and a
  reduced-motion setting are all read by many components, changed rarely, and expected to
  survive a reload. Each is currently the application's problem, and each has one classic
  failure: the theme flashes light before the script runs, the breakpoint is re-derived by
  every component that cares, and the motion preference is consulted by none of them.

**What this wave is not.** ADR-0046's triage rejected a `ResponsiveController` (conditional
mount by viewport is application logic), a `MotionManager` (an animation-preset system is
design-system territory), and global/theme *configuration* layers — because module-level
mutable state is precisely what spec 01 §4 forbids. Those rejections stand; §3 NFR-35 states
the rule they follow from.

## 2. Functional Requirements

### Dialogs — `egl-utils-js/ui`

- F101 **Promise-based dialogs.** `confirm` and `prompt` equivalents, plus a general form
  taking caller-supplied content, each returning a **promise that resolves with the answer**.
  Built on the F70 modal wrapper, so Bootstrap's own open/close behaviour, backdrop and
  animation are inherited rather than reimplemented.
- F102 **A dismissal is an answer, not an error.** Escape, the backdrop, the close control and
  the cancel control all **resolve** — with the negative result for a confirm, with `null` for
  a prompt — and never reject. A rejected promise means the dialog could not be *asked*
  (no document, the peer missing), which is a different fact and must stay distinguishable.
  Exactly one settlement per dialog, whatever combination of dismissals races.
- F103 **Focus is restored to where it came from.** The element focused when the dialog opened
  is focused again when it settles, and focus is trapped inside the dialog while it is open —
  both through the F109 primitives rather than a second implementation. A dialog that leaves
  focus on `<body>` has stranded every keyboard user at the top of the page.

### Notifications — `egl-utils-js/ui`

- F104 **A toast queue with a visible cap.** A manager over the F69 toast wrapper holding a
  queue, a maximum number visible at once, and admission rules: **dedupe** (an identical
  message already showing is not shown twice) and **update-by-id** (a toast already on screen
  is updated in place rather than joined by a second). What "identical" means is part of the
  contract, not left to the reader.
- F105 **A promise reads as one notification.** A helper taking a promise and the three
  messages — pending, resolved, rejected — that shows one toast and *transitions* it, rather
  than three toasts that tell a story out of order. The promise's own settlement is passed
  through untouched: the helper observes, it does not swallow.

### Preferences — `egl-utils-js/ui`

- F106 **Theme get / set / toggle, over `data-bs-theme`.** Bootstrap 5.3's own mechanism, not
  a parallel one. Reading, setting and toggling the document's theme; tracking the system
  preference (`prefers-color-scheme`) and following it while the user has expressed no
  choice; persisting an expressed choice through the F21 storage wrapper, so private mode
  degrades instead of throwing.
- F107 **No flash, and a control to flip it.** A synchronously-runnable snippet documented for
  the `<head>`, so a persisted theme is applied **before first paint** — the defect that makes
  every hand-rolled theme switch flash light for one frame — plus a toggle-control builder
  whose accessible name reflects the state it will move to, not the state it is in.
- F108 **Breakpoint observation.** `matchMedia` over Bootstrap's own breakpoint names with a
  subscribe API and a current-value read, so a component asks once and is told when it
  changes, instead of every component re-deriving the same query. Needs an api-floor
  amendment (NFR-34).

### Accessibility primitives — `egl-utils-js/dom`

- F109 **A reusable focus trap and focus save/restore.** Extracted from the F50 overlay, which
  already contains a correct implementation that nothing else can reach, and made a primitive
  in its own right: trap focus within a root, restore it on release, and behave when the root
  contains no focusable element at all — the case that turns a trap into a lock.
- F110 **A live-region announcer.** A polite/assertive announcer that makes a change audible
  to a screen-reader user without moving focus. This closes a gap ADR-0069 named rather than
  hid: a column moved by F100's keyboard path is announced to nobody today, and every
  component in this wave has the same need.

### Motion — `egl-utils-js/dom`

- F111 **One reduced-motion query point.** A single helper components consult for
  `prefers-reduced-motion`, with a subscribe API on the same shape as F108. A helper, not a
  manager: ADR-0046 rejected an animation-preset system and this does not smuggle one in.

## 3. Non-Functional Requirements

- NFR-31 **Additive-only (hard).** As NFR-25 for the previous wave, and now over a larger
  frozen surface: this wave changes **no** existing export signature, option name, error code
  or `exports`-map path. The 123 exports at v1.2.0 keep their names and their meanings. A new
  entry is an addition to the exports map, which is minor; new `EGL_*` codes are additions
  ADR-0003 already classifies as minor. **Mechanically proved** by the same before/after
  surface inventory (§6).
- NFR-32 **The `/bootstrap` entry clause is not stretched — this wave goes elsewhere.**
  Measured at v1.2.0: `/bootstrap` is **24 406 B** against
  [ADR-0041](../adr/0041-a-peer-looked-up-not-imported.md)'s 25 kB clause, leaving **594 B**.
  Two of this wave's items alone wrap components that measure 1 266 B (`bsModal`) and 2 473 B
  (`bsToast`); the wave does not fit and no amount of care makes it fit. The clause is also
  not the wrong size — ADR-0041 sized it *for the finished catalogue*, and the catalogue is
  finished. **F101–F108 therefore land on a new entry** rather than inside a ceiling written
  for something else, and §4 states the boundary that keeps the two entries distinguishable.
- NFR-33 **NFR-22's artifact ceiling is re-derived, not raised by fiat.** The single-file
  artifact carries the *whole* public surface (spec 05 F83), so a new entry lands in it
  wherever it lives: at **38 911 B against a 40 kB ceiling** there are 1 089 B, and this wave
  needs several times that. Spec 05 derived 40 kB as *the sum of the ten measured entry
  figures*, an upper bound on a deduplicated single file. That derivation has an eleventh
  input now. The implementing wave **recomputes it by the same method and records the
  arithmetic**; raising the number without redoing the derivation is the one thing this
  clause forbids. Until the recomputation lands, the artifact gate stands as it is.
- NFR-34 **Platform-API floor amendments are explicit (hard).** As NFR-28. This wave expects
  `matchMedia` and the `change` event on a `MediaQueryList` (F108, F111), plus whatever the
  focus primitives need beyond what F50 already declares. Each is a deliberate ADR-0017
  inventory decision with a BCD floor checked against the Safari 16.4 / Node 22 matrix, not a
  reference added and noticed later.
- NFR-35 **No module-level mutable state (hard).** Every manager in this wave is an
  **instance the caller owns and can destroy**, never a module singleton: two toast managers
  on one page do not share a queue, and two theme managers do not fight over one attribute.
  This is spec 01 §4's rule, it is why ADR-0046 rejected global configuration layers, and it
  is the rule ADR-0031 already applied to `inlineAlert` for exactly the reason that bites
  here — the second instance is the one that breaks.
- NFR-36 **Operable and announced (hard).** Every interactive surface in this wave is
  keyboard-operable and carries an accessible name, as NFR-21 has required since spec 04 —
  and this wave adds the second half: a state change a sighted user can see is announced to a
  screen-reader user through F110. A dialog that traps focus but never says it opened, or a
  toast that appears silently, fails this clause.

## 4. Logical Architecture & Core Algorithm

**The entry boundary.** `/bootstrap` **builds** components: given data and options, return
nodes or an instance that wraps one Bootstrap component's lifetime. The new entry
**orchestrates** them: state that outlives any one component — a queue, a pending promise, a
persisted preference, a media query — expressed as an instance the caller owns.

That boundary is testable rather than aesthetic: a symbol belongs on the new entry if it
would still make sense with a different component library underneath. A toast *queue* would;
`bsBadge` would not.

The two accessibility primitives and the motion helper go to **`/dom`** instead, because they
need no component library at all: F109 already exists inside the F50 overlay, and F110 and
F111 are a live region and a media query. Putting them behind a Bootstrap-flavoured entry
would make a consumer take a component catalogue to announce a message.

**Composition, not reimplementation** — the rule ADR-0038 and ADR-0040 established and this
wave inherits. F101 is the F70 modal wrapper with a promise around it; F104 is the F69 toast
manager with a queue in front of it; F103 is F109 called twice. Where a capability already
exists inside something else, this wave *extracts* it rather than writing a second one, and
F109 is the named case: the correct focus trap is in the overlay today and unreachable.

**What the first item owes an ADR.** Two shapes remain defensible for the dialog surface — a
free function per dialog kind, or a manager instance that mints them — and the choice
interacts with NFR-35. As spec 06 F88–F91 deferred its mechanism to
[ADR-0062](../adr/0062-a-sibling-not-a-wrapper.md), F101–F103 fix the **observable contract**
here and defer the shape to an ADR in the implementing item. The same applies to the new
entry's **name**, which §5 records as a proposal rather than a freeze.

## 5. Public Interface

New, SemVer-protected once shipped. Names are **indicative** where §4 defers the shape; what
is contractual is the set of capabilities and their error model.

- **A new entry** for F101–F108 — proposed `egl-utils-js/ui`, and deliberately proposed
  rather than frozen here: an `exports`-map path is MAJOR-protected the moment it ships, so
  the name is the implementing PR's decision to make with an ADR, under the §4 boundary. It
  is a normal subpath in every other respect: named exports only, `sideEffects: false`,
  peers resolved at first use and failing typed when absent (ADR-0041), and both no-bundler
  routes carry it (spec 05).
- **On `egl-utils-js/dom`**: the focus primitives (F109), the announcer (F110) and the
  reduced-motion helper (F111).
- **Error model**, continuing ADR-0003: argument and shape violations are `TypeError`s naming
  the option; a missing `bootstrap` peer is the existing `EGL_PEER_MISSING`; a missing
  document is the existing `EGL_DOM_CONTRACT`. **A dismissed dialog is not an error** (F102),
  and a rejected wrapped promise (F105) is passed through with its own identity intact —
  neither gets a new code, because neither is this library failing.
- **Unknown option keys are rejected** on every new bag, per ADR-0047.

## 6. Verification & Test Strategy

- **F101–F103 (dialogs)** — unit tests for each settlement path, and specifically for the
  **races**: Escape while the confirm handler runs, a second dismissal after the first, a
  `destroy()` mid-dialog. Exactly-one-settlement is asserted by counting, not by observing the
  value. Browser tests on three engines for focus restoration, because "where focus went" is a
  question jsdom answers differently from an engine.
- **F104–F105 (toasts)** — unit tests for admission (dedupe, update-by-id, the cap) and a
  **property test** over randomised arrival sequences asserting the invariant the cap exists
  for: never more than *n* visible, and never a queued toast that is never shown. F105 is
  asserted for pass-through in both directions — the caller's resolution value and the
  caller's rejection reason arrive unchanged.
- **F106–F107 (theme)** — unit tests over an injected storage and an injected `matchMedia`;
  the no-flash snippet is tested as documented, by loading a fixture page with a persisted
  theme and asserting the attribute is already correct at first paint. That is a browser
  assertion by construction: "before first paint" has no meaning in jsdom.
- **F108, F111 (media queries)** — unit tests over an injected `matchMedia` fake covering
  subscribe, current value and teardown; one browser test per helper that the real
  `MediaQueryList` is wired, since the fake proves the logic and only an engine proves the
  wiring.
- **F109–F110 (a11y primitives)** — unit tests for trap, release and the empty-root case;
  browser tests for real tab order on three engines. F110 is additionally asserted to leave
  focus **unmoved**, which is the whole point of a live region and the easiest thing to get
  wrong.
- **NFR-31 (additive-only)** — the before/after public-surface inventory, as NFR-25.
- **NFR-33 (artifact ceiling)** — the recomputed derivation is committed with its arithmetic
  in `tools/transfer-budgets.js`, in the form spec 05 used originally, so the new number is
  auditable against the same method rather than asserted.
- **NFR-35 (no module state)** — a test constructing **two** managers of each kind on one page
  and asserting they do not observe each other. This is the test ADR-0031 wishes had existed
  before the static-singleton alert it replaced.
