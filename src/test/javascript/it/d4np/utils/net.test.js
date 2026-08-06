import { describe, it, expect } from 'vitest';
import {
  isIpv4,
  parseIpv4,
  formatIpv4,
  ipv4ToKey,
  ipv4FromKey,
  subnetMaskFromPrefix,
} from '../../../../../main/javascript/it/d4np/utils/net.js';

// Example tests (roadmap 9.2, spec 02 §2 items F29-F32, ADR-0020) for the net helpers.

describe('isIpv4 — accepted forms', () => {
  it('accepts canonical dotted quads across the range', () => {
    expect(isIpv4('192.168.1.10')).toBe(true);
    expect(isIpv4('0.0.0.0')).toBe(true);
    expect(isIpv4('255.255.255.255')).toBe(true);
    expect(isIpv4('8.8.8.8')).toBe(true);
  });

  it('accepts a zero octet written as a single zero', () => {
    expect(isIpv4('10.0.0.1')).toBe(true);
  });
});

describe('isIpv4 — rejected forms (the strictness contract)', () => {
  it('rejects leading zeros, which permissive parsers read as octal', () => {
    expect(isIpv4('192.168.01.10')).toBe(false);
    expect(isIpv4('0177.0.0.1')).toBe(false);
    expect(isIpv4('00.0.0.0')).toBe(false);
  });

  it('rejects legacy shorthand and non-decimal notations', () => {
    expect(isIpv4('127.1')).toBe(false);
    expect(isIpv4('0x7f.0.0.1')).toBe(false);
    expect(isIpv4('2130706433')).toBe(false);
  });

  it('rejects out-of-range octets', () => {
    expect(isIpv4('192.168.1.256')).toBe(false);
    expect(isIpv4('999.1.1.1')).toBe(false);
  });

  it('rejects malformed separators', () => {
    expect(isIpv4('1.2.3.4.5')).toBe(false);
    expect(isIpv4('1.2.3.')).toBe(false);
    expect(isIpv4('.1.2.3')).toBe(false);
    expect(isIpv4('1..2.3')).toBe(false);
    expect(isIpv4('')).toBe(false);
  });

  it('rejects surrounding whitespace and signs', () => {
    expect(isIpv4(' 1.2.3.4')).toBe(false);
    expect(isIpv4('1.2.3.4 ')).toBe(false);
    expect(isIpv4('1.2.3.+4')).toBe(false);
    expect(isIpv4('1.2.3.-4')).toBe(false);
  });

  it('rejects IPv6 and other address families', () => {
    expect(isIpv4('::1')).toBe(false);
    expect(isIpv4('::ffff:192.168.1.10')).toBe(false);
  });
});

describe('parseIpv4 / formatIpv4 — spec examples', () => {
  it('parses a canonical address into octets', () => {
    expect(parseIpv4('192.168.1.10')).toEqual([192, 168, 1, 10]);
    expect(parseIpv4('0.0.0.0')).toEqual([0, 0, 0, 0]);
  });

  it('returns null for content it cannot parse', () => {
    expect(parseIpv4('192.168.1.256')).toBeNull();
    expect(parseIpv4('nope')).toBeNull();
  });

  it('agrees with isIpv4 on every input', () => {
    for (const candidate of ['1.2.3.4', '1.2.3', '01.2.3.4', '255.255.255.255', '']) {
      expect(parseIpv4(candidate) !== null).toBe(isIpv4(candidate));
    }
  });

  it('renders octets back to the dotted form', () => {
    expect(formatIpv4([192, 168, 1, 10])).toBe('192.168.1.10');
    expect(formatIpv4([0, 0, 0, 0])).toBe('0.0.0.0');
  });

  it('returns null for octet arrays that are not an address', () => {
    expect(formatIpv4([192, 168, 1])).toBeNull();
    expect(formatIpv4([192, 168, 1, 10, 1])).toBeNull();
    expect(formatIpv4([192, 168, 1, 256])).toBeNull();
    expect(formatIpv4([192, 168, 1, -1])).toBeNull();
    expect(formatIpv4([192, 168, 1, 1.5])).toBeNull();
    expect(formatIpv4([192, 168, 1, /** @type {any} */ ('10')])).toBeNull();
  });

  it('round-trips a parsed address', () => {
    const address = '203.0.113.42';
    expect(formatIpv4(/** @type {number[]} */ (parseIpv4(address)))).toBe(address);
  });
});

describe('ipv4ToKey / ipv4FromKey — spec examples', () => {
  it('encodes an address as a twelve-digit key', () => {
    expect(ipv4ToKey('192.168.1.10')).toBe('192168001010');
    expect(ipv4ToKey('0.0.0.0')).toBe('000000000000');
    expect(ipv4ToKey('255.255.255.255')).toBe('255255255255');
  });

  it('encodes a network prefix at the requested width', () => {
    expect(ipv4ToKey('192.168', { octets: 2 })).toBe('192168');
    expect(ipv4ToKey('10', { octets: 1 })).toBe('010');
    expect(ipv4ToKey('192.168.1', { octets: 3 })).toBe('192168001');
  });

  it('makes a prefix key a literal prefix of the full key', () => {
    expect(
      ipv4ToKey('192.168.1.10')?.startsWith(
        /** @type {string} */ (ipv4ToKey('192.168', { octets: 2 })),
      ),
    ).toBe(true);
  });

  it('returns null when the input is not exactly that many octets', () => {
    expect(ipv4ToKey('192.168', { octets: 4 })).toBeNull();
    expect(ipv4ToKey('192.168.1.10', { octets: 2 })).toBeNull();
    expect(ipv4ToKey('192.168.01', { octets: 2 })).toBeNull();
  });

  it('decodes keys of every supported width', () => {
    expect(ipv4FromKey('192168001010')).toBe('192.168.1.10');
    expect(ipv4FromKey('192168')).toBe('192.168');
    expect(ipv4FromKey('010')).toBe('10');
  });

  it('returns null for keys that are not whole octets or overflow', () => {
    expect(ipv4FromKey('19216')).toBeNull();
    expect(ipv4FromKey('')).toBeNull();
    expect(ipv4FromKey('256000000000')).toBeNull();
    expect(ipv4FromKey('192168001010001')).toBeNull();
    expect(ipv4FromKey('19216800101x')).toBeNull();
  });

  it('sorts lexicographically in numeric address order', () => {
    const addresses = ['9.0.0.1', '10.0.0.1', '192.168.1.2', '192.168.1.10'];
    const shuffled = ['192.168.1.10', '9.0.0.1', '192.168.1.2', '10.0.0.1'];
    const sorted = [...shuffled].sort((a, b) =>
      /** @type {string} */ (ipv4ToKey(a)).localeCompare(/** @type {string} */ (ipv4ToKey(b))),
    );
    expect(sorted).toEqual(addresses);
    // The dotted form does not: this is the reason the codec exists.
    expect([...shuffled].sort()).not.toEqual(addresses);
  });
});

describe('subnetMaskFromPrefix — spec examples', () => {
  it('accepts the slash, bare-string, and number shapes alike', () => {
    expect(subnetMaskFromPrefix('/24')).toBe('255.255.255.0');
    expect(subnetMaskFromPrefix('24')).toBe('255.255.255.0');
    expect(subnetMaskFromPrefix(24)).toBe('255.255.255.0');
  });

  it('covers the whole range including both ends', () => {
    expect(subnetMaskFromPrefix(0)).toBe('0.0.0.0');
    expect(subnetMaskFromPrefix(1)).toBe('128.0.0.0');
    expect(subnetMaskFromPrefix(8)).toBe('255.0.0.0');
    expect(subnetMaskFromPrefix(30)).toBe('255.255.255.252');
    expect(subnetMaskFromPrefix(32)).toBe('255.255.255.255');
  });

  it('returns null outside the range or for non-canonical text', () => {
    expect(subnetMaskFromPrefix(33)).toBeNull();
    expect(subnetMaskFromPrefix(-1)).toBeNull();
    expect(subnetMaskFromPrefix(24.5)).toBeNull();
    expect(subnetMaskFromPrefix(Number.NaN)).toBeNull();
    expect(subnetMaskFromPrefix('/024')).toBeNull();
    expect(subnetMaskFromPrefix('08')).toBeNull(); // leading zero, as in the octet rule
    expect(subnetMaskFromPrefix('00')).toBeNull();
    expect(subnetMaskFromPrefix('/')).toBeNull();
    expect(subnetMaskFromPrefix('')).toBeNull();
    expect(subnetMaskFromPrefix('24 ')).toBeNull();
    expect(subnetMaskFromPrefix('//24')).toBeNull();
    expect(subnetMaskFromPrefix('x')).toBeNull();
    expect(subnetMaskFromPrefix('2x')).toBeNull();
    expect(subnetMaskFromPrefix('-1')).toBeNull();
  });

  it('produces a mask that is itself a valid address', () => {
    for (let prefix = 0; prefix <= 32; prefix += 1) {
      expect(isIpv4(/** @type {string} */ (subnetMaskFromPrefix(prefix)))).toBe(true);
    }
  });
});

describe('net — rejected input types (ADR-0004 split)', () => {
  it('throws TypeError when a string was required', () => {
    expect(() => isIpv4(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => parseIpv4(/** @type {any} */ (16909060))).toThrow(TypeError);
    expect(() => ipv4ToKey(/** @type {any} */ (undefined))).toThrow(TypeError);
    expect(() => ipv4FromKey(/** @type {any} */ (192168001010))).toThrow(TypeError);
  });

  it('throws TypeError when octets is not an array', () => {
    expect(() => formatIpv4(/** @type {any} */ ('192.168.1.10'))).toThrow(TypeError);
    expect(() => formatIpv4(/** @type {any} */ (null))).toThrow(TypeError);
  });

  it('throws TypeError on an out-of-range octets option', () => {
    expect(() => ipv4ToKey('1.2.3.4', { octets: 0 })).toThrow(TypeError);
    expect(() => ipv4ToKey('1.2.3.4', { octets: 5 })).toThrow(TypeError);
    expect(() => ipv4ToKey('1.2.3.4', { octets: /** @type {any} */ ('2') })).toThrow(TypeError);
  });

  it('throws TypeError when a prefix is neither string nor number', () => {
    expect(() => subnetMaskFromPrefix(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => subnetMaskFromPrefix(/** @type {any} */ ([24]))).toThrow(TypeError);
  });
});
