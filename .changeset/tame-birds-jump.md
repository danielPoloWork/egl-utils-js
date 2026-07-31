---
'egl-utils-js': minor
---

`VERSION` is now re-exported from the root entry (ROADMAP 8.2, ADR-0018), so consumers can
read the running package version at runtime without a separate subpath import.
