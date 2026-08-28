# ADR-0087: The release carries what the registry would have — and its gate runs before any release does

- **Status:** Accepted
- **Date:** 2026-08-28
- **Deciders:** Daniel Polo
- **Related:** [spec 05](../specs/05_spec_browser_distribution.md) (F84 amended in this PR),
  [ADR-0016](0016-release-pipeline-and-supply-chain.md) (the registry half of supply chain,
  untouched), [ADR-0059](0059-one-file-one-global-and-a-budget-repinned.md) /
  [ADR-0060](0060-the-cdn-default-and-what-the-tarball-proves.md) (the artifact and the CDN
  default these assets carry), [ADR-0082](0082-a-figure-nobody-checks-is-prose.md) (the
  gate-placement lesson applied here), ROADMAP 22.3, issue
  [#181](https://github.com/danielPoloWork/egl-utils-js/issues/181),
  [`docs/workflow/release.md`](../workflow/release.md) (the boundary table this honours)

## Context

M18 made the no-bundler consumer first-class and proved the runtime on three engines — and left
the acquisition chain entirely to the npm registry. Verified 2026-08-28, every link of that
chain is dead:

- `npm view egl-utils-js` is a **404** — the publish dispatch has never run, and it is a human
  step by design (AGENTS.md §6.1/§11);
- both CDN fields resolve **through** that registry, so every documented `unpkg`/`jsdelivr`
  URL 404s with it;
- `dist/` is **gitignored** and `files: ["dist"]` ships it in the npm tarball only, so a
  repository download contains no runnable artifact;
- `gh release view v1.4.0 --json assets` returns **`[]`** — `release.yml` builds the tag to
  verify it compiles, then discards the build.

Meanwhile [`release.md`](../workflow/release.md)'s boundary table has said **"Build & attach
artifacts | CI"** since M7, and no workflow implements the attach half. The consumer spec 05
exists for — no Node, no bundler — is exactly the consumer who cannot run `pnpm build`, so
they had no way to obtain the files at all.

## Decision

**1. The drafted release carries three assets**, built and attached by `release.yml`:

| Asset | What it is |
|---|---|
| `egl-utils-js-<version>.tgz` | `npm pack` — byte-identical to what a registry publish ships |
| `egl-utils-js-<version>-dist.zip` | `dist/**` plus `LICENSE`, under one version-stamped folder |
| `SHA256SUMS` | sha256sum(1) format, both files |

The zip exists for the download-and-link consumer (unzip beside the page, relative URLs — the
README documents it); the tarball for registries and Node tooling (a private-registry mirror,
`npm install ./file.tgz`); `LICENSE` rides in the zip because MIT's one distribution condition
is that the text travels with the files. The zip's root folder is version-stamped so two
versions extracted side by side cannot collide — and it is the path the README's snippets
address.

**2. One script builds *and* gates** (`tools/build-release-assets.mjs`), and the invariant is
set equality, not a checklist: **the zip's `dist/**` file set must equal the tarball's**, so
there is one derivation of "what ships" and no second truth to drift. Every advertised path —
computed by `tools/advertised-paths.mjs`, now shared with the F84 tarball gate so the two can
never disagree about what "advertised" means — must be present in the tarball and, for paths
under `dist/`, in the zip. The zip must contain nothing outside its version-stamped root.

The `dist/` scoping exists because the gate's own **first run caught a real case**: the exports
map advertises `./package.json`, a Node-resolution affordance a static page can never ask for.
It belongs in the tarball (asserted), not in a zip whose contract is "the dist tree".

**3. The gate runs in the PR packaging job, not first at tag time.** This is ADR-0082's lesson
applied to the asset builder itself: `check:global`, `check:packed` and `check:transfer` sat
unexecuted for six milestones because only a never-dispatched workflow invoked them. So
`check:release-assets` joins `check:package` and the `ci.yml` packaging job, and `release.yml`
runs the same script on the tag and attaches what it produced — a release is never the first
time the builder runs.

**4. The archiver is the OS toolchain, not a dependency**: `zip`(1)/`unzip`(1) on the POSIX
runners, bsdtar (`tar -a` / `tar -tf`) on Windows development machines, where libarchive writes
and lists zip natively. Two spawn lines, each platform using what it ships.

**5. README pins become data with a writer and a checker.** The no-bundler snippets pin
concrete versions to stay copy-pasteable, and they had fossilized at `@1.2.0` through two
releases — a stale figure in prose, ADR-0082's exact failure mode one document over. Now
`tools/sync-version.mjs` rewrites every `egl-utils-js@X.Y.Z` and `egl-utils-js-X.Y.Z`
occurrence at each version bump (it already owned the badge), and `consistency_lint.py` fails
on a stale one, so the convention is mechanical rather than a habit.

**6. Nothing about npm moves.** The publish dispatch stays the owner's (AGENTS.md §11); these
assets make the no-Node consumer independent of that decision, not a substitute for it. The
threat model is unchanged: no new untrusted input enters the library, and asset integrity rides
the same CI provenance as the release itself, plus the published checksums. The registry half
of supply-chain posture remains ADR-0016.

## Alternatives Considered

| Option | Why not |
|---|---|
| **Publish to npm instead** | Not the agent's step to take, and it fixes only the CDN path: the air-gapped or proxied consumer still needs a registry-free channel. This ADR is orthogonal to the publish decision, not a replacement for it. |
| **Commit `dist/` to git** | Generated artifacts in history, reviewed on every PR, and a tree that can silently disagree with what the toolchain would build today. The release asset is built *from* the tag by CI, which is the provenance story. |
| **Attach in `publish.yml`** | The workflow that has never run, gating the channel whose whole point is independence from it — and assets belong on the release draft the maintainer reviews before publishing. |
| **A zip devDependency** (`adm-zip`, `archiver`, `yazl`) | Supply-chain surface — a new tree under the lockfile and audit gates — for a container format the OS toolchain already writes. |
| **A hand-rolled store-only zip writer** | ~100 lines of CRC and header layout this library would then own and test, for a build tool. The OS archiver is boring and already correct. |
| **Tarball only, no zip** | The zip's target consumer is precisely the person who will not open a terminal; stock Windows 10 Explorer opens zip and not `.tgz`. Double-click extraction is the point. |
| **Zip without the version-stamped root** | Two versions extracted side by side collide, and the README's relative URLs would have no stable folder to address. |
| **`files: release-assets/*` in the workflow** | A stray file in that directory would ride into a release; the three names are listed explicitly. |

## Consequences

- From the next tag onward the drafted release carries the assets; the maintainer's review of
  a draft now includes them. Existing releases are untouched (v1.4.0's assets can be added by
  hand with `gh release upload v1.4.0 …` after running `pnpm check:release-assets` on the tag,
  if the owner wants the current release covered).
- `check:package` and the CI packaging job grow one member each (~seconds: a real `npm pack`
  and one zip).
- The README gains the download-and-self-host route; its pinned examples moved `1.2.0 → 1.4.0`
  and can no longer go stale silently.
- The F84 gate and the asset gate share one advertised-paths derivation — a future advertised
  field lands in both gates by construction.
- Spec 05 F84 (§2 and §6) is amended in this PR; `release.md` and `packaging.md` now describe
  a step that exists.
