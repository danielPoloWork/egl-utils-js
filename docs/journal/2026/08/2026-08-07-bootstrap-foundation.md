# 2026-08-07 — The builder contract, set by the Bootstrap atoms (roadmap 14.1)

## What got done

- New opt-in **`egl-utils-js/bootstrap`** entry (spec 04 F52–F60): `bootstrap.js` barrel +
  `bootstrap-elements.js`, with the four coordinated wiring edits (exports map, tsup entry,
  typedoc entryPoints, size-limit rows) and `bootstrap` declared as an **optional** peer
  (`^5`) beside `dompurify`.
- The **F52 builder contract**, which the remaining ~30 managers copy: real DOM nodes
  (never HTML strings), caller data via `textContent`/`setAttribute` only, markup behind
  the explicit `{html: true, sanitize}` pair, a `{class}` option applied last, one
  `DocumentFragment` per multi-node call, and `.element`/`destroy()` on instance builders.
- Eight atom builders: `bsIcon` (+ `bootstrapIconsSet` / `materialIconsSet` frozen data
  presets), `bsBadge`, `bsButton`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`,
  `bsProgress`, `bsPlaceholder`.
- 447 tests across three suites: behaviour/ARIA in jsdom, the **NFR-19 adversarial corpus**
  (the roadmap-6.5 bypass payloads pushed through every content-accepting option of every
  builder), and **NFR-20 Node-safety** in plain Node with no DOM. 100% statements,
  branches, functions and lines on the new module.
- [ADR-0037](../../../adr/0037-builder-contract-nodes-escape-and-the-atom-budget.md),
  patterns rows 15 (Adapter — icon sets) and 16 (DI — builder policy) plus a Rejected row
  for the fluent builder, a threat-model boundary + full STRIDE pass for rendered record
  data, README usage, CHANGELOG, changeset.

## Decisions taken

- **Escaping is structural, not remembered.** Builders return nodes precisely so there is
  no markup string for data to be interpolated into — the defect class this toolkit
  replaces. Verified by attack: the corpus is asserted inert, including a re-parse of
  `outerHTML` that closes the serialize-then-reparse (mXSS) class the payloads come from.
- **Three spec amendments, all in this PR** (the 12.1/13.2 practice): F52 gains
  `{document}` — "the target's own document" has no meaning for a builder with no target,
  and without the option NFR-20 would be satisfiable only in its diagnostic direction; F52
  also fixes that a bad class token is a `TypeError` naming the option, never the
  platform's `InvalidCharacterError`; F59 gains `format`, because `'25%'` is a
  human-readable string and NFR-21 requires those injected (the F51 `formatStatus`
  precedent).
- **The 1 kB atom clause moves to 1.2 kB, measured not guessed.** `bsCloseButton` — the
  simplest builder that still resolves a document, validates tokens and sets ARIA — is
  **813 B**, so four fifths of the old clause is contract NFR-19/20/21 impose. Five atoms
  fit 1 kB anyway; three land 5–101 B past it. **`bsButton` takes a named composing row at
  1.85 kB** (1688 B) because it composes `bsIcon` — F55 accepts an icon *name*, which is
  the point of the option. Trimming the error messages to fit was considered and rejected:
  they are what makes a `TypeError` actionable, and deleting an obligation to protect an
  estimate is the inversion ADR-0031 warned about.
- **An unnamed control is refused, not warned about.** An icon-only button or an unlabelled
  `role="group"` throws. A console warning ships the broken control.

## Lessons worth carrying

1. **Three of my own test assertions were wrong before the library was.** Each looked like a
   library defect and was not: `javascript:` inside an `aria-label` is inert text, so
   scanning *every* attribute for it is theatre — only URL-bearing attributes matter; a
   payload I labelled "whitespace-free" contained a space, so the token check rejected it
   correctly (the fix was a genuinely whitespace-free payload using `/` separators, which is
   a better test); and the HTML serializer escapes `"` but leaves `>` literal in an
   attribute value — correct, because the escaped quote is what makes the `>` inert. Verify
   the claim before trusting the assertion.
2. **A "simplification" can cost bytes.** Routing `bsIcon`'s class template through the
   shared tokeniser instead of its own loop *grew* it 23 B. Kept anyway — the class-token
   rules now live in exactly one place — but recorded, because it did not help the budget it
   was reached for.
3. **A coverage gap named a contract gap.** The one uncovered line was `applyClasses`'s
   extra-token loop, which meant the `{class}` option — part of F52 — had no test on any
   builder that uses it. The fix was covering the contract, not the line.
4. **An internal validation shortcut produced a misleading message.** `bsProgress` routed a
   non-numeric `value` through `update()` to reuse its check, so the error said
   `update(value) requires a number` for a mistake in `options.value`. Validate at the
   option that was passed.
5. **Sharing `dom-helpers.js` across two entries costs `/dom` 8 B** of tsup chunk plumbing
   (4718 → 4726 B, inside its unchanged clause). Recorded so a future reader does not
   mis-attribute a budget that moved for a build-graph reason rather than a code one.

## Where the project stands

M14 is **in progress**: 14.1 done, 14.2 (composites — `bsCard`, `bsListGroup`,
`bsBreadcrumb`, `bsAlert`, `bsPagination`) next. `/bootstrap` measures **2943 B** for all
eight atoms plus both presets against the entry's 15 kB clause, so the composites, `bsTable`
and the behaviour wrappers have room. ADRs through **0037, next free 0038**.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Start roadmap **14.2** on `feat/bootstrap-composites`: `bsCard`, `bsListGroup`,
   `bsBreadcrumb`, `bsAlert` (composing the F49 engine with Bootstrap presets) and
   `bsPagination` (standalone; M15's `bsTable` consumes it). They inherit the F52 contract,
   so the ADR there should only cover what is genuinely new — the composite slot shapes and
   `bsAlert`'s relationship to `inlineAlert`.
3. Note for 14.2: F61's card slots accept **arrays** of content, which `renderContent`
   does not handle yet — extend it there rather than speculatively now.
