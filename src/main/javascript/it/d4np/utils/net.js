/**
 * egl-utils-js — IPv4 and CIDR utilities (spec 02 §2 items F29-F32; pure by
 * contract: every function is a function of its arguments alone, allocates
 * only its result, and touches no platform global).
 *
 * Parsing is **deliberately strict** (ADR-0020): four decimal octets, no
 * leading zeros, no hex/octal/shorthand forms. Permissive `inet_aton`-style
 * parsers disagree with each other about what `010.0.0.1` or `127.1` mean, and
 * an allowlist that parses an address one way while the network stack parses it
 * another is a filter-bypass waiting to happen. Anything ambiguous is rejected.
 *
 * Following the ADR-0004 contract split, **invalid content is a domain outcome**
 * — the parsers return `null`, never throw — while a wrong argument *type* is a
 * programmer error and throws `TypeError`.
 *
 * @module egl-utils-js/net
 */

/** An IPv4 address has four octets; a key may cover a 1-4 octet prefix. */
const MAX_OCTETS = 4;

/** Every octet renders as three digits, so keys sort lexicographically. */
const KEY_DIGITS_PER_OCTET = 3;

/** @param {unknown} value @param {string} name @returns {asserts value is string} */
function assertString(value, name) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
}

/**
 * Read one strict decimal octet from `str[start, end)`.
 *
 * Returns `-1` for everything a permissive parser would accept but this one
 * must not: an empty or over-long run, a non-digit, a leading zero (which
 * `inet_aton` reads as octal), or a value above 255.
 *
 * @param {string} str
 * @param {number} start - Inclusive.
 * @param {number} end - Exclusive.
 * @returns {number} The octet, or `-1` when the run is not a canonical octet.
 */
function readOctet(str, start, end) {
  const length = end - start;
  if (length < 1 || length > 3) return -1;
  if (length > 1 && str.charCodeAt(start) === 48) return -1; // leading zero
  let value = 0;
  for (let i = start; i < end; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 48 || code > 57) return -1;
    value = value * 10 + (code - 48);
  }
  return value > 255 ? -1 : value;
}

/**
 * Parse exactly `expected` dot-separated strict octets in a single pass.
 *
 * @param {string} str
 * @param {number} expected - How many octets the input must carry.
 * @returns {number[] | null} The octets, or `null` if the input is not exactly
 *   that many canonical octets.
 */
function parseOctets(str, expected) {
  /** @type {number[]} */
  const octets = [];
  let start = 0;
  for (let i = 0; i <= str.length; i += 1) {
    if (i === str.length || str.charCodeAt(i) === 46) {
      if (octets.length === expected) return null; // one separator too many
      const octet = readOctet(str, start, i);
      if (octet < 0) return null;
      octets.push(octet);
      start = i + 1;
    }
  }
  return octets.length === expected ? octets : null;
}

/**
 * Read a canonical prefix length: one or two digits, no leading zero.
 *
 * @param {string} str
 * @returns {number} The value, or `-1` when the run is not canonical.
 */
function readPrefixDigits(str) {
  const length = str.length;
  if (length < 1 || length > 2) return -1;
  if (length > 1 && str.charCodeAt(0) === 48) return -1;
  let value = 0;
  for (let i = 0; i < length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 48 || code > 57) return -1;
    value = value * 10 + (code - 48);
  }
  return value;
}

/**
 * Test whether a string is a canonical dotted-quad IPv4 address (spec 02 F29).
 *
 * Strict by design: exactly four decimal octets in `0`-`255`, single dots, no
 * leading zeros, no surrounding whitespace, and none of the legacy forms
 * (`127.1`, `0x7f.0.0.1`, `0177.0.0.1`, bare integers) that different parsers
 * resolve differently.
 *
 * @example
 * isIpv4('192.168.1.10'); // true
 * isIpv4('192.168.01.10'); // false — leading zero is ambiguous (octal)
 * isIpv4('127.1'); // false — shorthand form
 *
 * @param {string} value - The candidate address.
 * @returns {boolean} Whether `value` is a canonical IPv4 address.
 * @throws {TypeError} If `value` is not a string.
 */
export function isIpv4(value) {
  assertString(value, 'value');
  return parseOctets(value, MAX_OCTETS) !== null;
}

/**
 * Parse a canonical dotted-quad address into its four octets (spec 02 F30).
 *
 * Accepts exactly what {@link isIpv4} accepts, so `parseIpv4(v) !== null` and
 * `isIpv4(v)` always agree. The returned array is fresh on every call and safe
 * for the caller to keep or mutate.
 *
 * @example
 * parseIpv4('192.168.1.10'); // [192, 168, 1, 10]
 * parseIpv4('192.168.1.256'); // null — out of range
 *
 * @param {string} value - The candidate address.
 * @returns {number[] | null} The four octets, or `null` when `value` is not a
 *   canonical IPv4 address.
 * @throws {TypeError} If `value` is not a string.
 */
export function parseIpv4(value) {
  assertString(value, 'value');
  return parseOctets(value, MAX_OCTETS);
}

/**
 * Render four octets as a canonical dotted-quad address (spec 02 F30).
 *
 * The inverse of {@link parseIpv4}: `formatIpv4(parseIpv4(v)) === v` for every
 * canonical `v`, and `parseIpv4(formatIpv4(o))` returns an equal tuple for
 * every valid `o`.
 *
 * @example
 * formatIpv4([192, 168, 1, 10]); // '192.168.1.10'
 * formatIpv4([192, 168, 1]); // null — an address needs four octets
 *
 * @param {readonly number[]} octets - Exactly four integers in `0`-`255`.
 * @returns {string | null} The dotted form, or `null` when `octets` is not four
 *   valid octets.
 * @throws {TypeError} If `octets` is not an array.
 */
export function formatIpv4(octets) {
  if (!Array.isArray(octets)) {
    throw new TypeError('octets must be an array');
  }
  if (octets.length !== MAX_OCTETS) return null;
  let out = '';
  for (let i = 0; i < MAX_OCTETS; i += 1) {
    const octet = octets[i];
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    out += i === 0 ? `${octet}` : `.${octet}`;
  }
  return out;
}

/**
 * @typedef {object} Ipv4KeyOptions
 * @property {number} [octets=4] - How many dot-separated octets the input
 *   carries: `4` for a full address, `1`-`3` for a network prefix such as
 *   `'192.168'`.
 */

/**
 * Encode an address (or network prefix) as a fixed-width, sortable key
 * (spec 02 F31).
 *
 * Each octet becomes exactly three zero-padded digits, so **lexicographic order
 * over keys equals numeric order over addresses** — which is what makes the key
 * usable as a sort key, a range bound, or a database index where the dotted
 * form would sort `'10.0.0.1'` after `'9.0.0.1'`.
 *
 * Because the width is fixed, the key of a prefix is a *prefix of the key*:
 * `ipv4ToKey('192.168', { octets: 2 })` equals
 * `ipv4ToKey('192.168.1.10').slice(0, 6)`, so `startsWith` answers
 * "is this address inside that network?" for octet-aligned networks.
 *
 * @example
 * ipv4ToKey('192.168.1.10'); // '192168001010'
 * ipv4ToKey('192.168', { octets: 2 }); // '192168'
 *
 * @example
 * // Sorting addresses correctly, without parsing them twice:
 * addresses.sort((a, b) => ipv4ToKey(a).localeCompare(ipv4ToKey(b)));
 *
 * @param {string} value - A dotted address or prefix with exactly `octets` parts.
 * @param {Ipv4KeyOptions} [options]
 * @returns {string | null} The `3 × octets`-digit key, or `null` when `value` is
 *   not a canonical dotted form of that length.
 * @throws {TypeError} If `value` is not a string, or `options.octets` is not an
 *   integer between 1 and 4.
 */
export function ipv4ToKey(value, options = {}) {
  assertString(value, 'value');
  const { octets = MAX_OCTETS } = options;
  if (!Number.isInteger(octets) || octets < 1 || octets > MAX_OCTETS) {
    throw new TypeError('options.octets must be an integer between 1 and 4');
  }

  const parsed = parseOctets(value, octets);
  if (parsed === null) return null;
  let key = '';
  for (const octet of parsed) {
    key += `${octet}`.padStart(KEY_DIGITS_PER_OCTET, '0');
  }
  return key;
}

/**
 * Decode a fixed-width key back to its dotted form (spec 02 F31).
 *
 * The inverse of {@link ipv4ToKey} at any prefix length: a 12-digit key yields a
 * full address, a 6-digit key yields the two-octet prefix it came from.
 *
 * @example
 * ipv4FromKey('192168001010'); // '192.168.1.10'
 * ipv4FromKey('192168'); // '192.168'
 * ipv4FromKey('19216'); // null — not a whole number of octets
 *
 * @param {string} key - A key of 3, 6, 9, or 12 digits.
 * @returns {string | null} The dotted form, or `null` when `key` is not a valid
 *   key (wrong length, non-digits, or a group above 255).
 * @throws {TypeError} If `key` is not a string.
 */
export function ipv4FromKey(key) {
  assertString(key, 'key');
  const groups = key.length / KEY_DIGITS_PER_OCTET;
  if (!Number.isInteger(groups) || groups < 1 || groups > MAX_OCTETS) return null;

  let out = '';
  for (let group = 0; group < groups; group += 1) {
    const start = group * KEY_DIGITS_PER_OCTET;
    let value = 0;
    for (let i = start; i < start + KEY_DIGITS_PER_OCTET; i += 1) {
      const code = key.charCodeAt(i);
      if (code < 48 || code > 57) return null;
      value = value * 10 + (code - 48);
    }
    if (value > 255) return null;
    out += group === 0 ? `${value}` : `.${value}`;
  }
  return out;
}

/**
 * Convert a CIDR prefix length to its dotted subnet mask (spec 02 F32).
 *
 * Accepts the three shapes a prefix arrives in — `'/24'`, `'24'`, or `24` — and
 * computes the mask with bit arithmetic rather than a lookup table.
 *
 * @example
 * subnetMaskFromPrefix('/24'); // '255.255.255.0'
 * subnetMaskFromPrefix(30); // '255.255.255.252'
 * subnetMaskFromPrefix(0); // '0.0.0.0'
 * subnetMaskFromPrefix(33); // null — outside 0-32
 *
 * @param {string | number} prefix - A prefix length in `0`-`32`, optionally
 *   written with a leading slash.
 * @returns {string | null} The dotted mask, or `null` when the prefix is out of
 *   range or not canonically written.
 * @throws {TypeError} If `prefix` is neither a string nor a number.
 */
export function subnetMaskFromPrefix(prefix) {
  let length;
  if (typeof prefix === 'number') {
    length = prefix;
  } else if (typeof prefix === 'string') {
    length = readPrefixDigits(prefix.charCodeAt(0) === 47 ? prefix.slice(1) : prefix);
  } else {
    throw new TypeError('prefix must be a string or a number');
  }
  if (!Number.isInteger(length) || length < 0 || length > 32) return null;

  // `x << 32` shifts by 32 % 32 === 0 in JavaScript, so /0 is special-cased
  // rather than left to produce an all-ones mask.
  const mask = length === 0 ? 0 : (0xffffffff << (32 - length)) >>> 0;
  return `${(mask >>> 24) & 255}.${(mask >>> 16) & 255}.${(mask >>> 8) & 255}.${mask & 255}`;
}
