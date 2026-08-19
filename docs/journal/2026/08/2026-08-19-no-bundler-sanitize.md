# 2026-08-19 — `/sanitize` proved on a page with no bundler (18.1)

## What got done

- **`src/test/browser/no-bundler-sanitize.html`** — a fixture with no import map, no
  bundler, no npm, no other entry, and **no DOMPurify at all**. One
  `<script type="module">` importing one built file, exactly as the target consumer's page
  does.
- **`src/test/browser/no-bundler-sanitize.spec.js`** — seven assertions, run on Chromium,
  Firefox and WebKit from the same static file server the rest of the browser suite uses.
- ROADMAP 18.1 checked, spec 05 §5/§6 coverage glyphs advanced to 🚧, README milestone row
  for M18 flipped to in progress.
- **No source changed and no ADR was needed.** ADR-0055 (17.6) already shipped the
  mechanism and explicitly left "the three-engine proof" to this item. That the
  implementation needed no adjustment to pass is the result, not a shortcut.

## Why a second fixture rather than more cases in `smoke.spec.js`

This is the only real design decision in the item, and it is worth writing down because the
cheap route looks reasonable: the shared fixture already loads `/sanitize` with no import
map, so a handful of extra `test()` calls would seem to cover F82.

They would cover two of its three halves. The shared fixture supplies DOMPurify with a
`<script src>` in its `<head>`, and other suites depend on that global — so on that page the
peer **can never be absent**, and the absent case is the one that matters most: the wrong
answer to a missing sanitizer is returning the caller's markup unsanitized. Asserting it
there would have meant deleting a global the rest of the suite needs, or mutating it
mid-test and hoping the ordering held.

A page where the peer was never present makes the assertion structural instead. The peer
then arrives *per route under test* — a classic `<script>` for the ambient case, a
dynamically imported module value for the injected one — which turned out to buy a second
property for free: the classic script lands **after** the module was imported, so the test
that proves ambient resolution also proves the lookup is not memoized negatively, in a real
engine rather than by simulation.

## What the assertions actually pin

Beyond the three F82 halves, two are worth naming:

- **The built entry carries no bare specifier**, read off `dist/esm/sanitize.js` rather than
  the source. This is the static guarantee behind the runtime one; without it a refactor
  that reintroduced `import 'dompurify'` would surface as "the fixture went blank", and this
  assertion names the specifier instead. It also rejects a dynamic `import('dompurify')`,
  which resolves just as badly and which ADR-0055 refused for a second reason — it would
  make `sanitizeHtml` asynchronous.
- **Absence is never a silent pass-through**, asserted separately from the typed-error case
  even though today one implies the other. They can fail independently: a refactor that
  returned its input on a missing peer would still be "no load failure, no page error", and
  that is precisely the failure the security posture cannot tolerate.

## One thing the run corrected

The first draft asserted that `purify.min.js` leaves a bound *instance* on
`window.DOMPurify` — the wording ADR-0055 uses. In a real browser it leaves a value that is
**both** callable and already carrying `.sanitize`, so `typeof` alone cannot answer "is this
a factory?". That is exactly the ambiguity ADR-0055's shape detection exists to resolve, so
the assertion now pins the real shape (`['function', 'function']`) and says why. The
implementation was right; the test's description of it was not.

## Verification

Chromium and WebKit: **7/7 each, green**. Firefox could not be verified locally —
`browserType.launch: spawn UNKNOWN` on this Windows host, a launcher failure before any test
code runs, unrelated to the suite. CI runs all three engines on Linux and is the gate that
matters; the fixture and the assertions contain nothing engine-specific by construction.

## Where the project stands

**v1.0.0 released**; M17 complete. M18 in progress: 18.1 done, 18.2–18.5 open. ADRs through
0058, next free 0059. Five Dependabot PRs are open and untouched by this item.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **18.2** — the global single-file artifact (`dist/global/egl-utils.global.js`, IIFE +
   sourcemap, `window.egl`). It is the largest item in the wave and everything after it
   depends on it: 18.3's CDN fields target the artifact, 18.4 documents it, 18.5 loads it.
   Note F83's own dependency, now satisfied: peers stay external and are resolved at use
   "exactly as on the ESM path (F68 lookup; F82 contract)" — which is what this item proved.
3. NFR-22's 40 kB ceiling is re-pinned to measured + ≤ 7% in 18.2, amending the clause in
   that PR (the ADR-0015 practice).
