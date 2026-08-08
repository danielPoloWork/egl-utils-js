---
'egl-utils-js': minor
---

The Bootstrap navigation set (ROADMAP 16.2, spec 04 F72–F76, ADR-0042): `bsCollapse`,
`bsAccordion`, `bsDropdown`, `bsTabs` and `bsNavbar` on `egl-utils-js/bootstrap`.

Three of the five build their own markup, because a navigation component's accessibility
is expressed through the ids joining its parts — `aria-controls`, `aria-labelledby`,
`data-bs-target` — and a duplicate or stale id is a silent defect that still looks right.
Ids are minted against the live document and against the batch being built, so they can
collide with neither. Exclusivity, keyboard roving and positioning stay Bootstrap's own.

Also corrected: `bsToast` builds in its container's document rather than the ambient one,
matching the other container-taking managers.
