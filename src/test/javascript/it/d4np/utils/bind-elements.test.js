// @vitest-environment jsdom
// Example tests (roadmap 11.1, spec 03 §2 item F43, ADR-0028) for bindElements
// and the /dom entry's DOM-presence contract. jsdom, because these assert DOM
// behaviour; the no-DOM half is proved in dom-node-safety.test.js under plain
// Node, which is the pairing NFR-14 asks for.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bindElements,
  isElement,
  requireDocument,
} from '../../../../../main/javascript/it/d4np/utils/dom.js';
import { DomContractError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

beforeEach(() => {
  document.body.innerHTML = `
    <form id="checkout-form">
      <input id="checkout-name" value="Ada" />
      <button id="checkout-submit" type="submit">Send</button>
      <span data-total="42">42</span>
    </form>
    <div class="panel">
      <span class="panel-title">Scoped</span>
    </div>
  `;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('bindElements — resolving a markup contract', () => {
  it('resolves every selector and reports nothing missing', () => {
    const { elements, missing } = bindElements({
      form: '#checkout-form',
      submit: '#checkout-submit',
      total: '[data-total]',
    });
    expect(missing).toEqual([]);
    expect(elements.form?.id).toBe('checkout-form');
    expect(elements.submit?.id).toBe('checkout-submit');
    expect(elements.total?.getAttribute('data-total')).toBe('42');
  });

  it('reports the names whose selector matched nothing, in map order', () => {
    const { elements, missing } = bindElements({
      form: '#checkout-form',
      ghost: '#not-here',
      submit: '#checkout-submit',
      phantom: '.absent',
    });
    // The whole point: one report instead of a null that travels.
    expect(missing).toEqual(['ghost', 'phantom']);
    expect(elements.ghost).toBeNull();
    expect(elements.phantom).toBeNull();
    expect(elements.form).not.toBeNull();
  });

  it('returns an entry for every name, present or not', () => {
    const { elements } = bindElements({ a: '#checkout-form', b: '#nope' });
    expect(Object.keys(elements)).toEqual(['a', 'b']);
  });

  it('accepts an empty map', () => {
    expect(bindElements({})).toEqual({ elements: {}, missing: [] });
  });

  it('scopes lookups to a root element', () => {
    const panel = document.querySelector('.panel');
    const { elements, missing } = bindElements(
      { title: '.panel-title', outside: '#checkout-submit' },
      { root: /** @type {Element} */ (panel) },
    );
    expect(elements.title?.textContent).toBe('Scoped');
    // Outside the root, so missing even though it exists in the document.
    expect(missing).toEqual(['outside']);
  });

  it('accepts a DocumentFragment as a root', () => {
    const template = document.createElement('template');
    template.innerHTML = '<p id="inside">x</p>';
    const { elements, missing } = bindElements({ inside: '#inside' }, { root: template.content });
    expect(missing).toEqual([]);
    expect(elements.inside?.textContent).toBe('x');
  });

  it('returns a snapshot, not a live view — a re-render invalidates it', () => {
    const { elements } = bindElements({ submit: '#checkout-submit' });
    const before = elements.submit;
    document.body.innerHTML = '<button id="checkout-submit">Send</button>';
    expect(document.querySelector('#checkout-submit')).not.toBe(before);
    // Documented behaviour, and the reason delegation (F44) exists.
    expect(elements.submit).toBe(before);
  });
});

describe('bindElements — strict mode', () => {
  it('returns normally when everything is found', () => {
    expect(() => bindElements({ form: '#checkout-form' }, { strict: true })).not.toThrow();
  });

  it('throws DomContractError listing every missing name and selector', () => {
    let thrown;
    try {
      bindElements({ ghost: '#not-here', phantom: '.absent' }, { strict: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DomContractError);
    expect(thrown.code).toBe('EGL_DOM_CONTRACT');
    expect(thrown.missing).toEqual(['ghost', 'phantom']);
    expect(thrown.message).toContain('#not-here');
    expect(thrown.message).toContain('.absent');
    expect(thrown.message).toContain('2 of 2');
  });

  it('carries an empty missing array on errors from elsewhere', () => {
    expect(new DomContractError('no dom').missing).toEqual([]);
  });
});

describe('bindElements — rejected input', () => {
  it.each([
    ['null', null],
    ['an array', ['#a']],
    ['a string', '#a'],
    ['undefined', undefined],
  ])('throws TypeError when the map is %s', (_label, map) => {
    expect(() => bindElements(/** @type {never} */ (map))).toThrow(TypeError);
  });

  it('throws TypeError naming the key whose selector is not a string', () => {
    expect(() => bindElements(/** @type {never} */ ({ ok: '#checkout-form', bad: 42 }))).toThrow(
      /map\.bad/,
    );
  });

  it.each([
    ['a string', '.panel'],
    ['a number', 42],
    ['null', null],
    ['a plain object', {}],
  ])('throws TypeError when root is %s', (_label, root) => {
    expect(() =>
      bindElements({ a: '#checkout-form' }, { root: /** @type {never} */ (root) }),
    ).toThrow(/options\.root/);
  });

  it("propagates querySelector's own selector error, unwrapped", () => {
    // It names the offending selector better than we could. Note what it
    // actually is: a DOMException whose `.name` is 'SyntaxError' — NOT a
    // JavaScript SyntaxError. Asserting on `.name` rather than `instanceof` is
    // the same discipline ADR-0003 applies to this library's own errors.
    let thrown;
    try {
      bindElements({ bad: ':::' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown.name).toBe('SyntaxError');
    expect(thrown).not.toBeInstanceOf(SyntaxError);
    expect(thrown).toBeInstanceOf(DOMException);
  });
});

describe('isElement — structural, not cross-realm instanceof', () => {
  it('accepts a real element', () => {
    expect(isElement(document.createElement('div'))).toBe(true);
  });

  it.each([
    ['the document', () => document],
    ['a text node', () => document.createTextNode('x')],
    ['a fragment', () => document.createDocumentFragment()],
    ['null', () => null],
    ['undefined', () => undefined],
    ['a string', () => '<div>'],
    ['a plain object', () => ({})],
  ])('rejects %s', (_label, make) => {
    expect(isElement(make())).toBe(false);
  });

  it('accepts an element-shaped object from another realm', () => {
    // A node from an iframe or a second jsdom fails `instanceof Element` while
    // being perfectly usable — the trap ADR-0003 avoids for errors too.
    const foreign = { nodeType: 1, querySelector: () => null };
    expect(isElement(foreign)).toBe(true);
  });
});

describe('requireDocument — in a browser', () => {
  it('returns the live document', () => {
    expect(requireDocument('test')).toBe(document);
  });
});
