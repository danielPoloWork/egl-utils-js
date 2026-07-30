// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeHtml } from '../../../../../main/javascript/it/d4np/utils/sanitize.js';

// Property suite (roadmap 2.6 template) for sanitizeHtml (spec §2 item 24,
// ADR-003/ADR-0012). Runs in jsdom so the real browser code path is exercised.
//
// The oracle is STRUCTURAL, never string matching: a sanitizer is supposed to
// preserve text, so output containing the characters "alert(1)" as inert text
// is correct — what must never survive is a script node, an event handler, or
// a javascript:/data: URL. The exhaustive bypass-corpus snapshots are roadmap
// 6.5; these are the invariants that must hold for ANY input.

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
  'svg',
  'math',
  'base',
  'link',
  'meta',
];

/** @param {string} html */
function assertInert(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  for (const name of FORBIDDEN_ELEMENTS) {
    expect(host.querySelectorAll(name).length, `<${name}> survived: ${html}`).toBe(0);
  }
  for (const element of host.querySelectorAll('*')) {
    for (const attr of element.attributes) {
      expect(attr.name.toLowerCase().startsWith('on'), `${attr.name} survived: ${html}`).toBe(
        false,
      );
      if (['href', 'src', 'xlink:href', 'action', 'formaction'].includes(attr.name.toLowerCase())) {
        const value = attr.value.trim().toLowerCase().replaceAll(/[\s]/g, '');
        expect(value.startsWith('javascript:'), `javascript: URL survived: ${html}`).toBe(false);
        expect(value.startsWith('data:'), `data: URL survived: ${html}`).toBe(false);
      }
    }
  }
}

/** Fragments an attacker would reach for, composed into larger payloads. */
const HOSTILE_FRAGMENT = fc.constantFrom(
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<svg><animate attributeName=href values=javascript:alert(1)>',
  '<math><mtext><script>alert(1)</script>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="ja\tvascript:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<iframe src="javascript:alert(1)">',
  '<form action="https://evil.test"><input name=pw>',
  '<style>@import "evil.css";</style>',
  '<p style="background:url(javascript:1)">t</p>',
  '<div id="x">clobber</div>',
  '<base href="https://evil.test/">',
  '<link rel=stylesheet href="evil.css">',
  '<meta http-equiv=refresh content="0;url=https://evil.test">',
  '<textarea><img src=x onerror=alert(1)></textarea>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<template><script>alert(1)</script></template>',
  '<!--><script>alert(1)</script>-->',
  '<p<script>alert(1)</script>',
  '<xmp><img src=x onerror=alert(1)></xmp>',
  '<listing><img src=x onerror=alert(1)></listing>',
  '</p><img src=x onerror=alert(1)>',
);

/** Benign fragments, so payloads are realistic mixtures. */
const BENIGN_FRAGMENT = fc.constantFrom(
  '<p>text</p>',
  '<strong>bold</strong>',
  '<a href="https://ok.test">link</a>',
  '<ul><li>item</li></ul>',
  'plain words',
  '<img src="https://ok.test/i.png" alt="a">',
  '&lt;escaped&gt;',
  '<table><tr><td>c</td></tr></table>',
);

describe('sanitizeHtml — inertness law (the security property)', () => {
  // Invariant: for ANY composition of hostile and benign fragments, the output
  // contains no forbidden element, no event handler, and no javascript:/data:
  // URL. This is the library's security promise, stated as a law.
  it('output is inert for any composition of hostile fragments', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(HOSTILE_FRAGMENT, BENIGN_FRAGMENT), { minLength: 1, maxLength: 6 }),
        (fragments) => {
          assertInert(sanitizeHtml(fragments.join('')));
        },
      ),
      { numRuns: 300 },
    );
  });

  // Invariant: totality — sanitizeHtml never throws on a string input and
  // always returns a string, however arbitrary or malformed the markup.
  it('is total over arbitrary strings and always returns inert output', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (input) => {
        const out = sanitizeHtml(input);
        expect(typeof out).toBe('string');
        assertInert(out);
      }),
      { numRuns: 300 },
    );
  });

  // Invariant: idempotence — sanitizing already-sanitized output changes
  // nothing. A second pass that differed would mean the first pass emitted
  // markup its own profile rejects (an mXSS smell).
  it('is idempotent for any payload', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(HOSTILE_FRAGMENT, BENIGN_FRAGMENT), { minLength: 1, maxLength: 4 }),
        (fragments) => {
          const once = sanitizeHtml(fragments.join(''));
          expect(sanitizeHtml(once)).toBe(once);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Invariant: widening the URI scheme list can never re-admit javascript: or
  // data:, because those are not schemes the caller can name into existence —
  // they must be explicitly listed, and the validator only accepts scheme
  // shapes, so an attacker-influenced config cannot smuggle a pattern.
  it('extending allowedUriSchemes never re-admits javascript: or data:', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom('http', 'https', 'mailto', 'tel', 'ftp', 'sms'), {
          minLength: 1,
        }),
        (schemes) => {
          const out = sanitizeHtml(
            '<a href="javascript:alert(1)">x</a><a href="data:text/html,x">y</a>',
            { allowedUriSchemes: schemes },
          );
          assertInert(out);
        },
      ),
      { numRuns: 100 },
    );
  });
});
