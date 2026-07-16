/**
 * egl-utils-js/storage — browser-leaning storage helpers.
 *
 * Will export localStorageWrapper and sessionStorageWrapper (safe interfaces
 * with in-memory fallback and StorageError quota surfacing) and cookieHelper
 * (document.cookie only — HttpOnly cookies are invisible to client-side
 * JavaScript by design; no-ops with a warning in Node). Kept off the root
 * entry so Node-only consumers never pull browser-leaning code (spec §4).
 * Lands with roadmap items 6.1–6.2.
 *
 * @module egl-utils-js/storage
 */

export {};
