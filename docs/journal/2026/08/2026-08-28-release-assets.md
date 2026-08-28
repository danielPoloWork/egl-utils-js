# 2026-08-28 — The release carries what the registry would have (22.3)

## What got done

- **`tools/build-release-assets.mjs`** — builds the three release assets (the `npm pack`
  tarball, `egl-utils-js-<version>-dist.zip` with `dist/**` plus `LICENSE` under one
  version-stamped folder, `SHA256SUMS`) and **gates them in the same run**: zip `dist/**` set
  equals the tarball's, every advertised path present in both, nothing outside the zip's root.
- **`tools/advertised-paths.mjs`** — the "what does package.json advertise" derivation,
  extracted from the F84 gate and now shared by both gates, so they cannot drift apart.
- **`check:release-assets`** wired into `check:package` **and the CI packaging job** — the
  22.1/ADR-0082 placement rule: a release is never the first time the builder runs.
- **`release.yml`** attaches the three assets to the drafted release, named explicitly.
- **README** — a "Download and self-host" route beside the two CDN routes, and the pinned
  examples moved off `@1.2.0`, where they had fossilized through two releases.
- **`sync-version.mjs` + `consistency_lint.py`** — the pins are now written by the release
  flow and verified by the lint, so the convention is mechanical.
- **[ADR-0087](../../adr/0087-the-release-carries-what-the-registry-would-have.md)**, spec 05
  F84 amended (§2, §6), `release.md`/`packaging.md` updated, ROADMAP 22.3 closed.
- 14 unit tests on the pure halves; the extraction smoke run by hand on the produced zip
  (121 files, the documented paths present).

## The finding, in one line

`gh release view v1.4.0 --json assets` → `[]` — while `release.md`'s boundary table has said
**"Build & attach artifacts | CI"** since M7, npm is a 404, `dist/` is gitignored, and every
README CDN URL resolves through the registry that 404s. The no-bundler consumer M18 made
first-class (issue #181) had no way to obtain the files that three engines prove work.

## The gate earned its keep on its first run

The zip-side assertion initially required **every** advertised path, and failed immediately:
the exports map advertises `./package.json`, which is in the tarball and has no business in a
zip whose contract is "the dist tree for a static page". The assertion is now scoped to
`dist/` paths with the reason in the code — a real contract decision surfaced by running the
gate, not by reviewing it.

## Decisions worth remembering

- **Set equality, not a checklist**: the zip is compared to the tarball, so there is one
  derivation of "what ships". A checklist would have to be maintained; a parity cannot drift.
- **The OS archiver, not a dependency**: `zip`/`unzip` on the runners, bsdtar on Windows
  (`tar -a` writes zip by extension). A devDependency for a container format the OS writes
  would be audit surface for nothing.
- **npm publish is untouched** — still the owner's dispatch. These assets make the no-Node
  consumer independent of that decision rather than replacing it.

No public symbol changed and the packed tarball is byte-identical, so this item carries **no
changeset**; the CHANGELOG `[Unreleased]` line covers the consumer-visible release change.

## Next

22.2 (the `/bootstrap` ceiling instrument) is the remaining open M22 item; the feature backlog
sits in issues #168–#180, with #181 closed by this PR.
