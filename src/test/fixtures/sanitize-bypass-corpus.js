/**
 * A curated corpus of documented HTML-sanitizer bypass techniques, used by the
 * roadmap 6.5 gates (spec §2 item 24, ADR-003 / ADR-0012).
 *
 * **Provenance, stated plainly:** DOMPurify does not publish its test
 * fixtures in the npm package (it ships `dist`, `src`, and licences only), so
 * this corpus is **hand-curated from published bypass and mXSS research
 * classes** rather than imported verbatim from DOMPurify's suite. Each entry
 * names the *technique* and what a naive sanitizer gets wrong; entries are
 * deliberately described by technique rather than tagged with CVE numbers,
 * because a wrong identifier in a security fixture is worse than none.
 *
 * **What this corpus is for.** These payloads are not expected to break
 * DOMPurify — it defends against them, which is exactly why ADR-003 chose to
 * delegate. They pin *our profile*: a future profile edit (or a DOMPurify
 * range bump) that re-admitted `svg`, `style`, `id`, or a wider URI scheme
 * would turn several of these live again, and the gate would fail.
 *
 * This module is fixture data shared by two runners — the Node snapshot suite
 * and the real-browser suite — so it lives outside both of their test globs.
 *
 * @module test/fixtures/sanitize-bypass-corpus
 */

/**
 * @typedef {object} BypassCase
 * @property {string} id - Stable identifier; also the snapshot key.
 * @property {string} technique - The parser or DOM behaviour being abused.
 * @property {string} payload - The untrusted input.
 */

/** @type {readonly BypassCase[]} */
export const BYPASS_CORPUS = Object.freeze([
  // ---------------------------------------------------------------------
  // mXSS: serialize-then-reparse divergence. The canonical class, and the
  // reason a homegrown "parse once, filter, serialize" sanitizer is unsafe.
  // ---------------------------------------------------------------------
  {
    id: 'mxss-mathml-mglyph-style-comment',
    technique:
      'MathML text integration point: <mglyph> inside <mtext> switches the parser insertion mode, so a <style> comment boundary re-parses into a live <img> on the second pass',
    payload:
      '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">',
  },
  {
    id: 'mxss-mathml-malignmark',
    technique: '<malignmark> variant of the MathML text-integration-point insertion-mode switch',
    payload:
      '<math><mtext><table><malignmark><style><!--</style><img title="--><img src=1 onerror=alert(1)>">',
  },
  {
    id: 'mxss-svg-style-comment',
    technique:
      'SVG foreign content: <style> inside <svg> is raw text, so an unbalanced comment lets markup escape on re-parse',
    payload: '<svg><style><!--</style><img src=x onerror=alert(1)>',
  },
  {
    id: 'mxss-noscript-parsing-divergence',
    technique:
      '<noscript> contents are raw text when scripting is enabled and markup when it is disabled — sanitizer and browser can disagree about which',
    payload: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  },
  {
    id: 'mxss-xmp-raw-text',
    technique:
      '<xmp> is a raw-text element: its contents are not parsed as markup on the first pass',
    payload: '<xmp><img src=x onerror=alert(1)></xmp>',
  },
  {
    id: 'mxss-listing-raw-text',
    technique: '<listing> raw-text element, same class as <xmp>',
    payload: '<listing><img src=x onerror=alert(1)></listing>',
  },
  {
    id: 'mxss-plaintext-raw-text',
    technique: '<plaintext> switches the tokenizer so everything after it is text until EOF',
    payload: '<plaintext><img src=x onerror=alert(1)>',
  },
  {
    id: 'mxss-template-content-fragment',
    technique:
      '<template> contents live in a separate document fragment that a naive tree walk never visits',
    payload: '<template><img src=x onerror=alert(1)></template>',
  },
  {
    id: 'mxss-nested-template-noscript',
    technique: 'Nested isolation contexts compounding the fragment and raw-text divergences',
    payload: '<template><noscript><img src=x onerror=alert(1)></noscript></template>',
  },
  {
    id: 'mxss-select-style',
    technique:
      '<style> inside <select> hits an insertion mode that drops unexpected elements, shifting where following markup lands',
    payload: '<select><style><img src=x onerror=alert(1)></style></select>',
  },
  {
    id: 'mxss-table-caption-svg',
    technique: 'Foreign-content transition inside table scope (<caption> then <svg>)',
    payload: '<table><caption><svg><style><!--</style><img src=x onerror=alert(1)>',
  },
  {
    id: 'mxss-form-nesting',
    technique:
      'Nested <form> elements are dropped by the parser, so element relationships after sanitization differ from those before',
    payload: '<form><form><img src=x onerror=alert(1)></form></form>',
  },
  {
    id: 'mxss-comment-boundary-title',
    technique:
      'An attribute value carrying a comment terminator (-->) can end a comment during re-parse, exposing the markup after it',
    payload: '<!--<img src=x onerror=alert(1)>--><p title="--><img src=y onerror=alert(2)>">',
  },
  {
    id: 'mxss-bogus-comment',
    technique: 'A bogus comment (<!-->) ends earlier than a naive scanner assumes',
    payload: '<!--><img src=x onerror=alert(1)>',
  },
  {
    id: 'mxss-svg-foreignobject',
    technique: '<foreignObject> re-enters the HTML namespace from inside SVG',
    payload: '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
  },
  {
    id: 'mxss-svg-desc-namespace-confusion',
    technique: 'Namespace confusion via <desc>, an SVG element that accepts HTML content',
    payload: '<svg><desc><img src=x onerror=alert(1)></desc></svg>',
  },

  // ---------------------------------------------------------------------
  // Script-execution vectors: event handlers and URI schemes.
  // ---------------------------------------------------------------------
  {
    id: 'handler-img-onerror',
    technique: 'The baseline event-handler attribute vector',
    payload: '<img src=x onerror=alert(1)>',
  },
  {
    id: 'handler-svg-onload',
    technique: 'SVG root onload, which fires without user interaction',
    payload: '<svg onload=alert(1)>',
  },
  {
    id: 'handler-body-onload-injection',
    technique: 'Injecting a <body> element to reach a document-level handler',
    payload: '<body onload=alert(1)>',
  },
  {
    id: 'handler-details-ontoggle',
    technique: '<details open ontoggle> fires on insertion, needing no interaction',
    payload: '<details open ontoggle=alert(1)>',
  },
  {
    id: 'handler-input-autofocus-onfocus',
    technique: 'autofocus makes onfocus self-triggering',
    payload: '<input autofocus onfocus=alert(1)>',
  },
  {
    id: 'handler-video-source-onerror',
    technique: 'A media <source> whose load necessarily fails, triggering onerror',
    payload: '<video><source onerror=alert(1)></video>',
  },
  {
    id: 'handler-uppercase-and-spacing',
    technique: 'Case and whitespace variation around the attribute name and equals sign',
    payload: '<IMG SRC=x OnErRoR = alert(1) >',
  },
  {
    id: 'handler-legacy-image-alias',
    technique: '<image> is a legacy parser alias for <img>, so a tag-name allowlist can miss it',
    payload: '<image src=x onerror=alert(1)>',
  },
  {
    id: 'handler-malformed-tag-prefix',
    technique: 'A doubled opening bracket that some naive scanners mis-tokenize',
    payload: '<<script>script>alert(1)<</script>/script>',
  },
  {
    id: 'uri-javascript-plain',
    technique: 'javascript: URI in href',
    payload: '<a href="javascript:alert(1)">x</a>',
  },
  {
    id: 'uri-javascript-tab-obfuscated',
    technique: 'A tab inside the scheme name — browsers strip it, naive string checks do not',
    payload: '<a href="java\tscript:alert(1)">x</a>',
  },
  {
    id: 'uri-javascript-newline-obfuscated',
    technique: 'A newline inside the scheme name',
    payload: '<a href="java\nscript:alert(1)">x</a>',
  },
  {
    id: 'uri-javascript-entity-encoded',
    technique: 'The scheme built from an HTML entity, decoded after the sanitizer looks',
    payload: '<a href="&#x6a;avascript:alert(1)">x</a>',
  },
  {
    id: 'uri-javascript-leading-control-char',
    technique:
      'A leading C0 control character (U+0001) that browsers strip before resolving the scheme',
    payload: '<a href="\u0001javascript:alert(1)">x</a>',
  },
  {
    id: 'uri-data-html',
    technique: 'data: URI carrying a whole HTML document',
    payload: '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  },
  {
    id: 'uri-svg-animate-href',
    technique: '<animate> rewrites href to a javascript: URI after insertion',
    payload:
      '<svg><a><animate attributeName=href values=javascript:alert(1)><text x=10>click</text></a></svg>',
  },
  {
    id: 'uri-math-href',
    technique: 'MathML element carrying a javascript: href',
    payload: '<math href="javascript:alert(1)"><mi>x</mi></math>',
  },
  {
    id: 'uri-iframe-srcdoc',
    technique: 'srcdoc smuggles an entire HTML document inside an attribute value',
    payload: '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
  },
  {
    id: 'uri-formaction-override',
    technique: 'formaction on a submit button overrides the form action with a javascript: URI',
    payload: '<form><button formaction="javascript:alert(1)">go</button></form>',
  },
  {
    id: 'uri-object-data',
    technique: '<object data> as a script carrier',
    payload: '<object data="javascript:alert(1)"></object>',
  },
  {
    id: 'uri-srcset-carrier',
    technique: 'srcset is a URL carrier that a href/src-only scheme check never inspects',
    payload: '<img src="https://ok.test/i.png" srcset="javascript:alert(1) 1x">',
  },
  {
    id: 'uri-base-href-hijack',
    technique: '<base href> silently re-points every relative URL in the document',
    payload: '<base href="https://evil.test/"><a href="/x">link</a>',
  },

  // ---------------------------------------------------------------------
  // CSS and DOM-level abuse that does not need script execution.
  // ---------------------------------------------------------------------
  {
    id: 'css-style-import',
    technique: '<style> with @import pulls in remote CSS (exfiltration, not execution)',
    payload: '<style>@import url("https://evil.test/x.css");</style>',
  },
  {
    id: 'css-style-attribute-url',
    technique: 'A style attribute carrying a url() — CSS sanitization is a stated non-goal',
    payload: '<p style="background:url(https://evil.test/pixel.png)">t</p>',
  },
  {
    id: 'dom-clobbering-id',
    technique:
      'id/name clobbering shadows document properties (document.getElementById, document.forms) for later scripts',
    payload: '<a id="currentScript"></a><form name="cookie"><input name="value"></form>',
  },
  {
    id: 'dom-clobbering-nested-name',
    technique: 'Two-level clobbering to synthesise a nested property path',
    payload: '<form id="config"><input name="endpoint" value="https://evil.test"></form>',
  },
  {
    id: 'meta-refresh-redirect',
    technique: '<meta http-equiv=refresh> navigates away without any script',
    payload: '<meta http-equiv="refresh" content="0;url=https://evil.test">',
  },
  {
    id: 'link-stylesheet-remote',
    technique: '<link rel=stylesheet> loads remote CSS',
    payload: '<link rel="stylesheet" href="https://evil.test/x.css">',
  },
  {
    id: 'target-blank-tabnabbing',
    technique: 'target=_blank without rel=noopener exposes the opener (reverse tabnabbing)',
    payload: '<a href="https://ok.test" target="_blank">x</a>',
  },

  // ---------------------------------------------------------------------
  // Mixed payloads: benign content wrapping a vector, so the corpus also
  // proves legitimate markup is not collateral damage.
  // ---------------------------------------------------------------------
  {
    id: 'mixed-article-with-vectors',
    technique: 'A realistic rich-text document with vectors interleaved',
    payload:
      '<h2>Title</h2><p class="lead">Intro <strong>bold</strong></p>' +
      '<script>alert(1)</script>' +
      '<ul><li>one</li><li><img src="https://ok.test/i.png" alt="a" onerror=alert(2)></li></ul>' +
      '<a href="https://ok.test" target="_blank" id="clobber">link</a>' +
      '<table><tr><td style="color:red">cell</td></tr></table>',
  },
]);
