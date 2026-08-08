// Node-safety tests (roadmap 14.1, spec 04 NFR-18/NFR-20, ADR-0037) for the
// /bootstrap entry. **No jsdom pragma on purpose**: this file runs in plain Node
// with no DOM at all, which is the only way to prove either half of the claim.
//
// Both directions matter. Importing the entry must always succeed — a server
// render that merely *loads* a module bundle must not crash — while a builder
// that needs the ambient document must fail with the typed contract error naming
// what is missing, never a bare ReferenceError. And per NFR-18, none of this
// touches the optional `bootstrap` peer: the builders are pure DOM construction,
// so with no peer installed and no global loaded they still work, given a
// document.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import * as bootstrap from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

/**
 * A DOM built on demand rather than installed globally — exactly the
 * server-render shape the `document` option exists for (spec 04 F52).
 *
 * @returns {Document}
 */
function isolatedDocument() {
  return new JSDOM('<!doctype html><html><body></body></html>').window.document;
}

/** Every builder, called the cheapest legal way, with no document supplied. */
const AMBIENT_DOCUMENT_CALLS = /** @type {const} */ ([
  ['bsIcon', () => bootstrap.bsIcon('gear')],
  ['bsBadge', () => bootstrap.bsBadge('New')],
  ['bsButton', () => bootstrap.bsButton({ label: 'Save' })],
  ['bsCloseButton', () => bootstrap.bsCloseButton()],
  ['bsSpinner', () => bootstrap.bsSpinner()],
  ['bsProgress', () => bootstrap.bsProgress()],
  ['bsPlaceholder', () => bootstrap.bsPlaceholder()],
]);

describe('NFR-20 — the entry imports safely with no DOM', () => {
  it('has no ambient document to begin with', () => {
    // The premise of every assertion below; stated so a future jsdom default
    // cannot make this file pass vacuously.
    expect(globalThis.document).toBeUndefined();
  });

  it('exposes the whole 14.1 surface', () => {
    expect(Object.keys(bootstrap).sort()).toEqual([
      'bootstrapIconsSet',
      'bsBadge',
      'bsButton',
      'bsButtonGroup',
      'bsCloseButton',
      'bsIcon',
      'bsPlaceholder',
      'bsProgress',
      'bsSpinner',
      'materialIconsSet',
    ]);
  });

  it('evaluates the data presets without a DOM', () => {
    // Pure data must not need a document, and freezing proves nothing was
    // deferred to a lazy getter that would.
    expect(bootstrap.bootstrapIconsSet.classTemplate).toBe('bi bi-{name}');
    expect(bootstrap.materialIconsSet.ligature).toBe(true);
  });
});

describe('NFR-20 — a builder needing the ambient document fails typed', () => {
  it.each(AMBIENT_DOCUMENT_CALLS)('%s throws DomContractError, not ReferenceError', (name, act) => {
    // Matched on the stable code, never instanceof: the error may cross a realm
    // boundary (ADR-0003).
    expect(act).toThrow(
      expect.objectContaining({ code: 'EGL_DOM_CONTRACT', name: 'DomContractError' }),
    );
    // The message must name the entry and the way out, or a server-render stack
    // trace tells the reader nothing actionable.
    expect(act).toThrow(new RegExp(`${name} requires a DOM`));
    expect(act).toThrow(/egl-utils-js\/dom entry is browser-only/);
  });

  it('validates arguments before reaching for a document', () => {
    // Order matters: a programmer error must not be masked by the environment
    // error, or a typo in Node reads as "you need a browser".
    expect(() => bootstrap.bsIcon('two words')).toThrow(TypeError);
    expect(() => bootstrap.bsButton({ icon: 'gear' })).toThrow(/needs an accessible name/);
    expect(() => bootstrap.bsButtonGroup([], { label: 'x' })).toThrow(/non-empty array/);
  });
});

describe('NFR-20 — an explicit document makes every builder work in Node', () => {
  it('builds every element into the supplied document, with no global one', () => {
    const doc = isolatedDocument();

    const badge = bootstrap.bsBadge('New', { document: doc });
    const button = bootstrap.bsButton({ label: 'Save', icon: 'check', document: doc });
    const group = bootstrap.bsButtonGroup([button], { label: 'Actions', document: doc });
    const close = bootstrap.bsCloseButton({ document: doc });
    const spinner = bootstrap.bsSpinner({ document: doc });
    const progress = bootstrap.bsProgress({ value: 50, document: doc });
    const placeholder = bootstrap.bsPlaceholder({ lines: 2, document: doc });

    for (const el of [badge, button, group, close, spinner, progress.element, placeholder]) {
      expect(el.ownerDocument).toBe(doc);
    }
    expect(globalThis.document).toBeUndefined();

    // Not merely constructed — correct, in a realm that never had a global.
    expect(badge.outerHTML).toBe('<span class="badge text-bg-secondary">New</span>');
    expect(progress.element.getAttribute('aria-valuenow')).toBe('50');
    expect(button.querySelector('span')?.textContent).toBe('Save');
  });

  it('renders sanitized markup server-side too', () => {
    const doc = isolatedDocument();
    const badge = bootstrap.bsBadge('<b>ok</b>', {
      document: doc,
      html: true,
      sanitize: (html) => html,
    });
    expect(badge.querySelector('b')?.textContent).toBe('ok');
  });
});

describe('NFR-18 — the builders never touch the optional peer', () => {
  it('works with no `bootstrap` global loaded', () => {
    // The peer is for behaviours (M16). Classes are strings, so this half of the
    // toolkit has no peer contact at all — asserted, not assumed.
    expect(/** @type {Record<string, unknown>} */ (globalThis).bootstrap).toBeUndefined();
    const doc = isolatedDocument();
    expect(() => bootstrap.bsSpinner({ document: doc })).not.toThrow();
  });
});
