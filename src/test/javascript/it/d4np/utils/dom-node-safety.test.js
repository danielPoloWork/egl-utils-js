// @vitest-environment node
// Node-safety tests (roadmap 11.1, spec 03 NFR-14, ADR-0028). The pragma above
// is deliberate and explicit: this file must run with no document anywhere,
// which is the only place the fail-fast half of the contract can be observed.
// Its browser-side counterpart is bind-elements.test.js, under jsdom.
//
// The environment is pinned rather than inherited from the config, so a future
// switch of the project default cannot silently turn this suite into a second
// jsdom run that proves nothing. (Naming the *other* environment in prose here
// would also re-declare it — vitest reads the pragma out of any comment.)
import { describe, expect, it } from 'vitest';
import {
  bindElements,
  isElement,
  requireDocument,
} from '../../../../../main/javascript/it/d4np/utils/dom.js';
import { DomContractError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

describe('the /dom entry with no DOM present', () => {
  it('imports without throwing, so a server render can load the module', () => {
    // The document is resolved per call, never at module scope — which is also
    // what keeps the entry side-effect-free for tree-shaking (NFR-02).
    expect(typeof bindElements).toBe('function');
    expect(typeof requireDocument).toBe('function');
    expect(typeof isElement).toBe('function');
  });

  it('confirms the premise: there really is no document here', () => {
    expect(globalThis.document).toBeUndefined();
  });

  it.each([
    ['requireDocument', () => requireDocument('requireDocument')],
    ['bindElements', () => bindElements({ app: '#app' })],
    ['bindElements with strict', () => bindElements({ app: '#app' }, { strict: true })],
  ])('%s throws DomContractError, never ReferenceError', (_label, call) => {
    let thrown;
    try {
      call();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DomContractError);
    // Identity by stable code, never cross-realm instanceof (ADR-0003).
    expect(thrown.code).toBe('EGL_DOM_CONTRACT');
    expect(thrown).not.toBeInstanceOf(ReferenceError);
  });

  it('names the contract and the DOM-free alternative in the message', () => {
    // A bare `ReferenceError: document is not defined` names the symptom; this
    // has to name the cause and where to go instead.
    expect(() => requireDocument('bindElements')).toThrow(/requires a DOM/);
    expect(() => requireDocument('bindElements')).toThrow(/egl-utils-js\/table/);
    expect(() => requireDocument('bindElements')).toThrow(/^bindElements/);
  });

  it('still resolves a caller-supplied root without a document', () => {
    // Only the *default* root needs the document, so a component handed its own
    // subtree keeps working — including in a server-side DOM implementation.
    const root = {
      nodeType: 1,
      querySelector: (selector) => (selector === '#app' ? { nodeType: 1, id: 'app' } : null),
    };
    const { elements, missing } = bindElements(
      { app: '#app', ghost: '#nope' },
      { root: /** @type {never} */ (root) },
    );
    expect(missing).toEqual(['ghost']);
    expect(elements.app).toMatchObject({ id: 'app' });
  });

  it('validates its arguments before reaching for the document', () => {
    // A TypeError for a programmer error must not be masked by the environment
    // check — the caller's bug is the more useful message.
    expect(() => bindElements(/** @type {never} */ (null))).toThrow(TypeError);
  });

  it('isElement is pure and needs no DOM at all', () => {
    expect(isElement({ nodeType: 1, querySelector: () => null })).toBe(true);
    expect(isElement(null)).toBe(false);
  });
});
