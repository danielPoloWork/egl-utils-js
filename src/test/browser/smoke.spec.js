import { test, expect } from '@playwright/test';
import { BYPASS_CORPUS } from '../fixtures/sanitize-bypass-corpus.js';

// Browser smoke suite (roadmap 6.4, spec §6) for the browser-leaning entries.
//
// These tests deliberately assert the things a fake DOM CANNOT establish:
//  - `localStorage`/`sessionStorage` really persist, and `isPersistent()` is
//    finally *true* (every Node test saw the in-memory fallback, so the
//    persistent branch of ADR-0010 had never run against a real store);
//  - `document.cookie` round-trips through the real accessor pair, with the
//    browser — not a fake — parsing the attribute string we emit;
//  - sanitized markup, once assigned to a live `innerHTML`, DOES NOT EXECUTE
//    in a real engine. That is the library's security promise (ADR-0012), and
//    it can only be proven where scripts actually run.

const FIXTURE = '/src/test/browser/fixture.html';

test.beforeEach(async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(FIXTURE);
  const ready = await page.evaluate(() => window.__eglReady);
  expect(ready.ok, `fixture failed to load the built bundles: ${ready.message ?? ''}`).toBe(true);
  expect(pageErrors, 'the fixture must load without page errors').toEqual([]);
});

test.describe('root entry', () => {
  test('loads from the built bundle and its pure helpers work', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { uuid, parseDuration, urlSearchParams, deepMerge, validateEmail } = window.egl.root;
      return {
        uuid: uuid(),
        duration: parseDuration('1h30m'),
        query: urlSearchParams({ a: 1, tag: ['x', 'y'], skip: null }),
        merged: deepMerge({ a: 1 }, { b: 2 }),
        email: validateEmail('user@example.com'),
      };
    });
    expect(result.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.duration).toBe(5_400_000);
    expect(result.query).toBe('a=1&tag=x&tag=y');
    expect(result.merged).toEqual({ a: 1, b: 2 });
    expect(result.email).toBe(true);
  });

  test('uuid uses real Web Crypto and yields distinct values', async ({ page }) => {
    const unique = await page.evaluate(() => {
      const { uuid } = window.egl.root;
      return new Set(Array.from({ length: 500 }, () => uuid())).size;
    });
    expect(unique).toBe(500);
  });

  test('hashString matches a known SHA-256 vector via subtle.digest', async ({ page }) => {
    const digest = await page.evaluate(() => window.egl.root.hashString('abc'));
    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

test.describe('storage wrappers — a real Web Storage, not the fallback', () => {
  test('isPersistent() is true and values survive a reload', async ({ page }) => {
    const persistent = await page.evaluate(() => {
      const { localStorageWrapper } = window.egl.storage;
      localStorageWrapper.clear();
      localStorageWrapper.set('profile', { name: 'ada', tags: ['x'] });
      return localStorageWrapper.isPersistent();
    });
    // The branch every Node test missed: a real store was resolved.
    expect(persistent).toBe(true);

    await page.reload();
    await page.evaluate(() => window.__eglReady);
    const afterReload = await page.evaluate(() =>
      window.egl.storage.localStorageWrapper.get('profile'),
    );
    expect(afterReload).toEqual({ name: 'ada', tags: ['x'] });
  });

  test('the value really lands in localStorage as JSON', async ({ page }) => {
    const raw = await page.evaluate(() => {
      window.egl.storage.localStorageWrapper.set('k', { a: 1 });
      return localStorage.getItem('k');
    });
    expect(raw).toBe('{"a":1}');
  });

  test('local and session stores are independent, and session is also persistent', async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const { localStorageWrapper, sessionStorageWrapper } = window.egl.storage;
      localStorageWrapper.clear();
      sessionStorageWrapper.clear();
      localStorageWrapper.set('shared', 'local');
      sessionStorageWrapper.set('shared', 'session');
      return {
        local: localStorageWrapper.get('shared'),
        session: sessionStorageWrapper.get('shared'),
        sessionPersistent: sessionStorageWrapper.isPersistent(),
      };
    });
    expect(result).toEqual({ local: 'local', session: 'session', sessionPersistent: true });
  });

  test('pageSessionId survives a reload but differs between tabs', async ({ page, context }) => {
    // The whole point of F39, and the one claim Node cannot check: the Node
    // suite only ever sees the in-memory fallback, where a "reload" is a fresh
    // realm and there are no tabs at all.
    const first = await page.evaluate(() => window.egl.storage.pageSessionId());
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    await page.reload();
    await page.evaluate(() => window.__eglReady);
    const afterReload = await page.evaluate(() => window.egl.storage.pageSessionId());
    expect(afterReload, 'the id must survive a reload').toBe(first);

    const otherTab = await context.newPage();
    await otherTab.goto(FIXTURE);
    await otherTab.evaluate(() => window.__eglReady);
    const otherId = await otherTab.evaluate(() => window.egl.storage.pageSessionId());
    expect(otherId, 'a second tab must get its own id').not.toBe(first);
    await otherTab.close();
  });

  test('pageSessionId really lands in sessionStorage, and dies with the tab', async ({ page }) => {
    const raw = await page.evaluate(() => {
      const id = window.egl.storage.pageSessionId();
      return { id, stored: sessionStorage.getItem('egl.pageSessionId') };
    });
    // Stored through the wrapper, so it is JSON — a quoted string.
    expect(raw.stored).toBe(JSON.stringify(raw.id));
    // localStorage is deliberately untouched: the scope is the tab, not the browser.
    const inLocal = await page.evaluate(() => localStorage.getItem('egl.pageSessionId'));
    expect(inLocal).toBeNull();
  });

  test('corrupt JSON written out-of-band surfaces as StorageError', async ({ page }) => {
    const code = await page.evaluate(() => {
      localStorage.setItem('bad', 'not json{');
      try {
        window.egl.storage.localStorageWrapper.get('bad');
        return 'no-throw';
      } catch (error) {
        return error.code;
      }
    });
    // Identity by stable code, never cross-realm instanceof (ADR-0003).
    expect(code).toBe('EGL_STORAGE');
  });

  test('has() distinguishes a stored null from an absent key', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { localStorageWrapper } = window.egl.storage;
      localStorageWrapper.clear();
      localStorageWrapper.set('explicitNull', null);
      return {
        storedNull: localStorageWrapper.get('explicitNull', 'dflt'),
        hasStored: localStorageWrapper.has('explicitNull'),
        hasMissing: localStorageWrapper.has('missing'),
      };
    });
    expect(result).toEqual({ storedNull: null, hasStored: true, hasMissing: false });
  });
});

test.describe('cookieHelper — the real document.cookie accessor', () => {
  test('isSupported() is true and set/get/remove round-trip', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { cookieHelper } = window.egl.storage;
      cookieHelper.set('theme', 'dark');
      const afterSet = cookieHelper.get('theme');
      cookieHelper.remove('theme');
      return {
        supported: cookieHelper.isSupported(),
        afterSet,
        afterRemove: cookieHelper.get('theme'),
      };
    });
    expect(result.supported).toBe(true);
    expect(result.afterSet).toBe('dark');
    expect(result.afterRemove).toBeUndefined();
  });

  test('a value containing cookie delimiters survives verbatim', async ({ page }) => {
    // The encoding contract (ADR-0011) against the browser's own parser: a
    // value carrying ';' and '=' must come back identical and must not have
    // become an attribute.
    const value = 'a=b; Domain=evil.example, c';
    const readBack = await page.evaluate((v) => {
      const { cookieHelper } = window.egl.storage;
      cookieHelper.set('payload', v);
      return cookieHelper.get('payload');
    }, value);
    expect(readBack).toBe(value);
  });

  test('the browser accepts the emitted attribute string (cookie is readable)', async ({
    page,
    context,
    browserName,
  }) => {
    await page.evaluate(() => {
      window.egl.storage.cookieHelper.set('scoped', 'v', { maxAge: 3600, sameSite: 'Lax' });
    });
    // Read through the browser's own cookie jar, not our helper: proof that
    // the attribute string we build is one the engine actually accepted and
    // parsed, rather than silently discarded.
    const cookies = await context.cookies();
    const scoped = cookies.find((cookie) => cookie.name === 'scoped');
    expect(scoped, 'the browser stored the cookie we emitted').toBeTruthy();
    expect(scoped?.value).toBe('v');
    expect(scoped?.path).toBe('/');
    expect(scoped?.expires).toBeGreaterThan(0); // Max-Age was honoured

    // WebKit's automation protocol reports `sameSite: 'None'` for every
    // cookie regardless of the attribute actually sent, so asserting it there
    // would test the protocol's reporting fidelity, not this library. The
    // emitted string is asserted exactly, byte for byte, in the Node suite
    // (cookie-helper.test.js); here it is checked on the engines that report
    // it faithfully.
    if (browserName !== 'webkit') {
      expect(scoped?.sameSite).toBe('Lax');
    }
  });

  test('getAll() reports every cookie the page can see', async ({ page }) => {
    const all = await page.evaluate(() => {
      const { cookieHelper } = window.egl.storage;
      cookieHelper.set('a', '1');
      cookieHelper.set('b', '2');
      return window.egl.storage.cookieHelper.getAll();
    });
    expect(all).toMatchObject({ a: '1', b: '2' });
  });

  test('an invalid cookie name throws in the browser too', async ({ page }) => {
    const thrown = await page.evaluate(() => {
      try {
        window.egl.storage.cookieHelper.set('bad;name', 'v');
        return 'no-throw';
      } catch (error) {
        return error.name;
      }
    });
    expect(thrown).toBe('TypeError');
  });
});

test.describe('/logging — the built bundle in a real engine', () => {
  // Spec 02 §6 asks for browser proof of two things a Node suite cannot give:
  // that the entry loads as a real ES module in every engine, and that the
  // DEFAULT sink reaches an actual `console` — every Node test injects a
  // capturing sink, so the console path had never run against a real one.

  test('loads and logs through the default console sink', async ({ page }) => {
    /** @type {{ type: string, text: string }[]} */
    const consoleLines = [];
    page.on('console', (message) =>
      consoleLines.push({ type: message.type(), text: message.text() }),
    );

    await page.evaluate(() => {
      const { logger } = window.egl.logging;
      const log = logger({ level: 'trace', name: 'checkout', id: 'a1b2c3d4' });
      log.trace('trace line');
      log.info('info line');
      log.warn('warn line');
      log.error('error line');
      log.debug('below nothing');
      log.child('db').info('child line');
    });

    const text = consoleLines.map((line) => line.text).join('\n');
    expect(text).toContain('INFO  a1b2c3d4 --- [            checkout] info line');
    // trace maps onto console.debug deliberately: console.trace prints a stack.
    expect(text).toContain('TRACE');
    expect(text).toContain('[         checkout.db] child line');
    // The engine's own severity routing, not ours: warn and error are separate
    // console channels, which is why the level -> method map exists at all.
    const types = consoleLines.filter((line) => /warn line|error line/.test(line.text));
    expect(types.map((line) => line.type).sort()).toEqual(['error', 'warning']);
  });

  test('a record renders as exactly one line, even when the message carries breaks', async ({
    page,
  }) => {
    // The log-injection guarantee, checked where a console really parses lines.
    const lines = await page.evaluate(() => {
      const { formatLogLine } = window.egl.logging;
      return [
        formatLogLine({
          ts: Date.now(),
          level: 'info',
          name: 'a\nb',
          id: 'c\r\nd',
          message: 'first\nINFO forged',
          args: [],
        }),
      ];
    });
    expect(lines[0]).not.toMatch(/[\r\n]/);
    expect(lines[0]).toContain('first INFO forged');
  });

  test('a throwing sink never escapes into page code', async ({ page }) => {
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    const outcome = await page.evaluate(() => {
      const { logger } = window.egl.logging;
      const log = logger({
        sink: () => {
          throw new Error('transport down');
        },
      });
      log.info('still returns');
      return 'returned normally';
    });

    expect(outcome).toBe('returned normally');
    expect(pageErrors, 'a failing sink must not surface as a page error').toEqual([]);
  });
});

test.describe('sanitizeHtml — non-execution in a real engine', () => {
  // The payloads below are assigned to a LIVE element's innerHTML after
  // sanitization. In a real browser that is the moment scripts would run, so a
  // surviving vector sets the flag and fails the test. jsdom cannot establish
  // this: it does not execute scripts or fire the relevant events.
  const PAYLOADS = [
    '<script>window.__xss = "inline-script"</script>',
    '<img src=x onerror="window.__xss = \'img-onerror\'">',
    '<svg onload="window.__xss = \'svg-onload\'"></svg>',
    '<svg><script>window.__xss = "svg-script"</script></svg>',
    '<iframe src="javascript:window.parent.__xss = \'iframe-js\'"></iframe>',
    '<body onload="window.__xss = \'body-onload\'">',
    '<div onmouseover="window.__xss = \'mouseover\'">hover</div>',
    '<input autofocus onfocus="window.__xss = \'autofocus\'">',
    '<video><source onerror="window.__xss = \'video\'"></video>',
    '<details open ontoggle="window.__xss = \'toggle\'"></details>',
    '<math><mtext><script>window.__xss = "mathml"</script></mtext></math>',
    '<object data="javascript:window.__xss = \'object\'"></object>',
    '<form><button formaction="javascript:window.__xss = \'formaction\'">go</button></form>',
    '<a href="javascript:window.__xss = \'href-js\'" id="link">click</a>',
    '<style>@import "data:text/css,body{}"</style>',
    '<img src="x" srcset="x" onerror="window.__xss = \'srcset\'">',
    '<template><img src=x onerror="window.__xss = \'template\'"></template>',
    '<noscript><img src=x onerror="window.__xss = \'noscript\'"></noscript>',
  ];

  // Insert `html` into a live element, provoke every vector class, and report
  // whether anything executed.
  //
  // `sanitize: false` inserts the payload RAW — that is how the control test
  // proves the detector actually detects. Both paths share this one function
  // so the control runs under identical timing: an earlier version polled the
  // flag synchronously, which would have let an ASYNCHRONOUS vector (an
  // `onerror` needing a failed network round-trip) pass for the wrong reason.
  // The 400 ms settle window is what the control demonstrated is required.
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} html
   * @param {{ sanitize: boolean }} options
   */
  async function insertAndProvoke(page, html, { sanitize }) {
    return page.evaluate(
      async ([payload, shouldSanitize]) => {
        delete window.__xss;
        // Clicking every element is how interaction-driven handlers get their
        // chance, but a legitimately-preserved <a href="https://..."> navigates
        // and destroys the execution context. Block navigation to another
        // document while deliberately still allowing `javascript:` hrefs
        // through — those ARE the vector this test hunts.
        document.addEventListener(
          'click',
          (event) => {
            const anchor = event.target && event.target.closest && event.target.closest('a[href]');
            const href = anchor ? anchor.getAttribute('href') || '' : '';
            if (!href.replace(/[\s]/g, '').toLowerCase().startsWith('javascript:')) {
              event.preventDefault();
            }
          },
          true,
        );

        const host = document.getElementById('host');
        // Zero configuration in a browser — the ADR-0012 claim.
        const inserted = shouldSanitize ? window.egl.sanitize.sanitizeHtml(payload) : payload;
        host.innerHTML = inserted;

        // Interaction-driven handlers get their chance...
        for (const element of host.querySelectorAll('*')) {
          for (const type of ['mouseover', 'focus', 'toggle', 'load', 'error']) {
            element.dispatchEvent(new Event(type, { bubbles: true }));
          }
          if (typeof element.click === 'function') element.click();
        }
        // ...and asynchronous ones (failed image loads, queued microtasks,
        // navigation-ish side effects) get real time to fire.
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { inserted, xss: window.__xss ?? null };
      },
      [html, sanitize],
    );
  }

  test('no sanitized payload executes when inserted into a live DOM', async ({ page }) => {
    test.setTimeout(60_000); // 18 payloads x a 400 ms settle window, x3 engines
    for (const payload of PAYLOADS) {
      const outcome = await insertAndProvoke(page, payload, { sanitize: true });
      expect(
        outcome.xss,
        `payload executed (${payload}) -> sanitized to: ${outcome.inserted}`,
      ).toBeNull();
    }
  });

  test('the detector is not vacuous — an UNsanitized payload does execute', async ({ page }) => {
    // Without this control, the test above could pass because the detector is
    // broken rather than because the sanitizer works. Same helper, same timing.
    const outcome = await insertAndProvoke(
      page,
      '<img src="missing-on-purpose.png" onerror="window.__xss = \'control\'">',
      { sanitize: false },
    );
    expect(outcome.xss, 'the raw payload must fire, or the suite proves nothing').toBe('control');
  });

  test('curated content survives and dangerous parts are stripped', async ({ page }) => {
    const clean = await page.evaluate(() =>
      window.egl.sanitize.sanitizeHtml(
        '<p class="lead">Hello <strong>world</strong></p>' +
          '<a href="https://ok.test" target="_blank" id="x">link</a>' +
          '<img src="https://ok.test/i.png" alt="a" onerror="alert(1)">' +
          '<script>alert(1)</script>',
      ),
    );
    expect(clean).toContain('<p class="lead">');
    expect(clean).toContain('<strong>world</strong>');
    expect(clean).toContain('href="https://ok.test"');
    expect(clean).toContain('alt="a"');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('target');
    expect(clean).not.toContain('id=');
  });

  test('sanitizing is idempotent in a real engine (no mXSS on re-parse)', async ({ page }) => {
    const stable = await page.evaluate(() => {
      const { sanitizeHtml } = window.egl.sanitize;
      return [
        '<p>a</p><script>alert(1)</script>',
        '<svg><p>t</p></svg>',
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">',
        '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
      ].every((input) => {
        const once = sanitizeHtml(input);
        return sanitizeHtml(once) === once;
      });
    });
    expect(stable).toBe(true);
  });

  test('the default profile is frozen in the shipped bundle', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { defaultSanitizeProfile } = window.egl.sanitize;
      let threw = false;
      try {
        defaultSanitizeProfile.tags.push('script');
      } catch {
        threw = true;
      }
      return { threw, hasScript: defaultSanitizeProfile.tags.includes('script') };
    });
    expect(result.threw).toBe(true);
    expect(result.hasScript).toBe(false);
  });
});

test.describe('sanitize bypass corpus — real engines, where mXSS actually lives', () => {
  // Roadmap 6.5. The Node suite runs this same corpus under jsdom, but jsdom's
  // parser is parse5 — NOT Chrome's, Firefox's, or WebKit's. mXSS is a
  // serialize-then-reparse divergence, so it is a property OF a specific
  // parser: a corpus validated only under jsdom is weakest exactly where the
  // attack class lives. This block closes that gap.
  //
  // Detection overrides `window.alert`, which every execution-class payload in
  // the corpus calls. That keeps the payloads realistic — they are not
  // rewritten to poke a test flag — and attributes each call to its payload id.

  test('no corpus payload executes in this engine', async ({ page }) => {
    test.setTimeout(60_000);
    const outcome = await page.evaluate(async (corpus) => {
      /** @type {string[]} */
      const executed = [];
      /** @type {{ id: string, output: string }[]} */
      const outputs = [];
      window.alert = (value) => executed.push(`alert(${String(value)})`);

      // Clicking every element is how interaction-driven handlers get their
      // chance, but a legitimately-preserved <a href="https://..."> navigates
      // and destroys the execution context. Block navigation to another
      // document while deliberately still allowing `javascript:` hrefs
      // through — those ARE the vector this test hunts.
      document.addEventListener(
        'click',
        (event) => {
          const anchor = event.target && event.target.closest && event.target.closest('a[href]');
          const href = anchor ? anchor.getAttribute('href') || '' : '';
          if (!href.replace(/[\s]/g, '').toLowerCase().startsWith('javascript:')) {
            event.preventDefault();
          }
        },
        true,
      );

      const host = document.getElementById('host');
      for (const { id, payload } of corpus) {
        const output = window.egl.sanitize.sanitizeHtml(payload);
        outputs.push({ id, output });
        host.innerHTML = output;
        for (const element of host.querySelectorAll('*')) {
          for (const type of ['mouseover', 'focus', 'toggle', 'load', 'error']) {
            element.dispatchEvent(new Event(type, { bubbles: true }));
          }
          if (typeof element.click === 'function') element.click();
        }
      }
      // One settle window for the whole batch: asynchronous vectors (a failed
      // image load) need real time, but they do not need it per payload.
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { executed, outputs };
    }, BYPASS_CORPUS);

    expect(outcome.executed, 'a corpus payload executed after sanitization').toEqual([]);

    // Structural check per payload, in this engine's own parser.
    for (const { id, output } of outcome.outputs) {
      const inert = await page.evaluate((html) => {
        const probe = document.createElement('div');
        probe.innerHTML = html;
        const forbidden = [
          'script',
          'style',
          'iframe',
          'object',
          'embed',
          'form',
          'input',
          'button',
          'select',
          'textarea',
          'svg',
          'math',
          'base',
          'link',
          'meta',
          'template',
          'noscript',
        ].filter((name) => probe.querySelectorAll(name).length > 0);
        /** @type {string[]} */
        const badAttrs = [];
        for (const element of probe.querySelectorAll('*')) {
          for (const attr of element.attributes) {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on') || name === 'style' || name === 'id') badAttrs.push(name);
            const url = attr.value.replace(/[\s]/g, '').toLowerCase();
            if (url.startsWith('javascript:') || url.startsWith('data:')) badAttrs.push(name);
          }
        }
        return { forbidden, badAttrs };
      }, output);
      expect(inert.forbidden, `${id}: forbidden elements survived`).toEqual([]);
      expect(inert.badAttrs, `${id}: dangerous attributes survived`).toEqual([]);
    }
  });

  test('the corpus detector is not vacuous — a RAW corpus payload does execute', async ({
    page,
  }) => {
    // Same override, same settle window, but the payload skips sanitization.
    // Without this, the test above could pass because `alert` was never
    // reachable rather than because the profile held.
    const executed = await page.evaluate(async () => {
      /** @type {string[]} */
      const calls = [];
      window.alert = (value) => calls.push(`alert(${String(value)})`);
      document.getElementById('host').innerHTML = '<img src=x onerror=alert(1)>';
      await new Promise((resolve) => setTimeout(resolve, 500));
      return calls;
    });
    expect(executed, 'the raw payload must execute, or the corpus test proves nothing').toEqual([
      'alert(1)',
    ]);
  });
});

test.describe('/table + /dom — controls driving a pipeline (roadmap 13.2, F51)', () => {
  // What a fake DOM cannot establish, and this can: real events from real user
  // input reach the debounced handlers, `aria-sort` lands on real elements as
  // the accessibility tree sees it, and one delegated listener really does
  // survive the caller replacing the rows underneath it.

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      const { tablePipeline } = window.egl.table;
      const { bindTableControls, delegate } = window.egl.dom;

      document.getElementById('host').innerHTML = `
        <input id="q" aria-label="Search" />
        <input id="f-status" aria-label="Status filter" />
        <table>
          <thead><tr>
            <th data-sort-key="name">Name</th>
            <th data-sort-key="score">Score</th>
          </tr></thead>
          <tbody id="rows"></tbody>
        </table>
        <button id="prev">Prev</button>
        <button id="next">Next</button>
        <span id="page"></span>
        <span id="opened"></span>
      `;

      const table = tablePipeline({
        source: [
          { name: 'Charlie', score: 30, status: 'active' },
          { name: 'ada', score: 10, status: 'archived' },
          { name: 'Dora', score: 20, status: 'active' },
          { name: 'Bob', score: 40, status: 'active' },
        ],
        pageSize: 2,
        columns: [
          { key: 'name', searchable: true },
          { key: 'score', type: 'number' },
          { key: 'status', searchable: true },
        ],
      });

      const body = document.getElementById('rows');
      // Row rendering stays the caller's — the binding wires controls only.
      table.on('change', (view) => {
        body.innerHTML = view.rows
          .map(
            (row) => `<tr data-name="${row.name}"><td>${row.name}</td><td>${row.score}</td></tr>`,
          )
          .join('');
      });
      // One delegated listener, attached once, across every re-render.
      delegate(body, 'click', 'tr[data-name]', (_event, row) => {
        document.getElementById('opened').textContent = row.dataset.name;
      });

      bindTableControls(
        table,
        {
          filters: { status: '#f-status' },
          search: '#q',
          sortHeaders: { root: 'thead', selector: 'th[data-sort-key]' },
          pagination: { prev: '#prev', next: '#next', status: '#page' },
        },
        { debounceMs: 50 },
      );

      body.innerHTML = table
        .view()
        .rows.map(
          (row) => `<tr data-name="${row.name}"><td>${row.name}</td><td>${row.score}</td></tr>`,
        )
        .join('');
    });
  });

  test('typing really filters, and search composes with a column filter', async ({ page }) => {
    await page.fill('#q', 'active');
    await expect(page.locator('#page')).toHaveText('1 / 2'); // 3 matches, 2 per page
    await expect(page.locator('#rows tr')).toHaveCount(2);

    // Search AND filter, not search THEN filter: 'active' and status 'archived'
    // have no row in common, and the empty result is the correct answer.
    await page.fill('#f-status', 'archived');
    await expect(page.locator('#rows tr')).toHaveCount(0);

    await page.fill('#q', '');
    await expect(page.locator('#rows tr')).toHaveCount(1);
    await expect(page.locator('#rows tr')).toHaveText(/ada/);
  });

  test('clicking a header cycles the sort and publishes aria-sort', async ({ page }) => {
    const name = page.locator('th[data-sort-key="name"]');
    await expect(name).toHaveAttribute('aria-sort', 'none');

    await name.click();
    await expect(name).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('#rows tr').first()).toHaveText(/ada/);

    await name.click();
    await expect(name).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('#rows tr').first()).toHaveText(/Dora/);

    await name.click();
    await expect(name).toHaveAttribute('aria-sort', 'none');
  });

  test('pagination controls disable at the ends, and filtering returns to page 1', async ({
    page,
  }) => {
    await expect(page.locator('#prev')).toBeDisabled();
    await expect(page.locator('#next')).toBeEnabled();

    await page.click('#next');
    await expect(page.locator('#page')).toHaveText('2 / 2');
    await expect(page.locator('#next')).toBeDisabled();

    await page.fill('#q', 'a');
    await expect(page.locator('#page')).toHaveText('1 / 2');
    await expect(page.locator('#prev')).toBeDisabled();
  });

  test('one delegated listener survives every re-render of the rows', async ({ page }) => {
    // Click a CELL, not the row (BUG-0001). A real user clicks a cell and the
    // event bubbles to the delegated listener on `#rows`, which is exactly what
    // this test is here to prove. Aiming at the `<tr>` instead made the test
    // depend on engine-specific hit-testing: WebKit resolves the row's centre
    // point to the ancestor `<table>`, which then "intercepts pointer events"
    // and Playwright refuses to click through it, while Chromium and Firefox
    // resolve it to the `<td>` and pass.
    await page.click('#rows tr:first-child td');
    await expect(page.locator('#opened')).toHaveText('Charlie');

    // Sort, which replaces every row node the listener could have been on.
    await page.click('th[data-sort-key="name"]');
    await page.click('#rows tr:first-child td');
    await expect(page.locator('#opened')).toHaveText('ada');
  });
});

test.describe('/dom — loadingOverlay focus restoration (roadmap 12.2, F50)', () => {
  // Owed by 12.2, which shipped with jsdom coverage only: focus save/blur/
  // restore is precisely what a fake DOM cannot prove, since jsdom's
  // activeElement does not follow real focus traversal.

  test('focus returns to the element that was active before the overlay showed', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const { loadingOverlay } = window.egl.dom;
      document.getElementById('host').innerHTML = `
        <button id="trigger">Load</button>
        <div id="overlay" hidden><button id="inside">Cancel</button></div>
      `;
      const overlay = document.getElementById('overlay');
      const gate = loadingOverlay({
        onShow: () => {
          overlay.hidden = false;
          document.getElementById('inside').focus();
        },
        onHide: () => {
          overlay.hidden = true;
        },
        minVisibleMs: 0,
        focus: { save: true },
      });

      const trigger = document.getElementById('trigger');
      trigger.focus();
      const before = document.activeElement.id;

      const release = gate.show();
      const during = document.activeElement.id;

      release();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { before, during, after: document.activeElement.id };
    });

    expect(result.before).toBe('trigger');
    expect(result.during, 'the overlay took focus in a real engine').toBe('inside');
    // The point of the whole dance: focus never lands on <body> and never stays
    // trapped inside a hidden subtree, which is the aria-hidden warning F50
    // exists to avoid.
    expect(result.after).toBe('trigger');
  });
});

test.describe('/bootstrap — builders in a real engine (roadmap 14.1, F52-F60)', () => {
  // jsdom proves the DOM shape perfectly well. What it cannot prove is the one
  // claim that depends on a *parser*: NFR-19 says a payload rendered by a builder
  // stays inert even after the subtree is serialised and re-parsed, and mXSS is
  // exactly the class where jsdom's parser and a browser's diverge. So the escape
  // promise gets a real-engine pass on the same corpus, in all three engines.

  test('the entry loads with no `bootstrap` peer and no import-map entry (NFR-18)', async ({
    page,
  }) => {
    const surface = await page.evaluate(() => ({
      exports: Object.keys(window.egl.bootstrap).sort(),
      peerAbsent: typeof window.bootstrap === 'undefined',
    }));

    // The builders are pure DOM construction; the peer belongs to M16's
    // behaviours. If this entry had acquired a bare specifier, the fixture's
    // import would have failed outright.
    expect(surface.peerAbsent).toBe(true);
    expect(surface.exports).toContain('bsBadge');
    expect(surface.exports).toContain('bsProgress');
  });

  test('renders Bootstrap markup and the documented ARIA surface', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { bsBadge, bsButton, bsSpinner, bsProgress } = window.egl.bootstrap;
      const host = document.getElementById('host');
      host.replaceChildren();

      host.append(
        bsBadge('99+', { variant: 'danger', pill: true }),
        bsButton({ icon: 'trash', label: 'Delete row', labelHidden: true }),
        bsSpinner({ label: 'Loading…' }),
      );
      const progress = bsProgress({ value: 25, label: 'Upload', format: (v) => `${v}%` });
      host.append(progress.element);
      progress.update(60);

      return {
        badge: host.querySelector('.badge').className,
        // A real accessibility tree needs the name to come from somewhere; here
        // it is a visually-hidden span inside an icon-only button.
        buttonName: host.querySelector('button .visually-hidden').textContent,
        spinnerRole: host.querySelector('.spinner-border').getAttribute('role'),
        valueNow: host.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
        barWidth: host.querySelector('.progress-bar').style.width,
        barText: host.querySelector('.progress-bar').textContent,
      };
    });

    expect(result.badge).toBe('badge text-bg-danger rounded-pill');
    expect(result.buttonName).toBe('Delete row');
    expect(result.spinnerRole).toBe('status');
    // update() moved all three together, in a real engine's CSSOM.
    expect(result.valueNow).toBe('60');
    expect(result.barWidth).toBe('60%');
    expect(result.barText).toBe('60%');
  });

  test('the composites assemble, and the two compositions delegate (roadmap 14.2)', async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const { bsCard, bsListGroup, bsBreadcrumb, bsAlert, bsPagination } = window.egl.bootstrap;
      const container = document.getElementById('host');
      container.replaceChildren();

      const list = bsListGroup([{ content: 'row', value: 1 }], { onSelect: () => {} });
      container.append(
        bsCard({ title: 'T', listGroup: list.element, actions: 'A' }),
        bsBreadcrumb([{ content: 'Home', href: '/' }, 'Here']),
      );

      const alertHost = document.createElement('div');
      container.append(alertHost);
      bsAlert(alertHost).show('danger', 'Boom');

      const pagerHost = document.createElement('div');
      container.append(pagerHost);
      let requested = 0;
      const pager = bsPagination(pagerHost, { onPage: (n) => (requested = n) });
      pager.update({ page: 2, pageCount: 5 });
      /** @type {HTMLElement} */ (
        [...pagerHost.querySelectorAll('.page-link')].find((el) => el.textContent === '3')
      ).click();

      const close = alertHost.querySelector('.btn-close');
      return {
        cardSlots: [...container.querySelector('.card').children].map(
          (el) => el.className.split(' ')[0],
        ),
        current: container.querySelector('[aria-current="page"]')?.textContent,
        alertClass: alertHost.querySelector('.alert')?.className,
        alertRole: alertHost.querySelector('.alert')?.getAttribute('role'),
        // The regression 14.2 found: an empty icon must not hide the control.
        closeVisible: close !== null && !close.hidden && close.offsetParent !== null,
        requested,
        activePage: pagerHost.querySelector('.page-item.active')?.textContent,
      };
    });

    expect(result.cardSlots).toEqual(['card-body', 'list-group', 'card-footer']);
    expect(result.current).toBe('Here');
    expect(result.alertClass).toBe('alert alert-dismissible fade show alert-danger');
    expect(result.alertRole).toBe('alert');
    // offsetParent is a real-layout check jsdom cannot make: the button is not
    // merely un-hidden, it actually occupies the page.
    expect(result.closeVisible).toBe(true);
    expect(result.requested).toBe(3);
    expect(result.activePage).toBe('2');
  });

  for (const { id, payload } of BYPASS_CORPUS) {
    test(`a builder keeps ${id} inert through a real parser`, async ({ page }) => {
      const result = await page.evaluate((untrusted) => {
        const { bsBadge } = window.egl.bootstrap;
        const host = document.getElementById('host');
        host.replaceChildren();

        const badge = bsBadge(untrusted);
        host.append(badge);

        // The mXSS step: serialise what the builder produced and re-parse it.
        // A value that is inert in the live DOM can still come back to life on
        // the second pass, which is the whole reason this corpus exists.
        const reparsed = document.createElement('div');
        reparsed.innerHTML = badge.outerHTML;

        const dangerous = 'script, img, iframe, style, svg, math, object, embed, link, base';
        return {
          text: badge.textContent,
          liveNodes: host.querySelectorAll(dangerous).length,
          reparsedNodes: reparsed.querySelectorAll(dangerous).length,
          reparsedChildren: reparsed.children.length,
        };
      }, payload);

      // Displayed verbatim, never parsed — on both passes.
      expect(result.text).toBe(payload);
      expect(result.liveNodes).toBe(0);
      expect(result.reparsedNodes).toBe(0);
      expect(result.reparsedChildren).toBe(1);
    });
  }
});
