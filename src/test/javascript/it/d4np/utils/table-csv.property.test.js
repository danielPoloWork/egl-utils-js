import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { tableCsv } from '../../../../../main/javascript/it/d4np/utils/table.js';

// Property suite (roadmap 19.4, spec 06 §2 item F96, §6): every generated field
// round-trips through a compliant parser.
//
// The parser below is written here rather than installed, for two reasons. NFR-06
// keeps runtime dependencies at zero and this project has not added a dev one for
// a single assertion since M2. And more usefully: a parser written from RFC 4180
// while *not* looking at the writer is an independent reading of the same
// grammar, which is the only kind of round-trip worth asserting. A round-trip
// through the writer's own inverse proves the writer agrees with itself.

/**
 * An RFC 4180 reader: quoted fields, doubled quotes inside them, CRLF or LF
 * record separators, and a configurable delimiter.
 *
 * @param {string} text
 * @param {string} [delimiter=',']
 * @returns {string[][]} Records of fields, with the trailing terminator dropped.
 */
function parseCsv(text, delimiter = ',') {
  /** @type {string[][]} */
  const records = [];
  /** @type {string[]} */
  let record = [];
  let field = '';
  let quoted = false;
  let index = 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }
    if (char === '\r' && text[index + 1] === '\n') {
      endRecord();
      index += 2;
      continue;
    }
    if (char === '\n') {
      endRecord();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  // A file that ends with its terminator leaves nothing pending; one that does
  // not has a final record to flush.
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

/**
 * Fields drawn to be hostile to the grammar itself: the delimiter, the quote, both
 * line terminators, and the leading characters a spreadsheet reads as code. A
 * generator of plain words would prove nothing about a writer whose whole job is
 * escaping.
 */
const field = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.string({ unit: 'grapheme', maxLength: 8 }),
  fc.constantFrom(
    '',
    ',',
    '"',
    '""',
    'a"b',
    '\r\n',
    '\n',
    '\r',
    'a\r\nb',
    '\t',
    'a\tb',
    ';',
    '=1+1',
    '+1',
    '-5',
    '@x',
    ' padded ',
    ' ',
    'é',
    '日本',
    'null',
    'undefined',
  ),
);

/** The same neutralization the writer applies, stated independently. */
function expectedText(value, neutralize) {
  const text = value === null || value === undefined ? '' : String(value);
  if (!neutralize || text === '') return text;
  if (!['=', '+', '-', '@', '\t', '\r'].includes(text[0])) return text;
  if (text.trim() !== '' && Number.isFinite(Number(text))) return text;
  return `'${text}`;
}

const delimiter = fc.constantFrom(',', ';', '\t', '|');

describe('the F96 round-trip law', () => {
  it('every field survives a compliant parser, for any delimiter', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(field, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 6 }),
        delimiter,
        fc.boolean(),
        (grid, sep, neutralize) => {
          // A rectangle: the columns are fixed for the whole file, as they are for
          // a real table.
          const width = grid[0].length;
          const rows = grid.map((values) =>
            Object.fromEntries(values.slice(0, width).map((value, i) => [`c${i}`, value])),
          );
          const columns = Array.from({ length: width }, (_unused, i) => ({ key: `c${i}` }));

          const csv = tableCsv(rows, {
            columns,
            delimiter: sep,
            header: false,
            neutralizeFormulas: neutralize,
          });
          const parsed = parseCsv(csv, sep);

          const expected = rows.map((row, r) =>
            columns.map((column, c) =>
              expectedText(grid[r][c] === undefined ? undefined : row[column.key], neutralize),
            ),
          );
          expect(parsed).toEqual(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('the header round-trips under the same rules as a field', () => {
    fc.assert(
      fc.property(fc.array(field, { minLength: 1, maxLength: 4 }), delimiter, (headers, sep) => {
        const columns = headers.map((header, i) => ({ key: `c${i}`, header: String(header) }));
        const csv = tableCsv([], { columns, delimiter: sep });
        expect(parseCsv(csv, sep)).toEqual([
          columns.map((column) => expectedText(column.header, true)),
        ]);
      }),
      { numRuns: 300 },
    );
  });

  it('no emitted field can begin with a character a spreadsheet evaluates', () => {
    // The security property, stated as one: with the default on, and setting aside
    // fields that are numbers, nothing in the file starts a formula.
    fc.assert(
      fc.property(fc.array(field, { minLength: 1, maxLength: 6 }), (values) => {
        const csv = tableCsv(
          values.map((value) => ({ a: value })),
          { columns: [{ key: 'a' }], header: false },
        );
        for (const [cell] of parseCsv(csv)) {
          if (cell === '') continue;
          if (Number.isFinite(Number(cell)) && cell.trim() !== '') continue;
          expect(['=', '+', '-', '@', '\t', '\r']).not.toContain(cell[0]);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('never throws on any field a row can hold', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            field,
            fc.integer(),
            fc.double(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        (values) => {
          expect(() =>
            tableCsv(
              values.map((value) => ({ a: value })),
              { columns: [{ key: 'a' }] },
            ),
          ).not.toThrow();
        },
      ),
      { numRuns: 300 },
    );
  });
});
