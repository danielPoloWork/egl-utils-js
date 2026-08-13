# 2026-08-13 — The API reference gets an address (roadmap 17.3)

## What got done

- **`.github/workflows/docs.yml`** — generates the TypeDoc reference and deploys it to GitHub
  Pages when a **release is published**, per
  [ADR-0057](../../../adr/0057-the-api-reference-is-published-per-release.md).
- `typedoc.json` gains `includeVersion: true`, so the site header reads `egl-utils-js - v0.9.0`
  instead of leaving the reader to guess which version they are reading.
- README links it **first**, above the spec link; `documentation.md` and `github-setup.md` §4
  updated, the latter because its Pages recipe was actively wrong.

## The only interesting decision: when to publish

`release.yml` drafts a release on the tag and a human presses "Publish" (AGENTS.md §11). Three
triggers were plausible and the choice is not cosmetic:

- **On tag push** — simplest, one workflow. Rejected: a draft release left open for review would
  already have live docs, so the site would describe a version nobody can install.
- **On every push to `main`** — always current, and wrong for a *reference*. `main` currently
  carries five breaking changes nobody can install; publishing that as "the API" would be
  actively misleading. `pnpm docs:api` is the answer for reading the working tree, and the README
  says so.
- **On a published release** — chosen. It reuses the human gate the release already has, so the
  site and the announcement move together.

That third option is the one that needed writing down, because it looks like an arbitrary choice
of event name and is really about which artifact the docs are allowed to describe.

## What the workflow could not do, and why that is fine

I wanted the workflow to enable Pages itself (`configure-pages` has an `enablement` input) so
the first release would not fail on a repository setting. **It cannot:** enabling Pages needs
`administration:write`, which is not a permission `GITHUB_TOKEN` can be granted — only a PAT or
App token. Carrying a long-lived `administration:write` secret to save one command, once, is a
bad trade.

So the workflow *checks* and fails with the exact remedy in its error output, which is the
pattern `release.yml` already uses for missing release notes:

```
::error::GitHub Pages is not enabled for <repo>.
::error::  gh api -X POST repos/<repo>/pages -f build_type=workflow
```

Checking the action's own `action.yml` rather than assuming is what surfaced this — the input
exists, and its description is where the token requirement is stated.

**`github-setup.md` §4 was wrong, not merely incomplete.** It described a *branch*-sourced Pages
site (`source[branch]`/`source[path]=/docs`), which cannot work here: `docs/api/` is generated
and gitignored, so there is nothing in the tree to serve. Corrected to `build_type=workflow`
with a note saying why the old shape was wrong, so the next reader does not "fix" it back.

## Versioned docs: rejected now, with the condition to revisit

A `/v1.0.0/` archive with a picker is the eventual right answer and is not worth it yet. Pages
deployments replace the whole site, so keeping old versions means either committing built docs
or reassembling every prior version on each deploy, plus a picker TypeDoc does not generate. At
the *first* stable release there is exactly one version worth reading. `includeVersion` means no
published page is ever ambiguous in the meantime, and the ADR records the trigger for revisiting:
when someone is pinned to an old 1.x.

## What this cost: nothing new to break

Worth stating because it is unusual for this milestone. CI has built this reference
**warning-free on every PR since 7.5** (`treatWarningsAsErrors`), so publishing adds an address,
not a risk — a TypeDoc regression already fails the PR rather than a release. No new gate, no
budget row, no source change. The whole item is a workflow, a config line, and correcting a
stale recipe.

## Where the project stands

M17: everything done except **17.4** (the per-function NFR-01 clause — recorded as the owner's
decision) and **17.5**, which cuts v1.0.0. ADRs through 0057; next free 0058. Eight changesets
queued.

**One action for the owner before the first docs deploy:**
`gh api -X POST repos/danielPoloWork/egl-utils-js/pages -f build_type=workflow`, or Settings →
Pages → Source: GitHub Actions. The workflow can also be dispatched manually to test the whole
path before v1.0.0 is published.

## How the next session resumes

1. Wait for this PR to merge.
2. **17.4** is the last item before the release and is the owner's call: whether NFR-01's
   per-function 1 kB budget exempts composing facades or keeps naming them one by one. Practice
   has amended it five times (`httpClient`, `bsTable`, `tablePipeline`, `bindTableControls`,
   `compileFilter`), which is the evidence the item asks to be weighed.
3. Then **17.5**. Its compatibility statement has real content to summarise: the Node 22 /
   Safari 16.4 floor, option *and* descriptor strictness, the naming freeze, the instance
   contract, the sanitizer peer, and the exports-map simplification.
4. Enabling Pages (above) should happen before 17.5, so the release that cuts 1.0 also publishes
   its reference.
