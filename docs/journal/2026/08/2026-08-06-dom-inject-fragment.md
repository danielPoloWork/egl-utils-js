# 2026-08-06 — The sanitize decision, and M11 complete (roadmap 11.3)

## What got done

- **`injectFragment`**, **`autoGrow`** and **`withUrlParams`** (F46–F48) on
  `egl-utils-js/dom`, in a new `dom-fragment.js` behind the existing barrel.
- **Milestone 11 is complete**: 11.1 (entry + `bindElements` + the floor-gate extension),
  11.2 (`delegate` + setters), 11.3 (this).
- 54 new tests plus four added to the Node-safety suite; **1100 tests green**, every new
  module at 100% statements, branches, functions and lines.
- [ADR-0030](../../../adr/0030-sanitize-is-a-required-parameter.md) and an **HTML fragments**
  trust boundary in the threat model, with a full STRIDE pass.

## The decision that mattered

`injectFragment` is one `fetch` plus one `innerHTML` assignment, and also the most reliable
way to introduce XSS. The real question was not how to write it but **what its default should
be**, because the default is what most callers ship. Both candidates are wrong:

- **Sanitize by default** — safe, and it silently makes `/dom` depend on the DOMPurify
  *optional* peer that ADR-0012 deliberately confined to `/sanitize`. An import would decide a
  dependency question, and NFR-06's promise about what the library requires would quietly
  stop being true.
- **Do not sanitize by default** — zero dependencies, and the caller who never read the docs
  gets the unsafe behaviour. The quiet path would be the dangerous one, which is the precise
  inversion of what a security-relevant default should do.

So there is **no default**: `sanitize` is required, and takes a sanitizer or the literal
`false`. The decision becomes explicit, reviewable, and greppable — `sanitize: false` is a
claim someone made, not an absence that reads like an oversight. Keeping the sanitizer a
*parameter* is what preserves the optional-peer boundary; dependency injection is doing
security work here, not just testability work.

## Other decisions

- **Errors propagate.** Non-2xx rejects with `HttpError` carrying status *and* body (the error
  page is usually the only explanation available, and it has already been read). No dialog,
  no swallow: a caller assembling a shell from several fragments can tell complete from
  partial.
- **`insertAdjacentHTML` for non-replace positions.** `innerHTML +=` re-serialises and
  re-parses everything already there, destroying nodes and their listeners. A test asserts the
  same node object *and* a live listener survive a `beforeend` insert.
- **`autoGrow` releases the inline height before measuring** — reading `scrollHeight` while a
  height is set measures that height, so the field could only ever grow. A test asserts the
  measurement sees `height: auto` on every pass.
- **`withUrlParams` splits the URL by hand** rather than using `new URL()`, which throws on a
  relative input without a base. That is what keeps it pure and usable during a server render,
  and building through `URLSearchParams` makes a double `?` impossible.
- **Nullish skips, never deletes** — the same contract as `urlSearchParams` (F17). Two
  functions doing adjacent jobs disagreeing about what `null` means would be worse than a
  missing feature.

## Measurements

| Import | Measured | Row |
|---|---|---|
| `/dom` full entry | 2100 B (was 1210 B) | 2.25 kB — re-baselined, inside NFR-12's 4 kB clause |
| `{ injectFragment }` | 595 B | 1 kB ✅ |
| `{ autoGrow }` | 542 B | 1 kB ✅ |
| `{ withUrlParams }` | 276 B | 1 kB ✅ |

## Lessons

- **The floor gate earned its keep for the second time in three items.** `getComputedStyle`
  failed the scan immediately, and the BCD path is `api.Window.getComputedStyle` — there is
  **no** `api.getComputedStyle` node, even though the function is called bare. Enumerating the
  candidate paths beats guessing.
- **An async export reports argument errors as rejections**, per the house convention
  (`retry` in `async.js`). Nine assertions were written as synchronous `toThrow` and failed as
  unhandled rejections; the fix was the tests, not the implementation — but it was worth
  checking the precedent rather than assuming.
- **A coverage miss can be the opposite branch of the one you expect.** The uncovered line in
  `autoGrow`'s default measurement was the *parseable* `line-height` path, not the fallback:
  jsdom computes `line-height: normal`, so only the fallbacks ran until a stub supplied a
  pixel value.

## Where the project stands

Specs 01–02 complete; **spec 03 half done — M11 complete, M12 and M13 remain**. v0.3.0 tagged,
its Release still a draft, and **nothing published to npm**.

⚠️ **GitHub Actions has processed no event for this repo since ~15:00.** 11.1 and 11.2 merged
to `main` with no CI run at all, and this branch will be the same. Every gate CI runs has been
verified locally; the two it cannot cover are the **Node 18/20/22 matrix** (this machine is
Node 24) and the **Playwright browser job**. M11 adds real browser-relevant behaviour
(`autoGrow` against actual layout, injected markup not executing), so extending the Playwright
suite is worth doing once Actions is back — it is currently listed under M13's verification but
belongs with M11 too.

## How the next session resumes

1. Wait for this PR to merge, and check whether CI has resumed.
2. **M11 is complete, so cut v0.4.0** — the documented pre-1.0 policy is one MINOR per
   milestone: `pnpm changeset:version`, restore the CHANGELOG skeleton by hand, write
   `docs/changelog/v0/v0.4.0.md` and `docs/releases/v0.4.0.md` (the release workflow hard-fails
   without the latter), one PR, then tag.
3. Then **12.1** on `feat/inline-alert`: the instance-based `inlineAlert` — per-instance timers
   and bindings, injected class/icon maps with framework-free defaults, `textContent` by
   default with an opt-in `{html, sanitize}` pair mirroring F47's contract. It sets the
   component template 12.2 and spec 04 copy, so it earns its own ADR. Next free number:
   **0031**.
