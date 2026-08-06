---
'egl-utils-js': minor
---

`createResource` joins the root entry (ROADMAP 9.6, spec 02 F38, ADR-0025), completing
milestone 9: a REST resource factory returning `{ list, get, create, update, patch, remove }`
for one collection.

The client is a **parameter, never an import**. Anything exposing
`get`/`post`/`put`/`patch`/`delete` backs a resource — `httpClient`, a test double, or
another library's client — which keeps the function at 505 B instead of inheriting the
1304 B facade, works for callers on a different transport, and makes tests need neither a
network nor a mocking framework. The five verbs are verified once, when the resource is
built, so a mis-wired transport fails at startup rather than on the first request.

Ids are treated as data: each is encoded as exactly one path segment, so an id containing
`/` or `..` addresses a key with those characters rather than widening the path, and a
`null`/`undefined` id throws instead of silently requesting `…/undefined`. The configured
path keeps its own separators (`'admin/users'` nests) and a leading `/` is preserved.
Bodies are sent as JSON; per-call `signal`, `timeout`, and `headers` pass straight through.
