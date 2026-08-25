/**
 * egl-utils-js — the source of the **global single-file artifact** (spec 05 F83,
 * roadmap 18.2).
 *
 * This module is not an entry point: it is absent from the `exports` map on
 * purpose, and no consumer imports it. It exists so the build has one place to
 * bundle from when it emits `dist/global/egl-utils.global.js`, the IIFE a plain
 * HTML page loads with a classic `<script src>` — no modules, no bundler, no
 * npm — and reads as the single global `egl`.
 *
 * **The namespace is composed by re-export, never by hand.** An object literal
 * listing every export would be correct exactly once: the next export added to
 * an entry would be missing from the artifact, and nothing would say so. `export
 * *` cannot drift, and the packaging gate
 * (`tools/assert-global-artifact.mjs`) proves it against the eleven entries rather
 * than trusting it.
 *
 * **Nothing here assigns anything to a global.** The `var egl = …` wrapper is
 * the bundler's (`globalName` in `tsup.config.js`), which keeps this module —
 * and therefore the package's `sideEffects: false` claim — honest: importing it
 * defines nothing and touches nothing. Loading the built artifact has no effect
 * beyond defining `egl` (F83).
 *
 * The shape is the public surface exactly as the entries expose it, nothing
 * renamed: the root entry's exports at the top level (`egl.retry`,
 * `egl.VERSION`), and each subpath as a sub-namespace named after its exports
 * path (`egl.text`, `egl.bootstrap`). The optional peers stay external and are
 * resolved at use, exactly as on the ESM path — `bootstrap` and
 * `@popperjs/core` by the F68 lookup (ADR-0041), `dompurify` by the F82 one
 * (ADR-0055) — so this artifact bundles neither and carries no bare specifier.
 *
 * @module egl-utils-js/global
 */

// The root entry, flattened onto `egl` itself: `egl.retry`, `egl.VERSION`, the
// error classes it re-exports, and the rest of the 1.0 root surface.
export * from './index.js';

// Every subpath, under the name its exports-map path already uses. A name here
// must never collide with a root export — `assert-global-artifact.mjs` fails
// the build if one ever does, because the collision would silently shadow one
// of the two rather than error.
export * as storage from './storage.js';
export * as sanitize from './sanitize.js';
export * as errors from './errors.js';
export * as text from './text.js';
export * as net from './net.js';
export * as table from './table.js';
export * as logging from './logging.js';
export * as dom from './dom.js';
export * as bootstrap from './bootstrap.js';
export * as ui from './ui.js';
