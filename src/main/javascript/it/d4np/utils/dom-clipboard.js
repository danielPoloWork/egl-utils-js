/**
 * egl-utils-js — the clipboard write (spec 06 §2 item F97; browser-leaning).
 *
 * One function, and the whole of its design is in what it refuses to do quietly.
 * The clipboard is **permission-gated and secure-context-only**: a page served
 * over plain HTTP has no `navigator.clipboard` at all, and a page that does can
 * still be told no by a user or a policy. Both are ordinary outcomes, and both are
 * indistinguishable from success to somebody looking at a button that did nothing.
 *
 * So every refusal is a {@link ClipboardError} carrying a `reason`, and none of
 * them is swallowed. There is also **no fallback**: the `document.execCommand('copy')`
 * textarea trick is deprecated, silently unreliable, and would turn a typed
 * failure back into the ambiguity F97 exists to remove.
 *
 * The text is the caller's. `tableCsv` (F96) makes CSV or tab-separated text on
 * the Node-safe `/table` entry; this side does nothing but move a string, which is
 * the whole reason the two halves are split (NFR-29).
 *
 * @module egl-utils-js/dom
 */

import { ClipboardError } from './errors.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @typedef {object} CopyToClipboardOptions
 * @property {{ navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } }, isSecureContext?: boolean }} [window=globalThis] - The
 *   window whose clipboard to write. Injectable for the same reason every DOM
 *   option on this entry is — a server-side DOM, an iframe, or a test needs a view
 *   that is not the ambient one (NFR-14) — and the same option name and shape as
 *   `sanitizeHtml({ window })` and `bindTableHistory({ window })`.
 */

/**
 * Write text to the clipboard, failing loudly (F97).
 *
 * @example
 * import { tableCsv } from 'egl-utils-js/table';
 * import { copyToClipboard } from 'egl-utils-js/dom';
 *
 * // Tab-separated pastes straight into a spreadsheet cell range:
 * await copyToClipboard(tableCsv(rows, { columns, delimiter: '\t' }));
 *
 * @example
 * // The failure is the point: branch on `reason`, tell the user something true.
 * try {
 *   await copyToClipboard(text);
 * } catch (error) {
 *   if (error.code !== 'EGL_CLIPBOARD') throw error;
 *   if (error.reason === 'insecure') warn('Copying needs an HTTPS page');
 *   else if (error.reason === 'denied') warn('Clipboard permission was refused');
 *   else warn('Copy failed');
 * }
 *
 * @param {string} text - What to write. An empty string is allowed: clearing the
 *   clipboard is a thing a caller may mean, and refusing it would be this
 *   function inventing a policy.
 * @param {CopyToClipboardOptions} [options]
 * @returns {Promise<void>} Resolves once the platform reports the write done.
 * @throws {TypeError} If `text` is not a string, or on an unknown option key.
 * @throws {ClipboardError} With `reason: 'unsupported'` when there is no clipboard
 *   API, `'insecure'` when there is one but the context is not secure,
 *   `'denied'` when the permission was refused, and `'failed'` for anything else
 *   the platform rejected with — `cause` carrying its error in the last two cases.
 */
export async function copyToClipboard(text, options = {}) {
  const api = 'copyToClipboard';
  if (typeof text !== 'string') {
    throw new TypeError(`${api}: text must be a string`);
  }
  const { window: injected, ...unknown } = options ?? {};
  assertNoUnknownOptions(unknown, api);

  const view = /** @type {any} */ (injected ?? globalThis);
  // Named `navigator` so the api-floor scanner sees `navigator.clipboard` for what
  // it is (ADR-0064): the inventory entry is owed whether the global is ambient or
  // injected, and a local called `view` would have hidden the read from the gate.
  const navigator = view?.navigator;
  const writeText = navigator?.clipboard?.writeText;

  if (typeof writeText !== 'function') {
    // Two different problems with one symptom, told apart because the remedies
    // differ: an HTTP page can be served over HTTPS, and an engine without the
    // API cannot be talked into having one. `isSecureContext === false` is the
    // reliable signal; its absence means we genuinely do not know, so the honest
    // answer is 'unsupported'.
    const insecure = view?.isSecureContext === false;
    throw new ClipboardError(
      insecure
        ? `${api}: the clipboard is unavailable outside a secure context — serve the page over HTTPS (or localhost)`
        : `${api}: no clipboard API on this window — pass options.window, or run where navigator.clipboard exists`,
      { reason: insecure ? 'insecure' : 'unsupported' },
    );
  }

  try {
    await writeText.call(navigator.clipboard, text);
  } catch (cause) {
    // A refused permission is the common case and deserves its own reason, so a
    // caller can say "allow clipboard access" rather than "something failed".
    // Matched on the DOM's own name, not on message text.
    const denied =
      /** @type {{ name?: unknown }} */ (cause)?.name === 'NotAllowedError' ||
      /** @type {{ name?: unknown }} */ (cause)?.name === 'SecurityError';
    throw new ClipboardError(
      denied
        ? `${api}: the clipboard permission was refused`
        : `${api}: the clipboard write failed`,
      { reason: denied ? 'denied' : 'failed', cause },
    );
  }
}
