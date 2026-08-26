/**
 * egl-utils-js/ui — the toast manager (spec 07 §2 items F104–F105).
 *
 * F69 gives a page toasts. What it does not give it is a **policy**: call `add`
 * six times and six toasts stack, in arrival order, each with its own timer. That
 * is correct as a component and wrong as a notification system, and the three
 * things missing are the three this manager adds.
 *
 * **A cap.** At most `maxVisible` toasts are up at once; the rest wait in a queue
 * and are promoted as slots free. A burst of twelve failures should not paper over
 * the page it is reporting on.
 *
 * **Admission rules.** An **id** already on the manager is *updated* rather than
 * joined by a second toast, and an *identical* message is not shown twice — with
 * what "identical" means written down (see {@link ToastAddOptions}) rather than
 * left to the reader, because a dedupe rule nobody can predict is worse than none.
 *
 * **One toast per story.** `promise()` takes a promise and the three messages a
 * caller would otherwise write as three `add` calls — and shows **one** toast,
 * transitioned in place. Three toasts tell the story out of order the moment the
 * network is slow: "Saving…", "Saved", and then the earlier "Saving…" still
 * sitting there underneath.
 *
 * **Composed, not reimplemented** (spec 07 §4). Every node is built, shown,
 * timed, dismissed and disposed by {@link bsToast} (F69); the peer is resolved at
 * first use and never imported (ADR-0041). This module contributes the queue, the
 * admission rules and the transition, and nothing that draws.
 *
 * @module egl-utils-js/ui
 */

import { assertPlainObject, assertToken, resolveDocument } from './bootstrap-elements.js';
import { bsToast, instantiate, invoke, resolveComponent } from './bootstrap-behaviors.js';
import { isAbortSignal, isElement } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @typedef {import('./bootstrap-elements.js').Content} Content
 * @typedef {import('./bootstrap-elements.js').ClassOption} ClassOption
 */

/**
 * Where an **owned** container sits. Ignored when the caller supplies their own,
 * because then the placement is theirs.
 *
 * Each maps to Bootstrap's own position utilities, so the vocabulary a caller
 * learns here is one they already have.
 *
 * @typedef {'top-start' | 'top-center' | 'top-end' | 'middle-center' | 'bottom-start' | 'bottom-center' | 'bottom-end'} ToastPlacement
 */

/** @type {Readonly<Record<ToastPlacement, string>>} */
const PLACEMENTS = /* @__PURE__ */ Object.freeze({
  'top-start': 'top-0 start-0',
  'top-center': 'top-0 start-50 translate-middle-x',
  'top-end': 'top-0 end-0',
  'middle-center': 'top-50 start-50 translate-middle',
  'bottom-start': 'bottom-0 start-0',
  'bottom-center': 'bottom-0 start-50 translate-middle-x',
  'bottom-end': 'bottom-0 end-0',
});

/**
 * @typedef {object} ToastsOptions
 * @property {Element} [container] - An existing `.toast-container` to fill.
 *   Without one the manager **builds and owns** a positioned container, and
 *   removes it again on `destroy` — so a page that just wants notifications does
 *   not have to author positioning markup first.
 * @property {ToastPlacement} [placement='top-end'] - Where an owned container
 *   sits. Ignored when `container` is given.
 * @property {number} [maxVisible=3] - How many toasts may be up at once.
 *   Everything past it queues, in arrival order, and is promoted as slots free.
 * @property {boolean} [dedupe=true] - Whether an identical message is dropped
 *   rather than shown twice. Per-call overridable.
 * @property {string} [variant] - Default theme colour for every toast.
 * @property {number | false} [autoHideMs=5000] - Default lifetime, or `false` for
 *   "until dismissed" — F69's vocabulary, unchanged (ADR-0048).
 * @property {boolean} [animation=true]
 * @property {boolean} [dismissible=true]
 * @property {string} [closeLabel='Close'] - The dismiss control's accessible name.
 * @property {ClassOption} [class] - Extra classes on every toast built here.
 * @property {boolean} [html=false] - Treat string content as markup.
 * @property {((html: string) => string) | false} [sanitize] - Required with
 *   `{ html: true }` (F52).
 * @property {Record<string, unknown>} [bootstrap] - The peer namespace, injected
 *   rather than looked up (ADR-0041).
 * @property {Document} [document] - Where to build, when it is not the
 *   container's own.
 * @property {AbortSignal} [signal] - Destroys the manager when aborted (NFR-15).
 */

/**
 * @typedef {object} ToastAddOptions
 * @property {string} [id] - The toast's identity. Adding again with an id this
 *   manager still holds **updates that toast** rather than showing a second one —
 *   whether it is visible or still queued. Omitted, an id is minted and returned.
 * @property {Content} [title] - Rendered in the toast header; omitting it omits
 *   the header.
 * @property {string} [variant] - Overrides the manager's default.
 * @property {number | false} [autoHideMs] - Overrides the manager's default.
 * @property {boolean} [dedupe] - Overrides the manager's default for this call.
 * @property {string} [dedupeKey] - The identity used for deduplication, when the
 *   derived one is not what you mean — two different failures that should
 *   collapse into one toast, say.
 *
 *   **What "identical" means, exactly** (F104 requires this to be contractual):
 *   with no `dedupeKey`, two toasts are identical when their `variant`, their
 *   `title` and their `message` all match — and **only when both the message and
 *   the title are strings**. Content that is a node or an array is never
 *   deduplicated, because the only cheap comparison available is reference
 *   equality, callers build a fresh node per call, and a rule that silently never
 *   fires is worse than an honest exemption. **A toast given an explicit `id` is
 *   outside the dedupe system entirely** — neither matched against nor matchable
 *   — because an id is an assertion of distinct identity, and two independent
 *   operations whose messages happen to read the same must stay two toasts or the
 *   later update targets the wrong one. A duplicate is **dropped**, not
 *   redrawn; the toast already up has its lifetime restarted, so a repeated event
 *   still reads as recent without a second node appearing.
 * @property {boolean} [html] - Treat string content as markup, for this toast.
 * @property {((html: string) => string) | false} [sanitize] - Required with
 *   `{ html: true }`.
 */

/**
 * @typedef {object} ToastPromiseMessages
 * @property {Content} pending - Shown while the promise is in flight, with no
 *   auto-hide: an operation of unknown duration has no honest timer.
 * @property {Content | ((value: any) => Content)} success - Replaces it on
 *   resolution. A function receives the resolved value, which is how a message
 *   says *"3 rows saved"* rather than *"Saved"*.
 * @property {Content | ((reason: any) => Content)} error - Replaces it on
 *   rejection, and receives the reason.
 */

/**
 * @typedef {object} ToastPromiseOptions
 * @property {string} [id] - The identity the three states share. Minted when
 *   omitted.
 * @property {Content} [title] - Applied to all three states.
 * @property {string} [pendingVariant] - Defaults to the manager's `variant`.
 * @property {string} [successVariant='success']
 * @property {string} [errorVariant='danger']
 * @property {number | false} [autoHideMs] - For the settled states only; the
 *   pending state never auto-hides.
 * @property {boolean} [html]
 * @property {((html: string) => string) | false} [sanitize]
 */

/**
 * @typedef {object} ToastsState
 * @property {readonly string[]} visible - Ids of the toasts currently up, oldest
 *   first.
 * @property {readonly string[]} queued - Ids waiting for a slot, in the order
 *   they will get one.
 */

/**
 * @typedef {object} ToastsInstance
 * @property {(message: Content, options?: ToastAddOptions) => string} add - Admit
 *   a toast, and get back its id — whether it was shown, queued, updated in place
 *   or dropped as a duplicate. The id is the handle for everything below.
 * @property {(id: string) => void} dismiss - Hide one toast early, or drop it from
 *   the queue. Unknown ids are ignored: dismissing something that has already
 *   gone is the normal race, not an error.
 * @property {() => void} clear - Drop the queue and hide everything up.
 * @property {<T>(promise: Promise<T>, messages: ToastPromiseMessages, options?: ToastPromiseOptions) => Promise<T>} promise
 *   One toast for one operation (F105). Returns **the caller's own promise**, so
 *   the settlement passes through untouched — this helper observes, it does not
 *   swallow, and it never converts a rejection into anything else.
 * @property {() => ToastsState} state - What is up and what is waiting. A query,
 *   for a caller coordinating with the cap (ADR-0049).
 * @property {Element} element - The container, owned or supplied.
 * @property {() => void} destroy - Hides everything, drops the queue, and removes
 *   an owned container.
 */

/**
 * The dedupe identity of a toast, or `null` when it has none.
 *
 * `null` rather than a best-effort key: see {@link ToastAddOptions} for why node
 * content is exempt rather than compared.
 *
 * @param {Content} message
 * @param {Content | undefined} title
 * @param {string | undefined} variant
 * @param {string | undefined} explicit
 * @returns {string | null}
 */
function dedupeKeyFor(message, title, variant, explicit) {
  if (explicit !== undefined) return explicit;
  if (typeof message !== 'string') return null;
  if (title !== undefined && typeof title !== 'string') return null;
  // A NUL separator, so a message ending in the separator cannot forge a
  // different toast's key.
  return `${variant ?? ''} ${title ?? ''} ${message}`;
}

/**
 * A toast manager over F69: a queue, a visible cap, admission rules, and one
 * toast per operation (F104–F105).
 *
 * @example
 * const toasts = createToasts({ placement: 'bottom-end', maxVisible: 3 });
 *
 * toasts.add('Saved.');
 * toasts.add('Could not reach the server.', { variant: 'danger', autoHideMs: false });
 *
 * @example
 * // Six arrivals, three visible: the rest queue and are promoted as slots free.
 * for (const row of rows) toasts.add(`${row.name} imported`);
 *
 * @example
 * // One toast, three states — and `save()`'s own settlement, untouched.
 * const saved = await toasts.promise(save(form), {
 *   pending: 'Saving…',
 *   success: (rows) => `Saved ${rows.length} rows.`,
 *   error: (error) => `Could not save: ${error.message}`,
 * });
 *
 * @param {ToastsOptions} [options]
 * @returns {ToastsInstance}
 * @throws {TypeError} On a malformed or unknown option.
 * @throws {DomContractError} If there is no document to build an owned container
 *   in. A supplied container brings its own.
 */
export function createToasts(options = {}) {
  const api = 'createToasts';
  assertPlainObject(options, 'options', api);

  const {
    container: givenContainer,
    placement = 'top-end',
    maxVisible = 3,
    dedupe: dedupeByDefault = true,
    variant: defaultVariant,
    autoHideMs: defaultAutoHideMs,
    animation,
    dismissible,
    closeLabel,
    class: extraClass,
    html: defaultHtml,
    sanitize: defaultSanitize,
    bootstrap,
    document: explicitDocument,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);

  if (givenContainer !== undefined && !isElement(givenContainer)) {
    throw new TypeError(`${api}: options.container must be an Element`);
  }
  if (!Object.hasOwn(PLACEMENTS, placement)) {
    throw new TypeError(
      `${api}: options.placement must be one of ${Object.keys(PLACEMENTS).join(', ')}`,
    );
  }
  if (!Number.isInteger(maxVisible) || maxVisible < 1) {
    throw new TypeError(`${api}: options.maxVisible must be an integer >= 1`);
  }
  if (typeof dedupeByDefault !== 'boolean') {
    throw new TypeError(`${api}: options.dedupe must be a boolean`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const owned = givenContainer === undefined;
  const doc = owned
    ? resolveDocument({ document: explicitDocument }, api)
    : /** @type {Document} */ (explicitDocument ?? givenContainer.ownerDocument);

  /** @type {Element} */
  let container;
  if (owned) {
    container = doc.createElement('div');
    // Bootstrap's own container recipe, with its own position utilities: nothing
    // here is a class this library invented, so a caller restyling it is editing
    // Bootstrap rather than guessing at us.
    container.className = `toast-container position-fixed p-3 ${PLACEMENTS[placement]}`;
    doc.body.append(container);
  } else {
    container = /** @type {Element} */ (givenContainer);
  }

  // Every node is F69's. The manager owns which toasts exist and when, and
  // nothing about how one is drawn.
  const toasts = bsToast(container, {
    ...(defaultVariant === undefined ? {} : { variant: defaultVariant }),
    ...(defaultAutoHideMs === undefined ? {} : { autoHideMs: defaultAutoHideMs }),
    ...(animation === undefined ? {} : { animation }),
    ...(dismissible === undefined ? {} : { dismissible }),
    ...(closeLabel === undefined ? {} : { closeLabel }),
    ...(extraClass === undefined ? {} : { class: extraClass }),
    ...(bootstrap === undefined ? {} : { bootstrap }),
    document: doc,
  });

  /**
   * @typedef {object} Payload
   * @property {Content} message
   * @property {Content} [title]
   * @property {string} [variant]
   * @property {number | false} [autoHideMs]
   * @property {boolean} [html]
   * @property {((html: string) => string) | false} [sanitize]
   * @property {string | null} key
   */

  /**
   * @typedef {object} Entry
   * @property {string} id
   * @property {Payload} payload
   * @property {Element} [element] - Present exactly while the toast is visible.
   * @property {Payload} [replacement] - Set when a visible toast is being updated:
   *   it is hidden first, and this is shown in the slot it vacates.
   */

  /** Visible toasts, oldest first. @type {Entry[]} */
  const visible = [];
  /** Waiting for a slot, in the order they will get one. @type {Entry[]} */
  const queued = [];
  let minted = 0;
  let destroyed = false;

  /**
   * @param {string} method
   * @returns {void}
   * @throws {TypeError} When the manager has been destroyed.
   */
  function assertAlive(method) {
    if (destroyed) throw new TypeError(`${api}: ${method}() was called after destroy()`);
  }

  /**
   * @param {string} id
   * @returns {Entry | undefined}
   */
  const find = (id) =>
    visible.find((entry) => entry.id === id) ?? queued.find((entry) => entry.id === id);

  /**
   * @param {string | null} key
   * @returns {Entry | undefined}
   */
  const findByKey = (key) =>
    key === null
      ? undefined
      : (visible.find((entry) => entry.payload.key === key) ??
        queued.find((entry) => entry.payload.key === key));

  /**
   * The Bootstrap instance for a node F69 built.
   *
   * `getOrCreateInstance` under the hood, so this is the same object F69 holds
   * rather than a second one over the same element — which is what makes hiding
   * one toast from here go through its own timers and its own teardown.
   *
   * @param {Element} element
   * @returns {void}
   */
  function hideNode(element) {
    invoke(instantiate(resolveComponent({ bootstrap }, api, 'Toast'), element, {}), 'hide');
  }

  /**
   * Draw a payload and record it as visible.
   *
   * @param {Entry} entry
   * @returns {void}
   */
  function present(entry) {
    const { message, title, variant, autoHideMs, html, sanitize } = entry.payload;
    entry.element = toasts.add(message, {
      ...(title === undefined ? {} : { title }),
      ...(variant === undefined ? {} : { variant }),
      ...(autoHideMs === undefined ? {} : { autoHideMs }),
      ...(html === undefined ? {} : { html }),
      ...(sanitize === undefined ? {} : { sanitize }),
    });
    visible.push(entry);
  }

  /**
   * Give the next queued toast the slot that just opened.
   *
   * No destroyed guard: `destroy` unsubscribes from `hidden` **before** telling
   * F69 to tear its toasts down, so the events that reach this function can only
   * arrive while the manager is alive. A guard no execution can reach is a branch
   * no test can cover, and this project deletes those rather than mock-covering
   * them (the M2.4 precedent).
   *
   * @returns {void}
   */
  function promote() {
    while (visible.length < maxVisible && queued.length > 0) {
      present(/** @type {Entry} */ (queued.shift()));
    }
  }

  // One listener on the container for every toast this manager will ever build:
  // Bootstrap's toast events bubble, which is what makes a slot freeing up
  // observable without a subscription per node (F69's `on`).
  const offHidden = toasts.on('hidden', (event) => {
    const at = visible.findIndex((entry) => entry.element === event.target);
    if (at === -1) return;
    const [entry] = visible.splice(at, 1);
    entry.element = undefined;

    // An update, not a departure: the replacement takes the slot this toast just
    // vacated rather than joining the back of the queue, so a burst of newer
    // arrivals cannot overtake the toast being updated.
    const { replacement } = entry;
    if (replacement !== undefined) {
      entry.replacement = undefined;
      entry.payload = replacement;
      present(entry);
      return;
    }
    promote();
  });

  /**
   * @param {Content} message
   * @param {ToastAddOptions} [addOptions]
   * @returns {string}
   */
  function add(message, addOptions = {}) {
    assertAlive('add');
    assertPlainObject(addOptions, 'options', `${api}.add`);
    const {
      id,
      title,
      variant = defaultVariant,
      autoHideMs = defaultAutoHideMs,
      dedupe = dedupeByDefault,
      dedupeKey,
      html = defaultHtml,
      sanitize = defaultSanitize,
      ...unknownAdd
    } = addOptions;
    assertNoUnknownOptions(unknownAdd, `${api}.add`);

    if (id !== undefined && (typeof id !== 'string' || id === '')) {
      throw new TypeError(`${api}.add: options.id must be a non-empty string`);
    }
    if (variant !== undefined) assertToken(variant, 'options.variant', `${api}.add`);
    if (typeof dedupe !== 'boolean') {
      throw new TypeError(`${api}.add: options.dedupe must be a boolean`);
    }
    if (dedupeKey !== undefined && typeof dedupeKey !== 'string') {
      throw new TypeError(`${api}.add: options.dedupeKey must be a string`);
    }

    /** @type {Payload} */
    const payload = {
      message,
      ...(title === undefined ? {} : { title }),
      ...(variant === undefined ? {} : { variant }),
      ...(autoHideMs === undefined ? {} : { autoHideMs }),
      ...(html === undefined ? {} : { html }),
      ...(sanitize === undefined ? {} : { sanitize }),
      // A caller-supplied id takes the toast OUT of the dedupe system, in both
      // directions: it is neither matched against nor matchable. An explicit id
      // is an assertion of distinct identity, and honouring it matters most in
      // the case ids exist for — two independent operations whose messages read
      // the same. `add('Uploading…', {id: 'a'})` followed by the same text under
      // `{id: 'b'}` must be two toasts, or the second caller's later update
      // silently retargets the first one's.
      key: id === undefined && dedupe ? dedupeKeyFor(message, title, variant, dedupeKey) : null,
    };

    // 1. A known id is an update, wherever that toast currently is.
    const known = id === undefined ? undefined : find(id);
    if (known !== undefined) {
      update(known, payload);
      return known.id;
    }

    // 2. An identical message already here is dropped rather than redrawn — and
    //    the toast already up has its lifetime restarted, so a repeated event
    //    still reads as recent. Bootstrap's own `show()` clears the pending
    //    timeout and schedules a new one, which is why this needs no timer of
    //    ours (verified against bootstrap 5.3's toast.js).
    const duplicate = findByKey(payload.key);
    if (duplicate !== undefined) {
      if (duplicate.element !== undefined) {
        invoke(
          instantiate(resolveComponent({ bootstrap }, api, 'Toast'), duplicate.element, {}),
          'show',
        );
      }
      return duplicate.id;
    }

    minted += 1;
    /** @type {Entry} */
    const entry = { id: id ?? `egl-toast-${minted}`, payload };

    // 3. A slot, or the queue.
    if (visible.length < maxVisible) present(entry);
    else queued.push(entry);
    return entry.id;
  }

  /**
   * @param {Entry} entry
   * @param {Payload} payload
   * @returns {void}
   */
  function update(entry, payload) {
    if (entry.element === undefined) {
      // Still queued: nothing has been drawn, so the update is the payload.
      entry.payload = payload;
      return;
    }
    // Visible: hide it, and let the `hidden` handler draw the replacement in the
    // slot it vacates. Rebuilding rather than rewriting the node is deliberate —
    // F69's "no stale variant classes" property is structural because each toast
    // is a fresh node, and mutating one here would mean reimplementing its class
    // vocabulary and its escaping to keep that true.
    entry.replacement = payload;
    hideNode(entry.element);
  }

  /**
   * @param {string} id
   * @returns {void}
   */
  function dismiss(id) {
    assertAlive('dismiss');
    if (typeof id !== 'string') throw new TypeError(`${api}.dismiss: id must be a string`);
    const at = queued.findIndex((entry) => entry.id === id);
    if (at !== -1) {
      queued.splice(at, 1);
      return;
    }
    const entry = visible.find((candidate) => candidate.id === id);
    // A dismissal outranks a pending update: the caller asked for this toast to
    // go, not to be replaced by the next thing that was queued for it.
    if (entry?.element !== undefined) {
      entry.replacement = undefined;
      hideNode(entry.element);
    }
  }

  /** @returns {void} */
  function clear() {
    assertAlive('clear');
    queued.length = 0;
    for (const entry of [...visible]) {
      entry.replacement = undefined;
      if (entry.element !== undefined) hideNode(entry.element);
    }
  }

  /**
   * @param {Content | ((value: any) => Content)} template
   * @param {any} value
   * @returns {Content}
   */
  const resolveMessage = (template, value) =>
    typeof template === 'function' ? template(value) : template;

  /**
   * @param {Promise<any>} promise
   * @param {ToastPromiseMessages} messages
   * @param {ToastPromiseOptions} [promiseOptions]
   * @returns {Promise<any>}
   */
  function promiseToast(promise, messages, promiseOptions = {}) {
    assertAlive('promise');
    if (typeof promise?.then !== 'function') {
      throw new TypeError(`${api}.promise: promise must be a promise`);
    }
    assertPlainObject(messages, 'messages', `${api}.promise`);
    assertPlainObject(promiseOptions, 'options', `${api}.promise`);

    const { pending, success, error, ...unknownMessages } = messages;
    assertNoUnknownOptions(unknownMessages, `${api}.promise`, 'message');
    if (pending === undefined || success === undefined || error === undefined) {
      throw new TypeError(`${api}.promise: messages.pending, .success and .error are all required`);
    }

    const {
      id,
      title,
      pendingVariant = defaultVariant,
      successVariant = 'success',
      errorVariant = 'danger',
      autoHideMs = defaultAutoHideMs,
      html = defaultHtml,
      sanitize = defaultSanitize,
      ...unknownPromise
    } = promiseOptions;
    assertNoUnknownOptions(unknownPromise, `${api}.promise`);

    const shared = {
      ...(title === undefined ? {} : { title }),
      ...(html === undefined ? {} : { html }),
      ...(sanitize === undefined ? {} : { sanitize }),
      // The three states are one toast by identity, so no dedupe rule may
      // collapse them into a neighbour that happens to read the same.
      dedupe: false,
    };

    // No auto-hide while it is in flight: an operation of unknown duration has no
    // honest timer, and a "Saving…" that vanished before it finished is how a
    // user learns not to trust the toasts.
    const toastId = add(pending, {
      ...shared,
      ...(id === undefined ? {} : { id }),
      ...(pendingVariant === undefined ? {} : { variant: pendingVariant }),
      autoHideMs: false,
    });

    /**
     * @param {Content} message
     * @param {string} variant
     * @returns {void}
     */
    const settleToast = (message, variant) => {
      // Destroyed while in flight is the ordinary race for a page that navigated
      // away: the operation still settles for the caller, it simply has nowhere
      // left to be announced.
      if (destroyed) return;
      add(message, {
        ...shared,
        id: toastId,
        variant,
        ...(autoHideMs === undefined ? {} : { autoHideMs }),
      });
    };

    promise.then(
      (value) => settleToast(resolveMessage(success, value), successVariant),
      (reason) => settleToast(resolveMessage(error, reason), errorVariant),
    );

    // The caller's own promise, returned unchanged: the settlement passes through
    // untouched, and an unhandled rejection stays the caller's to handle rather
    // than being quietly absorbed by the handler above.
    return promise;
  }

  /** @returns {void} */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    offHidden();
    queued.length = 0;
    visible.length = 0;
    toasts.destroy();
    if (owned) container.remove();
    signal?.removeEventListener('abort', destroy);
  }

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return {
    add,
    dismiss,
    clear,
    promise: promiseToast,
    state: () => ({
      visible: Object.freeze(visible.map((entry) => entry.id)),
      queued: Object.freeze(queued.map((entry) => entry.id)),
    }),
    element: container,
    destroy,
  };
}
