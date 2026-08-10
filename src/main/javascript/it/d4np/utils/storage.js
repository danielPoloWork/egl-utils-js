/**
 * egl-utils-js/storage — browser-leaning storage helpers (spec §2 items
 * 21–23; **stateful** by contract). Kept off the root entry so Node-only
 * consumers never pull browser-leaning code (spec §4).
 *
 * `localStorageWrapper` and `sessionStorageWrapper` are safe interfaces over
 * the Web Storage API with a documented **in-memory fallback**: when the real
 * store is unavailable (Node, private browsing, disabled storage, sandboxed
 * iframe) operations transparently use a per-wrapper `Map` instead of
 * throwing. Values are JSON-(de)serialized; a genuine quota failure surfaces
 * as {@link StorageError}.
 *
 * `cookieHelper` is a security surface (ADR-0011): its attribute defaults
 * (`SameSite=Lax`, `Secure` on HTTPS, `Path=/`) *are* the security posture,
 * and it percent-encodes names/values so a value can never inject cookie
 * attributes. It reads and writes **only** cookies visible to
 * `document.cookie` — `HttpOnly` cookies are invisible to client-side
 * JavaScript by design, and this module makes no claim otherwise.
 *
 * Every options bag on this entry **rejects a key it does not know** with a
 * `TypeError` naming it: the destructuring is the schema (ADR-0047).
 *
 * @module egl-utils-js/storage
 */

import { StorageError } from './errors.js';
import { uuid } from './crypto.js';
import { assertNoUnknownOptions } from './option-keys.js';

const PROBE_KEY = '__egl_storage_probe__';

/**
 * @typedef {object} StorageLike
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 * @property {() => void} clear
 */

/**
 * A `Map`-backed {@link StorageLike} — the fallback when no real Web Storage
 * is usable. Semantics mirror the platform: missing key → `null`, values
 * coerced to strings.
 *
 * @returns {StorageLike}
 */
function createMemoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? /** @type {string} */ (map.get(key)) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

/**
 * Resolve a usable real storage or `undefined`. Accessing the global can
 * throw (SecurityError in sandboxed iframes) and private browsing may reject
 * writes, so availability is proven with a write+remove probe rather than an
 * existence check.
 *
 * @param {() => Storage | undefined} getStorage
 * @returns {StorageLike | undefined}
 */
function probeRealStorage(getStorage) {
  try {
    const storage = getStorage();
    if (storage === undefined || storage === null) return undefined;
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return undefined;
  }
}

/**
 * @typedef {object} StorageWrapper
 * @property {(key: string, defaultValue?: unknown) => unknown} get - Parse and
 *   return the JSON value stored at `key`, or `defaultValue` (default
 *   `undefined`) when absent.
 * @property {(key: string, value: unknown) => void} set - JSON-serialize
 *   `value` and store it at `key`.
 * @property {(key: string) => void} remove - Delete `key`.
 * @property {() => void} clear - Delete every key.
 * @property {(key: string) => boolean} has - Whether `key` is present.
 * @property {() => boolean} isPersistent - Whether the wrapper resolved to a
 *   real Web Storage (`true`) or the in-memory fallback (`false`); resolves
 *   the backing store on first call.
 */

/** @param {unknown} key @returns {asserts key is string} */
function assertKey(key) {
  if (typeof key !== 'string') {
    throw new TypeError('key must be a string');
  }
}

/**
 * Build a storage wrapper over a lazily-resolved backing store (shared by
 * both exports; local vs session differ only in which global they read). The
 * store is resolved once, on first use — never at module load, so importing
 * this module has no side effects and is safe in Node (`sideEffects: false`).
 *
 * @param {() => Storage | undefined} getStorage
 * @param {string} label - Human name for error messages (`'localStorage'`).
 * @returns {StorageWrapper}
 */
function createStorageWrapper(getStorage, label) {
  /** @type {StorageLike | undefined} */
  let store;
  /** @type {boolean} */
  let persistent = false;

  /** @returns {StorageLike} */
  function backing() {
    if (store === undefined) {
      const real = probeRealStorage(getStorage);
      persistent = real !== undefined;
      store = real ?? createMemoryStorage();
    }
    return store;
  }

  return {
    get(key, defaultValue) {
      assertKey(key);
      const raw = backing().getItem(key);
      if (raw === null) return defaultValue;
      try {
        return JSON.parse(raw);
      } catch (cause) {
        throw new StorageError(
          `Failed to parse stored JSON for key ${JSON.stringify(key)} in ${label}`,
          { cause },
        );
      }
    },

    set(key, value) {
      assertKey(key);
      const raw = JSON.stringify(value);
      if (raw === undefined) {
        throw new TypeError(
          `value for key ${JSON.stringify(key)} is not JSON-serializable (undefined, a function, or a symbol)`,
        );
      }
      try {
        backing().setItem(key, raw);
      } catch (cause) {
        throw new StorageError(
          `Failed to write key ${JSON.stringify(key)} to ${label} (quota exceeded?)`,
          { cause },
        );
      }
    },

    remove(key) {
      assertKey(key);
      backing().removeItem(key);
    },

    clear() {
      backing().clear();
    },

    has(key) {
      assertKey(key);
      return backing().getItem(key) !== null;
    },

    isPersistent() {
      backing(); // ensure resolution has happened
      return persistent;
    },
  };
}

/**
 * Safe wrapper over `localStorage` (spec §2 item 21). See {@link StorageWrapper}.
 */
export const localStorageWrapper = createStorageWrapper(
  () => /** @type {Storage | undefined} */ (globalThis.localStorage),
  'localStorage',
);

/**
 * Safe wrapper over `sessionStorage` (spec §2 item 22). Same contract as
 * {@link localStorageWrapper} over `sessionStorage`.
 */
export const sessionStorageWrapper = createStorageWrapper(
  () => /** @type {Storage | undefined} */ (globalThis.sessionStorage),
  'sessionStorage',
);

// ---------------------------------------------------------------------------
// pageSessionId (spec 02 §2 item F39, ADR-0024)
// ---------------------------------------------------------------------------

/** Namespaced so it cannot collide with an application's own session keys. */
const PAGE_SESSION_ID_KEY = 'egl.pageSessionId';

/**
 * @typedef {object} PageSessionIdOptions
 * @property {string} [key='egl.pageSessionId'] - Storage key holding the id.
 *   Distinct keys yield distinct, independent ids.
 * @property {StorageWrapper} [storage] - Where to persist it; defaults to
 *   {@link sessionStorageWrapper}. Injectable for tests, or to scope the id to
 *   `localStorage` semantics instead (see the caveat below).
 */

/**
 * Get — or mint, once — a stable identifier for this browser tab
 * (spec 02 F39, ADR-0024).
 *
 * The id is a v4 UUID from the platform CSPRNG (ADR-0008), stored under
 * `sessionStorage` semantics: it **survives reloads and in-tab navigation, dies
 * with the tab, and differs between tabs** — which is exactly the scope needed
 * to correlate a user's log lines, telemetry, or requests within one browsing
 * session without identifying the user.
 *
 * **It is a correlation id, not a credential.** Nothing about it is
 * authenticated, and it is readable by any script on the page; never use it to
 * authorize anything (ADR-0024 records why).
 *
 * Degradation is silent by design, because a diagnostics helper must not be the
 * thing that breaks a page: where storage is unavailable or blocked (Node,
 * private browsing, a sandboxed iframe) the wrapper's in-memory fallback takes
 * over and the id is stable only for the life of the realm — so a reload mints
 * a new one. A value that cannot be read back (another script overwrote the key
 * with non-JSON) is replaced rather than thrown over. Use
 * `sessionStorageWrapper.isPersistent()` when the difference matters.
 *
 * @example
 * const tabId = pageSessionId();
 * log.info(`[${tabId}] checkout started`); // same id after F5, different in a new tab
 *
 * @example
 * // Independent ids for independent concerns:
 * const traceId = pageSessionId({ key: 'app.traceId' });
 *
 * @param {PageSessionIdOptions} [options]
 * @returns {string} The tab's id — the same string on every call with the same
 *   key, for as long as the backing store keeps it.
 * @throws {TypeError} If `key` is not a string, or `storage` is not a
 *   {@link StorageWrapper}.
 */
export function pageSessionId(options = {}) {
  const { key = PAGE_SESSION_ID_KEY, storage = sessionStorageWrapper, ...unknown } = options;
  assertNoUnknownOptions(unknown, 'pageSessionId');
  assertKey(key);
  if (typeof storage?.get !== 'function' || typeof storage?.set !== 'function') {
    throw new TypeError('options.storage must be a StorageWrapper with get and set');
  }

  try {
    const existing = storage.get(key);
    if (typeof existing === 'string' && existing !== '') return existing;
  } catch {
    // Unreadable (non-JSON left by another script): mint a fresh id below
    // rather than propagate a StorageError out of a diagnostics helper.
  }

  const id = uuid();
  try {
    storage.set(key, id);
  } catch {
    // Quota or a read-only store: the id is still valid for this call, it just
    // will not survive a reload. Losing correlation beats breaking the page.
  }
  return id;
}

// ---------------------------------------------------------------------------
// cookieHelper (spec §2 item 23, ADR-0011)
// ---------------------------------------------------------------------------

/** Warn at most once per process that cookies are unavailable — not per call. */
let cookieWarningIssued = false;

/**
 * The live `document` if it exposes a `cookie` property, else `undefined`.
 * Reading the global can throw in exotic embeddings, hence the `try`.
 *
 * @returns {Document | undefined}
 */
function getCookieDocument() {
  try {
    const doc = /** @type {Document | undefined} */ (globalThis.document);
    if (doc === undefined || doc === null) return undefined;
    return typeof doc.cookie === 'string' ? doc : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Emit the one-time no-op warning (spec §2 item 23: "no-ops with a warning in
 * Node"). Kept to a single warning so a server-rendered app does not flood
 * its logs on every call.
 *
 * @param {string} operation
 * @returns {void}
 */
function warnNoCookies(operation) {
  if (cookieWarningIssued) return;
  cookieWarningIssued = true;
  // The documented Node-side signal (spec §2 item 23).
  console.warn(
    `egl-utils-js: cookieHelper.${operation}() is a no-op — document.cookie is ` +
      'unavailable in this environment (Node?). Cookies are a browser-only surface.',
  );
}

/**
 * Whether `code` is a valid RFC 6265 cookie-name character: a US-ASCII
 * `token` character — printable, and none of the separators. Rejecting
 * anything else is what stops a crafted name from injecting `;`-delimited
 * attributes. Hand-rolled scan, no regex (ADR-0005 house style).
 *
 * @param {number} code
 * @returns {boolean}
 */
function isCookieNameCode(code) {
  if (code <= 0x20 || code >= 0x7f) return false; // CTLs, space, DEL, non-ASCII
  switch (code) {
    case 0x28: // (
    case 0x29: // )
    case 0x3c: // <
    case 0x3e: // >
    case 0x40: // @
    case 0x2c: // ,
    case 0x3b: // ;
    case 0x3a: // :
    case 0x5c: // \
    case 0x22: // "
    case 0x2f: // /
    case 0x5b: // [
    case 0x5d: // ]
    case 0x3f: // ?
    case 0x3d: // =
    case 0x7b: // {
    case 0x7d: // }
      return false;
    default:
      return true;
  }
}

/**
 * @param {unknown} name
 * @returns {asserts name is string}
 */
function assertCookieName(name) {
  if (typeof name !== 'string') {
    throw new TypeError('cookie name must be a string');
  }
  if (name.length === 0) {
    throw new TypeError('cookie name must not be empty');
  }
  for (let i = 0; i < name.length; i += 1) {
    if (!isCookieNameCode(name.charCodeAt(i))) {
      throw new TypeError(
        `cookie name ${JSON.stringify(name)} contains an invalid character at position ${i} ` +
          '(RFC 6265 tokens exclude control characters, spaces, and ()<>@,;:\\"/[]?={})',
      );
    }
  }
}

/**
 * Decode a percent-encoded cookie component, tolerating values this library
 * did not write: a server or another script may store a raw `%` that is not a
 * valid escape, and `decodeURIComponent` throws `URIError` on those. Reading a
 * cookie must never throw, so an undecodable value is returned verbatim.
 *
 * @param {string} raw
 * @returns {string}
 */
function decodeComponent(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Guard the attribute bag before reading it. Without this, a `null` or
 * primitive argument fails later with a cryptic engine message ("Cannot use
 * 'in' operator…" / "Cannot destructure…"); the library validates programmer
 * errors eagerly and says what was wrong.
 *
 * @param {unknown} attributes
 * @returns {asserts attributes is Record<string, unknown>}
 */
function assertAttributes(attributes) {
  if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) {
    throw new TypeError('attributes must be a plain object');
  }
}

/**
 * @typedef {object} CookieAttributes
 * @property {number} [maxAge] - Lifetime in **seconds** (non-negative
 *   integer). Omitted → a session cookie. Use `remove` to delete.
 * @property {string} [path] - URL path scope; default `'/'`.
 * @property {string} [domain] - Domain scope; omitted → the current host only
 *   (the narrower, safer default — a `Domain` attribute widens scope to
 *   subdomains).
 * @property {'Strict' | 'Lax' | 'None'} [sameSite] - Cross-site policy;
 *   default `'Lax'`. `'None'` requires `secure: true` (browsers reject it
 *   otherwise) and is refused without it.
 * @property {boolean} [secure] - Restrict to HTTPS. Default: `true` when the
 *   page is served over HTTPS, `false` otherwise (so `http://localhost`
 *   development still works), never silently dropping the flag on a secure
 *   page.
 */

/**
 * @typedef {object} CookieHelper
 * @property {(name: string) => string | undefined} get
 * @property {() => Record<string, string>} getAll
 * @property {(name: string, value: string, attributes?: CookieAttributes) => void} set
 * @property {(name: string, attributes?: Pick<CookieAttributes, 'path' | 'domain'>) => void} remove
 * @property {() => boolean} isSupported
 */

/**
 * Read, write, and delete cookies visible to `document.cookie` (spec §2 item
 * 23, ADR-0011).
 *
 * **Security posture — the defaults are the feature:** `SameSite=Lax` (CSRF
 * mitigation without breaking top-level navigation), `Secure` automatically on
 * HTTPS pages, and `Path=/` (explicit, rather than the surprising
 * current-directory default). Names are validated as RFC 6265 tokens and
 * values are percent-encoded, so **a value can never inject an attribute**
 * (`'x; Domain=evil.example'` is stored as data, not parsed as a directive).
 *
 * **`HttpOnly` is not offered.** Such cookies are invisible to client-side
 * JavaScript by design — no library can read or set them from a page, and
 * passing `httpOnly` is refused with a `TypeError` rather than silently
 * ignored, so a caller never believes they got a protection they did not.
 *
 * Outside a browser (`document.cookie` absent) every operation **no-ops with
 * a one-time warning**: `get`/`getAll` return `undefined`/`{}`,
 * `set`/`remove` do nothing. `isSupported()` reports which mode is active.
 *
 * @example
 * cookieHelper.set('theme', 'dark', { maxAge: 60 * 60 * 24 * 365 });
 * cookieHelper.get('theme'); // 'dark'
 * cookieHelper.remove('theme');
 *
 * @type {CookieHelper}
 */
export const cookieHelper = {
  get(name) {
    assertCookieName(name);
    const doc = getCookieDocument();
    if (doc === undefined) {
      warnNoCookies('get');
      return undefined;
    }
    for (const pair of doc.cookie.split(';')) {
      const eq = pair.indexOf('=');
      // A bare `name` with no `=` is a valueless cookie; treat it as ''.
      const rawName = (eq === -1 ? pair : pair.slice(0, eq)).trim();
      if (rawName === '') continue;
      if (decodeComponent(rawName) === name) {
        return eq === -1 ? '' : decodeComponent(pair.slice(eq + 1).trim());
      }
    }
    return undefined;
  },

  getAll() {
    const doc = getCookieDocument();
    if (doc === undefined) {
      warnNoCookies('getAll');
      return {};
    }
    /** @type {Record<string, string>} */
    const all = Object.create(null);
    for (const pair of doc.cookie.split(';')) {
      const eq = pair.indexOf('=');
      const rawName = (eq === -1 ? pair : pair.slice(0, eq)).trim();
      if (rawName === '') continue;
      const key = decodeComponent(rawName);
      // First occurrence wins: the browser lists the most specific path first.
      if (key in all) continue;
      all[key] = eq === -1 ? '' : decodeComponent(pair.slice(eq + 1).trim());
    }
    return all;
  },

  set(name, value, attributes = {}) {
    assertCookieName(name);
    if (typeof value !== 'string') {
      throw new TypeError('cookie value must be a string');
    }
    assertAttributes(attributes);
    if ('httpOnly' in attributes) {
      throw new TypeError(
        'HttpOnly cannot be set from client-side JavaScript — such cookies are ' +
          'invisible to document.cookie by design. Set it on the server (Set-Cookie).',
      );
    }
    const { maxAge, path = '/', domain, sameSite = 'Lax', secure, ...unknown } = attributes;
    assertNoUnknownOptions(unknown, 'cookieHelper.set', 'attribute');

    if (maxAge !== undefined && (!Number.isSafeInteger(maxAge) || maxAge < 0)) {
      throw new TypeError('maxAge must be a non-negative integer number of seconds');
    }
    if (typeof path !== 'string' || path.includes(';')) {
      throw new TypeError('path must be a string without ";"');
    }
    if (domain !== undefined && (typeof domain !== 'string' || domain.includes(';'))) {
      throw new TypeError('domain must be a string without ";"');
    }
    const normalizedSameSite =
      typeof sameSite === 'string'
        ? sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase()
        : undefined;
    if (
      normalizedSameSite !== 'Strict' &&
      normalizedSameSite !== 'Lax' &&
      normalizedSameSite !== 'None'
    ) {
      throw new TypeError("sameSite must be one of 'Strict', 'Lax', 'None'");
    }
    if (secure !== undefined && typeof secure !== 'boolean') {
      throw new TypeError('secure must be a boolean');
    }

    const doc = getCookieDocument();
    if (doc === undefined) {
      warnNoCookies('set');
      return;
    }

    // Default: secure on an HTTPS page, plain on http (so localhost dev works).
    let isSecure = secure;
    if (isSecure === undefined) {
      let protocol;
      try {
        protocol = globalThis.location?.protocol;
      } catch {
        protocol = undefined;
      }
      isSecure = protocol === 'https:';
    }
    if (normalizedSameSite === 'None' && !isSecure) {
      throw new TypeError(
        "sameSite: 'None' requires secure: true — browsers reject SameSite=None " +
          'cookies sent without the Secure attribute',
      );
    }

    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    cookie += `; Path=${path}`;
    if (domain !== undefined) cookie += `; Domain=${domain}`;
    if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
    cookie += `; SameSite=${normalizedSameSite}`;
    if (isSecure) cookie += '; Secure';
    doc.cookie = cookie;
  },

  remove(name, attributes = {}) {
    assertCookieName(name);
    assertAttributes(attributes);
    // A cookie can only be deleted by a write whose Path/Domain match the
    // ones it was created with — hence both are forwarded, not assumed.
    const { path = '/', domain, ...unknown } = attributes;
    assertNoUnknownOptions(unknown, 'cookieHelper.remove', 'attribute');
    const doc = getCookieDocument();
    if (doc === undefined) {
      warnNoCookies('remove');
      return;
    }
    /** @type {CookieAttributes} */
    const expire = { maxAge: 0, path, sameSite: 'Lax' };
    if (domain !== undefined) expire.domain = domain;
    cookieHelper.set(name, '', expire);
  },

  isSupported() {
    return getCookieDocument() !== undefined;
  },
};
