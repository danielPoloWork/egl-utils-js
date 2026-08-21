# ADR-0064: The gate that was watching nothing — a scanner with a test suite

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Daniel Polo
- **Related:** [ADR-0017](0017-platform-api-floor-gate.md) (the gate this repairs, and the
  deny-by-default promise it was not keeping),
  [ADR-0063](0063-the-url-is-the-state-and-the-page-goes-last.md) (roadmap 19.2, which walked
  into both blind spots and filed them),
  [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md) (the last time this
  scanner was found to be blind, and the "documented limit of a regex scanner" that turned out
  to be a bigger limit than documented),
  [ADR-0014](0014-nightly-regression-gate-design.md) (the precedent for rejecting a green
  measurement that measures the wrong thing),
  [ADR-0050](0050-the-1x-runtime-floor.md) (the matrix the gate compares against);
  ROADMAP 19.8, spec 06 §3 NFR-28, spec 01 §3 NFR-07

## Context

The NFR-07 floor gate has three checks. Checks 1 and 2 ask questions of
`@mdn/browser-compat-data` and are as reliable as the data. Check 3 is different: it scans
`src/main` for platform globals and fails when one is not in the inventory. That check is the
deny-by-default promise — the part ADR-0017 says a linter could not give us, and the reason
`eslint-plugin-compat` was rejected after it reported nothing for `AbortSignal.timeout`.

Check 3 was a regex scan over text with the comments and strings blanked out. Roadmap 19.2
added six inventory entries for the History API, ran the gate, and it passed. Then it ran the
control that ought to be routine — delete an entry, expect a failure — and **the gate passed
again**.

Two shapes were invisible:

- **A member read inside a template literal.** `stripNonCode` blanked template literals
  *whole*, interpolations included, so `` `${location.pathname}${location.hash}` `` contained
  no platform read as far as the gate could see.
- **A member read through optional chaining.** The member pattern required a bare `.`, so
  `globalThis.location?.protocol` never matched. That line has been in `storage.js` since M6,
  and `location.protocol` had never been inventoried, because nothing ever asked for it.

Neither is an exotic construct. The second is worse than the first: optional chaining is the
*recommended* way to read a possibly-absent global, which makes it the shape most likely to
appear in exactly the guarded code this gate exists to check. The gate was weakest where it
was needed most — the same sentence ADR-0028 wrote about DOM types, three milestones earlier,
about the same scanner.

19.2 shipped a workaround: it wrote its own reads as string concatenation, with a comment
explaining why, so the gate could see them. That is a note in one file protecting one wave. It
does nothing for the next.

## Decision

**1. The scan is extracted into `tools/api-floor-scan.js`, pure and dependency-free.** No
BCD, no filesystem, no `process.exit` — `codeOf(source)` and `platformUses(code, policed)`
over strings, with `POLICED` alongside them because the list is data about the scan.
`check-api-floor.mjs` keeps the three checks, the reporting and the exit code.

**2. There is a test suite, and it is the actual deliverable.** `api-floor-scanner.test.js`
asserts each evasion is *seen* — plain member, optional-chained member, member inside a
template literal, bare call, `instanceof`, `globalThis.x`, computed key — and, in the same
file, that the shapes which must stay ignored still are: prose in comments and strings,
`typeof` feature tests, and property keys that merely share a global's name. One case loops
over the whole `POLICED` list through all three member forms, so a global added later cannot
be added into a hole.

This is the load-bearing part of the decision. **A regex fixed without a test is only the
next blind spot**, and this scanner has now been found blind twice by different waves. The
fix that lasts is not a better pattern; it is the pattern being checked.

**3. Template literals keep their interpolations.** Literal text is dropped, `${…}` is kept.
Written as a hand-rolled tokenizer rather than a regex, because interpolations nest: an object
literal inside a `${}` inside a template inside another `${}` is legal JavaScript, and no
regex can tell that inner `}` from the one closing the interpolation. A brace depth per frame
can. Regular-expression literals are handled while we are in there — nothing in the repository
puts a quote inside one today, and "nothing does that today" is precisely how both of these
blind spots came about.

**4. Optional chaining is a member read.** `\??\.` in the member pattern, and
`globalThis?.x` in the reference pattern.

**5. Computed access is refused, not resolved.** `location['search']` and `location?.[key]`
raise a failure naming the global and asking for dot access or an explicit entry. A scanner
cannot know what `key` holds, and the alternative to refusing is an evasion one bracket wide.

**6. The scanner errs toward false positives, on purpose, and says so.** A member reached off
a local — `view.history.pushState`, where `view` is an injected window — scans as the global,
because a text scanner cannot tell it from the ambient one. So does an unrelated object with a
`history` property. Both are asserted in the test suite as accepted costs: a false positive
costs one inventory entry with an honest note, while a false negative costs a function broken
on a browser the spec promises. Those prices are not comparable, and the gate is tuned to the
cheap mistake.

**7. 19.2's workaround is removed.** `dom-history.js` builds its URL with the template
literal it wanted to use, and the test suite asserts the natural form is covered. A workaround
left in place after its reason is gone is a lie about why the code looks the way it does.

## Alternatives Considered

- **Parse properly, with an AST.** The correct answer in the abstract, and rejected on
  dependency grounds: the only parsers already in the tree are transitive (`espree` under
  ESLint, `esbuild` under tsup, neither exposing an AST as public API), and adding a direct
  parser dependency to a repository whose headline claim is *zero runtime dependencies* and a
  minimal dev surface needs a better reason than 60 lines of tokenizer. Revisit if the scan
  ever needs scope analysis — which is the one thing a tokenizer genuinely cannot do, and the
  reason decision 6 exists.
- **Fix the two regexes and move on.** Rejected: it is what 19.2 could have done, and it
  leaves the property that caused the bug — an unverified scanner — exactly as it was. The
  third blind spot would be found the same way, by someone lucky enough to run the control.
- **Widen `stripNonCode` to keep everything inside backticks**, prose included. Rejected:
  strings and comments in this repository are full of platform names — this ADR names
  `location.protocol` four times, and the inventory describes half the DOM in its guard notes.
  A scanner that read prose as code would fail on its own documentation, and the pressure would
  then be to stop writing the documentation.
- **Give up on check 3 and rely on review.** Rejected on the record: review is what missed
  `AbortSignal.timeout` for six milestones, which is why ADR-0017 exists at all.
- **Make the gate warn rather than fail on a computed key.** Rejected: a warning in a CI log
  is the silence this gate was built to end. If a computed read is genuinely needed, the
  failure names the two ways past it.

## Consequences

- **The gate now fails when it should.** The control that started this — delete
  `location.pathname`, `location.hash`, `location.protocol` and run — reports all three,
  including the template-literal reads in `dom-history.js` and the optional-chained one in
  `storage.js`. Before this change it reported none of them.
- **One real finding, exactly as 19.8 predicted.** Fixing the scanner surfaced
  `location.protocol` in `storage.js` — unscanned since M6 — and nothing else across
  `src/main`. It is now inventoried, `guardReason: 'context'`, with the guard it has always
  had: read inside a `try` off optional chaining, where absent-or-throwing means not-HTTPS,
  which is the safe default for local development (ADR-0011). The inventory is 38 entries.
- **The scan is 22 tests wide**, and the two blind spots are regressions rather than
  anecdotes. `tools/` code is outside the coverage `include`, so these tests cost the coverage
  gate nothing and gain it the one thing coverage could never have told us: that the gate was
  measuring the wrong thing.
- **A third bug was caught by the new tests, before it shipped.** The first draft of the
  computed-access pattern allowed `?[` rather than `?.[` — a one-character-short mistake of
  exactly the kind that caused blind spot #2 — and matched nothing real. The test failed on
  it. That is the suite paying for itself inside the PR that wrote it.
- **Three size rows drifted by single-digit bytes** when the interpolated form came back
  (`/dom` −4 B, `{bindTableHistory}` −3 B, the artifact +60 B). No limit moved and no baseline
  was re-pinned: a 7 B drift on the F87 artifact route is the signal that field carries, and
  erasing it on every trivial change would be the same mistake as an un-updated budget, in the
  other direction.
- **What the scanner still cannot see, now written down** rather than discovered: an event
  name, because it is a string (`Window.popstate` stays hand-declared, and always will), and
  anything requiring scope analysis. Both are in decision 6's ledger of accepted costs.

## References

- ADR-0017 — the gate, its three checks, and the deny-by-default promise this restores.
- ADR-0028 — the previous time this scanner was found blind, and by the same method.
- ROADMAP 19.2 → 19.8 — found by a wave, filed rather than patched in place, fixed on its own.
