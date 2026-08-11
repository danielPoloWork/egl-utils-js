# ADR-0051: The sanitizer's peer range is compatibility, not security

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** Daniel Polo
- **Related:** ROADMAP 17.11, filed by the
  [v1.0.0 readiness review](../releases/v1.0.0-readiness-review.md) §2.8;
  [ADR-0012](0012-sanitize-default-profile.md) (why DOMPurify is a peer at all),
  [ADR-0016](0016-release-pipeline-and-supply-chain.md) (the audit gate, whose threshold moves
  here), [ADR-0026](0026-brace-expansion-override-replaces-the-audit-exception.md) and
  [ADR-0033](0033-js-yaml-overrides-stay-inside-their-major-line.md) (fix with an override
  rather than except with an ignore — the precedent this follows); `SECURITY.md` amended

## Context

`peerDependencies.dompurify` is `^3`. The readiness review found what that admits:

- **GHSA-55q2-fjhq-7xh7** (moderate) affects `dompurify <= 3.4.12`, patched in **3.4.13**.
- This repository's own lockfile resolved to **exactly 3.4.12** — the last vulnerable version
  — so every test run and every browser cell exercised it.
- `pnpm audit --audit-level high` **passed**, because the advisory is moderate. The gate was
  working as configured; the configuration is the finding.

Two things make this worth a decision rather than a version bump.

**`/sanitize` is the security entry.** The whole reason DOMPurify is a peer and not a
dependency (ADR-0012) is that sanitization is delegated to the specialist. A library that
delegates its security to a peer and then declares a range half of which is known-vulnerable
is making a weaker promise than it looks like it is making.

**After 1.0, narrowing a peer range is breaking.** So whatever `^3` becomes, it becomes
permanently — and the mechanism has to be chosen knowing that.

Worth stating plainly, because it changes the severity and not the decision: **this library is
not exposed by that specific advisory.** It concerns DOMPurify's `IN_PLACE` mode, and
`sanitizeHtml` pins `IN_PLACE: false`, `RETURN_DOM: false` and `RETURN_DOM_FRAGMENT: false`
explicitly. The finding is about the range and the gate, not about a reachable bug.

## Decision

### 1. The peer range becomes `^3.4.13`

3.4.13 is the first release without the advisory, so the range **excludes every version known
vulnerable at the moment 1.0 freezes it**. The devDependency and the lockfile move with it, so
the tree the tests and the browser cells exercise is inside the range the package declares —
which it was not.

### 2. The range is a compatibility statement, and the reasoning is written down

This is the part that matters more than the number. **A peer range cannot be this library's
security mechanism**, because raising a floor is breaking and this project will not ship a
major per advisory. It follows that:

- the floor's job is to exclude what is **already known bad at 1.0** — a one-time act, done
  here;
- an advisory published **after** 1.0 is the consumer's to patch, and they *can*, because they
  own the dependency. That is what a peer dependency is;
- chasing advisories through the peer range would be a treadmill that pays in major versions,
  and it would still be slower than the consumer's own `npm audit`.

Recorded in `SECURITY.md` beside the existing "version currency is the operator's
responsibility" clause, which said the right thing without saying why.

### 3. The audit gate moves to `--audit-level moderate`

The review's question was whether `high` should stand when a moderate advisory sits on the
sanitizer's peer. It should not — and the reason is narrower than "moderates matter": **a
DOMPurify advisory is the one finding in this tree that can change this library's own code.**
If a bypass involves a configuration surface `sanitizeHtml` sets, the fix is ours, not the
consumer's. A gate that cannot see it is the wrong gate.

The two dev-only advisories the lower threshold then surfaces are **fixed rather than
excepted**, following ADR-0026's precedent (an override that removes the advisory beats an
`ignoreGhsas` entry that hides it):

| Advisory | Path | Fix |
|---|---|---|
| `postcss <= 8.5.22` (moderate) | `tsup > postcss` | override `postcss@<8.5.23` → `>=8.5.23` (resolves 8.5.26) |
| `esbuild >=0.27.3 <0.28.1` (low) | `tsup > esbuild` | override → `>=0.28.1` (resolves 0.28.1) |

`pnpm.auditConfig.ignoreGhsas` therefore stays **empty**: nothing is suppressed, and
`pnpm audit --audit-level moderate` reports *No known vulnerabilities found*. The esbuild
override crosses a build tool's own dependency range, so it was verified rather than assumed —
build, 2372 tests and all 98 size rows are unchanged on 0.28.1.

## Alternatives Considered

- **Keep `^3`.** Rejected: it is the one range this library declares over a security-critical
  dependency, and 1.0 freezes it. "Our code is not exposed by this particular advisory" is true
  and does not answer what the range *claims*.
- **Pin the peer exactly (`3.4.13`).** Rejected: it forbids the consumer from taking DOMPurify's
  own security patches without waiting for us — the exact opposite of what a peer is for.
- **Widen to `>=3.4.13 <5`**, admitting a future DOMPurify 4. Rejected: a major of a sanitizer
  is precisely where the profile in ADR-0012 may stop meaning what it means. `<4` is a claim we
  can defend; `<5` is one we would be guessing at.
- **Leave the gate at `high` and rely on the peer floor.** Rejected: the floor is a one-time
  act, so without a gate change nothing here would ever see the *next* DOMPurify advisory —
  the one that might require a code change on our side.
- **Lower the gate to `low`.** Rejected for now: `low` on a dev-only path is noise this project
  has already decided against twice (ADR-0026, ADR-0033), and moderate is where the
  code-changing risk actually lives. Note it is only one word away if that judgement proves
  wrong.
- **Except the dev-only advisories with `ignoreGhsas` instead of overriding them.** Rejected on
  the ADR-0026 precedent: an override removes the vulnerable code from the tree; an exception
  removes the *report*.

## Consequences

- **Breaking for a consumer pinned below DOMPurify 3.4.13**: they get a peer-range warning on
  install. The remedy is the patch release that fixes a real advisory, so the pressure points
  the right way.
- The audit gate is stricter and currently **clean at moderate with zero exceptions** — the
  first time in this project's history that `ignoreGhsas` has been empty *and* the threshold
  below `high`.
- It will go red more often, for advisories in the build toolchain we do not ship. That is
  accepted: the answer each time is an override if one exists, a documented exception if not,
  and a decision either way rather than a threshold nobody revisits.
- One dev-only tool bump rides along (esbuild 0.27.x → 0.28.1, postcss → 8.5.26), verified
  against the full gate set rather than assumed.
- Not settled here: the `bootstrap` peer range (`^5`), which has no advisory and no security
  role — the same "compatibility, not security" reading applies to it, and no number moves.

## References

- [v1.0.0 readiness review](../releases/v1.0.0-readiness-review.md) §2.8.
- [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) — the DOMPurify
  advisory; `sanitizeHtml` pins `IN_PLACE: false`, so it is not reachable through this API.
- `SECURITY.md` — the peer-range policy, in the place a consumer reads.
