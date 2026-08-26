---
'egl-utils-js': minor
---

**Breakpoint observation on `egl-utils-js/ui`** (ROADMAP 20.4, spec 07 F108,
[ADR-0074](docs/adr/0074-bootstraps-own-mixins-five-queries-and-a-seam-written-once.md)).

Two new exports, `createBreakpoints` and the frozen `BOOTSTRAP_BREAKPOINTS` map, and no new
`exports`-map path.

```js
import { createBreakpoints } from 'egl-utils-js/ui';

const screen = createBreakpoints();

screen.current(); // 'lg'
if (screen.down('md')) collapseTheSidebar();

screen.on(({ current, previous }) => render(current));
```

Ask once, be told when it changes — instead of a resize listener per component, each reading
layout on the hot path of a drag, or a hand-written `min-width` that has to agree with the CSS
forever.

**Bootstrap's own names and Bootstrap's own meanings**, read from its SCSS rather than from what
the names suggest: `up('md')` is md and wider (always true for `xs`, which has no query),
`down('md')` is **narrower than md** — the Bootstrap 5 change people trip over — `only('md')` is
md and nothing wider, and `between('md','xl')` is half-open, excluding xl.

**`on()` reports a crossing, not a resize.** A drag from 800 px to 900 px says nothing; a jump
from 500 to 1500 says it once, though four media queries flipped. Two questions deliberately
throw rather than answer: `down('xs')`, since nothing is narrower than the base, and a reversed
`between`, since it can never match.

`createBreakpoints` measures 1 237 B against a 9 567 B entry, so a page that wants only
breakpoints pays for none of the three managers.

**Additive only.** No existing export, option, error code or `exports` path changed: the surface
goes from 130 exports to 132 across the same eleven entries. The `matchMedia` seam the F106 theme
manager introduced is now shared internally rather than copied — no behaviour change, and one
answer instead of two for what an absent `matchMedia` means.
