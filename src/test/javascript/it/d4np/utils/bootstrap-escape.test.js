// @vitest-environment jsdom
// Adversarial tests (roadmap 14.1, spec 04 NFR-19, ADR-0037) for the builder
// escape contract.
//
// NFR-19 is a promise about what the builders *cannot* do, so it is verified by
// attack rather than by reading the source: every documented sanitizer-bypass
// payload the roadmap 6.5 corpus already collects is pushed through every
// content-accepting option of every builder, and asserted inert. The corpus is
// reused deliberately — those payloads defeat naive string-concatenation
// rendering, which is precisely the shape this toolkit exists to replace.
import { describe, expect, it, vi } from 'vitest';
import { BYPASS_CORPUS } from '../../../../fixtures/sanitize-bypass-corpus.js';
import {
  bsBadge,
  bsBreadcrumb,
  bsButton,
  bsButtonGroup,
  bsCard,
  bsCloseButton,
  bsIcon,
  bsListGroup,
  bsProgress,
  bsSpinner,
  bsTable,
} from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

/** Tags that mean a payload was parsed as markup rather than shown as text. */
const LIVE_TAGS = 'script, img, iframe, style, svg, math, object, embed, link, base, form';

/**
 * Attributes a browser fetches or navigates. A `javascript:` scheme matters in
 * these and nowhere else — the same string sitting in an `aria-label` is a label
 * that happens to contain a colon, and asserting otherwise would be theatre.
 */
const URL_ATTRIBUTES = new Set([
  'action',
  'background',
  'data',
  'formaction',
  'href',
  'poster',
  'src',
  'srcset',
  'xlink:href',
]);

/**
 * Assert that nothing in `root` was created *from* the payload.
 *
 * Three independent checks, because any one alone can be satisfied by an escape
 * that is still wrong: no element the payload could have introduced, no
 * event-handler attribute anywhere, and no navigable `javascript:` URL.
 *
 * The fourth check is the interesting one: `outerHTML` is re-parsed and must
 * yield the same single element. That closes the serialize-then-reparse (mXSS)
 * class these payloads are drawn from — a value can be inert in the live DOM and
 * still come back to life once the subtree is stringified and re-inserted, which
 * is exactly what the corpus was assembled to catch.
 *
 * @param {Element} root
 * @returns {void}
 */
function assertInert(root) {
  expect(root.querySelector(LIVE_TAGS)).toBeNull();

  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of el.attributes) {
      expect(attribute.name.toLowerCase()).not.toMatch(/^on/);
      if (URL_ATTRIBUTES.has(attribute.name.toLowerCase())) {
        expect(attribute.value.toLowerCase()).not.toContain('javascript:');
      }
    }
  }

  const host = document.createElement('div');
  host.innerHTML = root.outerHTML;
  expect(host.children).toHaveLength(1);
  expect(host.querySelector(LIVE_TAGS)).toBeNull();
  expect(host.textContent).toBe(root.textContent);
}

describe('NFR-19 — payloads land as text, never as markup', () => {
  // A whitespace-free payload — the only shape that survives the class-token
  // check, so the one worth pushing at the class-name surfaces. Slashes stand in
  // for the spaces an attribute list normally needs, which is a real parser trick
  // rather than a contrivance: `<img/src=x/onerror=...>` is valid HTML.
  const TOKEN_PAYLOAD = '"><img/src=x/onerror=alert(1)>';

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsBadge renders %s inert',
    (_id, payload) => {
      const badge = bsBadge(payload);
      expect(badge.textContent).toBe(payload);
      expect(badge.children).toHaveLength(0);
      assertInert(badge);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsButton renders %s inert as its only content',
    (_id, payload) => {
      const button = bsButton({ label: payload });
      expect(button.textContent).toBe(payload);
      assertInert(button);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsButton renders %s inert beside an icon (the boxed-label path)',
    (_id, payload) => {
      // A second code path: with an icon the label goes into a span, so it needs
      // its own proof rather than inheriting the first one's.
      const button = bsButton({ label: payload, icon: 'plus' });
      expect(button.textContent).toBe(payload);
      assertInert(button);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsButton renders %s inert as a visually-hidden name',
    (_id, payload) => {
      const button = bsButton({ label: payload, labelHidden: true, icon: 'gear' });
      expect(button.querySelector('.visually-hidden')?.textContent).toBe(payload);
      assertInert(button);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsSpinner renders %s inert as its status text',
    (_id, payload) => {
      const spinner = bsSpinner({ label: payload });
      expect(spinner.querySelector('.visually-hidden')?.textContent).toBe(payload);
      assertInert(spinner);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsProgress renders %s inert when a format function returns it',
    (_id, payload) => {
      // The format function is caller code, but its *output* is data and is
      // written as data.
      const progress = bsProgress({ format: () => payload });
      expect(progress.element.firstElementChild?.textContent).toBe(payload);
      assertInert(progress.element);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'accessible names carry %s as an attribute value, not markup',
    (_id, payload) => {
      // setAttribute cannot introduce markup by construction; asserted anyway,
      // because the claim is about the whole surface and not only textContent.
      for (const el of [
        bsCloseButton({ label: payload }),
        bsIcon('gear', { label: payload }),
        bsButtonGroup([bsButton({ label: 'x' })], { label: payload }),
        bsButton({ icon: 'gear', ariaLabel: payload }),
      ]) {
        expect(el.getAttribute('aria-label')).toBe(payload);
        assertInert(el);
      }
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsCard renders %s inert in every content slot',
    (_id, payload) => {
      // A card is where record data lands at scale, so every slot is attacked,
      // not just the obvious one.
      const card = bsCard({
        header: payload,
        title: payload,
        subtitle: payload,
        text: payload,
        body: payload,
        footer: payload,
        actions: payload,
      });
      assertInert(card);
      expect(card.querySelector('.card-title')?.textContent).toBe(payload);
      expect(card.querySelector('.card-footer')?.textContent).toBe(`${payload}${payload}`);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsListGroup renders %s inert as item content and as a badge',
    (_id, payload) => {
      const list = bsListGroup([{ content: payload, badge: payload }]);
      assertInert(list.element);
      expect(list.element.textContent).toBe(`${payload}${payload}`);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsBreadcrumb renders %s inert in a link and in the current page',
    (_id, payload) => {
      const nav = bsBreadcrumb([{ content: payload, href: '/x' }, payload]);
      assertInert(nav);
      expect(nav.textContent).toBe(`${payload}${payload}`);
    },
  );

  it.each(BYPASS_CORPUS.map((entry) => [entry.id, entry.payload]))(
    'bsTable renders %s inert in a header, a cell, a format result and the empty slot',
    (_id, payload) => {
      // The table is where untrusted records land in the largest volume, and
      // through the most paths: a header label, a raw value, a format function's
      // output, the key stamped as an attribute, and the empty-state slot.
      const container = document.createElement('div');
      const table = bsTable(container, {
        columns: [
          { key: 'raw', label: payload },
          { key: 'shaped', format: (value) => `${String(value)}!` },
        ],
        data: [{ raw: payload, shaped: payload }],
        rowKey: 'raw',
        caption: payload,
      });

      assertInert(table.table);
      expect(table.table.querySelector('th')?.textContent).toBe(payload);
      expect(table.table.querySelector('caption')?.textContent).toBe(payload);
      const cells = [...table.table.querySelectorAll('td')];
      expect(cells[0].textContent).toBe(payload);
      expect(cells[1].textContent).toBe(`${payload}!`);
      // An attribute value cannot introduce markup, but the claim is about the
      // whole surface, so the round-trip check covers this one too.
      expect(table.table.querySelector('tr[data-key]')?.getAttribute('data-key')).toBe(payload);

      table.setData([]);
      const empty = bsTable(document.createElement('div'), {
        columns: [{ key: 'raw' }],
        data: [],
        empty: payload,
      });
      assertInert(empty.table);
      expect(empty.table.querySelector('td[colspan]')?.textContent).toBe(payload);
    },
  );

  it('an array slot escapes every member, not just the first', () => {
    const payload = BYPASS_CORPUS[0].payload;
    const card = bsCard({ text: ['safe', payload, 'also safe'] });
    assertInert(card);
    expect(card.querySelector('.card-text')?.textContent).toBe(`safe${payload}also safe`);
  });

  it('keeps a hostile icon name inside the class list, where it cannot execute', () => {
    const icon = bsIcon(TOKEN_PAYLOAD);
    expect(icon.children).toHaveLength(0);
    expect([...icon.classList]).toContain(`bi-${TOKEN_PAYLOAD}`);
    // A class token is data: the DOM never parses it, and serialization escapes
    // the quote that would otherwise break out of the attribute. The `>` is left
    // literal — legal inside a quoted value, and inert precisely because the
    // quote before it was escaped. assertInert proves the pair by re-parsing.
    expect(icon.outerHTML).toContain('bi-&quot;>');
    assertInert(icon);
  });

  it('rejects a hostile variant instead of emitting it', () => {
    // Most payloads contain whitespace, so the token check refuses them outright
    // — the earliest possible failure and the clearest message.
    expect(() => bsBadge('x', { variant: '" onload="alert(1)' })).toThrow(TypeError);
  });
});

describe('NFR-19 — markup requires the sanitize decision', () => {
  it('refuses { html: true } with no sanitizer', () => {
    expect(() => bsBadge('<b>hi</b>', { html: true })).toThrow(TypeError);
    expect(() => bsBadge('<b>hi</b>', { html: true })).toThrow(/sanitize is required/);
    // The message has to name the way out, or it just blocks the caller.
    expect(() => bsBadge('<b>hi</b>', { html: true })).toThrow(/There is no default/);
  });

  it('runs the caller’s sanitizer and renders what it returns', () => {
    const sanitize = vi.fn(() => '<b>safe</b>');
    const badge = bsBadge('<img src=x onerror=alert(1)>', { html: true, sanitize });

    expect(sanitize).toHaveBeenCalledWith('<img src=x onerror=alert(1)>');
    expect(badge.innerHTML).toBe('<b>safe</b>');
    assertInert(badge);
  });

  it('honours an explicit `false` as a trusted-content declaration', () => {
    // Signed, not silent: the literal false is a decision recorded at the call site.
    const badge = bsBadge('<b>trusted</b>', { html: true, sanitize: false });
    expect(badge.querySelector('b')?.textContent).toBe('trusted');
  });

  it('rejects a sanitizer that is neither a function nor false', () => {
    expect(() =>
      bsBadge('<b>x</b>', { html: true, sanitize: /** @type {never} */ ('yes') }),
    ).toThrow(/sanitize must be a function or false/);
  });

  it('rejects a sanitizer that does not return a string', () => {
    expect(() =>
      bsBadge('<b>x</b>', { html: true, sanitize: /** @type {never} */ (() => 42) }),
    ).toThrow(/sanitizer must return a string/);
  });

  it('applies the same contract to a button label', () => {
    const sanitize = vi.fn((/** @type {string} */ html) => html.replace(/<script>/g, ''));
    const button = bsButton({ label: '<em>Go</em>', html: true, sanitize, icon: 'play' });
    expect(sanitize).toHaveBeenCalled();
    expect(button.querySelector('em')?.textContent).toBe('Go');
  });
});
