/**
 * egl-utils-js/forms — rendering findings into a form (spec 08 §2 items F120-F121).
 *
 * The third member of the ADR-0077 family, and the first one that touches the
 * DOM. `createValidator` deliberately produces **data** — findings a caller can
 * render, log, or send somewhere — and this is the piece that puts them on the
 * page, subscribing to the validator rather than being wired into it.
 *
 * **Design-system-neutral, exactly as `inlineAlert` is.** Every class name comes
 * from an injected map (ADR-0031), because a hardcoded `is-invalid` would make
 * adopting the engine mean adopting Bootstrap. With no map you still get correct
 * structure, correct text and correct ARIA — and no styling, which is the honest
 * default for a library that ships no CSS. `bsFormFeedback` is the same function
 * wearing Bootstrap's names (ADR-0038, ADR-0079).
 *
 * **Where the feedback node goes is not arbitrary.** It is inserted immediately
 * after the field's last control, because that is what Bootstrap's own CSS
 * requires — `.invalid-feedback` is shown by a *sibling* combinator — and because
 * it is where a screen reader following DOM order expects the explanation to be.
 * A caller who has their own node passes it and this creates nothing.
 *
 * **Text, never markup.** A finding's message reaches the DOM through
 * `textContent`. There is no `{html, sanitize}` opt-in here on purpose: 21.4 maps
 * a *server's* error body into these same findings (F123), so this is the path an
 * untrusted string travels, and the safest opt-in is the one that does not exist.
 *
 * @module egl-utils-js/forms
 */

import { liveRegion as createLiveRegion } from './dom-a11y.js';
import { isAbortSignal } from './dom-helpers.js';
import { assertAlive } from './lifecycle.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * The neutral map: structure and text, no styling. Every slot is a class token
 * (or the empty string for "no class"), so a design system supplies its
 * vocabulary without this file knowing any of it.
 *
 * @type {Readonly<Record<string, string>>}
 */
const NEUTRAL_CLASSES = /* @__PURE__ */ Object.freeze({
  validated: '',
  controlInvalid: '',
  controlValid: '',
  invalid: '',
  valid: '',
  note: '',
  error: '',
  warning: '',
  info: '',
});

/** Slots a caller may override; anything else in `classes` is a typo (ADR-0047). */
const CLASS_SLOTS = /* @__PURE__ */ new Set(Object.keys(NEUTRAL_CLASSES));

let idCounter = 0;

/**
 * A document-unique id for a feedback node.
 *
 * Minted here rather than reused from the F52 builder contract: importing
 * `bootstrap-elements.js` for one helper cost `/dom` four kilobytes the last time
 * someone tried it (the NFR-02 lesson recorded on that entry's budget row), and
 * this entry has no other reason to know the Bootstrap toolkit exists.
 *
 * @param {Document} doc
 * @returns {string}
 */
function uniqueId(doc) {
  let id;
  do {
    idCounter += 1;
    id = `egl-feedback-${idCounter}`;
  } while (doc.getElementById(id) !== null);
  return id;
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`bindFormFeedback: ${name} must be a plain object`);
  }
}

/**
 * Apply a class token, tolerating the empty string as "no class here".
 *
 * @param {Element} el
 * @param {string} token
 * @param {boolean} on
 * @returns {void}
 */
function toggleToken(el, token, on) {
  if (token === '') return;
  for (const part of token.split(/\s+/).filter(Boolean)) {
    // Only when it changes something: `classList.toggle(x, false)` on an element
    // that never had a class attribute still CREATES one, and a teardown that
    // leaves `class=""` behind has not left the markup as it found it.
    if (el.classList.contains(part) !== on) el.classList.toggle(part, on);
  }
  if (!on && el.classList.length === 0 && el.getAttribute('class') === '') {
    el.removeAttribute('class');
  }
}

/**
 * Add or remove one id in a space-separated attribute, leaving the caller's own
 * tokens alone — an `aria-describedby` that already names a hint must keep it.
 *
 * @param {Element} el
 * @param {string} attribute
 * @param {string} id
 * @param {boolean} present
 * @returns {void}
 */
function toggleAttributeToken(el, attribute, id, present) {
  const tokens = (el.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean);
  const without = tokens.filter((token) => token !== id);
  const next = present ? [...without, id] : without;
  if (next.length === 0) el.removeAttribute(attribute);
  else el.setAttribute(attribute, next.join(' '));
}

/**
 * @typedef {import('./forms-validate.js').Finding} Finding
 * @typedef {import('./forms-validate.js').ValidationResult} ValidationResult
 * @typedef {import('./forms-validate.js').ValidatorInstance} ValidatorInstance
 */

/**
 * @typedef {object} FormFeedbackOptions
 * @property {Partial<Record<'validated' | 'controlInvalid' | 'controlValid' | 'invalid' | 'valid' | 'note' | 'error' | 'warning' | 'info', string>>} [classes]
 *   Class tokens per slot, merged over the neutral (empty) map. This is also how
 *   a design system other than Bootstrap is supported: there is no other hook,
 *   and none is needed.
 * @property {Record<string, Element | string>} [feedback] - An existing node per
 *   field, by element or selector, for markup that already has one. Anything not
 *   named here gets a node created after the field's last control, and removed
 *   again on `destroy()`.
 * @property {Element | string} [formFeedback] - Where form-level findings go.
 *   Created at the end of the form when omitted.
 * @property {(result: ValidationResult) => string} [summary] - Your wording for
 *   what `report()` announces. The default counts the fields with errors.
 * @property {boolean} [announce=true] - Announce on `report()` through a live
 *   region (F110).
 * @property {import('./dom-a11y.js').LiveRegionInstance} [liveRegion] - Your own
 *   region, if the page already has one. One is created lazily otherwise, and
 *   only then is a node added to the document.
 * @property {AbortSignal} [signal] - Destroys the binding when aborted (NFR-15).
 */

/**
 * @typedef {object} FormFeedbackInstance
 * @property {ValidatorInstance} validator - The validator this renders.
 * @property {Element} element - The form root it writes into.
 * @property {() => Element | null} report - Move focus to the first field with an
 *   `error` and announce the summary; returns the control focused, or `null` when
 *   there is nothing to report.
 * @property {() => void} destroy - Idempotent teardown: unsubscribes, removes the
 *   classes and ARIA it added, and deletes the nodes it created.
 */

/**
 * Render a validator's findings into the form (spec 08 F120-F121).
 *
 * @example
 * const validator = createValidator(form, { rules, validateOn: ['blur'] });
 * const feedback = bindFormFeedback(validator, {
 *   classes: { controlInvalid: 'is-invalid', invalid: 'invalid-feedback' },
 * });
 *
 * // On a blocked submit: take the user to the problem and say what it is.
 * if (!(await validator.validate()).valid) feedback.report();
 *
 * @param {ValidatorInstance} validator - The validator to subscribe to.
 * @param {FormFeedbackOptions} [options]
 * @returns {FormFeedbackInstance}
 * @throws {TypeError} On a malformed option, an unknown class slot, or a
 *   `feedback` entry naming no field.
 */
export function bindFormFeedback(validator, options = {}) {
  const api = 'bindFormFeedback';
  if (
    validator === null ||
    typeof validator !== 'object' ||
    typeof (/** @type {any} */ (validator).validateField) !== 'function' ||
    typeof (/** @type {any} */ (validator).on) !== 'function'
  ) {
    throw new TypeError(`${api}: validator must be a createValidator instance`);
  }
  assertPlainObject(options, 'options');
  const {
    classes = {},
    feedback = {},
    formFeedback,
    summary,
    announce = true,
    liveRegion,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  assertPlainObject(classes, 'options.classes');
  assertPlainObject(feedback, 'options.feedback');
  for (const slot of Object.keys(classes)) {
    if (!CLASS_SLOTS.has(slot)) throw new TypeError(`${api}: unknown class slot '${slot}'`);
  }
  if (summary !== undefined && typeof summary !== 'function') {
    throw new TypeError(`${api}: options.summary must be a function`);
  }
  if (typeof announce !== 'boolean') {
    throw new TypeError(`${api}: options.announce must be a boolean`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const form = validator.form;
  const root = form.element;
  const doc = root.ownerDocument;
  const fieldSet = form.fields;
  // Cast rather than a per-slot default: `classes` is a Partial by design (a
  // caller overrides the slots they care about), and every key is present
  // because NEUTRAL_CLASSES supplies all nine.
  const slots = /** @type {Record<string, string>} */ ({ ...NEUTRAL_CLASSES, ...classes });

  /**
   * @param {Element | string | undefined} given
   * @param {string} what
   * @returns {Element | null}
   */
  function resolveNode(given, what) {
    if (given === undefined) return null;
    if (typeof given === 'string') {
      const found = root.querySelector(given);
      if (found === null) throw new TypeError(`${api}: ${what} matched no element ('${given}')`);
      return found;
    }
    if (typeof (/** @type {any} */ (given).setAttribute) !== 'function') {
      throw new TypeError(`${api}: ${what} must be an Element or a selector string`);
    }
    return /** @type {Element} */ (given);
  }

  for (const name of Object.keys(feedback)) {
    if (!Object.hasOwn(fieldSet, name)) {
      throw new TypeError(`${api}: options.feedback names no such field '${name}'`);
    }
  }

  /** Nodes this binding created, so teardown can remove exactly those. @type {Set<Element>} */
  const created = new Set();
  /** @type {Map<string, Element>} */
  const nodes = new Map();

  /**
   * The node a field's messages go in — the caller's, or one placed where the
   * sibling combinator that shows it can reach it.
   *
   * @param {string} name
   * @returns {Element | null}
   */
  function nodeFor(name) {
    const existing = nodes.get(name);
    if (existing !== undefined) return existing;

    const given = resolveNode(feedback[name], `options.feedback.${name}`);
    if (given !== null) {
      nodes.set(name, given);
      return given;
    }

    const controls = fieldSet[name];
    if (controls.length === 0) return null;
    const node = doc.createElement('div');
    node.id = uniqueId(doc);
    const last = controls[controls.length - 1];
    last.after(node);
    created.add(node);
    nodes.set(name, node);
    return node;
  }

  /** @returns {Element | null} */
  function formNode() {
    const existing = nodes.get('');
    if (existing !== undefined) return existing;
    const given = resolveNode(formFeedback, 'options.formFeedback');
    const node = given ?? doc.createElement('div');
    if (given === null) {
      node.id = uniqueId(doc);
      root.append(node);
      created.add(node);
    }
    nodes.set('', node);
    return node;
  }

  /**
   * Put one finding list into a node, one child element per message.
   *
   * Children rather than one joined string: a newline in `textContent` renders as
   * a space, so two messages would run together, and a caller who wants to style
   * a warning differently from an error needs something to hang a class on.
   *
   * @param {Element} node
   * @param {readonly Finding[]} findings
   * @param {boolean} validatedField
   * @returns {void}
   */
  function paint(node, findings, validatedField) {
    node.replaceChildren();
    for (const finding of findings) {
      const line = doc.createElement('div');
      toggleToken(line, slots[finding.severity], true);
      // `textContent`, always: 21.4 maps a server's error body into these same
      // findings, so this is the path an untrusted string travels (NFR-42).
      line.textContent = finding.message;
      node.append(line);
    }

    const hasError = findings.some((finding) => finding.severity === 'error');
    const onlyNotes = !hasError && findings.length > 0;
    toggleToken(node, slots.invalid, hasError);
    toggleToken(node, slots.note, onlyNotes);
    toggleToken(node, slots.valid, validatedField && findings.length === 0);
  }

  /**
   * @param {ValidationResult} result
   * @returns {void}
   */
  function render(result) {
    const seen = new Set(result.validated);
    toggleToken(root, slots.validated, seen.size > 0);

    for (const name of Object.keys(fieldSet)) {
      // No `?? []`: the validator's `derive` emits an entry for every field, so
      // the lookup cannot miss. Dead guards get deleted here (the M2.4 rule).
      const findings = result.fields[name];
      const hasError = findings.some((finding) => finding.severity === 'error');
      const validatedField = seen.has(name);

      // A node is created only when there is something to put in it. A field
      // that passed and never had a finding gets nothing — an empty feedback
      // element per clean control is markup nobody asked for. One that HAS a
      // node keeps it and is repainted, which is how the `valid` slot reaches
      // the field that was wrong a moment ago.
      const node = findings.length > 0 ? nodeFor(name) : (nodes.get(name) ?? null);
      if (node !== null) paint(node, findings, validatedField);

      for (const control of fieldSet[name]) {
        toggleToken(control, slots.controlInvalid, hasError);
        toggleToken(control, slots.controlValid, validatedField && !hasError);
        if (hasError) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
        if (node !== null) {
          // Only while there is something to describe: a permanent
          // `aria-describedby` pointing at an empty node makes every control
          // announce a pause.
          toggleAttributeToken(control, 'aria-describedby', node.id, findings.length > 0);
        }
      }
    }

    if (result.form.length > 0 || nodes.has('')) {
      const node = formNode();
      if (node !== null) paint(node, result.form, false);
    }
  }

  /** @type {import('./dom-a11y.js').LiveRegionInstance | undefined} */
  let region = liveRegion;
  /** True when the region above is ours to destroy. */
  let ownsRegion = false;
  let destroyed = false;

  const unsubscribe = validator.on('change', render);
  render(validator.result());

  /** @returns {void} */
  function onAbort() {
    instance.destroy();
  }

  /** @type {FormFeedbackInstance} */
  const instance = {
    validator,
    element: root,

    report() {
      assertAlive(destroyed, api, 'report');
      const result = validator.result();

      /** @type {Element | null} */
      let first = null;
      for (const name of Object.keys(fieldSet)) {
        const findings = result.fields[name];
        if (!findings.some((finding) => finding.severity === 'error')) continue;
        first =
          fieldSet[name].find((control) => control.hasAttribute('disabled') === false) ?? null;
        if (first !== null) break;
      }

      if (announce) {
        if (region === undefined) {
          // Lazily: a live region is a node in the document, and a form that is
          // never reported on should not add one.
          region = createLiveRegion({ document: doc });
          ownsRegion = true;
        }
        region.announce(summary === undefined ? defaultSummary(result) : summary(result));
      }

      if (first !== null && typeof (/** @type {any} */ (first).focus) === 'function') {
        /** @type {any} */ (first).focus();
      }
      return first;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();

      for (const name of Object.keys(fieldSet)) {
        const node = nodes.get(name);
        for (const control of fieldSet[name]) {
          toggleToken(control, slots.controlInvalid, false);
          toggleToken(control, slots.controlValid, false);
          control.removeAttribute('aria-invalid');
          if (node !== undefined) toggleAttributeToken(control, 'aria-describedby', node.id, false);
        }
      }
      toggleToken(root, slots.validated, false);

      // Structural teardown (ADR-0029): what this created, it removes; what the
      // caller supplied, it only empties.
      for (const node of nodes.values()) {
        if (created.has(node)) node.remove();
        else node.replaceChildren();
      }
      nodes.clear();
      created.clear();

      if (ownsRegion) region?.destroy();
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    },
  };

  if (signal !== undefined) {
    if (signal.aborted) instance.destroy();
    else signal.addEventListener('abort', onAbort);
  }

  return instance;
}

/**
 * The default announcement: a count, not a recital.
 *
 * Reading every message aloud is the obvious idea and the wrong one — a screen
 * reader user who has just been moved to the first broken field wants to know how
 * much is wrong, then hear each field's own message as they reach it. Pass
 * `summary` for different wording (NFR-21: the words are always injectable).
 *
 * @param {ValidationResult} result
 * @returns {string}
 */
function defaultSummary(result) {
  const broken = Object.values(result.fields).filter((findings) =>
    findings.some((finding) => finding.severity === 'error'),
  ).length;
  const formErrors = result.form.filter((finding) => finding.severity === 'error').length;
  const total = broken + formErrors;
  if (total === 0) return 'No problems found.';
  return total === 1 ? '1 problem needs attention.' : `${total} problems need attention.`;
}
