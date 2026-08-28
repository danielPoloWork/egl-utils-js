// Example tests (roadmap 19.2, spec 06 §2 item F92, §6) for the state ↔
// query-string pair: what the encoding looks like, what it preserves, and what
// it refuses to guess at. The round-trip law itself is in
// table-url.property.test.js, where it belongs.
import { describe, expect, it } from 'vitest';
import {
  tablePipeline,
  tableStateFromParams,
  tableStateToParams,
} from '../../../../../main/javascript/it/d4np/utils/table.js';

const DEFAULTS = { filters: {}, search: '', sort: [], page: 1, pageSize: null, hidden: [] };

describe('tableStateToParams', () => {
  it('omits every default, so a table at rest has a clean URL', () => {
    expect(tableStateToParams(DEFAULTS)).toBe('');
    expect(tableStateToParams({})).toBe('');
  });

  it('encodes the four scalars and the per-column filters', () => {
    const params = tableStateToParams({
      filters: { status: 'active', name: '^a' },
      search: 'ann',
      sort: [
        { key: 'score', direction: 'desc' },
        { key: 'name', direction: 'asc' },
      ],
      page: 3,
      pageSize: 25,
    });
    expect(params).toBe(
      'filter.name=%5Ea&filter.status=active&q=ann&sort=score%3Adesc&sort=name%3Aasc&page=3&size=25',
    );
  });

  it('is stable: filter order in the input cannot change the output', () => {
    const a = tableStateToParams({ filters: { b: '2', a: '1', c: '3' } });
    const b = tableStateToParams({ filters: { c: '3', a: '1', b: '2' } });
    expect(a).toBe(b);
    expect(a).toBe('filter.a=1&filter.b=2&filter.c=3');
  });

  it('preserves parameters it does not own, in their original order', () => {
    const params = tableStateToParams({ search: 'x' }, { base: '?tab=orders&ref=email&page=9' });
    // `page=9` was ours and is gone; the other two are untouched and still first.
    expect(params).toBe('tab=orders&ref=email&q=x');
  });

  it('accepts a base with or without its leading question mark', () => {
    expect(tableStateToParams({ page: 2 }, { base: '?a=1' })).toBe('a=1&page=2');
    expect(tableStateToParams({ page: 2 }, { base: 'a=1' })).toBe('a=1&page=2');
  });

  it('removes a stale filter parameter, because filter.* is our shape', () => {
    expect(tableStateToParams({}, { base: 'filter.gone=1&keep=2' })).toBe('keep=2');
  });

  it('leaves a prefixed name it would never write, even under its own prefix', () => {
    // `t.bogus` is not in the emitted set, so it is somebody else's parameter.
    expect(tableStateToParams({ page: 2 }, { prefix: 't', base: 't.bogus=1' })).toBe(
      't.bogus=1&t.page=2',
    );
  });

  it('namespaces everything under a prefix, so two tables can share one URL', () => {
    const orders = tableStateToParams(
      { search: 'a', filters: { status: 'new' }, page: 2 },
      { prefix: 'orders' },
    );
    const both = tableStateToParams({ page: 7 }, { prefix: 'invoices', base: orders });
    expect(both).toBe('orders.filter.status=new&orders.q=a&orders.page=2&invoices.page=7');
    expect(tableStateFromParams(both, { prefix: 'orders' })).toEqual({
      ...DEFAULTS,
      filters: { status: 'new' },
      search: 'a',
      page: 2,
    });
    expect(tableStateFromParams(both, { prefix: 'invoices' })).toEqual({
      ...DEFAULTS,
      page: 7,
    });
  });

  it('treats an empty filter as the absence of one — what setFilter(key, "") means', () => {
    expect(tableStateToParams({ filters: { name: '' } })).toBe('');
    expect(tableStateFromParams(tableStateToParams({ filters: { name: '' } }))).toEqual(DEFAULTS);
  });

  it('refuses a predicate filter, naming the column and the remedy', () => {
    expect(() => tableStateToParams({ filters: { score: (v) => v > 1 } })).toThrow(
      /filter 'score' is a function/,
    );
  });

  it('refuses a filter that is neither string nor function', () => {
    expect(() => tableStateToParams({ filters: { n: 42 } })).toThrow(/filter 'n' is a number/);
  });

  it('rejects malformed state fields as programming errors', () => {
    expect(() => tableStateToParams(null)).toThrow(/state must be an object/);
    expect(() => tableStateToParams({ filters: [] })).toThrow(/state.filters must be an object/);
    expect(() => tableStateToParams({ search: 1 })).toThrow(/state.search must be a string/);
    expect(() => tableStateToParams({ sort: 'name' })).toThrow(/state.sort must be an array/);
    expect(() => tableStateToParams({ sort: [null] })).toThrow(/sort\[0\] must be an object/);
    expect(() => tableStateToParams({ sort: [{ key: '', direction: 'asc' }] })).toThrow(
      /sort\[0\].key must be a non-empty string/,
    );
    expect(() => tableStateToParams({ sort: [{ key: 'a', direction: 'up' }] })).toThrow(
      /sort\[0\].direction must be 'asc' or 'desc'/,
    );
    expect(() => tableStateToParams({ page: 0 })).toThrow(/state.page must be an integer >= 1/);
    expect(() => tableStateToParams({ page: 1.5 })).toThrow(/state.page must be an integer >= 1/);
    expect(() => tableStateToParams({ pageSize: 0 })).toThrow(/state.pageSize must be an integer/);
  });

  it('treats an explicit null options as no options', () => {
    expect(tableStateToParams({ page: 2 }, /** @type {never} */ (null))).toBe('page=2');
  });

  it('rejects a malformed or unknown option', () => {
    expect(() => tableStateToParams({}, { prefix: 1 })).toThrow(/options.prefix must be a string/);
    expect(() => tableStateToParams({}, { base: 1 })).toThrow(/options.base must be a string/);
    expect(() => tableStateToParams({}, { prefixx: 'x' })).toThrow(/unknown option 'prefixx'/);
  });

  it('takes a pipeline view directly — extra properties are ignored, not rejected', () => {
    const table = tablePipeline({
      source: [{ name: 'ada' }, { name: 'ana' }, { name: 'bob' }],
      pageSize: 1,
    });
    table.setSearch('a');
    table.setPage(2);
    const view = table.view();
    // The view carries rows/total/totalFiltered/pageCount as well.
    expect(view.rows).toHaveLength(1);
    expect(tableStateToParams(view)).toBe('q=a&page=2&size=1');
  });

  it('serializes the page the view reports, which is the clamped one', () => {
    // The pipeline holds page 9 internally and derives page 1, because the filter
    // left one page. Serializing the *view* is therefore what keeps a shared URL
    // from pointing at a page that does not exist.
    const table = tablePipeline({ source: [{ name: 'ada' }], pageSize: 1 });
    table.setPage(9);
    expect(table.view().page).toBe(1);
    expect(tableStateToParams(table.view())).toBe('size=1');
  });
});

describe('the hidden columns (F128)', () => {
  it('writes one parameter per column, sorted and de-duplicated', () => {
    expect(tableStateToParams({ hidden: ['name', 'id', 'name'] })).toBe('hidden=id&hidden=name');
  });

  it('says nothing when nothing is hidden, so a full table has a clean URL', () => {
    expect(tableStateToParams({ hidden: [] })).toBe('');
  });

  it('round-trips through the parser as a set', () => {
    const params = tableStateToParams({ hidden: ['b', 'a'] });
    expect(tableStateFromParams(params).hidden).toEqual(['a', 'b']);
    expect(tableStateFromParams('hidden=a&hidden=a').hidden).toEqual(['a']);
  });

  it('takes the prefix every other parameter takes', () => {
    expect(tableStateToParams({ hidden: ['a'] }, { prefix: 't' })).toBe('t.hidden=a');
    expect(tableStateFromParams('t.hidden=a', { prefix: 't' }).hidden).toEqual(['a']);
    expect(tableStateFromParams('t.hidden=a').hidden).toEqual([]);
  });

  it('replaces the hidden set it owns in a base rather than appending to it', () => {
    expect(tableStateToParams({ hidden: ['b'] }, { base: '?hidden=a&tab=x' })).toBe(
      'tab=x&hidden=b',
    );
  });

  it('drops an empty name rather than hiding a column nobody named', () => {
    expect(tableStateFromParams('hidden=&hidden=a').hidden).toEqual(['a']);
  });

  it('refuses a state whose hidden set is not an array of keys', () => {
    expect(() => tableStateToParams({ hidden: 'a' })).toThrow(
      'tableStateToParams: state.hidden must be an array',
    );
    expect(() => tableStateToParams({ hidden: [1] })).toThrow(
      'tableStateToParams: state.hidden must hold non-empty column keys',
    );
  });
});

describe('tableStateFromParams', () => {
  it('returns a complete default state for an empty input', () => {
    expect(tableStateFromParams('')).toEqual(DEFAULTS);
    expect(tableStateFromParams('?')).toEqual(DEFAULTS);
  });

  it('reads the four scalars, the filters and repeated sort entries in order', () => {
    expect(
      tableStateFromParams(
        '?filter.status=active&q=ann&sort=score:desc&sort=name:asc&page=3&size=25',
      ),
    ).toEqual({
      filters: { status: 'active' },
      search: 'ann',
      sort: [
        { key: 'score', direction: 'desc' },
        { key: 'name', direction: 'asc' },
      ],
      page: 3,
      pageSize: 25,
      hidden: [],
    });
  });

  it('ignores parameters that are not ours', () => {
    expect(tableStateFromParams('tab=orders&ref=email')).toEqual(DEFAULTS);
  });

  it('degrades malformed numbers to their defaults rather than throwing', () => {
    for (const bad of ['abc', '', '0', '-3', '1.5', 'Infinity', 'NaN']) {
      expect(tableStateFromParams(`page=${encodeURIComponent(bad)}`).page).toBe(1);
      expect(tableStateFromParams(`size=${encodeURIComponent(bad)}`).pageSize).toBe(null);
    }
  });

  it('drops only the malformed sort entry, keeping the ones around it', () => {
    expect(tableStateFromParams('sort=a:asc&sort=b:sideways&sort=c:desc&sort=&sort=:asc')).toEqual({
      ...DEFAULTS,
      sort: [
        { key: 'a', direction: 'asc' },
        { key: 'c', direction: 'desc' },
      ],
    });
  });

  it('reads a bare sort key as ascending, which is what a human types', () => {
    expect(tableStateFromParams('sort=name').sort).toEqual([{ key: 'name', direction: 'asc' }]);
  });

  it('splits a sort entry at its last colon, so a key may contain one', () => {
    expect(tableStateFromParams('sort=a%3Ab%3Adesc').sort).toEqual([
      { key: 'a:b', direction: 'desc' },
    ]);
  });

  it('keeps duplicate sort keys, because a pipeline can hold them', () => {
    expect(tableStateFromParams('sort=a:asc&sort=a:desc').sort).toEqual([
      { key: 'a', direction: 'asc' },
      { key: 'a', direction: 'desc' },
    ]);
  });

  it('lets the last occurrence of a scalar win', () => {
    expect(tableStateFromParams('page=2&page=5').page).toBe(5);
    expect(tableStateFromParams('q=a&q=b').search).toBe('b');
    expect(tableStateFromParams('size=5&size=abc').pageSize).toBe(null);
  });

  it('skips an empty filter name or value', () => {
    expect(tableStateFromParams('filter.=x&filter.name=').filters).toEqual({});
  });

  it('reads a filter key that itself looks like one of our names', () => {
    expect(tableStateFromParams('filter.q=1&filter.filter.x=2').filters).toEqual({
      q: '1',
      'filter.x': '2',
    });
  });

  it('treats an explicit null options as no options', () => {
    expect(tableStateFromParams('page=2', /** @type {never} */ (null)).page).toBe(2);
  });

  it('rejects a wrong argument type — the one thing that is a programming error', () => {
    expect(() => tableStateFromParams(null)).toThrow(/input must be a string/);
    expect(() => tableStateFromParams('', { prefix: 1 })).toThrow(
      /options.prefix must be a string/,
    );
    expect(() => tableStateFromParams('', { nope: 1 })).toThrow(/unknown option 'nope'/);
  });
});

describe('the pair against a real pipeline', () => {
  it('restores a state a pipeline can apply, and derives the same rows', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, name: `n${i + 1}` }));
    const columns = [{ key: 'id' }, { key: 'name' }];
    const a = tablePipeline({ source: rows, columns, pageSize: 2 });
    a.setSort([{ key: 'id', direction: 'desc' }]);
    a.setPage(3);

    const params = tableStateToParams(a.view());
    const state = tableStateFromParams(params);

    const b = tablePipeline({ source: rows, columns });
    b.batch(() => {
      b.setSort(state.sort);
      b.setPageSize(state.pageSize);
      b.setPage(state.page);
    });

    expect(b.view().rows).toEqual(a.view().rows);
    expect(tableStateToParams(b.view())).toBe(params);
  });
});
