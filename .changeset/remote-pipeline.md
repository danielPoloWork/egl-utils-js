---
'egl-utils-js': minor
---

**`remotePipeline` — table data from a server** (ROADMAP 19.1, spec 06 F88–F91,
[ADR-0062](docs/adr/0062-a-sibling-not-a-wrapper.md)).

`tablePipeline` derives a view from rows you already hold. `remotePipeline` holds the same
question — filters, search, sort, page — and asks a server to answer it.

```js
import { remotePipeline } from 'egl-utils-js/table';

const table = remotePipeline({
  pageSize: 20,
  load: (query, signal) => api.post('orders/search', { json: query, signal }),
});
table.on('change', (view) => render(view.rows, { loading: view.loading, error: view.error }));
table.setSearch('milan');
```

**Same command vocabulary as `tablePipeline`** — `setFilter`, `setSearch`, `toggleSort`,
`setSort`, `setPage`, `setPageSize`, `batch`, `on`/`once`/`off`, `view()` — plus `refresh()`
and `destroy()`. Moving a table from local rows to a server changes where the data comes from
and nothing your calling code has to relearn.

**Out-of-order responses cannot show the wrong page.** A superseded load is aborted *and* its
result discarded even if it arrives first; an identical query does not re-issue; a failed load
leaves the previous rows in place with the error reported beside them. The transport is
injected, never imported, so `/table` still pulls in no `fetch` and still runs on a server.

Also new: **`tableQuery`**, the pure serializer behind it — the pipeline's state as a plain,
JSON-safe, transport-neutral object, stable enough to use as a cache key.

Purely additive: `tablePipeline` is untouched, and a consumer who does not import
`remotePipeline` pays none of its bytes.
