---
'egl-utils-js': minor
---

`formatDuration` and `normalizeError` join the root entry (ROADMAP 9.4, spec 02 F36-F37,
ADR-0023).

`formatDuration` is the exact inverse of `parseDuration`: it emits the same ADR-0009
grammar — descending `h`/`m`/`s`, zero segments omitted — so
`parseDuration(formatDuration(ms)) === ms` holds for every whole second and is asserted as
a property. Sub-second remainders truncate to a `'0s'` floor rather than rounding up time
that never elapsed, and fractional input is accepted so `measure()`'s milliseconds can be
formatted directly.

`normalizeError` turns anything a `catch` block can receive into one uniform record:
`{ name, message, stack?, code?, status?, detail?, cause }`, with the optional fields
present only when the value carried them. It is total — an `Error`, a thrown string,
`null`, a symbol, a circular object, or one whose `message` getter throws all produce a
record rather than a second failure — and non-destructive, since `cause` holds the original
value by identity, so the idiom is to log the record and rethrow the original.
