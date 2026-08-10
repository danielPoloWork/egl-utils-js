---
'egl-utils-js': minor
---

**Breaking:** an unknown option key is now a `TypeError` (ROADMAP 17.7, ADR-0047).

Every function that takes an options bag rejects a key it does not know, naming it —
`bsBadge: unknown option 'varient'` — instead of dropping it in silence. All 52 bags across
every entry, the nested ones included (`bsToast.show`, `inlineAlert.show`,
`loadingOverlay.focus`), plus `cookieHelper`'s attribute bags, which say *attribute*.

The accepted set is each function's own destructuring pattern, so it cannot drift from the
implementation. Options this library deliberately does not model keep their typed channel:
`bootstrap` for vendor config, `operators` for the filter grammar, `classes` for the alert's
class map.

Filed by the v1.0.0 readiness review (17.1) as freeze-critical: code that passes an unknown
key "works" today, so this could not have been added inside 1.x. It also lands before the
17.8 renames deliberately — a moved option name now surfaces as a `TypeError` naming the key
instead of as configuration that quietly stopped applying.

Breaking under a `minor` while the line is pre-1.0; the release that carries it decides the
version.
