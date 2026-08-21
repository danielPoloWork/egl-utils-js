---
'egl-utils-js': minor
---

**Sticky table header** (ROADMAP 19.5, spec 06 F98,
[ADR-0067](docs/adr/0067-five-declarations-and-no-scroll-listener.md)).

`bsTable({ sticky })` keeps the header visible while the body scrolls, and **`position: sticky`
is the entire implementation**: no scroll listener, no `requestAnimationFrame`, nothing measured
in JavaScript. Five declarations applied once at build time, which is why it needs no new
platform API and costs 372 bytes.

```js
bsTable(host, { columns, data, responsive: true, sticky: { maxHeight: '400px' } });
```

`sticky.maxHeight` bounds the responsive wrapper — what gives the body something to scroll
inside — and adds the `overflow-y` that `.table-responsive` does not ask for. Omit it and the
header sticks to whatever scroll container you built yourself. Passing it **without**
`responsive` is a `TypeError` rather than a no-op: there would be no node of ours to bound, and a
header that never sticks with nothing to explain it is the failure this refuses.

The styles land per `<th>`, so the F95 selection column sticks along with the rest, and each cell
gets a `--bs-*`-derived background and an inset bottom rule — a sticky cell otherwise loses its
collapsed border and lets rows scroll through it. `aria-sort` and the sort controls behave
exactly as they did.
