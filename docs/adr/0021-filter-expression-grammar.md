# ADR-0021: A total filter-expression grammar, interpreted without regular expressions

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec 02 §2 (F33), §3 (NFR-09); ADR-0004 (TypeError vs domain-error split), ADR-0005 (no regex on a validation surface), ADR-0019 (the spec-02 subpath family), ROADMAP 9.3; pattern: **Interpreter**

## Context

A column filter box is the one place in a data table where the user writes *code*. They
want more than "contains": not-equals, starts-with, greater-than, "show me the rows where
this is blank". Every application either grows a pile of dropdowns to express those, or
invents a small syntax — and the invented syntax then has to answer three questions that
are easy to get wrong.

1. **What happens to invalid input?** The box fires on every keystroke, so a user typing
   `>=100` passes through `>`, `>=`, `>=1` on the way. Those are not errors; they are
   frames of an animation. A parser that throws — or that returns "no rows" — makes the
   table flash empty or red while someone is mid-thought.
2. **How is it evaluated?** The obvious implementation compiles the expression to a
   `RegExp`. That hands an untrusted string to a backtracking engine: `(a+)+$` against a
   long line of `a`s is exponential, and the filter runs once per row per keystroke. It is
   the ReDoS shape this project already refused once for `validateEmail` (ADR-0005,
   NFR-05).
3. **Can an application extend it?** Domain columns want domain operators — "within
   tolerance", "in this subnet", "on my team". If the library's grammar is closed, each
   application forks the parser or bolts a second filtering mechanism beside it.

## Decision

Adopt the **Interpreter** pattern: `compileFilter` parses an expression once and returns a
predicate that is then applied per row. Three properties define the contract.

**The grammar is total.** Every string compiles. An empty or whitespace-only expression
matches everything (an empty filter is not a filter). Anything the grammar cannot read —
`>abc`, a bare `^`, an unknown token, an expression past 1024 characters — falls back to
matching the expression *literally as a substring*. There is exactly one fallback rule, so
the behaviour of a half-typed expression is predictable rather than special-cased. The
returned predicate is total too: any value, including a null-prototype object, a symbol,
or one whose `toString` throws, yields `true` or `false`.

**No regular expression is constructed, ever.** The expression is dispatched on its
leading token and evaluated with `includes` / `startsWith` / `endsWith` / numeric
comparison. Cost is bounded by input length with no backtracking (NFR-09), and the 1024
character cap means a pathological expression cannot even choose which code path it runs.

**The grammar is extensible by injection, not by forking.** `options.operators` maps a
leading token to a factory that receives the operand and a context carrying the same
`text` and `toNumber` helpers the built-ins use, so a custom operator normalizes values
identically. Custom tokens are matched **before** the built-ins, longest first, so a
caller may also deliberately override one.

The vocabulary: substring (default), `=x`, `!=x`, `^x`, `x$`, `>n`, `>=n`, `<n`, `<=n`,
and the sentinels `=null` / `=empty` / `=blank` with negations `!null` / `!empty` /
`!blank`. The sentinels nest — `null` ⊂ `empty` ⊂ `blank` — so a caller can reason about
them as a hierarchy rather than three unrelated predicates.

## Alternatives Considered

- **Compile to a `RegExp`.** Fewer lines, and prefix/suffix/contains fall out for free.
  Rejected on the ReDoS ground above: the input is untrusted, the evaluation is per-row,
  and this repository has already decided once (ADR-0005) that a validation surface does
  not get to depend on a backtracking engine's mood. It would also leak regex
  metacharacters into the user's mental model — typing `a.b` would silently mean "a, any
  character, b".
- **Throw on a syntax error, and let the caller catch.** Honest, and conventional for a
  parser. Rejected because it is wrong for *this* parser's call site: the caller is a
  keystroke handler, so the "error" state is one the user is passing through. Every
  consumer would wrap the call in the same `try`/`catch` that swallows the error and
  falls back to substring — which is exactly what the library now does once, correctly.
- **Return a `Result`-shaped `{ ok, predicate, error }`.** Lets a UI show "invalid
  syntax". Rejected as the wrong default: it burdens every call site with a discriminated
  union for a case that has a good silent answer, and it is not what a filter box wants to
  do while someone is typing. An application that genuinely wants to lint the expression
  can pre-check it against the documented token list.
- **A structured filter object** (`{ op: 'gte', value: 100 }`) instead of a string
  syntax. Cleaner to validate, and better for programmatic construction. Rejected as the
  *primary* surface because the input arrives from a text box: something has to parse it,
  and pushing that job to every consumer is how each application ends up with a slightly
  different, slightly wrong parser. Programmatic callers are already served — they can
  build a predicate directly, since a predicate is all `compileFilter` returns.
- **A closed grammar, extended by requesting features.** Simpler surface, no injection
  seam. Rejected because the domain operators are unbounded by definition (subnet
  membership, tolerance, business-status shorthand); a library cannot enumerate them, and
  refusing them means applications fork the parser.
- **Match custom operators *after* the built-ins.** Safer — a caller cannot accidentally
  shadow `>=`. Rejected because it would make overriding impossible, and shadowing
  requires deliberately registering a token that already exists. The longest-token-first
  rule makes the resolution explicit.

## Consequences

- A filter box can call `compileFilter` on every keystroke with no `try`/`catch` and no
  debounce-for-safety; the property suite asserts totality over arbitrary Unicode
  expressions and arbitrary values, including unconvertible ones.
- Compile-once/evaluate-many is a real contract, not an implementation detail: case
  folding, locale separators, and operand parsing all happen once per expression, not once
  per row.
- Cost: an expression the user *meant* as an operator but mistyped (`>abc`) silently
  becomes a literal search rather than an error. This is the deliberate trade of the
  totality rule; the JSDoc states it and an example test pins it.
- Cost: the grammar is not composable — no `AND`/`OR`/parentheses. That is a deliberate
  scope line (per-column filters are combined by the caller, and the spec-03 pipeline
  combines them with `AND`); adding boolean composition later is a new ADR, not a quiet
  extension, because it would change what an expression containing a space means.
- A custom operator that throws propagates, and one that does not return a function throws
  `TypeError` at compile time. Totality is a promise about *expressions*, not about
  caller-supplied code — stated in the JSDoc so the boundary is explicit.
- Measured 954 B min+gzip as a single import, inside the 1 kB NFR-08 clause — the
  exception this clause anticipated for `compileFilter` turned out not to be needed.

## References

- Spec 02 §2 (F33), §3 (NFR-09 totality and input hardening), §6 (property laws) — `docs/specs/02_spec_core_extensions.md`
- ADR-0005 (why a validation surface here carries no regex), ADR-0004 (error-contract split)
- Threat model — `docs/security/threat-model.md`, the filter-expression boundary
- Implementation: `src/main/javascript/it/d4np/utils/table.js`; laws: `src/test/javascript/it/d4np/utils/table.property.test.js`
