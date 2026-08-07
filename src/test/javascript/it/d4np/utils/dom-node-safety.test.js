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
import { describe, expect, it, vi } from 'vitest';
import {
  bindElements,
  delegate,
  injectFragment,
  inlineAlert,
  isElement,
  requireDocument,
  setEnabled,
  setValue,
  setVisible,
  withUrlParams,
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

  // NFR-14 as amended in 11.2: an export handed an explicit node acts on that
  // node and needs no ambient document. Requiring one a function never reads
  // would be a check for its own sake — and would make these unusable inside a
  // server-side DOM implementation.
  it('delegate works against a caller-supplied root with no document', () => {
    /** @type {Record<string, Function[]>} */
    const listeners = {};
    const fakeRoot = {
      nodeType: 1,
      querySelector: () => null,
      contains: () => true,
      addEventListener: (type, listener) => {
        (listeners[type] ??= []).push(listener);
      },
    };
    const matched = { nodeType: 1, querySelector: () => null, closest: () => matched };

    const handler = vi.fn();
    const off = delegate(/** @type {never} */ (fakeRoot), 'click', 'tr', handler);
    listeners.click[0]({ target: matched });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]).toBe(matched);
    expect(() => off()).not.toThrow();
  });

  it.each([
    ['setEnabled', () => setEnabled(null, true)],
    ['setVisible', () => setVisible(null, true)],
    ['setValue', () => setValue(null, 'x')],
  ])('%s is a no-op on null even with no DOM', (_label, call) => {
    expect(call).not.toThrow();
  });

  it('the setters act on a supplied element without any document', () => {
    const element = { nodeType: 1, querySelector: () => null, disabled: false, hidden: false };
    setEnabled(/** @type {never} */ (element), false);
    setVisible(/** @type {never} */ (element), false);
    expect(element).toMatchObject({ disabled: true, hidden: true });
  });

  it('the setters still reject a wrong type rather than the environment', () => {
    expect(() => setEnabled(/** @type {never} */ ('#x'), true)).toThrow(TypeError);
  });

  it('withUrlParams is pure and SSR-safe — no document, location, or URL base', () => {
    // It never touches the URL constructor, which is why a relative URL works.
    expect(withUrlParams('items?page=1#top', { page: 2, tag: ['x', 'y'] })).toBe(
      'items?page=2&tag=x&tag=y#top',
    );
  });

  it('injectFragment works against a supplied element and an injected fetch', async () => {
    const target = {
      nodeType: 1,
      querySelector: () => null,
      innerHTML: '',
    };
    await injectFragment(/** @type {never} */ (target), '/f.html', {
      sanitize: false,
      fetch: async () => ({ ok: true, status: 200, text: async () => '<p>server</p>' }),
    });
    expect(target.innerHTML).toBe('<p>server</p>');
  });

  it('injectFragment still requires the sanitize decision with no DOM', async () => {
    const target = { nodeType: 1, querySelector: () => null, innerHTML: '' };
    await expect(injectFragment(/** @type {never} */ (target), '/f.html')).rejects.toThrow(
      /sanitize is required/,
    );
  });

  // inlineAlert creates nodes, so it needs *a* document — but the container's
  // own one will do. Same amended NFR-14 rule as the setters: only an export
  // reaching for the ambient document may demand one.
  it('inlineAlert builds through the container’s ownerDocument, with no global one', () => {
    /** @param {string} tag */
    const makeNode = (tag) => ({
      nodeType: 1,
      tagName: tag.toUpperCase(),
      className: '',
      hidden: false,
      /** @type {object[]} */ children: [],
      /** @type {Record<string, string>} */ attributes: {},
      textContent: '',
      querySelector: () => null,
      /** @param {...object} nodes */ append(...nodes) {
        this.children.push(...nodes);
      },
      replaceChildren() {
        this.children = [];
      },
      /** @param {string} name @param {string} value */ setAttribute(name, value) {
        this.attributes[name] = value;
      },
      addEventListener() {},
      remove() {},
    });
    const container = {
      ...makeNode('div'),
      ownerDocument: { createElement: makeNode },
    };

    const alerts = inlineAlert(/** @type {never} */ (container), { dismissible: false });
    alerts.show('success', 'server-rendered');

    expect(container.children).toHaveLength(1);
    const root = /** @type {ReturnType<typeof makeNode>} */ (container.children[0]);
    expect(root.className).toBe('egl-alert egl-alert--success');
    expect(root.attributes.role).toBe('status');
    expect(() => alerts.destroy()).not.toThrow();
  });

  it('inlineAlert throws DomContractError when there is no document anywhere', () => {
    // A container with no owner document and no global one: there is nowhere to
    // create the alert, and saying so beats a ReferenceError.
    const container = { nodeType: 1, querySelector: () => null, append: () => {} };
    let thrown;
    try {
      inlineAlert(/** @type {never} */ (container));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DomContractError);
    expect(thrown.code).toBe('EGL_DOM_CONTRACT');
  });

  it('inlineAlert validates its arguments before reaching for the document', () => {
    expect(() => inlineAlert(/** @type {never} */ ('#host'))).toThrow(TypeError);
  });
});
