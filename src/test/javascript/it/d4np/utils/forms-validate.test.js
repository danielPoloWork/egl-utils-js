// @vitest-environment jsdom
// Example tests (roadmap 21.2, spec 08 §2 items F116-F119 and §6, ADR-0078) for
// the validation engine.
//
// The races get the most attention, deliberately. Rules and severities are
// straightforward and would pass on a first draft; "a stale async answer never
// overwrites a newer one" is the clause that is wrong in most hand-rolled
// validators, and it is only observable by controlling settlement order.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createForm, createValidator } from '../../../../../main/javascript/it/d4np/utils/forms.js';

/** @type {Element} */
let root;

/**
 * @param {string} html
 * @returns {Element}
 */
function mount(html) {
  document.body.innerHTML = `<form id="root">${html}</form>`;
  return /** @type {Element} */ (document.getElementById('root'));
}

/**
 * A promise the test settles by hand — the only way to make two async rules
 * finish in the opposite order to the one they started in.
 *
 * @template T
 * @returns {{ promise: Promise<T>, resolve: (value: T) => void, reject: (reason: unknown) => void }}
 */
function deferred() {
  /** @type {any} */
  let resolve;
  /** @type {any} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  root = mount(`
    <input name="name" value="Ada" />
    <input name="start" type="number" value="1" />
    <input name="end" type="number" value="2" />
  `);
});

describe('F116 — rules are functions', () => {
  it('reports nothing when every rule passes', async () => {
    const form = createForm(root);
    const validator = createValidator(form, { rules: { name: () => undefined } });
    const result = await validator.validate();
    expect(result.valid).toBe(true);
    expect(result.fields.name).toEqual([]);
    expect(result.validated).toEqual(['name', 'start', 'end']);
  });

  it('accepts a bare string as the common case', async () => {
    const form = createForm(root);
    const validator = createValidator(form, { rules: { name: () => 'Too plain' } });
    const { fields, valid } = await validator.validate();
    expect(valid).toBe(false);
    expect(fields.name).toEqual([{ message: 'Too plain', severity: 'error', source: 'rule' }]);
  });

  it('passes the value, the whole view and a signal', async () => {
    const form = createForm(root);
    const seen = vi.fn(() => undefined);
    createValidator(form, { rules: { name: seen } });
    await createValidator(form, { rules: { name: seen } }).validateField('name');

    const [value, view, signal] = seen.mock.calls[0];
    expect(value).toBe('Ada');
    expect(view).toEqual({ name: 'name', values: { name: 'Ada', start: 1, end: 2 } });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(Object.isFrozen(view)).toBe(true);
  });

  it('treats an empty string as "fine", not as a message', async () => {
    const form = createForm(root);
    const { valid, fields } = await createValidator(form, {
      rules: { name: () => '' },
    }).validate();
    expect(valid).toBe(true);
    expect(fields.name).toEqual([]);
  });

  it('runs several rules on one field, in order', async () => {
    const form = createForm(root);
    const validator = createValidator(form, {
      rules: { name: [() => 'first', () => ({ message: 'second', severity: 'info' })] },
    });
    const { fields } = await validator.validate();
    expect(fields.name.map((f) => f.message)).toEqual(['first', 'second']);
  });

  it('carries form-level findings in their own bucket', async () => {
    const form = createForm(root);
    const validator = createValidator(form, {
      formRules: (value, view) => (view.values.name === '' ? 'Tell us something' : undefined),
    });
    expect((await validator.validate()).form).toEqual([]);

    form.setValues({ name: '' });
    const { form: findings, valid } = await validator.validate();
    expect(findings.map((f) => f.message)).toEqual(['Tell us something']);
    expect(valid).toBe(false);
  });

  it('rejects a malformed rule or option', () => {
    const form = createForm(root);
    expect(() => createValidator(/** @type {any} */ ({}))).toThrow(/must be a createForm instance/);
    expect(() => createValidator(form, { rules: { ghost: () => undefined } })).toThrow(
      /options\.rules names no such field 'ghost'/,
    );
    expect(() => createValidator(form, { rules: { name: /** @type {any} */ (7) } })).toThrow(
      /must be a plain object/,
    );
    expect(() =>
      createValidator(form, { rules: { name: /** @type {any} */ ({ check: () => undefined }) } }),
    ).toThrow(/unknown rule property 'check'/);
    expect(() =>
      createValidator(form, {
        rules: { name: { validate: () => undefined, dependsOn: ['ghost'] } },
      }),
    ).toThrow(/dependsOn names no such field 'ghost'/);
    expect(() => createValidator(form, /** @type {any} */ ({ validateOn: ['hover'] }))).toThrow(
      /validateOn contains 'hover'/,
    );
    expect(() => createValidator(form, /** @type {any} */ ({ debounceMs: -1 }))).toThrow(
      /debounceMs must be a non-negative/,
    );
    expect(() => createValidator(form, /** @type {any} */ ({ rulez: {} }))).toThrow(
      /unknown option 'rulez'/,
    );
    expect(() => createValidator(form, /** @type {any} */ ('nope'))).toThrow(
      /options must be a plain object/,
    );
    expect(() => createValidator(form, /** @type {any} */ ({ native: 'yes' }))).toThrow(
      /native must be a boolean/,
    );
    expect(() => createValidator(form, /** @type {any} */ ({ nativeMessage: 'x' }))).toThrow(
      /nativeMessage must be a function/,
    );
    expect(() => createValidator(form, /** @type {any} */ ({ validateOn: 'change' }))).toThrow(
      /validateOn must be an array/,
    );
    expect(() => createValidator(form, /** @type {any} */ ({ signal: {} }))).toThrow(
      /signal must be an AbortSignal/,
    );
    expect(() =>
      createValidator(form, {
        rules: { name: /** @type {any} */ ({ validate: () => undefined, dependsOn: 'start' }) },
      }),
    ).toThrow(/dependsOn must be an array/);
    expect(() =>
      createValidator(form, { rules: { name: /** @type {any} */ ({ validate: 7 }) } }),
    ).toThrow(/validate must be a function/);
  });

  it('rejects a finding whose shape is wrong, naming the rule', async () => {
    const form = createForm(root);
    await expect(
      createValidator(form, {
        rules: { name: () => /** @type {any} */ ({ severity: 'error' }) },
      }).validate(),
    ).rejects.toThrow(/rules\.name\[0\] returned a finding with no message/);

    await expect(
      createValidator(form, {
        rules: { name: () => /** @type {any} */ ({ message: 'x', severity: 'fatal' }) },
      }).validate(),
    ).rejects.toThrow(/returned severity 'fatal'/);
  });
});

describe('F117 — severity is a level', () => {
  it('reports warnings and info without blocking', async () => {
    const form = createForm(root);
    const validator = createValidator(form, {
      rules: {
        name: () => ({ message: 'Could be longer', severity: 'warning' }),
        start: () => ({ message: 'FYI', severity: 'info' }),
      },
    });
    const { valid, fields } = await validator.validate();
    expect(valid).toBe(true);
    expect(fields.name[0].severity).toBe('warning');
    expect(fields.start[0].severity).toBe('info');
  });

  it('blocks on an error anywhere, field or form', async () => {
    const form = createForm(root);
    expect((await createValidator(form, { rules: { name: () => 'no' } }).validate()).valid).toBe(
      false,
    );
    expect((await createValidator(form, { formRules: () => 'no' }).validate()).valid).toBe(false);
  });

  it('is a value, not only a boolean: result() answers between runs', async () => {
    const form = createForm(root);
    const validator = createValidator(form, { rules: { name: () => 'no' } });
    expect(validator.result().validated).toEqual([]);
    expect(validator.result().valid).toBe(true);

    await validator.validate();
    expect(validator.result().fields.name[0].message).toBe('no');

    validator.clear();
    expect(validator.result().validated).toEqual([]);
    expect(validator.result().fields.name).toEqual([]);
  });
});

describe('F118 — incremental', () => {
  it('runs a field’s own rules and the rules that declared it, and nothing else', async () => {
    const form = createForm(root);
    const nameRule = vi.fn(() => undefined);
    const startRule = vi.fn(() => undefined);
    const endRule = vi.fn(() => undefined);

    const validator = createValidator(form, {
      rules: {
        name: nameRule,
        start: startRule,
        end: { dependsOn: ['start'], validate: endRule },
      },
    });

    await validator.validateField('start');
    expect(startRule).toHaveBeenCalledTimes(1);
    expect(endRule).toHaveBeenCalledTimes(1); // declared `start`
    expect(nameRule).toHaveBeenCalledTimes(0); // declared nothing

    await validator.validateField('name');
    expect(nameRule).toHaveBeenCalledTimes(1);
    expect(startRule).toHaveBeenCalledTimes(1);
    expect(endRule).toHaveBeenCalledTimes(1);
  });

  it('leaves a form rule alone unless it declared the field', async () => {
    const form = createForm(root);
    const undeclared = vi.fn(() => undefined);
    const declared = vi.fn(() => undefined);
    const validator = createValidator(form, {
      formRules: [undeclared, { dependsOn: ['name'], validate: declared }],
    });

    await validator.validateField('name');
    expect(declared).toHaveBeenCalledTimes(1);
    expect(undeclared).toHaveBeenCalledTimes(0);

    await validator.validate();
    expect(undeclared).toHaveBeenCalledTimes(1);
  });

  it('refuses a field it does not have', async () => {
    const validator = createValidator(createForm(root));
    await expect(validator.validateField('ghost')).rejects.toThrow(
      /validateField names no such field 'ghost'/,
    );
  });

  it('marks only the fields it ran as validated', async () => {
    const validator = createValidator(createForm(root));
    await validator.validateField('name');
    expect(validator.result().validated).toEqual(['name']);
  });
});

describe('F118 — latest-wins, with settlement inverted on purpose', () => {
  it('lets the newer answer win even when the older one arrives last', async () => {
    const form = createForm(root);
    /** @type {ReturnType<typeof deferred>[]} */
    const gates = [];
    const validator = createValidator(form, {
      rules: {
        name: () => {
          const gate = deferred();
          gates.push(gate);
          return gate.promise;
        },
      },
    });

    const first = validator.validateField('name');
    const second = validator.validateField('name');
    expect(gates).toHaveLength(2);

    // Deliberately inverted: the SECOND rule settles first, then the FIRST.
    gates[1].resolve('second answer');
    gates[0].resolve('first answer');
    await Promise.all([first, second]);

    expect(validator.result().fields.name.map((f) => f.message)).toEqual(['second answer']);
  });

  it('aborts the losing execution rather than merely ignoring it', async () => {
    const form = createForm(root);
    /** @type {AbortSignal[]} */
    const signals = [];
    const gates = /** @type {ReturnType<typeof deferred>[]} */ ([]);
    const validator = createValidator(form, {
      rules: {
        name: (value, view, signal) => {
          signals.push(signal);
          const gate = deferred();
          gates.push(gate);
          return gate.promise;
        },
      },
    });

    const first = validator.validateField('name');
    const second = validator.validateField('name');
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    gates[0].resolve(undefined);
    gates[1].resolve(undefined);
    await Promise.all([first, second]);
  });

  it('publishes the synchronous state before an async rule settles', async () => {
    const form = createForm(root);
    const gate = deferred();
    const validator = createValidator(form, { rules: { name: () => gate.promise } });
    /** @type {number[]} */
    const seen = [];
    validator.on('change', (result) => seen.push(result.validated.length));

    const pending = validator.validateField('name');
    expect(seen).toEqual([1]); // published before the rule answered
    gate.resolve('late');
    await pending;
    expect(seen).toEqual([1, 1]);
    expect(validator.result().fields.name[0].message).toBe('late');
  });

  it('aborts an in-flight rule on clear(), and drops its answer', async () => {
    const form = createForm(root);
    /** @type {AbortSignal[]} */
    const signals = [];
    const gate = deferred();
    const validator = createValidator(form, {
      rules: {
        name: (value, view, signal) => {
          signals.push(signal);
          return gate.promise;
        },
      },
    });

    const pending = validator.validateField('name');
    validator.clear();
    expect(signals[0].aborted).toBe(true);
    gate.resolve('too late');
    await pending;
    expect(validator.result().fields.name).toEqual([]);
    expect(validator.result().validated).toEqual([]);
  });

  it('drops an answer that arrives after destroy', async () => {
    const form = createForm(root);
    const gate = deferred();
    const validator = createValidator(form, { rules: { name: () => gate.promise } });
    const pending = validator.validateField('name');
    validator.destroy();
    gate.resolve('too late');
    await pending;
    expect(validator.result().fields.name).toEqual([]);
  });

  it('treats a rule that throws as an error finding, failing closed', async () => {
    const form = createForm(root);
    const boom = new Error('the network is down');
    const validator = createValidator(form, {
      rules: {
        name: async () => {
          throw boom;
        },
      },
    });
    const { valid, fields } = await validator.validate();
    expect(valid).toBe(false);
    expect(fields.name[0]).toMatchObject({
      message: 'the network is down',
      severity: 'error',
      source: 'rule',
      cause: boom,
    });
  });
});

describe('F119 — the platform is read, not replaced', () => {
  it('folds a native failure into the same finding shape', async () => {
    const host = mount('<input name="email" type="email" value="nope" required />');
    const validator = createValidator(createForm(host));
    const { valid, fields } = await validator.validate();
    expect(valid).toBe(false);
    expect(fields.email[0]).toMatchObject({ source: 'native', constraint: 'typeMismatch' });
  });

  it('reports valueMissing for an empty required field', async () => {
    const host = mount('<input name="who" required />');
    const { fields } = await createValidator(createForm(host)).validate();
    expect(fields.who[0].constraint).toBe('valueMissing');
  });

  it('takes the caller’s wording when one is supplied', async () => {
    const host = mount('<input name="who" required />');
    const { fields } = await createValidator(createForm(host), {
      nativeMessage: ({ constraint }) => `custom: ${constraint}`,
    }).validate();
    expect(fields.who[0].message).toBe('custom: valueMissing');
  });

  it('can be switched off entirely', async () => {
    const host = mount('<input name="who" required />');
    const { valid, fields } = await createValidator(createForm(host), { native: false }).validate();
    expect(valid).toBe(true);
    expect(fields.who).toEqual([]);
  });

  it('does not ask a rule about a value the platform already refused', async () => {
    const host = mount('<input name="who" required />');
    const rule = vi.fn(() => 'never reached');
    const validator = createValidator(createForm(host), { rules: { who: rule } });
    const { fields } = await validator.validate();
    expect(rule).toHaveBeenCalledTimes(0);
    expect(fields.who).toHaveLength(1);
    expect(fields.who[0].source).toBe('native');
  });

  it('pushes a rule’s error into the platform, so checkValidity agrees', async () => {
    const host = mount('<input name="who" value="taken" />');
    const control = /** @type {any} */ (host.querySelector('input'));
    const validator = createValidator(createForm(host), {
      rules: { who: (value) => (value === 'taken' ? 'That one is taken' : undefined) },
    });

    expect(control.checkValidity()).toBe(true);
    await validator.validate();
    expect(control.validity.customError).toBe(true);
    expect(control.validationMessage).toBe('That one is taken');
    expect(control.checkValidity()).toBe(false);

    control.value = 'free';
    await validator.validate();
    expect(control.validity.customError).toBe(false);
    expect(control.checkValidity()).toBe(true);
  });

  it('never reads its own push-back as a native failure', async () => {
    const host = mount('<input name="who" value="taken" />');
    const validator = createValidator(createForm(host), {
      rules: { who: (value) => (value === 'taken' ? 'That one is taken' : undefined) },
    });
    await validator.validate();
    const again = await validator.validate();
    // One finding, from the rule — not a second one claiming `customError`.
    expect(again.fields.who).toHaveLength(1);
    expect(again.fields.who[0].source).toBe('rule');
  });

  it('leaves an element that has no constraint API alone', async () => {
    const host = mount('<div data-field="x">not a control</div><input name="who" value="ok" />');
    const form = createForm(host, { fields: { x: '[data-field=x]', who: '[name=who]' } });
    const validator = createValidator(form, { rules: { x: () => 'complains anyway' } });

    const { fields } = await validator.validate();
    // The rule still runs and its finding still lands; what does not happen is a
    // `setCustomValidity` call on something that has none.
    expect(fields.x[0].message).toBe('complains anyway');
    expect(() => validator.clear()).not.toThrow();
  });

  it('reports a rule that threw something that is not an Error', async () => {
    const form = createForm(root);
    const validator = createValidator(form, {
      rules: {
        name: () => {
          throw 'a bare string';
        },
      },
    });
    const { fields } = await validator.validate();
    expect(fields.name[0]).toMatchObject({ message: 'a bare string', cause: 'a bare string' });
  });

  it('clears its push-back on clear()', async () => {
    const host = mount('<input name="who" value="taken" />');
    const control = /** @type {any} */ (host.querySelector('input'));
    const validator = createValidator(createForm(host), { rules: { who: () => 'nope' } });
    await validator.validate();
    expect(control.checkValidity()).toBe(false);
    validator.clear();
    expect(control.checkValidity()).toBe(true);
  });
});

describe('automatic triggers', () => {
  it('validates a field on change, and only that field', async () => {
    const form = createForm(root);
    const nameRule = vi.fn(() => undefined);
    const startRule = vi.fn(() => undefined);
    createValidator(form, {
      validateOn: ['change'],
      rules: { name: nameRule, start: startRule },
    });

    root.querySelector('[name=name]')?.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(nameRule).toHaveBeenCalledTimes(1);
    expect(startRule).toHaveBeenCalledTimes(0);
  });

  it('validates on blur through focusout, which is the half that bubbles', async () => {
    const form = createForm(root);
    const rule = vi.fn(() => undefined);
    createValidator(form, { validateOn: ['blur'], rules: { name: rule } });

    root.querySelector('[name=name]')?.dispatchEvent(new Event('focusout', { bubbles: true }));
    await Promise.resolve();
    expect(rule).toHaveBeenCalledTimes(1);
  });

  it('debounces, so a burst of changes is one run', async () => {
    vi.useFakeTimers();
    try {
      const form = createForm(root);
      const rule = vi.fn(() => undefined);
      createValidator(form, { validateOn: ['change'], debounceMs: 50, rules: { name: rule } });
      const control = /** @type {Element} */ (root.querySelector('[name=name]'));

      for (let i = 0; i < 5; i += 1) {
        control.dispatchEvent(new Event('change', { bubbles: true }));
        vi.advanceTimersByTime(10);
      }
      expect(rule).toHaveBeenCalledTimes(0);
      vi.advanceTimersByTime(50);
      expect(rule).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores an event from something that is not a field', async () => {
    const host = mount('<input name="who" /><button type="button">x</button>');
    const rule = vi.fn(() => undefined);
    createValidator(createForm(host), { validateOn: ['change'], rules: { who: rule } });

    host.querySelector('button')?.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(rule).toHaveBeenCalledTimes(0);
  });

  it('detaches its listeners and cancels a pending debounce on destroy', async () => {
    vi.useFakeTimers();
    try {
      const form = createForm(root);
      const rule = vi.fn(() => undefined);
      const validator = createValidator(form, {
        validateOn: ['change'],
        debounceMs: 20,
        rules: { name: rule },
      });
      const control = /** @type {Element} */ (root.querySelector('[name=name]'));

      control.dispatchEvent(new Event('change', { bubbles: true }));
      validator.destroy();
      vi.advanceTimersByTime(100);
      control.dispatchEvent(new Event('change', { bubbles: true }));
      vi.advanceTimersByTime(100);
      expect(rule).toHaveBeenCalledTimes(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('subscription and lifecycle', () => {
  it('notifies subscribers and unsubscribes idempotently', async () => {
    const validator = createValidator(createForm(root), { rules: { name: () => 'no' } });
    const seen = vi.fn();
    const off = validator.on('change', seen);
    await validator.validate();
    expect(seen).toHaveBeenCalled();

    const count = seen.mock.calls.length;
    off();
    off();
    await validator.validate();
    expect(seen.mock.calls).toHaveLength(count);
  });

  it('refuses an event it does not have, and a handler that is not one', () => {
    const validator = createValidator(createForm(root));
    expect(() => validator.on(/** @type {any} */ ('changed'), () => {})).toThrow(
      /on\(\) takes 'change'/,
    );
    expect(() => validator.on('change', /** @type {any} */ (7))).toThrow(
      /handler must be a function/,
    );
  });

  it('commands throw after destroy and queries answer (ADR-0049)', async () => {
    const validator = createValidator(createForm(root), { rules: { name: () => 'no' } });
    await validator.validate();
    validator.destroy();

    await expect(validator.validate()).rejects.toThrow(
      /createValidator: validate\(\) was called after destroy\(\)/,
    );
    await expect(validator.validateField('name')).rejects.toThrow(/after destroy\(\)/);
    expect(() => validator.clear()).toThrow(/clear\(\) was called after destroy\(\)/);
    expect(() => validator.on('change', () => {})).toThrow(/on\(\) was called after destroy\(\)/);

    expect(validator.result().fields.name[0].message).toBe('no');
    expect(validator.form.element).toBe(root);
    expect(() => validator.destroy()).not.toThrow();
  });

  it('an aborted signal destroys it', async () => {
    const controller = new AbortController();
    const validator = createValidator(createForm(root), { signal: controller.signal });
    controller.abort();
    await expect(validator.validate()).rejects.toThrow(/after destroy\(\)/);

    const already = createValidator(createForm(root), { signal: AbortSignal.abort() });
    await expect(already.validate()).rejects.toThrow(/after destroy\(\)/);
  });
});

describe('NFR-41 — no module-level state', () => {
  it('two validators over two forms share nothing', async () => {
    document.body.innerHTML = `
      <form id="a"><input name="q" value="one" /></form>
      <form id="b"><input name="q" value="two" /></form>
    `;
    const a = createValidator(createForm(/** @type {Element} */ (document.getElementById('a'))), {
      rules: { q: () => 'a complains' },
    });
    const b = createValidator(createForm(/** @type {Element} */ (document.getElementById('b'))), {
      rules: { q: () => undefined },
    });

    await a.validate();
    await b.validate();
    expect(a.result().valid).toBe(false);
    expect(b.result().valid).toBe(true);

    a.destroy();
    expect((await b.validate()).valid).toBe(true);
  });
});
