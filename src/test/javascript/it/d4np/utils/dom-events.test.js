// @vitest-environment jsdom
// Example tests (roadmap 11.2, spec 03 §2 items F44-F45, NFR-15, ADR-0029) for
// event delegation and the native setters.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  delegate,
  setEnabled,
  setValue,
  setVisible,
} from '../../../../../main/javascript/it/d4np/utils/dom.js';

/** @type {HTMLElement} */
let root;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="root">
      <table>
        <tbody id="tbody">
          <tr data-id="1"><td><span class="cell">one</span></td></tr>
          <tr data-id="2"><td><button data-action="delete">x</button></td></tr>
        </tbody>
      </table>
    </div>
    <div id="outside"><p class="target">outside the root</p></div>
  `;
  root = /** @type {HTMLElement} */ (document.getElementById('root'));
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('delegate — matching', () => {
  it('passes the matched element, not the deeper event target', () => {
    const seen = [];
    delegate(root, 'click', 'tr[data-id]', (event, matched) => {
      seen.push({ matchedTag: matched.tagName, targetTag: event.target.tagName });
    });
    // Click the span inside the cell: target is the span, match is the row.
    document.querySelector('.cell').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual([{ matchedTag: 'TR', targetTag: 'SPAN' }]);
  });

  it('matches an element that is itself the target', () => {
    const seen = [];
    delegate(root, 'click', '[data-action]', (_event, matched) =>
      seen.push(matched.dataset.action),
    );
    document
      .querySelector('[data-action="delete"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual(['delete']);
  });

  it('ignores events whose target matches nothing', () => {
    const handler = vi.fn();
    delegate(root, 'click', '.never-there', handler);
    document.querySelector('.cell').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a match that lies outside the root, even though closest found it', () => {
    // `closest` climbs to the document, so an ancestor selector would match
    // without the containment check.
    const handler = vi.fn();
    delegate(root, 'click', 'body', handler);
    document.querySelector('.cell').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores an event whose target is not an element', () => {
    const handler = vi.fn();
    delegate(document, 'click', '*', handler);
    // The document itself as target: not an element, so nothing to match.
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('serves nodes added after the listener was attached', () => {
    const handler = vi.fn();
    delegate(root, 'click', 'tr[data-id]', handler);
    // The whole point of delegation: a re-render needs no rebinding.
    document.getElementById('tbody').innerHTML = '<tr data-id="99"><td>new</td></tr>';
    document
      .querySelector('tr[data-id="99"] td')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports the capture phase, for events that do not bubble', () => {
    document.body.insertAdjacentHTML('beforeend', '<form id="f"><input id="i" /></form>');
    const form = document.getElementById('f');
    const handler = vi.fn();
    delegate(form, 'focus', 'input', handler, { capture: true });
    document.getElementById('i').dispatchEvent(new FocusEvent('focus'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('accepts a DocumentFragment as a root', () => {
    const template = document.createElement('template');
    template.innerHTML = '<button id="in-fragment">go</button>';
    const handler = vi.fn();
    delegate(template.content, 'click', 'button', handler);
    template.content
      .getElementById('in-fragment')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('delegate — teardown (NFR-15)', () => {
  it('attaches exactly one listener regardless of how many nodes match', () => {
    // Counting attachments is the claim delegation makes: one listener, not one
    // per row per render. (Signal-based removal is invisible to a
    // removeEventListener spy, so detachment is asserted behaviourally below.)
    const spy = vi.spyOn(root, 'addEventListener');
    delegate(root, 'click', 'tr[data-id]', () => {});
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stops calling the handler after unsubscribe', () => {
    const handler = vi.fn();
    const off = delegate(root, 'click', 'tr[data-id]', handler);
    document.querySelector('.cell').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    off();
    document.querySelector('.cell').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing twice is a no-op', () => {
    const handler = vi.fn();
    const off = delegate(root, 'click', 'tr[data-id]', handler);
    off();
    expect(() => off()).not.toThrow();
    document.querySelector('.cell').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('detaches when the caller signal aborts', () => {
    const controller = new AbortController();
    const handler = vi.fn();
    delegate(root, 'click', 'tr[data-id]', handler, { signal: controller.signal });
    controller.abort();
    document.querySelector('.cell').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('never attaches at all when the signal is already aborted', () => {
    const spy = vi.spyOn(root, 'addEventListener');
    const handler = vi.fn();
    const off = delegate(root, 'click', 'tr[data-id]', handler, {
      signal: AbortSignal.abort(),
    });
    expect(spy).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });

  it('leaves nothing on the caller signal after its own teardown', () => {
    // The abort bridge is registered with the internal signal, so unsubscribing
    // removes it too — a long-lived signal does not accumulate listeners from
    // short-lived bindings.
    const controller = new AbortController();
    const spy = vi.spyOn(controller.signal, 'addEventListener');
    const off = delegate(root, 'click', 'tr[data-id]', () => {}, { signal: controller.signal });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][2]).toMatchObject({ once: true });
    expect(spy.mock.calls[0][2].signal).toBeDefined();
    off();
    expect(() => controller.abort()).not.toThrow();
  });
});

describe('delegate — rejected input', () => {
  it.each([
    ['a string', 'body'],
    ['null', null],
    ['a plain object', {}],
    ['a number', 42],
  ])('throws TypeError when root is %s', (_label, badRoot) => {
    expect(() => delegate(/** @type {never} */ (badRoot), 'click', 'a', () => {})).toThrow(
      /root must be/,
    );
  });

  it.each([
    ['type', ['', 'a']],
    ['selector', ['click', '']],
  ])('throws TypeError when %s is empty', (name, [type, selector]) => {
    expect(() => delegate(root, type, selector, () => {})).toThrow(new RegExp(name));
  });

  it('throws TypeError when the handler is not a function', () => {
    expect(() => delegate(root, 'click', 'a', /** @type {never} */ (null))).toThrow(/handler/);
  });

  it('throws TypeError when the signal is not an AbortSignal', () => {
    expect(() =>
      delegate(root, 'click', 'a', () => {}, { signal: /** @type {never} */ ({}) }),
    ).toThrow(/signal/);
  });
});

describe('setEnabled', () => {
  it('enables and disables a form control through the property', () => {
    const button = document.querySelector('[data-action="delete"]');
    setEnabled(button, false);
    expect(button.disabled).toBe(true);
    setEnabled(button, true);
    expect(button.disabled).toBe(false);
  });

  it('falls back to the attribute for an element with no disabled property', () => {
    const div = document.createElement('div');
    setEnabled(div, false);
    expect(div.hasAttribute('disabled')).toBe(true);
    setEnabled(div, true);
    expect(div.hasAttribute('disabled')).toBe(false);
  });

  it.each([[null], [undefined]])('is a no-op on %s, so callers need no guard', (el) => {
    expect(() => setEnabled(el, false)).not.toThrow();
  });

  it('throws TypeError for a non-element', () => {
    expect(() => setEnabled(/** @type {never} */ ('#x'), true)).toThrow(/must be an Element/);
  });

  it('throws TypeError when enabled is not a boolean', () => {
    expect(() => setEnabled(document.body, /** @type {never} */ (1))).toThrow(/boolean/);
  });
});

describe('setVisible', () => {
  it('drives the hidden attribute by default', () => {
    setVisible(root, false);
    expect(root.hidden).toBe(true);
    setVisible(root, true);
    expect(root.hidden).toBe(false);
  });

  it('toggles the given class instead of the attribute', () => {
    setVisible(root, false, { hiddenClass: 'is-hidden' });
    expect(root.classList.contains('is-hidden')).toBe(true);
    // Instead of, never in addition: two mechanisms would fight over specificity.
    expect(root.hidden).toBe(false);
    setVisible(root, true, { hiddenClass: 'is-hidden' });
    expect(root.classList.contains('is-hidden')).toBe(false);
  });

  it('is symmetric: hide then show restores the starting state exactly', () => {
    const before = root.outerHTML;
    setVisible(root, false);
    setVisible(root, true);
    expect(root.outerHTML).toBe(before);
  });

  it('is a no-op on null', () => {
    expect(() => setVisible(null, true)).not.toThrow();
  });

  it.each([
    ['visible is not a boolean', () => setVisible(document.body, /** @type {never} */ ('yes'))],
    ['hiddenClass is empty', () => setVisible(document.body, true, { hiddenClass: '' })],
    ['the element is a string', () => setVisible(/** @type {never} */ ('#x'), true)],
  ])('throws TypeError when %s', (_label, call) => {
    expect(call).toThrow(TypeError);
  });
});

describe('setValue', () => {
  beforeEach(() => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<form>
         <input id="text" type="text" value="old" />
         <input id="check" type="checkbox" />
         <input id="radio" type="radio" />
         <textarea id="area">old</textarea>
         <select id="single"><option value="a">A</option><option value="b">B</option></select>
         <select id="multi" multiple>
           <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
         </select>
       </form>`,
    );
  });

  it('sets a text input and a textarea', () => {
    setValue(document.getElementById('text'), 'new');
    setValue(document.getElementById('area'), 'body');
    expect(document.getElementById('text').value).toBe('new');
    expect(document.getElementById('area').value).toBe('body');
  });

  it('stringifies a non-string value', () => {
    setValue(document.getElementById('text'), 42);
    expect(document.getElementById('text').value).toBe('42');
  });

  it.each([[null], [undefined]])('clears rather than writing the literal %s', (value) => {
    setValue(document.getElementById('text'), value);
    expect(document.getElementById('text').value).toBe('');
  });

  it.each([
    ['checkbox', 'check'],
    ['radio', 'radio'],
  ])('sets checked on a %s', (_label, id) => {
    setValue(document.getElementById(id), true);
    expect(document.getElementById(id).checked).toBe(true);
    setValue(document.getElementById(id), false);
    expect(document.getElementById(id).checked).toBe(false);
  });

  it('coerces a truthy value for a checkbox', () => {
    setValue(document.getElementById('check'), 'yes');
    expect(document.getElementById('check').checked).toBe(true);
  });

  it('selects the matching option of a select', () => {
    const select = document.getElementById('single');
    setValue(select, 'b');
    expect(select.value).toBe('b');
    expect(select.selectedIndex).toBe(1);
  });

  it('clears the selection when no option matches, leaving no phantom value', () => {
    const select = document.getElementById('single');
    setValue(select, 'nope');
    expect(select.selectedIndex).toBe(-1);
    expect(select.value).toBe('');
  });

  it('clears a select on a nullish value', () => {
    const select = document.getElementById('single');
    setValue(select, null);
    expect(select.selectedIndex).toBe(-1);
  });

  it('selects every match of a multiple select', () => {
    const select = document.getElementById('multi');
    setValue(select, ['x', 'z']);
    expect([...select.selectedOptions].map((option) => option.value)).toEqual(['x', 'z']);
  });

  it('deselects options absent from the array', () => {
    const select = document.getElementById('multi');
    setValue(select, ['x', 'y', 'z']);
    setValue(select, ['y']);
    expect([...select.selectedOptions].map((option) => option.value)).toEqual(['y']);
  });

  it('dispatches no event, matching a plain assignment', () => {
    // Synthesising one would re-enter the handler that called the setter.
    const input = document.getElementById('text');
    const onInput = vi.fn();
    const onChange = vi.fn();
    input.addEventListener('input', onInput);
    input.addEventListener('change', onChange);
    setValue(input, 'quiet');
    expect(onInput).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is a no-op on null', () => {
    expect(() => setValue(null, 'x')).not.toThrow();
  });

  it('throws TypeError for a non-element', () => {
    expect(() => setValue(/** @type {never} */ (42), 'x')).toThrow(/must be an Element/);
  });
});
