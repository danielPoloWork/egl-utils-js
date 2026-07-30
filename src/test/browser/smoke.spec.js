import { test, expect } from '@playwright/test';

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
