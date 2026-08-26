# Software Specification: The Form Engine — Binding, Validation & Submission (JavaScript (ES2023))

> Eighth-wave contract for `egl-utils-js` (milestone M21). Frozen once accepted: diverging
> implementation updates this spec in the same PR or adds an ADR superseding the relevant
> section. Functional numbering continues the global sequence
> ([`01_spec_utils.md`](01_spec_utils.md) owns F1–F25,
> [`02_spec_core_extensions.md`](02_spec_core_extensions.md) owns F26–F41,
> [`03_spec_dom_ui_table.md`](03_spec_dom_ui_table.md) owns F42–F51,
> [`04_spec_bootstrap_toolkit.md`](04_spec_bootstrap_toolkit.md) owns F52–F81,
> [`05_spec_browser_distribution.md`](05_spec_browser_distribution.md) owns F82–F87,
> [`06_spec_table_data.md`](06_spec_table_data.md) owns F88–F100,
> [`07_spec_application_ux.md`](07_spec_application_ux.md) owns F101–F111): this document
> owns **F112–F125** and **NFR-37–NFR-44**.
>
> **This wave exists behind a frozen non-goal.** Spec 04 §1 excludes "a form-validation
> framework". §1 supersedes that clause and states exactly what replaced it — and what did
> not, which is most of what the phrase usually means.
>
> **It is also the first wave authored after the 1.0 surface contracts.** ADR-0047, ADR-0048
> and ADR-0049 are rules now, not observations, and §3 NFR-39 binds this wave to them
> explicitly — because a fresh subsystem is exactly where a second vocabulary grows.

## 1. Objective & Business Context

Every application built on this library ends up writing the same form code, and
[ADR-0046](../adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)'s triage
called it **the largest adopted gap**. The library has 133 exports across 11 entries and not
one of them answers "what did the user type".

The gap is specific, and it is not "validation":

- **The read half of the DOM seam is missing.** `setValue` (F45) already writes a native
  control correctly — it branches on checkbox, radio, single and multiple select, so a caller
  never touches `.checked` or `.selectedOptions` by hand. There is no `getValue`. So the
  write path is a one-liner and the read path is a hand-rolled loop over
  `form.elements` in every application, with the same four bugs each time: an unchecked
  checkbox that reports `undefined` instead of `false`, a number input that reports `''`
  instead of `null`, a radio group read from whichever member came first, and a multiple
  select that reports one value.
- **Validation is native *and* insufficient, and everyone picks one.** HTML already knows
  `required`, `type="email"`, `pattern`, `min`, `max`, and the browser already renders a
  message for them. What it cannot express is "these two dates must be in order", "this
  username is free — ask the server", or "this is a warning, not a block". So applications
  either ignore the platform and re-declare every rule in JavaScript, or use the platform and
  bolt the rest on beside it, and then the two layers disagree about whether the form is
  valid.
- **A submit is a lifecycle that nobody owns.** Disable the button, show a spinner, guard the
  double click, await the request, map the server's 422 body onto the right fields, re-enable
  on failure, keep focus somewhere sensible. This is where the security-relevant code lives —
  a server's error payload is untrusted input on its way to the DOM — and it is currently
  written from scratch per form, per application.
- **"Are there unsaved changes" has no answer.** Dirty state means "differs from what was
  loaded", and nothing tracks the baseline, so the guard either does not exist or fires on
  every form the user merely looked at.

**What supersedes the spec 04 §1 non-goal, and what does not.** That clause was written to
keep a *framework* out of a utilities library, and it was right. This wave supersedes it for
one bounded thing — an engine over native controls, composed and destroyable like every other
instance here — and leaves the rest of the phrase intact.

**Scope boundaries (deliberate non-goals of this wave):** a schema language — rules are
plain functions, and a caller who wants a schema library uses one and hands the engine its
verdicts; field-controller widgets (ADR-0046 §9–§14/§16 deferred these, and they attach *to*
this contract rather than arriving with it); framework bindings of any kind; a string
catalogue with pluralization (still the ADR-0046 §55 policy — Intl primitives plus injected
wording); server-side validation or any transport of its own (the engine composes an injected
client, the F38/ADR-0025 rule); reactive state (still a spec 03 §1 non-goal); auto-discovery
of forms from `data-*` attributes (still an ADR-0046 §4/§59 rejection — ambient auto-init
inverts explicit composition); and file *upload* mechanics beyond putting a `File` into a
`FormData` (progress, chunking and retry are an application's, or a later wave's).

## 2. Functional Requirements

### Value binding — the contract the rest of the wave builds on

- F112 **A form is bound, not scraped.** A factory over a caller-supplied root — a real
  `<form>` or any container — returning an **instance the caller owns and destroys**, which
  knows its fields by name. Field discovery is explicit or declared, never ambient
  (non-goals, above): the caller either passes a field map in the `bindElements` (F43) shape
  or opts in to reading `form.elements`, and in both cases the resolved set is
  inspectable. A name that matches no control is reported at construction, the way F43's
  strict mode reports a missing element, rather than surfacing later as an `undefined` value.
- F113 **The read half, and a write that is honest about events.** `getValues()` answers with
  a plain object; the coercion rules are **contract, not implementation detail** — an
  unchecked checkbox is `false`, a checkbox group is an array of the checked values, a radio
  group is one value or `null`, an empty `type="number"` is `null` and never `NaN` or `''`, a
  `multiple` select is always an array, a file input yields its `File` list and is read-only.
  `setValues()` writes through F45 and therefore **does not synthesise `change`** — the F45
  rule, restated here because a form is where it matters: a programmatic write is not a user
  edit, so it does not trigger change-driven validation, and re-validating after a write is
  an explicit call. A key in the object that names no field is a `TypeError` naming it
  (ADR-0047's rule, extended to a data map — a silent no-op on `setValues({emial: x})` is the
  same defect the ADR removed from options bags).
- F114 **Two serializations that agree.** `toJSON()` and `toFormData()` over the same resolved
  values, with the same names — `FormData` because that is what a multipart upload and a
  classic POST need, JSON because that is what an API wants. Where the two cannot agree the
  divergence is documented, not silently resolved: `FormData` has no `null` and no boolean, so
  the mapping of an empty number and an unchecked checkbox into it is stated in the contract.
- F115 **Reset means "back to what was loaded", and says so.** The instance snapshots its
  values at construction, exposes an explicit re-baseline for "the save succeeded, this is the
  new clean state", and `reset()` restores that snapshot. This is deliberately **not**
  `HTMLFormElement.reset()`, which restores the markup's `value` attributes — a different
  thing that is almost never what the caller meant, and the confusion is called out in the
  documentation rather than left as a surprise.

### Validation

- F116 **Rules are functions, sync or async, per field or across fields.** A rule receives the
  value and a read-only view of the form, and returns nothing for "fine" or a finding. A
  cross-field rule **declares the fields it depends on**, which is what makes F118's
  incremental validation possible: without a declared dependency the engine would have to
  re-run everything on every keystroke or guess.
- F117 **Severity is a level, not a boolean.** `error`, `warning` and `info`, with exactly one
  rule attached: **only `error` blocks submission**. A warning that blocks is a bug the user
  cannot escape, and a blocking condition dressed as a warning is worse. The result of
  validating is a value the caller can read — per field and for the form — not merely a
  boolean and a side effect.
- F118 **Incremental, abortable, latest-wins.** Validation runs on demand, and optionally on
  change and on blur; validating one field re-runs that field's rules and the cross-field
  rules that declared it, and nothing else. Async rules take the ambient `signal`, and a
  **stale async result never overwrites a newer one** — the same latest-request-wins
  discipline F88 established for remote table data, for the same reason: a user typing
  produces overlapping asks whose answers arrive out of order.
- F119 **The platform's own constraints are read, not re-declared.** The engine reads
  `ValidityState` and folds native failures into the same finding shape as its own rules, so
  `required` and `type="email"` stay in the markup where a no-JavaScript submit still honours
  them. A rule's message is pushed back into the platform through `setCustomValidity`, so the
  browser's native bubble and the engine can never disagree about a field. Whether the native
  bubble is *shown* is the caller's option; whether the two layers agree is not.

### Presentation

- F120 **The engine emits findings; a class map renders them.** The engine itself is
  design-system-neutral and takes an **injected class and slot map**, exactly as `inlineAlert`
  (F49/ADR-0031) does — and for the identical reason: a hardcoded `is-invalid` makes adopting
  the engine mean adopting Bootstrap. The **Bootstrap costume** is then a frozen map plus a
  thin wrapper supplying `is-invalid`/`is-valid`, `invalid-feedback`/`valid-feedback`,
  `was-validated` and the `aria-invalid`/`aria-describedby` wiring — the `bsAlert` shape
  (ADR-0038), not a second implementation. §4 states where each half lands and NFR-38 states
  what constrains it.
- F121 **A failed submit is announced and reachable, not merely red.** On a blocked submit,
  focus moves to the first field with an `error`, and a summary is announced through the F110
  live region. Findings reach the DOM as **text**; markup requires the explicit
  `{html, sanitize}` pair (F52's rule, no exception here). A red border that a screen-reader
  user cannot perceive and a keyboard user cannot reach is not a validated form.

### Submission

- F122 **Submit is a lifecycle with one entry.** One call that validates, refuses on `error`,
  marks the form busy, disables what the caller nominated and restores exactly that on
  settlement, awaits the caller's own handler, and reports the outcome. The **double-submit
  guard is structural**: while a submission is in flight a second call returns the *same*
  promise rather than starting a second request — a refusal would leave the caller writing
  the guard the engine exists to own. `beforeunload`-style navigation during a submit is the
  application's call, not the engine's.
- F123 **A server's errors land on fields, and the payload is untrusted.** An injected mapper
  turns an `HttpError` (F16/ADR-0007) body into field findings, with a documented default for
  the common `{errors: {field: message}}` shape. Two rules make this safe rather than
  convenient: a field name from the server that matches **no** control becomes a form-level
  finding instead of being dropped — silently discarding a server's complaint is how a user
  is told "something went wrong" with no idea what — and every message crosses into the DOM
  as text under F121. This is the wave's one new trust boundary (NFR-42).

### Dirty and touched

- F124 **Dirty and touched are different questions, and both are answered.** *Dirty* is
  "differs from the F115 baseline"; *touched* is "the user has interacted with this". Per
  field and for the form. They are different because the useful behaviours need different
  ones: an unsaved-changes guard wants dirty, and "do not show me an error for a field I have
  not filled in yet" wants touched.
- F125 **An unsaved-changes guard that admits what it cannot control.** A `beforeunload`
  registration for the browser's own navigation (an api-floor amendment, NFR-40), attached
  only while the form is dirty and detached on teardown — plus an explicit check the
  application calls before an **in-app** route change, which is the case `beforeunload` cannot
  see and where the F101 dialogs can ask a real question. The documentation states plainly
  that the browser's own dialog wording is not ours to choose and that the guard is
  best-effort by the platform's design.

## 3. Non-Functional Requirements

- NFR-37 **Additive-only (hard).** As NFR-31 before it: this wave changes **no** existing
  export signature, option name, error code or `exports`-map path. The **133 exports across
  11 entries** at v1.2.0 keep their names and their meanings. A new entry is an addition to
  the exports map (minor); new `EGL_*` codes are additions ADR-0003 already classifies as
  minor. **Mechanically proved** by the before/after surface inventory (§6).
- NFR-38 **The Bootstrap costume does not get to assume it fits `/bootstrap`.** Measured at
  v1.2.0: `/bootstrap` is **24 527 B** against
  [ADR-0041](../adr/0041-a-peer-looked-up-not-imported.md)'s **25 kB** entry clause, leaving
  **473 B**. The F120 costume is a frozen class map plus a thin wrapper and *may* fit —
  `bsAlert` is the precedent and it is small — but "may" is not a plan. The implementing item
  **measures it before choosing**, and if it does not fit, the costume lands with the other
  Bootstrap-flavoured orchestration and the recorded reason is *the ceiling*, not the
  layering. What this clause forbids is discovering the number after the code is written, and
  raising ADR-0041's clause to absorb it: that clause was sized for the finished catalogue,
  and the catalogue is still finished.
- NFR-39 **The 1.0 surface contracts bind this wave (hard).** This is the first large new
  surface authored after them, so they are restated as obligations rather than assumed:
  - **ADR-0047** — an unknown own-enumerable key in any options bag is a `TypeError` naming
    it, on every new bag; and F113 extends the same rule to `setValues`' field map.
  - **ADR-0048** — one word, one meaning. `label` is what the user sees and `ariaLabel` is the
    accessible name; a duration carries the `Ms` suffix; several named strings travel in a
    `labels` map. A validation subsystem is full of words this wave must not redefine —
    `message`, `label`, `reset`, `value`, `error`.
  - **ADR-0049** — commands throw after `destroy()`, queries answer, `destroy()` is
    idempotent, `show`/`hide`/`toggle` return `void`, and every instance bound to a node
    exposes `element`. `getValues()` on a destroyed form answers; `submit()` throws.
- NFR-40 **Platform-API floor amendments are explicit (hard).** As NFR-34. The floor is
  **Safari 16.4 / Node 22** over **52 inventoried APIs**, and this wave expects several that
  are **not** among them: `FormData` and its iteration, `HTMLFormElement.elements`,
  `HTMLFormElement.requestSubmit`, `HTMLInputElement.setCustomValidity`, `ValidityState` and
  its members, and `Window.beforeunload`. Each is a deliberate ADR-0017 inventory decision
  with a BCD floor checked against that matrix — not a reference added and noticed by the gate
  afterwards.
- NFR-41 **No module-level mutable state (hard).** As NFR-35, and this wave is where it bites
  hardest: two forms on one page — the classic case being a filter form beside an edit form in
  a dialog — share no baseline, no dirty flag, no in-flight submission and no `beforeunload`
  registration. Spec 01 §4's rule, and ADR-0031's lesson: the second instance is the one that
  breaks.
- NFR-42 **Untrusted payloads are text (hard, security).** F123 maps a server-controlled body
  onto the DOM, which is a **new trust boundary** for this library: until now every string a
  component rendered came from the caller. It reaches nodes through `textContent` unless the
  caller passes the `{html, sanitize}` pair (NFR-19/ADR-0030/ADR-0037), a server-supplied
  field name is matched against the resolved field set rather than used as a selector, and the
  implementing PR **updates `docs/security/threat-model.md`** in the same PR (AGENTS.md §7 —
  a new untrusted input is exactly the trigger).
- NFR-43 **Budgets are measured, then pinned — including the derived one.** Per-entry rows are
  pinned at measured + ~7% per the house rule. The global artifact stands at **44 390 B**
  against a gate row of 45.3 kB and NFR-22's clause **re-derived to 62 kB at 20.6** (the
  sum-of-measured-entry-figures method read 61 938 B), so there is **17 610 B** of clause
  headroom — enough that this wave does not need a re-derivation to *pass*. It needs one
  anyway if it adds an entry: the derivation's input set gains a twelfth term, and the method,
  not the number, is what NFR-33 protected. Recompute it by the same arithmetic and commit the
  arithmetic.
- NFR-44 **Operable and announced (hard).** As NFR-36. Every surface this wave adds is
  keyboard-operable and carries an accessible name; every state change a sighted user can see
  is announced through F110 (F121). The wave's own worst failure mode is a form that is
  visibly invalid and silently invalid at the same time.

## 4. Logical Architecture & Core Algorithm

**Three layers, and the middle one is the point.**

1. **Primitives on `/dom`.** F45's `setValue` already exists there and F113's read half is its
   missing twin. If the read half is a general-purpose helper — "what is this control's
   value" — it belongs beside its sibling on `/dom`, not inside a form engine, for the same
   reason F109 was extracted from the F50 overlay: a correct implementation nothing else can
   reach is a defect with a delay.
2. **The engine.** Design-system-neutral, transport-neutral, framework-neutral: values,
   rules, findings, lifecycle, baseline. It imports no component library and no HTTP client —
   the mapper and the submit handler are injected (the F38/ADR-0025 rule), so the engine
   composes `httpClient` for a caller who uses it and costs nothing to a caller who does not.
3. **The costume.** Bootstrap's class names, supplied to the engine's F120 map.

**The costume is the `bsAlert` shape, and that resolves the layering question.** The
temptation with an "adapter" is a Bootstrap-aware engine behind a neutral name. ADR-0031 and
ADR-0038 already settled this pattern for `inlineAlert`/`bsAlert`: the engine takes an
injected class map, the Bootstrap export is a **frozen constant plus a thin call**, and a fix
to the engine reaches both without either drifting. F120 is that pattern applied a second
time, which is why this wave adds no new architectural idea — only a new subject.

**Where the engine's entry lands is a decision with a measured constraint, not a preference.**
`/dom` is **7 774 B** and deliberately small (spec 07 §4 put the agnostic primitives there
precisely to keep a consumer from taking a component catalogue to announce a message); a
multi-kilobyte engine would change what that entry is. `/bootstrap` is out for the engine by
layering and nearly out by arithmetic (NFR-38). `/ui` at **9 529 B** is the orchestration
entry, which fits the engine's *role* but not its neutrality — `/ui` composes `/bootstrap`
today. So the shape this spec fixes is: **the engine on its own entry, the costume with the
Bootstrap-flavoured code, the general-purpose read primitive on `/dom`** — and, as spec 07 did
for `/ui`, the **names are proposals** (§5), because an `exports`-map path is MAJOR-protected
the moment it ships.

**What the first item owed an ADR, and how it was answered.** Two shapes were defensible for
the engine's surface — one instance owning the whole form, or a small family of composable
pieces that a caller assembles. The first is what an application wants; the second is what
NFR-02's shakeability rewards, since a filter form needs values and neither validation nor
submission. 21.1 chose the **family, composed by injection**: `createForm` owns values, and
21.2/21.4/21.5 are factories that *take* a form instance, the way `bindTableControls` takes a
pipeline (ADR-0025, ADR-0077). F112–F125 fixed the **observable contract** here; the shape and
the entry name were the implementing item's to settle, on the precedent of
[ADR-0062](../adr/0062-a-sibling-not-a-wrapper.md) and ADR-0071.

## 5. Public Interface

New, SemVer-protected once shipped. Names are **indicative** where §4 defers the shape; what
is contractual is the set of capabilities and their error model.

- **A new entry** for the engine — **`egl-utils-js/forms`**, proposed here and **fixed by
  [ADR-0077](../adr/0077-a-subject-entry-a-primitive-that-stayed-one-and-a-family-not-a-god-object.md)
  in 21.1**, which also records why `/dom` and `/ui` were the wrong homes and what the split
  cost in served bytes. A *subject* entry, the shape `/table` and `/net` already are. A normal subpath in every other respect: named exports only,
  `sideEffects: false`, no bare specifier at module scope, both no-bundler routes carrying it
  (spec 05), and its own measured budget row.
- **On `egl-utils-js/dom`**: the F113 read primitive — **`getValue`, and it is one**
  (ADR-0077): 280 B beside the `setValue` it completes, against 1 840 B for the entry that
  would otherwise have been the only way to reach it. The only part of this wave that touches
  an existing entry.
- **The Bootstrap costume** (F120) on `/bootstrap` if NFR-38's measurement allows, otherwise
  on `/ui` with the ceiling recorded as the reason.
- **Error model**, continuing ADR-0003 and the boundary ADR-0047 wrote down — `EGL_*` for what
  can happen at runtime, platform errors for what the programmer got wrong:
  - argument, option and field-name violations are `TypeError`s naming the option or key
    (F113, NFR-39);
  - a missing document is the existing `EGL_DOM_CONTRACT`; a missing `bootstrap` peer, where
    the costume needs one at all, is the existing `EGL_PEER_MISSING`;
  - **a form that fails validation is not an error.** F122 reports a blocked submit as an
    outcome the caller reads, and F102's precedent governs: a rejected promise means the form
    could not be *submitted*, which is a different fact and must stay distinguishable;
  - a server's rejection keeps its own identity — an `HttpError` passed to the F123 mapper is
    reported, not re-wrapped into something that loses its `status` and `body`;
  - whether an async rule that *throws* is a finding or a failure is a contract question, and
    the implementing ADR answers it explicitly rather than by whatever `try/catch` happens to
    wrap it.
- **Unknown option keys are rejected** on every new bag (ADR-0047), and unknown field names on
  every field map (F113).

## 6. Verification & Test Strategy

- **F112–F115 (binding)** — unit tests per control kind, and specifically the four coercions
  §1 names as the recurring bugs: unchecked checkbox, empty number, radio group, multiple
  select. A **property test** over randomised value objects asserting the round-trip invariant
  — `setValues(v)` then `getValues()` returns `v` for every value the contract admits — which
  is the assertion that catches a coercion asymmetry no example test will. F115 is asserted
  against `HTMLFormElement.reset()` behaving differently, so the documented divergence is
  pinned by a test rather than by prose.
- **F116–F119 (validation)** — unit tests for each severity and for the blocking rule (only
  `error` blocks); cross-field dependency tests asserting that validating one field re-runs
  exactly the rules that declared it and no others, by counting invocations; and for F118 the
  **race** tests, which are the ones that matter: two overlapping async validations settling
  out of order, an abort mid-rule, and a `destroy()` with a validation in flight. Latest-wins
  is asserted by observing the *final* state after a deliberately inverted settlement order.
  F119 is tested against a real `ValidityState` in the browser suite, since jsdom's constraint
  validation is a simulation.
- **F120–F121 (presentation)** — unit tests over an injected class map proving the engine
  emits no Bootstrap name of its own, and the costume tested as the `bsAlert` precedent is:
  the same engine, one map, both paths asserted. F121 needs the browser suite for focus
  placement on a blocked submit (jsdom answers "where did focus go" differently from an
  engine) and asserts the announcement leaves focus **unmoved** where it is only an
  announcement.
- **F122–F123 (submission)** — the double-submit guard asserted by identity: two calls, one
  promise, one handler invocation. Disable-and-restore asserted to restore *exactly* what it
  disabled, including a control the caller had already disabled itself — the classic
  off-by-one of this pattern. F123 gets a **negative-path corpus**: an `HttpError` body whose
  message contains markup, whose field name matches nothing, whose shape is wrong entirely,
  and whose field name looks like a selector. Each asserted for text-only insertion and for a
  reported rather than dropped finding.
- **F124–F125 (dirty, touched, guard)** — unit tests for the dirty/touched split against the
  baseline and its re-baselining; teardown asserted to detach the `beforeunload` registration,
  which is a leak test as much as a behaviour test (NFR-15).
- **NFR-37 (additive-only)** — the before/after public-surface inventory, as NFR-25/NFR-31.
- **NFR-39 (the 1.0 contracts)** — the ADR-0047 unknown-key assertion on every new bag and on
  the field map; the ADR-0049 lifecycle assertions (a command after `destroy()` throws with
  the standard sentence, a query answers, `destroy()` twice is a no-op) applied to every new
  instance, since a new subsystem is exactly where a fresh exception would be introduced.
- **NFR-41 (no module state)** — two forms constructed on one page, asserted not to observe
  each other: independent baselines, independent dirty flags, independent in-flight
  submissions, and one form's `destroy()` leaving the other's guard attached.
- **NFR-42 (trust boundary)** — the F123 corpus above, plus the threat-model update reviewed
  as part of the PR rather than as a follow-up.
- **NFR-43 (budgets)** — the new entry's row measured and pinned; if an entry is added, the
  NFR-22 derivation recomputed by spec 05's method with its arithmetic committed in
  `tools/transfer-budgets.js`, in the form 20.5 and 20.6 used.
