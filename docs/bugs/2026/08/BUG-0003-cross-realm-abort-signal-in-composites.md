---
id: BUG-0003
title: Composites that own a listener fail against a foreign document — a cross-realm AbortSignal
status: fixed
severity: medium
reporter: internal
discovered: 2026-08-08
affected-versions: v0.7.0
fixed-in: v0.8.0
---

# BUG-0003: Composites that own a listener fail against a foreign document — a cross-realm `AbortSignal`

## Summary

Three `egl-utils-js/bootstrap` builders throw when they are handed a document from another
realm through the `{ document }` option (spec 04 F52): **`bsAlert`**, **`bsPagination`** and
**`bsListGroup`** with `onSelect`. The failure is a `TypeError` from the platform, not from
this library:

```text
Failed to execute 'addEventListener' on 'EventTarget': parameter 3 dictionary has
member 'signal' that is not of type 'AbortSignal'.
```

Each of the three owns an internal `AbortController` for its teardown (NFR-15) and passes
`controller.signal` to `addEventListener` on an element it built in the caller's document.
When that document belongs to a different realm — a `new JSDOM()` window under Node, an
`<iframe>`, a popup — the signal is an `AbortSignal` from *this* realm, and the DOM
implementation brand-checks the dictionary member against *its own*. jsdom enforces that
check strictly; browsers are generally more permissive across realms, which is why the
browser suite is green.

The builders that attach a **caller-supplied** listener without a controller (`bsButton`
with `onClick`, `bsCloseButton`) are unaffected, as is every builder that attaches nothing.

## Impact

The `{ document }` option exists precisely so the toolkit can build in a document that is
not the ambient one — the server-render and iframe cases named in ADR-0037. For these three
builders that path is broken today: the caller gets a platform `TypeError` naming an
internal implementation detail, with no mention of the option or the realm. Same-document
usage — every browser application — is unaffected, which is why it survived M14.

## Reproduction

```js
import { JSDOM } from 'jsdom';
import { bsAlert } from 'egl-utils-js/bootstrap';

const doc = new JSDOM('<!doctype html><html><body></body></html>').window.document;
const host = doc.createElement('div');
doc.body.append(host);

bsAlert(host, { document: doc }).show('info', 'hello'); // TypeError
```

Found by the NFR-18 suite added in roadmap 16.1
(`bootstrap-node-safety.test.js` › *"runs every builder with no peer installed and no
global"*), which runs the whole builder surface in plain Node against a JSDOM document. The
three affected builders are excluded there by name, with a pointer to this record, so the
gap is visible rather than silently skipped.

## Suspected cause and fix direction

The controller is created from the ambient global rather than from the realm the target
element belongs to. The fix is to take it from the node's own view where one is reachable —
`element.ownerDocument?.defaultView?.AbortController ?? AbortController` — behind a small
shared helper on `dom-helpers.js`, since every future listener-owning builder inherits the
same trap. A regression test belongs in the node-safety suite, which is the only one that
runs with a genuinely foreign document.

Filed as ROADMAP item 16.5 rather than fixed in 16.1: it is a defect in M14.2 code, and one
roadmap item ships per PR (AGENTS.md §6.1, §10).

## Resolution (roadmap 16.5, [ADR-0045](../../../adr/0045-a-controller-from-the-node-s-own-realm.md))

**The scope above was wrong, and undercounted by more than half.** This record named three
components because those were the three the discovering test happened to exercise; grepping
for the construct found **seven** — the three above plus `bsTable`'s row delegation,
`inlineAlert`, `delegate` and `autoGrow`. A defect found through one test is scoped by that
test, not by the code, and the fix was scoped by the code.

Fixed by a single seam, `controllerFor(node)` on `dom-helpers.js`, which takes the
constructor from `node.ownerDocument.defaultView` where there is one and falls back to this
realm otherwise — the correct answer for a `createHTMLDocument()` document, which has no
browsing context and whose nodes are local already. All seven call sites now build through
it, and every future listener-owning export inherits the fix rather than the trap.

Proved by a listener that **fires**: the regression test dispatches a real event in the
foreign realm and asserts the handler ran, then destroys and asserts it stopped. A
does-not-throw assertion would have passed on a controller nobody rejected and nobody used.
