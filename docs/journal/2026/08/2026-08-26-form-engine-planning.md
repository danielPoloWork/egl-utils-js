# 2026-08-26 — Planning the form engine (spec 08, M21)

## What got done

- **[`docs/specs/08_spec_form_engine.md`](../../specs/08_spec_form_engine.md)** authored — the
  eighth-wave contract, owning **F112–F125** and **NFR-37–NFR-44**.
- **M21's five items refined** in `ROADMAP.md` against the spec's F numbers (never
  renumbered, per the ADR-0046 rule for a provisional wave), the milestone intro rewritten
  around what the spec settles, and a Spec 08 coverage section added to the map.
- No code, no ADR, no changeset. A planning PR fixes the contract; the implementing items own
  their decisions.

## What the spec had to settle before anything is written

**The frozen non-goal.** Spec 04 §1 excludes "a form-validation framework". Spec 08
supersedes it for one bounded thing — an engine over native controls, an instance the caller
owns and destroys — and leaves the rest of the phrase standing: no schema language, no field
widgets, no framework bindings, no reactive state, no `data-*` auto-discovery. The precedent
is spec 06 F100 superseding spec 03's drag-and-drop clause: the new spec declares it, the old
spec's text is left alone.

**The gap is not "validation".** Naming it that way is what makes people reach for a
framework. Written out, it is four separate absences, and the first one is the surprise:
**the read half of the DOM seam does not exist.** F45's `setValue` already writes a native
control correctly — checkbox, radio, single and multiple select — and there is no `getValue`
anywhere in 133 exports. So the write path is a one-liner and the read path is a hand-rolled
loop over `form.elements` in every application, with the same four coercion bugs each time
(unchecked checkbox `undefined`, empty number `''`, radio group read from the first member, a
`multiple` select reporting one value). F113 makes those four coercions **contract**, and §4
asks whether the read primitive belongs beside its twin on `/dom` — the F109 lesson, where a
correct implementation nothing else could reach was a defect with a delay.

**The "adapter" is a word that hides a layering question.** 21.3 said "Bootstrap adapter", and
the tempting reading is a Bootstrap-aware engine behind a neutral name. The house already
settled this shape twice: `inlineAlert` takes an injected class map (ADR-0031) and `bsAlert`
is a frozen constant plus a thin call (ADR-0038). F120 is that pattern a second time, so this
wave adds no new architectural idea — only a new subject. Worth stating explicitly, because
the spec that does not say it invites the version that hardcodes `is-invalid`.

**F123 is the library's first untrusted-payload path.** Until now every string a component
rendered came from the caller. Mapping a server's error body onto fields makes the payload
untrusted input on its way to the DOM, so NFR-42 puts the `threat-model.md` update inside the
item rather than after it, and F123 states the two rules that make it safe rather than
convenient: text-only insertion, and a server field name that matches no control **reported**
rather than dropped. Silently discarding a server's complaint is how a user gets "something
went wrong" with no idea what.

## The measured constraints, taken before the code exists

| Thing | At v1.2.0 | Consequence for M21 |
|---|---|---|
| `/bootstrap` | 24 527 B against ADR-0041's 25 kB clause — **473 B left** | The F120 costume *may* fit; NFR-38 forbids assuming it, and forbids raising the clause to absorb it |
| `/dom` | 7 774 B, deliberately small | A multi-kilobyte engine would change what that entry is |
| `/ui` | 9 529 B | Fits the engine's role, not its neutrality — `/ui` composes `/bootstrap` |
| global artifact | 44 390 B against NFR-22's clause re-derived to 62 kB at 20.6 | **17 610 B** of headroom, so no re-derivation is needed to *pass* — but a twelfth entry adds a term to the sum, and the method is what NFR-33 protected |
| api floor | 52 inventoried APIs, Safari 16.4 / Node 22 | `FormData`, `HTMLFormElement.elements`/`requestSubmit`, `setCustomValidity`, `ValidityState`, `beforeunload` are all **absent** — each an explicit ADR-0017 decision |

## The judgement calls

- **The entry name is a proposal, not a freeze.** `egl-utils-js/forms` is written as
  indicative, exactly as spec 07 wrote `/ui`: an `exports`-map path is MAJOR-protected the
  moment it ships, so the name is the implementing PR's decision with an ADR. What the spec
  freezes is the *boundary test* and the observable contract.
- **The composition shape is deferred, with the tension named.** One instance owning the whole
  form is what an application wants; a shakeable family (binder, validator, submitter) is what
  NFR-02 rewards, since a filter form needs values and neither validation nor submission.
  21.1 owes that ADR — the ADR-0062/ADR-0071 precedent for deferring a mechanism while fixing
  a contract.
- **NFR-39 exists because this is the first large surface after the 1.0 contracts.** A
  validation subsystem is full of words the library has already given single meanings —
  `message`, `label`, `value`, `reset`, `error` — so ADR-0047, ADR-0048 and ADR-0049 are
  restated as obligations rather than assumed, with §6 asserting them per new bag and per new
  instance.
- **F119 reads the platform rather than replacing it.** The alternative — re-declaring
  `required` and `type="email"` in JavaScript — is what makes the two layers disagree about
  whether a form is valid. `setCustomValidity` is how a rule's message reaches the native
  bubble, so they cannot.

## Where the project stands

v1.2.0 released; M20 complete (20.7 merged as #148). **The v1.3.0 cut is still pending**: six
changesets sit in `.changeset/`, and this planning PR adds none — it ships documentation only.
M21 is planned, nothing started. Specs 01–08; ADRs through 0076, next free 0077.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **The v1.3.0 release cut is the outstanding non-item work** and is worth doing before
   opening a new capability wave, so M20's six changesets ship as a version rather than
   accumulating behind M21. The lint's version-lockstep rule means the changelog prose cannot
   land before the bump.
3. Then **21.1** — the largest decision in the wave, and the one every later item lands on:
   the composition shape, the entry name, and whether F113's read half is a `/dom` primitive.
