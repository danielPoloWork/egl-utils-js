# Documentation Workflow

How documentation is maintained on `egl-utils-js`. Documentation is part of the
deliverable — every PR ships its own doc updates in the same PR. The rules are in
[`AGENTS.md`](../../AGENTS.md) §7; this expands the *how*.

## Artifacts and when to touch them

| Artifact | Update it when… |
|---|---|
| `README.md` | the public surface, build/test/run flow, or milestone status changes |
| `docs/specs/` | behavior diverges from the frozen spec (update spec **or** add a superseding ADR) |
| `docs/adr/` | a non-trivial design decision is made, or a pattern is adopted/superseded |
| `docs/patterns/README.md` | a pattern is introduced, refined, rejected, or superseded |
| `ROADMAP.md` | an item completes (flip the checkbox) or new work is planned |
| `CHANGELOG.md` | a user-visible change lands (add a line to `[Unreleased]`) |
| `docs/journal/` | a work session changed the project's state (dated checkpoint) |
| `docs/bugs/` | a defect is verified, triaged, or fixed |

## Same-PR discipline

A change to code and its documentation belong to the **same** pull request. "Docs
follow-up" is not allowed (`AGENTS.md` §10). The consistency lint
(`python tools/consistency_lint.py`) mechanically enforces the parts of this that can be
checked: version lockstep, ADR index ↔ files, pattern rows ↔ ADR+code, spec coverage map,
README ↔ ROADMAP milestone agreement, and bug-ledger integrity.

## API documentation

Public symbols are documented with JSDoc comments; [TypeDoc](https://typedoc.org) generates the API
reference from them (`typedoc.json`, roadmap 7.5). Build it locally with `pnpm docs:api` — output
goes to `docs/api/` (generated, gitignored, never committed). `treatWarningsAsErrors` is set, so
the CI consistency job fails the build on any undocumented or unresolved public symbol rather than
shipping silently broken reference docs (quality bar, `AGENTS.md` §10). A JSDoc `@typedef` that is
used in a public signature but not itself exported (e.g. `AsyncQueue`, `Debounced`) is listed in
`typedoc.json`'s `intentionallyNotExported` rather than suppressed with a blanket warning flag, so
a *new* unresolved reference still fails loudly. Narrative documentation lives in Markdown under
`docs/`; the split between generated API docs and hand-written narrative is recorded in an ADR if
non-obvious.

**Where it is published (roadmap 17.3, [ADR-0057](../adr/0057-the-api-reference-is-published-per-release.md)).**
`.github/workflows/docs.yml` deploys the same reference to GitHub Pages —
<https://danielpolowork.github.io/egl-utils-js/> — when a **release is published**, not when the
tag is pushed, so the site and the release move together and it never documents a version nobody
can install. The site covers the **latest release only** and names it in the header
(`includeVersion`). Building locally, as above, is how you read the reference for an unreleased
working tree. Pages must be enabled once by hand — see
[`github-setup.md`](github-setup.md) §4; the workflow checks and fails with the command.
