import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// Spec 05 F82, proved (roadmap 18.1). ADR-0055 (roadmap 17.6) shipped the
// mechanism — the DOMPurify module is a value looked up, never imported — and
// left the three-engine proof here.
//
// What F82 asks for is one contract with three observable halves, and only the
// last of them is new:
//
//   1. the entry LOADS with no bundler and no import map;
//   2. with the peer reachable, `sanitizeHtml` works;
//   3. with the peer absent, the failure is `EGL_PEER_MISSING` naming
//      `dompurify` AT THE CALL — never a module-resolution failure at load, and
//      never a silent no-op.
//
// (3) is why this file exists rather than a few more cases in `smoke.spec.js`.
// That fixture supplies DOMPurify with a script tag in its <head>, so on that
// page the peer can never be absent; asserting the absent case there would mean
// deleting the global other suites depend on. `no-bundler-sanitize.html` is a
// page where the peer was never present — and peer absence is the
// security-relevant half, because the wrong answer to it is returning the
// caller's markup unsanitized.
//
// Every test here runs on all three engines (chromium, firefox, webkit) from
// the same static file server the rest of the browser suite uses. Nothing in
// this file is engine-specific; the point is precisely that nothing should be.

const FIXTURE = '/src/test/browser/no-bundler-sanitize.html';
const PURIFY_CLASSIC = '/node_modules/dompurify/dist/purify.min.js';
const PURIFY_MODULE = '/node_modules/dompurify/dist/purify.es.mjs';

/** A payload whose script half must never survive, and never come back raw. */
const PAYLOAD = '<p>ok</p><script>window.__eglPwned = true;</script>';
const SANITIZED = '<p>ok</p>';

/**
 * Collect the failure channels a load error would surface on, so "it loaded"
 * is an assertion about the page rather than about one promise.
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
 * Load the peer-free fixture and return its recorded load outcome.
 *
 * @param {import('@playwright/test').Page} page
 */
async function loadFixture(page) {
  await page.goto(FIXTURE);
  return page.evaluate(() => window.__eglSanitize);
}

/**
 * Call `sanitizeHtml` in the page and report the outcome as data — a throw is
 * an expected result here, not a test failure.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ html: string, injected?: boolean }} options
 */
async function callSanitize(page, { html, injected = false }) {
  return page.evaluate(
    ([markup, useInjected]) => {
      const { sanitizeHtml } = window.__eglSanitizeModule;
      try {
        const output = useInjected
          ? sanitizeHtml(markup, { dompurify: window.__eglInjectedPurify })
          : sanitizeHtml(markup);
        return { threw: false, output };
      } catch (error) {
        const err = /** @type {any} */ (error);
        return {
          threw: true,
          name: String(err?.name),
          code: String(err?.code),
          peer: String(err?.peer),
          message: String(err?.message ?? err),
        };
      }
    },
    [html, injected],
  );
}

test.describe('the built entry carries no bare specifier', () => {
  // The static half of F82, asserted against the artifact a consumer downloads
  // rather than against the source. A bare specifier reintroduced by a refactor
  // would break the no-bundler page at load, and the runtime tests below could
  // only report it as "the fixture went blank" — this one names the specifier.
  test('every import in dist/esm/sanitize.js is a relative or absolute path', () => {
    const built = readFileSync(
      fileURLToPath(new URL('../../../dist/esm/sanitize.js', import.meta.url)),
      'utf8',
    );
    const specifiers = [...built.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const bare = specifiers.filter((s) => !s.startsWith('.') && !s.startsWith('/'));
    expect(bare, `bare specifiers in the built /sanitize entry: ${bare.join(', ')}`).toEqual([]);
    // A dynamic `import('dompurify')` would resolve just as badly, and ADR-0055
    // rejects it for a second reason: it would make `sanitizeHtml` async.
    expect(built).not.toMatch(/\bimport\s*\(\s*["'][^./]/);
  });
});

test.describe('with no bundler, no import map and no peer', () => {
  test('the entry loads, and the failure channels stay silent', async ({ page }) => {
    const { pageErrors, failedRequests } = watch(page);
    const load = await loadFixture(page);

    expect(load.ok, `the entry failed to load: ${load.message ?? ''}`).toBe(true);
    // The exact failure F82 exists to remove, named so a regression reads
    // plainly in CI output instead of as a generic falsy assertion.
    expect(load.message ?? '').not.toMatch(/resolve module specifier/i);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    // The entry's public surface, pinned: a no-bundler page sees exactly these.
    // `safeUrl` joined in 23.1 (spec 09 F126) — a protocol allow-list is the same
    // job as an HTML one, and it needs no peer, which is why it can live on an
    // entry whose other export throws without DOMPurify (ADR-0084).
    expect(load.exports).toEqual(['defaultSanitizeProfile', 'safeUrl', 'sanitizeHtml']);
  });

  test('the profile is readable without the peer — only sanitizing needs it', async ({ page }) => {
    await loadFixture(page);
    const profile = await page.evaluate(() => ({
      frozen: Object.isFrozen(window.__eglSanitizeModule.defaultSanitizeProfile),
      hasTags: window.__eglSanitizeModule.defaultSanitizeProfile.tags.includes('p'),
      hasScript: window.__eglSanitizeModule.defaultSanitizeProfile.tags.includes('script'),
    }));
    expect(profile).toEqual({ frozen: true, hasTags: true, hasScript: false });
  });

  test('sanitizing throws EGL_PEER_MISSING naming dompurify, at the call', async ({ page }) => {
    const { pageErrors } = watch(page);
    await loadFixture(page);
    const outcome = await callSanitize(page, { html: PAYLOAD });

    expect(outcome.threw).toBe(true);
    expect(outcome.name).toBe('PeerMissingError');
    expect(outcome.code).toBe('EGL_PEER_MISSING');
    expect(outcome.peer).toBe('dompurify');
    // The message has to be actionable on a page with no build step: it names
    // the package and both remedies (ADR-0055).
    expect(outcome.message).toContain('dompurify');
    // The throw came from the call, not from the load — the module was already
    // there to be called.
    expect(pageErrors).toEqual([]);
  });

  test('absence is never a silent pass-through of the payload', async ({ page }) => {
    // The security-relevant assertion, stated separately from the typed-error
    // one because they can fail independently: a future refactor that returned
    // the input on a missing peer would still be "no load failure".
    await loadFixture(page);
    const outcome = await callSanitize(page, { html: PAYLOAD });

    expect(outcome.threw).toBe(true);
    expect(outcome).not.toHaveProperty('output');
    const pwned = await page.evaluate(() => window.__eglPwned === true);
    expect(pwned).toBe(false);
  });
});

test.describe('with the peer reachable', () => {
  test('an ambient DOMPurify loaded AFTER the module makes the same call work', async ({
    page,
  }) => {
    // The script-tag page, and the non-memoized-negative rule, in one test: the
    // first call fails on a page with no peer, a classic <script> lands, and the
    // very same module instance now sanitizes. A negatively memoized lookup
    // would fail the second call too.
    await loadFixture(page);
    const before = await callSanitize(page, { html: PAYLOAD });
    expect(before.code).toBe('EGL_PEER_MISSING');

    await page.addScriptTag({ url: PURIFY_CLASSIC });
    // The shape ADR-0055's detection exists for: what the UMD build leaves on
    // the global is callable AND already carries `.sanitize`, so "is it a
    // factory?" cannot be answered by `typeof` alone.
    expect(
      await page.evaluate(() => [typeof window.DOMPurify, typeof window.DOMPurify.sanitize]),
    ).toEqual(['function', 'function']);

    const after = await callSanitize(page, { html: PAYLOAD });
    expect(after.threw).toBe(false);
    expect(after.output).toBe(SANITIZED);
    expect(await page.evaluate(() => window.__eglPwned === true)).toBe(false);
  });

  test('an injected module works with no global defined at all', async ({ page }) => {
    // The other half of the ADR-0055 lookup order, and the case a bundler
    // consumer writes: the module value reaches `sanitizeHtml` as an option and
    // `window.DOMPurify` is never set. DOMPurify's own ESM build exports a bound
    // instance and touches no global, which is what makes this assertable.
    await loadFixture(page);
    await page.evaluate(async (url) => {
      const module = await import(url);
      window.__eglInjectedPurify = module.default;
    }, PURIFY_MODULE);

    expect(await page.evaluate(() => typeof window.DOMPurify)).toBe('undefined');

    const outcome = await callSanitize(page, { html: PAYLOAD, injected: true });
    expect(outcome.threw).toBe(false);
    expect(outcome.output).toBe(SANITIZED);
    // Ambient absence is unchanged by the injection: the option is per call.
    expect((await callSanitize(page, { html: PAYLOAD })).code).toBe('EGL_PEER_MISSING');
  });
});
