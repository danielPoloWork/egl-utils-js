# 2026-08-19 — The CDN default, and what the tarball proves (18.3)

## What got done

- **`unpkg` and `jsdelivr`** in `package.json`, both naming
  `./dist/global/egl-utils.global.js`. The diff is **two added lines directly above an
  untouched `exports` map** — which is how NFR-23's "byte-for-byte" clause is satisfied and
  shown rather than asserted.
- **`tools/assert-packaged-files.mjs`**, wired into `check:package` as `check:packed`.
- ADR-0060, changeset (minor), CHANGELOG `[Unreleased]`, ROADMAP 18.3 checked, journal
  entry.

## The two things that were not one-liners

**Where the fields point.** The instinct is "the root entry". It is wrong in a way that
fails on the consumer's page rather than in our CI: the URL a CDN answers for a bare package
name is fetched by a classic `<script src>` with no `type="module"`, and an ESM file in that
position is a syntax error at the first `import`. So the default is the F83 IIFE, and the
gate asserts the field ends in `.global.js` rather than merely being present — the check
that encodes *why*, not just *what*.

Worth noting why the fields are needed at all: both CDNs fall back to `main`, and this
package deliberately has none, because the `exports` map is meant to be the single answer to
"what is this package". Without the fields the bare URL resolves to nothing.

**What keeps the advertisement honest.** `files` decides what is packed; `exports`, `unpkg`
and `jsdelivr` decide what consumers ask for. **Nothing in the toolchain compares the two.**
`publint` reads the manifest against the working tree, not against the tarball. So narrowing
`files` by one entry would break the bare CDN URL while every gate stayed green, and the
symptom would be a 404 on a page we do not control.

The gate therefore runs `npm pack --dry-run --json` and asserts against the file list the
registry would actually receive — both CDN fields, all 41 exports-map targets, and the
artifact's sourcemap (a `sourceMappingURL` that 404s is a devtools warning on every
consumer's page).

## The absence that became an assertion

`main`, `module` and `browser` are the pre-`exports` resolution fields, and bundlers still
honour them. Adding `main` to "help" the CDN would give a second, condition-free answer
beside the map. **`browser` would be worse**: bundlers would redirect a normal `import` onto
the IIFE, and every consumer's bundle would grow by the whole surface.

NFR-23 promises a bundler consumer changes nothing across this wave. The gate asserts those
three fields stay absent, so the promise stops depending on nobody being helpful later. That
is the assertion in this item I expect to earn its keep.

## Proving the gate is not vacuous

Each branch was provoked against a tampered manifest:

| Tampering | Gate output |
|---|---|
| added `main` | ``declares `main` — the exports map is the only resolution surface (NFR-23)`` |
| CDN fields → `dist/esm/index.js` | ``names `./dist/esm/index.js`, which is not the IIFE artifact — a bare CDN URL is fetched by a classic <script src>, where an ESM file is a syntax error`` |
| `files` narrowed to `dist/esm`, `dist/cjs` | three failures: `unpkg`, `jsdelivr` and the sourcemap ``not packed`` |

The third is exactly the scenario the gate exists for, and it named all three broken
advertisements rather than stopping at the first.

## One implementation detail worth recording

The gate shells out, and how mattered. `execFileSync('npm', …)` cannot spawn `npm.cmd` on
Windows (Node refuses since the 2024 hardening), and `execFileSync(..., { shell: true })`
with an argument array now raises a deprecation warning — noise in a warnings-as-errors
project. `execSync` with a fixed command string and nothing interpolated is the version that
is both portable and quiet.

## A regression from 18.2, found and fixed here

`global.js` — the artifact's source, added by 18.2 — was **0% covered**, because it is a
build input that no test imports. It dragged the suite total from 100% to **99.62% lines**,
and nothing failed: the NFR-03 thresholds are 95%, so CI was green on #125 and the drop went
unreported. The 18.2 verification note claiming 100% was true of the run it quotes and not
of the state that merged; correcting it is cheaper than leaving it.

The fix is not a coverage exclusion. `src/test/javascript/.../global.test.js` asserts the
composed namespace against the ten entries **at the source**, which the packaging gate
already does against the **built file** — the difference being when you find out: the gate
needs a build and runs in `check:package`, while a missing `export *` or a name collision is
a fact about the module that a unit test catches in seconds. It also pins two things
`export *` cannot say for itself: that each re-exported binding is the *same value* as the
entry's, and that nothing appears at the top level that is neither a root export nor one of
the nine namespaces.

14 tests, and coverage is back to **100% lines**.

## Verification

`check:package` green end to end, now five assertions deep: build, publint --strict, attw
node16, 100 size rows, agadoo, zero-deps, the F83 artifact gate and the new F84 packed-files
gate. Lint, format, api-floor and the consistency lint clean. **2429 Node tests, 100% lines**
(80 files, up 14 tests from the coverage fix above).

**Not proved, and it cannot be:** that the URLs resolve on the real CDNs. That needs a
publish. What is proved is the half we control — that what the fields name is what the
tarball contains.

## Where the project stands

v1.0.0 released. M18 in progress: 18.1–18.3 done, 18.4–18.5 open. ADRs through 0060, next
free 0061. `.changeset/` holds two minors. Five Dependabot PRs open and untouched.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **18.4** — the README section "Use from a browser, without npm" (F85): per-entry deep ESM
   URLs, the artifact route, how each peer is supplied on each route, and the same-version
   rule for shared chunks. The URLs it documents are the ones this item just fixed, and the
   version to pin in the snippets is the *next* release, not 1.0.0 — the CDN fields ship
   with it.
3. F85 requires every documented snippet to correspond to a load path **18.5** exercises in
   CI, so 18.4 should be written with that pairing in mind rather than retrofitted.
