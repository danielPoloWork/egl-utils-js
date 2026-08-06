# 2026-08-06 — The /logging subpath, and spec 02 complete (roadmap 10.1)

## What got done

- **`egl-utils-js/logging`** landed (spec 02 F40–F41): `logger`, `formatLogLine`,
  `formatTimestamp`, `LOG_LEVELS` — the fifth new entry of the wave and the last item of
  spec 02. Milestone 10 is complete, so **every F26–F41 requirement is delivered**.
- Entry wiring: `package.json` exports, `tsup.config.js` entry, `typedoc.json`
  entryPoints, five `.size-limit.json` rows.
- 91 tests (85 example + 6 property) at **100% statements, branches, functions and lines**
  for the module. The property suite proves three laws: one record renders as exactly one
  line for arbitrary strings, a timestamp is always 23 or 19 code units and never ends on
  a separator, and the threshold gates exactly the levels below it (parent and child
  identically).
- [ADR-0027](../../../adr/0027-logging-formatter-sink-split.md) records the four decisions
  hiding inside "print a line": threshold vs flags, sink vs formatter, explicit vs
  reflected context, and containment.
- Catalogue: rows 8 (**Strategy** — sink & formatter) and 9 (**Facade** — logger), plus
  the catalogue's **first Rejected row**: Singleton, considered for a module-level default
  logger.

## Decisions taken

- **`sink(record, format)`** — the sink receives the formatter rather than a pre-built
  line. A structured transport ignores it and pays nothing; a text sink calls it. The two
  alternatives each break one case: pre-formatting wastes work for JSON sinks, and
  omitting `format` means a custom text sink silently loses the configured line shape.
- **Explicit `child('db')`** over reflection-based context capture. Inference from
  `this`/`fn.name` reads better at the call site and fails silently under minification —
  in production only, corrupting every line at once.
- **CR/LF stripped from `name` and `id` too**, one step beyond what F41 required: an id
  comes from an *injected function*, so treating only the message would leave the
  forged-line hole half open. The guarantee is now total and property-tested; F41 and the
  ADR record the strengthening.
- **Name column is right-aligned and cut from the left.** Found while writing the tests:
  truncating a dotted name from the start while padding left meant the informative tail
  did not line up between rows. Truncate-start plus align-right puts every tail on the
  same column.
- **Local time**, not UTC — these lines are read next to the process that wrote them; a
  consumer needing UTC injects `format` or reads `record.ts` (plain epoch ms).
- **No module-level default logger** (see the Rejected row): module-scope mutable state is
  the dual-package hazard spec 01 §4 forbids, and it makes tests order-dependent.

## Measurements

| Import | Measured | Row |
|---|---|---|
| `/logging` full entry | 1390 B | 1.45 kB (clause 1.6 kB) |
| `{ logger }` | 1361 B | 1.45 kB — **documented NFR-08 exception, ADR-0027** |
| `{ formatLogLine }` | 876 B | 1 kB ✅ |
| `{ formatTimestamp }` | 301 B | 1 kB ✅ |
| `{ LOG_LEVELS }` | 60 B | 1 kB ✅ |

`logger` is the wave's second landed exception (after `comparator`). The 60 B `LOG_LEVELS`
figure is the useful one: it shows composition is what costs, not the entry, which is the
argument ADR-0015 accepted for `httpClient`.

`pnpm check:api-floor` needed **no inventory change** — `console` is not a policed global,
and `Date`/`Intl`/`Object.hasOwn` are ECMA scope covered by `target`/`lib`.

## Lessons

- **`intentionallyNotExported` is only for typedefs in non-entry modules.** Adding
  `LogRecord`/`Logger`/`LoggerOptions`/`TimestampOptions` produced a typedoc *warning*
  (fatal under `treatWarningsAsErrors`) because `/logging` is itself an entryPoint, so its
  typedefs are documented. `diagnostics.js` needs the list precisely because it is
  re-exported through `index.js` rather than being an entry.
- The literal-constants tree-shaking rule from 9.4 paid off immediately: `RANK` is a
  literal object rather than a map computed from `LOG_LEVELS`, which is why
  `{ LOG_LEVELS }` shakes down to 60 B instead of retaining the module.

## Where the project stands

Specs 01 and 02 fully delivered; milestones 1–10 complete. v0.2.0 (M9) is awaiting its
release PR merge and tag; this item accumulates a `minor` changeset toward **v0.3.0**
(M10).

## How the next session resumes

1. Merge the v0.2.0 release PR, then tag `v0.2.0` and let the maintainer publish.
2. Merge this PR, then cut **v0.3.0** the same way (changelog prose in
   `docs/changelog/v0/v0.3.0.md` plus release notes in `docs/releases/v0.3.0.md` — the
   release workflow hard-fails without the latter).
3. Then **PR #0b**: `docs/spec-03-dom-ui-table-plan` — spec 03 (F42–F51: `/dom` helpers,
   UI components, the table pipeline) with ROADMAP milestones 11–13. The
   `injectFragment` × sanitize contract (caller-supplied `sanitize`, mandatory) must be
   stated there. Next free ADR number: **0027**.
