/**
 * egl-utils-js/forms — the validation engine (spec 08 §2 items F116-F119).
 *
 * **It takes a form; it is not one.** `createValidator(form, …)` is the second
 * member of the family ADR-0077 chose over one instance that does everything —
 * the shape `bindTableControls(pipeline, …)` and `createResource(client, …)`
 * already use. A filter form imports `createForm` and links none of this.
 *
 * Four things this settles, because a validation engine is mostly made of
 * decisions that look like details until a user is stuck behind one:
 *
 * **A rule is a function, and a finding is data.** Return nothing for "fine", a
 * string for the common case, or `{message, severity}` when the level matters.
 * The result is a value you read — per field and for the form — never a boolean
 * plus a side effect on the DOM, because the DOM is 21.3's job and a caller may
 * want the findings for something else entirely.
 *
 * **Only `error` blocks.** `warning` and `info` are reported and never gate a
 * submit. A warning that blocks is a bug the user cannot escape; a blocking
 * condition dressed as a warning is worse (F117).
 *
 * **Latest-wins is per rule, not per run.** A cross-field rule declares what it
 * depends on, so validating one field can update *another* field's findings —
 * which means two concurrent runs could otherwise write the same field. Each
 * rule instead owns at most one in-flight execution: a newer one aborts the
 * older and the older cannot land, because the settle path checks identity. The
 * F89 discipline, applied at a finer grain and for the same reason — an
 * `AbortSignal` stops a `fetch`, it cannot un-resolve a promise that already
 * settled (F118).
 *
 * **The platform is read, not replaced.** `required` and `type="email"` stay in
 * the markup, where a no-JavaScript submit still honours them, and their failures
 * arrive as findings in the same shape as everything else. A field's own error is
 * pushed back through `setCustomValidity`, so the browser's native bubble and
 * this engine can never disagree about a field (F119). Whether the bubble is
 * *shown* is the caller's business; whether the two layers agree is not.
 *
 * **And findings can arrive from outside.** `applyFindings` folds messages this
 * engine did not compute into the same result, in their own slots, so a server's
 * rejection lands under the right control and everything already subscribed
 * renders it (F123, added in 21.4). They are cleared when the field they belong
 * to is validated again, because a complaint about a value stops being true the
 * moment the value changes.
 *
 * @module egl-utils-js/forms
 */

import { controllerFor, isAbortSignal, isElement } from './dom-helpers.js';
import { assertAlive } from './lifecycle.js';
import { assertNoUnknownOptions } from './option-keys.js';

/** The severity levels, in descending order of consequence (F117). */
const SEVERITIES = /* @__PURE__ */ new Set(['error', 'warning', 'info']);

/**
 * `ValidityState` flags, in the order a message should prefer them: what the
 * user did wrong most specifically comes first, and `customError` last because
 * it is this engine's own push-back and never a native failure.
 */
const CONSTRAINTS = /* @__PURE__ */ Object.freeze([
  'valueMissing',
  'typeMismatch',
  'patternMismatch',
  'tooShort',
  'tooLong',
  'rangeUnderflow',
  'rangeOverflow',
  'stepMismatch',
  'badInput',
]);

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`createValidator: ${name} must be a plain object`);
  }
}

/**
 * @typedef {'error' | 'warning' | 'info'} Severity
 */

/**
 * @typedef {object} Finding
 * @property {string} message - What to tell the user.
 * @property {Severity} severity - Only `error` blocks a submit (F117).
 * @property {'rule' | 'native' | 'external'} source - Where it came from: one of
 *   this caller's rules, the platform's own constraint validation, or outside
 *   the engine entirely through {@link ValidatorInstance.applyFindings} — which
 *   in practice means a server (F123).
 * @property {string} [constraint] - For a native finding, the `ValidityState`
 *   flag that failed (`'valueMissing'`, `'typeMismatch'`, …), so a caller can
 *   substitute their own wording without parsing a message.
 * @property {string} [field] - For an external finding that named a field this
 *   form does not have: the name as its source gave it, carried as data so it is
 *   reported rather than dropped (F123). Never used as a selector.
 * @property {unknown} [cause] - The error a rule threw, when one did.
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} valid - No `error`-severity finding anywhere. `true` before
 *   anything has run, which is why `validated` exists beside it.
 * @property {Readonly<Record<string, readonly Finding[]>>} fields - Findings per
 *   field, in the order the layers ran: native, then declared rules, then
 *   whatever `applyFindings` supplied from outside.
 * @property {readonly Finding[]} form - Findings that belong to the form rather
 *   than to any one field.
 * @property {readonly string[]} validated - Field names that have actually been
 *   run, so "no findings" and "not asked yet" stay distinguishable.
 */

/**
 * @typedef {object} ValidationView
 * @property {string | null} name - The field being validated, or `null` for a
 *   form-level rule.
 * @property {Readonly<Record<string, unknown>>} values - Every field's value, so
 *   a cross-field rule can compare.
 */

/**
 * @typedef {undefined | null | string | { message: string, severity?: Severity }} RuleOutcome
 */

/**
 * @typedef {(value: unknown, view: ValidationView, signal: AbortSignal) => RuleOutcome | Promise<RuleOutcome>} RuleFn
 */

/**
 * @typedef {RuleFn | { validate: RuleFn, dependsOn?: readonly string[] }} Rule
 */

/**
 * Normalise one rule declaration into the record the engine runs.
 *
 * @param {Rule} rule
 * @param {string | null} owner - Field the finding belongs to, `null` for the form.
 * @param {number} index - Position among that owner's rules, for messages.
 * @param {(name: string) => boolean} isField
 * @returns {{ id: object, owner: string | null, label: string, validate: RuleFn, dependsOn: Set<string> }}
 */
function normaliseRule(rule, owner, index, isField) {
  const label = `${owner ?? 'form'}[${index}]`;
  if (typeof rule === 'function') {
    return { id: {}, owner, label, validate: rule, dependsOn: new Set() };
  }
  assertPlainObject(rule, `rules.${label}`);
  const { validate, dependsOn = [], ...unknown } = rule;
  assertNoUnknownOptions(unknown, 'createValidator', 'rule property');
  if (typeof validate !== 'function') {
    throw new TypeError(`createValidator: rules.${label}.validate must be a function`);
  }
  if (!Array.isArray(dependsOn)) {
    throw new TypeError(
      `createValidator: rules.${label}.dependsOn must be an array of field names`,
    );
  }
  for (const name of dependsOn) {
    if (typeof name !== 'string' || !isField(name)) {
      throw new TypeError(
        `createValidator: rules.${label}.dependsOn names no such field '${String(name)}'`,
      );
    }
  }
  return { id: {}, owner, label, validate, dependsOn: new Set(dependsOn) };
}

/**
 * Turn whatever a rule returned into a finding, or `null` for "fine".
 *
 * @param {RuleOutcome} outcome
 * @param {string} label - For the error message when the shape is wrong.
 * @returns {Finding | null}
 */
function findingFrom(outcome, label) {
  if (outcome === undefined || outcome === null) return null;
  if (typeof outcome === 'string') {
    // The terse form, and the common one: a message alone means an error,
    // because that is what a rule that bothered to complain almost always meant.
    return outcome === '' ? null : { message: outcome, severity: 'error', source: 'rule' };
  }
  assertPlainObject(outcome, `rules.${label} return value`);
  const { message, severity = 'error', ...unknown } = outcome;
  assertNoUnknownOptions(unknown, 'createValidator', 'finding property');
  if (typeof message !== 'string' || message === '') {
    throw new TypeError(`createValidator: rules.${label} returned a finding with no message`);
  }
  if (!SEVERITIES.has(severity)) {
    throw new TypeError(
      `createValidator: rules.${label} returned severity '${severity}' — expected 'error', 'warning' or 'info'`,
    );
  }
  return { message, severity, source: 'rule' };
}

/**
 * Turn one externally-supplied outcome list into findings (F123).
 *
 * Deliberately **not** `findingFrom`: a rule returning a malformed value is a
 * programming error in the caller's own code, while these arrive from a mapper
 * standing over an untrusted payload, and they carry one field a rule may not —
 * `field`, the name a source used that this form does not have. Same strictness,
 * different shape: a `TypeError` names the offender either way, because a mapper
 * that produced nonsense is still a bug and not a message to show a user.
 *
 * @param {unknown} value - An outcome, or an array of them.
 * @param {string} label - For the error message.
 * @returns {Finding[]}
 */
function externalFindings(value, label) {
  const many = Array.isArray(value) ? value : [value];
  /** @type {Finding[]} */
  const findings = [];
  for (const entry of many) {
    if (entry === undefined || entry === null || entry === '') continue;
    if (typeof entry === 'string') {
      findings.push({ message: entry, severity: 'error', source: 'external' });
      continue;
    }
    assertPlainObject(entry, label);
    const { message, severity = 'error', field, ...unknown } = entry;
    assertNoUnknownOptions(unknown, 'createValidator', 'finding property');
    if (typeof message !== 'string' || message === '') {
      throw new TypeError(`createValidator: ${label} has a finding with no message`);
    }
    if (!SEVERITIES.has(severity)) {
      throw new TypeError(
        `createValidator: ${label} has severity '${severity}' — expected 'error', 'warning' or 'info'`,
      );
    }
    if (field !== undefined && typeof field !== 'string') {
      throw new TypeError(`createValidator: ${label} has a non-string field name`);
    }
    findings.push(
      field === undefined
        ? { message, severity, source: 'external' }
        : { message, severity, source: 'external', field },
    );
  }
  return findings;
}

/**
 * @typedef {object} NativeMessageInfo
 * @property {string} constraint - The `ValidityState` flag that failed.
 * @property {Element} control - The control that failed it.
 * @property {string} message - The platform's own `validationMessage`.
 */

/**
 * @typedef {object} CreateValidatorOptions
 * @property {Record<string, Rule | Rule[]>} [rules] - Rules per field name. A
 *   rule may declare `dependsOn` to be re-run when another field is validated.
 * @property {Rule | Rule[]} [formRules] - Rules whose findings belong to the form
 *   rather than to a field. With no `dependsOn` they run only on `validate()`,
 *   deliberately: a rule that has not said when to re-run is not guessed at.
 * @property {boolean} [native=true] - Read `ValidityState` and fold native
 *   failures into the findings (F119).
 * @property {(info: NativeMessageInfo) => string} [nativeMessage] - Your wording
 *   for a native failure, keyed off the constraint. The default is the platform's
 *   own `validationMessage`, which is localized and often generic.
 * @property {readonly ('change' | 'blur')[]} [validateOn] - Validate a field
 *   automatically on these events. `blur` is observed as `focusout`, which is the
 *   bubbling half of the same moment.
 * @property {number} [debounceMs=0] - Quiet period before an automatic run.
 *   Worth setting when any rule is async and `change` is a trigger.
 * @property {AbortSignal} [signal] - Destroys the validator when aborted (NFR-15).
 */

/**
 * @typedef {undefined | null | string | { message: string, severity?: Severity, field?: string }} ExternalOutcome
 */

/**
 * @typedef {object} ExternalFindings
 * @property {Record<string, ExternalOutcome | readonly ExternalOutcome[]>} [fields]
 *   Findings per field name. A name this form does not have is a `TypeError`
 *   naming it (ADR-0047's rule, as for `setValues`) — deciding what to do with
 *   an unmatched *server* name is F123's job, not this one's, and it happens
 *   before the call.
 * @property {ExternalOutcome | readonly ExternalOutcome[]} [form] - Findings that
 *   belong to the form rather than to any one field.
 */

/**
 * @typedef {object} ValidatorInstance
 * @property {import('./forms-values.js').FormInstance} form - The form this reads.
 * @property {() => Promise<ValidationResult>} validate - Run everything.
 * @property {(name: string) => Promise<ValidationResult>} validateField - Run one
 *   field's rules plus the rules that declared it, and nothing else.
 * @property {(findings: ExternalFindings) => ValidationResult} applyFindings -
 *   Fold findings this engine did not produce into the result, so everything
 *   subscribed to it renders them (F123).
 * @property {() => ValidationResult} result - The last computed result.
 * @property {() => void} clear - Forget every finding, as if nothing had run.
 * @property {(event: 'change', handler: (result: ValidationResult) => void) => () => void} on
 *   Subscribe to results; returns an idempotent unsubscribe.
 * @property {() => void} destroy - Idempotent teardown.
 */

/**
 * Validate a form's values, incrementally and without fighting the platform
 * (spec 08 F116-F119).
 *
 * @example
 * const form = createForm(root);
 * const validator = createValidator(form, {
 *   validateOn: ['blur'],
 *   rules: {
 *     name: (value) => (String(value).trim() === '' ? 'A name is required' : undefined),
 *     // Async, abortable, and latest-wins: typing produces overlapping asks.
 *     handle: async (value, view, signal) => {
 *       const { free } = await api.get(`/handles/${value}`, { signal });
 *       return free ? undefined : 'That handle is taken';
 *     },
 *     // Cross-field: re-run when `start` is validated too.
 *     end: {
 *       dependsOn: ['start'],
 *       validate: (value, view) =>
 *         value < view.values.start ? 'The end cannot precede the start' : undefined,
 *     },
 *     // A level, not a block:
 *     password: (value) =>
 *       String(value).length < 12 ? { message: 'Consider a longer one', severity: 'warning' } : null,
 *   },
 * });
 *
 * const { valid, fields } = await validator.validate();
 * if (!valid) show(fields);
 *
 * @param {import('./forms-values.js').FormInstance} form - The form to validate.
 * @param {CreateValidatorOptions} [options]
 * @returns {ValidatorInstance}
 * @throws {TypeError} On a malformed option, a rule that is not a function or
 *   `{validate}`, or a `dependsOn` naming a field the form does not have.
 */
export function createValidator(form, options = {}) {
  const api = 'createValidator';
  if (
    form === null ||
    typeof form !== 'object' ||
    typeof (/** @type {any} */ (form).getValues) !== 'function' ||
    !isElement(/** @type {any} */ (form).element)
  ) {
    throw new TypeError(`${api}: form must be a createForm instance`);
  }
  assertPlainObject(options, 'options');
  const {
    rules = {},
    formRules,
    native = true,
    nativeMessage,
    validateOn = [],
    debounceMs = 0,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);
  assertPlainObject(rules, 'options.rules');
  if (typeof native !== 'boolean') throw new TypeError(`${api}: options.native must be a boolean`);
  if (nativeMessage !== undefined && typeof nativeMessage !== 'function') {
    throw new TypeError(`${api}: options.nativeMessage must be a function`);
  }
  if (!Array.isArray(validateOn)) {
    throw new TypeError(`${api}: options.validateOn must be an array of 'change' and/or 'blur'`);
  }
  for (const trigger of validateOn) {
    if (trigger !== 'change' && trigger !== 'blur') {
      throw new TypeError(
        `${api}: options.validateOn contains '${String(trigger)}' — expected 'change' or 'blur'`,
      );
    }
  }
  if (typeof debounceMs !== 'number' || !Number.isFinite(debounceMs) || debounceMs < 0) {
    throw new TypeError(`${api}: options.debounceMs must be a non-negative finite number`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const fieldSet = form.fields;
  const isField = (/** @type {string} */ name) => Object.hasOwn(fieldSet, name);

  /** @type {Array<{ id: object, owner: string | null, label: string, validate: RuleFn, dependsOn: Set<string> }>} */
  const ruleList = [];
  for (const [name, declared] of Object.entries(rules)) {
    if (!isField(name)) {
      throw new TypeError(`${api}: options.rules names no such field '${name}'`);
    }
    const many = Array.isArray(declared) ? declared : [declared];
    many.forEach((rule, index) => ruleList.push(normaliseRule(rule, name, index, isField)));
  }
  if (formRules !== undefined) {
    const many = Array.isArray(formRules) ? formRules : [formRules];
    many.forEach((rule, index) => ruleList.push(normaliseRule(rule, null, index, isField)));
  }

  /**
   * One finding slot per rule, so a run never writes another run's field.
   * @type {Map<object, Finding | null>}
   */
  const ruleFindings = new Map();
  /** @type {Map<string, Finding | null>} */
  const nativeFindings = new Map();
  /**
   * Findings from outside the engine, in their own slots for the same reason the
   * rules have theirs: a run must never write over an answer it did not compute.
   * @type {Map<string, readonly Finding[]>}
   */
  const externalByField = new Map();
  /** @type {readonly Finding[]} */
  let externalAtForm = [];
  /** @type {Set<string>} */
  const validated = new Set();
  /** @type {Map<object, { token: object, controller: AbortController }>} */
  const inFlight = new Map();
  /** @type {Set<(result: ValidationResult) => void>} */
  const listeners = new Set();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const debounces = new Map();

  let destroyed = false;
  /** @type {ValidationResult} */
  let current = derive();

  /**
   * Build the public result from the finding slots. Derived rather than mutated,
   * so a partially-completed run can never publish a half-written field.
   *
   * @returns {ValidationResult}
   */
  function derive() {
    /** @type {Array<[string, readonly Finding[]]>} */
    const entries = [];
    let valid = true;

    for (const name of Object.keys(fieldSet)) {
      /** @type {Finding[]} */
      const found = [];
      const nativeFinding = nativeFindings.get(name);
      if (nativeFinding !== undefined && nativeFinding !== null) found.push(nativeFinding);
      for (const rule of ruleList) {
        if (rule.owner !== name) continue;
        const finding = ruleFindings.get(rule.id);
        if (finding !== undefined && finding !== null) found.push(finding);
      }
      found.push(...(externalByField.get(name) ?? []));
      if (found.some((finding) => finding.severity === 'error')) valid = false;
      entries.push([name, Object.freeze(found)]);
    }

    /** @type {Finding[]} */
    const formFound = [];
    for (const rule of ruleList) {
      if (rule.owner !== null) continue;
      const finding = ruleFindings.get(rule.id);
      if (finding !== undefined && finding !== null) formFound.push(finding);
    }
    formFound.push(...externalAtForm);
    if (formFound.some((finding) => finding.severity === 'error')) valid = false;

    return Object.freeze({
      valid,
      fields: Object.freeze(Object.fromEntries(entries)),
      form: Object.freeze(formFound),
      validated: Object.freeze([...validated]),
    });
  }

  /** @returns {void} */
  function publish() {
    current = derive();
    // A copy: a handler that unsubscribes during dispatch must not reindex the
    // set we are iterating.
    for (const handler of [...listeners]) handler(current);
  }

  /**
   * Read the platform's verdict for one field, and push this engine's own back.
   *
   * The order matters and is the trap: `setCustomValidity` sets `customError`,
   * so reading `validity` without clearing our previous message first would
   * report our own finding as a native failure — the engine agreeing with itself
   * forever.
   *
   * @param {string} name
   * @returns {Finding | null}
   */
  function readNative(name) {
    if (!native) return null;
    for (const control of fieldSet[name]) {
      const element = /** @type {any} */ (control);
      if (typeof element.setCustomValidity === 'function') element.setCustomValidity('');
    }

    for (const control of fieldSet[name]) {
      const element = /** @type {any} */ (control);
      const validity = element.validity;
      if (validity === undefined || validity === null || validity.valid !== false) continue;
      const constraint = CONSTRAINTS.find((flag) => validity[flag] === true);
      // Deliberately defensive rather than dead, and deliberately not exercised:
      // an absent `validity`, or an invalid state whose flag is not in the list
      // above, means a host or a future spec revision this build has not seen.
      // Reporting `constraint: undefined` would be worse than reporting nothing,
      // and the M2.4 delete-the-dead-guard rule does not apply to a guard whose
      // whole job is the case we cannot enumerate.
      if (constraint === undefined) continue;
      const message = String(element.validationMessage ?? '');
      return {
        message:
          nativeMessage === undefined ? message : nativeMessage({ constraint, control, message }),
        severity: 'error',
        source: 'native',
        constraint,
      };
    }
    return null;
  }

  /**
   * Push a field's blocking message into the platform, so `checkValidity()` and
   * a native submit agree with this engine (F119).
   *
   * @param {string} name
   * @returns {void}
   */
  function pushCustomValidity(name) {
    // Anything but a NATIVE finding is pushed — a rule's, and a server's
    // (F123), because a field the server rejected is a field this engine calls
    // invalid and `checkValidity()` must agree. Pushing a native message back
    // would instead make `customError` true for a constraint the platform
    // already reported, so the engine would be agreeing with itself in a second
    // slot.
    // No `?? []`: `derive` emits an entry for every field, so the lookup cannot
    // miss — and this project deletes dead guards rather than mock-covering them.
    const blocking = current.fields[name].find(
      (finding) => finding.severity === 'error' && finding.source !== 'native',
    );
    for (const control of fieldSet[name]) {
      const element = /** @type {any} */ (control);
      if (typeof element.setCustomValidity !== 'function') continue;
      element.setCustomValidity(blocking === undefined ? '' : blocking.message);
    }
  }

  /**
   * Run one rule, honouring the F118 race rules.
   *
   * @param {{ id: object, owner: string | null, label: string, validate: RuleFn, dependsOn: Set<string> }} rule
   * @returns {Promise<void>}
   */
  async function runRule(rule) {
    // The losing execution is aborted, not merely ignored: a rule that asked a
    // server should stop asking.
    inFlight.get(rule.id)?.controller.abort();

    const controller = controllerFor(form.element);
    const token = {};
    inFlight.set(rule.id, { token, controller });

    const values = form.getValues();
    /** @type {ValidationView} */
    const view = Object.freeze({ name: rule.owner, values: Object.freeze(values) });
    const value = rule.owner === null ? undefined : values[rule.owner];

    /** @type {Finding | null} */
    let finding;
    /** @type {{ thrown: unknown } | null} */
    let failed = null;
    /** @type {RuleOutcome} */
    let outcome;
    try {
      outcome = await rule.validate(value, view, controller.signal);
    } catch (failure) {
      failed = { thrown: failure };
    }

    if (failed !== null) {
      // A rule that threw could not decide, and "could not decide" is not
      // "fine": treating it as a pass would let the value through on a network
      // blip. It fails closed, and carries the real error as `cause` so the
      // developer sees the bug rather than a mystery message. A caller who wants
      // a transient failure ignored catches it inside their own rule.
      finding = {
        message: failed.thrown instanceof Error ? failed.thrown.message : String(failed.thrown),
        severity: 'error',
        source: 'rule',
        cause: failed.thrown,
      };
    } else {
      // Deliberately OUTSIDE the catch above: a rule that *threw* is an
      // operational failure and fails closed, while a rule that *returned
      // nonsense* is a programming error and throws — the ADR-0047 boundary,
      // `EGL_*`-free `TypeError`s for what the programmer got wrong. Turning a
      // malformed finding into a finding would hide the bug behind a message the
      // user cannot act on.
      finding = findingFrom(outcome, rule.label);
    }

    // Identity, not `signal.aborted`: an abort cannot un-resolve a promise that
    // already settled in a microtask, so this is the check that actually keeps a
    // stale answer out (F118, the F89 discipline).
    const live = inFlight.get(rule.id);
    if (destroyed || live === undefined || live.token !== token) return;
    inFlight.delete(rule.id);
    ruleFindings.set(rule.id, finding);
  }

  /**
   * Run a set of rules and publish twice: once synchronously, so a native
   * failure and the cleared slots are visible before any async rule has settled,
   * and once when they have.
   *
   * The native state is read by the caller, not here, because `blockedByNative`
   * has to see it before this decides what to run.
   *
   * @param {readonly string[]} names - Fields this run covers.
   * @param {readonly object[]} skip - Rule ids to leave alone (native blocked them).
   * @param {ReturnType<typeof normaliseRule>[]} run
   * @returns {Promise<ValidationResult>}
   */
  async function execute(names, skip, run) {
    for (const name of names) {
      validated.add(name);
      // A re-validated field drops what was said about it from outside: a
      // server's complaint about a value describes the value it was sent, and
      // keeping it past the next look would leave the user staring at an error
      // for input they have already corrected.
      externalByField.delete(name);
    }
    const skipped = new Set(skip);
    for (const rule of run) {
      if (skipped.has(rule.id)) ruleFindings.set(rule.id, null);
    }
    publish();

    await Promise.all(run.filter((rule) => !skipped.has(rule.id)).map((rule) => runRule(rule)));
    if (destroyed) return current;

    publish();
    for (const name of names) pushCustomValidity(name);
    return current;
  }

  /**
   * The rules a field's validation must re-run: its own, plus every rule that
   * declared it. Nothing else — which is the whole point of `dependsOn`.
   *
   * @param {string} name
   * @returns {ReturnType<typeof normaliseRule>[]}
   */
  function rulesFor(name) {
    return ruleList.filter((rule) => rule.owner === name || rule.dependsOn.has(name));
  }

  /**
   * Rule ids to skip because the platform already refused the value: asking a
   * server about a field the browser calls empty is noise.
   *
   * @param {readonly string[]} names
   * @param {ReturnType<typeof normaliseRule>[]} run
   * @returns {object[]}
   */
  function blockedByNative(names, run) {
    const blocked = new Set(names.filter((name) => nativeFindings.get(name) !== null));
    return run
      .filter((rule) => rule.owner !== null && blocked.has(rule.owner))
      .map((rule) => rule.id);
  }

  /** @type {ValidatorInstance} */
  const instance = {
    form,

    async validate() {
      assertAlive(destroyed, api, 'validate');
      const names = Object.keys(fieldSet);
      // The form-level external findings go with a FULL run and not with
      // `validateField`: they belong to the submission as a whole, and one field
      // being looked at again says nothing about them.
      externalAtForm = [];
      for (const name of names) nativeFindings.set(name, readNative(name));
      return execute(names, blockedByNative(names, ruleList), ruleList);
    },

    async validateField(name) {
      assertAlive(destroyed, api, 'validateField');
      if (typeof name !== 'string' || !isField(name)) {
        throw new TypeError(`${api}: validateField names no such field '${String(name)}'`);
      }
      nativeFindings.set(name, readNative(name));
      const run = rulesFor(name);
      return execute([name], blockedByNative([name], run), run);
    },

    applyFindings(findings) {
      assertAlive(destroyed, api, 'applyFindings');
      assertPlainObject(findings, 'findings');
      const { fields = {}, form: atForm, ...unknown } = findings;
      assertNoUnknownOptions(unknown, api, 'applyFindings key');
      assertPlainObject(fields, 'findings.fields');

      // Everything is validated and normalised BEFORE anything is written: a
      // malformed entry half-way through a map would otherwise leave the form
      // wearing some of a server's answer and none of the rest.
      /** @type {Array<[string, Finding[]]>} */
      const incoming = [];
      for (const [name, value] of Object.entries(fields)) {
        if (!isField(name)) {
          throw new TypeError(`${api}: applyFindings names no such field '${name}'`);
        }
        incoming.push([name, externalFindings(value, `findings.fields.${name}`)]);
      }
      const incomingAtForm =
        atForm === undefined ? null : externalFindings(atForm, 'findings.form');

      for (const [name, list] of incoming) {
        if (list.length === 0) externalByField.delete(name);
        else externalByField.set(name, Object.freeze(list));
        // A field a server judged HAS been judged, so it counts as validated:
        // otherwise "no findings" and "not asked yet" would collapse for exactly
        // the field the user is being asked to fix.
        validated.add(name);
      }
      if (incomingAtForm !== null) externalAtForm = Object.freeze(incomingAtForm);

      publish();
      for (const [name] of incoming) pushCustomValidity(name);
      return current;
    },

    result() {
      return current;
    },

    clear() {
      assertAlive(destroyed, api, 'clear');
      for (const { controller } of inFlight.values()) controller.abort();
      inFlight.clear();
      ruleFindings.clear();
      nativeFindings.clear();
      externalByField.clear();
      externalAtForm = [];
      validated.clear();
      for (const name of Object.keys(fieldSet)) {
        for (const control of fieldSet[name]) {
          const element = /** @type {any} */ (control);
          if (typeof element.setCustomValidity === 'function') element.setCustomValidity('');
        }
      }
      publish();
    },

    on(event, handler) {
      assertAlive(destroyed, api, 'on');
      if (event !== 'change') {
        throw new TypeError(`${api}: on() takes 'change' — got '${String(event)}'`);
      }
      if (typeof handler !== 'function') {
        throw new TypeError(`${api}: on() handler must be a function`);
      }
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const timer of debounces.values()) clearTimeout(timer);
      debounces.clear();
      for (const { controller } of inFlight.values()) controller.abort();
      inFlight.clear();
      listeners.clear();
      domController?.abort();
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    },
  };

  /** @returns {void} */
  function onAbort() {
    instance.destroy();
  }

  /**
   * The field a DOM event belongs to, or `null` when it belongs to none.
   *
   * @param {unknown} target
   * @returns {string | null}
   */
  function fieldOf(target) {
    for (const [name, controls] of Object.entries(fieldSet)) {
      if (controls.some((control) => control === target)) return name;
    }
    return null;
  }

  /** @type {AbortController | undefined} */
  let domController;
  if (validateOn.length > 0) {
    domController = controllerFor(form.element);
    /** @param {Event} event */
    const trigger = (event) => {
      const name = fieldOf(event.target);
      if (name === null) return;
      const existing = debounces.get(name);
      if (existing !== undefined) clearTimeout(existing);
      if (debounceMs === 0) {
        void instance.validateField(name);
        return;
      }
      debounces.set(
        name,
        setTimeout(() => {
          debounces.delete(name);
          if (!destroyed) void instance.validateField(name);
        }, debounceMs),
      );
    };
    const listenerOptions = { signal: domController.signal };
    if (validateOn.includes('change')) {
      form.element.addEventListener('change', trigger, listenerOptions);
    }
    if (validateOn.includes('blur')) {
      // `focusout` rather than `blur`: the two fire at the same moment and only
      // one of them bubbles, so this is the version a single listener on the root
      // can actually hear.
      form.element.addEventListener('focusout', trigger, listenerOptions);
    }
  }

  if (signal !== undefined) {
    if (signal.aborted) instance.destroy();
    else signal.addEventListener('abort', onAbort);
  }

  return instance;
}
