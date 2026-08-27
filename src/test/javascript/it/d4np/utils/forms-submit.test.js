// @vitest-environment jsdom
// Example tests (roadmap 21.4, spec 08 §2 items F122-F123 and §6, ADR-0080) for
// the submit lifecycle.
//
// Three things get the most attention, and they are the three §6 named. The
// **double-submit guard** is asserted by promise identity, because "one handler
// invocation" alone would also pass for an implementation that refuses the
// second call. **Disable-and-restore** is asserted to restore exactly what it
// disabled, including a control the page had already disabled itself — the
// classic off-by-one of this pattern. And F123 gets a **negative-path corpus**:
// a body whose message contains markup, whose field name matches nothing, whose
// field name looks like a selector, whose field name is `__proto__`, and whose
// shape is wrong entirely.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindFormFeedback,
  bindSubmit,
  createForm,
  createValidator,
} from '../../../../../main/javascript/it/d4np/utils/forms.js';
import { HttpError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

/** @type {Element} */
let root;

/**
 * @param {string} html
 * @param {string} [tag]
 * @returns {Element}
 */
function mount(html, tag = 'form') {
  document.body.innerHTML = `<${tag} id="root">${html}</${tag}>`;
  return /** @type {Element} */ (document.getElementById('root'));
}

/**
 * @param {Record<string, any>} [options] - `bindSubmit` options.
 * @param {Record<string, any>} [rules]
 */
function wire(options = {}, rules = {}) {
  const form = createForm(root);
  const validator = createValidator(form, { native: false, rules });
  const submitter = bindSubmit(validator, { handler: () => 'saved', ...options });
  return { form, validator, submitter };
}

/** A handler whose settlement the test controls. */
function deferred() {
  /** @type {(value?: unknown) => void} */
  let resolve = () => {};
  /** @type {(reason?: unknown) => void} */
  let reject = () => {};
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Wait until the lifecycle has actually reached its busy phase. A fixed number
 * of microtask turns would be a guess: validation is itself async, so how many
 * ticks separate `submit()` from `mark()` is an implementation detail no test
 * should encode.
 *
 * @returns {Promise<void>}
 */
async function untilBusy() {
  await vi.waitFor(() => expect(root.getAttribute('aria-busy')).toBe('true'));
}

beforeEach(() => {
  root = mount(`
    <input name="name" value="Ada" />
    <input name="email" value="a@b.c" />
    <button type="submit">Save</button>
  `);
});

describe('F122 — one call, and the whole sequence', () => {
  it('validates first and refuses on an error, without calling the handler', async () => {
    const handler = vi.fn();
    const { submitter } = wire({ handler }, { name: () => 'Too plain' });

    const outcome = await submitter.submit();

    expect(outcome.status).toBe('blocked');
    expect(outcome.validation.valid).toBe(false);
    expect(outcome.validation.fields.name[0].message).toBe('Too plain');
    expect(handler).not.toHaveBeenCalled();
  });

  it('is not blocked by a warning — only `error` blocks (F117)', async () => {
    const { submitter } = wire(
      {},
      { name: () => ({ message: 'Consider a surname', severity: 'warning' }) },
    );
    const outcome = await submitter.submit();
    expect(outcome.status).toBe('succeeded');
    expect(outcome.handlerResult).toBe('saved');
  });

  it('hands the handler the form, the values, the validation and a signal', async () => {
    /** @type {any} */
    let seen;
    const { form, submitter } = wire({
      handler: (context) => {
        seen = context;
        return 42;
      },
    });

    const outcome = await submitter.submit();

    expect(outcome).toEqual({
      status: 'succeeded',
      validation: expect.objectContaining({ valid: true }),
      handlerResult: 42,
    });
    expect(seen.form).toBe(form);
    expect(seen.values).toEqual({ name: 'Ada', email: 'a@b.c' });
    expect(seen.validation.validated).toEqual(['name', 'email']);
    expect(seen.signal.aborted).toBe(false);
    // Frozen, because a handler that mutated the context would be editing the
    // record of why the submission was allowed.
    expect(Object.isFrozen(seen)).toBe(true);
    expect(Object.isFrozen(outcome)).toBe(true);
  });

  it('marks the form busy for exactly the flight, and leaves no trace', async () => {
    const gate = deferred();
    const { submitter } = wire({ handler: () => gate.promise, busyClass: 'is-busy opacity-50' });

    const running = submitter.submit();
    await untilBusy();
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.classList.contains('is-busy')).toBe(true);
    expect(root.classList.contains('opacity-50')).toBe(true);

    gate.resolve('ok');
    await running;

    expect(root.hasAttribute('aria-busy')).toBe(false);
    // Not `class=""`: `classList.add` then `remove` leaves the attribute behind,
    // and a lifecycle that leaves a trace has restored nothing (ADR-0079).
    expect(root.hasAttribute('class')).toBe(false);
  });

  it('restores an aria-busy the page already had, rather than removing it', async () => {
    root.setAttribute('aria-busy', 'false');
    const { submitter } = wire();
    await submitter.submit();
    expect(root.getAttribute('aria-busy')).toBe('false');
  });

  it('keeps a class the page already had', async () => {
    root.className = 'is-busy';
    const { submitter } = wire({ busyClass: 'is-busy' });
    await submitter.submit();
    expect(root.className).toBe('is-busy');
  });

  it('disables what was nominated and restores exactly that', async () => {
    const email = /** @type {any} */ (root.querySelector('[name=email]'));
    email.disabled = true; // the page's own doing, and not this lifecycle's to undo
    const gate = deferred();
    const { submitter } = wire({
      handler: () => gate.promise,
      disable: ['[type=submit]', '[name=email]', root.querySelector('[name=name]')],
    });

    const running = submitter.submit();
    await untilBusy();
    const button = /** @type {any} */ (root.querySelector('button'));
    expect(button.disabled).toBe(true);
    expect(/** @type {any} */ (root.querySelector('[name=name]')).disabled).toBe(true);

    gate.resolve();
    await running;

    expect(button.disabled).toBe(false);
    expect(/** @type {any} */ (root.querySelector('[name=name]')).disabled).toBe(false);
    // The off-by-one: this one was disabled before the submission and stays so.
    expect(email.disabled).toBe(true);
  });

  it('resolves the selectors on every submit, so later markup is covered', async () => {
    const { submitter } = wire({ disable: ['button'] });
    await submitter.submit();

    root.insertAdjacentHTML('beforeend', '<button id="second" type="button">Draft</button>');
    const gate = deferred();
    const late = bindSubmit(submitter.validator, {
      handler: () => gate.promise,
      disable: ['button'],
    });
    const running = late.submit();
    await untilBusy();
    expect(/** @type {any} */ (document.getElementById('second')).disabled).toBe(true);
    gate.resolve();
    await running;
    expect(/** @type {any} */ (document.getElementById('second')).disabled).toBe(false);
    late.destroy();
  });

  it('accepts a single element or a single selector, not only an array', async () => {
    const gate = deferred();
    const { submitter } = wire({ handler: () => gate.promise, disable: 'button' });
    const running = submitter.submit();
    await untilBusy();
    expect(/** @type {any} */ (root.querySelector('button')).disabled).toBe(true);
    gate.resolve();
    await running;
    expect(/** @type {any} */ (root.querySelector('button')).disabled).toBe(false);
  });

  it('disables a nominated element that has no `disabled` property, by attribute', async () => {
    // A `<div>` — a toolbar, a drop zone — has no `disabled` property, so both
    // halves of this have to read and write the attribute instead. Asymmetry
    // here is what makes "restore exactly what you disabled" quietly wrong.
    root.insertAdjacentHTML('beforeend', '<div id="zone"></div><div id="already" disabled></div>');
    const gate = deferred();
    const { submitter } = wire({ handler: () => gate.promise, disable: ['#zone', '#already'] });

    const running = submitter.submit();
    await untilBusy();
    expect(/** @type {Element} */ (document.getElementById('zone')).hasAttribute('disabled')).toBe(
      true,
    );

    gate.resolve();
    await running;

    expect(/** @type {Element} */ (document.getElementById('zone')).hasAttribute('disabled')).toBe(
      false,
    );
    expect(
      /** @type {Element} */ (document.getElementById('already')).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('disables nothing for a selector that matches nothing', async () => {
    const { submitter } = wire({ disable: '.nope' });
    await expect(submitter.submit()).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('restores the busy state when the handler rejects', async () => {
    const failure = new Error('offline');
    const { submitter } = wire({
      handler: () => Promise.reject(failure),
      disable: 'button',
      busyClass: 'is-busy',
    });

    await expect(submitter.submit()).rejects.toBe(failure);

    expect(/** @type {any} */ (root.querySelector('button')).disabled).toBe(false);
    expect(root.hasAttribute('aria-busy')).toBe(false);
    expect(root.hasAttribute('class')).toBe(false);
  });

  it('reports through an injected feedback binding on a blocked submit', async () => {
    const feedback = { report: vi.fn() };
    const { submitter } = wire({ feedback }, { name: () => 'no' });
    await submitter.submit();
    expect(feedback.report).toHaveBeenCalledTimes(1);
  });

  it('does not report when there is nothing to report', async () => {
    const feedback = { report: vi.fn() };
    const { submitter } = wire({ feedback });
    await submitter.submit();
    expect(feedback.report).not.toHaveBeenCalled();
  });
});

describe('F122 — the double-submit guard is structural', () => {
  it('gives the second call the first call’s promise, not a second request', async () => {
    const gate = deferred();
    const handler = vi.fn(() => gate.promise);
    const { submitter } = wire({ handler });

    const first = submitter.submit();
    const second = submitter.submit();

    // Identity, not equality: two promises that both resolve to the same value
    // would still be two submissions.
    expect(second).toBe(first);
    expect(submitter.pending()).toBe(true);

    gate.resolve('once');
    await first;

    expect(handler).toHaveBeenCalledTimes(1);
    expect(submitter.pending()).toBe(false);
  });

  it('guards the validation half too — a second call during async rules waits', async () => {
    const gate = deferred();
    const handler = vi.fn();
    const { submitter } = wire({ handler }, { name: () => gate.promise });

    const first = submitter.submit();
    expect(submitter.submit()).toBe(first);

    gate.resolve('Still no');
    await first;
    expect(handler).not.toHaveBeenCalled();
  });

  it('starts a new submission once the previous one has settled', async () => {
    const handler = vi.fn(() => 'ok');
    const { submitter } = wire({ handler });

    const first = submitter.submit();
    await first;
    const second = submitter.submit();
    expect(second).not.toBe(first);
    await second;
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('clears the guard after a rejected submission', async () => {
    const handler = vi.fn(() => Promise.reject(new Error('nope')));
    const { submitter } = wire({ handler });

    await expect(submitter.submit()).rejects.toThrow('nope');
    expect(submitter.pending()).toBe(false);
    await expect(submitter.submit()).rejects.toThrow('nope');
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('F123 — a server’s errors land on fields, and the payload is untrusted', () => {
  /**
   * @param {unknown} body
   * @param {number} [status]
   */
  function rejecting(body, status = 422) {
    return new HttpError('Unprocessable Entity', { status, body });
  }

  it('maps the common {errors: {field: message}} shape onto the fields', async () => {
    const failure = rejecting({ errors: { email: 'Already registered' } });
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });

    await expect(submitter.submit()).rejects.toBe(failure);

    const result = validator.result();
    expect(result.valid).toBe(false);
    expect(result.fields.email).toEqual([
      { message: 'Already registered', severity: 'error', source: 'external' },
    ]);
    expect(result.fields.name).toEqual([]);
  });

  it('accepts several messages for one field', async () => {
    const failure = rejecting({ errors: { name: ['Too short', 'Reserved'] } });
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });
    await expect(submitter.submit()).rejects.toBe(failure);
    expect(validator.result().fields.name.map((finding) => finding.message)).toEqual([
      'Too short',
      'Reserved',
    ]);
  });

  it('maps a top-level message to the form rather than to a field', async () => {
    const failure = rejecting({ message: 'This record was changed by someone else' }, 409);
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });
    await expect(submitter.submit()).rejects.toBe(failure);
    expect(validator.result().form).toEqual([
      {
        message: 'This record was changed by someone else',
        severity: 'error',
        source: 'external',
      },
    ]);
  });

  it('puts the message on the page as text, markup and all', async () => {
    const payload = '<img src=x onerror="alert(1)">';
    const failure = rejecting({ errors: { name: payload } });
    const form = createForm(root);
    const validator = createValidator(form, { native: false });
    const feedback = bindFormFeedback(validator);
    const submitter = bindSubmit(validator, {
      feedback,
      handler: () => Promise.reject(failure),
    });

    await expect(submitter.submit()).rejects.toBe(failure);

    const node = /** @type {Element} */ (root.querySelector('[name=name]')?.nextElementSibling);
    expect(node.textContent).toBe(payload);
    expect(node.querySelector('img')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    submitter.destroy();
    feedback.destroy();
  });

  it('reports a field name that matches no control instead of dropping it', async () => {
    const failure = rejecting({ errors: { legacy_flag: 'No longer accepted' } });
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });

    await expect(submitter.submit()).rejects.toBe(failure);

    expect(validator.result().form).toEqual([
      {
        message: 'No longer accepted',
        severity: 'error',
        source: 'external',
        field: 'legacy_flag',
      },
    ]);
    expect(validator.result().valid).toBe(false);
  });

  it('never uses a server field name as a selector', async () => {
    // Matched against the resolved field set, so this reaches no
    // `querySelector` — it is simply a name the form does not have.
    const failure = rejecting({ errors: { 'input[name=name]': 'Injected' } });
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });

    await expect(submitter.submit()).rejects.toBe(failure);

    expect(validator.result().fields.name).toEqual([]);
    expect(validator.result().form[0].field).toBe('input[name=name]');
  });

  it('cannot reach Object.prototype through a `__proto__` field name', async () => {
    const body = JSON.parse('{"errors": {"__proto__": "hacked", "email": "Taken"}}');
    const failure = rejecting(body);
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });

    await expect(submitter.submit()).rejects.toBe(failure);

    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(/** @type {any} */ ({}).message).toBeUndefined();
    // And the finding is REPORTED, which is the other half of the same proof: a
    // map built by assignment would have set the object's prototype instead of a
    // key, and this complaint would have vanished (BUG-0004's lesson).
    expect(validator.result().form[0]).toMatchObject({ field: '__proto__' });
    expect(validator.result().fields.email[0].message).toBe('Taken');
  });

  it('drops a per-field value that is not a message, rather than rendering [object Object]', async () => {
    const failure = rejecting({ errors: { name: { nested: 'thing' }, email: [] } });
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });
    await expect(submitter.submit()).rejects.toBe(failure);
    expect(validator.result().fields.name).toEqual([]);
    expect(validator.result().fields.email).toEqual([]);
    expect(validator.result().form).toEqual([]);
  });

  it.each([
    ['no body at all', undefined],
    ['a string body', 'Internal Server Error'],
    ['an array body', ['nope']],
    ['a null body', null],
    ['errors that are an array', { errors: ['nope'] }],
    ['errors that are null', { errors: null }],
    ['an empty message', { message: '' }],
  ])('maps %s to nothing, and the rejection stands alone', async (_label, body) => {
    const failure = rejecting(body, 500);
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });

    await expect(submitter.submit()).rejects.toBe(failure);

    expect(validator.result().valid).toBe(true);
    expect(validator.result().form).toEqual([]);
  });

  it('maps a rejection that is not an HttpError to nothing', async () => {
    const failure = new TypeError('handler bug');
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });
    await expect(submitter.submit()).rejects.toBe(failure);
    expect(validator.result().form).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
  ])('survives a handler that rejects with %s rather than an error', async (_label, thrown) => {
    const { validator, submitter } = wire({ handler: () => Promise.reject(thrown) });

    // `rejects.toBe` refuses a falsy reason, and the reason is the point here:
    // whatever a handler throws comes back untouched, error or not.
    const caught = await submitter.submit().then(
      () => ({ resolved: true }),
      (reason) => ({ reason }),
    );

    expect(caught).toEqual({ reason: thrown });
    expect(validator.result().form).toEqual([]);
    expect(root.hasAttribute('aria-busy')).toBe(false);
  });

  it('keeps the rejection’s identity — status and body intact', async () => {
    const failure = rejecting({ errors: { email: 'Taken' } });
    const { submitter } = wire({ handler: () => Promise.reject(failure) });

    const caught = await submitter.submit().then(
      () => null,
      (thrown) => thrown,
    );

    expect(caught).toBe(failure);
    expect(caught.code).toBe('EGL_HTTP');
    expect(caught.status).toBe(422);
    expect(caught.body).toEqual({ errors: { email: 'Taken' } });
  });

  it('takes an injected mapper instead of the default one', async () => {
    const failure = { detail: [{ loc: ['body', 'name'], msg: 'Nope' }] };
    const mapError = vi.fn((thrown) => ({
      fields: Object.fromEntries(
        /** @type {any} */ (thrown).detail.map((/** @type {any} */ entry) => [
          entry.loc[1],
          { message: entry.msg, severity: 'warning' },
        ]),
      ),
    }));
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure), mapError });

    await expect(submitter.submit()).rejects.toBe(failure);

    expect(mapError).toHaveBeenCalledTimes(1);
    expect(mapError.mock.calls[0][1]).toMatchObject({ values: { name: 'Ada' } });
    expect(validator.result().fields.name).toEqual([
      { message: 'Nope', severity: 'warning', source: 'external' },
    ]);
    // A warning does not block, so the next submit is not stuck behind it.
    expect(validator.result().valid).toBe(true);
  });

  it('keeps the severity of an unmatched finding a mapper graded itself', async () => {
    const failure = new Error('legacy');
    const { validator, submitter } = wire({
      handler: () => Promise.reject(failure),
      mapError: () => ({
        fields: { legacy_flag: { message: 'Ignored from now on', severity: 'warning' } },
        form: 'Saved, with one field ignored',
      }),
    });

    await expect(submitter.submit()).rejects.toBe(failure);

    expect(validator.result().form).toEqual([
      { message: 'Saved, with one field ignored', severity: 'error', source: 'external' },
      {
        message: 'Ignored from now on',
        severity: 'warning',
        source: 'external',
        field: 'legacy_flag',
      },
    ]);
  });

  it('accepts a mapper that maps only fields, or only the form', async () => {
    const failure = new Error('x');
    const { validator, submitter } = wire({
      handler: () => Promise.reject(failure),
      mapError: () => ({ fields: { name: 'Rejected' }, form: null }),
    });
    await expect(submitter.submit()).rejects.toBe(failure);
    expect(validator.result().fields.name[0].message).toBe('Rejected');
    expect(validator.result().form).toEqual([]);
  });

  it('accepts a mapper that declines to map', async () => {
    const failure = new Error('nothing to say');
    const { validator, submitter } = wire({
      handler: () => Promise.reject(failure),
      mapError: () => null,
    });
    await expect(submitter.submit()).rejects.toBe(failure);
    expect(validator.result().form).toEqual([]);
  });

  it('refuses a mapper that produced nonsense, loudly (the ADR-0078 boundary)', async () => {
    const { submitter } = wire({
      handler: () => Promise.reject(new Error('x')),
      mapError: () => ({ fields: { name: 42 } }),
    });
    await expect(submitter.submit()).rejects.toThrow(
      /findings\.fields\.name must be a plain object/,
    );
    // And the form is not left busy by the mapper's bug.
    expect(root.hasAttribute('aria-busy')).toBe(false);
  });

  it('refuses an unknown key in a mapper’s result', async () => {
    const { submitter } = wire({
      handler: () => Promise.reject(new Error('x')),
      mapError: () => ({ feilds: {} }),
    });
    await expect(submitter.submit()).rejects.toThrow(
      "bindSubmit: unknown mapError result key 'feilds'",
    );
  });

  it('forgets a server finding when the field is validated again', async () => {
    const failure = rejecting({ errors: { email: 'Taken' } });
    const { validator, submitter } = wire({ handler: () => Promise.reject(failure) });
    await expect(submitter.submit()).rejects.toBe(failure);
    expect(validator.result().fields.email).toHaveLength(1);

    await validator.validateField('email');

    expect(validator.result().fields.email).toEqual([]);
    expect(validator.result().valid).toBe(true);
  });

  it('publishes the failed outcome to subscribers, which is the channel an interception has', async () => {
    const failure = rejecting({ errors: { email: 'Taken' } });
    /** @type {any[]} */
    const seen = [];
    const { submitter } = wire({ handler: () => Promise.reject(failure) });
    submitter.on('settle', (outcome) => seen.push(outcome));

    await expect(submitter.submit()).rejects.toBe(failure);

    expect(seen).toHaveLength(1);
    expect(seen[0].status).toBe('failed');
    expect(seen[0].failure).toBe(failure);
    // The findings the mapper just applied are in the outcome, not only on the page.
    expect(seen[0].validation.fields.email[0].message).toBe('Taken');
  });

  it('pushes a server error into the platform, so checkValidity() agrees (F119)', async () => {
    const failure = rejecting({ errors: { email: 'Taken' } });
    const { submitter } = wire({ handler: () => Promise.reject(failure) });
    await expect(submitter.submit()).rejects.toBe(failure);
    const email = /** @type {any} */ (root.querySelector('[name=email]'));
    expect(email.validationMessage).toBe('Taken');
    expect(email.checkValidity()).toBe(false);
  });
});

describe('the intercepted submit', () => {
  /** @returns {boolean} Whether the default was prevented. */
  function fireSubmit() {
    const event = new Event('submit', { bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('runs the lifecycle for the form’s own submit event, and prevents the default', async () => {
    const handler = vi.fn(() => 'ok');
    const { submitter } = wire({ handler });

    expect(fireSubmit()).toBe(true);
    expect(submitter.pending()).toBe(true);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  });

  it('consumes the rejection an intercepted submit has no caller for', async () => {
    // If this leaked as an unhandled rejection the run would fail:
    // `dangerouslyIgnoreUnhandledErrors` is false in vitest.config.js.
    /** @type {any[]} */
    const seen = [];
    const { submitter } = wire({ handler: () => Promise.reject(new Error('offline')) });
    submitter.on('settle', (outcome) => seen.push(outcome));

    fireSubmit();
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].status).toBe('failed');
    expect(submitter.pending()).toBe(false);
  });

  it('stops intercepting after destroy()', async () => {
    const handler = vi.fn();
    const { submitter } = wire({ handler });
    submitter.destroy();
    expect(fireSubmit()).toBe(false);
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not intercept a container that is not a form', async () => {
    root = mount('<input name="name" value="Ada" />', 'div');
    const handler = vi.fn();
    const { submitter } = wire({ handler });
    expect(fireSubmit()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    await expect(submitter.submit()).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('refuses intercept: true on a root that has no submit event', () => {
    root = mount('<input name="name" value="Ada" />', 'div');
    const form = createForm(root);
    const validator = createValidator(form, { native: false });
    expect(() => bindSubmit(validator, { handler: () => 1, intercept: true })).toThrow(
      /the root is a <div>/,
    );
  });

  it('can be switched off on a form root', () => {
    const handler = vi.fn();
    wire({ handler, intercept: false });
    expect(fireSubmit()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('the option contract (ADR-0047) and the lifecycle contract (ADR-0049)', () => {
  it('refuses a validator that is not one', () => {
    for (const value of [null, 'nope', {}, { validate: () => {} }]) {
      expect(() => bindSubmit(/** @type {any} */ (value), { handler: () => 1 })).toThrow(
        'bindSubmit: validator must be a createValidator instance',
      );
    }
  });

  it('refuses an unknown option key, naming it', () => {
    const validator = createValidator(createForm(root), { native: false });
    expect(() =>
      bindSubmit(validator, /** @type {any} */ ({ handler: () => 1, disabled: 'button' })),
    ).toThrow("bindSubmit: unknown option 'disabled'");
  });

  const ok = () => 1;

  it.each([
    ['no options at all', undefined, /options.handler must be a function/],
    ['options that are not an object', 'nope', /options must be a plain object/],
    ['options that are an array', [], /options must be a plain object/],
    ['a missing handler', {}, /options.handler must be a function/],
    ['a handler that is not a function', { handler: 'save' }, /options.handler must be a/],
    [
      'a disable entry that is neither',
      { handler: ok, disable: [7] },
      /options.disable takes elements/,
    ],
    ['an empty selector', { handler: ok, disable: '' }, /options.disable takes elements/],
    ['a non-string busyClass', { handler: ok, busyClass: 1 }, /options.busyClass must be a string/],
    ['a non-function mapError', { handler: ok, mapError: {} }, /options.mapError must be a/],
    [
      'a feedback that is not one',
      { handler: ok, feedback: {} },
      /options.feedback must be a bindFormFeedback/,
    ],
    [
      'a non-boolean intercept',
      { handler: ok, intercept: 'yes' },
      /options.intercept must be a boolean/,
    ],
    ['a signal that is not one', { handler: ok, signal: {} }, /options.signal must be an/],
  ])('refuses %s', (_label, options, message) => {
    const validator = createValidator(createForm(root), { native: false });
    expect(() => bindSubmit(validator, /** @type {any} */ (options))).toThrow(message);
  });

  it('throws on a command after destroy() and answers a query', () => {
    const { submitter } = wire();
    submitter.destroy();

    expect(() => submitter.submit()).toThrow('bindSubmit: submit() was called after destroy()');
    expect(() => submitter.on('settle', () => {})).toThrow(
      'bindSubmit: on() was called after destroy()',
    );
    expect(submitter.pending()).toBe(false);
    expect(submitter.element).toBe(root);
    expect(() => submitter.destroy()).not.toThrow();
  });

  it('refuses an event it does not have and a handler that is not a function', () => {
    const { submitter } = wire();
    expect(() => submitter.on(/** @type {any} */ ('change'), () => {})).toThrow(
      "bindSubmit: on() takes 'settle' — got 'change'",
    );
    expect(() => submitter.on('settle', /** @type {any} */ (null))).toThrow(
      'bindSubmit: on() handler must be a function',
    );
  });

  it('unsubscribes idempotently, and a subscriber that unsubscribes mid-dispatch is safe', async () => {
    const { submitter } = wire();
    const first = vi.fn();
    const off = submitter.on('settle', () => {
      off();
      offSecond();
    });
    const offSecond = submitter.on('settle', first);

    await submitter.submit();
    expect(first).toHaveBeenCalledTimes(1);
    off();

    await submitter.submit();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('destroys on an aborted signal, before or after construction', async () => {
    const controller = new AbortController();
    const { submitter } = wire({ signal: controller.signal });
    controller.abort();
    expect(() => submitter.submit()).toThrow(/after destroy/);

    const already = new AbortController();
    already.abort();
    const { submitter: second } = wire({ signal: already.signal });
    expect(() => second.submit()).toThrow(/after destroy/);
  });

  it('aborts the handler’s signal and restores the form when destroyed mid-flight', async () => {
    const gate = deferred();
    /** @type {any} */
    let context;
    const { submitter } = wire({
      disable: 'button',
      busyClass: 'is-busy',
      handler: (given) => {
        context = given;
        return gate.promise;
      },
    });

    const running = submitter.submit();
    await untilBusy();
    expect(/** @type {any} */ (root.querySelector('button')).disabled).toBe(true);

    submitter.destroy();

    expect(context.signal.aborted).toBe(true);
    expect(/** @type {any} */ (root.querySelector('button')).disabled).toBe(false);
    expect(root.hasAttribute('aria-busy')).toBe(false);

    gate.reject(new Error('aborted'));
    await expect(running).rejects.toThrow('aborted');
  });
});

describe('NFR-41 — two forms on one page observe nothing of each other', () => {
  it('keeps in-flight state, findings and interception separate', async () => {
    document.body.innerHTML = `
      <form id="filter"><input name="q" value="ada" /></form>
      <form id="edit"><input name="name" value="Ada" /></form>
    `;
    const filterRoot = /** @type {Element} */ (document.getElementById('filter'));
    const editRoot = /** @type {Element} */ (document.getElementById('edit'));

    const filterValidator = createValidator(createForm(filterRoot), { native: false });
    const editValidator = createValidator(createForm(editRoot), { native: false });
    const gate = deferred();
    const filterHandler = vi.fn(() => gate.promise);
    const editHandler = vi.fn(() => 'saved');
    const filter = bindSubmit(filterValidator, { handler: filterHandler });
    const edit = bindSubmit(editValidator, { handler: editHandler });

    const running = filter.submit();
    await Promise.resolve();
    expect(filter.pending()).toBe(true);
    expect(edit.pending()).toBe(false);

    await edit.submit();
    expect(editHandler).toHaveBeenCalledTimes(1);
    expect(filterHandler).toHaveBeenCalledTimes(1);

    // One teardown leaves the other's interception attached.
    filter.destroy();
    editRoot.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(editHandler).toHaveBeenCalledTimes(2));

    gate.resolve();
    await running;
    edit.destroy();
  });
});

describe('applyFindings — findings the engine did not compute (the 21.2 surface F123 needed)', () => {
  it('folds a message under a field and marks it validated', () => {
    const validator = createValidator(createForm(root), { native: false });
    const result = validator.applyFindings({ fields: { name: 'From somewhere else' } });

    expect(result.fields.name).toEqual([
      { message: 'From somewhere else', severity: 'error', source: 'external' },
    ]);
    expect(result.validated).toEqual(['name']);
    expect(result.valid).toBe(false);
  });

  it('takes a string, a finding, or an array of either', () => {
    const validator = createValidator(createForm(root), { native: false });
    const result = validator.applyFindings({
      fields: {
        name: ['one', { message: 'two', severity: 'info' }],
        email: { message: 'three', severity: 'warning', field: 'kept' },
      },
      form: 'and one for the form',
    });

    expect(result.fields.name.map((finding) => finding.severity)).toEqual(['error', 'info']);
    expect(result.fields.email[0]).toEqual({
      message: 'three',
      severity: 'warning',
      source: 'external',
      field: 'kept',
    });
    expect(result.form[0].message).toBe('and one for the form');
  });

  it('clears a field by naming it with nothing', () => {
    const validator = createValidator(createForm(root), { native: false });
    validator.applyFindings({ fields: { name: 'gone in a moment' } });
    const result = validator.applyFindings({ fields: { name: null } });
    expect(result.fields.name).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('notifies subscribers, so a bound renderer paints without being asked', () => {
    const validator = createValidator(createForm(root), { native: false });
    const seen = vi.fn();
    validator.on('change', seen);
    validator.applyFindings({ form: 'something happened' });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].form[0].message).toBe('something happened');
  });

  it('refuses a field the form does not have, and applies none of the batch', () => {
    const validator = createValidator(createForm(root), { native: false });
    expect(() => validator.applyFindings({ fields: { name: 'valid', nope: 'invalid' } })).toThrow(
      "createValidator: applyFindings names no such field 'nope'",
    );
    expect(validator.result().fields.name).toEqual([]);
  });

  it('refuses a malformed batch before writing any of it', () => {
    const validator = createValidator(createForm(root), { native: false });
    expect(() =>
      validator.applyFindings({ fields: { name: 'valid', email: { severity: 'error' } } }),
    ).toThrow(/findings.fields.email has a finding with no message/);
    expect(validator.result().fields.name).toEqual([]);
  });

  it.each([
    ['a non-object', 'nope', /findings must be a plain object/],
    ['an unknown key', { feilds: {} }, /unknown applyFindings key 'feilds'/],
    ['non-object fields', { fields: [] }, /findings.fields must be a plain object/],
    [
      'an unknown finding property',
      { form: { message: 'x', level: 1 } },
      /unknown finding property 'level'/,
    ],
    ['a bad severity', { form: { message: 'x', severity: 'fatal' } }, /severity 'fatal'/],
    ['a non-string field name', { form: { message: 'x', field: 7 } }, /non-string field name/],
  ])('refuses %s', (_label, findings, message) => {
    const validator = createValidator(createForm(root), { native: false });
    expect(() => validator.applyFindings(/** @type {any} */ (findings))).toThrow(message);
  });

  it('is a command: it throws after destroy()', () => {
    const validator = createValidator(createForm(root), { native: false });
    validator.destroy();
    expect(() => validator.applyFindings({ form: 'too late' })).toThrow(
      'createValidator: applyFindings() was called after destroy()',
    );
  });

  it('is forgotten by clear(), like every other finding', () => {
    const validator = createValidator(createForm(root), { native: false });
    validator.applyFindings({ fields: { name: 'x' }, form: 'y' });
    validator.clear();
    expect(validator.result()).toMatchObject({ valid: true, validated: [], form: [] });
    expect(validator.result().fields.name).toEqual([]);
  });

  it('survives a full validate(), which drops it — the form was asked again', async () => {
    const validator = createValidator(createForm(root), { native: false });
    validator.applyFindings({ fields: { name: 'stale' }, form: 'also stale' });
    const result = await validator.validate();
    expect(result.fields.name).toEqual([]);
    expect(result.form).toEqual([]);
  });

  it('is not dropped by validating an unrelated field', async () => {
    const validator = createValidator(createForm(root), { native: false });
    validator.applyFindings({ fields: { name: 'kept' }, form: 'kept too' });
    await validator.validateField('email');
    expect(validator.result().fields.name).toHaveLength(1);
    expect(validator.result().form).toHaveLength(1);
  });

  it('renders after a rule finding, in the order the layers ran', async () => {
    const validator = createValidator(createForm(root), {
      native: false,
      rules: { name: () => ({ message: 'from a rule', severity: 'warning' }) },
    });
    await validator.validate();
    const result = validator.applyFindings({ fields: { name: 'from outside' } });
    expect(result.fields.name.map((finding) => finding.source)).toEqual(['rule', 'external']);
  });
});
