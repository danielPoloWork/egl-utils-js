/**
 * egl-utils-js/forms — the submit lifecycle (spec 08 §2 items F122-F123).
 *
 * The fourth member of the ADR-0077 family, and the one that owns the sequence
 * every application writes by hand and gets subtly wrong: validate, refuse,
 * mark busy, disable, await, restore, report. Written by hand it is six
 * statements and four bugs — a double submit while the first request is in
 * flight, a spinner that never stops because the failure path forgot to
 * restore, a control re-enabled that the page had disabled itself, and a
 * server's field errors dropped on the floor because nothing mapped them.
 *
 * **The double-submit guard is structural, not a flag.** A second `submit()`
 * while one is in flight returns *the same promise* — not a refusal, not a
 * second request. A refusal would leave the caller writing the guard this
 * exists to own; a boolean `busy` flag checked at the top of an `async`
 * function is the same bug with more code, because the check and the set are
 * separated by an `await`.
 *
 * **A blocked submit is an answer; a failed one is a failure.** Validation
 * finding an `error` resolves with `{status: 'blocked'}` — the form was asked
 * and said no, which is information rather than an exception (F102's
 * precedent, ADR-0071: a dismissal is an answer). The handler *rejecting*
 * rejects `submit()` with that same error object, `HttpError` and all: a
 * rejection means the submission was attempted and failed, and re-wrapping it
 * would cost the caller the `status` and `body` they need.
 *
 * **The server's body is untrusted, and this is the boundary.** Until F123
 * every string this library rendered came from the caller. An injected mapper
 * turns a rejection into findings, and three rules make that safe rather than
 * merely convenient (NFR-42):
 *
 * - a field name from the server is **matched against the resolved field set**,
 *   never used as a selector;
 * - a name that matches nothing becomes a **form-level finding** rather than
 *   being dropped, because silently discarding a server's complaint is how a
 *   user is told "something went wrong" with no idea what;
 * - every message reaches the DOM through the F121 renderer, which has no
 *   `{html, sanitize}` opt-in — deliberately, so this path cannot be opted into
 *   markup.
 *
 * @module egl-utils-js/forms
 */

import { setEnabled } from './dom-events.js';
import { controllerFor, isAbortSignal, isElement } from './dom-helpers.js';
import { assertAlive } from './lifecycle.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`bindSubmit: ${name} must be a plain object`);
  }
}

/**
 * Whether a control is already disabled, read the way `setEnabled` writes it:
 * the property where there is one, the attribute otherwise. Asymmetry here is
 * what makes "restore exactly what you disabled" quietly wrong on a
 * `<fieldset>` or on a caller-nominated `<div>`.
 *
 * @param {Element} target
 * @returns {boolean}
 */
function isDisabled(target) {
  if ('disabled' in target) return /** @type {any} */ (target).disabled === true;
  return target.hasAttribute('disabled');
}

/**
 * The findings a mapper produced, in the shape the validator's `applyFindings`
 * takes.
 *
 * @typedef {object} MappedFindings
 * @property {Record<string, unknown>} [fields] - Per field name: a message, a
 *   finding, or an array of either.
 * @property {unknown} [form] - Findings that belong to the form rather than to
 *   any one field.
 */

/**
 * The default `mapError`: the `{errors: {field: message}}` shape, which is what
 * Rails, Laravel, DRF and most hand-rolled JSON APIs answer with, plus a
 * top-level `message` for the request as a whole.
 *
 * Reads `body` — the parsed response body an `HttpError` (F16, ADR-0007)
 * carries — and nothing else: a `TypeError` from a handler that never reached
 * the network has no `body`, so it maps to no findings and stays a rejection.
 *
 * Two shapes are accepted per field, because both are common: a string, and an
 * array of strings (one field, several complaints). Anything else is ignored
 * rather than coerced — `String(value)` on a nested object renders
 * `[object Object]` into the page, which is worse than saying nothing.
 *
 * **The field map is built through `Object.fromEntries`, never by assignment.**
 * A server that answers `{errors: {__proto__: …}}` would otherwise reach
 * `Object.prototype` through a plain `map[name] = …` — BUG-0004's lesson, and
 * this time the input is untrusted rather than a caller's own column key.
 *
 * @param {unknown} failure - Whatever the handler rejected with.
 * @returns {MappedFindings}
 */
function defaultMapError(failure) {
  const body =
    failure === null || typeof failure !== 'object'
      ? undefined
      : /** @type {{ body?: unknown }} */ (failure).body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return {};

  /** @type {MappedFindings} */
  const mapped = {};
  const { errors, message } = /** @type {{ errors?: unknown, message?: unknown }} */ (body);

  if (errors !== null && typeof errors === 'object' && !Array.isArray(errors)) {
    const entries = Object.entries(errors).flatMap(([name, value]) => {
      const messages = (Array.isArray(value) ? value : [value]).filter(
        (entry) => typeof entry === 'string' && entry !== '',
      );
      return messages.length === 0 ? [] : [/** @type {[string, string[]]} */ ([name, messages])];
    });
    if (entries.length > 0) mapped.fields = Object.fromEntries(entries);
  }

  if (typeof message === 'string' && message !== '') mapped.form = [message];
  return mapped;
}

/**
 * Tag findings with the name the source gave them, for a name that matches no
 * field. The name travels as **data**, never as a selector and never spliced
 * into the message: rewriting a server's wording is not this library's call
 * (NFR-21), and a caller who wants the name in the text composes it themselves.
 *
 * @param {unknown} value - A message, a finding, or an array of either.
 * @param {string} field - The unmatched name, verbatim.
 * @returns {unknown[]}
 */
function tagged(value, field) {
  const many = Array.isArray(value) ? value : [value];
  return many.map((entry) =>
    typeof entry === 'string'
      ? { message: entry, field }
      : { .../** @type {object} */ (entry), field },
  );
}

/**
 * @typedef {object} SubmitContext
 * @property {import('./forms-values.js').FormInstance} form - The bound form, so
 *   the handler reaches `toJSON()` or `toFormData()` rather than being handed
 *   one serialization it may not want.
 * @property {Record<string, unknown>} values - The values as of the moment
 *   validation passed.
 * @property {import('./forms-validate.js').ValidationResult} validation - The
 *   result that let this submission through.
 * @property {AbortSignal} signal - Aborted by `destroy()`, so a handler that
 *   passes it to `fetch` stops when the form goes away (NFR-15).
 */

/**
 * @typedef {object} SubmitOutcome
 * @property {'blocked' | 'succeeded' | 'failed'} status - `blocked`: validation
 *   found an `error` and the handler never ran. `succeeded`: the handler
 *   resolved. `failed`: the handler rejected — the outcome subscribers see,
 *   while `submit()` itself rejects with the error.
 * @property {import('./forms-validate.js').ValidationResult} validation - The
 *   validation state at settlement; for a `failed` submission that includes the
 *   findings the mapper has just applied.
 * @property {unknown} [handlerResult] - Whatever the handler resolved with, on
 *   `succeeded`.
 * @property {unknown} [failure] - What the handler rejected with, on `failed`,
 *   unwrapped and with its identity intact.
 */

/**
 * @typedef {object} BindSubmitOptions
 * @property {(context: SubmitContext) => unknown} handler - Your submission.
 *   Required: this engine owns the lifecycle around a request, never the
 *   request itself (ADR-0025).
 * @property {Element | string | ReadonlyArray<Element | string>} [disable] -
 *   What to disable while a submission is in flight — elements, or selectors
 *   resolved within the form root on **every** submit, because a form's
 *   controls can change between submissions. Restored to exactly the state it
 *   was found in: a control the page had already disabled stays disabled.
 * @property {string} [busyClass=''] - Class token(s) toggled on the form root
 *   while in flight. `aria-busy` is set regardless — a busy state a sighted user
 *   can see is announced (NFR-44).
 * @property {(failure: unknown, context: SubmitContext) => MappedFindings | null | undefined} [mapError]
 *   Turn a rejection into findings (F123). Defaults to the `{errors: {field:
 *   message}}` shape plus a top-level `message`; yours replaces it entirely.
 * @property {import('./forms-feedback.js').FormFeedbackInstance} [feedback] -
 *   Report through this binding on a blocked or failed submit: focus to the
 *   first `error` and the F121 announcement. Injected rather than created, so a
 *   caller who renders findings their own way pays nothing for it.
 * @property {boolean} [intercept] - Listen for the root's own `submit` event,
 *   `preventDefault()` it and run the lifecycle. Defaults to `true` for a
 *   `<form>` root and `false` for any other container, because a `<div>` has no
 *   submit event to intercept.
 * @property {AbortSignal} [signal] - Destroys the binding when aborted (NFR-15).
 */

/**
 * @typedef {object} SubmitInstance
 * @property {import('./forms-validate.js').ValidatorInstance} validator - The
 *   validator this gates on.
 * @property {import('./forms-values.js').FormInstance} form - The form it reads.
 * @property {Element} element - The root it marks busy and listens on.
 * @property {() => Promise<SubmitOutcome>} submit - Run the lifecycle. While one
 *   submission is in flight this returns **that** submission's promise.
 * @property {() => boolean} pending - Whether a submission is in flight.
 * @property {(event: 'settle', handler: (outcome: SubmitOutcome) => void) => () => void} on
 *   Subscribe to outcomes — including the `failed` one an intercepted submit has
 *   no caller to reject to. Returns an idempotent unsubscribe.
 * @property {() => void} destroy - Idempotent teardown: detaches the listener,
 *   aborts the in-flight submission's signal, and restores the busy state.
 */

/**
 * Own the submit lifecycle, and route a server's errors back onto the fields
 * (spec 08 F122-F123).
 *
 * @example
 * const form = createForm(root);
 * const validator = createValidator(form, { rules });
 * const feedback = bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });
 *
 * const submitter = bindSubmit(validator, {
 *   feedback,
 *   disable: ['[type=submit]'],
 *   busyClass: 'opacity-50',
 *   handler: ({ form, signal }) => api.put(`/hosts/${id}`, form.toJSON(), { signal }),
 * });
 *
 * // The submit button now runs the whole sequence. Nothing else to wire.
 *
 * @example
 * // Called yourself, the outcome is a value and the failure is a rejection:
 * try {
 *   const { status } = await submitter.submit();
 *   if (status === 'blocked') return; // the findings are already on the page
 *   toast('Saved');
 * } catch (failure) {
 *   // An HttpError, with its status and body — the field errors it carried are
 *   // already rendered; this is for the half no field can show.
 *   if (failure.status >= 500) toast('The server is having a bad day');
 * }
 *
 * @example
 * // A server that names a field the form does not have is reported, not dropped:
 * // { errors: { tier: 'Unknown tier', legacy_flag: 'No longer accepted' } }
 * //   -> `tier` renders under the tier control
 * //   -> `legacy_flag` renders as a form-level finding carrying `field`
 *
 * @param {import('./forms-validate.js').ValidatorInstance} validator - The
 *   validator whose verdict gates the submission.
 * @param {BindSubmitOptions} options
 * @returns {SubmitInstance}
 * @throws {TypeError} On a malformed option, a missing `handler`, or
 *   `intercept: true` on a root that is not a `<form>`.
 */
export function bindSubmit(validator, options = /** @type {any} */ ({})) {
  const api = 'bindSubmit';
  if (
    validator === null ||
    typeof validator !== 'object' ||
    typeof (/** @type {any} */ (validator).validate) !== 'function' ||
    typeof (/** @type {any} */ (validator).applyFindings) !== 'function' ||
    !isElement(/** @type {any} */ (validator).form?.element)
  ) {
    throw new TypeError(`${api}: validator must be a createValidator instance`);
  }
  assertPlainObject(options, 'options');
  const {
    handler,
    disable = [],
    busyClass = '',
    mapError = defaultMapError,
    feedback,
    intercept,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  if (typeof handler !== 'function') {
    throw new TypeError(`${api}: options.handler must be a function`);
  }
  const nominated = Array.isArray(disable) ? [...disable] : [disable];
  for (const entry of nominated) {
    const ok = typeof entry === 'string' ? entry !== '' : isElement(entry);
    if (!ok) {
      throw new TypeError(`${api}: options.disable takes elements and non-empty selectors`);
    }
  }
  if (typeof busyClass !== 'string') {
    throw new TypeError(`${api}: options.busyClass must be a string of class tokens`);
  }
  if (typeof mapError !== 'function') {
    throw new TypeError(`${api}: options.mapError must be a function`);
  }
  if (feedback !== undefined && typeof (/** @type {any} */ (feedback)?.report) !== 'function') {
    throw new TypeError(`${api}: options.feedback must be a bindFormFeedback instance`);
  }
  if (intercept !== undefined && typeof intercept !== 'boolean') {
    throw new TypeError(`${api}: options.intercept must be a boolean`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const form = validator.form;
  const root = form.element;
  // `tagName`, not `instanceof HTMLFormElement`: every type test in this library
  // is structural so it survives a second realm (an iframe, jsdom), and this one
  // needs no global at all.
  const tag = String(root.tagName);
  const isForm = tag.toUpperCase() === 'FORM';
  const intercepting = intercept ?? isForm;
  if (intercepting && !isForm) {
    throw new TypeError(
      `${api}: options.intercept is true, but the root is a <${tag.toLowerCase()}> — ` +
        'only a <form> has a submit event to intercept',
    );
  }

  const busyTokens = busyClass.split(/\s+/).filter(Boolean);

  /**
   * What the busy state took, so restoring gives back exactly that.
   * @type {{ disabled: Element[], added: string[], busy: string | null } | null}
   */
  let marked = null;
  /** @type {AbortController | null} */
  let active = null;
  /** @type {Promise<SubmitOutcome> | null} */
  let inFlight = null;
  /** @type {Set<(outcome: SubmitOutcome) => void>} */
  const listeners = new Set();
  let destroyed = false;

  /** @returns {Element[]} */
  function resolveDisable() {
    /** @type {Set<Element>} */
    const found = new Set();
    for (const entry of nominated) {
      if (typeof entry !== 'string') {
        found.add(entry);
        continue;
      }
      // A selector that matches nothing disables nothing, on purpose: this is
      // resolved per submission precisely so markup added after construction is
      // included, and throwing mid-submit over an absent optional control would
      // fail the save rather than the wiring.
      for (const el of root.querySelectorAll(entry)) found.add(el);
    }
    return [...found];
  }

  /** @returns {void} */
  function mark() {
    /** @type {Element[]} */
    const disabled = [];
    for (const target of resolveDisable()) {
      // The classic off-by-one of this pattern: a control the page disabled
      // itself must still be disabled when the submission settles, so only the
      // ones this actually changed are remembered.
      if (isDisabled(target)) continue;
      setEnabled(target, false);
      disabled.push(target);
    }
    /** @type {string[]} */
    const added = [];
    for (const token of busyTokens) {
      if (root.classList.contains(token)) continue;
      root.classList.add(token);
      added.push(token);
    }
    marked = { disabled, added, busy: root.getAttribute('aria-busy') };
    root.setAttribute('aria-busy', 'true');
  }

  /** @returns {void} */
  function restore() {
    if (marked === null) return;
    const { disabled, added, busy } = marked;
    marked = null;
    for (const target of disabled) setEnabled(target, true);
    for (const token of added) root.classList.remove(token);
    // `classList.add` then `remove` leaves `class=""` on an element that never
    // had the attribute, and a lifecycle that leaves a trace has not restored
    // anything (the 21.3 lesson, ADR-0079).
    if (root.classList.length === 0 && root.getAttribute('class') === '') {
      root.removeAttribute('class');
    }
    if (busy === null) root.removeAttribute('aria-busy');
    else root.setAttribute('aria-busy', busy);
  }

  /**
   * @param {SubmitOutcome} outcome
   * @returns {SubmitOutcome}
   */
  function publish(outcome) {
    const frozen = Object.freeze(outcome);
    // A copy: a subscriber that unsubscribes during dispatch must not reindex
    // the set being iterated.
    for (const listener of [...listeners]) listener(frozen);
    return frozen;
  }

  /**
   * Map a rejection onto the fields, and report what no field can (F123).
   *
   * @param {unknown} failure
   * @param {SubmitContext} context
   * @returns {void}
   */
  function applyFailure(failure, context) {
    const mapped = mapError(failure, context);
    if (mapped === null || mapped === undefined) return;
    assertPlainObject(mapped, 'mapError result');
    const { fields = {}, form: formLevel, ...extra } = mapped;
    assertNoUnknownOptions(extra, api, 'mapError result key');
    assertPlainObject(fields, 'mapError result fields');

    /** @type {Array<[string, unknown]>} */
    const known = [];
    /** @type {unknown[]} */
    const unmatched = [];
    for (const [name, value] of Object.entries(fields)) {
      // Matched against the resolved field set, never used as a selector: a
      // server-controlled string reaching `querySelector` is the injection this
      // boundary exists to refuse (NFR-42).
      if (Object.hasOwn(form.fields, name)) known.push([name, value]);
      else unmatched.push(...tagged(value, name));
    }

    const atForm = formLevel === undefined || formLevel === null ? [] : formLevel;
    // Cast, and deliberately not a validation pass here: a mapper's output is
    // `unknown` by construction — it stood over an untrusted payload — and
    // `applyFindings` is the checker, with one `TypeError` vocabulary for a
    // malformed finding whatever produced it. Two validators would drift.
    validator.applyFindings(
      /** @type {import('./forms-validate.js').ExternalFindings} */ ({
        fields: Object.fromEntries(known),
        form: [...(Array.isArray(atForm) ? atForm : [atForm]), ...unmatched],
      }),
    );
  }

  /** @returns {Promise<SubmitOutcome>} */
  async function run() {
    const validation = await validator.validate();
    if (!validation.valid) {
      feedback?.report();
      return publish({ status: 'blocked', validation });
    }

    const controller = controllerFor(root);
    active = controller;
    /** @type {SubmitContext} */
    const context = Object.freeze({
      form,
      values: form.getValues(),
      validation,
      signal: controller.signal,
    });

    mark();
    /** @type {unknown} */
    let handlerResult;
    /** @type {{ thrown: unknown } | null} */
    let failed = null;
    try {
      handlerResult = await handler(context);
    } catch (thrown) {
      failed = { thrown };
    } finally {
      // Before anything is published: a subscriber that sees the outcome while
      // the form is still disabled is looking at a state that no longer exists.
      restore();
      active = null;
    }

    if (failed === null) return publish({ status: 'succeeded', validation, handlerResult });

    // A teardown mid-flight leaves nothing to render into and no validator to
    // render through; the rejection is still the caller's to see.
    if (!destroyed) {
      applyFailure(failed.thrown, context);
      feedback?.report();
    }
    publish({ status: 'failed', validation: validator.result(), failure: failed.thrown });
    throw failed.thrown;
  }

  /** @type {SubmitInstance} */
  const instance = {
    validator,
    form,
    element: root,

    submit() {
      assertAlive(destroyed, api, 'submit');
      // Deliberately NOT an `async` method: an `async` wrapper would hand every
      // caller a *different* promise around the same submission, and F122's
      // guard is that a second call gets the first call's promise — asserted by
      // identity, because that is the only version a caller can rely on.
      if (inFlight !== null) return inFlight;
      const started = run().finally(() => {
        if (inFlight === started) inFlight = null;
      });
      inFlight = started;
      return started;
    },

    pending() {
      return inFlight !== null;
    },

    on(event, listener) {
      assertAlive(destroyed, api, 'on');
      if (event !== 'settle') {
        throw new TypeError(`${api}: on() takes 'settle' — got '${String(event)}'`);
      }
      if (typeof listener !== 'function') {
        throw new TypeError(`${api}: on() handler must be a function`);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      domController?.abort();
      active?.abort();
      restore();
      listeners.clear();
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    },
  };

  /** @returns {void} */
  function onAbort() {
    instance.destroy();
  }

  /** @type {AbortController | undefined} */
  let domController;
  if (intercepting) {
    domController = controllerFor(root);
    root.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        // An intercepted submit has no caller to reject to, and an unhandled
        // rejection out of a DOM event handler is not a diagnostic — it is
        // noise in the console of a page that already shows the findings. The
        // outcome reaches `on('settle')` either way, which is the channel for
        // the half no field can display.
        instance.submit().catch(() => {});
      },
      { signal: domController.signal },
    );
  }

  if (signal !== undefined) {
    if (signal.aborted) instance.destroy();
    else signal.addEventListener('abort', onAbort);
  }

  return instance;
}
