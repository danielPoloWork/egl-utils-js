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
 *   the `/sanitize` precedent for DOMPurify (ADR-0012), with the difference that
 *   nothing here is ever imported: the namespace is looked up from the injected
 *   option or the ambient global, and its absence is a typed `EGL_PEER_MISSING`
 *   throw at the call (ADR-0041). Importing this entry never needs the peer, and
 *   every builder above runs without it.
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

// Composite builders (spec 04 §2 items F61-F65, ADR-0038). Two of them compose
// rather than implement: bsAlert is the F49 engine in Bootstrap's costume, and
// bsPagination speaks the read model F42 already returns.
export {
  bsAlert,
  bsBreadcrumb,
  bsCard,
  bsListGroup,
  bsPagination,
} from './bootstrap-composites.js';

// The table manager (spec 04 §2 item F66, ADR-0039). A facade over the F42
// pipeline that keeps it public: `.pipeline` is the instance itself, so the
// escape hatch out of the facade is the same object the facade uses.
export { bsTable } from './bootstrap-table.js';

// Behaviour wrappers over the optional `bootstrap` peer (spec 04 §2 items
// F68-F71, ADR-0041). Resolution is lazy and injected-first, so these cost the
// builders above nothing: no import, no load-time contact, no peer required to
// use this entry.
export { bsLoadingOverlay, bsModal, bsToast } from './bootstrap-behaviors.js';

// The navigation set (spec 04 §2 items F72-F76, ADR-0042). Two of these wrap;
// three build their own markup, because a navigation component's accessibility
// lives in the ids joining its parts, and ids are what hand-written templates
// get wrong.
export { bsAccordion, bsCollapse, bsDropdown, bsNavbar, bsTabs } from './bootstrap-nav.js';

// Overlays and observation (spec 04 §2 items F77-F79, ADR-0043). Three shapes,
// not one group: an offcanvas is the shared lifecycle again, a carousel builds
// and labels its own slides, and a scrollspy has no open state at all.
export { bsCarousel, bsOffcanvas, bsScrollspy } from './bootstrap-overlays.js';
