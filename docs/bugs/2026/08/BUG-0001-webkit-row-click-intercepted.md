---
id: BUG-0001
title: WebKit browser smoke fails — a <tr> click target is intercepted by <table>
status: open
severity: low
reporter: internal
discovered: 2026-08-07
affected-versions: none released — the defect is in the test suite, not in shipped code
fixed-in:
---

# BUG-0001: WebKit browser smoke fails — a `<tr>` click target is intercepted by `<table>`

## Summary

The `browser` CI job has been red on `main` since roadmap 13.2 merged (PR #86). One
Playwright case fails on **WebKit only** — `smoke.spec.js` › *"one delegated listener
survives every re-render of the rows"* — timing out after 30 s while trying to click a table
row. Chromium and Firefox pass. **No shipped code is affected**: the defect is in how the
test aims its click, and the library behaviour the test exists to prove is in fact working.

## Environment

- **Affected versions:** none released — test-suite only, present from 13.2 onward
- **Toolchain / platform:** **CI only.** Deterministic on Playwright WebKit on
  `ubuntu-24.04` / Node 20 — observed on three separate runs (PR #86's pre-merge run, and
  `main` after it), retrying for the full 30 s timeout each time. **Corrected on
  investigation:** it does *not* reproduce on this project's Windows workstation, where the
  local WebKit build passes the case *even with the original `<tr>` target*. The engine
  family is not the discriminator; the specific build and its layout metrics are.
  (Playwright's **Firefox** is what cannot launch here — `browserType.launch: spawn UNKNOWN`;
  Chromium and WebKit both run. So local browser runs are two-thirds of the story, not
  one-third as first recorded.)
- **Configuration:** `pnpm test:browser`, default `playwright.config.js`

## Reproduction

`src/test/browser/smoke.spec.js` (the case at *"one delegated listener survives every
re-render of the rows"*):

```js
await page.click('#rows tr:first-child');            // passes — #opened becomes 'Charlie'
await expect(page.locator('#opened')).toHaveText('Charlie');

await page.click('th[data-sort-key="name"]');        // sort: every row node is replaced
await page.click('#rows tr:first-child');            // WebKit: times out here
await expect(page.locator('#opened')).toHaveText('ada');
```

Playwright's call log names the cause exactly:

```text
- locator resolved to <tr data-name="ada">…</tr>
- element is visible, enabled and stable
- scrolling into view if needed
- <table>…</table> intercepts pointer events
- retrying click action
```

## Expected vs. actual

- **Expected:** clicking the first row reaches the delegated listener on `#rows`, which sets
  `#opened` to the row's `data-name`.
- **Actual:** on WebKit the click is never dispatched. Playwright hit-tests the geometric
  centre of the `<tr>`, WebKit returns the ancestor `<table>` as the topmost element there,
  and Playwright refuses to click through an intercepting element — retrying for the full
  30 s timeout.

## Root cause

A **test-aiming defect**, not a library defect. `<tr>` is a layout-transparent row container,
so where its centre point hit-tests is not something the standard pins down: on the CI
WebKit build it resolves to the ancestor `<table>`, which Playwright then treats as an
intercepting element and refuses to click through. The test depended on that
build-specific behaviour rather than on anything `delegate` or `bindTableControls` does —
which is also why it passes locally on a different WebKit build, and why "it works on my
machine" was never evidence here.

That `delegate` itself works is proved by the same test: the *first* click — before the sort
re-render — updates `#opened` correctly, and the jsdom suites cover the re-render case
directly. Nothing in F44/F51 is implicated.

## Impact

- **CI:** the `browser` job is red on `main` and on every branch cut from it, so a genuine
  browser regression would now arrive in an already-red gate — the real cost, and why this is
  recorded rather than left as folklore.
- **Consumers:** none. No shipped behaviour differs on WebKit; the library's delegation works
  in all three engines.

Severity is `low` on consumer impact, but the gate's credibility makes it worth fixing
promptly.

## Fix / workaround

Aim the click at a cell rather than the row — `#rows tr:first-child td`. That removes the
dependency on how a `<tr>`'s centre hit-tests, and it is a better model of a real user, who
clicks a cell and relies on the event bubbling to the delegated listener on `#rows` — which
is precisely the behaviour the test exists to prove. (Dispatching the event programmatically
would also pass, but it would stop exercising real hit-testing, the point of a browser
suite.)

**Verification is CI's, not the workstation's.** Because the defect does not reproduce
locally, a local pass cannot demonstrate the fix; it only demonstrates non-regression
(Chromium and WebKit both green on the case here, before and after). The proof is the
`browser` job on the fixing PR — the same job that has been red on `main` since 13.2.

## References

- Fixing PR: _open_
- `CHANGELOG` entry: _open_
- Related: roadmap 13.2 (PR #86, where the case was added), spec 03 F44/F51,
  [ADR-0029](../../../adr/0029-delegation-teardown-and-setter-symmetry.md)
