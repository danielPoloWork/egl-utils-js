/**
 * egl-utils-js — the browser-leaning DOM entry (spec 03).
 *
 * A barrel over the entry's source files, mirroring the root `index.js` shape:
 * named exports only, no default aggregate object, so a consumer importing one
 * helper pulls in nothing else (NFR-02, ADR-001). The files behind it are split
 * by responsibility — helpers, components, and the table binding — while the
 * entry stays single, because a component consumer always needs the helpers and
 * a second entry would cost four coordinated wiring edits to say so.
 *
 * Everything here needs a live document and fails fast with `DomContractError`
 * when there is none (spec 03 NFR-14, ADR-0028) — except `withUrlParams`, which
 * is pure and SSR-safe and is kept on this entry only for compatibility; it is
 * also exported from the root (ADR-0052), which is where new code should
 * import it from. The DOM-free half of the same feature set lives on
 * `egl-utils-js/table`.
 *
 * Every options bag on this entry **rejects a key it does not know** with a
 * `TypeError` naming it: the destructuring is the schema (ADR-0047).
 *
 * @module egl-utils-js/dom
 */

// DOM helpers (spec 03 §2 items F43-F48, ADR-0028).
export { bindElements, isElement, requireDocument } from './dom-helpers.js';

// Event delegation and native element setters (spec 03 §2 items F44-F45, ADR-0029).
export { delegate, setEnabled, setValue, setVisible } from './dom-events.js';

// Fragment injection, textarea auto-grow, URL parameters (spec 03 §2 items F46-F48, ADR-0030).
// `withUrlParams` is also on the root entry (ADR-0052) — this binding stays for
// compatibility and is not removed.
export { autoGrow, injectFragment, withUrlParams } from './dom-fragment.js';

// Instance-based UI components (spec 03 §2 items F49-F50, ADR-0031/0032).
export { inlineAlert, loadingOverlay } from './dom-components.js';

// The bridge to the /table pipeline (spec 03 §2 item F51, ADR-0035).
export { bindTableControls } from './dom-table.js';

// The bridge to the address bar (spec 06 §2 item F93, ADR-0063). The pure half
// of the same feature — state ↔ query string — is on `egl-utils-js/table`.
export { bindTableHistory } from './dom-history.js';

// Accessibility primitives (spec 07 §2 items F109-F110, ADR-0070). Nothing here
// needs a component library, which is why they are on this entry rather than
// behind the Bootstrap-flavoured one (spec 07 §4).
export { focusTrap, liveRegion, saveFocus } from './dom-a11y.js';

// The clipboard write (spec 06 §2 item F97, ADR-0066). The text it moves is built
// by `tableCsv` on `egl-utils-js/table`, which needs no DOM at all.
export { copyToClipboard } from './dom-clipboard.js';
