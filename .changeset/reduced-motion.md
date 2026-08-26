---
'egl-utils-js': minor
---

**A reduced-motion query point on `egl-utils-js/dom`** (ROADMAP 20.6, spec 07 F111,
[ADR-0075](docs/adr/0075-one-query-point-and-a-seam-that-crossed-a-boundary.md)).

One new export, `reducedMotion`, and no new `exports`-map path.

```js
import { reducedMotion } from 'egl-utils-js/dom';

const motion = reducedMotion();

bsCarousel(el, { items, ride: !motion.prefersReduced() });
motion.on((prefers) => carousel.cycle());
```

One place components ask whether the visitor wants less motion, instead of five separate
`matchMedia` calls each risking a slightly different query string. **A helper, not a manager**:
there is no animation-preset system to configure, and this does not smuggle one in — the
`MotionManager` design ADR-0046 rejected stays rejected.

Absent `matchMedia` (Node, an exotic host) reports `false`: no evidence of a preference is not
evidence of one, so the safe default is to animate as designed.

The `matchMedia` seam this composes moved from `egl-utils-js/ui`'s internals to
`egl-utils-js/dom`'s, since `/ui` already depends on `/dom` primitives and never the other way —
no behaviour change, one shared answer for what an absent `matchMedia` means instead of a third
copy.

**Additive only.** No existing export, option, error code or `exports` path changed: the surface
goes from 132 exports to 133 across the same eleven entries.
