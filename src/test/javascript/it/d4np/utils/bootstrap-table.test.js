// @vitest-environment jsdom
// Example tests (roadmap 15.1, spec 04 §2 item F66, NFR-15/NFR-19/NFR-21,
// ADR-0039) for the Bootstrap table manager.
//
// The weight here is on the three claims a facade can quietly fail: that the
// pipeline it owns is genuinely the public one (commands re-render, an injected
// instance is borrowed rather than adopted), that a re-render costs zero new
// listeners however many times it happens, and that a cell can never become
// markup by accident — including the cases where a value is not a string at all.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bsTable } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';
import { tablePipeline } from '../../../../../main/javascript/it/d4np/utils/table.js';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** @returns {HTMLElement} */
function host() {
  document.body.innerHTML = '<div id="host"></div>';
  return /** @type {HTMLElement} */ (document.getElementById('host'));
}

const HOSTS = [
  { id: 'a', host: 'gw-01', ip: '192.168.1.1', up: true },
  { id: 'b', host: 'gw-02', ip: '192.168.1.2', up: false },
  { id: 'c', host: 'srv-01', ip: '10.0.0.7', up: true },
];

/** @type {const} */
const COLUMNS = [
  { key: 'host', label: 'Host', sortable: true },
  { key: 'ip', label: 'Address' },
];

/**
 * The rendered body, as text.
 *
 * `:scope >` throughout, not `'tbody tr'`: a descendant combinator is matched
 * against the whole document ancestry, so inside a nested table the *header*
 * row of the inner table also has a `tbody` ancestor — the outer one's — and a
 * naive selector picks it up. Scoping is what actually means "mine".
 *
 * @param {Element} table
 * @returns {string[][]}
 */
function bodyText(table) {
  return [...table.querySelectorAll(':scope > tbody > tr')].map((tr) =>
    [...tr.querySelectorAll(':scope > td')].map((td) => td.textContent ?? ''),
  );
}

describe('bsTable — structure', () => {
  it('renders a header from the columns and a body from the view', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS });

    const headers = [...table.table.querySelectorAll('thead th')];
    expect(headers.map((th) => th.textContent)).toEqual(['Host', 'Address']);
    expect(headers.every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    expect(bodyText(table.table)).toEqual([
      ['gw-01', '192.168.1.1'],
      ['gw-02', '192.168.1.2'],
      ['srv-01', '10.0.0.7'],
    ]);
  });

  it('falls back to the key as a header label, and marks only sortable columns', () => {
    const table = bsTable(host(), { columns: [{ key: 'host' }, { key: 'ip' }], data: HOSTS });
    expect(table.table.querySelector('thead th')?.textContent).toBe('host');
    // No column declared sortable, so nothing carries the 15.2 hook.
    expect(table.table.querySelector('[data-sort-key]')).toBeNull();
  });

  it('stamps data-sort-key on sortable headers, for the F67 bindings to find', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS });
    const marked = [...table.table.querySelectorAll('th[data-sort-key]')];
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute('data-sort-key')).toBe('host');
  });

  it('maps the style flags to Bootstrap classes', () => {
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      striped: true,
      stripedColumns: true,
      hover: true,
      bordered: true,
      borderless: true,
      small: true,
      variant: 'dark',
      class: 'mb-0 align-middle',
    });
    expect([...table.table.classList]).toEqual([
      'table',
      'table-striped',
      'table-striped-columns',
      'table-hover',
      'table-bordered',
      'table-borderless',
      'table-sm',
      'table-dark',
      'mb-0',
      'align-middle',
    ]);
  });

  it('wraps in a responsive container, and then element and table differ', () => {
    const container = host();
    const plain = bsTable(container, { columns: [...COLUMNS], data: HOSTS });
    expect(plain.element).toBe(plain.table);

    const table = bsTable(container, { columns: [...COLUMNS], data: HOSTS, responsive: true });
    expect(table.element).not.toBe(table.table);
    expect([...table.element.classList]).toEqual(['table-responsive']);
    expect(table.element.firstElementChild).toBe(table.table);
    // `element` is what was appended, which is what makes it the thing to remove.
    expect(table.element.parentElement).toBe(container);
  });

  it('takes a breakpoint for the responsive wrapper', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS, responsive: 'lg' });
    expect([...table.element.classList]).toEqual(['table-responsive-lg']);
  });

  it('renders a caption, above the table on request', () => {
    const below = bsTable(host(), { columns: [...COLUMNS], data: HOSTS, caption: 'Hosts' });
    expect(below.table.querySelector('caption')?.textContent).toBe('Hosts');
    expect(below.table.classList.contains('caption-top')).toBe(false);

    const above = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      caption: 'Hosts',
      captionTop: true,
    });
    expect(above.table.classList.contains('caption-top')).toBe(true);
  });

  it('aligns a column in the header and the cells together', () => {
    const table = bsTable(host(), {
      columns: [
        { key: 'host', label: 'Host', headerClass: 'w-50' },
        { key: 'ip', label: 'Address', align: 'end', cellClass: ['font-monospace', 'small'] },
      ],
      data: HOSTS,
    });
    const [hostHead, ipHead] = [...table.table.querySelectorAll('thead th')];
    expect([...hostHead.classList]).toEqual(['w-50']);
    expect([...ipHead.classList]).toEqual(['text-end']);
    const firstRowCells = [...table.table.querySelectorAll('tbody tr td')];
    expect([...firstRowCells[1].classList]).toEqual(['text-end', 'font-monospace', 'small']);
  });
});

describe('bsTable — cells', () => {
  it('renders a format result as text, a node as itself, an array in order', () => {
    const node = document.createElement('strong');
    node.textContent = 'up';
    const table = bsTable(host(), {
      columns: [
        { key: 'host', format: (value) => `» ${String(value)}` },
        { key: 'up', format: (value) => (value === true ? node : 'down') },
        { key: 'ip', format: (value, row) => ['#', String(row.id), ' ', String(value)] },
      ],
      data: [HOSTS[0]],
    });
    const cells = [...table.table.querySelectorAll('tbody td')];
    expect(cells[0].textContent).toBe('» gw-01');
    expect(cells[1].firstElementChild).toBe(node);
    expect(cells[2].textContent).toBe('#a 192.168.1.1');
  });

  it('renders primitives without a format, and nullish as blank', () => {
    const table = bsTable(host(), {
      columns: [{ key: 'n' }, { key: 'b' }, { key: 'big' }, { key: 'missing' }, { key: 'nul' }],
      data: [{ n: 42, b: false, big: 9007199254740993n, nul: null }],
    });
    expect(bodyText(table.table)).toEqual([['42', 'false', '9007199254740993', '', '']]);
  });

  it('renders a node value with no format at all', () => {
    const node = document.createElement('em');
    const table = bsTable(host(), { columns: [{ key: 'cell' }], data: [{ cell: node }] });
    expect(table.table.querySelector('td')?.firstElementChild).toBe(node);
  });

  it('throws rather than rendering a Date or an object the runtime would stringify', () => {
    expect(() =>
      bsTable(host(), { columns: [{ key: 'seen' }], data: [{ seen: new Date() }] }),
    ).toThrow(/column "seen" holds a Date — declare a format/);
    expect(() =>
      bsTable(host(), { columns: [{ key: 'meta' }], data: [{ meta: { a: 1 } }] }),
    ).toThrow(/column "meta" holds a object/);
  });

  it('renders through getValue, so what sorts is what shows', () => {
    const table = bsTable(host(), {
      columns: [{ key: 'label', getValue: (row) => `${row.host} (${row.ip})` }],
      data: [HOSTS[0]],
    });
    expect(table.table.querySelector('td')?.textContent).toBe('gw-01 (192.168.1.1)');
  });

  it('escapes by default and opens markup one column at a time', () => {
    const sanitize = vi.fn((html) => html);
    const table = bsTable(host(), {
      columns: [
        { key: 'plain' },
        { key: 'rich', html: true, sanitize },
        // Inherits the table-level pair, which is absent here.
        { key: 'also' },
      ],
      data: [{ plain: '<b>no</b>', rich: '<b>yes</b>', also: '<i>no</i>' }],
    });
    const cells = [...table.table.querySelectorAll('tbody td')];
    expect(cells[0].querySelector('b')).toBeNull();
    expect(cells[0].textContent).toBe('<b>no</b>');
    expect(cells[1].querySelector('b')?.textContent).toBe('yes');
    expect(cells[2].querySelector('i')).toBeNull();
    // Exactly once: the cell. A column's markup decision governs its cells, not
    // its own header label — otherwise enriching a column quietly reinterprets
    // the label beside it.
    expect(sanitize).toHaveBeenCalledTimes(1);
    expect(sanitize).toHaveBeenCalledWith('<b>yes</b>');
  });

  it("keeps a column header out of that column's markup decision", () => {
    const table = bsTable(host(), {
      columns: [{ key: 'rich', label: '<em>Rich</em>', html: true, sanitize: false }],
      data: [{ rich: '<b>yes</b>' }],
    });
    // The header is text even though the column's cells are markup.
    expect(table.table.querySelector('th')?.querySelector('em')).toBeNull();
    expect(table.table.querySelector('th')?.textContent).toBe('<em>Rich</em>');
    expect(table.table.querySelector('td b')?.textContent).toBe('yes');
  });

  it('lets a column narrow the sanitizer without repeating the html flag', () => {
    const columnSanitize = vi.fn((html) => html.replace(/<script[\s\S]*?<\/script>/g, ''));
    const table = bsTable(host(), {
      columns: [{ key: 'a' }, { key: 'b', sanitize: columnSanitize }],
      data: [{ a: '<b>1</b>', b: '<i>2</i><script>x()</script>' }],
      html: true,
      sanitize: false, // the table trusts its own markup; this one column does not
    });
    expect(table.table.querySelector('td b')?.textContent).toBe('1');
    expect(table.table.querySelector('td i')?.textContent).toBe('2');
    expect(table.table.querySelector('script')).toBeNull();
    expect(columnSanitize).toHaveBeenCalledTimes(1);
  });

  it('takes a node as a header label, which needs no markup decision', () => {
    const label = document.createElement('abbr');
    label.textContent = 'IP';
    const table = bsTable(host(), { columns: [{ key: 'ip', label }], data: HOSTS });
    expect(table.table.querySelector('th')?.firstElementChild).toBe(label);
  });

  it('lets the table-level pair cover every column when that is the intent', () => {
    const table = bsTable(host(), {
      columns: [{ key: 'a' }, { key: 'b' }],
      data: [{ a: '<b>1</b>', b: '<i>2</i>' }],
      html: true,
      sanitize: false,
    });
    expect(table.table.querySelector('td b')?.textContent).toBe('1');
    expect(table.table.querySelector('td i')?.textContent).toBe('2');
  });

  it('refuses markup with no sanitize decision, in a cell as anywhere else', () => {
    expect(() =>
      bsTable(host(), {
        columns: [{ key: 'rich', html: true }],
        data: [{ rich: '<b>x</b>' }],
      }),
    ).toThrow(/options.sanitize is required with \{ html: true \}/);
  });
});

describe('bsTable — the pipeline is public', () => {
  it('owns one, and its commands re-render the body', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS, pageSize: 2 });
    expect(bodyText(table.table)).toHaveLength(2);

    table.pipeline.setFilter('ip', '^192.168');
    expect(bodyText(table.table).map((row) => row[0])).toEqual(['gw-01', 'gw-02']);

    table.pipeline.toggleSort('host');
    table.pipeline.toggleSort('host'); // asc → desc
    expect(bodyText(table.table).map((row) => row[0])).toEqual(['gw-02', 'gw-01']);

    table.pipeline.setPage(2);
    expect(table.pipeline.view().page).toBe(1); // one page after filtering, clamped
  });

  it('builds an empty pipeline when no data was supplied', () => {
    const table = bsTable(host(), { columns: [...COLUMNS] });
    expect(table.pipeline.view().total).toBe(0);
    expect(table.table.querySelectorAll('tbody tr')).toHaveLength(0);
    // Still a usable instance, not a special case: data can arrive later.
    table.setData(HOSTS);
    expect(bodyText(table.table)).toHaveLength(3);
  });

  it('forwards the locale to the pipeline it builds', () => {
    const table = bsTable(host(), {
      columns: [{ key: 'load' }],
      data: [{ load: '1,5' }, { load: '12' }],
      locale: 'it',
    });
    // With `it`, the comma is a decimal separator, so 1,5 is one and a half and
    // does not survive `>2` — the observable proof the option was passed on.
    table.pipeline.setFilter('load', '>2');
    expect(bodyText(table.table)).toEqual([['12']]);
  });

  it('setData replaces the source through the same pipeline', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS });
    table.setData([{ host: 'new-01', ip: '172.16.0.1' }]);
    expect(bodyText(table.table)).toEqual([['new-01', '172.16.0.1']]);
    expect(table.pipeline.view().total).toBe(1);
  });

  it('renders an injected pipeline and borrows it rather than adopting it', () => {
    const pipeline = tablePipeline({ source: HOSTS, columns: [{ key: 'host' }, { key: 'ip' }] });
    const changes = vi.fn();
    pipeline.on('change', changes);

    const table = bsTable(host(), { columns: [...COLUMNS], pipeline });
    expect(table.pipeline).toBe(pipeline);
    expect(bodyText(table.table)).toHaveLength(3);

    table.destroy();
    // The pipeline outlives the table: the other subscriber keeps working, which
    // is the whole point of being allowed to pass one in.
    pipeline.setSource([HOSTS[0]]);
    expect(changes).toHaveBeenCalled();
    expect(pipeline.view().total).toBe(1);
  });

  it('refuses the options that would build a second pipeline', () => {
    const pipeline = tablePipeline({ source: HOSTS });
    for (const extra of [{ data: HOSTS }, { pageSize: 10 }, { locale: 'it' }]) {
      expect(() => bsTable(host(), { columns: [...COLUMNS], pipeline, ...extra })).toThrow(
        /cannot be combined with options.pipeline/,
      );
    }
  });

  it('rejects something that is not a pipeline', () => {
    expect(() =>
      bsTable(host(), { columns: [...COLUMNS], pipeline: /** @type {never} */ ({ view: 1 }) }),
    ).toThrow(/must be a tablePipeline instance/);
  });
});

describe('bsTable — rows', () => {
  it('stamps data-key from a property name or an extractor', () => {
    const byName = bsTable(host(), { columns: [...COLUMNS], data: HOSTS, rowKey: 'id' });
    expect(
      [...byName.table.querySelectorAll('tbody tr')].map((tr) => tr.getAttribute('data-key')),
    ).toEqual(['a', 'b', 'c']);

    const byFn = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      rowKey: (row, index) => `${row.id}-${index}`,
    });
    expect(byFn.table.querySelector('tbody tr')?.getAttribute('data-key')).toBe('a-0');
  });

  it('omits data-key when the extractor has nothing to stamp', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS, rowKey: 'absent' });
    expect(table.table.querySelector('tbody tr')?.hasAttribute('data-key')).toBe(false);
  });

  it('renders the empty slot only when the view has no rows', () => {
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      empty: 'Nothing matches.',
    });
    expect(table.table.querySelector('tbody td[colspan]')).toBeNull();

    table.pipeline.setSearch('nothing-like-this');
    const cell = table.table.querySelector('tbody td[colspan]');
    expect(cell?.getAttribute('colspan')).toBe('2');
    expect(cell?.textContent).toBe('Nothing matches.');
  });

  it('leaves the body empty when no empty slot was supplied', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: [] });
    expect(table.table.querySelectorAll('tbody tr')).toHaveLength(0);
  });
});

describe('bsTable — row activation', () => {
  it('reports the row behind a click through one delegated listener', () => {
    const onRowClick = vi.fn();
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS, onRowClick });
    const attach = vi.spyOn(Element.prototype, 'addEventListener');

    const rows = [...table.table.querySelectorAll('tbody tr')];
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0]).toEqual(HOSTS[1]);

    // Re-render, then click again: still one handler, and no new attachment.
    table.setData([...HOSTS].reverse());
    table.table
      .querySelectorAll('tbody tr')[0]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick.mock.calls[1][0]).toEqual(HOSTS[2]);
    expect(attach).not.toHaveBeenCalled();
  });

  it('is reachable from the keyboard, which a pointer-only row is not', () => {
    const onRowClick = vi.fn();
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS, onRowClick });
    const row = /** @type {HTMLElement} */ (table.table.querySelector('tbody tr'));
    expect(row.getAttribute('tabindex')).toBe('0');

    for (const key of ['Enter', ' ']) {
      row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    expect(onRowClick).toHaveBeenCalledTimes(2);

    // Any other key is not an activation.
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('leaves the keyboard to a control inside the row', () => {
    const onRowClick = vi.fn();
    const button = document.createElement('button');
    const table = bsTable(host(), {
      columns: [{ key: 'host' }, { key: 'action', format: () => button }],
      data: [HOSTS[0]],
      onRowClick,
    });
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onRowClick).not.toHaveBeenCalled();
    expect(table.table.contains(button)).toBe(true);
  });

  it('does not fire when the click belonged to a control in the row', () => {
    const onRowClick = vi.fn();
    const button = document.createElement('button');
    const optOut = document.createElement('span');
    optOut.setAttribute('data-egl-no-row-click', '');
    bsTable(host(), {
      columns: [
        { key: 'host' },
        { key: 'action', format: () => button },
        { key: 'quiet', format: () => optOut },
      ],
      data: [HOSTS[0]],
      onRowClick,
    });

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    optOut.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("never claims a nested table's rows as its own", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const holder = document.createElement('div');
    const nested = bsTable(holder, {
      columns: [{ key: 'ip' }],
      data: [HOSTS[2]],
      onRowClick: inner,
    });
    bsTable(host(), {
      columns: [{ key: 'host' }, { key: 'detail', format: () => holder }],
      data: [HOSTS[0]],
      onRowClick: outer,
    });

    // `:scope >`, for the reason bodyText documents: once this table sits in a
    // cell of the other, `'tbody tr'` also matches its own header row.
    const nestedRow = /** @type {Element} */ (nested.table.querySelector(':scope > tbody > tr'));
    nestedRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // The inner table owns it; the outer one must not look up index 0 in *its*
    // rows and report the wrong record.
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('ignores a foreign row appended into the body', () => {
    const onRowClick = vi.fn();
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS, onRowClick });
    const tbody = /** @type {Element} */ (table.table.querySelector('tbody'));
    const alien = document.createElement('tr');
    alien.setAttribute('data-egl-index', '99');
    tbody.append(alien);

    alien.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('leaves rows out of the tab order when there is nothing to activate', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS });
    expect(table.table.querySelector('tbody tr')?.hasAttribute('tabindex')).toBe(false);
  });
});

describe('bsTable — teardown (NFR-15)', () => {
  it('removes the element, unsubscribes, and is idempotent', () => {
    const container = host();
    const onRowClick = vi.fn();
    const table = bsTable(container, { columns: [...COLUMNS], data: HOSTS, onRowClick });
    const row = /** @type {Element} */ (table.table.querySelector('tbody tr'));
    const before = bodyText(table.table);

    table.destroy();
    table.destroy(); // idempotent

    expect(container.children).toHaveLength(0);
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRowClick).not.toHaveBeenCalled();

    // The subscription is gone: a command on the pipeline no longer renders.
    table.pipeline.setSource([{ host: 'x', ip: 'y' }]);
    expect(bodyText(table.table)).toEqual(before);
  });

  it('rejects setData after destroy rather than doing nothing', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS });
    table.destroy();
    expect(() => table.setData([])).toThrow(/setData\(\) was called after destroy\(\)/);
  });

  it('destroys on an aborted signal, before or after construction', () => {
    const container = host();
    const live = new AbortController();
    bsTable(container, { columns: [...COLUMNS], data: HOSTS, signal: live.signal });
    expect(container.children).toHaveLength(1);
    live.abort();
    expect(container.children).toHaveLength(0);

    const already = AbortSignal.abort();
    const table = bsTable(container, { columns: [...COLUMNS], data: HOSTS, signal: already });
    expect(container.children).toHaveLength(0);
    expect(table.element.parentElement).toBeNull();
  });
});

describe('bsTable — argument contracts', () => {
  it('rejects a container that is not an element, and options that are not an object', () => {
    expect(() => bsTable(/** @type {never} */ (null), { columns: [...COLUMNS] })).toThrow(
      /container must be an Element/,
    );
    expect(() => bsTable(host(), /** @type {never} */ (undefined))).toThrow(
      /options must be an object/,
    );
  });

  it('requires columns, and validates each one', () => {
    expect(() => bsTable(host(), { columns: /** @type {never} */ ([]) })).toThrow(
      /options.columns must be a non-empty array/,
    );
    expect(() => bsTable(host(), { columns: /** @type {never} */ ('host') })).toThrow(
      /options.columns must be a non-empty array/,
    );
    expect(() => bsTable(host(), { columns: /** @type {never} */ ([null]) })).toThrow(
      /options.columns\[0\] must be an object/,
    );
    expect(() => bsTable(host(), { columns: /** @type {never} */ ([{}]) })).toThrow(
      /options.columns\[0\].key must be a non-empty string/,
    );
    expect(() =>
      bsTable(host(), { columns: [{ key: 'a', format: /** @type {never} */ ('x') }] }),
    ).toThrow(/options.columns\[0\].format must be a function/);
    expect(() =>
      bsTable(host(), { columns: [{ key: 'a', align: /** @type {never} */ ('middle') }] }),
    ).toThrow(/align must be start, center, or end/);
  });

  it('validates the instance options', () => {
    const columns = [...COLUMNS];
    expect(() => bsTable(host(), { columns, onRowClick: /** @type {never} */ (1) })).toThrow(
      /options.onRowClick must be a function/,
    );
    expect(() => bsTable(host(), { columns, rowKey: /** @type {never} */ (1) })).toThrow(
      /options.rowKey must be a string or a function/,
    );
    expect(() => bsTable(host(), { columns, variant: 'two words' })).toThrow(
      /options.variant must be a non-empty string without whitespace/,
    );
    expect(() => bsTable(host(), { columns, responsive: 'two words' })).toThrow(
      /options.responsive must be a non-empty string without whitespace/,
    );
    expect(() => bsTable(host(), { columns, signal: /** @type {never} */ ({}) })).toThrow(
      /options.signal must be an AbortSignal/,
    );
  });
});

// ---------------------------------------------------------------------------
// Controls (roadmap 15.2, spec 04 F67, ADR-0040).
//
// The claim under test is that these are *wires*, not a second implementation:
// the inputs speak the F33 grammar because they hand their text to the pipeline
// untouched, sorting and debouncing are F51's, the pager is F65's, and teardown
// is one pass over all of it.
// ---------------------------------------------------------------------------

/** @param {Element} root @param {number} column @returns {HTMLInputElement} */
function filterInput(root, column) {
  return /** @type {HTMLInputElement} */ (
    root.querySelector(`thead tr:last-child td:nth-child(${column}) input`)
  );
}

describe('bsTable — controls (F67)', () => {
  it('renders nothing extra when no controls were asked for', () => {
    const table = bsTable(host(), { columns: [...COLUMNS], data: HOSTS });
    expect(table.element).toBe(table.table);
    expect(table.controls).toBeUndefined();
    expect(table.table.querySelectorAll('thead tr')).toHaveLength(1);
  });

  it('wraps the table and exposes the control nodes', () => {
    const container = host();
    const table = bsTable(container, {
      columns: [...COLUMNS],
      data: HOSTS,
      pageSize: 2,
      controls: { filterRow: true, search: true, pageSize: true, pagination: true },
    });

    expect(table.element).not.toBe(table.table);
    expect(table.element.parentElement).toBe(container);
    expect(table.element.contains(table.table)).toBe(true);
    expect(table.controls?.search?.getAttribute('aria-label')).toBe('Search');
    expect(table.controls?.pageSize?.getAttribute('aria-label')).toBe('Rows per page');
    expect(table.controls?.pagination?.tagName).toBe('NAV');
    expect(Object.keys(table.controls?.filters ?? {})).toEqual(['host', 'ip']);
  });

  it('filters through the pipeline in the F33 grammar, debounced', () => {
    vi.useFakeTimers();
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      controls: { filterRow: true },
    });

    const input = filterInput(table.element, 2); // the ip column
    input.value = '^192.168';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Debounced: nothing has happened yet.
    expect(bodyText(table.table)).toHaveLength(3);
    vi.advanceTimersByTime(200);
    expect(bodyText(table.table).map((row) => row[0])).toEqual(['gw-01', 'gw-02']);

    // And the grammar is the pipeline's, not a reimplementation: an operator the
    // input never parses still works.
    input.value = '=empty';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(bodyText(table.table)).toHaveLength(0);
  });

  it('passes a custom operator straight through to the pipeline', () => {
    vi.useFakeTimers();
    // The operator lives on the pipeline the caller built; the input only ever
    // hands over text, which is why it needs no knowledge of the grammar.
    const pipeline = tablePipeline({
      source: HOSTS,
      columns: [{ key: 'host' }, { key: 'ip' }],
      operators: { '~': (expression) => (value) => String(value).endsWith(expression) },
    });
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      pipeline,
      controls: { filterRow: true },
    });

    const input = filterInput(table.element, 1);
    input.value = '~01';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(bodyText(table.table).map((row) => row[0])).toEqual(['gw-01', 'srv-01']);
  });

  it('searches, and leaves an unfilterable column without a box', () => {
    vi.useFakeTimers();
    const table = bsTable(host(), {
      columns: [
        { key: 'host', label: 'Host', searchable: true },
        { key: 'ip', label: 'Address', filterable: false },
      ],
      data: HOSTS,
      controls: { filterRow: true, search: true },
    });

    // A cell, but no control: the pipeline would reject a filter on that column.
    const cells = [...table.element.querySelectorAll('thead tr:last-child td')];
    expect(cells).toHaveLength(2);
    expect(cells[1].querySelector('input')).toBeNull();
    expect(Object.keys(table.controls?.filters ?? {})).toEqual(['host']);

    const search = /** @type {HTMLInputElement} */ (table.controls?.search);
    search.value = 'srv';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(bodyText(table.table)).toHaveLength(1);
  });

  it('sorts from a header click and reflects aria-sort', () => {
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      controls: { filterRow: true },
    });
    const header = /** @type {Element} */ (table.table.querySelector('th[data-sort-key]'));

    expect(header.getAttribute('aria-sort')).toBe('none');
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(bodyText(table.table).map((row) => row[0])).toEqual(['gw-01', 'gw-02', 'srv-01']);
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(header.getAttribute('aria-sort')).toBe('descending');
  });

  it('does not sort when the click was on a filter input in the same thead', () => {
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      controls: { filterRow: true },
    });
    filterInput(table.element, 1).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(table.pipeline.view().sort).toEqual([]);
  });

  it('drives and reflects the pager, and shows a language-neutral status', () => {
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      pageSize: 1,
      controls: { pagination: true },
    });

    expect(table.controls?.status?.textContent).toBe('1 / 3');
    const pages = [...(table.controls?.pagination?.querySelectorAll('button') ?? [])];
    // prev, 1, 2, 3, next
    expect(pages).toHaveLength(5);
    pages[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(table.pipeline.view().page).toBe(2);
    expect(bodyText(table.table)).toEqual([['gw-02', '192.168.1.2']]);
    expect(table.controls?.status?.textContent).toBe('2 / 3');
    expect(table.controls?.pagination?.querySelector('.active')?.textContent).toBe('2');
  });

  it('takes injected status wording, since digits are the only neutral default', () => {
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      pageSize: 2,
      controls: {
        pagination: true,
        formatStatus: (view) => `Pagina ${view.page} di ${view.pageCount}`,
      },
    });
    expect(table.controls?.status?.textContent).toBe('Pagina 1 di 2');
  });

  it('changes the page size, and only offers "all" when a word was supplied', () => {
    const plain = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      pageSize: 2,
      controls: { pageSize: true },
    });
    const select = /** @type {HTMLSelectElement} */ (plain.controls?.pageSize);
    // The table's own size is in the list and selected, whatever the defaults are.
    expect([...select.options].map((option) => option.value)).toEqual([
      '2',
      '10',
      '25',
      '50',
      '100',
    ]);
    expect(select.value).toBe('2');

    select.value = '100';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(plain.pipeline.view().pageCount).toBe(1);

    const withAll = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      controls: { pageSize: { options: [5], allLabel: 'Tutte' } },
    });
    const allSelect = /** @type {HTMLSelectElement} */ (withAll.controls?.pageSize);
    expect([...allSelect.options].map((option) => option.textContent)).toEqual(['5', 'Tutte']);
  });

  it('places a toolbar node and takes injected accessible names', () => {
    const toolbar = document.createElement('div');
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      controls: {
        toolbar,
        search: { label: 'Cerca', placeholder: '…' },
        filterRow: { label: (column) => `Filtra ${String(column.label)}` },
      },
    });
    expect(table.element.contains(toolbar)).toBe(true);
    expect(table.controls?.search?.getAttribute('aria-label')).toBe('Cerca');
    expect(table.controls?.search?.getAttribute('placeholder')).toBe('…');
    expect(filterInput(table.element, 1).getAttribute('aria-label')).toBe('Filtra Host');
  });

  it('omits a band nobody put anything in', () => {
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      controls: { search: true },
    });
    // A header band for the search box, and no empty footer left behind.
    expect(table.element.children).toHaveLength(2);
    expect(table.element.lastElementChild).toBe(table.table);
  });

  it('tears controls, bindings and subscription down in one pass', () => {
    vi.useFakeTimers();
    const container = host();
    const table = bsTable(container, {
      columns: [...COLUMNS],
      data: HOSTS,
      pageSize: 2,
      controls: { filterRow: true, search: true, pagination: true },
    });
    const input = filterInput(table.element, 2);
    const pageButton = /** @type {Element} */ (
      table.controls?.pagination?.querySelectorAll('button')[2]
    );

    // A debounce in flight at teardown must never land on the pipeline.
    input.value = '^192.168';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    table.destroy();
    vi.advanceTimersByTime(1_000);

    expect(container.children).toHaveLength(0);
    expect(table.pipeline.view().filters).toEqual({});
    pageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(table.pipeline.view().page).toBe(1);
  });

  it('validates the control options', () => {
    const columns = [...COLUMNS];
    expect(() => bsTable(host(), { columns, controls: /** @type {never} */ ('yes') })).toThrow(
      /options.controls must be an object/,
    );
    expect(() =>
      bsTable(host(), { columns, controls: { toolbar: /** @type {never} */ ('x') } }),
    ).toThrow(/options.controls.toolbar must be a Node/);
    expect(() =>
      bsTable(host(), { columns, controls: { filterRow: { label: /** @type {never} */ ('x') } } }),
    ).toThrow(/options.controls.filterRow.label must be a function/);
    expect(() => bsTable(host(), { columns, controls: { pageSize: { options: [0] } } })).toThrow(
      /options.controls.pageSize.options must be positive integers/,
    );
    expect(() =>
      bsTable(host(), { columns, controls: { search: /** @type {never} */ ('x') } }),
    ).toThrow(/options.controls.search must be an object/);
  });
});

describe('bsTable — filter labels read whatever the header is', () => {
  it('names a filter from a node label, and falls back to the key', () => {
    const label = document.createElement('abbr');
    label.textContent = 'Address';
    const table = bsTable(host(), {
      columns: [{ key: 'ip', label }, { key: 'host' }],
      data: HOSTS,
      controls: { filterRow: true },
    });
    // A node header still has to yield words for the accessible name (NFR-21).
    expect(filterInput(table.element, 1).getAttribute('aria-label')).toBe('Filter Address');
    // No label at all: the key is the only name there is.
    expect(filterInput(table.element, 2).getAttribute('aria-label')).toBe('Filter host');
  });
});

describe('bsTable — control options in their object form', () => {
  it('configures the pager and can drop the status element', () => {
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      pageSize: 1,
      controls: { pagination: { status: false, siblingCount: 0, boundaryCount: 1, size: 'sm' } },
    });
    expect(table.controls?.status).toBeUndefined();
    expect(table.element.querySelector('.pagination')?.classList.contains('pagination-sm')).toBe(
      true,
    );
    // The bar still drives the pipeline; only the text beside it is gone.
    const pages = [...(table.controls?.pagination?.querySelectorAll('button') ?? [])];
    pages[pages.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(table.pipeline.view().page).toBe(2);
  });

  it('passes a shorter quiet period through to the binding', () => {
    vi.useFakeTimers();
    const table = bsTable(host(), {
      columns: [...COLUMNS],
      data: HOSTS,
      controls: { filterRow: true, debounceMs: 50 },
    });
    const input = filterInput(table.element, 1);
    input.value = 'srv';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    vi.advanceTimersByTime(50);
    expect(bodyText(table.table)).toHaveLength(1);
  });

  it('falls back to the key when the header carries no text', () => {
    // An empty header is a layout choice — a spacer column, an icon-only one —
    // and `aria-label="Filter "` would name the box after nothing.
    const table = bsTable(host(), {
      columns: [
        { key: 'host', label: document.createElement('span') },
        { key: 'ip', label: '' },
      ],
      data: HOSTS,
      controls: { filterRow: true },
    });
    expect(filterInput(table.element, 1).getAttribute('aria-label')).toBe('Filter host');
    expect(filterInput(table.element, 2).getAttribute('aria-label')).toBe('Filter ip');
  });
});
