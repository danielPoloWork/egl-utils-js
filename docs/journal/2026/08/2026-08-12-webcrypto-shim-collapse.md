# 2026-08-12 — The `#webcrypto` shim collapses (roadmap 17.14)

## What got done

- **Two shims → one module.** `webcrypto-node.js` and `webcrypto-browser.js` deleted,
  replaced by `webcrypto.js` exporting `cryptoSurface = globalThis.crypto`, imported by
  `crypto.js` through a plain relative import.
- **Four things deleted with it:** the `#webcrypto` entry and the whole `imports` field in
  `package.json`, the exports map's `node` condition, the `dist/node/{esm,cjs}` build pair in
  `tsup.config.js`, and the two source-shim entries in `files` (now just `["dist"]`).
- **ADR-0054** written, **ADR-0008 marked Superseded** with a note saying what survives
  (one surface, never `Math.random`) versus what was machinery.
- Spec 01 NFR-07 amended, `tools/api-floor-inventory.js`'s `crypto` entry reworded,
  `webcrypto-shims.test.js` → `webcrypto.test.js`, and the three suites that mocked
  `#webcrypto` now mock the module path.

## The distinction that shaped the ADR

ADR-0008 is remembered for two things — **one Web Crypto surface** and **never
`Math.random`** — and neither is touched here. What went away is everything below them: a
two-file conditional import, an extra build pair, and an exports condition, all of which
existed for one reason, a `node:crypto` import that Node 18 required because it had no
`globalThis.crypto`. ADR-0050 raised the floor to Node 22, so both shims had reduced to the
same line and the condition was choosing between identical files.

Writing that separation into ADR-0008's superseded header mattered more than the code change:
"Superseded" on a security ADR reads, to someone skimming, as *the security reasoning was
wrong*. It was not — only the plumbing became unnecessary. The header now says so and points
at ADR-0054 for the wiring.

The one genuinely debatable call: the 17.2 comment in `webcrypto-node.js` argued for keeping
the `?? webcrypto` fallback as graceful behaviour on unsupported runtimes ("costs one `??`").
Rejected here, and the ADR records why — **the cost was never the `??`, it was everything the
`??` required**: keeping that one operator meant keeping the `node:crypto` import, which
forces the two-file split, the second build pair and the exports condition. Its only
beneficiary is a runtime below the declared floor.

## The verification payoff, which is the real win

The smaller tarball is the visible result — measured **93 files → 85**, the `dist/node` pair
alone 6 files and ~516 kB unpacked, mostly its duplicated 54 kB declaration files and 150 kB
sourcemaps — but the better one is that **what CI measures is now what every consumer gets**. `agadoo` (shakeability, NFR-02) and every size-limit row gate the
platform-neutral artifact. The `dist/node` pair was explicitly exempt from the shakeability
gate — ADR-0008 said so, since its builtin import was the point — so Node consumers received
an artifact no gate had shaken. That gap is closed by deletion rather than by adding a gate.

## A trap worth remembering

`tsup`'s `clean: true` clears only the output directories it is **configured to build**. After
removing the two node configs, a stale local `dist/node/` survived a full rebuild — and
`files: ["dist"]` would have packed it. Deleted by hand; CI builds from a clean checkout and
never saw it. Noted in the ADR's consequences for the next person who reads a stale `dist/`.

## Where the project stands

M17: 17.1, 17.2, 17.7–17.12 and 17.14 done. Still open: **17.3** (publish the API reference),
**17.4** (the per-function NFR-01 clause), **17.5** (cuts the release, stays last), **17.6**
(the `/sanitize` peer-resolution contract), **17.13** (descriptor-shape option checking).
ADRs through 0054, next free 0055. `[Unreleased]` carries this and six other unreleased items.

## How the next session resumes

1. Wait for this PR to merge.
2. **17.6** is the one M18 depends on — spec 05 F82 is written mechanism-neutral and defers
   to its ADR, and 18.1 implements whatever it decides. It is also the last decision-heavy
   item left before the release.
3. **17.4** and **17.13** are independent; **17.3** is mechanical. **17.5** last.
4. The exports map is now as simple as it will get before spec 05 NFR-23 pins it — any
   further map change should land before M18 too.
