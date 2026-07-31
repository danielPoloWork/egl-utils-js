# Release Process

The mechanical step-by-step for cutting a release of `egl-utils-js`. The governance
(which SemVer level, how a fix flows, deprecation/security) is in
[`maintenance.md`](maintenance.md); the agent-vs-human boundary is
[`AGENTS.md`](../../AGENTS.md) §11.

## Versioning

**Semantic Versioning 2.0.0**, annotated tags `vMAJOR.MINOR.PATCH`. Start point:
pre-1.0 milestone-driven.

- Pre-1.0: `MINOR` bumps on each completed roadmap milestone; `PATCH` for hotfixes.
- Post-1.0: `MAJOR` for incompatible changes, `MINOR` for additions, `PATCH` for fixes.

## Cutting a release (the steps)

Versioning and the changelog are driven by **changesets** (roadmap 7.4, [ADR-0016](../adr/0016-release-pipeline-and-supply-chain.md)); publishing is a **manual dispatch**.

1. **Record intent as you go** — every PR with a user-visible change runs `pnpm changeset` and
   commits the generated file. This replaces hand-bumping the version constant.
2. **The Version PR opens itself** — on push to `main`, `release-version.yml` opens or updates
   *chore(release): version packages*, applying the accumulated changesets. Its
   `changeset:version` step also runs `tools/sync-version.mjs`, which propagates the new
   `package.json` version into `version.js` and the README badge (changesets does not touch
   them, and the consistency lint does not read `package.json` — see ADR-0016).
3. **Write the prose** — add `docs/changelog/v<MAJOR>/v<X.Y.Z>.md` and
   `docs/releases/v<X.Y.Z>.md`. These are deliberately not generated: they need words.
4. **Run the gates** — `python tools/consistency_lint.py` and `node tools/sync-version.mjs
   --check` must both pass.
5. **Merge the Version PR** — *the maintainer*. Merging does **not** publish anything.
6. **Tag** — the agent runs `git tag -a v<X.Y.Z>` and pushes it; `release.yml` drafts the
   GitHub Release.
7. **Publish the GitHub Release** — *the maintainer*.
8. **Publish to npm** — *the maintainer*, via the **publish** workflow (`workflow_dispatch`).
   Run it once with `dry-run` left **checked** to see exactly what would ship, then re-run with
   it unchecked.

## Repository setting required for the Version PR

`release-version.yml` pushes the `changeset-release/main` branch and then opens the Version PR.
Opening it needs **Settings → Actions → General → "Allow GitHub Actions to create and approve
pull requests"** enabled — the workflow's `pull-requests: write` permission is necessary but not
sufficient, because that repository/organisation toggle overrides it.

Without it the run fails at the last step with `GitHub Actions is not permitted to create or
approve pull requests`, **after** the branch has been pushed correctly with the full version
bump. Recovery is either enabling the setting and re-running the workflow, or opening the PR by
hand from the already-pushed branch — no work is lost either way. (Observed on the first run
that had a real bump to propose, roadmap 8.1.)

## One-time npm setup (before the first publish)

The publish workflow uses **npm trusted publishing (OIDC)**, so there is deliberately **no
`NPM_TOKEN` secret** to create — nothing to leak or rotate ([ADR-0016](../adr/0016-release-pipeline-and-supply-chain.md)).
On npmjs.com, configure a trusted publisher for `egl-utils-js`:

| Field | Value |
|---|---|
| Repository | `danielPoloWork/egl-utils-js` |
| Workflow | `.github/workflows/publish.yml` |

Provenance additionally requires the `repository` field in `package.json` to match that
repository **case-sensitively** — it does.

Optional hardening worth doing: add a GitHub **environment** with required reviewers and attach
it to the publish job, so a second person approves before the registry is touched.

## Boundary

| Action | Who |
|---|---|
| Record changesets, write changelog/notes prose | Agent |
| Bump the version (applied by the Version PR) | CI + **human merge** |
| Open / merge the release PR | **Human** |
| Create & push the annotated tag, then the **draft** release (CI drafts it on tag-push) | Agent |
| Publish the GitHub Release (click **Publish**) | **Human** |
| Publish to npm (dispatch the **publish** workflow) | **Human** |
| Build & attach artifacts | CI |


Agents never publish releases, never amend or delete published tags, and only delete-and-
repush an *unpublished* tag whose release run visibly failed.
