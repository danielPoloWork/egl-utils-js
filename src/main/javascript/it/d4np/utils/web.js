/**
 * egl-utils-js — web utilities (spec §2 items 16–17, **stateful** by
 * contract: a client instance holds its configuration; individual requests
 * are otherwise independent).
 *
 * `httpClient` is a security surface: it handles the `Authorization` header.
 * Its contract (ADR-0007) is **no token storage** — the `auth` callback is
 * invoked per request and its return value is attached and forgotten, so
 * rotation and revocation stay entirely in the caller's hands.
 *
 * @module egl-utils-js/web
 */

/**
 * Build a query string from a plain object (spec §2 item 17): each own
 * enumerable key becomes one or more `key=value` pairs via the platform
 * `URLSearchParams` (percent-encoding, ordering, and multi-value semantics
 * all ride the platform). An array value produces one repeated key per
 * element, in array order; `null`/`undefined` values (and array elements)
 * are skipped entirely rather than serialized as `"null"`/`"undefined"`.
 * Every other value is coerced with `String(...)`.
 *
 * @example
 * urlSearchParams({ q: 'a b', tag: ['x', 'y'], page: 2, empty: undefined });
 * // 'q=a+b&tag=x&tag=y&page=2'
 *
 * @param {Record<string, unknown>} params
 * @returns {string} A query string with no leading `?`.
 * @throws {TypeError} If `params` is not a plain object.
 */
export function urlSearchParams(params) {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new TypeError('params must be a plain object');
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === null || item === undefined) continue;
      search.append(key, String(item));
    }
  }
  return search.toString();
}

import { HttpError } from './errors.js';
import { timeout as withTimeout } from './async.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertPositiveMilliseconds(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number of milliseconds`);
  }
}

/**
 * Whether a response's media type is JSON — `application/json` or any
 * `…+json` structured suffix (e.g. `application/problem+json`). String
 * comparison on the media type before any `;` parameters; no sniffing.
 *
 * @param {string | null} contentType
 * @returns {boolean}
 */
function isJsonMediaType(contentType) {
  if (!contentType) return false;
  const semicolon = contentType.indexOf(';');
  const mediaType = (semicolon === -1 ? contentType : contentType.slice(0, semicolon))
    .trim()
    .toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

/**
 * Parse a response body per its declared content type: JSON media types are
 * parsed (empty body → `undefined`), everything else returns text; `204 No
 * Content` returns `undefined` without reading.
 *
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
async function parseBody(response) {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (isJsonMediaType(response.headers.get('content-type'))) {
    return text === '' ? undefined : JSON.parse(text);
  }
  return text;
}

/**
 * @typedef {object} RequestOptions
 * @property {Record<string, string>} [headers] - Per-request headers; merged
 *   case-insensitively over the client's base headers (request wins).
 * @property {unknown} [json] - A value to send as the JSON body
 *   (`JSON.stringify` + `content-type: application/json` unless overridden).
 *   Mutually exclusive with `body`.
 * @property {BodyInit} [body] - A raw fetch body. Mutually exclusive with `json`.
 * @property {AbortSignal} [signal] - Cancels the request (ADR-0004 semantics:
 *   rejects with `AbortError`, `cause` = `signal.reason`).
 * @property {number} [timeout] - Per-request time budget in ms, overriding
 *   the client default; on expiry the request rejects with `TimeoutError`
 *   and the underlying fetch is aborted.
 */

/**
 * @typedef {object} HttpClient
 * @property {(path: string, options?: RequestOptions & { method?: string }) => Promise<unknown>} request
 * @property {(path: string, options?: RequestOptions) => Promise<unknown>} get
 * @property {(path: string, options?: RequestOptions) => Promise<unknown>} post
 * @property {(path: string, options?: RequestOptions) => Promise<unknown>} put
 * @property {(path: string, options?: RequestOptions) => Promise<unknown>} patch
 * @property {(path: string, options?: RequestOptions) => Promise<unknown>} delete
 */

/**
 * Create a small typed facade over `fetch` (spec §2 item 16, ADR-0007;
 * Facade — docs/patterns).
 *
 * - **Timeouts**: every request runs under the library's own
 *   {@link timeout} combinator — the default
 *   (30 000 ms) or per-request budget is merged with the caller's `signal`,
 *   the underlying fetch receives the merged signal (it genuinely stops), and
 *   expiry rejects with `TimeoutError` / caller cancellation with
 *   `AbortError` (ADR-0004).
 * - **Auth**: the `auth` callback runs once per request; a returned token is
 *   attached as `Authorization: Bearer <token>` and never stored. Returning
 *   `undefined` sends no header; a thrown/rejected `auth` fails the request
 *   **before** anything is sent (fail-closed). An explicit `Authorization`
 *   header (client or request level) wins and `auth` is not called.
 * - **JSON**: response bodies are parsed only when the content type is a JSON
 *   media type (`application/json` or `…+json`); others return text; `204` /
 *   empty JSON bodies return `undefined`. Non-2xx responses reject with
 *   {@link HttpError} carrying `status` and the parsed `body`.
 * - **Non-goals** (documented, composable): no retries (wrap calls in
 *   `retry`), no redirect/cookie policy (fetch defaults), no query-string
 *   building, no streaming.
 *
 * @example
 * const api = httpClient({
 *   baseUrl: 'https://api.example.test/v1/',
 *   auth: () => tokenStore.current(), // called per request — never cached here
 * });
 * const user = await api.get('users/42', { timeout: 5_000, signal });
 *
 * @param {object} [config]
 * @param {string} [config.baseUrl] - Base URL request paths resolve against.
 * @param {number} [config.timeout] - Default time budget per request in ms
 *   (default 30 000).
 * @param {() => (string | undefined | Promise<string | undefined>)} [config.auth]
 *   - Per-request token supplier; see above.
 * @param {Record<string, string>} [config.headers] - Base headers for every
 *   request.
 * @param {typeof fetch} [config.fetch] - The fetch implementation (default
 *   `globalThis.fetch`); injectable for tests and polyfills.
 * @returns {HttpClient}
 * @throws {TypeError} On an invalid configuration value.
 */
export function httpClient(config = {}) {
  const {
    baseUrl,
    timeout: defaultTimeout = DEFAULT_TIMEOUT_MS,
    auth,
    headers: baseHeaders = {},
    fetch: fetchImpl = globalThis.fetch,
  } = config;

  if (baseUrl !== undefined && typeof baseUrl !== 'string') {
    throw new TypeError('baseUrl must be a string');
  }
  assertPositiveMilliseconds(defaultTimeout, 'timeout');
  if (auth !== undefined && typeof auth !== 'function') {
    throw new TypeError('auth must be a function');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch must be a function (no global fetch available?)');
  }

  /**
   * @param {string} path
   * @param {RequestOptions & { method?: string }} [options]
   * @returns {Promise<unknown>}
   */
  async function request(path, options = {}) {
    if (typeof path !== 'string') {
      throw new TypeError('path must be a string');
    }
    const { method = 'GET', headers = {}, json, body, signal, timeout: perRequest } = options;
    if (json !== undefined && body !== undefined) {
      throw new TypeError('json and body are mutually exclusive');
    }
    const budget = perRequest ?? defaultTimeout;
    if (perRequest !== undefined) assertPositiveMilliseconds(perRequest, 'timeout');

    const url = baseUrl === undefined ? path : new URL(path, baseUrl).toString();

    return withTimeout(
      async (mergedSignal) => {
        // Case-insensitive merge: base headers first, request headers win.
        const finalHeaders = new Headers(baseHeaders);
        for (const [name, value] of new Headers(headers)) {
          finalHeaders.set(name, value);
        }

        // Auth: explicit Authorization anywhere wins; otherwise ask the
        // callback for a fresh token — attached and forgotten (ADR-0007).
        if (auth !== undefined && !finalHeaders.has('authorization')) {
          const token = await auth();
          if (token !== undefined && token !== null && token !== '') {
            if (typeof token !== 'string') {
              throw new TypeError('auth must return a string token or undefined');
            }
            finalHeaders.set('authorization', `Bearer ${token}`);
          }
        }

        let requestBody = body;
        if (json !== undefined) {
          requestBody = JSON.stringify(json);
          if (!finalHeaders.has('content-type')) {
            finalHeaders.set('content-type', 'application/json');
          }
        }

        const response = await fetchImpl(url, {
          method,
          headers: finalHeaders,
          body: requestBody,
          signal: mergedSignal,
        });
        const parsed = await parseBody(response);
        if (!response.ok) {
          throw new HttpError(`HTTP ${response.status} for ${method} ${url}`, {
            status: response.status,
            body: parsed,
          });
        }
        return parsed;
      },
      budget,
      { signal },
    );
  }

  /** @param {string} method @returns {(path: string, options?: RequestOptions) => Promise<unknown>} */
  const verb =
    (method) =>
    (path, options = {}) =>
      request(path, { ...options, method });

  return {
    request,
    get: verb('GET'),
    post: verb('POST'),
    put: verb('PUT'),
    patch: verb('PATCH'),
    delete: verb('DELETE'),
  };
}

// ---------------------------------------------------------------------------
// createResource (spec 02 §2 item F38, ADR-0025) — Repository, docs/patterns
// ---------------------------------------------------------------------------

/** The verbs a transport must expose to back a resource. */
const RESOURCE_VERBS = /** @type {const} */ (['get', 'post', 'put', 'patch', 'delete']);

/**
 * @typedef {object} ResourceOptions
 * @property {(id: unknown) => string} [id] - Derive the URL segment from the id
 *   argument; defaults to `String`. Supply one for composite keys
 *   (`({ tenant, key }) => \`${tenant}:${key}\``). Whatever it returns is
 *   percent-encoded as a **single** segment.
 */

/**
 * @typedef {object} Resource
 * @property {(query?: Record<string, unknown>, options?: RequestOptions) => Promise<unknown>} list - `GET path?query`
 * @property {(id: unknown, options?: RequestOptions) => Promise<unknown>} get - `GET path/id`
 * @property {(body?: unknown, options?: RequestOptions) => Promise<unknown>} create - `POST path`
 * @property {(id: unknown, body?: unknown, options?: RequestOptions) => Promise<unknown>} update - `PUT path/id`
 * @property {(id: unknown, body?: unknown, options?: RequestOptions) => Promise<unknown>} patch - `PATCH path/id`
 * @property {(id: unknown, options?: RequestOptions) => Promise<unknown>} remove - `DELETE path/id`
 */

/**
 * Build a REST resource over an injected client (spec 02 F38, ADR-0025;
 * Repository — docs/patterns).
 *
 * One collection of endpoints usually means six near-identical methods written
 * by hand, and rewritten per resource — where the interesting variation is only
 * the path. This collapses them into one factory whose only knowledge is the
 * path and the client.
 *
 * **The client is a parameter, never an import.** Anything exposing
 * `get`/`post`/`put`/`patch`/`delete` works — {@link httpClient}, a test double,
 * or another library's client — so this function costs a caller who never uses
 * it nothing, and a test needs no network and no mocking framework. The five
 * verbs are checked once, when the resource is built, so a mis-wired transport
 * fails at startup rather than on the first request.
 *
 * **Ids are data, and are encoded as exactly one path segment.** An id
 * containing `/` or `..` can never widen the path it was meant to address; a
 * `null`/`undefined` id is refused rather than silently requesting
 * `…/undefined`. The configured `path` keeps its own separators (so
 * `'admin/users'` nests) and a leading `/` is preserved, since that is the
 * caller declaring an absolute path.
 *
 * Bodies are sent as JSON through the client's `json` option; per-call
 * `RequestOptions` (`signal`, `timeout`, `headers`) pass straight through.
 *
 * @example
 * const users = createResource(api, 'users');
 * await users.list({ page: 2, active: true }); // GET users?page=2&active=true
 * await users.get(42); //                        GET users/42
 * await users.create({ name: 'Ada' }); //         POST users
 * await users.update(42, { name: 'Ada L.' }); //  PUT users/42
 * await users.remove(42, { timeout: 5_000 }); //  DELETE users/42
 *
 * @example
 * // A composite key, rendered as one segment:
 * const memberships = createResource(api, 'memberships', {
 *   id: ({ tenant, user }) => `${tenant}:${user}`,
 * });
 * await memberships.get({ tenant: 'acme', user: 'ada' }); // GET memberships/acme%3Aada
 *
 * @param {Pick<HttpClient, 'get' | 'post' | 'put' | 'patch' | 'delete'>} client - The
 *   transport; only these five methods are used.
 * @param {string} path - Collection path, relative to the client's base URL.
 * @param {ResourceOptions} [options]
 * @returns {Resource}
 * @throws {TypeError} If `client` lacks one of the five verbs, `path` is not a
 *   non-empty string, or `options.id` is not a function.
 */
export function createResource(client, path, options = {}) {
  for (const method of RESOURCE_VERBS) {
    if (typeof (/** @type {Record<string, unknown>} */ (client)?.[method]) !== 'function') {
      throw new TypeError(`client must expose a ${method}() method`);
    }
  }
  if (typeof path !== 'string' || path === '') {
    throw new TypeError('path must be a non-empty string');
  }
  const { id: toSegment = String } = options;
  if (typeof toSegment !== 'function') {
    throw new TypeError('options.id must be a function');
  }

  // Each configured segment is encoded on its own, so the caller's separators
  // survive while a segment containing a space or an accent is escaped.
  const base =
    (path.startsWith('/') ? '/' : '') +
    path
      .split('/')
      .filter((segment) => segment !== '')
      .map(encodeURIComponent)
      .join('/');

  /** @param {unknown} id @returns {string} */
  function itemPath(id) {
    if (id === null || id === undefined) {
      throw new TypeError('id must not be null or undefined');
    }
    return `${base}/${encodeURIComponent(String(toSegment(id)))}`;
  }

  /** @param {RequestOptions} options @param {unknown} body @returns {RequestOptions} */
  function withBody(options, body) {
    return body === undefined ? options : { ...options, json: body };
  }

  return {
    list(query, options = {}) {
      const search = query === undefined || query === null ? '' : urlSearchParams(query);
      return client.get(search === '' ? base : `${base}?${search}`, options);
    },
    get(id, options = {}) {
      return client.get(itemPath(id), options);
    },
    create(body, options = {}) {
      return client.post(base, withBody(options, body));
    },
    update(id, body, options = {}) {
      return client.put(itemPath(id), withBody(options, body));
    },
    patch(id, body, options = {}) {
      return client.patch(itemPath(id), withBody(options, body));
    },
    remove(id, options = {}) {
      return client.delete(itemPath(id), options);
    },
  };
}
