// Node-safety tests (roadmap 14.1, spec 04 NFR-18/NFR-20, ADR-0037) for the
// /bootstrap entry. **No jsdom pragma on purpose**: this file runs in plain Node
// with no DOM at all, which is the only way to prove either half of the claim.
//
// Both directions matter. Importing the entry must always succeed — a server
// render that merely *loads* a module bundle must not crash — while a builder
// that needs the ambient document must fail with the typed contract error naming
// what is missing, never a bare ReferenceError. And per NFR-18, none of this
// touches the optional `bootstrap` peer: the builders are pure DOM construction,
// so with no peer installed and no global loaded they still work, given a
// document.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import * as bootstrap from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

/**
 * A DOM built on demand rather than installed globally — exactly the
 * server-render shape the `document` option exists for (spec 04 F52).
 *
 * @returns {Document}
 */
function isolatedDocument() {
  return new JSDOM('<!doctype html><html><body></body></html>').window.document;
}

/** Every builder, called the cheapest legal way, with no document supplied. */
const AMBIENT_DOCUMENT_CALLS = /** @type {const} */ ([
  ['bsIcon', () => bootstrap.bsIcon('gear')],
  ['bsBadge', () => bootstrap.bsBadge('New')],
  ['bsButton', () => bootstrap.bsButton({ label: 'Save' })],
  ['bsCloseButton', () => bootstrap.bsCloseButton()],
  ['bsSpinner', () => bootstrap.bsSpinner()],
  ['bsProgress', () => bootstrap.bsProgress()],
  ['bsPlaceholder', () => bootstrap.bsPlaceholder()],
  ['bsCard', () => bootstrap.bsCard({ title: 'T' })],
  ['bsListGroup', () => bootstrap.bsListGroup(['A'])],
  ['bsBreadcrumb', () => bootstrap.bsBreadcrumb(['A'])],
]);

describe('NFR-20 — the entry imports safely with no DOM', () => {
  it('has no ambient document to begin with', () => {
    // The premise of every assertion below; stated so a future jsdom default
    // cannot make this file pass vacuously.
    expect(globalThis.document).toBeUndefined();
  });

  it('exposes the whole surface built so far', () => {
    expect(Object.keys(bootstrap).sort()).toEqual([
      'bootstrapIconsSet',
      'bsAccordion',
      'bsAlert',
      'bsBadge',
      'bsBreadcrumb',
      'bsButton',
      'bsButtonGroup',
      'bsCard',
      'bsCarousel',
      'bsCloseButton',
      'bsCollapse',
      'bsDropdown',
      'bsIcon',
      'bsListGroup',
      'bsLoadingOverlay',
      'bsModal',
      'bsNavbar',
      'bsOffcanvas',
      'bsPagination',
      'bsPlaceholder',
      'bsPopover',
      'bsProgress',
      'bsScrollspy',
      'bsSpinner',
      'bsTable',
      'bsTabs',
      'bsToast',
      'bsTooltip',
      'materialIconsSet',
    ]);
  });

  it('evaluates the data presets without a DOM', () => {
    // Pure data must not need a document, and freezing proves nothing was
    // deferred to a lazy getter that would.
    expect(bootstrap.bootstrapIconsSet.classTemplate).toBe('bi bi-{name}');
    expect(bootstrap.materialIconsSet.ligature).toBe(true);
  });
});

describe('NFR-20 — a builder needing the ambient document fails typed', () => {
  it.each(AMBIENT_DOCUMENT_CALLS)('%s throws DomContractError, not ReferenceError', (name, act) => {
    // Matched on the stable code, never instanceof: the error may cross a realm
    // boundary (ADR-0003).
    expect(act).toThrow(
      expect.objectContaining({ code: 'EGL_DOM_CONTRACT', name: 'DomContractError' }),
    );
    // The message must name the entry and the way out, or a server-render stack
    // trace tells the reader nothing actionable.
    expect(act).toThrow(new RegExp(`${name} requires a DOM`));
    expect(act).toThrow(/egl-utils-js\/dom entry is browser-only/);
  });

  it('validates arguments before reaching for a document', () => {
    // Order matters: a programmer error must not be masked by the environment
    // error, or a typo in Node reads as "you need a browser".
    expect(() => bootstrap.bsIcon('two words')).toThrow(TypeError);
    expect(() => bootstrap.bsButton({ icon: 'gear' })).toThrow(/needs an accessible name/);
    expect(() => bootstrap.bsButtonGroup([], { label: 'x' })).toThrow(/non-empty array/);
  });
});

describe('NFR-20 — an explicit document makes every builder work in Node', () => {
  it('builds every element into the supplied document, with no global one', () => {
    const doc = isolatedDocument();

    const badge = bootstrap.bsBadge('New', { document: doc });
    const button = bootstrap.bsButton({ label: 'Save', icon: 'check', document: doc });
    const group = bootstrap.bsButtonGroup([button], { label: 'Actions', document: doc });
    const close = bootstrap.bsCloseButton({ document: doc });
    const spinner = bootstrap.bsSpinner({ document: doc });
    const progress = bootstrap.bsProgress({ value: 50, document: doc });
    const placeholder = bootstrap.bsPlaceholder({ lines: 2, document: doc });
    // Interactive too, since roadmap 16.5: a listener-owning builder takes its
    // AbortController from the target's own realm, so jsdom's binding accepts
    // the signal (BUG-0003, ADR-0045). Before that this had to be the
    // non-interactive form, and the comment here said so.
    const list = bootstrap.bsListGroup(['A'], { document: doc, onSelect: () => {} });
    const crumbs = bootstrap.bsBreadcrumb(['Home', 'Here'], { document: doc });
    const card = bootstrap.bsCard({ title: 'T', listGroup: list.element, document: doc });

    for (const el of [
      badge,
      button,
      group,
      close,
      spinner,
      progress.element,
      placeholder,
      list.element,
      crumbs,
      card,
    ]) {
      expect(el.ownerDocument).toBe(doc);
    }
    expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toBe('Here');
    expect(card.querySelector('.list-group')).toBe(list.element);
    expect(globalThis.document).toBeUndefined();

    // Not merely constructed — correct, in a realm that never had a global.
    expect(badge.outerHTML).toBe('<span class="badge text-bg-secondary">New</span>');
    expect(progress.element.getAttribute('aria-valuenow')).toBe('50');
    expect(button.querySelector('span')?.textContent).toBe('Save');
  });

  it('renders a whole table server-side, pipeline and all', () => {
    // The SSR claim spec 03 §4 makes for the pipeline, followed through to the
    // Bootstrap layer: derivation is pure, the container supplies the realm, and
    // a table with no row handler attaches no listeners — so the first page can
    // be rendered where there is no browser at all.
    const doc = isolatedDocument();
    const container = doc.createElement('div');
    const table = bootstrap.bsTable(container, {
      columns: [
        { key: 'host', label: 'Host', sortable: true },
        { key: 'ip', label: 'Address' },
      ],
      data: [
        { host: 'gw-01', ip: '192.168.1.1' },
        { host: 'srv-01', ip: '10.0.0.7' },
      ],
      pageSize: 1,
      caption: 'Hosts',
    });

    expect(globalThis.document).toBeUndefined();
    expect(table.element.ownerDocument).toBe(doc);
    expect(table.pipeline.view().pageCount).toBe(2);
    // Page one only, derived before any browser saw it.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('tbody td')?.textContent).toBe('gw-01');
    expect(container.querySelector('caption')?.textContent).toBe('Hosts');
    expect(container.querySelector('th[data-sort-key]')?.getAttribute('data-sort-key')).toBe(
      'host',
    );

    // And it is live server-side too: a command re-derives and re-renders.
    table.pipeline.setPage(2);
    expect(container.querySelector('tbody td')?.textContent).toBe('srv-01');
  });

  it('renders sanitized markup server-side too', () => {
    const doc = isolatedDocument();
    const badge = bootstrap.bsBadge('<b>ok</b>', {
      document: doc,
      html: true,
      sanitize: (html) => html,
    });
    expect(badge.querySelector('b')?.textContent).toBe('ok');
  });
});

describe('NFR-18 — the builders never touch the optional peer', () => {
  it('works with no `bootstrap` global loaded', () => {
    // Classes are strings, so this half of the toolkit has no peer contact at
    // all — asserted, not assumed.
    expect(/** @type {Record<string, unknown>} */ (globalThis).bootstrap).toBeUndefined();
    const doc = isolatedDocument();
    expect(() => bootstrap.bsSpinner({ document: doc })).not.toThrow();
  });

  it('runs every builder with no peer installed and no global', () => {
    // The clause says "importing the entry and running every builder succeeds"
    // (NFR-18). This file runs in plain Node against the real dependency tree,
    // so it is the only place that can prove it.
    //
    // The three exclusions this test carried until roadmap 16.5 are gone:
    // `bsAlert`, `bsPagination` and `bsListGroup({ onSelect })` are exercised
    // below like everything else, now that a listener-owning builder takes its
    // AbortController from the target's own realm (BUG-0003, ADR-0045).
    const doc = isolatedDocument();
    const host = doc.createElement('div');
    doc.body.append(host);

    expect(() => {
      bootstrap.bsIcon('check', { document: doc });
      bootstrap.bsBadge('New', { document: doc });
      bootstrap.bsButton({ label: 'Save', document: doc });
      bootstrap.bsButtonGroup([bootstrap.bsButton({ label: 'A', document: doc })], {
        label: 'Actions',
        document: doc,
      });
      bootstrap.bsCloseButton({ document: doc });
      bootstrap.bsSpinner({ document: doc });
      bootstrap.bsProgress({ value: 40, label: 'Upload', document: doc });
      bootstrap.bsPlaceholder({ lines: 2, document: doc });
      bootstrap.bsCard({ title: 'Card', document: doc });
      bootstrap.bsListGroup(['one', 'two'], { document: doc });
      bootstrap.bsBreadcrumb([{ content: 'Home', href: '/' }, { content: 'Here' }], {
        document: doc,
      });
      // The three that used to be excluded, each attaching a listener.
      bootstrap.bsListGroup(['one', 'two'], { document: doc, onSelect: () => {} });
      // `bsAlert` and `bsPagination` take no `document`: both work from the
      // container they are given — the alert through the F49 engine, the pager
      // through `container.ownerDocument` — which is exactly what makes them
      // foreign-realm safe. Passing one used to be dropped in silence; since
      // ADR-0047 an unknown key is a TypeError.
      bootstrap.bsAlert(host).show('info', 'hello');
      bootstrap.bsPagination(host, { onPage: () => {} }).update({ page: 1, pageCount: 3 });
    }).not.toThrow();
  });

  it('attaches a working listener in the foreign realm, not merely a silent one', () => {
    // The regression BUG-0003 left behind. Building without throwing is only
    // half the claim: the listener has to actually fire, or the fix would be a
    // controller nobody rejected and nobody used either.
    const doc = isolatedDocument();
    const host = doc.createElement('div');
    doc.body.append(host);
    /** @type {number[]} */
    const chosen = [];

    const group = bootstrap.bsListGroup(['one', 'two'], {
      document: doc,
      onSelect: (_item, index) => chosen.push(index),
    });
    host.append(group.element);

    const first = /** @type {Element} */ (group.element.querySelector('.list-group-item'));
    first.dispatchEvent(new /** @type {any} */ (doc.defaultView).Event('click', { bubbles: true }));
    expect(chosen).toEqual([0]);

    // And teardown still reaches it, which is the other half of what the
    // controller is for (NFR-15).
    group.destroy();
    first.dispatchEvent(new /** @type {any} */ (doc.defaultView).Event('click', { bubbles: true }));
    expect(chosen).toEqual([0]);
  });
});

describe('NFR-18 — a missing peer is typed, at the call (spec 04 F68)', () => {
  it('imports the behaviour wrappers without the peer present', async () => {
    // The load-time half of the clause. A static `import 'bootstrap'` would make
    // this line throw for everyone who only wanted a badge.
    const module = await import('../../../../../main/javascript/it/d4np/utils/bootstrap.js');
    expect(typeof module.bsModal).toBe('function');
    expect(typeof module.bsToast).toBe('function');
    expect(typeof module.bsLoadingOverlay).toBe('function');
  });

  it('constructs a wrapper without the peer, and fails on use with EGL_PEER_MISSING', () => {
    const doc = isolatedDocument();
    const target = doc.createElement('div');
    const modal = bootstrap.bsModal(target);

    let caught;
    try {
      modal.show();
    } catch (error) {
      caught = error;
    }

    // Never a ReferenceError: the code is what a caller branches on, and the
    // message is what they act on.
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ReferenceError);
    expect(/** @type {{ code?: string }} */ (caught).code).toBe('EGL_PEER_MISSING');
    expect(/** @type {{ peer?: string }} */ (caught).peer).toBe('bootstrap');
  });
});
