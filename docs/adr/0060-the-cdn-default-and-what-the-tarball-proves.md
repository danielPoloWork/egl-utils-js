# ADR-0060: The CDN default is the artifact — and the tarball is what proves it

- **Status:** Accepted
- **Date:** 2026-08-19
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** [spec 05](../specs/05_spec_browser_distribution.md) §2 F84 and §3 NFR-23,
  ROADMAP 18.3 (and 18.4, which documents the URLs this settles),
  [ADR-0059](0059-one-file-one-global-and-a-budget-repinned.md) (the artifact these fields
  name), [ADR-0016](0016-release-pipeline-and-supply-chain.md) (the publish path this gate
  joins), ADR-001 (.spec, the exports map as the single resolution surface)

## Context

F84 asks for one thing that sounds like a one-line change: `https://cdn.jsdelivr.net/npm/egl-utils-js`
should serve something a `<script src>` can run. Today it serves nothing usable — the
package declares no `main`, on purpose, because the `exports` map is meant to be the only
answer to "what is this package", and both CDNs fall back to `main` when their own field is
absent.

So the field has to be added, and the moment it is, two questions follow that are less
obvious than the field itself.

**What should it point at?** The instinct is "the root entry", and it is wrong in a way that
fails loudly on the consumer's page rather than in our CI: the URL a CDN answers for a bare
package name is fetched by a classic `<script src>` with no `type="module"`, and an ESM file
in that position is a syntax error at the first `import`. The default has to be the F83
IIFE.

**What keeps the advertisement honest?** `files` decides what is packed; `exports`, `unpkg`
and `jsdelivr` decide what consumers ask for. Nothing checks the two against each other.
`publint` reads the manifest against the working tree, not against the tarball, so
narrowing `files` by one entry would break the bare CDN URL while every gate in the project
stayed green — and the symptom would be a 404 on a page we do not control, discovered by a
consumer.

Both questions are cheap now and expensive later: the CDN URL is about to be documented
(18.4) and pinned in copy-pasteable snippets, at which point it is a published contract.

## Decision

**1. `unpkg` and `jsdelivr` both name `./dist/global/egl-utils.global.js`.** Two fields, one
value: a bare package URL means the same thing on either service, so 18.4 documents one
route rather than forking per CDN. The deep `/dist/esm/<entry>.js` paths remain the
documented module-consumer route, unchanged and unadvertised by any field.

**2. No `main`, `module` or `browser` field is added — and that absence becomes a gate.**
These are the pre-`exports` resolution fields, and bundlers still honour them. Adding `main`
to "help" the CDN would give a second, condition-free answer to a question the exports map
already answers with conditions; adding `browser` would be worse, because bundlers would
redirect a normal `import` onto the IIFE and every consumer's bundle would grow by the whole
surface. NFR-23 promises that a bundler consumer changes nothing across this wave, and the
assertion is how that promise stops depending on nobody being helpful later.

**3. The gate reads the packed tarball, not the working tree.**
`tools/assert-packaged-files.mjs` runs `npm pack --dry-run --json` and asserts that every
advertised path — both CDN fields, all 41 exports-map targets, and the artifact's sourcemap
— is in the file list the registry would actually receive. The tarball's own manifest is the
only thing a consumer or a CDN can see, so it is the only honest thing to assert against.

**4. The sourcemap is advertised too.** The artifact ends with a `sourceMappingURL`, and a
CDN that 404s it is a devtools warning on every consumer's page. It ships because `files`
already includes `dist`, and it *keeps* shipping because the gate names it.

## Alternatives Considered

- **Add `main` pointing at the CJS build and let the CDNs fall back to it.** Fewer fields,
  and it would work. Rejected: `main` is not CDN configuration, it is resolution
  configuration — Node and every bundler would start reading it, reintroducing the
  dual-answer problem the exports map exists to remove, and CJS in a `<script src>` fails on
  `exports is not defined` anyway.
- **Point the CDN fields at `dist/esm/index.js`** and tell consumers to write
  `<script type="module" src=...>`. Rejected: it makes the *bare* URL — the one people
  paste — work only with an attribute they must remember, and it silently gives them the
  root entry only, with the nine subpaths unreachable. The artifact exists precisely to be
  the answer for that consumer.
- **Trust `files: ["dist"]` and skip the gate.** It is correct today, and the whole failure
  mode is that it stays correct only until someone narrows it for a good reason. A gate that
  costs one `npm pack --dry-run` per `check:package` is cheaper than a 404 discovered by a
  consumer.
- **Assert against a hard-coded expected file list** instead of cross-checking the manifest.
  Rejected: a second list to maintain, and it would fail on every legitimate addition —
  noise that trains people to update it without reading, which is how a gate stops gating.
- **A CI job that fetches the real CDN URL after publish.** Genuinely stronger, and out of
  scope: it can only run post-publish, so it reports rather than prevents, and it makes CI
  depend on a third-party service's cache warming.

## Consequences

- **`https://unpkg.com/egl-utils-js` and `https://cdn.jsdelivr.net/npm/egl-utils-js` serve
  the artifact** from the next release, version-pinnable in the usual way
  (`egl-utils-js@1.1.0`), which is the form 18.4 documents — the same-version rule matters
  because entries share content-hashed chunks.
- **The exports map is byte-for-byte untouched** (NFR-23): this PR's diff to `package.json`
  is two added lines above it. `publint --strict`, `attw --profile node16`, `agadoo` and the
  no-runtime-deps assertion all stay green.
- **`check:package` grows a fifth assertion** and now runs an `npm pack --dry-run`. It is
  the one gate in the project that looks at what is *shipped* rather than what is *built*,
  which also makes it the natural home for future packaging invariants.
- **A new coupling to `npm`** inside a pnpm project — deliberate, because `npm pack` is the
  reference implementation of the packing rules the registry applies, and pnpm has no
  equivalent JSON listing. It is invoked through `execSync` with a fixed command string:
  Windows cannot spawn `npm.cmd` directly, and passing an argument array through
  `shell: true` is deprecated.
- **Not proved here:** that the URLs resolve on the real CDNs. They cannot be, before a
  publish. What is proved is the only half we control — that what the fields name is what
  the tarball contains.

## References

- [spec 05](../specs/05_spec_browser_distribution.md) F84, NFR-23; ROADMAP 18.3, 18.4.
- [ADR-0059](0059-one-file-one-global-and-a-budget-repinned.md) (the artifact),
  [ADR-0016](0016-release-pipeline-and-supply-chain.md) (the publish path).
- unpkg and jsDelivr both resolve a bare package URL through their own field, then `main`.
