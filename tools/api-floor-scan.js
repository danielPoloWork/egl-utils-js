/**
 * The source scanner behind check 3 of the NFR-07 floor gate — deny-by-default
 * (roadmap 19.8, ADR-0017, ADR-0064).
 *
 * Split out of `check-api-floor.mjs` for one reason: **it was wrong, and nothing
 * could have told us.** The gate is a regex scan over source text, and a regex
 * scan is only as good as the syntax whoever wrote it thought of. Two shapes it
 * had never thought of:
 *
 * - **A member read inside a template literal.** The old `stripNonCode` deleted
 *   template literals *whole*, interpolations included, so
 *   `` `${location.pathname}` `` was invisible. Roadmap 19.2 added
 *   `location.pathname` to the inventory, watched the gate go green, then removed
 *   the entry again and watched it stay green.
 * - **A member read through optional chaining.** The member pattern required a
 *   bare `.`, so `globalThis.location?.protocol` — in `storage.js` since M6, and
 *   the *recommended* way to read a possibly-absent global — has never been
 *   scanned.
 *
 * Neither was a subtle bug. Both were a gate reporting success for a question it
 * had not asked, which is the exact failure mode ADR-0017 exists to prevent and
 * the reason its header refuses eslint-plugin-compat. So the fix is not a better
 * regex: it is a scanner that tokenizes, and a **test suite** that asserts each
 * evasion is seen. A regex fixed without a test is the next blind spot.
 *
 * Kept dependency-free and pure — no BCD, no filesystem, no `process.exit` — so
 * the test suite can exercise it on strings.
 *
 * @module tools/api-floor-scan
 */

/**
 * Platform globals worth policing. ES built-ins are deliberately absent (see the
 * inventory's SCOPE note) — `target`/`lib` govern those.
 *
 * The DOM block was added for spec 03 NFR-16. Until then this list held
 * `document` and `window` but none of the DOM *types*, so `x instanceof Element`
 * or `new CustomEvent(...)` passed the gate in silence — ADR-0017 promised
 * deny-by-default and delivered it only for the globals someone had thought to
 * list. A wave that touches the DOM has to close that, or the gate would be
 * weakest exactly where it is needed most. `history` joined in 19.2 with the
 * History API.
 *
 * @type {readonly string[]}
 */
export const POLICED = [
  'AbortController',
  'AbortSignal',
  'AggregateError',
  'Blob',
  'BroadcastChannel',
  'DOMException',
  'FormData',
  'Headers',
  'ReadableStream',
  'Request',
  'Response',
  'TextDecoder',
  'TextEncoder',
  'URL',
  'URLSearchParams',
  'WebSocket',
  'Worker',
  'atob',
  'btoa',
  'clearTimeout',
  'crypto',
  'document',
  'fetch',
  'history',
  'localStorage',
  'location',
  'navigator',
  'performance',
  'queueMicrotask',
  'sessionStorage',
  'setTimeout',
  'structuredClone',
  'window',
  // --- DOM surface (spec 03 NFR-16) ---
  'CustomEvent',
  'DocumentFragment',
  'Element',
  'Event',
  'EventTarget',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'MutationObserver',
  'Node',
  'NodeFilter',
  'ResizeObserver',
  'cancelAnimationFrame',
  'getComputedStyle',
  'requestAnimationFrame',
];

/** Characters after which a `/` opens a regular expression rather than divides. */
const REGEX_ALLOWED_AFTER = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '~',
  '^',
  '<',
  '>',
  '\n',
]);

/**
 * Reduce a source file to the part that is *code*.
 *
 * Comments, string literals and regular-expression literals are replaced with
 * inert placeholders, so documentation prose is never scanned as code — that part
 * is unchanged in intent from the original `stripNonCode`, and it is load-bearing:
 * this very file names `location.protocol` in its own header, and the inventory
 * describes half the DOM in its guard notes.
 *
 * What changed is template literals. They are no longer deleted whole: their
 * literal text is dropped and **every `${…}` is kept**, because an interpolation
 * is code, and code is exactly what this function exists to hand to the scanner.
 * A hand-written pass rather than a regex, because interpolations nest — an object
 * literal inside a `${}` inside a template inside another `${}` is legal, and a
 * regex has no way to tell that inner `}` from the one that closes the
 * interpolation. The brace depth per frame is the whole trick.
 *
 * Regular-expression literals are handled too. Nothing in this repository puts a
 * quote or a backtick inside one today, but "nothing does that today" is how both
 * of the blind spots this module was written for came about.
 *
 * @param {string} source - JavaScript source text.
 * @returns {string} The same text with non-code spans blanked and interpolations
 *   preserved. Offsets are **not** preserved; this output is for matching, never
 *   for reporting a position.
 */
export function codeOf(source) {
  /** @type {string[]} */
  const out = [];
  /**
   * Frames of the tokenizer. A `code` frame counts open braces so a `}` can tell
   * a nested object literal from the end of an interpolation; a `template` frame
   * is inside backticks, dropping literal text.
   *
   * @type {{ kind: 'code' | 'template', depth: number }[]}
   */
  const stack = [{ kind: 'code', depth: 0 }];
  let i = 0;

  /** The last non-whitespace character emitted, for the regex-vs-division call. */
  const lastEmitted = () => {
    for (let k = out.length - 1; k >= 0; k -= 1) {
      const chunk = out[k].trimEnd();
      if (chunk !== '') return chunk[chunk.length - 1];
    }
    return '';
  };

  while (i < source.length) {
    const frame = stack[stack.length - 1];
    const char = source[i];

    if (frame.kind === 'template') {
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === '`') {
        stack.pop();
        out.push(' ');
        i += 1;
        continue;
      }
      if (char === '$' && source[i + 1] === '{') {
        stack.push({ kind: 'code', depth: 0 });
        // A space on each side: `${a}${b}` must not concatenate into one token.
        out.push(' ');
        i += 2;
        continue;
      }
      // Literal text inside a template — dropped, like any other string content.
      i += 1;
      continue;
    }

    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      out.push(' ');
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      out.push(' ');
      continue;
    }
    if (char === '/' && REGEX_ALLOWED_AFTER.has(lastEmitted())) {
      i += 1;
      let inClass = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        else if (c === '\n') break; // unterminated; bail rather than eat the file
        i += 1;
      }
      i += 1;
      while (i < source.length && /[dgimsuvy]/.test(source[i])) i += 1;
      out.push(' /**/ ');
      continue;
    }
    if (char === '"' || char === "'") {
      i += 1;
      while (i < source.length && source[i] !== char) {
        if (source[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      out.push(char === '"' ? '""' : "''");
      continue;
    }
    if (char === '`') {
      stack.push({ kind: 'template', depth: 0 });
      out.push(' ');
      i += 1;
      continue;
    }
    if (char === '{') {
      frame.depth += 1;
      out.push(char);
      i += 1;
      continue;
    }
    if (char === '}') {
      if (frame.depth === 0 && stack.length > 1) {
        // Closes the interpolation, not an object literal.
        stack.pop();
        out.push(' ');
        i += 1;
        continue;
      }
      frame.depth -= 1;
      out.push(char);
      i += 1;
      continue;
    }
    out.push(char);
    i += 1;
  }

  return out.join('');
}

/**
 * @typedef {object} PlatformUse
 * @property {'member' | 'bare' | 'reference' | 'computed'} kind - How the global
 *   was reached, which decides what the caller must find in the inventory.
 * @property {string} global - The policed global.
 * @property {string} name - The inventory key to look for: `Global.member` for a
 *   member read, the global itself otherwise.
 */

/**
 * Find every reference to a policed global in already-tokenized code.
 *
 * Four shapes, and each earns its place:
 *
 * - **`member`** — `location.search`, `location?.search`. Optional chaining is
 *   matched because it is the *recommended* way to read a possibly-absent global
 *   and was therefore the one shape guaranteed to appear in guarded code, which is
 *   precisely the code this gate exists to check.
 * - **`bare`** — `structuredClone(`, `fetch(`.
 * - **`reference`** — `x instanceof Element`, `globalThis.document`. Neither of
 *   the two above can see these: one needs a `.` on the right, the other a `(`.
 * - **`computed`** — `location['search']`. The scanner cannot resolve a computed
 *   key, so it refuses instead of passing: a gate that quietly ignores what it
 *   cannot read is the failure this module was written to end.
 *
 * Deliberately **not** flagged: `typeof X` (a feature test is a declaration that
 * absence is handled, not an unguarded dependency) and object/destructuring
 * property keys — `{ fetch: impl }` and `const { window } = options` name a
 * property, not a global. An early draft matched any bare identifier and reported
 * exactly those two shapes in `web.js` and `sanitize.js`, which are not uses at
 * all.
 *
 * @param {string} code - Output of {@link codeOf}.
 * @param {readonly string[]} [policed=POLICED]
 * @returns {PlatformUse[]} In source order per global, deduplicated by `name`.
 */
export function platformUses(code, policed = POLICED) {
  /** @type {Map<string, PlatformUse>} */
  const found = new Map();
  const add = (use) => {
    if (!found.has(`${use.kind} ${use.name}`)) found.set(`${use.kind} ${use.name}`, use);
  };

  for (const global of policed) {
    // `?\.` as well as `\.`: optional chaining is a member read, and pretending
    // otherwise is blind spot #2.
    const member = new RegExp(`\\b${global}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');
    for (const match of code.matchAll(member)) {
      add({ kind: 'member', global, name: `${global}.${match[1]}` });
    }

    if (new RegExp(`\\b${global}\\s*\\(`).test(code)) {
      add({ kind: 'bare', global, name: global });
    }

    const references = [
      new RegExp(`\\binstanceof\\s+${global}\\b`),
      new RegExp(`\\bglobalThis\\s*\\??\\.\\s*${global}\\b`),
    ];
    if (references.some((pattern) => pattern.test(code))) {
      add({ kind: 'reference', global, name: global });
    }

    // `(?:\?\.)?` rather than `\??`: optional-chained bracket access is `?.[`,
    // three characters, so a pattern allowing only `?[` would have matched nothing
    // real — the same one-character-short mistake as blind spot #2, caught here by
    // the test rather than by a later wave.
    if (new RegExp(`\\b${global}\\s*(?:\\?\\.)?\\s*\\[`).test(code)) {
      add({ kind: 'computed', global, name: global });
    }
  }

  return [...found.values()];
}
