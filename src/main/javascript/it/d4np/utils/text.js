/**
 * egl-utils-js — text shaping utilities (spec 02 §2 items F26-F28; pure by
 * contract: every function returns a new string and never mutates or reads
 * anything outside its arguments).
 *
 * All three functions measure length in **UTF-16 code units**, the unit
 * `String.prototype.length` reports, and never emit a lone surrogate: a cut
 * that would split a surrogate pair drops the whole pair instead (ADR-0019).
 * Grapheme clusters and East-Asian display width are deliberately out of
 * scope — see the ADR for why.
 *
 * @module egl-utils-js/text
 */

/** @param {number} code @returns {boolean} */
function isHighSurrogate(code) {
  return code >= 0xd800 && code <= 0xdbff;
}

/** @param {number} code @returns {boolean} */
function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * `str.slice(0, end)` that never ends on a lone high surrogate: when the cut
 * falls between the halves of a surrogate pair, the whole pair is dropped and
 * the result is one code unit shorter than `end`.
 *
 * @param {string} str
 * @param {number} end
 * @returns {string}
 */
function sliceHead(str, end) {
  if (end >= str.length) return str;
  if (end > 0 && isHighSurrogate(str.charCodeAt(end - 1))) return str.slice(0, end - 1);
  return str.slice(0, end);
}

/**
 * `str.slice(start)` that never begins on a lone low surrogate (the mirror of
 * {@link sliceHead}, for keep-the-end truncation).
 *
 * @param {string} str
 * @param {number} start
 * @returns {string}
 */
function sliceTail(str, start) {
  if (start <= 0) return str;
  if (start < str.length && isLowSurrogate(str.charCodeAt(start))) return str.slice(start + 1);
  return str.slice(start);
}

/** @param {unknown} value @param {string} name @returns {asserts value is string} */
function assertString(value, name) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
}

/**
 * @param {unknown} value
 * @param {string} name
 * @param {number} min - Smallest accepted value (0 for a length, 1 for a width).
 * @returns {asserts value is number}
 */
function assertWidth(value, name, min) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new TypeError(`${name} must be an integer >= ${min}`);
  }
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @param {string} name
 * @returns {asserts value is T}
 */
function assertOneOf(value, allowed, name) {
  if (!allowed.includes(/** @type {T} */ (value))) {
    throw new TypeError(`${name} must be one of: ${allowed.join(', ')}`);
  }
}

/** Which end a cut keeps — shared by `truncate` and `fixedWidth`. */
const SIDES = /** @type {const} */ (['end', 'start']);

/** Where content sits inside a padded field. */
const ALIGNMENTS = /** @type {const} */ (['left', 'right', 'center']);

/** @param {number} code @returns {boolean} */
function isSpace(code) {
  // Space, tab, LF, VT, FF, CR — the separators wrapText collapses.
  return code === 32 || (code >= 9 && code <= 13);
}

/**
 * @typedef {object} TruncateOptions
 * @property {string} [ellipsis='…'] - Marker appended (or prepended) to a shortened
 *   string; counts toward `maxLength`. Pass `''` for a hard cut.
 * @property {'end' | 'start'} [position='end'] - Which side to cut: `'end'` keeps the
 *   beginning of `str`, `'start'` keeps the ending.
 */

/**
 * Shorten a string to at most `maxLength` code units, marking the cut (spec 02 F26).
 *
 * A string that already fits is returned unchanged — the ellipsis is only ever
 * added when something was actually removed, so `truncate` is idempotent. The
 * marker is included in the budget: the result never exceeds `maxLength`, and
 * equals it exactly unless the cut fell inside a surrogate pair (then it is one
 * code unit shorter — a lone surrogate is never emitted). When `maxLength` is
 * smaller than the ellipsis itself, the ellipsis is what gets truncated, so the
 * budget still holds.
 *
 * @example
 * truncate('The quick brown fox', 10); // 'The quick…'
 * truncate('short', 10); // 'short' — unchanged, no marker
 *
 * @example
 * truncate('/very/long/path/file.txt', 12, { position: 'start' }); // '…/file.txt'
 * truncate('abcdef', 3, { ellipsis: '' }); // 'abc' — hard cut
 *
 * @param {string} str - The string to shorten.
 * @param {number} maxLength - Maximum length of the result, in code units.
 * @param {TruncateOptions} [options]
 * @returns {string}
 * @throws {TypeError} If `str` or `ellipsis` is not a string, if `maxLength` is not a
 *   non-negative integer, or if `position` is not `'end'` or `'start'`.
 */
export function truncate(str, maxLength, options = {}) {
  assertString(str, 'str');
  assertWidth(maxLength, 'maxLength', 0);
  const { ellipsis = '…', position = 'end' } = options;
  assertString(ellipsis, 'options.ellipsis');
  assertOneOf(position, SIDES, 'options.position');

  if (str.length <= maxLength) return str;
  // No room for content: the marker itself is all the budget can hold.
  if (ellipsis.length >= maxLength) {
    return position === 'end'
      ? sliceHead(ellipsis, maxLength)
      : sliceTail(ellipsis, ellipsis.length - maxLength);
  }

  const keep = maxLength - ellipsis.length;
  return position === 'end'
    ? sliceHead(str, keep) + ellipsis
    : ellipsis + sliceTail(str, str.length - keep);
}

/**
 * @typedef {object} WrapTextOptions
 * @property {boolean} [breakLongWords=false] - When `true`, a word longer than `width`
 *   is split across lines instead of overflowing its own line.
 */

/**
 * Wrap text to lines of at most `width` code units (spec 02 F27).
 *
 * Greedy wrapping over whitespace-separated words: runs of whitespace collapse
 * to a single space, and existing line breaks are preserved as paragraph
 * boundaries (each is wrapped independently), so re-wrapping already-wrapped
 * text at the same width is a no-op. A word longer than `width` gets a line to
 * itself and overflows it, unless `breakLongWords` is set — the default favors
 * keeping identifiers, URLs, and hashes intact and greppable.
 *
 * @example
 * wrapText('the quick brown fox jumps', 10);
 * // 'the quick\nbrown fox\njumps'
 *
 * @example
 * wrapText('supercalifragilistic', 8, { breakLongWords: true });
 * // 'supercal\nifragili\nstic'
 *
 * @param {string} str - The text to wrap.
 * @param {number} width - Maximum line length in code units; must be positive.
 * @param {WrapTextOptions} [options]
 * @returns {string} The wrapped text, lines joined with `'\n'`.
 * @throws {TypeError} If `str` is not a string or `width` is not a positive integer.
 */
export function wrapText(str, width, options = {}) {
  assertString(str, 'str');
  assertWidth(width, 'width', 1);
  const { breakLongWords = false } = options;

  /** @type {string[]} */
  const lines = [];
  for (const paragraph of str.split('\n')) {
    const emittedBefore = lines.length;
    let line = '';
    let i = 0;
    const n = paragraph.length;
    while (i < n) {
      // Skip the separator run, then read one word.
      while (i < n && isSpace(paragraph.charCodeAt(i))) i += 1;
      const wordStart = i;
      while (i < n && !isSpace(paragraph.charCodeAt(i))) i += 1;
      if (i === wordStart) break; // trailing whitespace only
      let word = paragraph.slice(wordStart, i);

      if (breakLongWords) {
        // Fill the current line, then emit full-width chunks until the
        // remainder fits — the chunk boundaries are surrogate-safe.
        while (word.length > width || line.length + (line === '' ? 0 : 1) + word.length > width) {
          const room = width - line.length - (line === '' ? 0 : 1);
          let head = room > 0 ? sliceHead(word, room) : '';
          if (head === '' && line === '') {
            // On an empty line `room` is `width` (>= 1), so `sliceHead` can only
            // come back empty when the word opens on a surrogate pair wider than
            // the line: take both units and overflow by one rather than stall.
            head = word.slice(0, 2);
          }
          if (head !== '') {
            line += (line === '' ? '' : ' ') + head;
            word = word.slice(head.length);
          }
          lines.push(line);
          line = '';
          if (word.length <= width) break;
        }
        if (word === '') continue; // the break loop consumed it exactly
      }

      if (line === '') {
        line = word;
      } else if (line.length + 1 + word.length <= width) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    // Flush the pending line — but never append a spurious empty one after a
    // word that filled its line exactly. An empty paragraph still emits '', so
    // blank lines in the input survive.
    if (line !== '' || lines.length === emittedBefore) lines.push(line);
  }
  return lines.join('\n');
}

/**
 * @typedef {object} FixedWidthOptions
 * @property {'left' | 'right' | 'center'} [align='left'] - Where the content sits when
 *   padding is added; `'left'` pads on the right.
 * @property {'end' | 'start'} [truncate='end'] - Which side to cut when the content is
 *   too long: `'end'` keeps the beginning, `'start'` keeps the ending.
 * @property {string} [pad=' '] - Fill string, repeated as needed; must be non-empty.
 */

/**
 * Pad or truncate a string to **exactly** `width` code units (spec 02 F28).
 *
 * The column primitive behind aligned console output — total by construction:
 * every string input produces a `width`-long result, so a table of these never
 * ragged-edges on unexpected data. Content longer than `width` is cut on the
 * chosen side (never leaving a lone surrogate; the freed code unit is padded
 * back, which is why the width guarantee is exact rather than approximate).
 *
 * @example
 * fixedWidth('INFO', 8); // 'INFO    '
 * fixedWidth('42', 6, { align: 'right', pad: '0' }); // '000042'
 *
 * @example
 * fixedWidth('egl-utils-js', 6); // 'egl-ut'
 * fixedWidth('com.example.Service', 12, { truncate: 'start' }); // 'mple.Service'
 *
 * @param {string} str - The string to fit.
 * @param {number} width - Exact result length in code units.
 * @param {FixedWidthOptions} [options]
 * @returns {string} A string of exactly `width` code units.
 * @throws {TypeError} If `str` is not a string, `width` is not a non-negative integer,
 *   `pad` is not a non-empty string, or `align`/`truncate` is not one of its allowed
 *   values.
 */
export function fixedWidth(str, width, options = {}) {
  assertString(str, 'str');
  assertWidth(width, 'width', 0);
  const { align = 'left', truncate: side = 'end', pad = ' ' } = options;
  assertString(pad, 'options.pad');
  if (pad === '') {
    throw new TypeError('options.pad must be a non-empty string');
  }
  assertOneOf(align, ALIGNMENTS, 'options.align');
  assertOneOf(side, SIDES, 'options.truncate');

  const fitted =
    str.length > width
      ? side === 'end'
        ? sliceHead(str, width)
        : sliceTail(str, str.length - width)
      : str;

  if (fitted.length === width) return fitted;
  if (align === 'right') return fitted.padStart(width, pad);
  if (align === 'left') return fitted.padEnd(width, pad);
  const left = Math.floor((width - fitted.length) / 2);
  return fitted.padStart(fitted.length + left, pad).padEnd(width, pad);
}
