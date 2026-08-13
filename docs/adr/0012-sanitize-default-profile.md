# ADR-0012: The curated sanitize profile — deny-by-default, and how DOMPurify is reached

- **Status:** Accepted; the *"how DOMPurify is reached"* half **superseded by
  [ADR-0055](0055-the-sanitizer-s-peer-is-looked-up.md)** (2026-08-12, roadmap 17.6)
- **Date:** 2026-07-30
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §2 item 24 (F24), `.spec` ADR-003 (delegate to DOMPurify — the *whether*), ADR-0004 (TypeError contract), ADR-0011 (secure-by-default precedent), ROADMAP 6.3, 6.5

> **Two subjects, one superseded.** The **curated deny-by-default profile** — the allowlists,
> the URI-scheme restriction, the `USE_PROFILES` refusal, the documented non-goals — is
> unchanged and this record remains authoritative for it. What ADR-0055 replaces is the
> *reach*: `import createDOMPurify from 'dompurify'` at module scope becomes a lookup
> (`options.dompurify` → `globalThis.DOMPurify` → `EGL_PEER_MISSING`), because a bare
> specifier cannot resolve on the bundler-free page spec 05 made a first-class consumer.

## Context

The imported **ADR-003** already settled the hard question: sanitization **delegates to
DOMPurify** as an optional `peerDependency` on a separate entry, because a homegrown
sanitizer means owning an HTML parser aligned with browser re-parsing, and the mXSS attack
class exists precisely because "parse once, filter, serialize" diverges from what browsers
do. That decision is not revisited here.

What ADR-003 left to implementation is everything this library actually *owns*, and it is
the part that carries the security promise:

1. **The default profile.** DOMPurify's own defaults are deliberately permissive — its
   built-in HTML profile admits `form`, `input`, `button`, `id`, `target`, `data-*`, and a
   broad URI scheme list. "Delegating to DOMPurify" with default config is therefore *not*
   the curated allowlist the spec asks for.
2. **How DOMPurify is reached** from a sync function, given that its default export has
   **two different shapes**: in a browser it is an instance already bound to `window` and
   exposing `sanitize`; in Node it is only a factory that needs a DOM.
3. **What the profile deliberately excludes**, so the exclusions are reviewable rather than
   accidental.

## Decision

### The profile is deny-by-default and explicit

`ALLOWED_TAGS` and `ALLOWED_ATTR` are supplied as curated lists (structural + formatting
elements; a small attribute set). Because an allowlist excludes everything unnamed **by
construction**, every `on*` handler, `style`, `<script>`, `<iframe>`, `<form>`, and every
SVG/MathML element is removed without being enumerated — and nothing new is admitted as HTML
gains elements.

**`USE_PROFILES` is deliberately not used.** Inside DOMPurify it *overrides* `ALLOWED_TAGS`
rather than intersecting with it, so `USE_PROFILES: { html: true }` would silently replace
this curated profile with DOMPurify's much broader built-in list — the exact failure mode of
a config that looks stricter than it is. Restricting to HTML is achieved by the allowlist
simply not naming `svg`/`math`.

Named exclusions, each for a reason:

| Excluded | Why |
|---|---|
| `script`, `style` | code execution; CSS sanitization is a stated non-goal |
| `iframe`, `object`, `embed` | framing and plugin content |
| `form`, `input`, `button`, `textarea` | phishing surface inside otherwise-trusted content |
| `svg`, `math` | their own mXSS vector classes (`animate`, `foreignObject`, text integration points) |
| `id` | DOM clobbering, plus duplicate-id collisions with the host page |
| `target` | reverse tabnabbing |
| `style` (attribute) | CSS-based exfiltration |
| `data-*` (default off) | an injection surface for frameworks that *read* data attributes, with no sanitization benefit |

`aria-*` **is** allowed: it is inert, and removing it would cost accessibility for no
security gain.

### URI schemes are restricted by a generated pattern that keeps relative URLs working

`href`/`src` are limited to `http:`/`https:`/`mailto:` (ADR-003) via `ALLOWED_URI_REGEXP`,
built from the scheme list at call time. The pattern mirrors the structure of DOMPurify's own
default so **relative** URLs (`/x`, `./x`, `#frag`, `?q=`, `page.html`) remain usable while
absolute ones must name an allowed scheme — this is what stops `javascript:` and `data:`.
Caller-supplied scheme names are validated against a strict shape (`[a-z][a-z0-9+.-]*`) and
escaped, so a config value can never inject regex syntax into the pattern.

### DOMPurify is resolved lazily, and the two export shapes are handled explicitly

Resolution happens on **first use**, never at module load (so the module keeps
`sideEffects: false`, NFR-02, and the environment may be prepared after the import), and is
memoized per window:

- an explicit `options.window` → `createDOMPurify(window)` (the documented Node path);
- otherwise, if the default export already exposes `sanitize` → use it (the browser path,
  zero configuration);
- otherwise, if an **ambient** `globalThis.window` with a `document` exists → bind to it
  (the `global-jsdom` pattern, where the global is installed *after* this import);
- otherwise → **`TypeError` naming the remedy**, including the `jsdom` snippet.

A missing DOM and a missing peer are **environment/setup mistakes, not runtime domain
failures**, so both surface as `TypeError` per the ADR-0004 split. No new error code is
introduced — the `EGL_*` taxonomy in spec §5 is frozen, and adding one would be
MAJOR-relevant for no benefit.

### The profile is inspectable and frozen

`defaultSanitizeProfile` exports the curated lists, deeply frozen: they are the library's
security promise, so a consumer must not be able to mutate them at a distance (a pushed
`'script'` would silently weaken every later call). Caller-supplied arrays are copied before
being handed to DOMPurify, so mutating them afterwards cannot affect subsequent calls either.

Extension is two explicit, mutually exclusive intents: `additionalTags`/`additionalAttributes`
**extend** the curated profile, while `allowedTags`/`allowedAttributes` **replace** it.
Passing both is a `TypeError` rather than a silent precedence rule.

## Consequences

- The security claim is auditable exactly as ADR-003 intended: "DOMPurify ^3 + this profile",
  where the profile is a frozen, exported, test-asserted list rather than prose.
- Consumers get a safe default with no configuration in a browser; Node users pay one
  documented line (`{ window: new JSDOM('').window }`) instead of a silent gap.
- `/sanitize` stays 1.46 kB — DOMPurify remains external and unbundled, so the size budget
  measures the wrapper, and root-entry consumers carry nothing (NFR-06 gate unchanged: the
  peer is never a `dependencies` entry).
- **Verification is layered.** The invariant this PR proves is *inertness*: for any
  composition of hostile fragments, and for arbitrary binary strings, the output contains no
  forbidden element, no `on*` attribute, and no `javascript:`/`data:` URL — asserted
  **structurally**, by re-parsing the output, because a sanitizer is *supposed* to preserve
  text (output containing the characters `alert(1)` as text is correct; a surviving `onerror`
  is not). The exhaustive **bypass-corpus snapshots are roadmap 6.5**, and real-browser
  Chromium/Firefox/WebKit runs are **6.4** — this item's jsdom coverage is not a substitute
  for either, and saying so is part of the honesty of the claim.
- `jsdom` is pinned to `^26` as a devDependency: 27+ requires Node ≥ 20 and would break the
  Node 18 floor. It is added to the Dependabot `ignore` list for the same reason as the
  other engine-floor-sensitive tools (PR #46).

## Alternatives considered

- **DOMPurify with its default configuration** — "delegation" in name only: the built-in
  profile admits `form`/`input`/`id`/`target`/`data-*` and a wide scheme list, so the
  library would ship no curated promise at all while appearing to.
- **`USE_PROFILES: { html: true }`** — reads as a strictness switch but *overrides*
  `ALLOWED_TAGS` internally, silently discarding the curated lists. Rejected on inspection of
  DOMPurify's config parsing; the allowlist achieves HTML-only restriction directly.
- **A static hard dependency on DOMPurify** — would pull a sanitizer into every consumer's
  tree, breaking NFR-06's spirit and ADR-003's "zero bytes if you never sanitize".
- **An async API resolving DOMPurify via dynamic `import()`** — would let the missing-peer
  case be caught and rethrown nicely, but makes `sanitizeHtml` async, diverging from the
  spec's signature and forcing `await` into every render path. The `TypeError` with the jsdom
  remedy covers the realistic failure (no DOM) without that cost.
- **Allowing `style` with CSS sanitization** — CSS sanitization is explicitly a non-goal
  (ADR-003); allowing the attribute without it would be a false promise, so the attribute is
  simply excluded.
- **Allowing `target` with an automatic `rel="noopener"`** — plausible, but it means the
  wrapper silently rewrites content, and URL/link rewriting is a stated non-goal. Callers who
  want it can add `target` and their own `rel` explicitly.
