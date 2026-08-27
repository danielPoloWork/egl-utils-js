# 2026-08-27 — A costume that is only a constant (21.3)

## What got done

- **`bindFormFeedback`** on `egl-utils-js/forms` — spec 08 F120–F121: findings rendered into
  the page through an injected class map, ARIA wired and unwired, and `report()` for a blocked
  submit.
- **`BOOTSTRAP_FEEDBACK_CLASSES`** on `egl-utils-js/bootstrap` — frozen data, and that is a
  measurement rather than a preference.
- **[ADR-0079](../../adr/0079-a-costume-that-is-only-a-constant-and-a-node-where-the-css-can-see-it.md)**,
  budgets re-pinned across five routes, and a browser spec that proves the one claim jsdom
  cannot see.
- 28 example tests at **100% lines and 100% branches** on the new module, plus 4 browser tests
  green on Chromium and WebKit.

## NFR-38 asked for a measurement, and the measurement changed the design

Spec 08 said the costume is "the `bsAlert` shape (ADR-0038)" — a frozen constant **plus a thin
call** — and attached a condition: measure before choosing where it lands, because
`/bootstrap` had 505 B under ADR-0041's clause.

| Shape | `/bootstrap` measures | Against the 25 kB clause |
|---|---:|---|
| a `bsFormFeedback` wrapper function | **25 987 B** | **987 B over** |
| the frozen constant alone | **24 632 B** | 368 B under |

So half of ADR-0038's shape was measured away. A wrapper on that entry drags the whole renderer
in behind it, because the import is what a bundler follows — and the constant costs 137 B. The
fallback NFR-38 named (put the wrapper on `/ui`) turned out not to be needed: once the constant
fits, a wrapper buys the caller one spread and costs a cross-entry import plus a second symbol
to keep in step. The precedent it falls back to is older and on the same entry —
`bootstrapIconsSet` is frozen data composed into `bsIcon` through an option, and nobody has
ever missed a `bsIconWithBootstrapSet`.

I would not have got there by reasoning. I got there by writing the wrapper, building, reading
the number, and deleting it.

## The decision that only a real stylesheet could validate

Where does a feedback node go? "After the control" sounds like a detail and is not: Bootstrap
shows `.invalid-feedback` through a **sibling combinator**, so a node appended to the form is
styled correctly and displayed never. jsdom would have passed a test for the class attribute
and told me nothing.

The browser spec loads Bootstrap's real stylesheet and asserts `getComputedStyle(node).display
=== 'block'`. That is the assertion that makes the placement a decision rather than a habit —
and it is the same instrument that showed a **warning** needs `form-text` instead, since
`.invalid-feedback` is hidden unless a sibling is `:invalid` and a warning put there is a
message nobody sees.

## Small things that turned out to matter

- **`classList.toggle(x, false)` creates `class=""`** on an element that never had a class
  attribute. The "leaves the markup as it found it" test failed on exactly that, which is why
  toggles are now skipped when they would change nothing. A teardown test comparing `innerHTML`
  is worth having precisely because it notices this class of near-miss.
- **A node is created only when there is something to put in it.** The first version created one
  for every validated field, so a clean form grew an empty `div` under every control.
- **No `{html, sanitize}` pair here, on purpose.** Every other content-taking API in this
  library offers it; this one must not, because 21.4 routes a *server's* error body into these
  same findings. The safest opt-in is the one that does not exist.

## A one-byte gate failure, and it was right

Adding one frozen constant to `/bootstrap` moved the shared-chunk split enough to push
`single: bsTooltip` from 2 100 B to **2 101 B** against a 2 100 B row, and the build went red
over a single byte in a component this PR never touched. That is the gate doing its job: a
tight row is supposed to notice. It is re-pinned to 2.15 kB with the cause written into the row
rather than quietly widened.

## Where the project stands

v1.3.0 tagged, Release still drafted (publishing is the owner's). **M21: 21.1, 21.2 and 21.3
done**, 21.4–21.5 open. Three changesets queued. `/bootstrap` is at **368 B** under its clause —
tight, and nothing left in this wave touches it. ADRs through 0079, next free 0080.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **21.4**, the submit lifecycle (spec 08 F122–F123). It is the wave's **security** item: F123
   maps an `HttpError` body onto fields, which is this library's first untrusted-payload path,
   and NFR-42 puts the `docs/security/threat-model.md` update *inside* the item rather than
   after it. Two things are already in place for it: findings are frozen
   `{message, severity, source, constraint?, cause?}`, and 21.3 guarantees they reach the DOM as
   text with no markup opt-in to bypass.
3. The double-submit guard is specified as **structural** — a second call returns the first
   call's promise rather than being refused (F122), which is the opposite of what most
   implementations do and worth not getting backwards.
