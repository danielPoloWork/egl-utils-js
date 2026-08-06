---
'egl-utils-js': minor
---

New entry `egl-utils-js/logging` with `logger`, `formatLogLine`, `formatTimestamp`, and
`LOG_LEVELS` (ROADMAP 10.1, spec 02 F40–F41, ADR-0027). One ordered level threshold
replaces a flag per severity, and destination, line shape, clock, and correlation id are
all injected: a sink receives the record **and** the formatter, so a structured transport
never pays to build a line it would throw away. `child('db')` names contexts explicitly,
so log lines survive minification. Logging never throws into application code — a dead
sink, throwing clock, throwing id function, or hostile `toString` costs that one record
and is reported once through `console.error`. CR/LF are collapsed in the message and in
the name and id columns, so one record renders as exactly one line and an injected id
cannot forge a log entry.

This completes spec 02: every requirement F26–F41 is now delivered.
