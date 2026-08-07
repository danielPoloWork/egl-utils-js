/**
 * egl-utils-js — the opt-in Bootstrap 5 toolkit (spec 04).
 *
 * A barrel over the entry's source files, mirroring the `/dom` shape: named
 * exports only, no default aggregate object, so importing one builder pulls in
 * nothing else (NFR-02, ADR-001).
 *
 * **This entry composes the framework-agnostic core; the core never imports
 * it.** That direction is the toolkit's whole architecture (ADR-0037): Bootstrap
 * markup, class names and peer wiring live here, while state, timers,
 * reference counts, delegation and derivation stay in the spec-02/03 mechanisms
 * this layer composes. Nothing on the older entries knows Bootstrap exists, so a
 * project on a different design system pays nothing for this one.
 *
 * Two dependency facts follow from that, and are load-bearing:
 *
 * - **Classes are strings.** The element builders need a document and nothing
 *   else — no `bootstrap` package, no stylesheet, no icon font. The library's
 *   zero-runtime-dependency promise (NFR-06) is untouched.
 * - **Behaviours are a peer.** Anything driving a Bootstrap component's
 *   JavaScript resolves the **optional** `bootstrap` peer lazily, at first use —
 *   the `/sanitize` precedent for DOMPurify (ADR-0012). Those wrappers arrive
 *   with M16; until then this entry has no peer contact at all.
 *
 * The application supplies Bootstrap's CSS itself: this toolkit emits markup and
 * class names, and ships no stylesheet (spec 04 §1 non-goals).
 *
 * @module egl-utils-js/bootstrap
 */

// Element builders and the icon-set adapters (spec 04 §2 items F52-F60, ADR-0037).
export {
  bootstrapIconsSet,
  bsBadge,
  bsButton,
  bsButtonGroup,
  bsCloseButton,
  bsIcon,
  bsPlaceholder,
  bsProgress,
  bsSpinner,
  materialIconsSet,
} from './bootstrap-elements.js';
