/**
 * egl-utils-js/sanitize — allowlist-based HTML sanitization.
 *
 * Will export sanitizeHtml, a curated-allowlist wrapper delegating to
 * DOMPurify as an optional peerDependency (ADR-003): sanitizers are not
 * reimplemented in-house, and consumers who never sanitize pay zero bytes
 * and zero audit surface. Browser-first; Node usage requires a DOM (jsdom)
 * and is documented, not implied. Lands with roadmap item 6.3.
 *
 * @module egl-utils-js/sanitize
 */

export {};
