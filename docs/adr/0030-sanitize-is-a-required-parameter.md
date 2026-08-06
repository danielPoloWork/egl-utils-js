# ADR-0030: The sanitizer is a required parameter, not a default

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (maintainer), agent (senior project architect persona)
- **Related:** [spec 03](../specs/03_spec_dom_ui_table.md) §2 F46–F48; ROADMAP 11.3;
  [ADR-0012](0012-sanitize-default-profile.md) (the curated sanitize profile and the
  optional-peer boundary this must not cross), [ADR-0007](0007-http-client-facade-contract.md)
  (the injected-`fetch` convention reused here),
  [ADR-0029](0029-delegation-teardown-and-setter-symmetry.md) (the teardown and symmetry
  discipline `autoGrow` follows), spec 01 NFR-06 (zero runtime dependencies)

## Context

`injectFragment` fetches HTML from a URL and puts it in the page. That is one line of
`fetch` plus one assignment to `innerHTML`, and it is also the single most reliable way to
introduce an XSS vulnerability into an application. The interesting question is not how to
write it but **what its default should be**, because whatever the default is will be what
most callers ship.

There are exactly two candidate defaults and both are wrong:

- **Sanitize by default.** Safe, and it silently makes `/dom` depend on DOMPurify — an
  *optional* peer that ADR-0012 deliberately confined to the `/sanitize` entry so that
  consumers who never sanitize pay neither the bytes nor the audit surface. A default here
  would drag that dependency into every `/dom` import and quietly break NFR-06's promise
  about what the library requires.
- **Do not sanitize by default.** Zero dependencies, and it makes the dangerous choice the
  quiet one. The caller who never read the docs gets the unsafe behaviour, which is the
  precise inversion of what a security-relevant default should do.

Two smaller decisions travel with it: how a textarea measures itself where no layout exists,
and how to add a query parameter to a URL that may already have one.

## Decision

**1. `sanitize` is a required option with no default.** Pass a sanitizer function — typically
`sanitizeHtml` from `egl-utils-js/sanitize` — or the literal `false` to state that the source
is trusted. Omitting it throws `TypeError` with a message naming both choices.

This makes the decision **explicit and greppable**: `sanitize: false` is a reviewable claim
sitting at the call site, not an absence that reads like an oversight. It also keeps the
sanitizer a *parameter*, so `/dom` never imports `/sanitize` and the optional-peer boundary
ADR-0012 drew stays intact — the same reason `createResource` takes its client as an argument
(ADR-0025) and `httpClient` takes its `fetch` (ADR-0007). Dependency injection is doing
security work here, not just testability work.

**2. Errors propagate; nothing is swallowed.** A non-2xx rejects with `HttpError` carrying the
status and the body text (the error page is usually the only explanation available, and it has
already been read). A network failure or abort rejects with whatever `fetch` produced. No
dialog, no `console.error` swallow: a caller assembling a shell from several fragments must be
able to tell a complete render from a partial one, which is impossible if the failure never
leaves the function.

Validation errors arrive as **rejections**, not synchronous throws — the house convention for
an `async` export (`retry` in `async.js` does the same), so `@throws {TypeError}` on an async
function means "rejects with".

**3. Non-replace insertion uses `insertAdjacentHTML`.** `innerHTML +=` re-serialises and
re-parses everything already in the target, destroying existing nodes and every listener bound
to them. `insertAdjacentHTML` parses only the new markup and appends nodes, so existing
content survives — a test asserts the same node object and a live listener both persist across
a `beforeend` insert.

**4. `autoGrow` releases the inline height before measuring, and reads layout through an
injectable seam.** The ordering is the part that is easy to get wrong: reading `scrollHeight`
while an explicit height is set measures *that height*, so the field can only ever grow. Each
pass therefore clears the inline height, measures, then writes.

The `measure` seam exists for two reasons that happen to coincide: jsdom reports every height
as `0`, so without it none of this behaviour is verifiable off a real browser; and it is the
only part that needs `getComputedStyle`, so injecting it makes the platform dependency
optional rather than structural. Detaching restores the original inline `height` and
`overflow-y` exactly, so attach/detach is symmetric — the same discipline ADR-0029 applied to
`setVisible`.

**5. `withUrlParams` builds through `URLSearchParams` over a hand-split URL.** The obvious
one-liner — `` `${url}?${params}` `` — produces a second `?` the moment the URL already has a
query string, and the malformed result usually still "works" against a lenient server, so the
bug ships. Splitting on `#` and `?` by hand rather than using `new URL()` is what makes a
**relative** URL work: `new URL('/a?b=1')` throws without a base, and requiring a base would
make a pure function depend on `location`.

Nullish values are **skipped, not deleted** — the same contract as `urlSearchParams` (F17).
Consistency across two functions that do adjacent jobs matters more than the convenience of a
delete channel; to drop a key, build the URL without it.

## Alternatives Considered

- **Sanitize by default** — see Context: it crosses the optional-peer boundary ADR-0012 drew
  and makes an import decide a dependency question.
- **No sanitizing by default**, documented loudly. Rejected: documentation does not run, and
  the quiet path would be the unsafe one.
- **A `dangerouslySetRawHtml` variant** as a second exported function instead of
  `sanitize: false`. Genuinely explicit, and it doubles the surface for one boolean while
  making the safe and unsafe paths *different functions* that drift apart. One function with a
  mandatory decision keeps them in step.
- **Accept a DOM node or DocumentFragment instead of a string** from the sanitizer, to avoid a
  second parse. Cleaner in principle; rejected because `sanitizeHtml` returns a string, and
  matching the library's own sanitizer matters more than saving one parse of a fragment.
- **Checking the response `Content-Type` for `text/html`.** Considered and dropped: real
  fragment endpoints serve `text/plain`, `application/octet-stream`, and no type at all, so
  the check would reject working setups while adding no safety the sanitizer does not already
  provide.
- **Reading layout directly in `autoGrow`, with no seam.** Fewer options, and it makes the
  function unverifiable outside a browser and hard-binds `getComputedStyle`.
- **`requestAnimationFrame`-batching the resize.** A real optimisation for a field being
  typed into quickly, and premature here: it adds a frame of latency and a second teardown
  path for a measurement that is already cheap. Recorded for a future item if a benchmark ever
  asks for it.
- **`new URL(url, location.href)` in `withUrlParams`.** Shorter, and it forfeits purity and
  SSR-safety for a function whose whole value is being usable anywhere.
- **Nullish deletes the key.** Useful, and inconsistent with F17 — two functions in one
  library disagreeing about what `null` means is worse than a missing feature.

## Consequences

- Every `injectFragment` call site carries a visible security decision. A reviewer greps
  `sanitize: false` to find every place the library was told to trust remote markup.
- `/dom` still has **no dependency on `/sanitize`** and no peer requirement: the sanitizer
  arrives as an argument. NFR-06 holds unchanged.
- A failed fragment fetch is diagnosable and attributable — status and body on a typed error
  with a stable code — rather than a half-rendered page and a console line.
- `autoGrow` is fully testable without a browser, and the `maxRows` cap degrades to "no cap"
  rather than to `NaNpx` when line metrics are unavailable (both fallbacks are pinned by
  tests; the parseable path needed an explicit stub because jsdom computes `line-height:
  normal`).
- `withUrlParams` cannot produce a double `?`, and works on relative URLs — including during a
  server render.
- `/dom` grows 1210 B → **2100 B** (row re-baselined to 2.25 kB, still inside NFR-12's 4 kB
  clause); `injectFragment` 595 B, `autoGrow` 542 B, `withUrlParams` 276 B — every plain
  function inside its 1 kB clause.
- The inventory gains `getComputedStyle`, guarded by the `measure` seam, and its BCD path is
  `api.Window.getComputedStyle` — there is **no** `api.getComputedStyle` node even though the
  function is called bare. Worth recording: the gate extended in 11.1 caught this immediately,
  which is the second time in three items that it has forced a real declaration rather than an
  assumption.
- The threat model gains an **HTML fragments** boundary with a full STRIDE pass, including the
  explicit statement that the library performs no sanitizing of its own on this path — it
  routes markup through whatever the caller supplied.

## References

- [spec 03 §2 F46–F48](../specs/03_spec_dom_ui_table.md) — the contract
- [ADR-0012](0012-sanitize-default-profile.md) — the curated profile and the optional-peer
  boundary this decision protects
- [ADR-0029](0029-delegation-teardown-and-setter-symmetry.md) — the symmetry and teardown
  discipline `autoGrow` inherits
- [`docs/security/threat-model.md`](../security/threat-model.md) — the HTML-fragments boundary
- [MDN: `Element.insertAdjacentHTML`](https://developer.mozilla.org/docs/Web/API/Element/insertAdjacentHTML)
  — why it is not `innerHTML +=`
