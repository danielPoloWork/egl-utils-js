/**
 * egl-utils-js/errors — shared typed error classes.
 *
 * Will export the EglError base and the typed failures every module group
 * throws: TimeoutError, RetryExhaustedError, AbortError (re-exported DOM
 * convention), HttpError, CloneError, StorageError, DurationParseError.
 * Every class carries a stable machine-readable `.code`; error identity
 * across dual-package (ESM/CJS) instances is checked via `.code`, never
 * cross-realm `instanceof` (ADR-001, spec §3). Lands with roadmap item 2.1.
 *
 * @module egl-utils-js/errors
 */

export {};
