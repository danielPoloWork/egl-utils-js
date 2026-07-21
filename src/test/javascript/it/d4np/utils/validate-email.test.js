import { describe, it, expect } from 'vitest';
import { validateEmail } from '../../../../../main/javascript/it/d4np/utils/validation.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

describe('validateEmail — accepted subset (spec §2 item 15)', () => {
  it.each([
    'user@example.co',
    'user.name@example.co',
    'user+tag@example.co',
    "o'brien@example.co", // atext apostrophe
    '!#$%&*+-/=?^_`{|}~@example.co', // every non-alnum atext symbol (no dot)
    'a@b.cd', // minimal shape
    'user@sub.domain.example.co', // multi-label
    'user@xn--kgbechtv.xn--deba0ad', // punycode labels, incl. punycode TLD
    'USER@EXAMPLE.CO', // case is not validation's business
    'user123@123.co', // digit-only labels are valid
    'user@a-b.c-d.ef', // inner hyphens
  ])('accepts %s', (email) => {
    expect(validateEmail(email)).toBe(true);
  });

  it('accepts a local part of exactly 64 chars and rejects 65', () => {
    expect(validateEmail(`${'a'.repeat(64)}@example.co`)).toBe(true);
    expect(validateEmail(`${'a'.repeat(65)}@example.co`)).toBe(false);
  });

  it('accepts a domain of exactly 255 chars and rejects 256', () => {
    // 63 + 1 + 63 + 1 + 63 + 1 + 63 = 255; append one char for 256.
    const label63 = 'a'.repeat(63);
    const domain255 = [label63, label63, label63, label63].join('.');
    expect(domain255).toHaveLength(255);
    expect(validateEmail(`u@${domain255}`)).toBe(true);
    expect(validateEmail(`u@${domain255}a`)).toBe(false);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.validateEmail).toBe(validateEmail);
  });
});

describe('validateEmail — rejected inputs', () => {
  it.each([
    ['empty string', ''],
    ['no @', 'userexample.co'],
    ['two @', 'user@@example.co'],
    ['two @ apart', 'us@er@example.co'],
    ['missing local', '@example.co'],
    ['missing domain', 'user@'],
    ['leading dot in local', '.user@example.co'],
    ['trailing dot in local', 'user.@example.co'],
    ['consecutive dots in local', 'us..er@example.co'],
    ['space in local', 'us er@example.co'],
    ['quoted local part (non-goal)', '"a b"@example.co'],
    ['comma in local', 'us,er@example.co'],
    ['double quote in local', 'us"er@example.co'],
    ['non-ASCII local (IDN non-goal)', 'usér@example.co'],
    ['non-ASCII domain', 'user@exämple.co'],
    ['single-label domain (non-goal)', 'user@localhost'],
    ['1-char final label', 'user@example.c'],
    ['leading dot in domain', 'user@.example.co'],
    ['trailing dot in domain', 'user@example.co.'],
    ['empty domain label', 'user@example..co'],
    ['leading hyphen in label', 'user@-example.co'],
    ['trailing hyphen in label', 'user@example-.co'],
    ['trailing hyphen in final label', 'user@example.co-'],
    ['underscore in domain', 'user@exa_mple.co'],
    ['IP-literal domain (non-goal)', 'user@[192.0.2.1]'],
    ['domain label over 63 chars', `user@${'a'.repeat(64)}.co`],
    ['domain label over 63 via a hyphen 64th char', `user@${'a'.repeat(63)}-a.co`],
    ['over 320 total chars', `${'a'.repeat(64)}@${'b'.repeat(260)}.co`],
  ])('rejects %s', (_label, email) => {
    expect(validateEmail(email)).toBe(false);
  });

  it('throws TypeError for non-string input (ADR-0004 contract split)', () => {
    expect(() => validateEmail(/** @type {any} */ (42))).toThrow(TypeError);
    expect(() => validateEmail(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => validateEmail(/** @type {any} */ ({}))).toThrow(TypeError);
  });
});

// The NFR-05 ReDoS timing gate lives in validate-email.redos.test.js and runs
// un-instrumented (`pnpm test:redos`) — coverage instrumentation would gate
// the instrumentation's overhead, not the function's linearity.
