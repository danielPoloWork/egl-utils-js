---
'egl-utils-js': minor
---

**Theme management on `egl-utils-js/ui`** (ROADMAP 20.3, spec 07 F106–F107,
[ADR-0073](docs/adr/0073-bootstraps-own-attribute-and-a-snippet-that-cannot-drift.md)).

Two new exports, `createTheme` and `themeSnippet`, and no new `exports`-map path.

```js
import { createTheme, themeSnippet } from 'egl-utils-js/ui';

const theme = createTheme();

theme.get(); // 'auto' — no choice expressed yet
theme.toggle(); // 'light', and remembered
theme.set('auto'); // back to following the system
```

Bootstrap 5.3's own `data-bs-theme` and nothing beside it: no class to keep in step, and the
attribute name is deliberately not an option.

**`'auto'` is the absence of a stored choice, not a third state**, so "no choice yet" and
"follow the system" are one condition that cannot drift apart. The half usually forgotten is
the other one — a site that remembered your choice at 6 pm has lost it by 7, when the OS
switches — and here an expressed choice stops the tracking until it is withdrawn. `get()`
answers the preference, `resolved()` answers what is on the attribute, because a settings UI
and a component are asking different questions.

**No flash.** A theme applied by a module shows one frame of the wrong one, every load. The fix
has to be a synchronous script in `<head>`, so the library **emits** it — `themeSnippet()` is a
pure 421 B function returning that source, readable by a server render or a build step, from
the same key and attribute the manager uses. A snippet documented in a README shares those by
coincidence; the suite asserts these two agree by running the string.

**A control that says what it will do**, not what the page is: `theme.control()` names the state
it will move to and relabels itself whenever the theme changes, including a system change it did
not cause. Icons are your nodes — no icon font is bundled, imported or assumed.

`set` applies the theme **before** it persists it, so a quota failure arrives with the page
already correct — failing to remember must not stop a choice taking effect, and must not be
silent either.

**Additive only.** No existing export, option, error code or `exports` path changed: the surface
goes from 128 exports to 130 across the same eleven entries.
