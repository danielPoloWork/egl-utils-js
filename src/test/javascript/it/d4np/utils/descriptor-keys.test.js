// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  bsAccordion,
  bsBreadcrumb,
  bsCard,
  bsCarousel,
  bsIcon,
  bsListGroup,
  bsNavbar,
  bsPagination,
  bsTable,
  bsTabs,
} from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';
import { tablePipeline } from '../../../../../main/javascript/it/d4np/utils/table.js';
import { bindTableControls } from '../../../../../main/javascript/it/d4np/utils/dom.js';

// The ADR-0056 descriptor-key contract (roadmap 17.13), extending ADR-0047's
// unknown-option rule from *option bags* to caller-supplied **descriptor
// shapes**: columns, items, labels, icon sets, control sub-configs, bindings.
//
// The rule these suites pin is one sentence: a descriptor is hand-written
// configuration, so an unrecognised key in one is the same programming error an
// unrecognised option is, and reports the same way — a `TypeError` naming the
// key and where it sat. Two things are deliberately NOT checked, and the last
// describe block pins those too: **data rows**, and **maps keyed by the
// caller's own names**.

/** @param {string} [tag] */
function host(tag = 'div') {
  const el = document.createElement(tag);
  document.body.append(el);
  return el;
}

describe('every descriptor shape rejects a key it does not know', () => {
  it.each([
    [
      'bsTable column',
      () => bsTable(host(), { columns: [{ key: 'a', sortible: true }] }),
      /unknown options\.columns\[0\] property 'sortible'/,
    ],
    [
      'bsTable controls.search',
      () => bsTable(host(), { columns: [{ key: 'a' }], controls: { search: { placeholdr: 'x' } } }),
      /unknown options\.controls\.search property 'placeholdr'/,
    ],
    [
      'bsTable controls.pageSize',
      () =>
        bsTable(host(), { columns: [{ key: 'a' }], controls: { pageSize: { allLabl: 'All' } } }),
      /unknown options\.controls\.pageSize property 'allLabl'/,
    ],
    [
      'bsTable controls.filterRow',
      () =>
        bsTable(host(), { columns: [{ key: 'a' }], controls: { filterRow: { inputClas: 'x' } } }),
      /unknown options\.controls\.filterRow property 'inputClas'/,
    ],
    [
      'bsListGroup item',
      () => bsListGroup([{ content: 'a', activ: true }]),
      /unknown items\[0\] property 'activ'/,
    ],
    [
      'bsListGroup item badge',
      () => bsListGroup([{ content: 'a', badge: { content: '1', pil: true } }]),
      /unknown items\[\]\.badge property 'pil'/,
    ],
    [
      'bsBreadcrumb item',
      () => bsBreadcrumb([{ content: 'Home', hraf: '/' }]),
      /unknown items\[0\] property 'hraf'/,
    ],
    [
      'bsCard image',
      () => bsCard({ image: { src: '/a.png', alt: '', positon: 'bottom' } }),
      /unknown options\.image property 'positon'/,
    ],
    [
      'bsAccordion item',
      () => bsAccordion(host(), { items: [{ header: 'h', body: 'b', opn: true }] }),
      /unknown items\[0\] property 'opn'/,
    ],
    [
      'bsTabs item',
      () => bsTabs(host(), { tabs: [{ label: 'l', pane: 'p', activ: true }] }),
      /unknown tabs\[0\] property 'activ'/,
    ],
    [
      'bsNavbar item',
      () => bsNavbar(host('nav'), { items: [{ label: 'l', hraf: '/' }] }),
      /unknown items\[0\] property 'hraf'/,
    ],
    [
      'bsNavbar submenu child',
      () =>
        bsNavbar(host('nav'), {
          items: [{ label: 'l', children: [{ label: 'c', activ: true }] }],
        }),
      /unknown items\[0\]\.children\[0\] property 'activ'/,
    ],
    [
      'bsCarousel item',
      () => bsCarousel(host(), { items: [{ content: 'c', captoin: 'x' }] }),
      /unknown items\[0\] property 'captoin'/,
    ],
    [
      'bsCarousel labels',
      () => bsCarousel(host(), { items: [{ content: 'c' }], labels: { nxt: 'Next' } }),
      /unknown options\.labels property 'nxt'/,
    ],
    [
      'bsPagination labels',
      () => bsPagination(host(), { onPageChange: () => {}, labels: { nxt: 'Next' } }),
      /unknown options\.labels property 'nxt'/,
    ],
    [
      'bsIcon set',
      () => bsIcon('star', { set: { tag: 'i', clasTemplate: 'bi bi-{name}' } }),
      /unknown options\.set property 'clasTemplate'/,
    ],
    [
      'tablePipeline column',
      () => tablePipeline({ columns: [{ key: 'a', searchible: true }] }),
      /unknown column property 'searchible'/,
    ],
    [
      'bindTableControls bindings',
      () => bindTableControls(tablePipeline({ source: [] }), { serch: '#s' }),
      /unknown binding 'serch'/,
    ],
    [
      'bindTableControls sortHeaders',
      () =>
        bindTableControls(tablePipeline({ source: [] }), {
          sortHeaders: { root: host(), selector: 'th', extra: 1 },
        }),
      /unknown sortHeaders binding 'extra'/,
    ],
    [
      'bindTableControls pagination',
      () => bindTableControls(tablePipeline({ source: [] }), { pagination: { prv: '#p' } }),
      /unknown pagination binding 'prv'/,
    ],
  ])('%s', (_label, call, message) => {
    expect(call).toThrow(TypeError);
    expect(call).toThrow(message);
  });
});

describe('every documented property is still accepted', () => {
  // The complement of the suite above, and the half that would catch an
  // over-tightened destructure: each shape is built with every property its
  // typedef documents, so a key dropped from a pattern fails here rather than
  // silently narrowing the public surface.
  it('bsTable column, with all F42 and render fields', () => {
    const el = bsTable(host(), {
      columns: [
        {
          key: 'a',
          label: 'A',
          format: (value) => String(value),
          align: 'end',
          headerClass: 'h',
          cellClass: 'c',
          sortable: true,
          html: false,
          sanitize: false,
          type: 'string',
          compare: () => 0,
          getValue: (row) => row.a,
          searchable: true,
          filterable: true,
        },
      ],
      data: [{ a: '1' }],
    });
    expect(el.element).toBeDefined();
  });

  it('bsTable controls sub-configs, fully specified', () => {
    const table = bsTable(host(), {
      columns: [{ key: 'a', sortable: true }],
      data: [{ a: '1' }],
      pageSize: 10,
      controls: {
        filterRow: { label: (c) => `Filter ${c.key}`, inputClass: 'i', class: 'f' },
        search: { label: 'S', placeholder: 'p', class: 's' },
        pageSize: { options: [10, 20], allLabel: 'All', label: 'Rows', class: 'ps' },
        pagination: { status: true, statusClass: 'st', siblingCount: 1, boundaryCount: 1 },
      },
    });
    expect(table.controls).toBeDefined();
  });

  it('bsListGroup item and its badge, fully specified', () => {
    const el = bsListGroup([
      {
        content: 'a',
        variant: 'primary',
        active: true,
        disabled: false,
        href: '/a',
        badge: { content: '1', variant: 'secondary', pill: false },
        value: { id: 1 },
      },
    ]);
    expect(el.element.textContent).toContain('a');
  });

  it('the remaining shapes, fully specified', () => {
    expect(bsBreadcrumb([{ content: 'Home', href: '/', current: false }])).toBeDefined();
    expect(
      bsCard({ image: { src: '/a.png', alt: 'a', position: 'bottom', class: 'i' } }),
    ).toBeDefined();
    expect(bsAccordion(host(), { items: [{ header: 'h', body: 'b', open: true }] })).toBeDefined();
    expect(
      bsTabs(host(), { tabs: [{ label: 'l', pane: 'p', active: true, disabled: false }] }),
    ).toBeDefined();
    expect(
      bsNavbar(host('nav'), {
        items: [
          {
            label: 'l',
            href: '/',
            active: true,
            disabled: false,
            children: [{ label: 'c', href: '/c', active: false, disabled: false }],
          },
        ],
      }),
    ).toBeDefined();
    expect(
      bsCarousel(host(), {
        items: [{ content: 'c', alt: undefined, caption: 'cap', active: true }],
        labels: { previous: 'P', next: 'N', slide: (i) => String(i) },
      }),
    ).toBeDefined();
    expect(
      bsIcon('star', {
        set: { tag: 'span', classTemplate: 'bi bi-{name}', ligature: false, render: undefined },
      }),
    ).toBeDefined();
  });

  it('bsPagination labels, fully specified', () => {
    const pager = bsPagination(host(), {
      onPageChange: () => {},
      labels: {
        nav: 'N',
        previous: 'P',
        next: 'Nx',
        previousText: '<',
        nextText: '>',
        ellipsis: '…',
        page: (n) => `Page ${n}`,
      },
    });
    expect(pager.element).toBeDefined();
  });

  it('tablePipeline column, fully specified', () => {
    const pipeline = tablePipeline({
      source: [{ a: 1 }],
      columns: [
        {
          key: 'a',
          type: 'number',
          compare: () => 0,
          getValue: (row) => row.a,
          searchable: true,
          filterable: true,
        },
      ],
    });
    expect(pipeline.view().rows).toHaveLength(1);
  });
});

describe('what the rule deliberately does not reach', () => {
  it('row DATA is never key-checked — a record carries keys we do not model', () => {
    // The sharp line: descriptors are configuration a developer wrote, rows are
    // records that arrive from elsewhere. Checking row keys would be both a
    // per-row cost and simply wrong.
    const table = bsTable(host(), {
      columns: [{ key: 'a' }],
      data: [{ a: '1', unmodelled: 'kept', anything: { nested: true } }],
    });
    expect(() => table.setData([{ a: '2', somethingElse: 9 }])).not.toThrow();
  });

  it('a filters map keyed by the caller’s own column keys is untouched', () => {
    const pipeline = tablePipeline({ source: [], columns: [{ key: 'whatever' }] });
    const input = host('input');
    expect(() => bindTableControls(pipeline, { filters: { whatever: input } })).not.toThrow();
  });

  it('the library’s own frozen icon sets pass the set check by construction', async () => {
    const { bootstrapIconsSet, materialIconsSet } =
      await import('../../../../../main/javascript/it/d4np/utils/bootstrap.js');
    expect(bsIcon('star', { set: bootstrapIconsSet })).toBeDefined();
    expect(bsIcon('star', { set: materialIconsSet })).toBeDefined();
  });
});
