/**
 * What a **no-bundler page actually downloads**, per documented route — the
 * declared figures behind spec 05 F87 (roadmap 18.5).
 *
 * `tools/check-transfer-budgets.mjs` verifies every number here against the
 * built `dist/`, so nothing below is trusted: the closure is recomputed from the
 * real import graph and each file is compressed on every run.
 *
 * ## Why this is not a `.size-limit.json` row
 *
 * Spec 05 §6 originally placed these figures beside the other 100 size rows.
 * They cannot live there, and the reason is mechanical rather than aesthetic:
 * **a deep-ESM route is a set of files whose names are content hashes.** Adding
 * one comment line to `errors.js` and rebuilding renames *four of the nine*
 * chunks — measured, not assumed (ROADMAP 18.5, ADR-0061). A static row naming
 * `chunk-47ELFAOV.js` would need editing on most PRs that touch any source, and
 * a gate that must be re-pinned constantly is a gate people stop reading.
 * Keying by **entry name** — which is stable public API — and resolving the
 * closure at run time is the only shape that survives.
 *
 * ## Why it is a different number from the size-limit row for the same entry
 *
 * The two answer different questions and both are kept:
 *
 * - a **size-limit row** measures what a *bundler consumer* ships: the entry
 *   tree-shaken to the imports actually used, bundled into one file, then
 *   compressed once (NFR-01/NFR-02);
 * - a **row here** measures what a *static page* transfers: the entry file plus
 *   every chunk it transitively imports, each served and compressed as its own
 *   response, with no tree-shaking, because the browser downloads whole files.
 *
 * The served figure is therefore always the larger one, often by a lot —
 * `/index` is 6 068 B bundled and 13 461 B served — and quoting the bundled
 * number at a no-bundler consumer would understate their cost by half.
 *
 * ## The metric
 *
 * Brotli at Node's default quality, each file compressed **separately**, summed
 * — because that is what a CDN does with independent responses. The existing
 * size rows are also brotli (see ADR-0059 on NFR-22's loose "min+gzip"
 * wording), so the two accountings stay comparable.
 *
 * ## Expect two rows to move on every version bump
 *
 * `root` and `artifact` are the routes that carry the `VERSION` string, and
 * brotli is sensitive enough that changing `1.0.0` to `1.1.0` moved them by
 * −12 B and −98 B respectively — the other nine were byte-identical. That is
 * real, it is not noise to suppress, and it is why the check prints the drift
 * on every run: re-baselining these two at each release is reading one line,
 * and the alternative is a permanent drift note people learn to scroll past.
 *
 * @module tools/transfer-budgets
 */

/**
 * @typedef {object} TransferRoute
 * @property {string} file - Path under `dist/`, relative to the package root.
 *   For a deep-ESM entry this is the file a page imports; its chunk closure is
 *   resolved from it.
 * @property {number} requests - Exact number of files the page fetches for this
 *   route — the entry plus its transitive chunks, or 1 for the artifact. Gated
 *   exactly rather than as a ceiling: a build change that splits or merges a
 *   chunk changes the round-trip count on a high-latency connection even when
 *   the byte total holds, and that deserves a deliberate look rather than a
 *   silent pass.
 * @property {number} measured - Served bytes at the last re-pin: every file in
 *   the closure brotli-compressed on its own, summed.
 * @property {number} budget - The gate. Measured + ≤ 7%, the ADR-0015 practice.
 * @property {string} [why] - Anything a reader would otherwise have to derive.
 */

/**
 * Every route the README's "Use from a browser, without npm" section documents
 * (spec 05 F85), in the order that section presents them.
 *
 * @type {Record<string, TransferRoute>}
 */
export const TRANSFER_ROUTES = {
  // --- The deep-ESM route, one row per entry (F85's per-entry URLs) ---------
  index: { file: 'dist/esm/index.js', requests: 7, measured: 13574, budget: 14400 },
  storage: {
    file: 'dist/esm/storage.js',
    requests: 5,
    measured: 4503,
    budget: 4820,
    why: '+161 B and a FIFTH request in 20.3, for a wave that added nothing to this entry: the F106 theme manager persists through the F21 wrapper, so /ui became a consumer of this entry and esbuild re-split the chunk they now share. A bundler consumer of /storage saw 3 B of that (the size row); a static page sees a round trip.',
  },
  sanitize: {
    file: 'dist/esm/sanitize.js',
    requests: 4,
    measured: 3736,
    budget: 4000,
    why: '+724 B and a FOURTH request in 23.1 for the F126 URL guard, which is 247 B of bundled code on the size-limit row: `url-guard.js` became its own shared chunk, so a static page fetches one more file and pays for all of it. That gap between 247 B and 724 B is the whole reason F87 counts served bytes rather than imported ones (ADR-0061). DOMPurify is looked up, never imported (ADR-0055), so the peer costs this route nothing until the page loads it itself.',
  },
  errors: {
    file: 'dist/esm/errors.js',
    requests: 2,
    measured: 1178,
    budget: 1260,
    why: '+104 B in 19.4 for ClipboardError and its reason vocabulary (spec 06 F97, ADR-0066). Eleven classes over two requests; a route this small moves in percentage terms on any addition, which is why the figure and not the percentage is the thing to read.',
  },
  text: { file: 'dist/esm/text.js', requests: 3, measured: 1674, budget: 1790 },
  net: { file: 'dist/esm/net.js', requests: 2, measured: 1340, budget: 1430 },
  table: {
    file: 'dist/esm/table.js',
    requests: 5,
    measured: 11936,
    budget: 12600,
    why: "+115 B in 23.2 for the F128 hidden set the F92 pair now serializes — 98 B of source on the bundled rows, so this route pays close to what a bundler consumer does, which is what a small addition inside a file the route already fetches whole looks like. Budget unchanged: it had the room. +1170 B in 19.3 for the F94 selection model, on top of 19.2's state pair and 19.1's remotePipeline — three siblings behind one entry, and this route pays for the whole file each lives in. That is the trade the deep-ESM route makes, and the reason F87 counts served bytes rather than imported ones: a bundler consumer pays the 1433 B tableSelection size row, and only if they import it.",
  },
  logging: { file: 'dist/esm/logging.js', requests: 3, measured: 3063, budget: 3270 },
  dom: {
    file: 'dist/esm/dom.js',
    requests: 12,
    measured: 17842,
    budget: 18700,
    why: '+310 B in 23.2 and no new request, for the F93 binding learning about column visibility (200 B on the bundled row) — the first movement on this route in three items that did not also re-split the chunk graph. Budget unchanged; the margin narrows from 1168 B to 858 B, which is worth reading here rather than discovering next time. +735 B and TWO more requests in 21.1 (a TWELFTH file), and this entry gained 108 B of source: the F113 `getValue` read primitive went here rather than into /forms, so a page that wants to read one control pays 280 B of bundled code — while a static page pays for two extra round trips it did not ask for, because a twelfth entry re-split the shared chunks. That gap between 108 B and 735 B is the whole reason F87 measures both. Before that: +924 B and a TENTH request in 20.6, for the F111 reduced-motion helper (291 B on its own) plus the chunk re-split around it. +524 B and a NINTH request in 20.1, for a wave that added nothing to this entry: the new /ui entry became an eleventh consumer of the shared chunks and esbuild re-split them, so a deep-ESM /dom page now fetches one more file. This is the cost F87 exists to keep visible - a bundler consumer sees 2 B of it (the size-limit row), a static page sees 524 B and a round trip. Before 20.1: +2683 B and an eighth request for bindTableHistory (spec 06 F93, roadmap 19.2, ADR-0063) and the F92 pair it composes.',
  },
  bootstrap: {
    file: 'dist/esm/bootstrap.js',
    requests: 13,
    measured: 48171,
    budget: 50300,
    why:
      '+1653 B in 23.2 for F128/F129 column visibility, against 1218 B on the bundled row: the gap is the F110 live region, which lives in a file this route already fetches whole and therefore costs a static page nothing extra, while the shared chunk carrying it grew for every route that fetches it. THIRTEEN requests still, so the chooser added no chunk. Re-pinned at the 2082 B margin this row had. ' +
      '+1051 B and a THIRTEENTH request in 23.1 for the F127 URL routing, 371 B of it on the bundled row: the guard own chunk is one more file this route fetches whole. ' +
      'The whole catalogue over 8 requests — still MORE than the single-file artifact over 1, so a page needing ' +
      '/bootstrap should take the artifact. 19.3 is the first M19 item to grow it for a feature it actually ' +
      'gained: bsTable renders the F95 selection column. 19.1 and 19.2 grew it for features it did not, because ' +
      'bsTable pulls the shared table chunk and that chunk carries remotePipeline and the F92 pair too. A bundler ' +
      'shakes those away; this route downloads whole files, which is exactly the cost F87 exists to keep visible ' +
      'instead of silent. ' +
      'Re-pinned for 20.1 at measured + 6.1%, the ordinary ADR-0015 practice — which applies here and does NOT apply ' +
      'to the artifact row below, because this route answers to no spec ceiling and that one answers to NFR-22. ' +
      '20.1 is the largest movement this route has ever taken for a wave that changed NONE of its source: +2607 B and ' +
      'TWO more requests AGAIN in 21.1 (+713 B, a twelfth file), for a wave that added nothing to this entry — and the same wave GAVE it 32 B back on the bundled size-limit row. A static page and a bundler consumer moved in opposite directions from one change, which is the clearest example on this table of why both instruments exist. Before that, TWO more requests because the new /ui entry re-split the shared chunks this route downloads whole. The advice ' +
      'above therefore holds harder than before — a page needing /bootstrap should take the artifact, which is now ' +
      '3 kB smaller over 1 request than this route is over 10.',
  },

  ui: {
    file: 'dist/esm/ui.js',
    requests: 11,
    measured: 25290,
    budget: 26870,
    why:
      '+91 B in 23.2 with nothing on this entry changing and no new request: the F128 visibility code landed in a /bootstrap internal file this route already fetches whole. The same second-order movement 23.1 cost it 49 B of on the bundled row, and the reason this table re-pins on drift rather than on authorship. ' +
      '+913 B and an ELEVENTH request in 23.1 for a guard this entry never calls: /ui composes /bootstrap internals, so the new chunk is in its closure. One change, two consumers, and only this table can see the second one. ' +
      'The application-UX entry (spec 07 NFR-32). +182 B and a TENTH request in 21.1, entirely from the chunk re-split around the new /forms entry — nothing on this entry moved, and the budget is unchanged because it had the room. Before that: +261 B and a NINTH request in 20.6, for the F111 reduced-motion helper - most of the movement is the shared chunks re-splitting, not the helper itself, which lives on /dom and is imported by nothing here. Before that: +4 612 B and TWO more requests in 20.3, and the cause is worth reading: the F106 theme manager persists through the F21 storage wrapper, which a bundler consumer pays 1 464 B for and a static page pays 4 612 B and two round trips for, because this route downloads whole files. Reusing the wrapper is a spec requirement and the right call - it is also the clearest example on this table of the same decision costing two consumers very different amounts. Before that, +2 178 B in 20.2 for the toast manager, on a route that then cost six requests — the queue and the promise helper landed inside files this route already downloaded whole. Two and a half times its 7 332 B size-limit row, and the gap is the point ' +
      'of this file: a bundler consumer importing `createDialogs` ships the tree-shaken 5 kB, while a static page ' +
      'downloads ui.js plus the five chunks it imports whole — the F70 modal wrapper, the F55/F56 buttons, the F109 ' +
      'focus primitives and the builder contract underneath them. Composition is free for the bundler consumer and ' +
      'billed by the file here.',
  },

  forms: {
    file: 'dist/esm/forms.js',
    requests: 6,
    measured: 14137,
    budget: 15100,
    why:
      'The form engine (spec 08 NFR-43). +1027 B in 21.5 for the F124-F125 tracker, which closes spec 08 — and still the SAME six requests, for the fifth consecutive item: every sibling in this wave landed inside files this route already downloaded whole. That is what a subject entry buys a no-bundler page, and it is the reason this row grew 10 390 B across five items without ever costing a round trip. Before that, +1903 B in 21.4 for the F122-F123 submit lifecycle, on the same six requests for the fourth consecutive item — every sibling in this wave has landed inside files this route already downloaded whole, which is the one direction this table moves cheaply and the reason a subject entry was worth its own path. Note the gap: the size-limit row grew 1471 B and this one 1903 B for the same code, because a static page also pays for the parts of the shared chunks tree-shaking would have removed. Before that, +3064 B in 21.3 for the F120-F121 renderer, again on the SAME six requests - and this time the growth includes the F110 live region pulled in from /dom, which this route was already downloading whole. Before that, +2372 B in 21.2 for the F116-F119 validation engine, also on the same six requests: the rules, the races and the constraint seam all landed inside files this route already downloaded whole, which is the one direction this table ever moves cheaply. Twice its 3747 B size-limit row, and the ' +
      'ratio is the point rather than a surprise: a bundler consumer importing `createForm` ships the tree-shaken ' +
      '1.8 kB, while a static page downloads forms.js plus the five shared chunks it imports WHOLE — the error ' +
      'taxonomy, the DOM helpers, the native setters, the option-key check and the lifecycle guard. Composition is ' +
      'free for the bundler consumer and billed by the file here, which is the same lesson /ui records one entry up. ' +
      'It is also the cheapest route of the four that need a document, which is what putting the engine on its own ' +
      'entry bought: a form page does not download the Bootstrap catalogue to read a checkbox.',
  },

  // --- The artifact route (F83) --------------------------------------------
  artifact: {
    file: 'dist/global/egl-utils.global.js',
    requests: 1,
    measured: 52163,
    budget: 53210,
    why:
      'Re-baselined for 23.2 (+1093 B for F128/F129 column visibility, the chooser and its live region), which also re-derives NFR-22 to 73 kB (72032 B) — the second re-derivation in two items, and neither for a new entry: /bootstrap, /table and /dom each grew. Before that, re-baselined for 23.1 (+414 B for the F126-F127 URL guard and its routing). Before that, re-baselined at the v1.4.0 release: -9 B, which is the VERSION string this route carries going from 1.3.0 to 1.4.0 and brotli reacting to it — the movement this table predicts at every version bump, re-pinned rather than left as a drift note people learn to scroll past. Re-pinned for 21.5 (+827 B for the F124-F125 tracker) — and re-pinned rather than left alone, because it still PASSED at 175 B under the old budget, which is not a margin to ship on. Before that, re-pinned for 21.4 (+1396 B for the F122-F123 submit lifecycle), holding the ADR-0059 rule. Before that, re-pinned for 21.3 (+1281 B for the F120-F121 renderer and the F120 class map), holding the same. Before that, re-pinned for 21.2 (+1609 B for the validation engine). Before that, re-pinned for 21.1 (+1178 B for the F112-F115 form engine and the twelfth-entry chunk re-split). Before that, re-pinned for 20.6 (+160 B for the F111 reduced-motion helper), holding the ADR-0059 rule: this is the file served as-is, which is what a CDN sends, while the size-limit row for the same path reports a smaller number because it re-bundles through esbuild first. Two honest measurements of two different things, kept separate on purpose (ADR-0061). ' +
      "20.5 is where two waves of pressure resolved. NFR-22's ceiling is RE-DERIVED to 52 kB rather than raised, by spec 05's own method — the sum of the measured entry figures, an upper bound on a deduplicated single file, which reads 52104 B today against 39.8 kB at M18. That recomputation, and not a bigger number, is the condition spec 07 NFR-33 attached (ADR-0070). " +
      'The budget here stays tight on purpose: 40400 B is measured + 1.8%, not the ADR-0015 + 7%. The clause is an authoring bound with 12 kB of slack in it — that gap IS the deduplication the derivation always assumed — and a clause with slack does no per-PR work, while this row does. Two instruments, different jobs: the split ADR-0041 already made for the /bootstrap entry. ' +
      '20.3 recomputed it a fourth time (60914 B → 60 kB), 20.6 a FIFTH (61938 B → 62 kB), 21.1 recomputed it on a TWELFTH input (63862 B → 64 kB), 21.2 recomputed it again with no new entry at all — the twelfth one grew, and the rule is whenever any input moves rather than whenever an entry is added (65768 B → 66 kB) — 21.3 did the same a third consecutive time (67624 B → 68 kB) and 21.4 a FOURTH (69095 B → 70 kB, the whole +1471 B from /forms and no other entry moving by a byte). 21.5 recomputes it a FIFTH time and the clause does not move: 69980 B rounds to the same 70 kB, with 20 B left under it — the derivation moved and the bound did not, which is exactly the distinction the rule is about. This row moves to 51680 B (measured + 2.0%). The derivation is redone whenever ANY of its inputs moves, not only when an entry is added: a clause nobody recomputes is a number rather than a bound. ' +
      "The sibling constraint moved in the helpful direction for once: ADR-0041's 25 kB /bootstrap clause held at 473 B free through 20.6, and 21.1 leaves 505 B free — the twelfth entry re-split the shared chunks in that entry's favour, without a line of it changing.",
  },
};
