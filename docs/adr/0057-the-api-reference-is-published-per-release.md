# ADR-0057: The API reference is published per release, and documents only the latest

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** ROADMAP 17.3; `docs/releases/v1.0.0-readiness-review.md` §5 (which recorded
  that a 110-export surface had nothing navigable), [ADR-0016](0016-release-pipeline-and-supply-chain.md)
  (the release pipeline and its human gate, whose trigger this reuses), AGENTS.md §11
  (publishing is the maintainer's act), `docs/workflow/github-setup.md` §4

## Context

`pnpm docs:api` has built a full TypeDoc reference since roadmap 7.5, and CI has verified it
builds **warning-free** on every PR since — `typedoc.json` sets `treatWarningsAsErrors`, so an
undocumented or unresolvable public symbol fails the build. But `docs/api/` is gitignored and
was never published anywhere, so a consumer of a 110-export surface had the README, their
editor's tooltips, and nothing navigable. The reference existed and was verified; it simply had
no address.

Three questions had to be answered, and only the first is obvious.

## Decision

**1. GitHub Pages, deployed from the workflow.** `docs.yml` generates the reference and
uploads it with `upload-pages-artifact`/`deploy-pages`. No `gh-pages` branch: the output is
generated, and committing generated artifacts to keep a branch alive is the thing `.gitignore`
already says not to do.

**2. The trigger is a *published release*, not a tag push.** `release.yml` drafts a release on
the tag and a human presses "Publish" (AGENTS.md §11, ADR-0016). Hooking the docs to that same
human act means the site and the announcement move together, and the reference never describes
a version nobody can install yet — which a tag-push trigger would do for as long as the draft
sat unpublished. `workflow_dispatch` is also wired, so the site can be rebuilt without cutting
a release.

**3. The site documents the latest release only, and says which.** `typedoc.json` gains
`includeVersion: true`, so the header reads `egl-utils-js - v1.0.0` rather than leaving the
reader to guess. A versioned archive (`/v1.0.0/`, `/v0.9.0/`, a version picker) was considered
and rejected for now — see below.

**4. Enabling Pages stays a manual, documented, one-time step.** It cannot be done from the
workflow: `configure-pages`' `enablement` input requires `administration:write`, which is not a
permission `GITHUB_TOKEN` can be granted — only a PAT or GitHub App token, and carrying one as
a repository secret is a poor trade for a single setting. So the workflow **checks** instead,
and fails with the exact `gh api` command in its error message, the way `release.yml` already
fails for missing release notes. `docs/workflow/github-setup.md` §4 carries the command; that
section previously described a *branch*-sourced site, which is the wrong shape here and is
corrected in the same PR.

## Alternatives Considered

- **A versioned archive with a picker.** The right answer eventually, and rejected now on
  cost/benefit: it needs a deploy scheme that preserves prior directories (Pages deployments
  replace the whole site, so it means either committing built docs or reassembling old versions
  on each deploy), plus a picker TypeDoc does not generate. For a library at its *first* stable
  release there is exactly one version worth reading. Revisit when 1.x has enough releases that
  someone is pinned to an old one — it is additive, and `includeVersion` means no published
  page is ever ambiguous about what it describes in the meantime.
- **Publish on tag push**, in `release.yml` itself. Simpler — one workflow, one trigger.
  Rejected: it decouples the site from the human publish gate, so a draft release left open for
  review would already have live docs.
- **Publish on every push to `main`.** Always current, and wrong for a *reference*: `main`
  carries unreleased breaking changes (this milestone alone has five), so the published docs
  would describe an API nobody can install. The README's `pnpm docs:api` line is the answer for
  reading the working tree.
- **A `gh-pages` branch via `peaceiris/actions-gh-pages`.** Works, and adds a third-party
  action plus generated artifacts in git history for no benefit over the first-party pair.
- **A PAT so the workflow can enable Pages itself.** Rejected per decision 4: a
  long-lived token with `administration:write` in the secrets, permanently, to save one command
  once.

## Consequences

- **One manual step before the first docs deploy**, and a legible failure if it is skipped:
  `gh api -X POST repos/:owner/:repo/pages -f build_type=workflow`. Recorded in
  `github-setup.md` §4 and in the workflow's own error output.
- The site lands at `https://danielpolowork.github.io/egl-utils-js/` and is linked from the top
  of the README, above the spec link — a consumer's first question is "what can I call", not
  "what was frozen".
- **No new gate, and no new build risk.** CI already builds the reference warning-free on every
  PR; this publishes the same artifact. A TypeDoc regression fails the PR, as it already did,
  rather than failing a release.
- `permissions` on the new workflow are `contents: read`, `pages: write`, `id-token: write` —
  no `contents: write`, because this workflow publishes a site and never a commit, a tag or a
  release.
- Concurrency is `group: pages, cancel-in-progress: false`, matching `release.yml`'s reasoning:
  a half-finished deploy is worse than a queued one.
- `includeVersion: true` changes the generated page titles, which is the point; the reference
  is regenerated per release so it takes effect immediately.

## References

- ROADMAP 17.3; `docs/releases/v1.0.0-readiness-review.md` §5.
- [ADR-0016](0016-release-pipeline-and-supply-chain.md); AGENTS.md §11 (the human publish gate).
- `docs/workflow/github-setup.md` §4; `.github/workflows/docs.yml`; `typedoc.json`.
