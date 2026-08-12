// @vitest-environment jsdom
// Example tests (roadmap 11.3, spec 03 §2 items F46-F48, ADR-0030) for fragment
// injection, textarea auto-grow, and URL parameter merging.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autoGrow,
  injectFragment,
  withUrlParams,
} from '../../../../../main/javascript/it/d4np/utils/dom.js';
import { HttpError } from '../../../../../main/javascript/it/d4np/utils/errors.js';
import { withUrlParams as rootWithUrlParams } from '../../../../../main/javascript/it/d4np/utils/index.js';

/** A fetch double returning `body` with the given status. */
function fetchReturning(body, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
}

/** @type {HTMLElement} */
let host;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"><p id="existing">kept</p></div>';
  host = /** @type {HTMLElement} */ (document.getElementById('host'));
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('injectFragment — the sanitize decision', () => {
  // injectFragment is async, so an argument error arrives as a rejection — the
  // house convention for an async export (see `retry` in async.js).
  it('rejects with TypeError when sanitize is omitted, rather than trusting the source', async () => {
    // The whole point: no default. A sanitizing default would bind /dom to the
    // DOMPurify peer; a non-sanitizing one would make the dangerous path quiet.
    await expect(injectFragment(host, '/f.html', /** @type {never} */ ({}))).rejects.toThrow(
      /sanitize is required/,
    );
  });

  it('rejects with TypeError when options are omitted entirely', async () => {
    await expect(injectFragment(host, '/f.html')).rejects.toThrow(/sanitize is required/);
  });

  it.each([
    ['a string', 'sanitize'],
    ['true', true],
    ['null', null],
  ])('rejects with TypeError when sanitize is %s', async (_label, sanitize) => {
    await expect(
      injectFragment(host, '/f.html', /** @type {never} */ ({ sanitize })),
    ).rejects.toThrow(/must be a function or false/);
  });

  it('routes the fetched markup through the sanitizer', async () => {
    const sanitize = vi.fn(() => '<p>clean</p>');
    await injectFragment(host, '/f.html', {
      sanitize,
      fetch: fetchReturning('<img src=x onerror=alert(1)>'),
    });
    expect(sanitize).toHaveBeenCalledWith('<img src=x onerror=alert(1)>');
    expect(host.innerHTML).toBe('<p>clean</p>');
  });

  it('injects raw markup when the caller declares the source trusted', async () => {
    await injectFragment(host, '/f.html', {
      sanitize: false,
      fetch: fetchReturning('<p>trusted</p>'),
    });
    expect(host.innerHTML).toBe('<p>trusted</p>');
  });

  it('throws TypeError when the sanitizer returns a non-string', async () => {
    await expect(
      injectFragment(host, '/f.html', {
        sanitize: /** @type {never} */ (() => null),
        fetch: fetchReturning('<p>x</p>'),
      }),
    ).rejects.toThrow(/must return a string/);
  });
});

describe('injectFragment — placement', () => {
  it('replaces the target content by default', async () => {
    await injectFragment(host, '/f.html', {
      sanitize: false,
      fetch: fetchReturning('<p id="new">new</p>'),
    });
    expect(document.getElementById('existing')).toBeNull();
    expect(document.getElementById('new')).not.toBeNull();
  });

  it.each([
    ['beforeend', 'existing,new'],
    ['afterbegin', 'new,existing'],
  ])('inserts at %s, keeping existing nodes', async (position, expectedOrder) => {
    const existing = document.getElementById('existing');
    await injectFragment(host, '/f.html', {
      sanitize: false,
      position,
      fetch: fetchReturning('<p id="new">new</p>'),
    });
    // Same node object: insertAdjacentHTML does not re-parse what was there,
    // so listeners bound to it survive. `innerHTML +=` would replace it.
    expect(document.getElementById('existing')).toBe(existing);
    expect([...host.children].map((child) => child.id).join(',')).toBe(expectedOrder);
  });

  it('keeps a listener on an existing node alive across a beforeend insert', async () => {
    const handler = vi.fn();
    document.getElementById('existing').addEventListener('click', handler);
    await injectFragment(host, '/f.html', {
      sanitize: false,
      position: 'beforeend',
      fetch: fetchReturning('<p>more</p>'),
    });
    document.getElementById('existing').dispatchEvent(new MouseEvent('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects with TypeError for an unknown position', async () => {
    await expect(
      injectFragment(host, '/f.html', {
        sanitize: false,
        position: /** @type {never} */ ('afterend'),
      }),
    ).rejects.toThrow(/position must be one of/);
  });
});

describe('injectFragment — failures propagate', () => {
  it('rejects with HttpError carrying the status and body on a non-2xx', async () => {
    let thrown;
    try {
      await injectFragment(host, '/missing.html', {
        sanitize: false,
        fetch: fetchReturning('<h1>Not Found</h1>', 404),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown.code).toBe('EGL_HTTP');
    expect(thrown.status).toBe(404);
    // The error page is usually the only explanation available, and it is read.
    expect(thrown.body).toBe('<h1>Not Found</h1>');
    // Nothing was injected, so a caller can tell a partial render from a full one.
    expect(host.innerHTML).toContain('kept');
  });

  it('propagates a network failure untouched', async () => {
    const boom = new Error('network down');
    await expect(
      injectFragment(host, '/f.html', {
        sanitize: false,
        fetch: vi.fn(async () => {
          throw boom;
        }),
      }),
    ).rejects.toBe(boom);
  });

  it('passes the signal and headers through to fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = fetchReturning('<p>x</p>');
    await injectFragment(host, '/f.html', {
      sanitize: false,
      fetch: fetchImpl,
      signal: controller.signal,
      headers: { 'X-Test': '1' },
    });
    expect(fetchImpl).toHaveBeenCalledWith('/f.html', {
      signal: controller.signal,
      headers: { 'X-Test': '1' },
    });
  });

  it.each([
    ['the target is not an element', () => injectFragment(/** @type {never} */ ('#host'), '/f')],
    ['the url is empty', () => injectFragment(host, '')],
    [
      'fetch is not a function',
      () => injectFragment(host, '/f', { sanitize: false, fetch: /** @type {never} */ (1) }),
    ],
  ])('rejects with TypeError when %s', async (_label, call) => {
    await expect(call()).rejects.toThrow(TypeError);
  });
});

describe('autoGrow', () => {
  /** @type {HTMLTextAreaElement} */
  let area;

  beforeEach(() => {
    document.body.insertAdjacentHTML('beforeend', '<textarea id="area"></textarea>');
    area = /** @type {HTMLTextAreaElement} */ (document.getElementById('area'));
  });

  it('fits the initial content immediately, so a prefilled field starts right', () => {
    autoGrow(area, { measure: () => ({ contentHeight: 48, lineHeight: 16 }) });
    expect(area.style.height).toBe('48px');
  });

  it('re-measures on input', () => {
    let contentHeight = 32;
    autoGrow(area, { measure: () => ({ contentHeight, lineHeight: 16 }) });
    contentHeight = 80;
    area.dispatchEvent(new Event('input'));
    expect(area.style.height).toBe('80px');
  });

  it('releases the inline height before measuring, so it can shrink too', () => {
    // The classic bug: reading scrollHeight while a height is set measures that
    // height, so the field only ever grows.
    const seen = [];
    autoGrow(area, {
      measure: (el) => {
        seen.push(/** @type {HTMLElement} */ (el).style.height);
        return { contentHeight: 24, lineHeight: 16 };
      },
    });
    area.dispatchEvent(new Event('input'));
    expect(seen).toEqual(['auto', 'auto']);
  });

  it('caps at maxRows and switches to scrolling', () => {
    autoGrow(area, { maxRows: 3, measure: () => ({ contentHeight: 200, lineHeight: 20 }) });
    expect(area.style.height).toBe('60px');
    expect(area.style.overflowY).toBe('auto');
  });

  it('hides overflow while below the cap', () => {
    autoGrow(area, { maxRows: 10, measure: () => ({ contentHeight: 40, lineHeight: 20 }) });
    expect(area.style.overflowY).toBe('hidden');
  });

  it('restores the original inline styles on detach', () => {
    area.style.height = '11px';
    area.style.overflowY = 'scroll';
    const detach = autoGrow(area, { measure: () => ({ contentHeight: 90, lineHeight: 18 }) });
    expect(area.style.height).toBe('90px');
    detach();
    // Symmetric: attach/detach leaves no residue (the setVisible discipline).
    expect(area.style.height).toBe('11px');
    expect(area.style.overflowY).toBe('scroll');
  });

  it('stops resizing after detach, and detaching twice is a no-op', () => {
    const measure = vi.fn(() => ({ contentHeight: 30, lineHeight: 15 }));
    const detach = autoGrow(area, { measure });
    detach();
    expect(() => detach()).not.toThrow();
    area.dispatchEvent(new Event('input'));
    expect(measure).toHaveBeenCalledTimes(1); // the initial fit only
  });

  it('detaches when the caller signal aborts', () => {
    const controller = new AbortController();
    const measure = vi.fn(() => ({ contentHeight: 30, lineHeight: 15 }));
    autoGrow(area, { measure, signal: controller.signal });
    controller.abort();
    area.dispatchEvent(new Event('input'));
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('never attaches when the signal is already aborted', () => {
    const measure = vi.fn(() => ({ contentHeight: 30, lineHeight: 15 }));
    const detach = autoGrow(area, { measure, signal: AbortSignal.abort() });
    expect(measure).not.toHaveBeenCalled();
    expect(() => detach()).not.toThrow();
  });

  it('uses the real layout reader by default', () => {
    // jsdom reports every height as 0 and `line-height: normal`, so this asserts
    // the default path runs and stays finite rather than asserting a pixel value.
    expect(() => autoGrow(area)).not.toThrow();
    expect(area.style.height).toBe('0px');
  });

  it('uses the computed line-height for the cap when it is a pixel value', () => {
    // jsdom computes `line-height: normal` by default, so the parseable path
    // needs an explicit value — otherwise only the fallbacks are ever exercised.
    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue(
      /** @type {never} */ ({ lineHeight: '25px', fontSize: '10px' }),
    );
    Object.defineProperty(area, 'scrollHeight', { value: 500, configurable: true });
    autoGrow(area, { maxRows: 2 });
    expect(area.style.height).toBe('50px'); // 2 rows x 25px, not the font-size ratio
    expect(area.style.overflowY).toBe('auto');
  });

  it('disables the row cap rather than computing a nonsensical one', () => {
    // Both line-height and font-size unparseable: only reachable through a
    // partial or exotic getComputedStyle, which is exactly what the guard is
    // for. A NaN cap would make Math.min return NaN and set height: NaNpx.
    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue(
      /** @type {never} */ ({ lineHeight: 'normal', fontSize: 'normal' }),
    );
    autoGrow(area, { maxRows: 3 });
    expect(area.style.height).toBe('0px');
    expect(area.style.height).not.toContain('NaN');
  });

  it('falls back to a font-size ratio when line-height is not a pixel value', () => {
    // `normal` is not parseable; without the fallback maxRows would cap at NaN.
    area.style.fontSize = '10px';
    autoGrow(area, { maxRows: 2 });
    expect(area.style.height).toBe('0px');
    expect(area.style.overflowY).toBe('hidden');
  });

  it.each([
    ['the element is not an element', () => autoGrow(/** @type {never} */ ('#area'))],
    ['maxRows is zero', () => autoGrow(area, { maxRows: 0 })],
    ['maxRows is fractional', () => autoGrow(area, { maxRows: 1.5 })],
    ['measure is not a function', () => autoGrow(area, { measure: /** @type {never} */ (1) })],
    ['signal is not a signal', () => autoGrow(area, { signal: /** @type {never} */ ({}) })],
  ])('throws TypeError when %s', (_label, call) => {
    expect(call).toThrow(TypeError);
  });
});

describe('withUrlParams', () => {
  it('adds a query string to a URL that has none', () => {
    expect(withUrlParams('/api/items', { page: 2 })).toBe('/api/items?page=2');
  });

  it('never produces a second question mark', () => {
    // The bug this function exists to make impossible: `${url}?${params}` on a
    // URL that already has a query string, which lenient servers still accept.
    const result = withUrlParams('/api/items?page=1', { tag: 'x' });
    expect(result.match(/\?/g)).toHaveLength(1);
    expect(result).toBe('/api/items?page=1&tag=x');
  });

  it('replaces an existing key rather than repeating it', () => {
    expect(withUrlParams('/api/items?page=1&q=a', { page: 2 })).toBe('/api/items?page=2&q=a');
  });

  it('repeats the key for an array, replacing what was there', () => {
    expect(withUrlParams('/api?tag=old', { tag: ['x', 'y'] })).toBe('/api?tag=x&tag=y');
  });

  it('skips nullish values instead of deleting the key (the F17 contract)', () => {
    expect(withUrlParams('/api?page=1', { page: null, q: undefined, tag: 'x' })).toBe(
      '/api?page=1&tag=x',
    );
  });

  it('skips nullish entries inside an array', () => {
    expect(withUrlParams('/api', { tag: ['x', null, 'y', undefined] })).toBe('/api?tag=x&tag=y');
  });

  it('empties an array to no key at all', () => {
    expect(withUrlParams('/api?tag=old', { tag: [] })).toBe('/api');
  });

  it('preserves the fragment, and keeps it last', () => {
    expect(withUrlParams('/docs#section', { v: 'abc' })).toBe('/docs?v=abc#section');
    expect(withUrlParams('/docs?a=1#section', { b: '2' })).toBe('/docs?a=1&b=2#section');
  });

  it('handles an absolute URL', () => {
    expect(withUrlParams('https://example.test/a?b=1', { c: 2 })).toBe(
      'https://example.test/a?b=1&c=2',
    );
  });

  it('handles a relative URL, which the URL constructor would reject', () => {
    expect(withUrlParams('items?page=1', { page: 3 })).toBe('items?page=3');
  });

  it('encodes values', () => {
    expect(withUrlParams('/search', { q: 'a b&c' })).toBe('/search?q=a+b%26c');
  });

  it('stringifies non-string values', () => {
    expect(withUrlParams('/api', { n: 42, flag: true })).toBe('/api?n=42&flag=true');
  });

  it('returns the URL unchanged for an empty params object', () => {
    expect(withUrlParams('/api?a=1#f', {})).toBe('/api?a=1#f');
  });

  it('drops a trailing question mark that carried no parameters', () => {
    expect(withUrlParams('/api?', {})).toBe('/api');
  });

  it.each([
    ['url is not a string', () => withUrlParams(/** @type {never} */ (null), {})],
    ['params is null', () => withUrlParams('/a', /** @type {never} */ (null))],
    ['params is an array', () => withUrlParams('/a', /** @type {never} */ ([]))],
  ])('throws TypeError when %s', (_label, call) => {
    expect(call).toThrow(TypeError);
  });

  it('is re-exported, as the same function, from the root entry (roadmap 17.10, ADR-0052)', () => {
    expect(rootWithUrlParams).toBe(withUrlParams);
  });
});
