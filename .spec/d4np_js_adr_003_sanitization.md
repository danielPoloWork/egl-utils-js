# ADR-003: Sanitization — delegate to DOMPurify behind an allowlist wrapper

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-14 |
| **Related spec** | [d4np-js.md](../d4np-js.md) (§2 item 24, §4) |

## Context
v1 promised XSS prevention by "removing dangerous tags such as `<script>`". Blocklist tag-stripping is a **known-insufficient defense**: it misses event-handler attributes (`onerror=`), `javascript:` URIs, SVG/MathML vectors, and mutation XSS (payloads that become dangerous after browser re-parsing). Worse, v1 marketed the library as universal while sanitization without a DOM is undefined in Node. Shipping a homegrown sanitizer under a security claim is the single most dangerous line in the v1 spec — HTML sanitization is an adversarial, browser-parser-coupled problem with a dedicated research community around exactly one mainstream answer.

## Options considered

**A. Delegate to DOMPurify (optional peer dependency) behind a curated-allowlist wrapper, separate entry point** *(chosen)*
- ✅ DOMPurify is the industry-standard, actively maintained sanitizer with mXSS research behind it; the library contributes what it can own: a **default allowlist profile** (curated tags/attributes), a stable API, and typed configuration.
- ✅ As an optional **peerDependency** on the `d4np-js/sanitize` subpath, consumers who never sanitize pay zero bytes and zero audit surface (NFR-06).
- ✅ Node behavior becomes explicit instead of implied: documented as requiring a DOM (`jsdom`-backed DOMPurify) — a stated cost, not a silent gap.
- ❌ A peer dependency to document and version-range. Accepted: it is the entire point.

**B. Homegrown allowlist parser**
- ✅ No dependency.
- ❌ Building a sanitizer means owning an HTML parser aligned with browser re-parsing behavior — the mXSS attack class exists precisely because "parse once, filter, serialize" diverges from what browsers do. A utilities library cannot staff that arms race; any bug is a shipped XSS.

**C. Blocklist stripping (v1)**
- ❌ Known-bypassed by construction; would convert the library into a false-security liability. Rejected outright.

**D. Drop item 24 entirely**
- ✅ Cleanest scope.
- ❌ Consumers would each wire DOMPurify with ad-hoc configs; a curated, tested default profile is genuine value. Kept — but as delegation, not implementation.

## Decision
**Option A.** `sanitizeHtml(html, opts?)` in `d4np-js/sanitize`: wraps DOMPurify with a curated default profile (structural + formatting tags; `href/src` restricted to `https?:`/`mailto:`; all event handlers, `style`, and SVG/MathML off by default), typed options for extension, and hard **non-goals** in the docs: no CSS sanitization, no URL rewriting, no protection for content later inserted via `innerHTML` templating of *attributes*. Browser-first; Node usage documented with `jsdom`.

## Consequences
- The security claim becomes auditable: "DOMPurify vX range + this profile", with the profile snapshot-tested against the DOMPurify bypass corpus in CI.
- Root-entry consumers carry no sanitizer bytes or dependency; only `/sanitize` importers see the peer requirement (enforced by `peerDependenciesMeta` + a clear runtime error if missing).
- If DOMPurify's maintenance status ever changes, this ADR is the single decision point to revisit — the wrapper API insulates consumers.
