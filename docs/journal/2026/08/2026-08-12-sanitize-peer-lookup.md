# 2026-08-12 — The sanitizer's peer is looked up (roadmap 17.6)

## What got done

- **`/sanitize` no longer imports `dompurify`.** `sanitizeHtml` resolves
  `options.dompurify` → `globalThis.DOMPurify` → `PeerMissingError`
  (`EGL_PEER_MISSING`, `.peer === 'dompurify'`), per
  [ADR-0055](../../../adr/0055-the-sanitizer-s-peer-is-looked-up.md). The entry carries no
  bare specifier, so it loads on a page with no bundler and no import map.
- **The browser fixture's import map is deleted**, replaced by a classic
  `<script src=".../purify.min.js">`. That deletion is now itself the assertion: nine entries
  already loaded without a map, and the tenth does too.
- ADR-0012 marked partially superseded (the *curated profile* half stands; the *reach* half
  moved). New `sanitize-peer.test.js` covers injected / ambient / absent / precedence /
  wrong-shape. Spec 01 F24 and spec 05 §1 amended; SECURITY.md and the threat model gained the
  ambient-sanitizer boundary; changeset, CHANGELOG, ROADMAP, README.

## The reasoning that took the time

ADR-0041 had already decided this question **the other way** for this entry, and its argument
was good: a static import "is right *there*, because the entry exists only to use DOMPurify —
a consumer who imports `/sanitize` has already decided to install it."

The temptation was to frame 17.6 as fixing an inconsistency. It is not one. ADR-0041's
reasoning was sound under its premise — *an npm consumer whose bundler resolves bare
specifiers* — and what changed is the premise: ADR-0046 adopted the no-bundler wave and spec 05
made the plain HTML page first-class. For that consumer the static import is not inelegant, it
is fatal at load, before any typed error can speak.

I checked whether the choice could be avoided, because a mechanism that served both would beat
either. It cannot: a bundler and a bundler-free browser **both take the `import` condition**,
so no `exports` condition can hand one a static import and the other a lookup. That made the
decision genuinely exclusive, which is worth having verified rather than assumed.

## What I deliberately did not build

A `createSanitizer({ dompurify })` factory — inject once, call everywhere — is nicer for the
bundler consumer, mirrors ADR-0025's injected client, and is what I would reach for if the
per-call option grates. **Deferred, not rejected:** it is purely additive, so 1.x can add it
without a major, whereas the *contract* had to be frozen now. Shipping both would give 1.0 two
ways to do one thing before anyone has evidence which is needed.

A module-level `useDomPurify()` registration was rejected outright: process-wide mutable
registration is the static-singleton shape ADR-0031 set out to replace, and it makes the
resolved sanitizer depend on import order across a dependency tree — silently.

## The cost, recorded rather than buried

A missing peer used to fail the **build**; it now fails at the first sanitize call. For a
security function that is a real downgrade in *when* you find out, and the ADR, SECURITY.md and
the threat model all say so in those words. What does not move is *what* happens: absence is a
loud typed throw, never a pass-through of unsanitized HTML — asserted directly rather than
argued — and a value that is neither a factory nor a bound sanitizer is a `TypeError` naming
the shape, so a mis-wired peer cannot become a silent no-op sanitizer.

## A latent bug the new tests found

Fixing the module-shape detection exposed one. The old resolver assumed the **factory** shape
whenever `window` was given:

```js
if (explicitWindow !== undefined) instance = purify(explicitWindow); // assumes callable
```

Unreachable while the module could only arrive by import, but the moment a caller injects a
**bound** instance (what `purify.min.js` leaves on `window.DOMPurify`) together with a `window`,
it throws `purify is not a function`. Both shapes are now detected before either is used, and a
bound instance is documented as unrebindable — a `window` option cannot change its DOM.

## Where the project stands

M17: 17.1, 17.2, 17.6–17.12, 17.14 done. Open: **17.3** (publish the API reference), **17.4**
(the per-function NFR-01 clause), **17.13** (descriptor-shape option checking), and **17.5**,
which cuts v1.0.0 and stays last. ADRs through 0055; next free 0056. Six changesets queued.

Unusually for this milestone, **no budget moved**: `/sanitize` went 1457 B → 1484 B, inside its
existing 1.55 kB row. The three items before this one each amended a clause.

## How the next session resumes

1. Wait for this PR to merge.
2. M18 is now unblocked in the sense that mattered — F82's mechanism exists and its *load* half
   holds. 18.1 still owns the three-engine proof and 18.4 the documented snippets.
3. Of what is left in M17, **17.4** is the only decision (the owner's, per the item text);
   **17.3** and **17.13** are ordinary work. Nothing blocks anything.
4. Local note: the Firefox Playwright binary will not launch on this machine
   (`browserType.launch: spawn UNKNOWN`) — Chromium and WebKit both run clean, and CI installs
   its own browsers. Do not read a local Firefox failure as a regression.
