# 2026-08-19 — Documenting the no-bundler routes (18.4)

## What got done

- **README section "Use from a browser, without npm"**, inserted between the Bootstrap
  toolkit usage examples and the Stability promise — documenting both no-bundler routes
  with version-pinned URLs: the deep-ESM route per entry, the F83 global artifact, how each
  optional peer is supplied on either route, and the cross-version rule (spec 05 F85).
- Forward-links added from the existing Sanitize and Bootstrap sections to the new section,
  rather than duplicating their examples.
- ROADMAP 18.4 checked, `CHANGELOG.md [Unreleased]` entry, journal entry.
- **No ADR.** The mechanism decisions this documents — the peer lookup (ADR-0041,
  ADR-0055), the artifact (ADR-0059), the CDN fields (ADR-0060) — are already recorded.
  This item writes down how to *use* what those items already decided.

## The one claim that got checked rather than assumed

Spec 05 F85 asks for the cross-version rule "because entries share content-hashed chunks".
That sentence was already true before this item — it is a fact about the build, not
something 18.4 introduces — but I read it as a claim to verify rather than a fact to quote.
Grepping the built `dist/esm/` chunk files: `errors.js`, `storage.js`, `text.js`, `net.js`,
`table.js`, `logging.js`, `bootstrap.js`, `dom.js`, `sanitize.js` and `index.js` all
reference `chunk-47ELFAOV.js` and/or `chunk-WCXINJV7.js`. The sharing is real, not a
plausible-sounding assertion — which is what makes the rule in the README concrete ("two
entries from the same version and the same CDN share one cached download") rather than a
hedge with nothing behind it.

## Two placement decisions

**Where the section goes.** After every `###` usage subsection (the last being Bootstrap),
before "Stability promise" — the same level as "Usage" itself, since this is a second
*consumption model* for the whole library rather than a feature of any one entry.

**Not duplicating the existing sanitize/bootstrap peer examples.** The Sanitize section
already had a no-bundler snippet (from the 17.6/18.1 work), using a local
`/node_modules/...` path rather than a version-pinned CDN URL — a different, legitimate
scenario (testing your own built `dist/` locally). Rather than write a second, competing
sanitize example in the new section, both existing sections gained a one-line forward link
to the canonical version-pinned pattern here.

## Version in the snippets

The examples pin `@1.1.0`. `package.json` is still `1.0.0` on `main`; `.changeset/` holds
two pending `minor` bumps (18.2's artifact, 18.3's CDN fields) and none pending `major` or
`patch`, so `1.1.0` is what the changeset-version tooling will actually propose next. The
snippets will need re-pinning if anything unexpected lands before that release — a fast,
mechanical fix if it ever comes up, not a design problem.

## Where the project stands

v1.0.0 released. M18 in progress: 18.1–18.4 done, 18.5 open. ADRs through 0060 (unchanged
by this item), next free 0061. `.changeset/` still holds the same two minors. Five
Dependabot PRs open and untouched.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **18.5** — the last item in M18: a Playwright matrix (three engines) that loads the
   package **as this documentation now says to** — the deep-ESM route with no import map,
   and the global artifact via a classic `<script src>` — asserting per route that the
   namespace/entry is reachable, `VERSION` matches, a builder renders, a peer-backed
   behavior works when its peer is loaded from a script tag, and peer absence surfaces as
   `EGL_PEER_MISSING` rather than a load failure (F86). It should also gate the transfer
   bytes for each documented path (F87), beside the existing 100 size rows.
3. The fixture 18.5 writes can mirror `src/test/browser/no-bundler-sanitize.html` (18.1) in
   shape — a page with no import map, one classic script or one `<script type="module">` —
   and should exercise the *exact* snippets this item just wrote, not paraphrases of them.
