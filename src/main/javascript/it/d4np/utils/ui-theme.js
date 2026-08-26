/**
 * egl-utils-js/ui — theme management (spec 07 §2 items F106–F107).
 *
 * **Bootstrap's own mechanism, not a parallel one.** Bootstrap 5.3 themes off a
 * single attribute, `data-bs-theme`, and that attribute is the whole state this
 * manager owns. There is no class of ours to keep in step with it, no CSS
 * variable set of ours to shadow it, and the attribute name is deliberately
 * **not** an option: an option would be the beginning of a second mechanism.
 *
 * Three things a hand-rolled theme switch gets wrong, and the three this exists
 * for.
 *
 * **"Follow the system" is not the same as "no choice yet".** Tracking
 * `prefers-color-scheme` is easy; *stopping* when the user has expressed a
 * preference is the part that gets forgotten, and it is why a site that
 * remembered your choice at 6 pm has lost it by 7. Here the stored value **is**
 * the expressed choice: absent means follow the system, and `set('auto')`
 * removes it rather than storing a third state.
 *
 * **The flash.** A theme applied by the module that loads after first paint shows
 * one frame of the wrong one. The fix has to run synchronously in `<head>`,
 * before any stylesheet has painted — which is a moment no module can reach. So
 * {@link themeSnippet} emits that code as a string, from the same constants this
 * manager reads, because a snippet documented in a README drifts from the key it
 * is supposed to share the first time either changes.
 *
 * **A toggle that lies about what it does.** A control labelled "Dark" while the
 * page is dark is ambiguous in the one place ambiguity costs the most — a screen
 * reader reads it as a statement, not an offer. {@link ThemeInstance.control}
 * names **the state it will move to**, and relabels itself when the theme changes
 * underneath it, including by a system change it did not cause.
 *
 * @module egl-utils-js/ui
 */

import {
  applyClasses,
  assertPlainObject,
  assertToken,
  resolveDocument,
} from './bootstrap-elements.js';
import { isAbortSignal, isElement } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';
import { localStorageWrapper } from './storage.js';

/**
 * @typedef {import('./bootstrap-elements.js').Content} Content
 * @typedef {import('./bootstrap-elements.js').ClassOption} ClassOption
 * @typedef {import('./storage.js').StorageWrapper} StorageWrapper
 */

/**
 * Bootstrap 5.3's own theme attribute. **Not an option**, on purpose: F106 asks
 * for Bootstrap's mechanism rather than one beside it, and a configurable
 * attribute name is how a second mechanism starts.
 */
const ATTRIBUTE = 'data-bs-theme';

/** The media query the system preference is read from. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The default storage key, shared by the manager and the snippet. */
const DEFAULT_KEY = 'egl-theme';

/**
 * A resolved theme: what is actually on the attribute.
 *
 * @typedef {'light' | 'dark'} Theme
 */

/**
 * A preference: a resolved theme, or `'auto'` for "follow the system".
 *
 * @typedef {Theme | 'auto'} ThemePreference
 */

/**
 * The part of `MediaQueryList` this module uses. Narrower than the platform type
 * on purpose, so a test can supply four lines instead of a fake DOM.
 *
 * @typedef {object} MediaQueryLike
 * @property {boolean} matches
 * @property {(type: string, listener: () => void) => void} addEventListener
 * @property {(type: string, listener: () => void) => void} [removeEventListener]
 */

/**
 * @typedef {object} ThemeOptions
 * @property {Element} [root] - Where the attribute goes. Defaults to
 *   `documentElement`, which is where Bootstrap's own documentation puts it.
 * @property {StorageWrapper} [storage] - Where an expressed choice is kept.
 *   Defaults to the F21 `localStorageWrapper`, whose in-memory fallback is why
 *   private mode degrades instead of throwing (ADR-0010). Injectable, which is
 *   what makes the persistence testable without a browser.
 * @property {string} [key='egl-theme'] - The storage key. Pass the same one to
 *   {@link themeSnippet}, or neither, and they agree.
 * @property {(query: string) => MediaQueryLike} [matchMedia] - The system-preference
 *   seam. Defaults to the ambient `matchMedia`; **absent entirely** (Node, an
 *   exotic host) means `'auto'` resolves to `fallback` and no system tracking
 *   happens, which is a documented degradation rather than a throw.
 * @property {Theme} [fallback='light'] - What `'auto'` resolves to when there is
 *   no way to ask the system.
 * @property {Document} [document] - The document to read and build in.
 * @property {AbortSignal} [signal] - Destroys the manager when aborted (NFR-15).
 */

/**
 * @typedef {object} ThemeControlLabels
 * @property {string} [toLight='Switch to light theme'] - Used **while the page is
 *   dark**, because that is the state the control will move to.
 * @property {string} [toDark='Switch to dark theme'] - Used while the page is
 *   light.
 */

/**
 * @typedef {object} ThemeControlOptions
 * @property {ThemeControlLabels} [labels] - Merged key by key over the defaults,
 *   so naming one does not blank the other. These are English strings; a
 *   localised page supplies its own (NFR-21).
 * @property {{ light?: Content, dark?: Content }} [icons] - Content for the
 *   control, keyed by the theme it will move **to**. With icons the label becomes
 *   the accessible name only; without them it is the visible text. No icon font
 *   is bundled, imported or assumed — the nodes are yours (ADR-0037).
 * @property {string} [variant] - `btn-<variant>`. Omitted, the control carries
 *   `btn` and nothing else, so it inherits whatever the page already styles.
 * @property {'sm' | 'lg' | string} [size] - `btn-<size>`.
 * @property {ClassOption} [class] - Extra classes.
 * @property {Document} [document] - Where to build, when it is not the manager's.
 * @property {AbortSignal} [signal] - Detaches this control's listener when
 *   aborted. The manager's `destroy` detaches every control it built.
 */

/**
 * @typedef {object} ThemeChange
 * @property {ThemePreference} preference - What the user has expressed, `'auto'`
 *   meaning they have not.
 * @property {Theme} resolved - What is on the attribute now.
 */

/**
 * @typedef {object} ThemeInstance
 * @property {() => ThemePreference} get - The **preference**, which is `'auto'`
 *   until a choice is made. Distinct from `resolved()` on purpose: a settings UI
 *   needs to know whether "System" is selected, and a component needs to know
 *   which colours to draw.
 * @property {() => Theme} resolved - What is on the attribute right now.
 * @property {(preference: ThemePreference) => void} set - Apply and remember.
 *   `'auto'` **removes** the stored choice rather than storing a third state, so
 *   the page goes back to following the system.
 * @property {() => Theme} toggle - Flip the resolved theme and remember it,
 *   returning the new one. From `'auto'` this expresses a choice, which is what a
 *   user pressing a toggle means.
 * @property {(handler: (change: ThemeChange) => void) => () => void} on - Called
 *   on every change, including a system change while the preference is `'auto'`.
 *   Returns an unsubscribe.
 * @property {(options?: ThemeControlOptions) => Element} control - A toggle
 *   button whose accessible name is the state it will move to, relabelled
 *   whenever the theme changes.
 * @property {() => void} destroy - Stops managing. It does **not** un-theme the
 *   page: the attribute is the page's state, not this manager's node, and
 *   removing it on teardown would flash the default theme at every navigation.
 */

/**
 * Whether a value is a preference this module will act on.
 *
 * @param {unknown} value
 * @returns {value is ThemePreference}
 */
const isPreference = (value) => value === 'light' || value === 'dark' || value === 'auto';

/**
 * The `<head>` snippet that applies a persisted theme **before first paint**
 * (F107).
 *
 * A module cannot do this: by the time one has loaded, the first frame has
 * painted in the wrong theme. So this returns the source of a tiny synchronous
 * script, to be inlined in `<head>` **above** any stylesheet.
 *
 * It is emitted rather than documented so it cannot drift: it reads the same key
 * and writes the same attribute this module does, and the suite asserts the two
 * agree by running the string and comparing.
 *
 * Pure — no DOM, no storage, no globals — so a server render or a build step can
 * call it.
 *
 * @example
 * // In an Express/Astro/whatever template, above the stylesheets:
 * `<script>${themeSnippet()}</script>`
 *
 * @example
 * // Matching a manager that was given a key:
 * const key = 'acme-theme';
 * const head = `<script>${themeSnippet({ key })}</script>`;
 * const theme = createTheme({ key });
 *
 * @param {{ key?: string, fallback?: Theme }} [options]
 * @returns {string} JavaScript source, safe to inline inside a `<script>`
 *   element: every interpolated value is JSON-encoded and `<` is escaped, so no
 *   key can close the tag early.
 * @throws {TypeError} On a malformed or unknown option.
 */
export function themeSnippet(options = {}) {
  const api = 'themeSnippet';
  assertPlainObject(options, 'options', api);
  const { key = DEFAULT_KEY, fallback = 'light', ...unknown } = options;
  assertNoUnknownOptions(unknown, api);
  if (typeof key !== 'string' || key === '') {
    throw new TypeError(`${api}: options.key must be a non-empty string`);
  }
  if (fallback !== 'light' && fallback !== 'dark') {
    throw new TypeError(`${api}: options.fallback must be 'light' or 'dark'`);
  }

  /**
   * `<` escaped as well as JSON-encoded: a key containing `</script>` would
   * otherwise end the element early, which is the classic way an interpolated
   * string becomes markup.
   *
   * @param {string} value
   * @returns {string}
   */
  const literal = (value) => JSON.stringify(value).replace(/</g, '\\u003C');

  // Deliberately one statement and no formatting. It runs before paint on every
  // page load, it is read in a view-source rather than an editor, and every
  // branch here is a frame of the wrong theme avoided:
  //
  //  - the stored value is read through the same JSON encoding the F21 wrapper
  //    writes, and a bare `dark` is accepted too, so a hand-set key still works;
  //  - anything that is not a theme falls through to the system query, which is
  //    what makes a corrupt value degrade instead of persisting a wrong theme;
  //  - the whole thing is in a `try`, because storage can throw on access alone
  //    in a blocked-cookies context, and a theme is never worth a page error.
  return (
    `try{var t=null,r=localStorage.getItem(${literal(key)});` +
    `if(r){try{r=JSON.parse(r)}catch(e){}if(r==="light"||r==="dark")t=r}` +
    `if(!t)t=window.matchMedia&&window.matchMedia(${literal(DARK_QUERY)}).matches?"dark":${literal(fallback)};` +
    `document.documentElement.setAttribute(${literal(ATTRIBUTE)},t)}catch(e){}`
  );
}

/**
 * A theme manager over `data-bs-theme` (F106–F107).
 *
 * @example
 * const theme = createTheme();
 *
 * theme.get(); // 'auto' — nothing chosen yet
 * theme.resolved(); // 'dark', if that is what the system says
 * theme.toggle(); // 'light', and remembered
 * theme.set('auto'); // back to following the system
 *
 * @example
 * // A control that says what it will do, not what it is:
 * document.querySelector('.navbar').append(theme.control());
 *
 * @example
 * // Icons instead of words, supplied by you — no icon font is assumed:
 * theme.control({ icons: { dark: moonSvg(), light: sunSvg() } });
 *
 * @param {ThemeOptions} [options]
 * @returns {ThemeInstance}
 * @throws {TypeError} On a malformed or unknown option.
 * @throws {DomContractError} If there is no document to theme. Unlike the
 *   dialogs, this one applies its state at construction, so there is nothing
 *   useful to defer.
 * @throws {StorageError} From `set`/`toggle` only, and only **after** the theme
 *   has been applied: failing to remember a choice must not stop it taking
 *   effect, and must not be silent either.
 */
export function createTheme(options = {}) {
  const api = 'createTheme';
  assertPlainObject(options, 'options', api);
  const {
    root,
    storage = localStorageWrapper,
    key = DEFAULT_KEY,
    matchMedia: mediaSeam,
    fallback = 'light',
    document: explicitDocument,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);

  if (root !== undefined && !isElement(root)) {
    throw new TypeError(`${api}: options.root must be an Element`);
  }
  if (storage === null || typeof storage !== 'object' || typeof storage.get !== 'function') {
    throw new TypeError(`${api}: options.storage must be a storage wrapper`);
  }
  if (typeof key !== 'string' || key === '') {
    throw new TypeError(`${api}: options.key must be a non-empty string`);
  }
  if (mediaSeam !== undefined && typeof mediaSeam !== 'function') {
    throw new TypeError(`${api}: options.matchMedia must be a function`);
  }
  if (fallback !== 'light' && fallback !== 'dark') {
    throw new TypeError(`${api}: options.fallback must be 'light' or 'dark'`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const doc = resolveDocument({ document: explicitDocument }, api);
  const target = root ?? /** @type {Element} */ (doc.documentElement);

  // Resolved once. `matchMedia` is a `window` member with no Node counterpart, so
  // its absence is a legal state rather than a failure — and reading it through
  // an injectable seam is what lets the suite drive both branches of a media
  // query without a browser (ADR-0017's context guard).
  const resolveSeam =
    mediaSeam ??
    (typeof (/** @type {{ matchMedia?: unknown }} */ (globalThis).matchMedia) === 'function'
      ? /** @type {(query: string) => MediaQueryLike} */ (
          (query) => /** @type {any} */ (globalThis).matchMedia(query)
        )
      : undefined);

  /** @type {MediaQueryLike | undefined} */
  let query;
  if (resolveSeam !== undefined) {
    query = resolveSeam(DARK_QUERY);
    if (
      query === null ||
      typeof query !== 'object' ||
      typeof query.addEventListener !== 'function'
    ) {
      throw new TypeError(
        `${api}: options.matchMedia must return a MediaQueryList with addEventListener`,
      );
    }
  }

  /** @type {Set<(change: ThemeChange) => void>} */
  const subscribers = new Set();
  /** Relabel hooks for the controls this manager built. @type {Set<() => void>} */
  const controls = new Set();
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
   * The expressed choice, held **in memory** with storage as its mirror rather
   * than as its source.
   *
   * Read from storage once, here. Deriving it on every call instead would make a
   * *failed write* silently revert the manager's own view of the world — the
   * attribute would say `dark` while `resolved()` said `light`, and the next
   * system change would flip the page back — which is the opposite of "failing to
   * remember must not stop it taking effect". It also keeps a value components
   * read on every render off the storage accessor.
   *
   * A stored value that is not a theme is treated as absent rather than as an
   * error: a corrupt key should cost a user their preference, not the page.
   *
   * @type {ThemePreference}
   */
  let preference = (() => {
    const stored = storage.get(key);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  })();

  /** @returns {ThemePreference} */
  const readPreference = () => preference;

  /** @returns {Theme} */
  function systemTheme() {
    if (query === undefined) return fallback;
    return query.matches ? 'dark' : 'light';
  }

  /** @returns {Theme} */
  const resolve = () => {
    const preference = readPreference();
    return preference === 'auto' ? systemTheme() : preference;
  };

  /**
   * Write the attribute, relabel the controls, and tell the subscribers.
   *
   * @returns {Theme}
   */
  function apply() {
    const theme = resolve();
    target.setAttribute(ATTRIBUTE, theme);
    for (const relabel of controls) relabel();
    const change = { preference: readPreference(), resolved: theme };
    for (const handler of subscribers) handler(change);
    return theme;
  }

  // Applied at construction, because a manager that has not yet applied anything
  // is a page in whatever theme the markup happened to carry.
  target.setAttribute(ATTRIBUTE, resolve());

  // Subscribed once, for the manager's life, rather than on entering `'auto'` and
  // off on leaving it: one listener whose handler asks the question is simpler to
  // reason about than a subscription that is itself state — and the question is
  // the F106 clause, checked in one place.
  const onSystemChange = () => {
    if (readPreference() === 'auto') apply();
  };
  query?.addEventListener('change', onSystemChange);

  /**
   * @param {ThemePreference} next
   * @returns {void}
   */
  function set(next) {
    assertAlive('set');
    if (!isPreference(next)) {
      throw new TypeError(`${api}.set: preference must be 'light', 'dark' or 'auto'`);
    }
    // The attribute first, then the storage: a quota failure must not stop the
    // theme taking effect, and it must not be swallowed either — so it surfaces
    // as a StorageError from here, with the page already correct.
    preference = next;
    if (next === 'auto') {
      apply();
      storage.remove(key);
      return;
    }
    target.setAttribute(ATTRIBUTE, next);
    for (const relabel of controls) relabel();
    for (const handler of subscribers) handler({ preference: next, resolved: next });
    storage.set(key, next);
  }

  /**
   * @param {ThemeControlOptions} [controlOptions]
   * @returns {Element}
   */
  function control(controlOptions = {}) {
    assertAlive('control');
    assertPlainObject(controlOptions, 'options', `${api}.control`);
    const {
      labels,
      icons,
      variant,
      size,
      class: extraClass,
      document: controlDocument,
      signal: controlSignal,
      ...unknownControl
    } = controlOptions;
    assertNoUnknownOptions(unknownControl, `${api}.control`);
    if (labels !== undefined) assertPlainObject(labels, 'options.labels', `${api}.control`);
    if (icons !== undefined) assertPlainObject(icons, 'options.icons', `${api}.control`);
    if (variant !== undefined) assertToken(variant, 'options.variant', `${api}.control`);
    if (size !== undefined) assertToken(size, 'options.size', `${api}.control`);
    if (controlSignal !== undefined && !isAbortSignal(controlSignal)) {
      throw new TypeError(`${api}.control: options.signal must be an AbortSignal`);
    }

    const text = {
      light: labels?.toLight ?? 'Switch to light theme',
      dark: labels?.toDark ?? 'Switch to dark theme',
    };
    const controlDoc =
      controlDocument === undefined
        ? doc
        : resolveDocument({ document: controlDocument }, `${api}.control`);

    const button = controlDoc.createElement('button');
    button.setAttribute('type', 'button');
    // The shared builder helper rather than a hand-rolled class join: it is the
    // F52 contract every other control in this library is built with, it turns a
    // malformed token into a TypeError naming the option instead of a platform
    // DOMException, and a second implementation of "apply these classes" is a
    // second thing to keep in step.
    applyClasses(
      button,
      ['btn', variant !== undefined && `btn-${variant}`, size !== undefined && `btn-${size}`],
      extraClass,
      `${api}.control`,
    );

    /**
     * Label for the state the control will move **to** — which is the whole
     * point of F107's second half. A control reading "Dark" on a dark page is
     * announced as a statement of fact, and the user cannot tell whether pressing
     * it turns dark on or off.
     *
     * @returns {void}
     */
    function relabel() {
      const next = target.getAttribute(ATTRIBUTE) === 'dark' ? 'light' : 'dark';
      button.setAttribute('aria-label', text[next]);
      const icon = icons?.[next];
      if (icon === undefined) {
        button.textContent = text[next];
        return;
      }
      button.replaceChildren();
      // The caller's node, appended as-is: they built it for this call, and
      // cloning would surprise anyone holding a reference to it (the F52 rule).
      button.append(/** @type {any} */ (icon));
    }
    relabel();
    controls.add(relabel);

    const onClick = () => toggle();
    button.addEventListener('click', onClick);

    const release = () => {
      controls.delete(relabel);
      button.removeEventListener('click', onClick);
      controlSignal?.removeEventListener('abort', release);
    };
    controlSignal?.addEventListener('abort', release, { once: true });
    if (controlSignal?.aborted === true) release();

    return button;
  }

  /** @returns {Theme} */
  function toggle() {
    assertAlive('toggle');
    const next = resolve() === 'dark' ? 'light' : 'dark';
    set(next);
    return next;
  }

  /** @returns {void} */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    query?.removeEventListener?.('change', onSystemChange);
    subscribers.clear();
    controls.clear();
    signal?.removeEventListener('abort', destroy);
  }

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return {
    get: readPreference,
    resolved: resolve,
    set,
    toggle,
    on: (handler) => {
      assertAlive('on');
      if (typeof handler !== 'function') {
        throw new TypeError(`${api}.on: handler must be a function`);
      }
      subscribers.add(handler);
      let off = () => {
        subscribers.delete(handler);
        off = () => {};
      };
      return () => off();
    },
    control,
    destroy,
  };
}
