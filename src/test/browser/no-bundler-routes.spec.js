import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// Spec 05 F86 (roadmap 18.5): the two routes the README documents, loaded on
// three engines exactly as it says to load them — deep ESM with no import map,
// and the global artifact through a classic `<script src>`.
//
// The scope split with the rest of the browser suite is deliberate:
//
//   - `smoke.spec.js` proves the library's BEHAVIOUR in real engines. It loads
//     the built entries once, in its own fixture, and then asks what they do.
//   - `no-bundler-sanitize.spec.js` (18.1) proves one entry's PEER CONTRACT on a
//     page where the peer was never present.
//   - this file proves the two documented LOAD PATHS themselves: that a page
//     which does what the README says ends up with a working library. It
//     therefore asserts breadth over depth — reachable, versioned, renders,
//     peer-backed call works, peer absence is typed — and leaves the deep
//     behavioural cases to the suites above.
//
// The fixtures point at the local static server rather than a CDN. CI cannot
// fetch a version that is not published yet, so what an F86 fixture can honestly
// prove is the URL *shape* — which is the correspondence spec 05 §6 asks F85's
// snippets to have, and is why the fixtures quote the README snippet they
// mirror in a comment.

const ESM_FIXTURE = '/src/test/browser/no-bundler-esm.html';
const GLOBAL_FIXTURE = '/src/test/browser/no-bundler-global.html';
const BOOTSTRAP_BUNDLE = '/node_modules/bootstrap/dist/js/bootstrap.bundle.min.js';

/** The version every route must report — the ADR-0018 lockstep, asserted per route. */
const { version: VERSION } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
);

/**
 * Collect the channels a load failure would surface on, so "the page worked" is
 * an assertion about the page and not only about one promise.
 *
 * @param {import('@playwright/test').Page} page
 */
function watch(page) {
  /** @type {string[]} */ const pageErrors = [];
  /** @type {string[]} */ const failedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(String(error.message)));
  page.on('requestfailed', (request) =>
    failedRequests.push(`${request.url()} — ${request.failure()?.errorText ?? 'failed'}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.url()} — ${response.status()}`);
  });
  return { pageErrors, failedRequests };
}

/**
 * Navigate to the deep-ESM fixture and wait for its dynamic imports to settle.
 *
 * The fixture records its outcome on a promise, so navigation alone does not
 * mean the modules are there — every test needs the await, not just the one
 * that inspects the result.
 *
 * @param {import('@playwright/test').Page} page
 */
async function loadEsmFixture(page) {
  await page.goto(ESM_FIXTURE);
  return page.evaluate(() => window.__eglEsm);
}

/**
 * Load Bootstrap's own bundle the way the README says a page does — a classic
 * script tag, no configuration — and wait for the global to exist.
 *
 * @param {import('@playwright/test').Page} page
 */
async function loadBootstrapPeer(page) {
  await page.addScriptTag({ url: BOOTSTRAP_BUNDLE });
  await page.waitForFunction(() => typeof window.bootstrap === 'object');
}

test.describe('the deep-ESM route', () => {
  test('every entry loads with no import map and no bundler', async ({ page }) => {
    const { pageErrors, failedRequests } = watch(page);
    const load = await loadEsmFixture(page);

    expect(load.ok, `the entries failed to load: ${load.message ?? ''}`).toBe(true);
    // The failure this route exists to not have. Named explicitly so a
    // regression reads plainly in CI rather than as a generic falsy assertion.
    expect(load.message ?? '').not.toMatch(/resolve module specifier/i);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(load.entries).toEqual(['root', 'text', 'table', 'bootstrap', 'ui', 'forms']);
  });

  test('VERSION matches package.json', async ({ page }) => {
    await loadEsmFixture(page);
    expect(await page.evaluate(() => window.__eglModules.root.VERSION)).toBe(VERSION);
  });

  test('a builder renders, and escapes as it does everywhere else', async ({ page }) => {
    await loadEsmFixture(page);
    const rendered = await page.evaluate(() => {
      const badge = window.__eglModules.bootstrap.bsBadge('<b>3</b> new', { variant: 'danger' });
      document.querySelector('#host').append(badge);
      return { html: badge.outerHTML, childElements: badge.children.length };
    });
    // Text in, text out: the markup is displayed, never parsed (ADR-0037).
    expect(rendered.childElements).toBe(0);
    expect(rendered.html).toContain('&lt;b&gt;3&lt;/b&gt; new');
    expect(rendered.html).toContain('text-bg-danger');
  });

  test('a pure entry works with no DOM and no peer at all', async ({ page }) => {
    await loadEsmFixture(page);
    const result = await page.evaluate(() => ({
      truncated: window.__eglModules.text.truncate('the quick brown fox', 9),
      page: window.__eglModules.table.paginate([1, 2, 3, 4, 5], { page: 2, pageSize: 2 }),
    }));
    expect(result.truncated).toBe('the quic…');
    expect(result.page.items).toEqual([3, 4]);
    expect(result.page.pageCount).toBe(3);
  });

  test('a peer-backed call works once Bootstrap is loaded from a script tag', async ({ page }) => {
    await loadEsmFixture(page);
    await loadBootstrapPeer(page);

    const adopted = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'modal fade';
      el.innerHTML = '<div class="modal-dialog"><div class="modal-content"></div></div>';
      document.body.append(el);
      // No injection: this is `window.bootstrap`, found at the call (ADR-0041).
      const modal = window.__eglModules.bootstrap.bsModal(el);
      const same = modal.instance() === window.bootstrap.Modal.getInstance(el);
      modal.destroy();
      el.remove();
      return same;
    });
    expect(adopted).toBe(true);
  });

  test('peer absence is a typed error at the call, not a load failure', async ({ page }) => {
    const { pageErrors } = watch(page);
    await loadEsmFixture(page);
    // Deliberately no Bootstrap on this page — the fixture never loads it.
    const outcome = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'modal';
      document.body.append(el);
      try {
        window.__eglModules.bootstrap.bsModal(el).show();
        return { threw: false };
      } catch (error) {
        return { threw: true, code: String(error?.code), peer: String(error?.peer) };
      } finally {
        el.remove();
      }
    });

    expect(outcome.threw).toBe(true);
    expect(outcome.code).toBe('EGL_PEER_MISSING');
    expect(outcome.peer).toBe('bootstrap');
    // The entry itself loaded fine — that is the half of F82/F68 this pins.
    expect(pageErrors).toEqual([]);
  });
});

test.describe('the global artifact route', () => {
  test('a classic script tag defines egl, and nothing else', async ({ page }) => {
    const { pageErrors, failedRequests } = watch(page);
    await page.goto(GLOBAL_FIXTURE);

    const added = await page.evaluate(() => {
      const { before, after } = window.__eglProbe;
      const seen = new Set(before);
      return after.filter((name) => !seen.has(name));
    });

    // F83's no-side-effects clause, measured rather than asserted.
    expect(added).toEqual(['egl']);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test('the namespace carries the root at the top level and each subpath below', async ({
    page,
  }) => {
    await page.goto(GLOBAL_FIXTURE);
    const shape = await page.evaluate(() => ({
      version: window.egl.VERSION,
      rootFn: typeof window.egl.retry,
      rootClass: typeof window.egl.EglError,
      subpaths: [
        'storage',
        'sanitize',
        'errors',
        'text',
        'net',
        'table',
        'logging',
        'dom',
        'bootstrap',
      ].filter((name) => typeof window.egl[name] === 'object'),
    }));

    expect(shape.version).toBe(VERSION);
    expect(shape.rootFn).toBe('function');
    expect(shape.rootClass).toBe('function');
    expect(shape.subpaths).toEqual([
      'storage',
      'sanitize',
      'errors',
      'text',
      'net',
      'table',
      'logging',
      'dom',
      'bootstrap',
    ]);
  });

  test('the README snippet runs verbatim', async ({ page }) => {
    await page.goto(GLOBAL_FIXTURE);
    // The literal body of the README's artifact example, minus the fetch.
    //
    // `egl` is referenced BARE here rather than as `window.egl`, and the two
    // disables below are the price of keeping it that way. The bare identifier
    // is the assertion: the README tells a classic-script reader to write
    // `egl.table.paginate(...)`, which only resolves because the artifact's
    // wrapper declares a page-scope `var`. Rewriting it to `window.egl` would
    // still pass if that ever became a module-scoped binding — testing
    // something the documentation does not say.
    const result = await page.evaluate(() => {
      const data = Array.from({ length: 57 }, (_, i) => i);
      // eslint-disable-next-line no-undef -- see above: bare on purpose
      const rows = egl.table.paginate(data, { page: 1, pageSize: 20 });
      // eslint-disable-next-line no-undef -- see above: bare on purpose
      document.body.append(egl.bootstrap.bsBadge(`${rows.total} results`));
      return { total: rows.total, badge: document.body.lastElementChild.textContent };
    });
    expect(result.total).toBe(57);
    expect(result.badge).toBe('57 results');
  });

  test('a peer-backed call works once Bootstrap is loaded from a script tag', async ({ page }) => {
    await page.goto(GLOBAL_FIXTURE);
    await loadBootstrapPeer(page);

    const adopted = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'modal fade';
      el.innerHTML = '<div class="modal-dialog"><div class="modal-content"></div></div>';
      document.body.append(el);
      const modal = window.egl.bootstrap.bsModal(el);
      const same = modal.instance() === window.bootstrap.Modal.getInstance(el);
      modal.destroy();
      el.remove();
      return same;
    });
    expect(adopted).toBe(true);
  });

  test('peer absence is a typed error at the call, not a load failure', async ({ page }) => {
    const { pageErrors } = watch(page);
    await page.goto(GLOBAL_FIXTURE);
    const outcome = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'modal';
      document.body.append(el);
      try {
        window.egl.bootstrap.bsModal(el).show();
        return { threw: false };
      } catch (error) {
        return { threw: true, code: String(error?.code), peer: String(error?.peer) };
      } finally {
        el.remove();
      }
    });

    expect(outcome.threw).toBe(true);
    expect(outcome.code).toBe('EGL_PEER_MISSING');
    expect(outcome.peer).toBe('bootstrap');
    expect(pageErrors).toEqual([]);
  });

  test('the sanitizer inside the artifact keeps the F82 contract', async ({ page }) => {
    // The artifact bundles no peer (ADR-0059), so `egl.sanitize` reaches
    // DOMPurify exactly as the ESM entry does — absent until the page loads it.
    await page.goto(GLOBAL_FIXTURE);

    const before = await page.evaluate(() => {
      try {
        return {
          threw: false,
          out: window.egl.sanitize.sanitizeHtml('<p>a</p><script>x</script>'),
        };
      } catch (error) {
        return { threw: true, code: String(error?.code), peer: String(error?.peer) };
      }
    });
    expect(before).toMatchObject({ threw: true, code: 'EGL_PEER_MISSING', peer: 'dompurify' });

    await page.addScriptTag({ url: '/node_modules/dompurify/dist/purify.min.js' });
    const after = await page.evaluate(() =>
      window.egl.sanitize.sanitizeHtml('<p>a</p><script>x</script>'),
    );
    expect(after).toBe('<p>a</p>');
  });
});
