/**
 * egl-utils-js/ui — promise-based dialogs (spec 07 §2 items F101–F103).
 *
 * The shape this replaces is a callback pair. `askUser(message, onOk, onCancel)`
 * reads acceptably once and stops composing immediately: two questions in
 * sequence nest, a question inside a `try` cannot use the `catch`, and the answer
 * arrives somewhere other than where it was asked for. A dialog is a question
 * with one answer arriving later, which is what a promise *is* — so this entry
 * hands one back and the caller writes `await`.
 *
 * **A dismissal is an answer, not an error (F102).** Escape, the backdrop, the
 * close control and the cancel button all **resolve** — `false` for a confirm,
 * `null` for a prompt. A rejection means the question could not be *asked*: no
 * document (`EGL_DOM_CONTRACT`) or no Bootstrap (`EGL_PEER_MISSING`). Those are
 * different facts, and collapsing them is how a `catch` ends up treating "the
 * user said no" as a failure and logging it as one.
 *
 * **Exactly one settlement, whatever races.** Every path — a button, Escape, the
 * backdrop, an aborted signal, `destroy()` while the dialog is open — goes
 * through one guarded `settle`, and the answer it carries is recorded *before*
 * the dialog starts closing. A promise cannot un-resolve, so this is a
 * correctness property rather than a tidiness one.
 *
 * **Composed, not reimplemented** (spec 07 §4). Open/close behaviour, the
 * backdrop, the animation and Escape are {@link bsModal}'s (F70); the buttons are
 * `bsButton` and `bsCloseButton` (F55/F56); focus is `focusTrap` and, through it,
 * `saveFocus` (F109). This module contributes the markup, the promise and the
 * settlement rules, and nothing else.
 *
 * @module egl-utils-js/ui
 */

import {
  appendContent,
  applyClasses,
  assertPlainObject,
  assertToken,
  bsButton,
  bsCloseButton,
  resolveDocument,
  uniqueId,
} from './bootstrap-elements.js';
import { bsModal } from './bootstrap-behaviors.js';
import { focusTrap } from './dom-a11y.js';
import { isAbortSignal } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @typedef {import('./bootstrap-elements.js').Content} Content
 * @typedef {import('./bootstrap-elements.js').ClassOption} ClassOption
 */

/**
 * @typedef {object} DialogLabels
 * @property {string} [confirm='OK'] - The affirming button.
 * @property {string} [cancel='Cancel'] - The dismissing button.
 * @property {string} [close='Close'] - Accessible name of the header's close
 *   control, which draws its own glyph in CSS and so has no visible text to read
 *   (the ADR-0038 rule for `.btn-close`).
 */

/**
 * The options every dialog takes — on the manager as defaults, on each call as
 * overrides. Documented once and referenced by all three methods, because three
 * copies of thirteen properties is three chances to let one drift.
 *
 * @typedef {object} DialogOptions
 * @property {DialogLabels} [labels] - Merged over the defaults key by key, so
 *   naming one button does not blank the others.
 * @property {string} [variant='primary'] - Bootstrap variant for the affirming
 *   button. `'danger'` is the one worth setting: a destructive confirm that looks
 *   like an ordinary one is a click nobody meant.
 * @property {string} [size] - `modal-<size>` on the dialog — `'sm'`, `'lg'`,
 *   `'xl'`.
 * @property {boolean} [centered=true] - Vertically centred. Defaulted the
 *   opposite way from Bootstrap's own modal, deliberately: a question is not a
 *   document, and a question pinned to the top of a tall viewport reads as a page
 *   banner.
 * @property {boolean} [dismissible=true] - Render the header's close control.
 *   Does **not** govern Escape or the backdrop — those are `keyboard` and
 *   `backdrop`, which keep Bootstrap's own names and meanings.
 * @property {boolean | 'static'} [backdrop] - Passed to F70. `'static'` keeps a
 *   click outside from dismissing.
 * @property {boolean} [keyboard] - Passed to F70. `false` keeps Escape from
 *   dismissing.
 * @property {ClassOption} [class] - Extra classes on the `.modal` element.
 * @property {boolean} [html=false] - Treat string content as markup.
 * @property {((html: string) => string) | false} [sanitize] - Required with
 *   `{ html: true }` (F52).
 * @property {Record<string, unknown>} [bootstrap] - The peer namespace, injected
 *   rather than looked up (ADR-0041).
 * @property {Document} [document] - The document to build in. Resolved **per
 *   dialog**, never at construction: a manager is legitimate on a server render,
 *   and only *asking* needs somewhere to draw.
 * @property {AbortSignal} [signal] - On a call, settles that dialog with its
 *   dismissal answer. On the manager, destroys the manager.
 */

/**
 * @typedef {object} DialogAction
 * @property {string} label - Visible button text (escaped). `label` in the
 *   `bsButton` sense — what is *on* the button — per ADR-0048's rule that
 *   `label` is the visible reading and `ariaLabel` the accessible one.
 * @property {unknown} value - What the promise resolves with when this button is
 *   pressed.
 * @property {string} [variant='secondary'] - Bootstrap variant for this button.
 * @property {ClassOption} [class] - Extra classes on this button.
 */

/**
 * @typedef {object} OpenDialogOptions
 * @property {Content} content - The dialog body. A string is escaped, a node is
 *   used as built, `{ html: true, sanitize }` opts into markup (F52).
 * @property {Content} [title] - The heading, and the dialog's accessible name.
 * @property {readonly DialogAction[]} [actions=[]] - The footer, in order. An
 *   empty footer is legal — an informational dialog is answered by dismissing it
 *   — but only while *some* dismissal is still reachable.
 * @property {unknown} [dismissValue=null] - What a dismissal resolves with.
 */

/**
 * @typedef {object} PromptOptions
 * @property {Content} [title]
 * @property {string} [value=''] - The field's initial value.
 * @property {string} [placeholder] - The field's placeholder.
 */

/**
 * @typedef {object} DialogsInstance
 * @property {(message: Content, options?: DialogOptions & { title?: Content }) => Promise<boolean>} confirm
 *   Ask a yes/no question. Resolves `true` only when the affirming button is
 *   pressed; every dismissal resolves `false`.
 * @property {(message: Content, options?: DialogOptions & PromptOptions) => Promise<string | null>} prompt
 *   Ask for a string. Resolves the field's value **as typed** — trimming is a
 *   decision about the caller's data, not this library's — and `null` on every
 *   dismissal, which stays distinguishable from the empty string a user may
 *   legitimately have entered.
 * @property {(options: DialogOptions & OpenDialogOptions) => Promise<unknown>} open
 *   The general form: caller content, caller-named answers.
 * @property {() => void} destroy - Tears the manager down and **settles every
 *   dialog still open** with its dismissal answer. A pending promise that never
 *   settles is a leak with an `await` on the other end of it.
 */

/** @type {Required<DialogLabels>} */
const DEFAULT_LABELS = /* @__PURE__ */ Object.freeze({
  confirm: 'OK',
  cancel: 'Cancel',
  close: 'Close',
});

/**
 * Split a bag into the shared dialog options and whatever the calling method adds
 * on top, validating the shared half and handing the remainder back for that
 * method to finish (ADR-0047).
 *
 * The rest element **is** the accepted set, so the manager's defaults and a
 * call's overrides can never disagree about which keys exist.
 *
 * @param {Record<string, any>} bag
 * @param {string} api
 * @returns {{ shared: Record<string, any>, rest: Record<string, any> }}
 * @throws {TypeError} On a malformed value.
 */
function readDialogOptions(bag, api) {
  const {
    labels,
    variant,
    size,
    centered,
    dismissible,
    backdrop,
    keyboard,
    class: extraClass,
    html,
    sanitize,
    bootstrap,
    document: doc,
    signal,
    ...rest
  } = bag;

  if (labels !== undefined) assertPlainObject(labels, 'options.labels', api);
  if (variant !== undefined) assertToken(variant, 'options.variant', api);
  if (size !== undefined) assertToken(size, 'options.size', api);
  if (centered !== undefined && typeof centered !== 'boolean') {
    throw new TypeError(`${api}: options.centered must be a boolean`);
  }
  if (dismissible !== undefined && typeof dismissible !== 'boolean') {
    throw new TypeError(`${api}: options.dismissible must be a boolean`);
  }
  if (keyboard !== undefined && typeof keyboard !== 'boolean') {
    throw new TypeError(`${api}: options.keyboard must be a boolean`);
  }
  if (html !== undefined && typeof html !== 'boolean') {
    throw new TypeError(`${api}: options.html must be a boolean`);
  }
  if (backdrop !== undefined && typeof backdrop !== 'boolean' && backdrop !== 'static') {
    throw new TypeError(`${api}: options.backdrop must be a boolean or 'static'`);
  }
  if (bootstrap !== undefined) assertPlainObject(bootstrap, 'options.bootstrap', api);
  if (doc !== undefined && typeof doc !== 'object') {
    throw new TypeError(`${api}: options.document must be a Document`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  return {
    shared: {
      labels,
      variant,
      size,
      centered,
      dismissible,
      backdrop,
      keyboard,
      class: extraClass,
      html,
      sanitize,
      bootstrap,
      document: doc,
      signal,
    },
    rest,
  };
}

/**
 * Merge a call's overrides over the manager's defaults.
 *
 * `undefined` means "not said", never "off": a call that omits `dismissible`
 * inherits the manager's value, and a call that passes `false` overrides it.
 * Spreading the two objects would break exactly that, because a destructuring
 * always produces the key — with `undefined` in it — and `undefined` would win
 * over the value beneath.
 *
 * @param {Record<string, any>} defaults
 * @param {Record<string, any>} overrides
 * @returns {Record<string, any>}
 */
function mergeDialogOptions(defaults, overrides) {
  /** @type {Record<string, any>} */
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) merged[key] = value;
  }
  // The one nested bag, merged rather than replaced: naming `cancel` must not
  // blank `confirm`.
  merged.labels = { ...DEFAULT_LABELS, ...defaults.labels, ...overrides.labels };
  return merged;
}

/**
 * A dialog manager: promise-returning `confirm`, `prompt` and `open` over the F70
 * modal wrapper (F101–F103).
 *
 * **An instance rather than three free functions**, and not because a manager is
 * grander (ADR-0071). The shared options number thirteen and a page asks its
 * questions in one costume, so defaults want somewhere to live; spec 07 §6
 * requires a `destroy()` that settles a dialog which is open *now*, which needs
 * an owner; and `confirm`/`prompt` as module exports would shadow the platform's
 * own globals at every import site that used them.
 *
 * **No module state** (NFR-35): two managers on one page share nothing, and the
 * suite asserts it rather than assuming it.
 *
 * @example
 * const dialogs = createDialogs({ labels: { confirm: 'Delete' }, variant: 'danger' });
 *
 * if (await dialogs.confirm(`Delete ${row.name}?`)) {
 *   await api.delete(row.id);
 * }
 *
 * @example
 * // A dismissal is an answer, so there is nothing to catch:
 * const name = await dialogs.prompt('New folder name', { value: 'Untitled' });
 * if (name !== null) create(name);
 *
 * @example
 * // Three answers, named by the caller:
 * const choice = await dialogs.open({
 *   title: 'Unsaved changes',
 *   content: 'Save before closing?',
 *   actions: [
 *     { label: 'Discard', value: 'discard' },
 *     { label: 'Cancel', value: 'cancel' },
 *     { label: 'Save', value: 'save', variant: 'primary' },
 *   ],
 *   dismissValue: 'cancel',
 * });
 *
 * @param {DialogOptions} [options] - Defaults for every dialog this manager
 *   opens, each overridable per call.
 * @returns {DialogsInstance}
 * @throws {TypeError} On a malformed or unknown option.
 */
export function createDialogs(options = {}) {
  const api = 'createDialogs';
  assertPlainObject(options, 'options', api);
  const { shared: defaults, rest } = readDialogOptions(options, api);
  assertNoUnknownOptions(rest, api);

  const managerSignal = defaults.signal;
  // The manager's signal governs the MANAGER; a call's signal governs that call.
  // Inheriting it into every dialog would work — settling is idempotent — but it
  // would also mean two mechanisms doing one job, which is the drift the 17.8
  // naming pass existed to stop.
  delete defaults.signal;
  /** Settlement hooks for the dialogs currently open, newest last. @type {Set<() => void>} */
  const live = new Set();
  let destroyed = false;

  /** @returns {void} */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    // A copy: settling removes the entry, which mutates the set being walked.
    for (const settle of [...live]) settle();
    live.clear();
    managerSignal?.removeEventListener('abort', destroy);
  }

  managerSignal?.addEventListener('abort', destroy, { once: true });
  if (managerSignal?.aborted === true) destroy();

  /**
   * @param {string} method
   * @returns {void}
   * @throws {TypeError} When the manager has been destroyed.
   */
  function assertAlive(method) {
    // Synchronous, unlike the failures F102 turns into rejections: asking a
    // destroyed manager for a dialog is a programming error, in the same class as
    // a malformed option, and 17.9's rule is that those throw where they happen.
    // "Could not be asked" is about the *page*, not about the call being wrong.
    if (destroyed) throw new TypeError(`${api}: ${method}() was called after destroy()`);
  }

  /**
   * Build, show, and settle exactly once.
   *
   * @param {string} method - Public method name, so a diagnostic names what the
   *   caller invoked rather than this chokepoint (ADR-0049).
   * @param {Record<string, any>} config - Merged options.
   * @param {object} spec
   * @param {Content} [spec.title]
   * @param {(body: Element, doc: Document) => void} spec.body - Fills the
   *   `.modal-body`. A closure, so `prompt` can keep hold of its field.
   * @param {ReadonlyArray<{ label: string, variant?: string, class?: ClassOption, answer: () => unknown }>} spec.actions
   *   The footer. `answer` is a thunk rather than a value so `prompt` can read
   *   its field at press time; a value would have to be captured before the user
   *   had typed anything.
   * @param {() => unknown} spec.dismissAnswer - What a dismissal resolves with.
   * @param {() => Element | undefined} [spec.autofocus] - What to focus once the
   *   dialog is actually visible.
   * @returns {Promise<any>}
   */
  function ask(method, config, spec) {
    const callSignal = config.signal;
    if (callSignal?.aborted === true) {
      // Already cancelled before it was asked: the answer is the dismissal, and
      // nothing is drawn. Aborting is not a failure (ADR-0004's posture).
      return Promise.resolve(spec.dismissAnswer());
    }

    /** @type {Document} */
    let doc;
    try {
      doc = resolveDocument({ document: config.document }, method);
    } catch (error) {
      // F102 makes "there is nowhere to draw this" a rejection of the *question*
      // rather than a throw from wiring one up — which is what lets a manager be
      // constructed during a server render and fail only when it is used.
      return Promise.reject(error);
    }

    // Everything from here to `show()` is synchronous on purpose. A content value
    // this library will not render — markup without a sanitizer, an object where
    // a string or a node belongs — is a programming error, and ADR-0049's rule is
    // that those throw where the caller is. Building inside the promise would
    // turn every one of them into a rejection the caller then has to tell apart
    // from F102's missing peer, which is the one distinction F102 exists to
    // protect.
    const contentOptions = { html: config.html, sanitize: config.sanitize };
    const titleId = uniqueId(doc, 'egl-dialog-title');
    const bodyId = uniqueId(doc, 'egl-dialog-body');
    const hasTitle = spec.title !== undefined;

    /** What the next settlement will resolve with. @type {() => unknown} */
    let answer = spec.dismissAnswer;

    const element = doc.createElement('div');
    applyClasses(element, ['modal', 'fade'], config.class, method);
    element.setAttribute('tabindex', '-1');
    element.setAttribute('aria-hidden', 'true');
    // The accessible name is the title where there is one and the question itself
    // where there is not — so a dialog is *always* named, with no `ariaLabel`
    // option to forget (NFR-21/NFR-36). Bootstrap owns `role` and `aria-modal`,
    // setting them on show and removing them on hide; naming is the half it does
    // not do.
    element.setAttribute('aria-labelledby', hasTitle ? titleId : bodyId);
    if (hasTitle) element.setAttribute('aria-describedby', bodyId);

    const dialog = doc.createElement('div');
    applyClasses(
      dialog,
      [
        'modal-dialog',
        config.centered !== false && 'modal-dialog-centered',
        config.size !== undefined && `modal-${config.size}`,
      ],
      undefined,
      method,
    );
    const content = doc.createElement('div');
    content.className = 'modal-content';

    if (hasTitle || config.dismissible !== false) {
      const header = doc.createElement('div');
      header.className = 'modal-header';
      if (hasTitle) {
        const heading = doc.createElement('h5');
        heading.className = 'modal-title';
        heading.id = titleId;
        appendContent(heading, /** @type {Content} */ (spec.title), contentOptions, method);
        header.append(heading);
      }
      if (config.dismissible !== false) {
        header.append(
          bsCloseButton({
            // `ariaLabel`, not `label`: on a control whose glyph is drawn in CSS
            // there is no visible text, and ADR-0048 fixed `label` as the visible
            // reading and `ariaLabel` as the accessible one.
            ariaLabel: config.labels.close,
            document: doc,
            // Alone in the header, the control has nothing for Bootstrap's
            // space-between to push it away from.
            ...(hasTitle ? {} : { class: 'ms-auto' }),
            onClick: () => requestClose(),
          }),
        );
      }
      content.append(header);
    }

    const body = doc.createElement('div');
    body.className = 'modal-body';
    body.id = bodyId;
    spec.body(body, doc);
    content.append(body);

    if (spec.actions.length > 0) {
      const footer = doc.createElement('div');
      footer.className = 'modal-footer';
      for (const action of spec.actions) {
        footer.append(
          bsButton({
            label: action.label,
            variant: action.variant ?? 'secondary',
            document: doc,
            ...(action.class === undefined ? {} : { class: action.class }),
            onClick: () => {
              // Recorded before anything starts closing: a dismissal racing
              // behind this press finds the answer already chosen, which is what
              // makes F102's exactly-once deterministic rather than dependent on
              // transition timing.
              answer = action.answer;
              requestClose();
            },
          }),
        );
      }
      content.append(footer);
    }

    dialog.append(content);
    element.append(dialog);
    doc.body.append(element);

    const modal = bsModal(element, {
      ...(config.backdrop === undefined ? {} : { backdrop: config.backdrop }),
      ...(config.keyboard === undefined ? {} : { keyboard: config.keyboard }),
      ...(config.bootstrap === undefined ? {} : { bootstrap: config.bootstrap }),
    });

    // Installed before `show`, so what it captures for restoration is the element
    // the user was actually on — not the dialog Bootstrap is about to focus. It
    // focuses nothing itself here: the element is still `display: none`, and
    // placing focus is `shown`'s job below.
    const release = focusTrap(element, { initialFocus: false });

    /** @type {(value: any) => void} */
    let resolveAnswer;
    let settled = false;
    /** @type {(() => void) | undefined} */
    let offHidden;

    // Focus is placed **by us**, once the dialog is actually visible, and the
    // default target is the dialog itself.
    //
    // Bootstrap already focuses `this._element` on show, so this looks
    // redundant — and on WebKit it is not. Measured on the three-engine suite:
    // with Bootstrap left to do it, the first Tab press moved focus out of the
    // dialog on WebKit, because focus was still on `<body>` and the F109 trap
    // listens on its root by design (ADR-0070 rejected a document-level
    // `focusin` guard, on the grounds that the one case needing it — a modal —
    // was covered by the component that owns it). This engine says otherwise,
    // so the dialog stops relying on that and places focus itself.
    //
    // The dialog, not its affirming button: focus on a button means Enter agrees
    // to the question, which is not a default anything destructive should have.
    const focusOnShown = () => {
      const target = spec.autofocus?.() ?? element;
      /** @type {{ focus?: () => void }} */ (target).focus?.();
    };
    /** @returns {void} */
    function removeNode() {
      element.remove();
    }

    /**
     * Everything this dialog owns, released exactly once.
     *
     * The node is removed only once Bootstrap has finished hiding: pulling a shown
     * `.modal` out of the document strands the backdrop and leaves `<body>`
     * scroll-locked, because the component never sees the `hidden` it disposes on.
     * `bsModal.destroy()` already hides-then-disposes; this waits for the same
     * event before removing the markup.
     *
     * The trap is released last, and releasing it restores focus — after the
     * dialog has stopped being able to claim it back.
     *
     * @returns {void}
     */
    function teardown() {
      offHidden?.();
      offHidden = undefined;
      live.delete(settle);
      callSignal?.removeEventListener('abort', settle);
      element.removeEventListener('shown.bs.modal', focusOnShown);
      const wasShown = modal.isShown();
      // Registered BEFORE the destroy that causes the hide: a synchronous
      // transition — a test double, or `prefers-reduced-motion` on a real engine —
      // fires `hidden` inside `destroy()`, and a listener added after it returns
      // would never hear the event it is waiting for.
      if (wasShown) {
        element.addEventListener('hidden.bs.modal', removeNode, { once: true });
      }
      modal.destroy();
      if (!wasShown) removeNode();
      release();
    }

    /**
     * The one settlement path. Every dismissal, every button and every teardown
     * arrives here.
     *
     * **No re-entry guard, deliberately.** `teardown` drops all three ways in —
     * the `hidden` subscription, the entry in `live`, the abort listener — before
     * this resolves, so a second call is unreachable by construction; and each
     * thing it would have protected is idempotent anyway: a promise ignores a
     * second `resolve`, `bsModal.destroy()` returns early once destroyed, and the
     * F109 trap's `release` is documented idempotent. A guard no execution can
     * reach is a branch no test can cover, and this project deletes those instead
     * of mock-covering them (the M2.4 precedent). What proves exactly-once is the
     * suite counting settlements, not a line of defence here.
     *
     * @returns {void}
     */
    function settle() {
      settled = true;
      const value = answer();
      teardown();
      resolveAnswer(value);
    }

    /**
     * Ask the dialog to close, from a control inside it.
     *
     * Hide first and let `hidden.bs.modal` settle, so the animation the caller
     * configured actually plays. **Unless the dialog has not finished appearing
     * yet**, and that case is not hypothetical: Bootstrap's own `hide()` returns
     * without emitting anything while a show transition is in flight, so routing
     * through it would leave this promise pending forever. A dismissal that
     * arrives before the entrance completed settles at once instead — there is no
     * exit animation, because there was no entrance to reverse.
     *
     * The `settled` guard here is the reachable one, and it guards a real window:
     * between `hide()` and `hidden` the footer is still attached and still
     * clickable, and a second press must not reach a wrapper this dialog has
     * already disposed.
     *
     * A declaration rather than an assigned closure, so the button handlers built
     * above can name it without a placeholder function standing in until the
     * modal exists.
     *
     * @returns {void}
     */
    function requestClose() {
      if (settled) return;
      if (modal.isShown()) modal.hide();
      else settle();
    }

    // Only the wiring and the show are inside the executor. Everything above ran
    // synchronously so that a shape violation throws where the caller is, and
    // everything here settles rather than throws — the F102 split, expressed as
    // the boundary of one function.
    //
    // `reject` is the executor's own parameter and never leaves it, because the
    // only thing that can reject is the `show` below. `resolveAnswer` has to
    // outlive it, since `settle` resolves from wherever the answer eventually
    // comes from — and a promise executor runs synchronously, so it holds a
    // function before anything can call it.
    return new Promise((resolve, reject) => {
      resolveAnswer = resolve;

      element.addEventListener('shown.bs.modal', focusOnShown, { once: true });
      offHidden = modal.on('hidden', settle);
      live.add(settle);
      callSignal?.addEventListener('abort', settle, { once: true });

      try {
        modal.show();
      } catch (error) {
        // The question could not be *asked* (F102) — a missing peer, and the only
        // case that rejects. Marked settled first so a late `hidden` cannot
        // resolve a promise that has already failed.
        settled = true;
        teardown();
        reject(error);
      }
    });
  }

  /**
   * The two-button footer that `confirm` and `prompt` share.
   *
   * @param {Record<string, any>} config
   * @param {() => unknown} affirm - What the affirming button answers with.
   * @param {() => unknown} dismiss - What the cancel button answers with, which
   *   is the same answer every other dismissal gives.
   * @returns {ReadonlyArray<{ label: string, variant: string, answer: () => unknown }>}
   */
  const answerButtons = (config, affirm, dismiss) => [
    { label: config.labels.cancel, variant: 'secondary', answer: dismiss },
    { label: config.labels.confirm, variant: config.variant ?? 'primary', answer: affirm },
  ];

  return {
    confirm: (message, callOptions = {}) => {
      const method = 'confirm';
      assertAlive(method);
      assertPlainObject(callOptions, 'options', method);
      const { shared, rest: extra } = readDialogOptions(callOptions, method);
      const { title, ...unknown } = extra;
      assertNoUnknownOptions(unknown, method);
      const config = mergeDialogOptions(defaults, shared);
      const dismiss = () => false;

      return ask(method, config, {
        title,
        body: (body) =>
          appendContent(body, message, { html: config.html, sanitize: config.sanitize }, method),
        actions: answerButtons(config, () => true, dismiss),
        dismissAnswer: dismiss,
      });
    },

    prompt: (message, callOptions = {}) => {
      const method = 'prompt';
      assertAlive(method);
      assertPlainObject(callOptions, 'options', method);
      const { shared, rest: extra } = readDialogOptions(callOptions, method);
      const { title, value = '', placeholder, ...unknown } = extra;
      assertNoUnknownOptions(unknown, method);
      if (typeof value !== 'string') {
        throw new TypeError(`${method}: options.value must be a string`);
      }
      if (placeholder !== undefined && typeof placeholder !== 'string') {
        throw new TypeError(`${method}: options.placeholder must be a string`);
      }
      const config = mergeDialogOptions(defaults, shared);
      const dismiss = () => null;

      // Assigned by the body builder below, which `ask` runs synchronously before
      // anything can be pressed — so the thunks that read it need no fallback for
      // an unassigned field, and a fallback nothing can reach is a branch no test
      // can cover (the M2.4 precedent).
      /** @type {{ value: string }} */
      let field;
      return ask(method, config, {
        title,
        body: (body, doc) => {
          // The question labels the field, which is what names the field without
          // a second string to write (NFR-21): one `<label for>`, rather than a
          // message and an `aria-label` that can disagree with it.
          const fieldId = uniqueId(doc, 'egl-dialog-input');
          const label = doc.createElement('label');
          label.className = 'form-label';
          label.setAttribute('for', fieldId);
          appendContent(label, message, { html: config.html, sanitize: config.sanitize }, method);

          const input = doc.createElement('input');
          input.className = 'form-control';
          input.id = fieldId;
          input.setAttribute('type', 'text');
          // Both: the attribute is the field's default, the property is what it
          // currently holds, and a reset inside the dialog should return here.
          input.setAttribute('value', value);
          /** @type {{ value: string }} */ (input).value = value;
          if (placeholder !== undefined) input.setAttribute('placeholder', placeholder);

          body.append(label, input);
          field = /** @type {{ value: string }} */ (input);
        },
        actions: answerButtons(config, () => field.value, dismiss),
        dismissAnswer: dismiss,
        // The field, not the dialog: a prompt whose input is one Tab away is a
        // prompt every user has to find before they can answer it.
        autofocus: () => /** @type {Element | undefined} */ (/** @type {unknown} */ (field)),
      });
    },

    open: (callOptions) => {
      const method = 'open';
      assertAlive(method);
      assertPlainObject(callOptions, 'options', method);
      const { shared, rest: extra } = readDialogOptions(callOptions, method);
      const { content, title, actions = [], dismissValue = null, ...unknown } = extra;
      assertNoUnknownOptions(unknown, method);
      if (content === undefined) {
        throw new TypeError(`${method}: options.content is required`);
      }
      if (!Array.isArray(actions)) {
        throw new TypeError(`${method}: options.actions must be an array`);
      }
      const config = mergeDialogOptions(defaults, shared);

      const resolved = actions.map((action, index) => {
        const where = `options.actions[${index}]`;
        assertPlainObject(action, where, method);
        const { label, value, variant, class: extraClass, ...unknownAction } = action;
        assertNoUnknownOptions(unknownAction, `${method}: ${where}`, 'property');
        if (typeof label !== 'string' || label === '') {
          throw new TypeError(`${method}: ${where}.label must be a non-empty string`);
        }
        if (variant !== undefined) assertToken(variant, `${where}.variant`, method);
        return { label, variant, class: extraClass, answer: () => value };
      });

      // A dialog with no button, no close control, no Escape and no dismissible
      // backdrop cannot be answered at all: the `await` never returns and the page
      // sits behind a modal it cannot close. The empty focus trap has the same
      // shape (F109) and gets the same treatment — name the case rather than let
      // it be discovered.
      if (
        resolved.length === 0 &&
        config.dismissible === false &&
        config.keyboard === false &&
        config.backdrop === 'static'
      ) {
        throw new TypeError(
          `${method}: a dialog with no actions, no close control, no Escape and a static backdrop cannot be answered`,
        );
      }

      return ask(method, config, {
        title,
        body: (body) =>
          appendContent(body, content, { html: config.html, sanitize: config.sanitize }, method),
        actions: resolved,
        dismissAnswer: () => dismissValue,
      });
    },

    destroy,
  };
}
