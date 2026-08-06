import { describe, it, expect } from 'vitest';
import {
  compileFilter,
  comparator,
  paginate,
} from '../../../../../main/javascript/it/d4np/utils/table.js';

// Example tests (roadmap 9.3, spec 02 §2 items F33-F35, ADR-0021/ADR-0022) for
// the tabular query primitives.

describe('compileFilter — the operator matrix', () => {
  /** @type {Array<[string, unknown, boolean]>} */
  const cases = [
    // substring (the default)
    ['brown', 'the quick brown fox', true],
    ['brown', 'the quick red fox', false],
    ['brown', null, false],
    ['brown', undefined, false],
    // exact equality
    ['=fox', 'fox', true],
    ['=fox', 'fox and hound', false],
    ['!=fox', 'hound', true],
    ['!=fox', 'fox', false],
    // prefix / suffix
    ['^192.168', '192.168.1.10', true],
    ['^192.168', '10.192.168.1', false],
    ['.txt$', 'report.txt', true],
    ['.txt$', 'report.txt.bak', false],
    // numeric comparisons
    ['>100', 250, true],
    ['>100', 100, false],
    ['>=100', 100, true],
    ['<100', 99, true],
    ['<100', 100, false],
    ['<=100', 100, true],
    ['>100', 'abc', false],
    // numeric comparisons read numeric strings too
    ['>100', '250', true],
    ['>= 100', ' 100 ', true],
    // sentinels, in both spellings
    ['=null', null, true],
    ['=null', undefined, true],
    ['=null', '', false],
    ['=empty', '', true],
    ['=empty', null, true],
    ['=empty', '  ', false],
    ['=blank', '  ', true],
    ['=blank', '', true],
    ['=blank', 'x', false],
    ['!null', '', true],
    ['!empty', '  ', true],
    ['!blank', '  ', false],
    ['!=null', 'x', true],
    ['!=blank', 'x', true],
    // sentinels are case-insensitive words
    ['=NULL', null, true],
    // empty expression matches everything
    ['', 'anything', true],
    ['   ', null, true],
  ];

  it.each(cases)('compileFilter(%j) applied to %j is %j', (expression, value, expected) => {
    expect(compileFilter(/** @type {string} */ (expression))(value)).toBe(expected);
  });

  it('nests the three sentinels: null implies empty implies blank', () => {
    for (const value of [null, undefined]) {
      expect(compileFilter('=null')(value)).toBe(true);
      expect(compileFilter('=empty')(value)).toBe(true);
      expect(compileFilter('=blank')(value)).toBe(true);
    }
    expect(compileFilter('=null')('')).toBe(false);
    expect(compileFilter('=empty')('')).toBe(true);
    expect(compileFilter('=blank')('')).toBe(true);
  });
});

describe('compileFilter — case sensitivity', () => {
  it('is case-insensitive by default across the text operators', () => {
    expect(compileFilter('FOX')('the fox')).toBe(true);
    expect(compileFilter('=FOX')('fox')).toBe(true);
    expect(compileFilter('^THE')('the fox')).toBe(true);
    expect(compileFilter('FOX$')('the fox')).toBe(true);
  });

  it('honours caseSensitive: true', () => {
    expect(compileFilter('FOX', { caseSensitive: true })('the fox')).toBe(false);
    expect(compileFilter('fox', { caseSensitive: true })('the fox')).toBe(true);
    expect(compileFilter('=FOX', { caseSensitive: true })('fox')).toBe(false);
    expect(compileFilter('^THE', { caseSensitive: true })('the fox')).toBe(false);
    expect(compileFilter('FOX$', { caseSensitive: true })('the fox')).toBe(false);
  });
});

describe('compileFilter — totality (NFR-09)', () => {
  it('falls back to a literal match when an operand cannot be read', () => {
    expect(compileFilter('>abc')('a >abc b')).toBe(true);
    expect(compileFilter('>abc')('250')).toBe(false);
    expect(compileFilter('>')('a > b')).toBe(true);
    expect(compileFilter('^')('a ^ b')).toBe(true);
    expect(compileFilter('$')('a $ b')).toBe(true);
    expect(compileFilter('!nope')('!nope')).toBe(true);
  });

  it('matches a very long expression literally instead of parsing it', () => {
    const long = `>${'9'.repeat(2000)}`;
    const predicate = compileFilter(long);
    expect(predicate(long)).toBe(true);
    expect(predicate(Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('never throws on a value that cannot be converted to a string', () => {
    const hostile = Object.create(null);
    const throwing = {
      toString() {
        throw new Error('nope');
      },
    };
    for (const expression of ['x', '=x', '^x', 'x$', '>1', '=blank']) {
      const predicate = compileFilter(expression);
      expect(() => predicate(hostile)).not.toThrow();
      expect(() => predicate(throwing)).not.toThrow();
      expect(() => predicate(Symbol('s'))).not.toThrow();
    }
    expect(compileFilter('=empty')(hostile)).toBe(true);
  });

  it('treats non-finite numbers as unreadable in a comparison', () => {
    expect(compileFilter('>1')(Number.POSITIVE_INFINITY)).toBe(false);
    expect(compileFilter('>1')(Number.NaN)).toBe(false);
    expect(compileFilter('<1')(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('reads dates and other value types through their text form', () => {
    expect(compileFilter('^2026-08')(new Date('2026-08-06T10:00:00.000Z'))).toBe(true);
    expect(compileFilter('=empty')(new Date('nope'))).toBe(true);
    expect(compileFilter('true')(true)).toBe(true);
    expect(compileFilter('>1')(2n)).toBe(true);
  });
});

describe('compileFilter — locale-aware numeric operands', () => {
  it('reads plain numbers without a locale, deterministically', () => {
    expect(compileFilter('>1.5')(2)).toBe(true);
    expect(compileFilter('>1.5')(1.4)).toBe(false);
  });

  it('honours a locale for both operand and value', () => {
    const predicate = compileFilter('>1.000,5', { locale: 'de-DE' });
    expect(predicate('1.001')).toBe(true);
    expect(predicate('1.000,4')).toBe(false);
    expect(predicate(2000)).toBe(true);
  });
});

describe('compileFilter — custom operators', () => {
  /** @type {import('../../../../../main/javascript/it/d4np/utils/table.js').FilterOperator} */
  const near = (operand, { toNumber }) => {
    const target = toNumber(operand);
    return (value) => {
      const n = toNumber(value);
      return n !== null && target !== null && Math.abs(n - target) <= 10;
    };
  };

  it('registers a new leading token', () => {
    const predicate = compileFilter('~50', { operators: { '~': near } });
    expect(predicate(45)).toBe(true);
    expect(predicate(80)).toBe(false);
  });

  it('matches the longest custom token first, and can override a built-in', () => {
    const calls = /** @type {string[]} */ ([]);
    const predicate = compileFilter('>>7', {
      operators: {
        '>': () => {
          calls.push('short');
          return () => false;
        },
        '>>': () => {
          calls.push('long');
          return () => true;
        },
      },
    });
    expect(predicate(1)).toBe(true);
    expect(calls).toEqual(['long']);
  });

  it('ignores an empty token and leaves the built-in grammar intact', () => {
    const predicate = compileFilter('>100', { operators: { '': () => () => true } });
    expect(predicate(50)).toBe(false);
  });

  it('throws TypeError when a custom operator is not a well-formed factory', () => {
    expect(() => compileFilter('~1', { operators: { '~': /** @type {any} */ (1) } })).toThrow(
      TypeError,
    );
    expect(() =>
      compileFilter('~1', { operators: { '~': /** @type {any} */ (() => 'nope') } }),
    ).toThrow(TypeError);
  });
});

describe('compileFilter — rejected input (ADR-0004 split)', () => {
  it('throws TypeError on a non-string expression', () => {
    expect(() => compileFilter(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => compileFilter(/** @type {any} */ (5))).toThrow(TypeError);
  });

  it('throws TypeError on malformed options', () => {
    expect(() => compileFilter('x', { caseSensitive: /** @type {any} */ ('yes') })).toThrow(
      TypeError,
    );
    expect(() => compileFilter('x', { operators: /** @type {any} */ ('no') })).toThrow(TypeError);
    expect(() => compileFilter('x', { operators: /** @type {any} */ (null) })).toThrow(TypeError);
  });
});

describe('comparator — auto mode', () => {
  it('sorts numbers numerically, not lexicographically', () => {
    expect([10, 9, 100, 1].sort(comparator())).toEqual([1, 9, 10, 100]);
  });

  it('collates text naturally, ignoring case and accents', () => {
    expect(['item 10', 'item 9', 'Item 1'].sort(comparator({ locale: 'en' }))).toEqual([
      'Item 1',
      'item 9',
      'item 10',
    ]);
  });

  it('orders dates chronologically, Date instances and ISO strings alike', () => {
    const sorted = [
      new Date('2026-03-01T00:00:00.000Z'),
      '2026-01-15',
      new Date('2026-02-01T00:00:00.000Z'),
    ].sort(comparator());
    expect(sorted[0]).toBe('2026-01-15');
    expect(/** @type {Date} */ (sorted[2]).toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('orders booleans false before true', () => {
    expect([true, false, true].sort(comparator())).toEqual([false, true, true]);
  });

  it('orders mixed types by type, then by value', () => {
    const sorted = [/** @type {unknown} */ ('zeta'), 42, true, '2026-01-15'].sort(comparator());
    expect(sorted).toEqual([true, 42, '2026-01-15', 'zeta']);
  });

  it('treats an ISO-shaped string that is not a real date as text', () => {
    // `looksLikeIsoDate` confirms with `Date.parse`, so these never reach the
    // date rank and collate as ordinary strings.
    const compare = comparator();
    expect(compare('2026-13-45T99', '2026-13-46T99')).toBeLessThan(0);
  });

  it('pins an invalid Date as missing rather than ordering it', () => {
    const compare = comparator();
    expect(compare(new Date('nope'), new Date('2026-01-01'))).toBeGreaterThan(0);
    expect(compare(new Date('nope'), null)).toBe(0);
  });
});

describe('comparator — declared types', () => {
  it('coerces numeric strings in number mode', () => {
    expect(['10', '9', '100'].sort(comparator({ type: 'number' }))).toEqual(['9', '10', '100']);
  });

  it('reads locale-formatted numbers when a locale is given', () => {
    expect(['1.000,5', '999,4'].sort(comparator({ type: 'number', locale: 'de-DE' }))).toEqual([
      '999,4',
      '1.000,5',
    ]);
  });

  it('treats unreadable values as missing in number mode', () => {
    expect(['5', 'abc', '1'].sort(comparator({ type: 'number' }))).toEqual(['1', '5', 'abc']);
  });

  it('reads epoch numbers, Date instances and ISO strings in date mode', () => {
    const compare = comparator({ type: 'date' });
    expect(compare(new Date('2026-01-01T00:00:00.000Z'), '2026-06-01')).toBeLessThan(0);
    expect(compare(0, '1971-01-01')).toBeLessThan(0);
    expect(compare('not-a-date', '2026-06-01')).toBeGreaterThan(0); // unreadable → missing
    expect(compare(new Date('nope'), '2026-06-01')).toBeGreaterThan(0);
    expect(compare(Number.POSITIVE_INFINITY, '2026-06-01')).toBeGreaterThan(0);
    // An ISO-shaped string is confirmed digit by digit before Date.parse runs.
    expect(compare('2026-01x15', '2026-06-01')).toBeGreaterThan(0);
    expect(compare('2026x01-15', '2026-06-01')).toBeGreaterThan(0);
  });

  it('reads the word forms in boolean mode', () => {
    const compare = comparator({ type: 'boolean' });
    expect(compare('false', 'true')).toBeLessThan(0);
    expect(compare(0, 1)).toBeLessThan(0);
    expect(compare(false, false)).toBe(0);
    expect(compare('maybe', true)).toBeGreaterThan(0); // unreadable → missing
    expect(compare(7, true)).toBeGreaterThan(0);
  });

  it('collates everything through the collator in string mode', () => {
    expect([10, 9, 100].sort(comparator({ type: 'string', locale: 'en' }))).toEqual([9, 10, 100]);
  });

  it('accepts an injected collator', () => {
    const collator = new Intl.Collator('en', { sensitivity: 'variant' });
    expect(['b', 'B', 'a'].sort(comparator({ collator }))).toEqual(['a', 'b', 'B']);
  });
});

describe('comparator — direction and pinned empties', () => {
  it('reverses order without moving the empties', () => {
    const rows = ['b', null, 'a', '', 'c'];
    expect([...rows].sort(comparator())).toEqual(['a', 'b', 'c', null, '']);
    expect([...rows].sort(comparator({ direction: 'desc' }))).toEqual(['c', 'b', 'a', null, '']);
  });

  it('pins the empties first when asked, in both directions', () => {
    const rows = ['b', null, 'a'];
    expect([...rows].sort(comparator({ emptiesLast: false }))).toEqual([null, 'a', 'b']);
    expect([...rows].sort(comparator({ emptiesLast: false, direction: 'desc' }))).toEqual([
      null,
      'b',
      'a',
    ]);
  });

  it('treats two empties as equal, and returns +0 rather than -0', () => {
    expect(comparator()(null, '')).toBe(0);
    expect(comparator()(undefined, null)).toBe(0);
    expect(Object.is(comparator({ direction: 'desc' })('a', 'a'), 0)).toBe(true);
    expect(Object.is(comparator({ direction: 'desc' })(null, ''), 0)).toBe(true);
  });

  it('cannot pin a literal undefined first — Array.prototype.sort moves it', () => {
    // The comparator itself orders undefined first when asked...
    expect(comparator({ emptiesLast: false })(undefined, 'a')).toBeLessThan(0);
    // ...but sort() never calls it for undefined elements; they always land
    // last. Documented in the JSDoc; normalize to null when it matters.
    expect(['a', undefined, null].sort(comparator({ emptiesLast: false }))).toEqual([
      null,
      'a',
      undefined,
    ]);
  });
});

describe('comparator — rejected options', () => {
  it('throws TypeError on an unknown type or direction', () => {
    expect(() => comparator({ type: /** @type {any} */ ('money') })).toThrow(TypeError);
    expect(() => comparator({ direction: /** @type {any} */ ('up') })).toThrow(TypeError);
  });

  it('throws TypeError on a non-boolean emptiesLast', () => {
    expect(() => comparator({ emptiesLast: /** @type {any} */ (1) })).toThrow(TypeError);
  });
});

describe('paginate — spec examples', () => {
  const rows = Array.from({ length: 100 }, (_, i) => i);

  it('slices the requested page', () => {
    expect(paginate(rows, { page: 3, pageSize: 25 })).toEqual({
      items: rows.slice(50, 75),
      page: 3,
      pageCount: 4,
      total: 100,
    });
  });

  it('defaults to the first page', () => {
    expect(paginate(rows, { pageSize: 10 }).page).toBe(1);
  });

  it('clamps an out-of-range page instead of failing', () => {
    expect(paginate(rows, { page: 99, pageSize: 25 }).page).toBe(4);
    expect(paginate(rows, { page: -3, pageSize: 25 }).page).toBe(1);
  });

  it('reports one page for an empty list', () => {
    expect(paginate([], { pageSize: 25 })).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
    });
  });

  it('handles a final short page', () => {
    const page = paginate(rows.slice(0, 26), { page: 2, pageSize: 25 });
    expect(page.items).toHaveLength(1);
    expect(page.pageCount).toBe(2);
  });

  it('never mutates or aliases the input', () => {
    const source = [1, 2, 3];
    const page = paginate(source, { pageSize: 3 });
    page.items.push(4);
    expect(source).toEqual([1, 2, 3]);
  });

  it('throws TypeError on invalid input', () => {
    expect(() => paginate(/** @type {any} */ ('abc'), { pageSize: 10 })).toThrow(TypeError);
    expect(() => paginate([], /** @type {any} */ (undefined))).toThrow(TypeError);
    expect(() => paginate([], { pageSize: 0 })).toThrow(TypeError);
    expect(() => paginate([], { pageSize: 2.5 })).toThrow(TypeError);
    expect(() => paginate([], { page: 1.5, pageSize: 10 })).toThrow(TypeError);
  });
});
