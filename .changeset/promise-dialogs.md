---
'egl-utils-js': minor
---

**Promise-based dialogs on a new `egl-utils-js/ui` entry** (ROADMAP 20.1, spec 07 F101–F103,
[ADR-0071](docs/adr/0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md)).

One export, `createDialogs`, and one new `exports`-map path.

```js
import { createDialogs } from 'egl-utils-js/ui';

const dialogs = createDialogs({ labels: { confirm: 'Delete' }, variant: 'danger' });

if (await dialogs.confirm(`Delete ${row.name}?`)) {
  await api.delete(row.id);
}
```

A dialog is a question with one answer arriving later, so it hands back a promise instead of
taking an `onOk`/`onCancel` pair that cannot compose. **A dismissal is an answer, not an
error**: Escape, the backdrop, the close control and the cancel button all *resolve* — `false`
for a confirm, `null` for a prompt, your own `dismissValue` for the general `open` form. A
rejection means the question could not be *asked* — `EGL_DOM_CONTRACT` with no document,
`EGL_PEER_MISSING` with no Bootstrap — which stays a different fact from the user saying no.

Exactly one settlement survives any race of dismissals, because the answer is recorded before
anything starts closing. Focus is trapped while the dialog is open and restored to whatever
opened it when it settles, through the F109 `/dom` primitives rather than a second
implementation — proven on three engines, one of which (WebKit) is why the dialog places focus
itself rather than trusting Bootstrap to.

**Why a new entry:** ADR-0041 sized the `/bootstrap` clause at 25 kB for the finished
catalogue, and 482 B of it were left. This wave goes elsewhere rather than stretching a clause
written for something else (spec 07 NFR-32).

**Additive only.** No existing export, option, error code or `exports` path changed: the
surface goes from 126 exports across ten entries to 127 across eleven.
