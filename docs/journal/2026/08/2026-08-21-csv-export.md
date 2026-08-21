# 2026-08-21 — A CSV is not an inert document (19.4)

## What got done

- **`table-csv.js`** — `tableCsv` (F96): RFC 4180, zero-dependency, pure, with formula
  injection neutralized by default.
- **`dom-clipboard.js`** — `copyToClipboard` (F97), and **`ClipboardError`**
  (`EGL_CLIPBOARD`) on `/errors` and the root.
- **44 tests** across three suites, one of them a property suite carrying its own RFC 4180
  parser, plus **3 Playwright cases**.
- **ADR-0066**, threat model extended with two new boundaries and twelve STRIDE rows, three
  api-floor entries, seven size rows moved or added, eight F87 routes re-pinned, README
  section, changeset.

## The decision that made the security default liveable

F96 asks for formula injection to be "neutralized by default … documented and defeatable", and
the OWASP prefix list is `= + - @ \t \r`. Implement that literally and **every negative number
in every export gets a `'` prefix**. A numeric column full of `'-5` is corrupt data, and a
mitigation that damages ordinary output is one people switch off wholesale — which leaves them
with no mitigation at all.

So: **a field whose whole text is a finite number is left alone.** `-5`, `+3.5`, `-1e6` are
data and pass through untouched; `-2+3+cmd|'/C calc'!A0` is not a number and is defused, as is
`- 5`. That one exception is the difference between a default people keep and a default people
disable, and it is the part of this item I spent the most time being sure about.

Two mitigations I checked and rejected, both of which *look* right:

- **Wrapping the field in quotes.** Quoting is the CSV grammar's own escaping and a spreadsheet
  strips it before evaluating, so `"=1+1"` still evaluates. It looks like a mitigation and is
  not one. Recorded in the ADR so nobody re-proposes it.
- **A leading space or tab instead of `'`.** Both change the value in ways a reader cannot
  distinguish from real data. `'` is the marker spreadsheets themselves use for "this is text"
  and is visibly deliberate in a diff.

## A test of mine was wrong before the code was

The first draft of the injection suite listed `+1` among the payloads. It failed — because `+1`
is a number, and the numeric exception left it alone, correctly. The tempting fix was to weaken
the exception until the test passed. The right fix was to move `+1` into the numeric-exception
case and use `+1+1` as the payload.

Worth writing down because the wrong repair was available and would have looked like progress:
a failing security test is not automatically a security hole.

## The clipboard, and what a real engine taught me

F97's requirement is that a refusal must not look like success, so every path is a typed
`ClipboardError` with a `reason` — `'insecure'` (serve over HTTPS), `'denied'` (the user's to
grant), `'unsupported'`, `'failed'`. And **no `execCommand` fallback**: it is deprecated,
silently unreliable, and would restore the exact ambiguity the requirement removes. A test
asserts it is never called.

Then WebKit taught me something the Node suite could not: **it resolves `writeText` and refuses
`readText`.** Writing is treated as safe; reading needs a user gesture. My first browser test
wrote, then read back to verify — and failed on WebKit for the reader's permission, not the
writer's. The fix is not to skip the engine: the test now asserts the outcome rather than the
engine name, so a resolve must have written exactly the text the grammar describes, a rejection
must be typed, and the read-back — the stronger check — is asserted where the platform allows
it and *reported* where it does not.

## The 19.8 gate paid for itself, one wave later

`navigator.clipboard` is read through optional chaining. That shape was invisible to the
api-floor scan until 19.8 fixed it, and this is the first new platform API since. The gate
flagged it on the **first run**, before I had written the inventory entry — which is what a
deny-by-default gate is supposed to feel like and had not, for the two waves before this one.

`Clipboard.writeText` and `isSecureContext` are hand-declared, for the shapes a text scanner
genuinely cannot see: the first because `clipboard` is not itself a policed global, the second
because it is read off the injected window.

## The artifact ceiling is now the wave's live constraint

31444 B at M18 → 33982 B (19.2) → 35671 B (19.3) → **36541 B (19.4)**. That is **91% of
NFR-22's 40 kB authoring ceiling**, with 19.5–19.7 to go and all three of them `bsTable`
features that land in this file. Flagged for the third time, with the arithmetic, in the size
row and in ADR-0066: the item that crosses it owes a decision — amend the clause with a
measured argument, or split the artifact — rather than meeting a red build.

Also caught while re-pinning: the **root row had zero headroom**. ADR-0053's 6.1 kB was exactly
the measured 6072 B plus 28, and `ClipboardError` reaching the root put it at precisely 6100 B.
A limit a change can land on *exactly* is a limit that fails the next unrelated PR, so it is
re-pinned to 6.25 kB.

## Measured

- Surface **119 → 123** (`tableCsv`, `copyToClipboard`, `ClipboardError` on both the root and
  `/errors`), additions only, run as a diff.
- `{tableCsv}` **796 B**, `{copyToClipboard}` **477 B** — most of the second is the refusal
  classification, which *is* the requirement.
- `/table` full import 6276 → **6861 B**; `/dom` 6448 → **6724 B**; `/errors` 351 → **377 B**,
  still inside spec 02 NFR-08's 0.4 kB clause with eleven classes.
- Eight F87 routes re-pinned. Six of them moved because the shared errors chunk grew, and their
  `measured` baselines are updated rather than left to report a drift already accounted for —
  the opposite call from 19.8, where a 7 B drift *was* the signal. Hundreds of bytes with a
  known cause is not.

## Where the project stands

v1.1.0 released; **M19: 19.1, 19.2, 19.3, 19.4 and 19.8 done, 19.5–19.7 open**. `.changeset/`
holds four minor entries, so the next release is v1.2.0. ADRs through 0066, next free 0067. Bug
ledger through BUG-0004. 2711 tests, every gate green locally except the Firefox Playwright
project, which cannot launch on this machine for any test.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **19.5, sticky header** (spec 06 F98) is next: within a caller-owned scroll container,
   **without per-frame layout measurement**, and without breaking the `aria-sort` and sort
   controls the header already carries. Likely `position: sticky` and nothing else, which is
   the point.
3. **Decide the artifact ceiling if 19.5 crosses it.** 3.5 kB of room left. The decision is
   NFR-22's, and it wants a measured argument either way — not a re-pin by reflex.
