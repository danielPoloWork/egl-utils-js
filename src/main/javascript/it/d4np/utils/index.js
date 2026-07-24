/**
 * egl-utils-js — root entry.
 *
 * Universal JavaScript async, data, and event utilities for Node.js (>= 18)
 * and modern evergreen browsers. Named exports only — no default aggregate
 * object, which would defeat tree-shaking (ADR-001).
 *
 * Module groups land by roadmap milestone and are re-exported from here:
 * errors (below) and async combinators (M2), data & validation (M3), events
 * (M4), web, crypto & diagnostics (M5). Browser-leaning storage/cookie
 * helpers and sanitization live on their own subpath entries
 * ('egl-utils-js/storage', 'egl-utils-js/sanitize'), never on the root
 * (spec §4).
 *
 * @module egl-utils-js
 */

// Shared typed error classes (spec §3, ADR-0003) — importable from the root
// and from 'egl-utils-js/errors' alike.
export {
  EglError,
  TimeoutError,
  AbortError,
  RetryExhaustedError,
  HttpError,
  CloneError,
  StorageError,
  DurationParseError,
} from './errors.js';

// Async combinators (spec §2 items 1–5), signal-first per ADR-0004.
export { delay, timeout, retry, parallelLimit, asyncQueue } from './async.js';

// Data-manipulation utilities (spec §2 items 9–14), pure.
export { deepClone, deepMerge, pick, omit, groupBy, uniq, isObject, isEmpty } from './data.js';

// Validation (spec §2 item 15) — linear-time by construction, no regex (ADR-0005).
export { validateEmail } from './validation.js';

// Typed event helpers (spec §2 items 6–8), stateful by contract (ADR-0006).
export { EventEmitter, debounce, throttle } from './events.js';

// Web utilities (spec §2 items 16–17) — fetch facade with the no-token-storage
// auth contract (ADR-0007).
export { httpClient } from './web.js';
