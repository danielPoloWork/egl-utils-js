// @vitest-environment jsdom
// Tests for theme management (roadmap 20.3, spec 07 §2 items F106-F107,
// NFR-31/NFR-34/NFR-35, ADR-0073).
//
// Spec 07 §6 asks for these over an **injected storage** and an **injected
// `matchMedia`**, which is what makes both branches of a media query and both
// halves of the persistence rule reachable without a browser. The one claim that
// cannot be made here — "before first paint" — is asserted in
// `src/test/browser/ui-theme.spec.js`, because the phrase has no meaning in jsdom.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTheme, themeSnippet } from '../../../../../main/javascript/it/d4np/utils/ui.js';
import { StorageError } from '../../../../../main/javascript/it/d4np/utils/errors.js';
import { localStorageWrapper } from '../../../../../main/javascript/it/d4np/utils/storage.js';

/**
 * A storage wrapper's shape, backed by a Map.
 *
 * The F21 wrapper's own JSON encoding is what the snippet has to decode, so this
 * double keeps it rather than storing raw strings — otherwise the
 * snippet-agrees-with-the-manager test would pass against a format neither uses.
 *
 * @param {Record<string, unknown>} [seed]
 */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    get: (key, fallback) =>
      map.has(key) ? JSON.parse(/** @type {string} */ (map.get(key))) : fallback,
    set: (key, value) => void map.set(key, JSON.stringify(value)),
    remove: (key) => void map.delete(key),
    clear: () => map.clear(),
    has: (key) => map.has(key),
    isPersistent: () => true,
  };
}

/**
 * A `matchMedia` seam whose answer can be changed, so the "system preference
 * changed" path is drivable.
 *
 * @param {boolean} [dark]
 */
function fakeMedia(dark = false) {
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const query = {
    matches: dark,
    addEventListener: (type, listener) => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === 'change') listeners.delete(listener);
    },
  };
  return {
    seam: () => query,
    query,
    listeners,
    /** @param {boolean} next */
    change(next) {
      query.matches = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** @returns {string | null} */
const applied = () => document.documentElement.getAttribute('data-bs-theme');

/**
 * A `localStorage` the snippet can read, installed as a global for the tests that
 * need one.
 *
 * **Stubbed rather than borrowed from the host**, and Node 26 is why: the ambient
 * `globalThis.localStorage` a jsdom environment exposes is not there on every
 * runtime in the support matrix, so a test that reached for it passed on Node 22
 * and 24 and failed on 26. The snippet's contract is "it reads `localStorage`";
 * supplying one is the test's job, not the host's.
 *
 * @param {Record<string, string>} [seed]
 */
function stubStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  const store = {
    getItem: (key) => (map.has(key) ? /** @type {string} */ (map.get(key)) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
  };
  vi.stubGlobal('localStorage', store);
  return { store, map };
}

afterEach(() => {
  document.documentElement.removeAttribute('data-bs-theme');
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('F106 — reading, setting and resolving', () => {
  it('applies a theme at construction, not on the first call', () => {
    // A manager that has not applied anything yet is a page in whatever theme its
    // markup happened to carry.
    const media = fakeMedia(true);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    expect(applied()).toBe('dark');
    expect(theme.get()).toBe('auto');
    expect(theme.resolved()).toBe('dark');
  });

  it('keeps the preference and the resolved theme as separate questions', () => {
    // A settings UI needs to know whether "System" is selected; a component needs
    // to know which colours to draw. One value cannot answer both.
    const media = fakeMedia(true);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    expect(theme.get()).toBe('auto');
    expect(theme.resolved()).toBe('dark');

    theme.set('light');
    expect(theme.get()).toBe('light');
    expect(theme.resolved()).toBe('light');
  });

  it('writes Bootstrap’s own attribute and nothing else', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    theme.set('dark');
    expect(applied()).toBe('dark');
    // No class of ours to keep in step with it.
    expect(document.documentElement.className).toBe('');
  });

  it('toggles the resolved theme and remembers the result', () => {
    const storage = fakeStorage();
    const theme = createTheme({ storage, matchMedia: fakeMedia(true).seam });
    // From 'auto' over a dark system: pressing a toggle expresses a choice.
    expect(theme.toggle()).toBe('light');
    expect(theme.get()).toBe('light');
    expect(applied()).toBe('light');
    expect(storage.get('egl-theme')).toBe('light');

    expect(theme.toggle()).toBe('dark');
    expect(theme.get()).toBe('dark');
  });

  it('themes a caller-supplied root instead of documentElement', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const theme = createTheme({ root, storage: fakeStorage(), matchMedia: fakeMedia().seam });
    theme.set('dark');
    expect(root.getAttribute('data-bs-theme')).toBe('dark');
    expect(applied()).toBeNull();
  });
});

describe('F106 — following the system, and stopping', () => {
  it('follows the system while no choice has been expressed', () => {
    const media = fakeMedia(false);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    expect(applied()).toBe('light');

    media.change(true);
    expect(applied()).toBe('dark');
    expect(theme.get()).toBe('auto');
  });

  it('stops following once a choice is expressed — the half that gets forgotten', () => {
    // The defect this clause exists for: a site that remembered your choice at
    // 6 pm has lost it by 7, when the OS switches to dark.
    const media = fakeMedia(false);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    theme.set('light');

    media.change(true);
    expect(applied()).toBe('light');
    expect(theme.resolved()).toBe('light');
  });

  it('follows again when the choice is withdrawn with set(auto)', () => {
    const storage = fakeStorage();
    const media = fakeMedia(true);
    const theme = createTheme({ storage, matchMedia: media.seam });
    theme.set('light');
    expect(applied()).toBe('light');

    theme.set('auto');
    // 'auto' REMOVES the stored choice rather than storing a third state, which
    // is what makes "no choice yet" and "follow the system" the same fact.
    expect(storage.has('egl-theme')).toBe(false);
    expect(theme.get()).toBe('auto');
    expect(applied()).toBe('dark');
  });

  it('treats a corrupt stored value as no choice at all', () => {
    // A corrupt key should cost a user their preference, not the page.
    const storage = fakeStorage({ 'egl-theme': 'purple' });
    const theme = createTheme({ storage, matchMedia: fakeMedia(true).seam });
    expect(theme.get()).toBe('auto');
    expect(applied()).toBe('dark');
  });

  it('resolves auto to the fallback when there is no way to ask the system', () => {
    // Node, or an exotic host: absence is a legal state, documented, not a throw.
    const theme = createTheme({ storage: fakeStorage(), matchMedia: undefined, fallback: 'dark' });
    expect(theme.get()).toBe('auto');
    expect(theme.resolved()).toBe('dark');
    expect(applied()).toBe('dark');
  });

  it('refuses a matchMedia that does not return something subscribable', () => {
    expect(() =>
      createTheme({ storage: fakeStorage(), matchMedia: () => ({ matches: true }) }),
    ).toThrow(/must return a MediaQueryList with addEventListener/);
  });

  it('unsubscribes from the media query on destroy, and leaves the page themed', () => {
    const media = fakeMedia(false);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    expect(media.listeners.size).toBe(1);

    theme.destroy();
    expect(media.listeners.size).toBe(0);
    media.change(true);
    // Still light: nothing is listening. And the attribute stays — removing it on
    // teardown would flash the default theme at every navigation.
    expect(applied()).toBe('light');
  });
});

describe('F106 — persistence through the F21 wrapper', () => {
  it('round-trips a choice through storage, so a reload keeps it', () => {
    const storage = fakeStorage();
    createTheme({ storage, matchMedia: fakeMedia(true).seam }).set('light');

    // A second manager, as a fresh page load would build.
    document.documentElement.removeAttribute('data-bs-theme');
    const reloaded = createTheme({ storage, matchMedia: fakeMedia(true).seam });
    expect(reloaded.get()).toBe('light');
    expect(applied()).toBe('light');
  });

  it('honours a caller-supplied key', () => {
    const storage = fakeStorage();
    createTheme({ storage, key: 'acme-theme', matchMedia: fakeMedia().seam }).set('dark');
    expect(storage.has('acme-theme')).toBe(true);
    expect(storage.has('egl-theme')).toBe(false);
  });

  it('applies the theme before it fails to remember it', () => {
    // A quota failure must not stop the choice taking effect — and must not be
    // swallowed either. So the attribute is already right when the error arrives.
    const storage = fakeStorage();
    storage.set = () => {
      throw new StorageError('quota exceeded');
    };
    const theme = createTheme({ storage, matchMedia: fakeMedia().seam });

    expect(() => theme.set('dark')).toThrow(StorageError);
    expect(applied()).toBe('dark');
    expect(theme.resolved()).toBe('dark');
  });

  it('defaults to the real F21 wrapper', () => {
    // Asserted THROUGH the wrapper rather than through whatever store it resolved
    // to: the claim is "the default is `localStorageWrapper`", and the wrapper's
    // whole point is that it works whether or not a real Web Storage exists
    // (ADR-0010). Reaching past it to `globalThis.localStorage` would make this
    // test a claim about the host instead — which is exactly what broke it on
    // Node 26.
    localStorageWrapper.remove('egl-theme');
    const theme = createTheme({ matchMedia: fakeMedia().seam });
    theme.set('dark');
    expect(localStorageWrapper.get('egl-theme')).toBe('dark');
    theme.destroy();
    localStorageWrapper.remove('egl-theme');
  });
});

describe('F106 — subscribers', () => {
  it('reports both the preference and the resolved theme on every change', () => {
    const media = fakeMedia(false);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    /** @type {any[]} */
    const seen = [];
    const off = theme.on((change) => seen.push(change));

    media.change(true);
    theme.set('light');
    theme.set('auto');

    expect(seen).toEqual([
      { preference: 'auto', resolved: 'dark' },
      { preference: 'light', resolved: 'light' },
      { preference: 'auto', resolved: 'dark' },
    ]);

    off();
    theme.toggle();
    expect(seen).toHaveLength(3);
  });

  it('does not notify for a system change the preference ignores', () => {
    const media = fakeMedia(false);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    theme.set('light');
    let calls = 0;
    theme.on(() => {
      calls += 1;
    });
    media.change(true);
    expect(calls).toBe(0);
  });

  it('unsubscribes idempotently', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    let calls = 0;
    const off = theme.on(() => {
      calls += 1;
    });
    off();
    off();
    theme.toggle();
    expect(calls).toBe(0);
  });

  it('rejects a handler that is not a function', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    expect(() => theme.on('later')).toThrow(/handler must be a function/);
  });
});

describe('F107 — a control that says what it will do', () => {
  it('names the state it will move to, not the state it is in', () => {
    const media = fakeMedia(false);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    const button = theme.control();

    // Light page: the offer is dark.
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
    expect(button.textContent).toBe('Switch to dark theme');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('relabels itself when the theme changes, including underneath it', () => {
    const media = fakeMedia(false);
    const theme = createTheme({ storage: fakeStorage(), matchMedia: media.seam });
    const button = theme.control();

    theme.set('dark');
    expect(button.getAttribute('aria-label')).toBe('Switch to light theme');

    theme.set('auto');
    media.change(false);
    // A system change the control did not cause still relabels it.
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
  });

  it('toggles the theme when pressed', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia(false).seam });
    const button = /** @type {HTMLElement} */ (theme.control());
    document.body.append(button);

    button.click();
    expect(applied()).toBe('dark');
    expect(button.getAttribute('aria-label')).toBe('Switch to light theme');

    button.click();
    expect(applied()).toBe('light');
  });

  it('takes caller-supplied labels, merged key by key', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia(false).seam });
    const button = theme.control({ labels: { toDark: 'Passa al tema scuro' } });
    expect(button.getAttribute('aria-label')).toBe('Passa al tema scuro');
    theme.set('dark');
    // The one not named keeps its default rather than being blanked.
    expect(button.getAttribute('aria-label')).toBe('Switch to light theme');
  });

  it('takes caller-supplied icons, and then the label is the accessible name only', () => {
    // No icon font is bundled, imported or assumed: the nodes are the caller's.
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia(false).seam });
    const moon = document.createElement('svg');
    const sun = document.createElement('svg');
    moon.id = 'moon';
    sun.id = 'sun';
    const button = theme.control({ icons: { dark: moon, light: sun } });

    expect(button.firstElementChild).toBe(moon);
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');

    theme.set('dark');
    expect(button.firstElementChild).toBe(sun);
    expect(button.getAttribute('aria-label')).toBe('Switch to light theme');
  });

  it('applies variant, size and extra classes', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    const button = theme.control({ variant: 'outline-secondary', size: 'sm', class: 'ms-2 me-1' });
    expect(button.className.split(' ').sort()).toEqual(
      ['btn', 'btn-outline-secondary', 'btn-sm', 'me-1', 'ms-2'].sort(),
    );
  });

  it('carries only `btn` when no variant is given, so the page’s own styling wins', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    expect(theme.control().className).toBe('btn');
  });

  it('releases a control on its own signal, without touching the others', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia(false).seam });
    const controller = new AbortController();
    const scoped = /** @type {HTMLElement} */ (theme.control({ signal: controller.signal }));
    const kept = theme.control();

    controller.abort();
    theme.set('dark');

    // The released one stopped relabelling and stopped toggling; the other did not.
    expect(scoped.getAttribute('aria-label')).toBe('Switch to dark theme');
    expect(kept.getAttribute('aria-label')).toBe('Switch to light theme');
    scoped.click();
    expect(applied()).toBe('dark');
  });

  it('stops relabelling every control when the manager is destroyed', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia(false).seam });
    const button = theme.control();
    theme.destroy();
    document.documentElement.setAttribute('data-bs-theme', 'dark');
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
  });

  it('builds a control that is born released when its signal already aborted', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia(false).seam });
    const button = theme.control({ signal: AbortSignal.abort() });
    theme.set('dark');
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
  });
});

describe('F107 — the snippet, which cannot drift', () => {
  /**
   * Run the snippet the way a `<script>` would.
   *
   * @param {string} source
   */
  const run = (source) => {
    new Function(source)();
  };

  it('applies a persisted theme, decoding what the F21 wrapper wrote', () => {
    stubStorage({ 'egl-theme': JSON.stringify('dark') });
    run(themeSnippet());
    expect(applied()).toBe('dark');
  });

  it('accepts a hand-set bare value too, so a key set by other means still works', () => {
    stubStorage({ 'egl-theme': 'dark' });
    run(themeSnippet());
    expect(applied()).toBe('dark');
  });

  it('falls through to the system, and then to the fallback', () => {
    stubStorage();
    // No matchMedia here; the snippet's own `window.matchMedia &&` guard is what
    // makes that a fall-through rather than a page error.
    run(themeSnippet({ fallback: 'dark' }));
    expect(applied()).toBe('dark');
  });

  it('ignores a corrupt stored value rather than applying it', () => {
    stubStorage({ 'egl-theme': JSON.stringify('chartreuse') });
    run(themeSnippet({ fallback: 'light' }));
    expect(applied()).toBe('light');
  });

  it('survives a storage that throws on access alone', () => {
    // A blocked-cookies context can throw on the accessor itself, and a theme is
    // never worth a page error — which is why the whole snippet is in a `try`.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('access denied');
      },
    });
    expect(() => run(themeSnippet({ fallback: 'dark' }))).not.toThrow();
    // Nothing applied, because the throw happened before the fall-through could.
    expect(applied()).toBeNull();
  });

  it('agrees with the manager, key for key and value for value', () => {
    // The whole reason the snippet is emitted rather than documented: this test
    // fails the moment either side changes its key, its encoding or its attribute.
    for (const [stored, systemDark, expected] of [
      ['dark', false, 'dark'],
      ['light', true, 'light'],
      [undefined, true, 'dark'],
      [undefined, false, 'light'],
    ]) {
      const key = 'acme-theme';
      // One store for both sides, seeded the way the F21 wrapper writes.
      const { store } = stubStorage(stored === undefined ? {} : { [key]: JSON.stringify(stored) });
      /** @type {any} */ (globalThis.window).matchMedia = () => ({ matches: systemDark });

      // The snippet's path.
      document.documentElement.removeAttribute('data-bs-theme');
      run(themeSnippet({ key }));
      const fromSnippet = applied();

      // The manager's path: the same key, the same store, the same system answer.
      document.documentElement.removeAttribute('data-bs-theme');
      const theme = createTheme({
        key,
        storage: {
          get: (k, fallback) => {
            const raw = store.getItem(k);
            return raw === null ? fallback : JSON.parse(raw);
          },
          set: (k, value) => store.setItem(k, JSON.stringify(value)),
          remove: (k) => store.removeItem(k),
          clear: () => {},
          has: (k) => store.getItem(k) !== null,
          isPersistent: () => true,
        },
        matchMedia: () => ({
          matches: systemDark,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      });
      const fromManager = applied();
      theme.destroy();

      expect(fromSnippet).toBe(expected);
      expect(fromManager).toBe(expected);
      delete (/** @type {any} */ (globalThis.window).matchMedia);
    }
  });

  it('cannot be closed early by its own key', () => {
    // A key is not user input today, and a `</script>` in one would still end the
    // element. Escaping `<` costs nothing and removes the class of problem.
    const source = themeSnippet({ key: '</script><img src=x onerror=alert(1)>' });
    expect(source).not.toContain('</script>');
    expect(source).toContain('\\u003C/script>');
  });

  it('is pure: no DOM, no storage, no globals touched', () => {
    const before = applied();
    themeSnippet();
    themeSnippet({ key: 'other', fallback: 'dark' });
    expect(applied()).toBe(before);
  });

  it('rejects a malformed or unknown option', () => {
    expect(() => themeSnippet({ key: '' })).toThrow(/options\.key must be a non-empty string/);
    expect(() => themeSnippet({ fallback: 'auto' })).toThrow(
      /options\.fallback must be 'light' or 'dark'/,
    );
    expect(() => themeSnippet({ attribute: 'data-theme' })).toThrow(
      /themeSnippet: unknown option 'attribute'/,
    );
  });
});

describe('options, teardown and two managers', () => {
  it('rejects an unknown key on the manager and on control', () => {
    expect(() => createTheme({ attribute: 'data-theme' })).toThrow(
      /createTheme: unknown option 'attribute'/,
    );
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    expect(() => theme.control({ label: 'x' })).toThrow(
      /createTheme\.control: unknown option 'label'/,
    );
  });

  it('rejects malformed options, naming the option', () => {
    expect(() => createTheme({ root: 'html' })).toThrow(/options\.root must be an Element/);
    expect(() => createTheme({ storage: {} })).toThrow(
      /options\.storage must be a storage wrapper/,
    );
    expect(() => createTheme({ key: '' })).toThrow(/options\.key must be a non-empty string/);
    expect(() => createTheme({ matchMedia: 'dark' })).toThrow(
      /options\.matchMedia must be a function/,
    );
    expect(() => createTheme({ fallback: 'auto' })).toThrow(
      /options\.fallback must be 'light' or 'dark'/,
    );
    expect(() => createTheme({ signal: 'later' })).toThrow(
      /options\.signal must be an AbortSignal/,
    );

    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    expect(() => theme.set('purple')).toThrow(/preference must be 'light', 'dark' or 'auto'/);
    expect(() => theme.control({ variant: 'not a token' })).toThrow(/options\.variant/);
    expect(() => theme.control({ size: 'not a token' })).toThrow(/options\.size/);
    expect(() => theme.control({ labels: 'dark' })).toThrow(/options\.labels/);
    expect(() => theme.control({ icons: 'moon' })).toThrow(/options\.icons/);
    expect(() => theme.control({ signal: 'later' })).toThrow(
      /control: options\.signal must be an AbortSignal/,
    );
    // Through the shared F52 helper, so a malformed class is a TypeError naming
    // the option rather than a platform DOMException.
    expect(() => theme.control({ class: 7 })).toThrow(
      /options\.class must be a string or an array of strings/,
    );
  });

  it('splits a space-separated class the way the shared helper does', () => {
    // 'ms-2 me-1' is one natural value rather than a mistake, and that rule is
    // the F52 helper's rather than a second one here.
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    const button = theme.control({ class: 'ms-2 me-1' });
    expect(button.classList.contains('ms-2')).toBe(true);
    expect(button.classList.contains('me-1')).toBe(true);
  });

  it('builds a control in an explicitly supplied document', () => {
    // The same NFR-14 seam every builder takes: an iframe, a popup, or a
    // server-side DOM.
    const other = document.implementation.createHTMLDocument('other');
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    const button = theme.control({ document: other });
    expect(button.ownerDocument).toBe(other);
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
  });

  it('accepts an array of class tokens', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    const button = theme.control({ class: ['ms-2', 'text-nowrap'] });
    expect(button.classList.contains('ms-2')).toBe(true);
    expect(button.classList.contains('text-nowrap')).toBe(true);
  });

  it('throws after destroy, on every command', () => {
    const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeMedia().seam });
    theme.destroy();
    expect(() => theme.set('dark')).toThrow(/createTheme: set\(\) was called after destroy/);
    expect(() => theme.toggle()).toThrow(/toggle\(\) was called after destroy/);
    expect(() => theme.control()).toThrow(/control\(\) was called after destroy/);
    expect(() => theme.on(() => {})).toThrow(/on\(\) was called after destroy/);
    // Queries keep answering: they read the page and the storage, which still
    // exist (ADR-0049 — commands throw, queries answer).
    expect(() => theme.get()).not.toThrow();
    expect(() => theme.resolved()).not.toThrow();
    expect(() => theme.destroy()).not.toThrow();
  });

  it('destroys on its signal, and is born destroyed by an aborted one', () => {
    const controller = new AbortController();
    const media = fakeMedia();
    const theme = createTheme({
      storage: fakeStorage(),
      matchMedia: media.seam,
      signal: controller.signal,
    });
    controller.abort();
    expect(media.listeners.size).toBe(0);
    expect(() => theme.set('dark')).toThrow(/after destroy/);

    const already = createTheme({
      storage: fakeStorage(),
      matchMedia: fakeMedia().seam,
      signal: AbortSignal.abort(),
    });
    expect(() => already.toggle()).toThrow(/after destroy/);
    // It still applied a theme on the way in: construction is what themes the
    // page, and an aborted signal tears down the tracking rather than the paint.
    expect(applied()).toBe('light');
  });

  it('keeps two managers independent — different roots, keys and systems', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    const a = createTheme({
      root: first,
      key: 'a',
      storage: fakeStorage(),
      matchMedia: fakeMedia(true).seam,
    });
    const b = createTheme({
      root: second,
      key: 'b',
      storage: fakeStorage(),
      matchMedia: fakeMedia(false).seam,
    });

    expect(first.getAttribute('data-bs-theme')).toBe('dark');
    expect(second.getAttribute('data-bs-theme')).toBe('light');

    a.set('light');
    expect(second.getAttribute('data-bs-theme')).toBe('light');
    b.set('dark');
    expect(first.getAttribute('data-bs-theme')).toBe('light');

    a.destroy();
    b.set('light');
    expect(second.getAttribute('data-bs-theme')).toBe('light');
  });

  it('uses the ambient matchMedia when none is injected', () => {
    // The default seam, exercised rather than assumed — it is the branch every
    // real page takes.
    const matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    /** @type {any} */ (globalThis).matchMedia = matchMedia;
    const theme = createTheme({ storage: fakeStorage() });
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(theme.resolved()).toBe('dark');
    theme.destroy();
    delete (/** @type {any} */ (globalThis).matchMedia);
  });
});
