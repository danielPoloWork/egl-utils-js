# ADR-0016: Release pipeline — trusted publishing, a manual trigger, and one documented advisory

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §7 (release engineering), AGENTS.md §11 (the human checkpoint), ADR-0015, ROADMAP 7.4

## Context

Roadmap 7.4 asks for three things: a changesets release pipeline, `npm publish --provenance`
from CI OIDC, and lockfile-only plus `npm audit` supply-chain gates. It is routed as a security
item because a release pipeline is the one piece of automation that can push code to strangers'
machines, and its failure modes are: publishing something unintended, leaking a long-lived
credential, or making a provenance claim that is not true.

Three constraints from this repository shaped every decision:

1. **AGENTS.md §11 makes publishing the human checkpoint.** Agents never publish.
2. **NFR-06 means zero runtime dependencies**, so the supply-chain surface is entirely
   dev-time tooling — which still executes in CI with repository write access, so it matters.
3. **`tools/consistency_lint.py` holds the version in lockstep** across `version.js`, the README
   badge, the changelog file and the release notes — but it never reads `package.json`.

## Decision

**1. Trusted publishing (OIDC), not an `NPM_TOKEN` secret.** Verified against npm's current
documentation: provenance requires npm ≥ 9.5, `id-token: write`, a GitHub-hosted runner, and
`--access public` on first publish; with trusted publishing, attestations are generated
automatically and **no access token is stored at all**. That removes an entire class of
incident — there is no long-lived credential to leak, rotate, or scope wrongly. `--provenance`
is still passed explicitly rather than relying on the implicit attestation, so the intent is
visible in the log and a registry-side configuration change cannot silently drop it.

**2. Publishing is `workflow_dispatch` only, and `dry-run` defaults to true.** This departs
from the changesets convention of publishing when the Version PR merges. The reason is
behavioural, not technical: **merging happens by reflex, dispatching does not**, and a public
registry push is irreversible. `dry-run: true` by default means the careless path — dispatch,
confirm — does nothing irreversible; publishing requires deliberately unchecking a box. The
`changesets/action` is given **no `publish:` input**, so the capability is absent rather than
merely unused.

**3. Versioning and publishing are separated by file, not just by trigger.**
`release-version.yml` (on push to `main`) opens or updates the Version PR; `publish.yml`
(dispatch only) publishes. Someone auditing "what can push to npm?" reads one short file.

**4. The publish job re-earns its green.** It re-runs lint, the full suite with coverage,
the audit, and `check:package` rather than trusting the merge commit's CI result. Publishing is
irreversible, so it verifies rather than inherits.

**5. `tools/sync-version.mjs` closes a gap that adopting changesets would have opened.**
`changeset version` bumps `package.json` **and nothing else**. The consistency lint compares
`version.js`, the README badge, the changelog and the release notes *against each other* and
never reads `package.json` — so a bumped `package.json` alongside four stale files would have
been a **silent divergence with a green gate**. The tool propagates the version in the default
mode (wired into `changeset:version`) and asserts lockstep in `--check` mode (wired into the
consistency job). Verified both ways: a planted divergence exits 1, an aligned tree exits 0.
The changelog and release-notes files are deliberately **not** generated — they need prose a
human writes, and emitting empty ones to satisfy a lint is the box-ticking this project avoids.

**6. Supply-chain gates: `--frozen-lockfile` everywhere plus `pnpm audit --audit-level high`,
with exactly one documented exception.** Auditing found `GHSA-mh99-v99m-4gvg` —
`brace-expansion` DoS via unbounded expansion — reached by two dev-only paths
(`eslint > minimatch > brace-expansion` and `@vitest/coverage-v8 > test-exclude > glob >
minimatch > brace-expansion`). It is excepted via `pnpm.auditConfig.ignoreGhsas`, **per-GHSA so
anything else still fails** (verified: at `--audit-level low` the remaining low advisory still
exits 1, proving the exception is scoped and not a blanket suppression).

The exception is justified, not convenient:

- **It cannot be fixed here.** The patch line is `brace-expansion >= 5.0.8`, and v5 changed its
  export shape. Forcing it with a pnpm override was attempted and **breaks the toolchain**:
  `minimatch@9` fails with `brace_expansion_1.default is not a function`. The real fix is
  upstream — eslint and vitest moving to `minimatch@10`.
- **It is not reachable in this project's threat model.** The vector is a maliciously crafted
  glob pattern; the only glob patterns here come from our own config files. It is dev-time
  tooling processing our own repository.
- **It is never shipped.** NFR-06 guarantees zero runtime dependencies, and `files` publishes
  `dist` plus two shim sources — no dev dependency reaches a consumer.

## Consequences

- No npm credential exists in this repository's secrets, so none can be exfiltrated from it.
  The cost is a one-time maintainer setup on npmjs.com, documented in
  `docs/workflow/release.md`.
- The audit gate can go red because the world changed rather than because a PR did. That is
  accepted as the nature of a supply-chain gate; the failure is legible in its own job, and the
  escape hatch (a per-GHSA exception **with a written justification**) is deliberately more
  effort than fixing the dependency.
- `docs/workflow/release.md` is rewritten: steps 1–2 of the old manual process (hand-bump the
  version constant, hand-roll the changelog) are now `pnpm changeset` plus the Version PR.
- A latent bug was fixed in passing: `release.yml` referenced `matrix.toolchain` in a job with
  **no matrix**, working only by falling through to its default. The M1.4 changelog records
  fixing exactly this defect in the benchmark job; this occurrence was missed then.

## Alternatives considered

- **`NPM_TOKEN` secret with `--provenance`** — the common pattern, and it works. Rejected as
  the less secure option now that trusted publishing exists: a granular automation token is
  still a long-lived credential sitting in repository secrets, and the whole point of OIDC is
  not having one.
- **Publish on Version PR merge** (the changesets default) — fewer clicks, and it makes merging
  a publish. Rejected against AGENTS.md §11 and because the blast radius of a reflex merge is a
  public, immutable registry entry.
- **Publish on tag push**, reusing `release.yml`'s trigger — coherent with the existing draft
  flow, but tags get pushed by scripts and by mistake. Dispatch is a worse fit for automation
  and a better fit for a decision, which is the point.
- **Lower the audit threshold to `critical`** — would have made the gate green with no
  exception file and no explanation. Rejected: it silently redefines the requirement, the exact
  failure mode ADR-0014 rejected for the benchmark threshold.
- **Force `brace-expansion >= 5.0.8` with a pnpm override** — the correct instinct, attempted,
  and it breaks `minimatch@9` at runtime. Rejected on evidence rather than on principle.
- **Let changesets own the version and delete the lockstep lint** — one source of truth is
  appealing, but the lint also holds the changelog and release notes together, which changesets
  does not. Keeping both plus a propagation step preserves more invariants than it costs.
