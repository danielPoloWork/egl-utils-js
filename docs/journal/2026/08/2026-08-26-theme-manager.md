# 2026-08-26 — One attribute, and a snippet that cannot drift (roadmap 20.3)

## What got done

- **`createTheme` and `themeSnippet` on `egl-utils-js/ui`** (F106–F107), over Bootstrap 5.3's own
  `data-bs-theme`.
  [ADR-0073](../../adr/0073-bootstraps-own-attribute-and-a-snippet-that-cannot-drift.md).
- **The NFR-34 api-floor amendment** — which this item turned out to owe, not 20.4.
- 48 unit tests over an injected storage and an injected `matchMedia`, plus 4 three-engine
  browser tests for the one claim jsdom cannot make; `ui-theme.js` at 100% statements, branches,
  functions and lines.
- NFR-22 re-derived a **fourth** time (60 kB, 60 914 B); the artifact row re-pinned to 44.4 kB;
  a new per-function row for `themeSnippet` (421 B).
- 128 exports become 130. No new `exports` path, no new error code, nothing renamed.

## The correction this item starts with

I told the owner — and wrote in the M20 journal — that 20.3 was *"the last item on `/ui` that
needs no api-floor amendment"*. That was wrong. F106 asks for `prefers-color-scheme` tracking,
and "follow the system" **is** a media query. Spec 07 NFR-34 attributes the `matchMedia`
amendment to F108/F111 because that is where the wave's author expected it to bite first; it bit
here.

So the amendment lands in this PR: `matchMedia` joins the scanner's policed globals — which
means a bare use anywhere in the library is now *visible* to the deny-by-default gate, a small
permanent improvement beyond this item — and three entries are declared. The one worth the
lookup is **`MediaQueryList.change`, Safari 14**: recent enough by this file's standards that
"probably fine" was not an answer, and it is what makes the deprecated `addListener` (Safari
5.1) unnecessary at a 16.4 floor. ROADMAP 20.4 is corrected to say the work is already done.

## The bug a test found, and the design it changed

The first implementation derived the preference from storage on **every** read. It looked
cleaner — one source of truth, no cached state — and it was wrong in a way only a hostile
storage exposes.

With a wrapper that throws on write (a quota failure, a blocked-cookies context), `set('dark')`
wrote the attribute, notified, then failed to persist. And because the preference was *derived*,
the manager's own view snapped back: the attribute said `dark`, `resolved()` said `light`, and
the next system change would have flipped the page back. The test that caught it was written to
assert the *stated* rule — "failing to remember must not stop a choice taking effect" — and it
turned out the second half of that rule was unimplemented.

So the preference is now held in memory, read from storage once at construction, with storage as
its **mirror**. A failed persist costs the next page load, not this one. As a bonus it keeps a
value components read on every render off the storage accessor.

## What Node 26 caught, and why the matrix has three cells

CI failed on **node-26 only**, with node-22 and node-24 green: five of the new tests reached for
`globalThis.localStorage` — the ambient store a jsdom environment usually exposes — and on Node 26
it was `undefined`.

Nothing in the library was wrong. `createTheme` defaults to the F21 wrapper, whose whole point is
that it works whether or not a real Web Storage exists (ADR-0010), so the *implementation* was
already host-independent; the *tests* were not. Two fixes, and they are different in kind:

- the "defaults to the real wrapper" test now asserts **through** `localStorageWrapper` rather
  than through whatever store it resolved to. The claim was always "the default is the F21
  wrapper", and reaching past it made the test a claim about the host instead;
- the snippet tests **stub** a Web Storage of their own (`vi.stubGlobal`). The snippet's contract
  is "it reads `localStorage`", so supplying one is the test's job. That also bought a new test
  for free: a store that throws on the accessor alone, which is the blocked-cookies case the
  snippet's outer `try` exists for.

This is what a three-version matrix is for, and it is worth noticing that the failure was
*eight percent* of the runtimes rather than all of them — the kind of thing a single-version CI
would have shipped.

## Three decisions worth their paragraphs

**`'auto'` is the absence of a stored value.** Not a third stored state. That makes "no choice
yet" and "follow the system" literally one condition — there is no way for them to disagree,
because there is only one of them — and it is what lets the `<head>` snippet make the same
decision before any manager exists.

**The snippet is emitted, not documented.** A README snippet shares the storage key and the
attribute name with the manager by coincidence, and the coincidence ends the first time either
changes. `themeSnippet()` returns the source from the same constants, and the suite runs the
string and compares the resulting attribute with what `createTheme` would set, across four
combinations of stored value and system preference. It measures **421 B** and is the only export
on `/ui` that imports nothing, which is why it has its own size row.

**`destroy()` leaves the page themed.** The opposite of the toast container, which the manager
built and therefore removes. The attribute is the page's state, and removing it on teardown
would flash the default theme at every navigation — reintroducing the F107 defect from the other
end.

## What the browser tests are for

Spec 07 §6 says it outright: *"before first paint has no meaning in jsdom."* So the fixture is
built around the **emitted** snippet, reads the attribute *and* the computed background inside
the first `requestAnimationFrame`, and asserts both — because "the attribute was set" and "the
frame was right" are different claims and only the second is what F107 promises. It then asserts
nothing changed afterwards, which is what rules out "it flashed and corrected itself".

Two of the four use Playwright's `emulateMedia` rather than a stub, so the engine's own
`prefers-color-scheme` and its real `MediaQueryList` change event are what get tested.

## What it cost, and the trade worth naming

| | before | after |
|---|---:|---:|
| `/ui` size-limit row | 7 332 B | 8 796 B |
| `/storage` size-limit row | 2 104 B | 2 107 B |
| `/ui` served, deep ESM | 17 887 B / 6 req | 22 499 B / 8 req |
| `/storage` served, deep ESM | 4 342 B / 4 req | 4 503 B / 5 req |
| artifact served | 42 432 B | 43 430 B |
| `pageSessionId` size row | 888 B | 952 B |

`/ui` now depends on `/storage`, because F106 requires persistence through the F21 wrapper. A
bundler consumer pays **1 464 B** for that; a deep-ESM page pays **4 612 B and two extra
requests**, since that route downloads whole files. It also cost the `pageSessionId` single-import row 64 B of chunk boundary — a row that had to be re-pinned for a function nobody touched, which is exactly the movement a per-function row exists to make visible rather than absorb. It is the clearest example on the F87 table
of one decision costing two consumers very differently — which is the reason the table counts
served bytes separately at all. Reusing the wrapper is still right: an in-house copy would be a
second implementation of the private-mode fallback.

No new pattern for the catalogue. The injected `storage` and `matchMedia` seams are the
Dependency Injection rows 10 and 16 already record, and nothing else here is a pattern rather
than a decision — the policy says never force-fit.

## Where the project stands

v1.2.0 released. M20 in progress: 20.5, 20.1, 20.2 and 20.3 done; 20.4, 20.6 and 20.7 open.
`.changeset/` holds four minor entries; `[Unreleased]` has all four. ADRs through 0073, next free
0074. Every gate green.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **20.4** (breakpoint observation) is next, and it is now smaller than the roadmap says: the
   floor amendment it was written to owe landed here, so what remains is the breakpoint
   vocabulary and the subscribe shape. It will want the same `matchMedia` seam this item
   introduced — worth checking whether the two should share an internal helper rather than each
   resolving the global.
3. **20.6** (reduced motion) is the same shape again, one query point, and is explicitly a helper
   rather than a manager (ADR-0046 rejected a MotionManager).
4. **20.7** remains the browser-suite flakiness, unrelated to the wave's features.
