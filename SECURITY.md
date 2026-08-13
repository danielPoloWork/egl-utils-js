# Security Policy

## Supported versions

Until `egl-utils-js` reaches `v1.0.0`, only the latest released minor line receives
security fixes. After `1.0.0`, the supported window is defined in
[`docs/workflow/maintenance.md`](docs/workflow/maintenance.md).

| Version | Supported |
|---------|-----------|
| latest released `0.x` | ✅ |
| older `0.x` | ❌ |

## `sanitizeHtml` non-goals

`sanitizeHtml` (`egl-utils-js/sanitize`, [ADR-003](.spec/d4np_js_adr_003_sanitization.md),
[ADR-0012](docs/adr/0012-sanitize-default-profile.md)) delegates HTML sanitization to
[DOMPurify](https://github.com/cure53/DOMPurify) — an optional peer dependency — behind a
curated, deny-by-default allowlist. It is deliberately **not** a complete answer to every
HTML-related risk. Stated non-goals, so they are relied on knowingly rather than discovered
in an incident:

- **No CSS sanitization.** The `style` attribute and `<style>` element are not in the
  default allowlist at all (CSS-based exfiltration and clobbering are real vectors), but if
  you widen the profile to allow them yourself, their *contents* are not vetted.
- **No URL rewriting or link-safety policy.** `href`/`src` are restricted to
  `http:`/`https:`/`mailto:` schemes (blocking `javascript:`/`data:`), but a same-scheme URL
  to an attacker-controlled host — a tracking pixel, a phishing link — is not detected. A
  Content Security Policy is the right tool for that, not this function.
- **No protection for values interpolated into *attribute* positions by a templating
  layer downstream.** `sanitizeHtml` secures the HTML you give it; if a template then
  splices an *unsanitized* value into an attribute of that already-sanitized markup (e.g.
  `` `<a href="${sanitized}">` `` with `sanitized` reused as a raw string), that second
  interpolation is outside this function's reach. Sanitize once, at the trust boundary, and
  insert the result as HTML — never re-interpolate its output as a string template.
- **No streaming support** — the whole input is sanitized synchronously per call.
- **Browser-first.** In Node.js, `sanitizeHtml` requires an explicit DOM (pass a `jsdom`
  window via `options.window`); without one it throws rather than silently no-op'ing.
- **The peer's *reachability* is checked at the call, not at build time**
  ([ADR-0055](docs/adr/0055-the-sanitizer-s-peer-is-looked-up.md)). DOMPurify is looked up —
  `options.dompurify`, then `globalThis.DOMPurify` — so that this entry loads on a page with
  no bundler. The consequence worth knowing: a packaging mistake that a static import would
  have failed at build time now surfaces as `EGL_PEER_MISSING` at the first sanitize call.
  What does **not** change is that the failure is loud and typed — unsanitized HTML is never
  returned, and there is no configuration in which absence degrades to a pass-through.
- **DOMPurify version currency is the operator's responsibility.** The security guarantee
  is "DOMPurify within the declared peer range + this profile" — keeping the peer dependency
  updated is part of using this function safely, the same as any other security-relevant
  dependency. The range is **`^3.4.13`** (raised from `^3` in 17.11,
  [ADR-0051](docs/adr/0051-the-sanitizer-s-peer-range.md)): 3.4.13 is the first release
  without [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7), so the
  range excludes every version known-vulnerable when 1.0 froze it.

  **What that range is, and is not.** It is a *compatibility* statement, not a security
  mechanism. It cannot be a security mechanism, because raising a peer floor is a breaking
  change and this library will not ship a major per advisory — so an advisory published
  *after* 1.0 is yours to patch, and you can, because you own the dependency. That is what a
  peer dependency is for. What this project does on its side: the CI audit gate runs at
  `--audit-level moderate` (17.11) precisely so a finding on this peer is visible here too,
  since a DOMPurify advisory is the one that might mean `sanitizeHtml`'s own configuration
  needs to change.

The bypass-corpus regression suite (`src/test/fixtures/sanitize-bypass-corpus.js`, roadmap
6.5) validates the default profile against documented mXSS and sanitizer-bypass technique
classes in both jsdom and real browser engines (Chromium, Firefox, WebKit) — see
[ADR-0012](docs/adr/0012-sanitize-default-profile.md) for what it covers and what it
deliberately does not (it is not a substitute for the two points above).

## Reporting a vulnerability

**Do not open a public issue or PR for a security problem.** Report it privately via
[GitHub private vulnerability reporting](https://docs.github.com/code-security/security-advisories)
on this repository (**Security** tab → *Report a vulnerability*), to `danielPoloWork`.

Please include:

- the affected version(s) and platform/toolchain;
- a minimal reproduction (a failing test is ideal);
- the observed impact and, if known, the root cause.

## What to expect

1. **Acknowledgement** of the report.
2. **Triage & fix under embargo** on a private branch / draft advisory; the SemVer level of
   the fix is assessed by the decision tree in
   [`docs/workflow/maintenance.md`](docs/workflow/maintenance.md).
3. **Coordinated release**: the fix ships, then the advisory is published. The fix is
   recorded in `CHANGELOG.md` under a **Security** entry with the advisory / CVE reference.
4. **Backport** to every still-supported release line.

Thank you for reporting responsibly.
