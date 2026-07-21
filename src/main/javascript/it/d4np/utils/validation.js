/**
 * egl-utils-js — validation utilities (spec §2 item 15, pure).
 *
 * `validateEmail` is a security surface (NFR-05): its worst-case running time
 * must stay linear for adversarial input. It is therefore a hand-rolled
 * single-pass scan — **no regular expression anywhere** — so linearity holds
 * by construction instead of depending on a backtracking regex engine's
 * behavior (ADR-0005). It also allocates nothing per call (index arithmetic
 * and `charCodeAt` only), keeping the hot path GC-quiet.
 *
 * @module egl-utils-js/validation
 */

/**
 * RFC 5322 `atext` — the characters allowed in an unquoted local-part atom:
 * ASCII alphanumerics plus `! # $ % & ' * + - / = ? ^ _ ` { | } ~`.
 * Explicitly excludes `"` (34), `,` (44), and `.` (46 — handled as the atom
 * separator).
 *
 * @param {number} code - A `charCodeAt` unit.
 * @returns {boolean}
 */
function isAtextCode(code) {
  if (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  ) {
    return true;
  }
  return (
    code === 33 || // !
    (code >= 35 && code <= 39) || // # $ % & '
    code === 42 || // *
    code === 43 || // +
    code === 45 || // -
    code === 47 || // /
    code === 61 || // =
    code === 63 || // ?
    (code >= 94 && code <= 96) || // ^ _ `
    (code >= 123 && code <= 126) // { | } ~
  );
}

/**
 * @param {number} code - A `charCodeAt` unit.
 * @returns {boolean} ASCII letter or digit.
 */
function isAlnumCode(code) {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * Validate an e-mail address against a **practical RFC 5322 subset**
 * (spec §2 item 15) in a single linear pass.
 *
 * Length caps are enforced **before** any per-character scanning (NFR-05):
 * the local part may be at most 64 characters and the domain at most 255
 * (RFC 5321 limits), so no input ever costs more than ~320 character checks.
 *
 * Accepted subset:
 * - unquoted dot-atom local part — `atext` atoms separated by single dots
 *   (no leading/trailing/consecutive dots);
 * - domain of two or more dot-separated labels, each 1–63 characters of
 *   ASCII alphanumerics and inner hyphens (no leading/trailing hyphen), with
 *   a final label of at least 2 characters. Punycode labels (`xn--…`) pass
 *   as ordinary labels.
 *
 * Deliberately rejected (documented non-goals, not bugs): quoted local parts
 * (`"a b"@…`), comments and folding whitespace, IP-literal domains
 * (`user@[192.0.2.1]`), single-label domains (`user@localhost`), and
 * non-ASCII (IDN) input — internationalized domains must be punycoded first.
 *
 * @example
 * validateEmail('user.name+tag@sub.example.co'); // true
 * validateEmail('user@localhost'); // false — single-label domain
 *
 * @param {string} email - The candidate address.
 * @returns {boolean} Whether the address is valid under the subset.
 * @throws {TypeError} If `email` is not a string (programmer error,
 *   ADR-0004 contract split).
 */
export function validateEmail(email) {
  if (typeof email !== 'string') {
    throw new TypeError('validateEmail requires a string');
  }

  // Caps first (NFR-05): the cheapest checks bound all later work.
  // Minimum valid shape is a@b.cd (6 chars); maximum is 64 + 1 + 255.
  const length = email.length;
  if (length < 6 || length > 320) return false;

  // Exactly one '@'.
  const at = email.indexOf('@');
  if (at === -1 || email.indexOf('@', at + 1) !== -1) return false;

  const localLength = at;
  const domainStart = at + 1;
  const domainLength = length - domainStart;
  if (localLength < 1 || localLength > 64) return false;
  if (domainLength < 1 || domainLength > 255) return false;

  // Local part: dot-atom. `prevWasDot` starts true so a leading dot fails.
  let prevWasDot = true;
  for (let i = 0; i < at; i += 1) {
    const code = email.charCodeAt(i);
    if (code === 46) {
      // '.' — atom separator: not first, not doubled.
      if (prevWasDot) return false;
      prevWasDot = true;
    } else if (isAtextCode(code)) {
      prevWasDot = false;
    } else {
      return false;
    }
  }
  if (prevWasDot) return false; // trailing dot

  // Domain: dot-separated labels of alphanumerics and inner hyphens.
  let labelLength = 0;
  let labelCount = 0;
  let prevWasHyphen = false;
  for (let i = domainStart; i < length; i += 1) {
    const code = email.charCodeAt(i);
    if (code === 46) {
      // '.' — label separator: no empty label, no trailing hyphen.
      if (labelLength === 0 || prevWasHyphen) return false;
      labelCount += 1;
      labelLength = 0;
      prevWasHyphen = false;
    } else if (code === 45) {
      // '-' — inner only.
      if (labelLength === 0) return false;
      prevWasHyphen = true;
      labelLength += 1;
      if (labelLength > 63) return false;
    } else if (isAlnumCode(code)) {
      prevWasHyphen = false;
      labelLength += 1;
      if (labelLength > 63) return false;
    } else {
      return false;
    }
  }
  // Final label: present, no trailing hyphen, at least 2 chars (every real
  // top-level domain is), and at least two labels overall.
  if (labelLength < 2 || prevWasHyphen) return false;
  labelCount += 1;
  return labelCount >= 2;
}
