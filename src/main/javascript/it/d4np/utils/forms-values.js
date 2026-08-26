/**
 * egl-utils-js/forms — form value binding and serialization
 * (spec 08 §2 items F112-F115).
 *
 * **The half that was missing.** `setValue` (F45) has written a native control
 * correctly since spec 03 — checkbox, radio, single and multiple select — and
 * nothing read one. So the write path was a one-liner and the read path was a
 * hand-rolled loop over `form.elements` in every application, with the same four
 * coercion bugs each time. `getValue` (F113) fixes the single-element half on
 * `egl-utils-js/dom`, beside its twin; this module fixes the part that needs more
 * than one element: **a field is not a control.**
 *
 * A field can be several controls — a radio group, a set of checkboxes, a
 * repeated name — and the shape of its value follows from HTML's own meaning for
 * those shapes rather than from a configuration option:
 *
 * | Field | Value |
 * |---|---|
 * | one checkbox | `boolean` |
 * | several checkboxes sharing a name | `string[]` of the checked values |
 * | a radio group (any size) | the checked value, or `null` |
 * | one `select[multiple]` | `string[]` |
 * | one of anything else | whatever {@link getValue} says |
 * | a repeated name on other controls | an array, one entry per control |
 *
 * The one-checkbox rule is the only place two readings were possible, and it is
 * settled the way HTML settles it: one box is a yes/no, several sharing a name
 * are a set. A group that grows from one member to two therefore changes the
 * shape of its value — stated here because it is a real consequence, and because
 * the alternative (a `kind` option per field) is a configuration layer for a
 * question the markup already answers.
 *
 * **Every method is total and every failure is loud.** A key in `setValues` that
 * names no field is a `TypeError` naming the key — ADR-0047's rule, extended from
 * options bags to a data map, because `setValues({ emial })` silently doing
 * nothing is exactly the defect that ADR removed. A declared field whose selector
 * matched nothing is reported in `missing` at construction, the way F43's
 * `bindElements` reports one, rather than surfacing later as an `undefined` value.
 *
 * **Values only.** Validation (F116-F119), submission (F122-F123) and dirty
 * tracking (F124-F125) are separate factories that *take* a form instance, the
 * way `bindTableControls` takes a pipeline and `createResource` takes a client
 * (ADR-0025, ADR-0077). A filter form that needs values and neither validation
 * nor submission imports this and pays for nothing else (NFR-02).
 *
 * @module egl-utils-js/forms
 */

import { DomContractError } from './errors.js';
import { getValue, setValue } from './dom-events.js';
import { isAbortSignal, isElement } from './dom-helpers.js';
import { assertAlive } from './lifecycle.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * Control types that carry an action rather than a value: submitting, resetting,
 * or a plain button. The platform submits only the one that was activated, so
 * reporting them as fields would put a button's label in your record.
 */
const ACTION_TYPES = /* @__PURE__ */ new Set(['submit', 'reset', 'button', 'image']);

/** What discovery looks at, before the action-type filter. */
const CONTROL_SELECTOR = 'input, select, textarea';

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`createForm: ${name} must be a plain object`);
  }
}

/**
 * The control's `type`, lower-cased. Read from the property rather than the
 * attribute, so a missing `type` reads as the platform's default (`'text'`)
 * rather than as `null`, and a `<select>`/`<textarea>` reports itself.
 *
 * @param {Element} control
 * @returns {string}
 */
function typeOf(control) {
  return String(/** @type {any} */ (control).type ?? '').toLowerCase();
}

/**
 * @param {Element} control
 * @returns {string}
 */
function valueOf(control) {
  return String(/** @type {any} */ (control).value ?? '');
}

/**
 * @param {Element} control
 * @returns {boolean}
 */
function isChecked(control) {
  return /** @type {any} */ (control).checked === true;
}

/**
 * True when every control in the field has this type.
 *
 * @param {readonly Element[]} controls
 * @param {string} type
 * @returns {boolean}
 */
function allOfType(controls, type) {
  return controls.length > 0 && controls.every((control) => typeOf(control) === type);
}

/**
 * @param {readonly Element[]} controls
 * @returns {boolean}
 */
function isFileField(controls) {
  return allOfType(controls, 'file');
}

/**
 * The value of one field, from its controls (the table in the module comment).
 *
 * @param {readonly Element[]} controls
 * @returns {unknown}
 */
function readField(controls) {
  if (controls.length === 0) return null;

  if (allOfType(controls, 'radio')) {
    // A radio group answers *which* value is chosen — including when the group
    // happens to have one member, because a group of one is still a group and
    // reading it as a boolean would change the field's shape the moment a second
    // radio appeared in the markup.
    const checked = controls.find(isChecked);
    return checked === undefined ? null : valueOf(checked);
  }

  if (controls.length > 1 && allOfType(controls, 'checkbox')) {
    return controls.filter(isChecked).map(valueOf);
  }

  if (controls.length === 1) return getValue(controls[0]);

  return controls.map((control) => getValue(control));
}

/**
 * Write one field's value into its controls.
 *
 * @param {string} name - Field name, for error messages.
 * @param {readonly Element[]} controls
 * @param {unknown} value
 * @returns {void}
 */
function writeField(name, controls, value) {
  if (controls.length === 0) return;

  if (isFileField(controls)) {
    // Not a limitation of this library: assigning to `input[type=file].value` is
    // forbidden by every engine, because a page that could choose a file for you
    // could upload one you never picked.
    throw new TypeError(
      `createForm: setValues cannot write '${name}' — a file input is read-only in every browser`,
    );
  }

  if (allOfType(controls, 'radio')) {
    const wanted = value === null || value === undefined ? null : String(value);
    for (const control of controls) {
      /** @type {any} */ (control).checked = wanted !== null && valueOf(control) === wanted;
    }
    return;
  }

  if (controls.length > 1 && allOfType(controls, 'checkbox')) {
    if (value !== null && value !== undefined && !Array.isArray(value)) {
      throw new TypeError(
        `createForm: setValues expects an array for '${name}' — ${controls.length} checkboxes share that name`,
      );
    }
    const wanted = new Set(/** @type {unknown[]} */ (value ?? []).map((entry) => String(entry)));
    for (const control of controls) {
      /** @type {any} */ (control).checked = wanted.has(valueOf(control));
    }
    return;
  }

  if (controls.length === 1) {
    setValue(controls[0], value);
    return;
  }

  if (!Array.isArray(value)) {
    throw new TypeError(
      `createForm: setValues expects an array for '${name}' — ${controls.length} controls share that name`,
    );
  }
  // Total by construction: a shorter array clears the controls it does not reach,
  // so the field ends up describing the value it was given rather than a mixture
  // of that and whatever was there before.
  controls.forEach((control, index) => setValue(control, value[index] ?? null));
}

/**
 * Resolve the field set from an explicit `{name: selector}` map.
 *
 * @param {Element} root
 * @param {Record<string, string>} fields
 * @returns {{ entries: Array<[string, Element[]]>, missing: string[] }}
 */
function resolveDeclared(root, fields) {
  /** @type {Array<[string, Element[]]>} */
  const entries = [];
  /** @type {string[]} */
  const missing = [];
  for (const [name, selector] of Object.entries(fields)) {
    if (typeof selector !== 'string' || selector === '') {
      throw new TypeError(`createForm: options.fields.${name} must be a selector string`);
    }
    // `querySelectorAll`, not `querySelector`: a radio group is one field and
    // several elements, and a map that could name only one of them would make the
    // commonest grouped control unreachable.
    const found = Array.from(root.querySelectorAll(selector));
    entries.push([name, found]);
    if (found.length === 0) missing.push(name);
  }
  return { entries, missing };
}

/**
 * Resolve the field set by discovery: every named, value-carrying control under
 * the root, grouped by `name`, in document order.
 *
 * @param {Element} root
 * @returns {Array<[string, Element[]]>}
 */
function resolveDiscovered(root) {
  // A `Map` rather than an object, all the way to `Object.fromEntries`: a field
  // literally named `__proto__` assigned with `obj[name] =` would set the
  // prototype instead of a property, which is the trap BUG-0004 was.
  /** @type {Map<string, Element[]>} */
  const groups = new Map();
  for (const control of root.querySelectorAll(CONTROL_SELECTOR)) {
    const name = control.getAttribute('name');
    if (name === null || name === '') continue;
    if (ACTION_TYPES.has(typeOf(control))) continue;
    const group = groups.get(name);
    if (group === undefined) groups.set(name, [control]);
    else group.push(control);
  }
  return [...groups];
}

/**
 * @typedef {object} CreateFormOptions
 * @property {Record<string, string>} [fields] - Field names to CSS selectors,
 *   resolved within `root` with `querySelectorAll` so one name can be a group.
 *   Omitted, the fields are **discovered**: every named `input`/`select`/
 *   `textarea` under the root, grouped by `name`, minus the action types
 *   (`submit`, `reset`, `button`, `image`).
 * @property {boolean} [strict=false] - Throw {@link DomContractError} when a
 *   declared field matched nothing, instead of reporting it in `missing`.
 * @property {AbortSignal} [signal] - Destroys the instance when aborted (NFR-15).
 */

/**
 * @typedef {object} FormInstance
 * @property {Element} element - The root this instance reads and writes.
 * @property {Readonly<Record<string, readonly Element[]>>} fields - The resolved
 *   field set: one entry per name, in declaration or document order. A data
 *   property, so it stays readable after `destroy()`.
 * @property {readonly string[]} missing - Declared names whose selector matched
 *   nothing, in map order. Always empty under discovery, which cannot miss what
 *   it never looked for.
 * @property {() => Record<string, unknown>} getValues - The current values.
 * @property {(values: Record<string, unknown>) => void} setValues - Write the
 *   named fields; a key naming no field is a `TypeError`.
 * @property {() => Record<string, unknown>} toJSON - The values a JSON body can
 *   carry: file fields omitted.
 * @property {() => FormData} toFormData - The values as `FormData`, with the
 *   platform's own conventions.
 * @property {() => Record<string, unknown>} baseline - The values `reset()` would
 *   restore.
 * @property {(values?: Record<string, unknown>) => void} setBaseline - Adopt a new
 *   baseline: the current values, or the ones given.
 * @property {() => void} reset - Restore the baseline into the controls.
 * @property {() => void} destroy - Idempotent teardown.
 */

/**
 * Bind a form's fields, so its values can be read, written and serialized
 * (spec 08 F112-F115).
 *
 * **`reset()` is not `HTMLFormElement.reset()`**, and that difference is half the
 * reason this exists. The platform's reset restores the *markup's* `value`
 * attributes — what the page shipped with, not what the user loaded. A record
 * fetched into a form and then edited resets, natively, to an empty form. Here
 * the baseline is the values at construction, `setBaseline()` adopts a new one
 * after a successful save, and `reset()` restores that.
 *
 * **No `change` events are dispatched.** `setValues` writes through F45, which
 * fires nothing, for the reason it states: a programmatic write is not a user
 * edit, and synthesising an event would re-enter the handler that asked for the
 * write. Validation after a `setValues` is therefore an explicit call — which is
 * what F118's incremental validation wants anyway.
 *
 * @example
 * const form = createForm(document.querySelector('#host-form'));
 * form.setValues(await api.get(`/hosts/${id}`)); // no change events fired
 * form.setBaseline(); // this is now "clean"
 * // …the user edits…
 * await api.put(`/hosts/${id}`, form.toJSON());
 * form.setBaseline(); // saved: the new values are the clean ones
 *
 * @example
 * // Declared fields, so a typo in the markup fails the boot rather than
 * // travelling as an undefined value:
 * const form = createForm(root, {
 *   fields: { name: '[name=name]', tier: '[name=tier]', tags: '[name=tags]' },
 *   strict: true,
 * });
 *
 * @example
 * // A multipart submit: FormData carries the files JSON cannot.
 * await fetch('/upload', { method: 'POST', body: form.toFormData() });
 *
 * @param {Element} root - The `<form>`, or any container holding the controls.
 * @param {CreateFormOptions} [options]
 * @returns {FormInstance}
 * @throws {TypeError} On a malformed option, a non-element root, or a `fields`
 *   entry that is not a selector string.
 * @throws {DomContractError} With `strict: true`, when a declared field matched
 *   nothing. The error's `missing` property lists them.
 */
export function createForm(root, options = {}) {
  const api = 'createForm';
  if (!isElement(root)) {
    throw new TypeError(`${api}: root must be an Element`);
  }
  assertPlainObject(options, 'options');
  const { fields, strict = false, signal, ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  if (fields !== undefined) assertPlainObject(fields, 'options.fields');
  if (typeof strict !== 'boolean') {
    throw new TypeError(`${api}: options.strict must be a boolean`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const declared = fields !== undefined;
  const resolution = declared
    ? resolveDeclared(root, fields)
    : { entries: resolveDiscovered(root), missing: /** @type {string[]} */ ([]) };

  if (strict && resolution.missing.length > 0) {
    const { missing } = resolution;
    throw new DomContractError(
      `${api}: ${missing.length} of ${resolution.entries.length} fields matched nothing — ` +
        missing.map((name) => `${name} (${fields?.[name]})`).join(', '),
      { missing },
    );
  }

  /** @type {Readonly<Record<string, readonly Element[]>>} */
  const fieldSet = Object.freeze(
    Object.fromEntries(
      resolution.entries.map(([name, controls]) => [name, Object.freeze(controls)]),
    ),
  );
  const names = resolution.entries.map(([name]) => name);
  const has = (/** @type {string} */ name) => names.includes(name);

  /** @returns {Record<string, unknown>} */
  function getValues() {
    return Object.fromEntries(names.map((name) => [name, readField(fieldSet[name])]));
  }

  let destroyed = false;
  /** @type {Record<string, unknown>} */
  let baselineValues = getValues();

  /** @returns {void} */
  function onAbort() {
    destroyed = true;
  }

  if (signal !== undefined) {
    if (signal.aborted) destroyed = true;
    else signal.addEventListener('abort', onAbort);
  }

  return {
    element: root,
    fields: fieldSet,
    missing: Object.freeze(resolution.missing),

    getValues,

    setValues(values) {
      assertAlive(destroyed, api, 'setValues');
      assertPlainObject(values, 'values');
      for (const [name, value] of Object.entries(values)) {
        if (!has(name)) {
          throw new TypeError(`${api}: setValues names no such field '${name}'`);
        }
        writeField(name, fieldSet[name], value);
      }
    },

    toJSON() {
      // A `File` has no JSON representation, and emitting its name would describe
      // content the body cannot carry — a lie that reads as data. `toFormData()`
      // is the serialization that can hold them.
      return Object.fromEntries(
        names
          .filter((name) => !isFileField(fieldSet[name]))
          .map((name) => [name, readField(fieldSet[name])]),
      );
    },

    toFormData() {
      const data = new FormData();
      // Deliberately NOT built from `getValues()`: this serialization carries
      // what the controls *hold*, in the shape the browser would have submitted
      // them, while `getValues`/`toJSON` carry what the values *mean*. The
      // difference is visible on exactly the fields where meaning is added — an
      // empty `type="number"` is `null` to `getValues` and the empty string here,
      // because "present and empty" is a thing a server can tell from "absent"
      // and this is the serialization that can say it.
      //
      // What this does not copy is the platform's submission *filters* — a
      // disabled control is still part of the field set the caller declared, and
      // dropping it silently would be the ADR-0047 defect wearing a standard's
      // clothes.
      for (const name of names) {
        for (const control of fieldSet[name]) {
          const type = typeOf(control);

          if (type === 'checkbox' || type === 'radio') {
            if (isChecked(control)) data.append(name, valueOf(control));
            continue;
          }

          if (type === 'file') {
            for (const file of /** @type {any} */ (control).files) data.append(name, file);
            continue;
          }

          const element = /** @type {any} */ (control);
          if (typeof element.selectedIndex === 'number' && element.options !== undefined) {
            if (element.multiple === true) {
              for (const option of element.options) {
                if (option.selected === true) data.append(name, String(option.value));
              }
            } else if (element.selectedIndex >= 0) {
              data.append(name, valueOf(control));
            }
            continue;
          }

          data.append(name, valueOf(control));
        }
      }
      return data;
    },

    baseline() {
      return { ...baselineValues };
    },

    setBaseline(values) {
      assertAlive(destroyed, api, 'setBaseline');
      if (values === undefined) {
        baselineValues = getValues();
        return;
      }
      assertPlainObject(values, 'values');
      for (const name of Object.keys(values)) {
        if (!has(name)) {
          throw new TypeError(`${api}: setBaseline names no such field '${name}'`);
        }
      }
      baselineValues = { ...values };
    },

    reset() {
      assertAlive(destroyed, api, 'reset');
      for (const name of names) {
        // A file field cannot be written, so it cannot be reset either. Skipping
        // it is the only honest option: throwing would make `reset()` unusable on
        // any form with an upload in it.
        if (isFileField(fieldSet[name])) continue;
        if (Object.hasOwn(baselineValues, name)) {
          writeField(name, fieldSet[name], baselineValues[name]);
        }
      }
    },

    destroy() {
      if (destroyed) {
        // Still detach: an instance destroyed by its own signal has already set
        // the flag, and leaving the listener attached would outlive the caller's
        // `destroy()`.
        if (signal !== undefined) signal.removeEventListener('abort', onAbort);
        return;
      }
      destroyed = true;
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    },
  };
}
