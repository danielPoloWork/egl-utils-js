# 2026-08-24 — Planning the application-UX wave (spec 07, M20)

## What got done

- **`docs/specs/07_spec_application_ux.md`** written — the M20 contract, **F101–F111** and
  **NFR-31–NFR-36**, authored in its own planning PR before implementation as the wave's own
  rules require.
- ROADMAP M20 promoted from *provisional* to *adopted*, its six items rewritten against the
  F-numbers they now own, and a spec-07 section added to the coverage map.

## Why this came before 20.1

The request was 20.1. M20's own entry in the roadmap says the wave's spec "is authored in its
own planning PR" — the rule M19 followed, where the spec-06 planning PR preceded 19.1 — so
20.1 had a documented prerequisite that had not been met.

That would be process on its own. What made it **load-bearing** is two measurements taken
before writing anything:

| | measured | ceiling | left |
|---|---:|---:|---:|
| `/bootstrap` entry | 24 406 B | 25 kB (ADR-0041) | **594 B** |
| artifact, served | 38 911 B | 40 kB (NFR-22) | **1 089 B** |

`bsModal` measures 1 266 B and `bsToast` 2 473 B — the two components 20.1 and 20.2 wrap. The
wave does not fit on `/bootstrap`, and no amount of care while writing 20.1 would have made it
fit. Starting the implementation would have meant discovering that halfway through the first
item, with a design already shaped around the wrong entry.

ADR-0069 said M20 inherited ~594 B and owed a decision. This is that decision, taken before
the wave rather than during it.

## The two decisions the spec makes

**1. F101–F108 land on a new entry, not on `/bootstrap`** (NFR-32). The clause is not the
wrong size — ADR-0041 sized it *for the finished catalogue*, and the catalogue is finished.
Squeezing a new layer into a ceiling written for a different thing would corrupt the one
number that tells us when the catalogue itself has grown.

The boundary between the two entries is stated so it stays testable rather than aesthetic:
`/bootstrap` **builds** components; the new entry **orchestrates** them — state that outlives
any one component, a queue, a pending promise, a persisted preference, a media query. A symbol
belongs on the new entry if it would still make sense with a different component library
underneath. A toast queue would; `bsBadge` would not.

The entry's **name** is deliberately *proposed* (`/ui`) rather than frozen: an exports-map path
is MAJOR-protected the moment it ships, so 20.1 owns that choice with an ADR — the same way
spec 06 fixed F88–F91's observable contract and deferred the mechanism to ADR-0062.

**2. NFR-22's artifact ceiling is re-derived, not raised** (NFR-33). The artifact carries the
*whole* public surface, so a new entry lands in it wherever it lives — the entry decision does
not dodge this one. But spec 05 **derived** 40 kB as the sum of the ten measured entry
figures, an upper bound on a deduplicated single file, and that derivation has an eleventh
input now. Recomputing it by the same method is following the rule; picking a bigger number
because the current one is inconvenient is not, and the clause says so explicitly.

## What the spec deliberately does not decide

The dialog surface has two defensible shapes — free functions per dialog kind, or a manager
instance that mints them — and the choice interacts with NFR-35's no-module-state rule. The
spec fixes the **observable contract** (F101–F103) and leaves the shape to 20.1's ADR.

Two clauses are worth reading before any item starts, because both were learned the expensive
way:

- **NFR-35, no module-level mutable state.** Every manager is an instance the caller owns.
  Two toast managers on one page do not share a queue. This is ADR-0031's lesson — the static
  singleton whose second instance breaks — and §6 asks for the test that would have caught it.
- **NFR-36, operable *and announced*.** NFR-21 has required keyboard operability since spec 04;
  this wave adds the half that has been missing, and F110 closes a gap ADR-0069 named rather
  than hid: a column moved by F100's keyboard path is announced to nobody today.

## Where the wave lands

- **New entry** (proposed `/ui`): dialogs (F101–F103), toasts (F104–F105), theme
  (F106–F107), breakpoints (F108).
- **`/dom`**: the focus primitives (F109), the announcer (F110), the reduced-motion helper
  (F111) — they need no component library at all, and putting them behind a
  Bootstrap-flavoured entry would make a consumer take a catalogue to announce a message.

## How the next session resumes

1. Wait for this planning PR to merge (one item per PR).
2. Start **20.1**. It is the wave's sets-pattern item and it carries two decisions beyond its
   own feature: the dialog surface shape, and the new entry's name and packaging — exports
   map, both no-bundler routes, size row, artifact inclusion. Route is
   frontier-reasoning/high for that reason.
3. **20.5 before 20.1 is a defensible reordering** and the owner's call: F101's focus
   behaviour is defined in terms of F109's primitives, so building the primitives first means
   20.1 composes them instead of writing them and having them extracted later.
