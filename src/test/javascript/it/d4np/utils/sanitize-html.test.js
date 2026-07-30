// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  defaultSanitizeProfile,
} from '../../../../../main/javascript/it/d4np/utils/sanitize.js';

// Example tests (roadmap 6.3, spec §2 item 24, ADR-003/ADR-0012).
//
// This file runs in the jsdom environment, so `window` exists and DOMPurify's
// default export is already bound to it — the same code path a browser takes,
// with no injection. The Node-without-a-DOM contract is covered separately in
// sanitize-node.test.js, which runs in the default node environment.

/** Parse sanitized output back into a DOM so assertions are structural. */
function parse(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

/** Element names that must never survive sanitization under the default profile. */
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

/** URL-carrying attributes whose scheme must be vetted. */
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction'];

/**
 * Lowercase a URL with every space and C0 control character removed, the way
 * browsers treat URLs — `java<TAB>script:` really does execute, so the oracle
 * must normalize before comparing schemes. Done by code point rather than a
 * regex: matching control characters is exactly what `no-control-regex`
 * forbids, and a scan states the intent more precisely anyway (ADR-0005 style).
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeUrl(value) {
  let out = '';
  for (const ch of value) {
    if (/** @type {number} */ (ch.codePointAt(0)) > 0x20) out += ch;
  }
  return out.toLowerCase();
}

/**
 * The real security oracle: parse the output and assert that no executable
 * construct survived. String matching cannot express this — a sanitizer is
 * *supposed* to preserve text, so output containing the characters "alert(1)"
 * as inert text is correct, while a surviving `onerror` attribute is not.
 *
 * @param {string} output
 * @param {string} label
 */
function assertNothingExecutable(output, label) {
  const host = parse(output);
  for (const name of FORBIDDEN_ELEMENTS) {
    expect(host.querySelectorAll(name).length, `${label}: <${name}> survived`).toBe(0);
  }
  for (const element of host.querySelectorAll('*')) {
    for (const attr of element.attributes) {
      expect(attr.name.toLowerCase().startsWith('on'), `${label}: ${attr.name} survived`).toBe(
        false,
      );
      if (URL_ATTRS.includes(attr.name.toLowerCase())) {
        const url = normalizeUrl(attr.value);
        expect(url.startsWith('javascript:'), `${label}: javascript: URL survived`).toBe(false);
        expect(url.startsWith('data:'), `${label}: data: URL survived`).toBe(false);
      }
    }
  }
}

describe('sanitizeHtml — keeps curated content', () => {
  it('preserves allowed formatting and structure', () => {
    const html =
      '<p>Hello <strong>world</strong> and <em>others</em></p>' +
      '<ul><li>one</li><li>two</li></ul>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('preserves a table with its structural attributes', () => {
    const html =
      '<table><thead><tr><th scope="col">H</th></tr></thead>' +
      '<tbody><tr><td colspan="2">C</td></tr></tbody></table>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('keeps http, https and mailto links', () => {
    for (const href of ['http://a.test/x', 'https://a.test/x', 'mailto:a@b.test']) {
      expect(sanitizeHtml(`<a href="${href}">l</a>`)).toContain(`href="${href}"`);
    }
  });

  it('keeps relative and fragment URLs', () => {
    for (const href of ['/abs', './rel', '../up', '#frag', '?q=1', 'page.html', 'a/b']) {
      expect(sanitizeHtml(`<a href="${href}">l</a>`), href).toContain('href=');
    }
  });

  it('keeps images with allowed attributes', () => {
    const out = sanitizeHtml('<img src="https://a.test/i.png" alt="a" width="10" height="20">');
    const img = parse(out).querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://a.test/i.png');
    expect(img?.getAttribute('alt')).toBe('a');
  });

  it('keeps aria attributes (accessibility is not a security cost)', () => {
    const out = sanitizeHtml('<span aria-label="hi" aria-hidden="true">x</span>');
    expect(out).toContain('aria-label="hi"');
    expect(out).toContain('aria-hidden="true"');
  });

  it('keeps class but drops id (DOM clobbering, duplicate ids)', () => {
    const out = sanitizeHtml('<p class="lead" id="x">t</p>');
    expect(out).toContain('class="lead"');
    expect(out).not.toContain('id=');
  });

  it('escapes text content rather than dropping it', () => {
    expect(sanitizeHtml('<p>5 &lt; 7 &amp; 8 &gt; 2</p>')).toBe('<p>5 &lt; 7 &amp; 8 &gt; 2</p>');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(sanitizeHtml('just words')).toBe('just words');
  });
});

describe('sanitizeHtml — removes script execution vectors', () => {
  it('drops <script> and its contents entirely', () => {
    const out = sanitizeHtml('<p>a</p><script>alert(1)</script><p>b</p>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
    expect(out).toBe('<p>a</p><p>b</p>');
  });

  it('drops every on* event handler without enumerating them', () => {
    for (const attr of [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onanimationstart',
      'ontoggle',
      'onbeforeinput',
    ]) {
      const out = sanitizeHtml(`<img src="https://a.test/i.png" ${attr}="alert(1)">`);
      expect(out.toLowerCase(), attr).not.toContain('alert');
      expect(out.toLowerCase(), attr).not.toContain(attr);
    }
  });

  it('drops javascript: URIs in href and src', () => {
    const cases = [
      '<a href="javascript:alert(1)">x</a>',
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '<a href="java\tscript:alert(1)">x</a>',
      '<a href=" javascript:alert(1)">x</a>',
      '<img src="javascript:alert(1)">',
    ];
    for (const input of cases) {
      const out = sanitizeHtml(input);
      expect(out.toLowerCase(), input).not.toContain('javascript:');
      expect(out.toLowerCase(), input).not.toContain('alert');
    }
  });

  it('drops data: URIs (an XSS carrier in href)', () => {
    const out = sanitizeHtml(
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    );
    expect(out).not.toContain('data:');
  });

  it('drops <style> and style attributes (CSS sanitization is a non-goal)', () => {
    const out = sanitizeHtml('<style>body{background:url(javascript:1)}</style><p style="x">t</p>');
    expect(out).not.toContain('style');
    expect(out).toBe('<p>t</p>');
  });

  it('drops iframe, object, embed and their attributes', () => {
    for (const input of [
      '<iframe src="https://evil.test"></iframe>',
      '<object data="x.swf"></object>',
      '<embed src="x.swf">',
    ]) {
      const out = sanitizeHtml(input);
      expect(out.toLowerCase(), input).not.toMatch(/iframe|object|embed/);
    }
  });

  it('drops form controls (phishing surface)', () => {
    const out = sanitizeHtml(
      '<form action="https://evil.test"><input name="pw" type="password"><button>Go</button></form>',
    );
    expect(out.toLowerCase()).not.toMatch(/form|input|button|password/);
  });

  it('drops SVG vectors', () => {
    for (const input of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"></svg>',
      '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>',
      '<svg><use href="#x"/></svg>',
      '<svg><foreignObject><script>alert(1)</script></foreignObject></svg>',
    ]) {
      const out = sanitizeHtml(input);
      expect(out.toLowerCase(), input).not.toContain('svg');
      expect(out.toLowerCase(), input).not.toContain('alert');
    }
  });

  it('drops MathML vectors', () => {
    for (const input of [
      '<math><mtext><script>alert(1)</script></mtext></math>',
      '<math href="javascript:alert(1)"><mi>x</mi></math>',
    ]) {
      const out = sanitizeHtml(input);
      expect(out.toLowerCase(), input).not.toContain('math');
      expect(out.toLowerCase(), input).not.toContain('alert');
    }
  });

  it('drops data-* attributes by default', () => {
    const out = sanitizeHtml('<p data-x="1" data-controller="evil">t</p>');
    expect(out).toBe('<p>t</p>');
  });

  it('drops target (reverse tabnabbing)', () => {
    const out = sanitizeHtml('<a href="https://a.test" target="_blank">l</a>');
    expect(out).not.toContain('target');
  });

  it('drops unknown and custom elements while keeping their text', () => {
    const out = sanitizeHtml('<custom-el>text</custom-el><unknown>more</unknown>');
    expect(out).not.toContain('custom-el');
    expect(out).toContain('text');
  });

  it('survives malformed and unbalanced markup, leaving nothing executable', () => {
    for (const input of [
      '<p><b>unclosed',
      '</p></div>',
      '<p<b>x</b>',
      '<<script>script>alert(1)<</script>/script>',
      '<img src=x onerror=alert(1)//>',
      '<!--<img src=x onerror=alert(1)>-->',
      // In HTML (not XML) this is a bogus comment, not a CDATA section: the
      // parser ends it at the first '>', so `alert(1)` survives as inert TEXT.
      // The assertion must therefore be structural — a sanitizer is supposed
      // to preserve text; what it must never preserve is a script node, an
      // event handler, or a javascript: URL.
      '<![CDATA[<script>alert(1)</script>]]>',
    ]) {
      const out = sanitizeHtml(input);
      expect(typeof out, input).toBe('string');
      assertNothingExecutable(out, input);
    }
  });

  it('output is idempotent — re-sanitizing changes nothing', () => {
    const inputs = [
      '<p>a</p><script>alert(1)</script>',
      '<img src="https://a.test/i.png" onerror="alert(1)">',
      '<a href="javascript:alert(1)">x</a>',
      '<svg onload="alert(1)"><p>t</p></svg>',
    ];
    for (const input of inputs) {
      const once = sanitizeHtml(input);
      expect(sanitizeHtml(once), input).toBe(once);
    }
  });
});

describe('sanitizeHtml — profile extension', () => {
  it('additionalTags widens the allowlist without discarding the default', () => {
    const out = sanitizeHtml('<p>a</p><section>b</section>', { additionalTags: ['section'] });
    expect(out).toBe('<p>a</p><section>b</section>');
  });

  it('additionalAttributes widens the attribute allowlist', () => {
    const out = sanitizeHtml('<p id="keep" class="c">t</p>', {
      additionalAttributes: ['id'],
    });
    expect(out).toContain('id="keep"');
    expect(out).toContain('class="c"');
  });

  it('allowedTags replaces the default profile entirely', () => {
    const out = sanitizeHtml('<p>a</p><b>b</b>', { allowedTags: ['b'] });
    expect(out).toBe('a<b>b</b>'); // <p> dropped, its text kept
  });

  it('allowedAttributes replaces the default attribute profile', () => {
    const out = sanitizeHtml('<a href="https://a.test" title="t">l</a>', {
      allowedAttributes: ['title'],
    });
    expect(out).toContain('title="t"');
    expect(out).not.toContain('href');
  });

  it('an empty allowedTags strips all markup but keeps text', () => {
    expect(sanitizeHtml('<p>a<b>b</b></p>', { allowedTags: [] })).toBe('ab');
  });

  it('allowDataAttributes: true permits data-*', () => {
    const out = sanitizeHtml('<p data-x="1">t</p>', { allowDataAttributes: true });
    expect(out).toContain('data-x="1"');
  });

  it('allowedUriSchemes restricts and extends which schemes survive', () => {
    // Narrowed: mailto is no longer accepted.
    expect(
      sanitizeHtml('<a href="mailto:a@b.test">l</a>', { allowedUriSchemes: ['https'] }),
    ).not.toContain('mailto');
    // Extended: tel becomes acceptable.
    expect(
      sanitizeHtml('<a href="tel:+123">l</a>', { allowedUriSchemes: ['https', 'tel'] }),
    ).toContain('tel:+123');
    // Extending never re-admits javascript:.
    expect(
      sanitizeHtml('<a href="javascript:alert(1)">l</a>', {
        allowedUriSchemes: ['https', 'tel'],
      }).toLowerCase(),
    ).not.toContain('javascript');
  });

  it('a scheme name cannot inject regex syntax into the URI pattern', () => {
    for (const bad of ['https|javascript', '.*', 'java script', '', 'ht(tp', '1abc']) {
      expect(() => sanitizeHtml('<a href="x">l</a>', { allowedUriSchemes: [bad] }), bad).toThrow(
        TypeError,
      );
    }
  });
});

describe('sanitizeHtml — the default profile is inspectable and frozen', () => {
  it('exposes the curated lists', () => {
    expect(defaultSanitizeProfile.tags).toContain('p');
    expect(defaultSanitizeProfile.attributes).toContain('href');
    expect(defaultSanitizeProfile.uriSchemes).toEqual(['http', 'https', 'mailto']);
  });

  it('excludes the dangerous names it is meant to exclude', () => {
    for (const tag of [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'svg',
      'math',
    ]) {
      expect(defaultSanitizeProfile.tags, tag).not.toContain(tag);
    }
    for (const attr of ['style', 'id', 'target', 'onerror', 'onload', 'srcset', 'formaction']) {
      expect(defaultSanitizeProfile.attributes, attr).not.toContain(attr);
    }
  });

  it('is frozen, so a consumer cannot weaken the profile at a distance', () => {
    expect(Object.isFrozen(defaultSanitizeProfile)).toBe(true);
    expect(Object.isFrozen(defaultSanitizeProfile.tags)).toBe(true);
    expect(() => {
      /** @type {any} */ (defaultSanitizeProfile.tags).push('script');
    }).toThrow();
    expect(defaultSanitizeProfile.tags).not.toContain('script');
  });

  it('mutating the array a caller passed in cannot affect later calls', () => {
    const tags = ['b'];
    const out = sanitizeHtml('<b>x</b>', { allowedTags: tags });
    tags.push('script');
    expect(out).toBe('<b>x</b>');
    expect(sanitizeHtml('<script>alert(1)</script><b>x</b>')).toBe('<b>x</b>');
  });
});

describe('sanitizeHtml — argument validation', () => {
  it('rejects non-string html', () => {
    for (const bad of [42, null, undefined, {}, ['<p>'], 1n]) {
      expect(() => sanitizeHtml(/** @type {any} */ (bad))).toThrow(TypeError);
    }
  });

  it('rejects a non-plain-object options bag', () => {
    for (const bad of [null, 42, 'x', ['a']]) {
      expect(() => sanitizeHtml('<p>a</p>', /** @type {any} */ (bad))).toThrow(
        /options must be a plain object/,
      );
    }
  });

  it('rejects mutually exclusive tag and attribute options', () => {
    expect(() => sanitizeHtml('<p>a</p>', { allowedTags: ['p'], additionalTags: ['b'] })).toThrow(
      /mutually exclusive/,
    );
    expect(() =>
      sanitizeHtml('<p>a</p>', { allowedAttributes: ['href'], additionalAttributes: ['id'] }),
    ).toThrow(/mutually exclusive/);
  });

  it('rejects non-string-array list options', () => {
    for (const key of [
      'allowedTags',
      'allowedAttributes',
      'additionalTags',
      'additionalAttributes',
    ]) {
      expect(() => sanitizeHtml('<p>a</p>', { [key]: 'p' }), key).toThrow(TypeError);
      expect(() => sanitizeHtml('<p>a</p>', { [key]: [42] }), key).toThrow(TypeError);
    }
  });

  it('rejects an empty or non-array allowedUriSchemes', () => {
    expect(() => sanitizeHtml('<p>a</p>', { allowedUriSchemes: [] })).toThrow(TypeError);
    expect(() =>
      sanitizeHtml('<p>a</p>', { allowedUriSchemes: /** @type {any} */ ('https') }),
    ).toThrow(TypeError);
  });

  it('rejects a non-boolean allowDataAttributes', () => {
    expect(() =>
      sanitizeHtml('<p>a</p>', { allowDataAttributes: /** @type {any} */ ('yes') }),
    ).toThrow(TypeError);
  });

  it('validates options before sanitizing (invalid scheme reported regardless)', () => {
    expect(() => sanitizeHtml('<p>a</p>', { allowedUriSchemes: ['no spaces'] })).toThrow(
      /invalid scheme/,
    );
  });
});
