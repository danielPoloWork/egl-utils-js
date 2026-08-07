---
'egl-utils-js': minor
---

`bindTableControls` on the `egl-utils-js/dom` entry (ROADMAP 13.2, spec 03 F51, ADR-0035):
the bridge between a `tablePipeline` and its DOM controls, and the last item of the tabular
wave. Filter and search inputs are debounced into public commands, sort headers share one
delegated listener and receive `aria-sort`, pagination controls are enabled from the derived
view, and the status text comes from an injectable `formatStatus` whose default assumes no
language. Teardown is structural — the returned unbind function, or an aborted signal,
detaches every listener, cancels every pending debounce and unsubscribes from the pipeline.
Row rendering stays the caller's.
