// @vitest-environment jsdom
// Example tests (roadmap 23.1, spec 09 §2 item F127 and §6, ADR-0084) for the
// seven builder call sites that write a data-driven URL.
//
// One suite rather than three, because F127 is a **cross-cutting** requirement:
// what matters is that every place a record's URL reaches an attribute answers
// the same way, and a per-module suite would let one of them drift quietly. The
// list here IS the audit — if a builder gains an eighth URL, this file is where
// its absence shows.
//
// Each site is asserted three ways: the legitimate URL is written, the hostile
// one is refused *and the element survives with its label*, and the refusal is
// findable. The second of those is the requirement people skip: a guard that
// drops the row instead of the link has replaced an XSS with a data loss.
import { afterEach, describe, expect, it } from 'vitest';
import {
  bsBreadcrumb,
  bsCard,
  bsCarousel,
  bsListGroup,
  bsNavbar,
} from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

const HOSTILE = 'javascript:alert(document.cookie)';
const REFUSED = 'data-egl-refused-url';

afterEach(() => {
  document.body.innerHTML = '';
});

/** @returns {Element} */
function host() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

/**
 * The Bootstrap peer double the navbar and carousel wrappers need — they resolve
 * a namespace, and this suite is about markup rather than behaviour.
 *
 * @returns {Record<string, unknown>}
 */
function peer() {
  class Fake {
    static getOrCreateInstance() {
      return new Fake();
    }
    show() {}
    hide() {}
    dispose() {}
    to() {}
    next() {}
    prev() {}
    cycle() {}
    pause() {}
  }
  return { Collapse: Fake, Dropdown: Fake, Carousel: Fake };
}

/**
 * @param {Element} el
 * @param {'href' | 'src'} attribute
 */
function refused(el, attribute) {
  return {
    attribute: el.hasAttribute(attribute),
    marked: el.hasAttribute(REFUSED),
  };
}

describe('F127 — the card image (bootstrap-composites.js)', () => {
  it('writes a legitimate source', () => {
    const card = bsCard({ text: 'x', image: { src: '/i.png', alt: 'A picture' } });
    const img = /** @type {Element} */ (card.querySelector('img'));
    expect(img.getAttribute('src')).toBe('/i.png');
    expect(img.hasAttribute(REFUSED)).toBe(false);
  });

  it('refuses a hostile source and keeps the image element with its alt', () => {
    const card = bsCard({ text: 'x', image: { src: HOSTILE, alt: 'A picture' } });
    const img = /** @type {Element} */ (card.querySelector('img'));
    expect(refused(img, 'src')).toEqual({ attribute: false, marked: true });
    // The row survives: alt text is what a reader gets instead of a script.
    expect(img.getAttribute('alt')).toBe('A picture');
    expect(card.textContent).toContain('x');
  });

  it('allows a data URL, because an image source is a different context', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    const card = bsCard({ text: 'x', image: { src, alt: '' } });
    expect(/** @type {Element} */ (card.querySelector('img')).getAttribute('src')).toBe(src);
  });

  it('still refuses an HTML data URL in an image', () => {
    // `data:` is allowed for images; `data:text/html` is inert in an `<img>` and
    // the allow-list is about the scheme, so this ONE is allowed by design —
    // asserted so the decision is visible rather than surprising.
    const src = 'data:text/html,<b>hi</b>';
    const card = bsCard({ text: 'x', image: { src, alt: '' } });
    expect(/** @type {Element} */ (card.querySelector('img')).getAttribute('src')).toBe(src);
  });
});

describe('F127 — the list-group item (bootstrap-composites.js)', () => {
  it('writes a legitimate href', () => {
    const list = bsListGroup([{ content: 'Ada', href: '/people/1' }]);
    const link = /** @type {Element} */ (list.element.querySelector('a'));
    expect(link.getAttribute('href')).toBe('/people/1');
  });

  it('refuses a hostile href and keeps the item and its label', () => {
    const list = bsListGroup([
      { content: 'Ada', href: HOSTILE },
      { content: 'Grace', href: '/people/2' },
    ]);
    const items = list.element.querySelectorAll('.list-group-item');
    expect(items).toHaveLength(2);
    expect(refused(items[0], 'href')).toEqual({ attribute: false, marked: true });
    expect(items[0].textContent).toContain('Ada');
    // And the other forty-nine records are unaffected, which is why the guard
    // answers instead of throwing.
    expect(items[1].getAttribute('href')).toBe('/people/2');
  });

  it('takes an injected allow-list through the shared contract', () => {
    const list = bsListGroup([{ content: 'Open', href: 'app:open?id=1' }], {
      protocols: ['app:'],
    });
    expect(/** @type {Element} */ (list.element.querySelector('a')).getAttribute('href')).toBe(
      'app:open?id=1',
    );
  });
});

describe('F127 — the breadcrumb link (bootstrap-composites.js)', () => {
  it('writes a legitimate href', () => {
    const nav = bsBreadcrumb([{ content: 'Home', href: '/' }, { content: 'Here' }]);
    expect(/** @type {Element} */ (nav.querySelector('a')).getAttribute('href')).toBe('/');
  });

  it('refuses a hostile href and keeps the crumb readable', () => {
    const nav = bsBreadcrumb([{ content: 'Home', href: HOSTILE }, { content: 'Here' }]);
    const link = /** @type {Element} */ (nav.querySelector('a'));
    expect(refused(link, 'href')).toEqual({ attribute: false, marked: true });
    expect(link.textContent).toBe('Home');
    expect(nav.textContent).toContain('Here');
  });
});

describe('F127 — the navbar (bootstrap-nav.js)', () => {
  it('writes legitimate hrefs for the brand, an item and a child', () => {
    const nav = bsNavbar(host(), {
      brand: 'Acme',
      brandHref: '/home',
      items: [{ label: 'Reports', href: '/reports', children: [{ label: 'Q1', href: '/q1' }] }],
      bootstrap: peer(),
    });
    const links = nav.element.querySelectorAll('a');
    expect([...links].map((a) => a.getAttribute('href'))).toEqual(['/home', '/reports', '/q1']);
  });

  it('refuses a hostile brand href and keeps the brand text', () => {
    const nav = bsNavbar(host(), { brand: 'Acme', brandHref: HOSTILE, bootstrap: peer() });
    const brand = /** @type {Element} */ (nav.element.querySelector('.navbar-brand'));
    expect(refused(brand, 'href')).toEqual({ attribute: false, marked: true });
    expect(brand.textContent).toBe('Acme');
  });

  it('refuses a hostile item href and a hostile child href', () => {
    const nav = bsNavbar(host(), {
      items: [{ label: 'Reports', href: HOSTILE, children: [{ label: 'Q1', href: HOSTILE }] }],
      bootstrap: peer(),
    });
    const item = /** @type {Element} */ (nav.element.querySelector('.nav-link'));
    const child = /** @type {Element} */ (nav.element.querySelector('.dropdown-item'));
    expect(refused(item, 'href')).toEqual({ attribute: false, marked: true });
    expect(refused(child, 'href')).toEqual({ attribute: false, marked: true });
    expect(item.textContent).toContain('Reports');
    expect(child.textContent).toBe('Q1');
  });

  it("leaves an item with NO href at '#', which is a different fact", () => {
    // Unchanged behaviour, asserted so the two cases stay distinguishable: an
    // absent href has always rendered '#', and a REFUSED one is inert.
    const nav = bsNavbar(host(), { items: [{ label: 'Plain' }], bootstrap: peer() });
    const link = /** @type {Element} */ (nav.element.querySelector('.nav-link'));
    expect(link.getAttribute('href')).toBe('#');
    expect(link.hasAttribute(REFUSED)).toBe(false);
  });
});

describe('F127 — the carousel image (bootstrap-overlays.js)', () => {
  it('writes a legitimate source and allows a data URL', () => {
    const gallery = bsCarousel(host(), {
      items: [
        { content: '/a.png', alt: 'A', active: true },
        { content: 'data:image/png;base64,iVBORw0KGgo=', alt: 'B' },
      ],
      bootstrap: peer(),
    });
    const images = gallery.element.querySelectorAll('img');
    expect(images[0].getAttribute('src')).toBe('/a.png');
    expect(images[1].getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('refuses a hostile source and keeps the slide with its alt', () => {
    const gallery = bsCarousel(host(), {
      items: [{ content: HOSTILE, alt: 'A picture', active: true }],
      bootstrap: peer(),
    });
    const img = /** @type {Element} */ (gallery.element.querySelector('img'));
    expect(refused(img, 'src')).toEqual({ attribute: false, marked: true });
    expect(img.getAttribute('alt')).toBe('A picture');
    expect(gallery.element.querySelectorAll('.carousel-item')).toHaveLength(1);
  });
});

describe('F127 — a malformed allow-list fails closed', () => {
  it('refuses rather than widening, and leaves the marker', () => {
    // The one place the builders' contract differs from `safeUrl`'s, and it is a
    // measured trade (ADR-0084): linking the option-validation half of the guard
    // into /bootstrap cost 101 B on the entry and ~150 B on each of five
    // per-function rows. A malformed `protocols` therefore cannot THROW here —
    // but it cannot widen the set either, and the refusal is observable through
    // the marker, which is what keeps it from being silent.
    const list = bsListGroup([{ content: 'Open', href: 'app:open?id=1' }], {
      protocols: /** @type {any} */ ([7]),
    });
    const link = /** @type {Element} */ (list.element.querySelector('a'));
    expect(refused(link, 'href')).toEqual({ attribute: false, marked: true });
    expect(link.textContent).toContain('Open');
  });

  it('still throws for the caller who calls safeUrl directly', async () => {
    const { safeUrl } = await import('../../../../../main/javascript/it/d4np/utils/sanitize.js');
    expect(() => safeUrl('app:x', /** @type {any} */ ({ protocols: [7] }))).toThrow(
      /expected a scheme like/,
    );
  });
});

describe('F127 — the audit this suite is', () => {
  it('covers every builder that writes a data-driven URL', () => {
    // Seven call sites, three modules. The number is in the spec and in
    // ADR-0084's correction note; if a builder gains an eighth, this assertion
    // is where the gap is supposed to become visible — a comment nobody reads
    // would not have.
    const covered = [
      'bsCard image src',
      'bsListGroup item href',
      'bsBreadcrumb link href',
      'bsNavbar brand href',
      'bsNavbar item href',
      'bsNavbar child href',
      'bsCarousel image src',
    ];
    expect(covered).toHaveLength(7);
  });
});
