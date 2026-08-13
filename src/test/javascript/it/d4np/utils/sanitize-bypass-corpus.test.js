// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import DOMPurify from 'dompurify';
import { sanitizeHtml } from '../../../../../main/javascript/it/d4np/utils/sanitize.js';
import { BYPASS_CORPUS } from '../../../../fixtures/sanitize-bypass-corpus.js';

// The peer reaches the module ambiently, as on a script-tag page (ADR-0055).
beforeAll(() => {
  /** @type {any} */ (globalThis).DOMPurify = DOMPurify;
});

// Bypass-corpus gates (roadmap 6.5, spec §2 item 24, ADR-003 / ADR-0012).
//
// TWO INDEPENDENT LAYERS, AND THE DIFFERENCE MATTERS:
//
//   1. `expectInert` is THE SECURITY GATE. It asserts structurally — by
//      re-parsing the output — that nothing executable survived. It cannot be
//      auto-updated: a regression fails and stays failing until fixed.
//
//   2. `toMatchSnapshot` is DOCUMENTATION, NOT A GATE. It records exactly what
//      the profile does to each payload, so a DOMPurify range bump or a profile
//      edit shows up as a reviewable diff instead of a silent behaviour change.
//      A snapshot can be regenerated with `-u`, so it must never be the only
//      thing standing between a payload and a shipped XSS.
//
// If you are here because `-u` made a snapshot change go away: check layer 1
// still passes, and read the diff — a changed snapshot on a bypass payload is
// a security-relevant event even when the output is still inert.

/** Elements that must never survive the default profile. */
const FORBIDDEN_ELEMENTS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'svg',
  'math',
  'base',
  'link',
  'meta',
  'template',
  'noscript',
  'video',
  'source',
  'details',
  'body',
];

/** Attributes that carry URLs and therefore need their scheme vetted. */
const URL_ATTRS = ['href', 'src', 'srcset', 'xlink:href', 'action', 'formaction', 'data', 'srcdoc'];

/** Strip spaces and C0 controls the way browsers do before resolving a scheme. */
function normalizeUrl(value) {
  let out = '';
  for (const ch of value) {
    if (/** @type {number} */ (ch.codePointAt(0)) > 0x20) out += ch;
  }
  return out.toLowerCase();
}

/**
 * The security gate: re-parse the sanitized output and assert nothing
 * executable survived. Structural, never string matching — a sanitizer is
 * supposed to preserve *text*, so output containing the characters `alert(1)`
 * as inert text is correct.
 *
 * @param {string} output
 * @param {string} label
 */
function expectInert(output, label) {
  const host = document.createElement('div');
  host.innerHTML = output;

  for (const name of FORBIDDEN_ELEMENTS) {
    expect(host.querySelectorAll(name).length, `${label}: <${name}> survived`).toBe(0);
  }

  for (const element of host.querySelectorAll('*')) {
    for (const attr of element.attributes) {
      const name = attr.name.toLowerCase();
      expect(name.startsWith('on'), `${label}: handler ${attr.name} survived`).toBe(false);
      expect(name, `${label}: ${attr.name} survived`).not.toBe('style');
      // `id` is excluded from the profile precisely to blunt DOM clobbering.
      expect(name, `${label}: id survived (DOM clobbering)`).not.toBe('id');
      if (URL_ATTRS.includes(name)) {
        const url = normalizeUrl(attr.value);
        expect(url.startsWith('javascript:'), `${label}: javascript: URL survived`).toBe(false);
        expect(url.startsWith('data:'), `${label}: data: URL survived`).toBe(false);
      }
    }
  }
}

describe('sanitize bypass corpus — the security gate', () => {
  it('the corpus is non-empty and every id is unique (a duplicate id would silently shadow a case)', () => {
    expect(BYPASS_CORPUS.length).toBeGreaterThan(30);
    const ids = BYPASS_CORPUS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of BYPASS_CORPUS) {
      expect(entry.technique.length, `${entry.id} must document its technique`).toBeGreaterThan(20);
      expect(entry.payload.length, `${entry.id} must have a payload`).toBeGreaterThan(0);
    }
  });

  for (const { id, technique, payload } of BYPASS_CORPUS) {
    it(`neutralizes ${id}`, () => {
      const output = sanitizeHtml(payload);
      expectInert(output, `${id} (${technique})`);
    });
  }

  it('is idempotent over the whole corpus (a second pass would reveal mXSS)', () => {
    for (const { id, payload } of BYPASS_CORPUS) {
      const once = sanitizeHtml(payload);
      expect(sanitizeHtml(once), `${id} is not idempotent`).toBe(once);
    }
  });

  it('keeps the legitimate content of the mixed payload (no collateral damage)', () => {
    const mixed = BYPASS_CORPUS.find((entry) => entry.id === 'mixed-article-with-vectors');
    const output = sanitizeHtml(/** @type {string} */ (mixed?.payload));
    expect(output).toContain('<h2>Title</h2>');
    expect(output).toContain('<strong>bold</strong>');
    expect(output).toContain('href="https://ok.test"');
    expect(output).toContain('alt="a"');
    expect(output).toContain('<td>cell</td>');
  });
});

describe('sanitize bypass corpus — the recorded profile behaviour (documentation)', () => {
  // One snapshot for the whole corpus, keyed by id: a single reviewable
  // artifact that makes "DOMPurify ^3 + this profile" auditable, as ADR-003
  // asked. Not a security gate — see the header.
  it('matches the recorded output for every payload', () => {
    /** @type {Record<string, string>} */
    const recorded = {};
    for (const { id, payload } of BYPASS_CORPUS) {
      recorded[id] = sanitizeHtml(payload);
    }
    expect(recorded).toMatchSnapshot();
  });

  it('records the profile itself, so a widening edit shows up in review', async () => {
    const { defaultSanitizeProfile } =
      await import('../../../../../main/javascript/it/d4np/utils/sanitize.js');
    expect({
      tags: [...defaultSanitizeProfile.tags],
      attributes: [...defaultSanitizeProfile.attributes],
      uriSchemes: [...defaultSanitizeProfile.uriSchemes],
    }).toMatchSnapshot();
  });
});
