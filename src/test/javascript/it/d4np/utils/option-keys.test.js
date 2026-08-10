// @vitest-environment jsdom
// Contract tests (roadmap 17.7, ADR-0047) for the unknown-option-key rule: every
// function that takes an options bag rejects a key it does not know.
//
// The suite is written as a sweep rather than as a handful of examples on
// purpose. The rule's value is that it holds *everywhere* — a caller who learns
// it from one function must be able to rely on it in the next — so the assertion
// is per public entry point, and a new options-taking export added without the
// check will fail here rather than pass unnoticed.
import { describe, expect, it, vi } from 'vitest';

import * as root from '../../../../../main/javascript/it/d4np/utils/index.js';
import * as text from '../../../../../main/javascript/it/d4np/utils/text.js';
import * as net from '../../../../../main/javascript/it/d4np/utils/net.js';
import * as table from '../../../../../main/javascript/it/d4np/utils/table.js';
import * as logging from '../../../../../main/javascript/it/d4np/utils/logging.js';
import * as storage from '../../../../../main/javascript/it/d4np/utils/storage.js';
import * as dom from '../../../../../main/javascript/it/d4np/utils/dom.js';
import * as bootstrap from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';
import { assertNoUnknownOptions } from '../../../../../main/javascript/it/d4np/utils/option-keys.js';

/** @returns {Element} */
function host() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

describe('assertNoUnknownOptions — the message', () => {
  it('names one key in the singular', () => {
    expect(() => assertNoUnknownOptions({ varient: 'danger' }, 'bsBadge')).toThrow(
      "bsBadge: unknown option 'varient'",
    );
  });

  it('names the first unknown key when there are several, not all of them', () => {
    // A deliberate limit, not an oversight (ADR-0047): this function is linked
    // into every entry, and listing every key costs every consumer bytes to
    // save a second run of a build that already failed. Fix, re-run, next key.
    expect(() => assertNoUnknownOptions({ varient: 1, pil: 2 }, 'bsBadge')).toThrow(
      "bsBadge: unknown option 'varient'",
    );
  });

  it('takes the noun from the caller, for a bag that is not options', () => {
    expect(() => assertNoUnknownOptions({ pathh: '/' }, 'cookieHelper.set', 'attribute')).toThrow(
      "cookieHelper.set: unknown attribute 'pathh'",
    );
  });

  it('passes an empty bag', () => {
    expect(() => assertNoUnknownOptions({}, 'anything')).not.toThrow();
  });

  it('is a plain TypeError — a programming error, not an EglError', () => {
    // The taxonomy is for operational failures (ADR-0003); a typo is neither
    // recoverable nor worth a code to branch on.
    let caught;
    try {
      assertNoUnknownOptions({ x: 1 }, 'api');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TypeError);
    expect(caught).not.toHaveProperty('code');
  });

  it('sees only own enumerable keys — the same set the rest element collects', () => {
    // The documented boundary: a key on the prototype is invisible to the check
    // *and* to the destructuring it complements, so the two cannot disagree.
    const inherited = Object.create({ varient: 'danger' });
    expect(() => assertNoUnknownOptions(inherited, 'bsBadge')).not.toThrow();
    expect(() => bootstrap.bsBadge('x', Object.create({ varient: 'danger' }))).not.toThrow();
  });
});

describe('a known key is still accepted when its value is undefined', () => {
  it('does not confuse "present and undefined" with "unknown"', () => {
    // Callers build option bags programmatically; `{ signal: undefined }` is the
    // normal shape of "no signal here" and must stay legal.
    expect(() => root.delay(0, { signal: undefined })).not.toThrow();
    expect(() => bootstrap.bsBadge('x', { variant: undefined })).not.toThrow();
    expect(() => text.truncate('abc', 2, { ellipsis: undefined })).not.toThrow();
  });
});

/**
 * Every options-taking entry point, called validly except for one bad key.
 *
 * @type {Array<[string, () => unknown]>}
 */
const CALLS = [
  // root
  ['delay', () => root.delay(0, { signl: undefined })],
  ['timeout', () => root.timeout(Promise.resolve(1), 10, { signl: undefined })],
  ['parallelLimit', () => root.parallelLimit([() => 1], 1, { setle: true })],
  ['asyncQueue', () => root.asyncQueue({ signl: undefined })],
  ['deepMerge', () => root.deepMerge({}, {}, { arrayMerges: 'concat' })],
  ['debounce', () => root.debounce(() => {}, 10, { leadingEdge: true })],
  // /text
  ['truncate', () => text.truncate('abc', 2, { elipsis: '…' })],
  ['wrapText', () => text.wrapText('abc', 2, { breakLongWord: true })],
  ['fixedWidth', () => text.fixedWidth('abc', 5, { aling: 'right' })],
  // /net
  ['ipv4ToKey', () => net.ipv4ToKey('10.0.0.1', { octet: 2 })],
  // /table
  ['compileFilter', () => table.compileFilter('a=1', { caseSensitiv: true })],
  ['comparator', () => table.comparator({ directon: 'desc' })],
  ['paginate', () => table.paginate([], { pageSize: 10, pageNumber: 1 })],
  ['tablePipeline', () => table.tablePipeline({ sources: [] })],
  // /logging
  ['formatTimestamp', () => logging.formatTimestamp(0, { fractionals: true })],
  ['logger', () => logging.logger({ levels: 'warn' })],
  // /storage
  ['pageSessionId', () => storage.pageSessionId({ keys: 'x' })],
  // /dom
  ['delegate', () => dom.delegate(host(), 'click', 'a', () => {}, { captures: true })],
  ['setVisible', () => dom.setVisible(host(), false, { hiddenClasses: 'd-none' })],
  ['autoGrow', () => dom.autoGrow(document.createElement('textarea'), { maxRow: 3 })],
  ['bindElements', () => dom.bindElements({ a: '#a' }, { strick: true })],
  ['inlineAlert', () => dom.inlineAlert(host(), { autoHide: 10 })],
  ['loadingOverlay', () => dom.loadingOverlay({ onShow() {}, onHide() {}, minVisible: 10 })],
  // /bootstrap — atoms
  ['bsIcon', () => bootstrap.bsIcon('gear', { labl: 'Settings' })],
  ['bsBadge', () => bootstrap.bsBadge('x', { varient: 'danger' })],
  ['bsButton', () => bootstrap.bsButton({ label: 'Save', varient: 'danger' })],
  ['bsButtonGroup', () => bootstrap.bsButtonGroup([host()], { ariaLabel: 'g', verticle: true })],
  ['bsCloseButton', () => bootstrap.bsCloseButton({ whitee: true })],
  ['bsSpinner', () => bootstrap.bsSpinner({ kindd: 'grow' })],
  ['bsProgress', () => bootstrap.bsProgress({ valu: 10 })],
  ['bsPlaceholder', () => bootstrap.bsPlaceholder({ line: 2 })],
  // /bootstrap — composites
  ['bsCard', () => bootstrap.bsCard({ title: 'T', titleTags: 'h4' })],
  ['bsListGroup', () => bootstrap.bsListGroup(['a'], { flushh: true })],
  ['bsBreadcrumb', () => bootstrap.bsBreadcrumb(['a'], { dividerr: "'>'" })],
  ['bsAlert', () => bootstrap.bsAlert(host(), { autoHide: 10 })],
  ['bsPagination', () => bootstrap.bsPagination(host(), { onPageChange: () => {}, sibling: 2 })],
  // /bootstrap — behaviour wrappers and managers
  ['bsToast', () => bootstrap.bsToast(host(), { autohide: false })],
  ['bsModal', () => bootstrap.bsModal(host(), { backdropp: 'static' })],
  ['bsLoadingOverlay', () => bootstrap.bsLoadingOverlay({ mesage: 'Loading' })],
  ['bsCollapse', () => bootstrap.bsCollapse(host(), { togglerr: host() })],
  ['bsAccordion', () => bootstrap.bsAccordion(host(), { alwaysOpened: true })],
  ['bsDropdown', () => bootstrap.bsDropdown(host(), { autoClos: 'inside' })],
  ['bsTabs', () => bootstrap.bsTabs(host(), { kindd: 'pills' })],
  ['bsNavbar', () => bootstrap.bsNavbar(host(), { brandHrefs: '/' })],
  ['bsOffcanvas', () => bootstrap.bsOffcanvas(host(), { scrol: true })],
  ['bsCarousel', () => bootstrap.bsCarousel(host(), { controlz: false })],
  ['bsScrollspy', () => bootstrap.bsScrollspy(host(), { navv: host() })],
  ['bsTooltip', () => bootstrap.bsTooltip(host(), { placment: 'top' })],
  ['bsPopover', () => bootstrap.bsPopover(host(), { placment: 'top' })],
  ['bsTable', () => bootstrap.bsTable(host(), { columns: [{ key: 'a' }], stripe: true })],
];

describe('every options-taking entry point rejects an unknown key', () => {
  it.each(CALLS)('%s', (name, act) => {
    // The message must name the offending key: "unknown option" alone would send
    // the reader back to the docs to diff their bag against the list.
    expect(act).toThrow(TypeError);
    expect(act).toThrow(/unknown option/);
  });

  it.each([
    ['retry', () => root.retry(() => 1, { retires: 2 })],
    ['injectFragment', () => dom.injectFragment(host(), '/x', { sanitize: false, positon: 'r' })],
  ])('%s rejects rather than throws, being async', async (name, act) => {
    // An async function turns the throw into a rejection; the contract is the
    // same, and asserting it this way keeps the distinction visible.
    await expect(act()).rejects.toThrow(/unknown option/);
  });

  it('createResource — after the client contract, which is checked first', () => {
    // Argument order shows in the errors: a malformed positional argument is
    // reported before the options bag is read at all.
    const client = { get() {}, post() {}, put() {}, patch() {}, delete() {} };
    expect(() => root.createResource(client, '/x', { ids: String })).toThrow(
      "createResource: unknown option 'ids'",
    );
    expect(() => root.createResource(/** @type {never} */ ({}), '/x', { ids: String })).toThrow(
      /client must expose/,
    );
  });

  it('the cookie attribute bags, which report an attribute rather than an option', () => {
    expect(() => storage.cookieHelper.set('a', 'b', { pathh: '/' })).toThrow(
      "cookieHelper.set: unknown attribute 'pathh'",
    );
    expect(() => storage.cookieHelper.remove('a', { pathh: '/' })).toThrow(
      "cookieHelper.remove: unknown attribute 'pathh'",
    );
    // `httpOnly` keeps its own, more useful message: it is a real cookie
    // attribute that simply cannot be set from a document, so "unknown" would
    // be a worse answer than the explanation.
    expect(() => storage.cookieHelper.set('a', 'b', { httpOnly: true })).toThrow(
      /HttpOnly cannot be set from client-side JavaScript/,
    );
  });

  it("covers bsToast's show options too, and names the operation", () => {
    // A nested bag reports the operation, not just the constructor, so the
    // reader knows which of the two bags to look at.
    const toasts = bootstrap.bsToast(host(), { bootstrap: {} });
    // `autohide` was the option's name until ADR-0048 merged Bootstrap's
    // `{autohide, delay}` pair into one `autoHideMs`; the old key is now exactly
    // the kind of thing this contract exists to name.
    expect(() => toasts.show('hi', { autohide: false })).toThrow(
      "bsToast.show: unknown option 'autohide'",
    );
  });

  it("covers inlineAlert's show options and loadingOverlay's focus bag", () => {
    const alerts = dom.inlineAlert(host());
    expect(() => alerts.show('info', 'hi', { autoHide: 10 })).toThrow(
      "inlineAlert.show: unknown option 'autoHide'",
    );
    expect(() => dom.loadingOverlay({ onShow() {}, onHide() {}, focus: { saved: true } })).toThrow(
      "loadingOverlay.focus: unknown option 'saved'",
    );
  });

  it('covers the per-request bag of an httpClient', async () => {
    const client = root.httpClient({ fetch: vi.fn() });
    await expect(client.get('/x', { timeoutMs: 10 })).rejects.toThrow(
      "httpClient.request: unknown option 'timeoutMs'",
    );
  });
});

describe('the deliberate escape hatches stay open', () => {
  it('accepts the vendor passthrough on a wrapper', () => {
    // `bootstrap` is how a caller reaches a Bootstrap option this library does
    // not model — the reason strictness closes only the accidental door.
    expect(() => bootstrap.bsModal(host(), { bootstrap: {}, backdrop: 'static' })).not.toThrow();
    expect(() => bootstrap.bsCollapse(host(), { bootstrap: {} })).not.toThrow();
  });

  it('accepts a custom operator registry and a class-slot map', () => {
    expect(() =>
      table.compileFilter('a=1', { operators: { '=': (a, b) => a === b } }),
    ).not.toThrow();
    expect(() => bootstrap.bsAlert(host(), { classes: { info: 'alert-primary' } })).not.toThrow();
  });

  it('accepts every documented key of a wide bag at once', () => {
    // The complement of the sweep above: strictness must not have narrowed a
    // real signature by accident.
    expect(() =>
      bootstrap.bsTable(host(), {
        columns: [{ key: 'a', label: 'A', sortable: true }],
        data: [{ a: 1 }],
        pageSize: 10,
        locale: 'en',
        rowKey: 'a',
        onRowClick: () => {},
        empty: 'none',
        caption: 'C',
        captionTop: true,
        striped: true,
        stripedColumns: true,
        hover: true,
        bordered: true,
        borderless: false,
        small: true,
        variant: 'dark',
        responsive: true,
        class: 'x',
        html: false,
        sanitize: false,
        signal: new AbortController().signal,
      }),
    ).not.toThrow();
  });
});
