// @vitest-environment jsdom
// Example tests (roadmap 21.1, spec 08 §2 items F112-F115 and §6, ADR-0077) for
// form value binding and serialization.
//
// The four coercions spec 08 §1 names as the recurring bugs get their own
// assertions, because "an unchecked checkbox is false" is the whole contract and
// not a detail: every one of them is a case where a hand-rolled read reports
// something plausible and wrong.
import { beforeEach, describe, expect, it } from 'vitest';
import { createForm } from '../../../../../main/javascript/it/d4np/utils/forms.js';
import { getValue } from '../../../../../main/javascript/it/d4np/utils/dom.js';

/** @type {HTMLElement} */
let root;

/**
 * @param {string} html
 * @returns {HTMLElement}
 */
function mount(html) {
  document.body.innerHTML = `<form id="root">${html}</form>`;
  return /** @type {HTMLElement} */ (document.getElementById('root'));
}

beforeEach(() => {
  root = mount(`
    <input name="name" value="Ada" />
    <input name="quantity" type="number" value="7" />
    <input name="empty" type="number" value="" />
    <input name="subscribed" type="checkbox" checked />
    <input name="unsubscribed" type="checkbox" />
    <input name="tier" type="radio" value="free" />
    <input name="tier" type="radio" value="pro" checked />
    <input name="tags" type="checkbox" value="a" checked />
    <input name="tags" type="checkbox" value="b" />
    <input name="tags" type="checkbox" value="c" checked />
    <select name="country"><option value="it" selected>Italy</option><option value="fr">France</option></select>
    <select name="langs" multiple>
      <option value="en" selected>en</option><option value="de">de</option><option value="es" selected>es</option>
    </select>
    <select name="nothing"><option value="x">x</option></select>
    <textarea name="notes">hello</textarea>
    <button name="ignored" type="submit">Save</button>
    <input name="alsoIgnored" type="reset" value="Reset" />
  `);
  /** @type {any} */ (document.querySelector('[name=nothing]')).selectedIndex = -1;
});

describe('F113 — the coercions are the contract', () => {
  it('reads every field shape the way HTML means it', () => {
    expect(createForm(root).getValues()).toEqual({
      name: 'Ada',
      quantity: 7,
      empty: null,
      subscribed: true,
      unsubscribed: false,
      tier: 'pro',
      tags: ['a', 'c'],
      country: 'it',
      langs: ['en', 'es'],
      nothing: null,
      notes: 'hello',
    });
  });

  it('never reports NaN for a number a user left alone', () => {
    const { empty, quantity } = createForm(root).getValues();
    expect(empty).toBeNull();
    expect(Number.isNaN(empty)).toBe(false);
    expect(quantity).toBe(7);
  });

  it('distinguishes an unselected select from an option whose value is empty', () => {
    const host = mount('<select name="pick"><option value="">(none)</option></select>');
    expect(createForm(host).getValues().pick).toBe('');

    const empty = mount('<select name="pick"><option value="x">x</option></select>');
    /** @type {any} */ (empty.querySelector('select')).selectedIndex = -1;
    expect(createForm(empty).getValues().pick).toBeNull();
  });

  it('treats a radio group of one as a group, not a boolean', () => {
    const host = mount('<input name="only" type="radio" value="solo" checked />');
    expect(createForm(host).getValues().only).toBe('solo');
  });

  it('reads a file field as an array, and never lets it be written', () => {
    const host = mount('<input name="doc" type="file" />');
    const form = createForm(host);
    expect(form.getValues().doc).toEqual([]);
    expect(() => form.setValues({ doc: 'x' })).toThrow(/file input is read-only/);
  });

  it('getValue is the single-element half, exported beside setValue', () => {
    expect(getValue(root.querySelector('[name=subscribed]'))).toBe(true);
    expect(getValue(root.querySelector('[name=empty]'))).toBeNull();
    expect(getValue(root.querySelector('[name=langs]'))).toEqual(['en', 'es']);
    expect(getValue(null)).toBeNull();
    expect(() => getValue(/** @type {any} */ ('nope'))).toThrow(/must be an Element/);
  });
});

describe('F112 — the field set', () => {
  it('discovers named controls and skips the action types', () => {
    const form = createForm(root);
    expect(Object.keys(form.fields)).not.toContain('ignored');
    expect(Object.keys(form.fields)).not.toContain('alsoIgnored');
    expect(form.fields.tags).toHaveLength(3);
    expect(form.missing).toEqual([]);
  });

  it('reports a declared field that matched nothing, and can refuse to start', () => {
    const form = createForm(root, { fields: { name: '[name=name]', ghost: '[name=ghost]' } });
    expect(form.missing).toEqual(['ghost']);
    expect(form.getValues()).toEqual({ name: 'Ada', ghost: null });

    expect(() => createForm(root, { fields: { ghost: '[name=ghost]' }, strict: true })).toThrow(
      /matched nothing/,
    );
    try {
      createForm(root, { fields: { ghost: '[name=ghost]' }, strict: true });
    } catch (error) {
      expect(/** @type {any} */ (error).code).toBe('EGL_DOM_CONTRACT');
      expect(/** @type {any} */ (error).missing).toEqual(['ghost']);
    }
  });

  it('resolves a declared field to every match, so a group stays reachable', () => {
    const form = createForm(root, { fields: { tier: '[name=tier]' } });
    expect(form.fields.tier).toHaveLength(2);
    expect(form.getValues()).toEqual({ tier: 'pro' });
  });

  it('keeps a field literally named __proto__ as data', () => {
    const host = mount('<input name="__proto__" value="danger" />');
    const values = createForm(host).getValues();
    expect(Object.hasOwn(values, '__proto__')).toBe(true);
    expect(values.__proto__).toBe('danger');
    expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
  });

  it('rejects a malformed construction', () => {
    expect(() => createForm(/** @type {any} */ ('#root'))).toThrow(/root must be an Element/);
    expect(() => createForm(root, /** @type {any} */ ('nope'))).toThrow(
      /options must be a plain object/,
    );
    expect(() => createForm(root, /** @type {any} */ ([]))).toThrow(
      /options must be a plain object/,
    );
    expect(() => createForm(root, { fields: /** @type {any} */ ('nope') })).toThrow(
      /options\.fields must be a plain object/,
    );
    expect(() => createForm(root, /** @type {any} */ ({ feilds: {} }))).toThrow(
      /unknown option 'feilds'/,
    );
    expect(() => createForm(root, { fields: /** @type {any} */ ({ a: 7 }) })).toThrow(
      /must be a selector string/,
    );
    expect(() => createForm(root, /** @type {any} */ ({ strict: 'yes' }))).toThrow(
      /strict must be a boolean/,
    );
    expect(() => createForm(root, /** @type {any} */ ({ signal: {} }))).toThrow(
      /must be an AbortSignal/,
    );
  });
});

describe('F113 — writing', () => {
  it('writes every shape back', () => {
    const form = createForm(root);
    form.setValues({
      name: 'Grace',
      quantity: 3,
      subscribed: false,
      tier: 'free',
      tags: ['b'],
      country: 'fr',
      langs: ['de'],
      notes: 'bye',
    });
    expect(form.getValues()).toMatchObject({
      name: 'Grace',
      quantity: 3,
      subscribed: false,
      tier: 'free',
      tags: ['b'],
      country: 'fr',
      langs: ['de'],
      notes: 'bye',
    });
  });

  it('clears a radio group and a checkbox set with null', () => {
    const form = createForm(root);
    form.setValues({ tier: null, tags: null });
    expect(form.getValues().tier).toBeNull();
    expect(form.getValues().tags).toEqual([]);
  });

  it('refuses a values bag that is not an object', () => {
    const form = createForm(root);
    expect(() => form.setValues(/** @type {any} */ ('nope'))).toThrow(
      /values must be a plain object/,
    );
    expect(() => form.setBaseline(/** @type {any} */ (['a']))).toThrow(
      /values must be a plain object/,
    );
  });

  it('refuses a key that names no field, rather than doing nothing', () => {
    const form = createForm(root);
    expect(() => form.setValues({ emial: 'x' })).toThrow(/names no such field 'emial'/);
    expect(() => form.setBaseline({ emial: 'x' })).toThrow(/names no such field 'emial'/);
  });

  it('demands an array where several controls share a name', () => {
    const form = createForm(root);
    expect(() => form.setValues({ tags: 'a' })).toThrow(/expects an array for 'tags'/);
  });

  it('is total on a repeated name: a short array clears the rest', () => {
    const host = mount('<input name="line" value="1" /><input name="line" value="2" />');
    const form = createForm(host);
    expect(form.getValues().line).toEqual(['1', '2']);
    form.setValues({ line: ['x'] });
    expect(form.getValues().line).toEqual(['x', '']);
    expect(() => form.setValues({ line: 'x' })).toThrow(/expects an array for 'line'/);
  });

  it('dispatches no change event — a programmatic write is not a user edit', () => {
    const form = createForm(root);
    /** @type {string[]} */
    const seen = [];
    for (const type of ['input', 'change']) {
      root.addEventListener(type, () => seen.push(type));
    }
    form.setValues({ name: 'Grace', subscribed: false, tier: 'free' });
    expect(seen).toEqual([]);
  });
});

describe('F114 — two serializations that agree on names', () => {
  it('omits file fields from JSON, because a File is not JSON', () => {
    const host = mount('<input name="title" value="t" /><input name="doc" type="file" />');
    const form = createForm(host);
    expect(form.toJSON()).toEqual({ title: 't' });
    expect(Object.hasOwn(form.getValues(), 'doc')).toBe(true);
  });

  it('appends each chosen File, which is the reason toFormData exists', () => {
    const host = mount('<input name="doc" type="file" />');
    const control = /** @type {any} */ (host.querySelector('input'));
    const file = new File(['hi'], 'note.txt', { type: 'text/plain' });
    Object.defineProperty(control, 'files', { value: [file], configurable: true });

    const data = createForm(host).toFormData();
    expect(data.getAll('doc')).toHaveLength(1);
    expect(/** @type {any} */ (data.get('doc')).name).toBe('note.txt');
  });

  it('is what JSON.stringify uses', () => {
    const host = mount('<input name="title" value="t" />');
    expect(JSON.stringify(createForm(host))).toBe('{"title":"t"}');
  });

  it('builds FormData with the platform’s own conventions', () => {
    const data = createForm(root).toFormData();
    expect(data.getAll('tags')).toEqual(['a', 'c']);
    expect(data.getAll('langs')).toEqual(['en', 'es']);
    expect(data.get('tier')).toBe('pro');
    expect(data.get('name')).toBe('Ada');
    // An unchecked box contributes nothing; an empty number contributes the empty
    // string it holds; an unselected select contributes nothing.
    expect(data.has('unsubscribed')).toBe(false);
    expect(data.get('empty')).toBe('');
    expect(data.has('nothing')).toBe(false);
    expect(data.get('subscribed')).toBe('on');
  });
});

describe('F115 — the baseline is what was loaded, not what the markup shipped', () => {
  it('resets to the loaded values, where the platform resets to the attributes', () => {
    const host = mount('<input name="name" value="from-markup" />');
    const control = /** @type {any} */ (host.querySelector('input'));
    const form = createForm(host);

    // A record arrives and becomes the clean state.
    form.setValues({ name: 'from-server' });
    form.setBaseline();
    control.value = 'edited-by-user';

    form.reset();
    expect(form.getValues().name).toBe('from-server');

    // The platform's reset, on the same control, goes somewhere else entirely —
    // which is the whole reason F115 exists.
    control.value = 'edited-again';
    /** @type {any} */ (host).reset();
    expect(control.value).toBe('from-markup');
  });

  it('snapshots at construction and can adopt an explicit baseline', () => {
    const form = createForm(root);
    expect(form.baseline().name).toBe('Ada');
    form.setBaseline({ name: 'Grace' });
    expect(form.baseline()).toEqual({ name: 'Grace' });
    form.setValues({ name: 'someone else' });
    form.reset();
    expect(form.getValues().name).toBe('Grace');
  });

  it('hands out a copy, so a caller cannot edit the baseline in place', () => {
    const form = createForm(root);
    form.baseline().name = 'tampered';
    expect(form.baseline().name).toBe('Ada');
  });

  it('skips a file field rather than making reset unusable', () => {
    const host = mount('<input name="title" value="t" /><input name="doc" type="file" />');
    const form = createForm(host);
    /** @type {any} */ (host.querySelector('[name=title]')).value = 'edited';
    expect(() => form.reset()).not.toThrow();
    expect(form.getValues().title).toBe('t');
  });
});

describe('ADR-0049 — the lifecycle', () => {
  it('commands throw after destroy and queries answer', () => {
    const form = createForm(root);
    form.destroy();

    expect(() => form.setValues({ name: 'x' })).toThrow(
      /createForm: setValues\(\) was called after destroy\(\)/,
    );
    expect(() => form.setBaseline()).toThrow(/setBaseline\(\) was called after destroy\(\)/);
    expect(() => form.reset()).toThrow(/reset\(\) was called after destroy\(\)/);

    expect(form.getValues().name).toBe('Ada');
    expect(form.baseline().name).toBe('Ada');
    expect(form.toJSON().name).toBe('Ada');
    expect(form.toFormData().get('name')).toBe('Ada');
    expect(form.element).toBe(root);
    expect(form.fields.name).toHaveLength(1);
  });

  it('destroy is idempotent', () => {
    const form = createForm(root);
    form.destroy();
    expect(() => form.destroy()).not.toThrow();
  });

  it('an aborted signal destroys the instance, and destroy detaches the listener', () => {
    const controller = new AbortController();
    const form = createForm(root, { signal: controller.signal });
    controller.abort();
    expect(() => form.setValues({ name: 'x' })).toThrow(/after destroy\(\)/);
    expect(() => form.destroy()).not.toThrow();

    const aborted = AbortSignal.abort();
    expect(() => createForm(root, { signal: aborted }).reset()).toThrow(/after destroy\(\)/);
  });
});

describe('NFR-41 — no module-level state', () => {
  it('two forms on one page share nothing', () => {
    document.body.innerHTML = `
      <form id="a"><input name="q" value="one" /></form>
      <form id="b"><input name="q" value="two" /></form>
    `;
    const a = createForm(/** @type {Element} */ (document.getElementById('a')));
    const b = createForm(/** @type {Element} */ (document.getElementById('b')));

    a.setValues({ q: 'edited' });
    expect(b.getValues().q).toBe('two');
    expect(a.baseline().q).toBe('one');
    expect(b.baseline().q).toBe('two');

    a.destroy();
    expect(() => b.setValues({ q: 'still fine' })).not.toThrow();
    expect(b.getValues().q).toBe('still fine');
  });
});
