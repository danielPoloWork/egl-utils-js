# ADR-0027: A logger split into a threshold, a formatter, and a sink

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (maintainer), agent (senior project architect persona)
- **Related:** [spec 02](../specs/02_spec_core_extensions.md) §2 F40-F41, ROADMAP 10.1,
  [ADR-0019](0019-subpath-family-and-code-unit-text-semantics.md) (the subpath family and
  the code-unit text measure `fixedWidth` provides),
  [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (the per-function
  budget exception this decision reuses),
  [ADR-0023](0023-duration-round-trip-and-the-error-record.md) (`normalizeError`, whose
  record this logger consumes but never produces)

## Context

Spec 02 F40-F41 asks for a structured logger on its own entry. The requirement looks
small — print a line — but four independent decisions hide inside it, and getting any of
them wrong is what makes hand-rolled loggers unpleasant to live with:

1. **How verbosity is controlled.** The familiar in-house shape is one boolean per
   severity (`flagInfo`, `flagDebug`, …). It looks flexible and is actually worse than a
   threshold: eleven booleans admit 2048 states, most of them nonsense ("errors off,
   trace on"), none of them orderable, and there is no way to answer "is debug enabled?"
   without knowing every flag.
2. **Where records go, and what they look like.** These are two questions, not one. A
   file wants a formatted line, a log aggregator wants the structured record, and a test
   wants neither — it wants the record in an array.
3. **How context is attached.** A logger that reports which component emitted a line is
   far more useful than one that does not. The tempting trick is reflection: pass `this`
   and a method reference and derive names from `constructor.name` / `fn.name`. It reads
   beautifully in source and breaks the moment a minifier renames things — every log line
   in production then says `[t]` / `ƒ n()`.
4. **What happens when logging itself fails.** A logger is called from `catch` blocks. If
   a broken sink throws, the original error is replaced by the logging error — the failure
   mode that destroys the evidence you were trying to record.

A fifth constraint is structural: NFR-08 gives `/logging` a 1.6 kB budget and every
export a 1 kB single-import clause, so whatever is decided has to stay small.

## Decision

**One threshold, three injected seams, and total containment.**

1. **A single ordered level threshold.** `LOG_LEVELS` is the frozen vocabulary
   (`trace < debug < info < warn < error < silent`); `level` picks the floor and every
   call below it returns before the record is built — before the clock is read, before
   the id is resolved, before anything is formatted. `'silent'` is a threshold value, not
   a method. The rank table is a **literal object**, not a map computed from
   `LOG_LEVELS`, because a computed module-scope value is not provably side-effect-free
   and would pin the whole module into every bundle touching the entry (the tree-shaking
   rule ADR-0019 established).
2. **The sink decides destination; the formatter decides shape; the sink receives both.**
   A sink is `(record, format) => void`. A text sink calls `format(record)`; a structured
   sink ignores the argument and serializes the record itself. Nothing is formatted that
   nobody reads, and both sink styles are first-class rather than one being the awkward
   case.
3. **Explicit child context.** `child('db')` returns a logger named `parent.db`. The name
   is a string the author wrote, so it survives minification, renaming, and bundling.
4. **Logging never throws into application code.** Record construction *and* the sink
   call sit inside one `try`; a failure — throwing clock, throwing id function, hostile
   `toString`, throwing formatter, dead transport — costs that one record and is reported
   once through `console.error`. If `console.error` is itself absent or throwing, the
   failure is dropped. The call site always returns normally.
5. **Every interpolated field is stripped of CR/LF, not just the message.** F41 asked for
   the message; the implementation goes one step further and also cleans `name` and `id`,
   because an id arrives from an *injected function* and a name from configuration. The
   guarantee is therefore total — one record renders as exactly one line for every
   possible input — and a property test asserts it over arbitrary strings rather than a
   handful of examples.
6. **`logger` takes a named 1.45 kB budget exception** (measured 1361 B). Importing the
   factory means importing the subsystem it composes: the default formatter, the default
   sink, and `fixedWidth`. The formatter alone is 876 B and `LOG_LEVELS` alone is 60 B, so
   composition is the cost, not the entry — the same argument ADR-0015 accepted for
   `httpClient`. The `/logging` entry itself measures 1390 B, inside its 1.6 kB clause.

Timestamps render in **local time**. These lines are read by a human next to the process
that wrote them; a consumer who needs UTC injects a `format` or reads `record.ts`, which
is plain epoch milliseconds.

## Alternatives Considered

- **One boolean per severity** (the shape this port replaces). Rejected because severity
  is inherently ordered: a threshold expresses every sensible configuration, admits no
  nonsensical one, and answers "is this level on?" with a comparison.
- **`sink(record, line)` — pre-format, pass the string.** Simpler signature, but it
  formats on every record even when the sink is structured and throws the result away.
  Rejected: a JSON transport should not pay for a line it never reads.
- **`sink(record)` only, with `format` reserved for the default sink.** Rejected for the
  opposite reason: a custom text sink then cannot reuse the configured formatter, so
  `format` would silently stop applying the moment anyone customized the destination.
- **Reflection-based context** (`log.traceIn(this, this.method)`). Elegant at the call
  site, no string literals to drift. Rejected because it is only correct in unminified
  builds — the failure is silent, appears exclusively in production, and corrupts every
  line at once.
- **A module-level default logger** (`import { log } from 'egl-utils-js/logging'`).
  Convenient, and rejected on two counts: module-level mutable state is exactly what
  spec 01 §4 forbids for the dual-package hazard (two realms, two loggers, one
  reconfiguration), and a shared instance makes tests order-dependent — whoever
  reconfigures it last wins. Recorded as the catalogue's first **Singleton** rejection.
- **Async/batching sinks in this ADR.** Deferred: a sink returning a promise, buffering,
  and flush-on-exit is a real requirement for network transports, but it needs its own
  backpressure and shutdown contract. The current sink contract does not forbid an async
  implementation (the return value is ignored); a future item can add the lifecycle
  around it without changing this signature.
- **Normalizing errors inside the logger.** Rejected: it would pull `diagnostics.js` into
  `/logging` for a decision the caller already makes better —
  `log.error('failed', normalizeError(e))` keeps the entries independent, and the record
  shape ADR-0023 fixed travels as an ordinary argument.

## Consequences

- Verbosity is one comparison, and `'silent'` reliably silences everything.
- Destination, shape, clock, and correlation id are all replaceable without touching call
  sites — which is what makes the logger testable with a two-line capturing sink and a
  frozen clock, and why the suite asserts on records rather than on `console` spies.
- `child()` names are stable through minification; nothing in the module reads
  `Function.prototype.name`.
- A broken logging path degrades to one lost line plus one `console.error`, never to a
  swallowed application error.
- Log files stay parseable: one record, exactly one line, for every input.
- `logger` is the second landed NFR-08 exception (after `comparator`). Consumers who only
  need to render a record pay 876 B, and `LOG_LEVELS` alone costs 60 B — the tree-shaking
  claim is measured per export, not asserted.
- `/logging` depends on `/text` at the **module** level (`./text.js`), not through the
  entry barrel, so importing the logger does not drag in the whole text entry.
- Local-time output is a deliberate readability choice; correlating logs across timezones
  requires an injected formatter. Called out here so the constraint is discoverable
  rather than surprising.

## References

- [spec 02 §2 F40-F41](../specs/02_spec_core_extensions.md) — the functional contract
- [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) — the composition
  argument for a per-function budget exception
- [ADR-0019](0019-subpath-family-and-code-unit-text-semantics.md) — subpath family,
  code-unit text semantics, and the literal-constants tree-shaking rule
- [ADR-0023](0023-duration-round-trip-and-the-error-record.md) — the `ErrorRecord` shape
  the logger consumes
- [OWASP — log injection](https://owasp.org/www-community/attacks/Log_Injection) — why the
  one-record-one-line guarantee is a security property, not cosmetics
