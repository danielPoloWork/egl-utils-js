# ADR-0043: Three shapes that are not a group — and the clause that did not move

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §2 F77–F79, §3 NFR-17/NFR-21](../specs/04_spec_bootstrap_toolkit.md)
  (F79 amended: the nav it marks is an option; NFR-17's carousel ceiling amended),
  ROADMAP 16.3, [ADR-0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md)
  (the shared lifecycle and the id discipline this reuses),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the F68 resolution contract, and the
  entry ceiling sized once for the whole catalogue),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the F52 escape
  contract the carousel builds under),
  [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md) (the F61 rule for
  an image's `alt` this applies to slides)

## Context

Spec 04 groups offcanvas, carousel and scrollspy as one milestone item, and they are not
one kind of thing. An offcanvas opens and closes; a carousel builds markup and moves
through it; a scrollspy has no open state at all — it observes a scroll container and marks
a nav. The temptation, two milestones into a shared lifecycle helper, is to route all three
through it. That would have given the scrollspy `show()`, `hide()` and `toggle()` methods
that throw, and subscriptions to `shown`/`hidden` events that never fire.

Two smaller questions came with them. Spec 04 froze `bsScrollspy(target, {bootstrap?,
rootMargin?, smoothScroll?, signal?})` — with no way to name the nav whose links get marked,
which is the entire output of the component. And F78's item shape,
`{content, caption?, alt?, active?}`, does not say what `alt` is *for* when `content` is
already generic content.

## Decision

**1. Each shape gets the treatment it fits.** `bsOffcanvas` is a
{@link behaviourWrapper} configuration — component name, event namespace, config — and
nothing else, so it inherits the close-then-dispose teardown that keeps a disposed
component from stranding Bootstrap's backdrop. `bsCarousel` is a manager under the F52
contract, with the ADR-0042 id discipline. `bsScrollspy` is written plainly: lazy
resolution, `refresh()`, `on(...)`, `destroy()`. Its `destroy` disposes immediately,
because there is nothing to close first.

That the wrapper covers two of three and not the third is the useful part of this record: a
shared abstraction is worth having exactly while the things sharing it are the same shape,
and forcing the third in would have cost more in dead API than it saved in lines.

**2. `bsScrollspy` gains a `nav` option**, mapped to Bootstrap's `target` config, accepting
an element or a selector string. Without it the component observes and marks nothing, so
the frozen clause described something that could not do its job. Amended in the spec rather
than worked around.

**3. `alt` is what declares a slide an image — and it is required the moment it does.**
With `alt` present, `content` is an image source string and the slide renders an `<img>`;
with `alt` absent, `content` is ordinary Content under the F52 rules. `alt: ''` is
legitimate and means decorative. The consequence is the point: **an image cannot reach the
page unlabelled**, because the field that makes it an image is the field that labels it.
This is ADR-0038's F61 rule (`bsCard`'s required `alt`) expressed through the field names
spec 04 had already frozen.

**4. Autoplay is off unless asked for.** Bootstrap's markup default (`data-bs-ride`) starts
a carousel moving by itself. Motion that begins without a request is an accessibility
decision, and it is the caller's to make, so `ride` and `interval` are forwarded only when
given.

**5. Indicators are labelled by number.** An indicator row is otherwise a line of identical
unlabelled buttons — the most common accessibility defect of a hand-written carousel. The
default `slide` label is the slide's number, which is language-neutral (NFR-21's rule
against shipping English unasked); `previous`/`next` default to English words because an
accessible name has to be words, and both are injectable.

## Alternatives Considered

- **Routing `bsScrollspy` through `behaviourWrapper`** for consistency. Rejected: three
  methods that throw and two events that never fire is a worse API than a second small
  function, and "consistent" is not the same as "uniform".
- **Leaving `bsScrollspy` without a nav option**, per the frozen clause. Rejected: the
  component would have had no observable output. A spec clause that cannot work is amended,
  not honoured.
- **A separate `image: {src, alt}` option on a slide**, mirroring `bsCard` exactly.
  Rejected: spec 04 froze the field list as `{content, caption?, alt?, active?}`, and the
  chosen reading keeps both the frozen names and the required-alt rule. The alternative
  would have been a fourth field the spec does not mention.
- **Defaulting `ride: 'carousel'`** to match Bootstrap's own examples. Rejected on
  accessibility grounds; see decision 4.
- **Labelling indicators "Slide 1"** by default. Rejected: that is an English string
  rendered unasked, which NFR-21 forbids; digits carry the same information in every
  language.

## Consequences

- **One clause amended, and only one.** `bsCarousel` measured **2310 B** against a 1.5 kB
  ceiling → row 2.5 kB. It builds slides, controls and indicators on top of the shared F52
  contract floor, and composes no other exported symbol, so unlike ADR-0042's cases this is
  a *builder's* cost rather than a sum of parts.
- **The wrapper clause held for the third time.** `bsOffcanvas` measured **1150 B** and
  `bsScrollspy` **1040 B**, both inside the unchanged ≤ 1.25 kB row, joining `bsModal`
  (1180 B) and `bsDropdown` (1160 B). Four wrappers, four fits: the clause is now evidenced
  rather than assumed, and the outliers (`bsToast`, `bsCollapse`) are exactly the ones that
  also build or wire.
- **The entry ceiling did not move, for the third milestone running.** 18390 B against the
  25 kB clause ADR-0041 sized for the finished catalogue. That decision — one amendment
  sized for the whole wave instead of one per PR — has now paid for itself three times, and
  is worth repeating the next time a clause is written against a surface still being built.
- **`uniqueId` and `documentOf` moved to `bootstrap-elements.js`**, beside `resolveDocument`
  where they belong: the carousel needed both, and importing them from `bootstrap-nav.js`
  would have made the overlay file depend on the navigation file for no reason other than
  where they happened to be written first.
- **Scrollspy is the first component whose behaviour only a browser can show.** It is built
  on `IntersectionObserver` over real scroll geometry, so the jsdom suite can prove its
  wiring and nothing else; the Playwright case scrolls a real container and asserts both the
  activated link and the `activate.bs.scrollspy` event.

## References

- [spec 04 §2 F77–F79, §3 NFR-17/NFR-21](../specs/04_spec_bootstrap_toolkit.md)
- [ADR-0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md),
  [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md)
- Bootstrap 5.3: `ScrollSpy`'s `target` config and `activate.bs.scrollspy`; the carousel's
  `data-bs-slide-to` indicator contract.
