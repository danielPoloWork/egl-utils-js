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
export { delay, timeout } from './async.js';
