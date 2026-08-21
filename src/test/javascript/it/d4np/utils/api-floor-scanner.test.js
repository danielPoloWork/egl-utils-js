// Tests for the NFR-07 floor gate's source scanner (roadmap 19.8, ADR-0064).
//
// These exist because the gate was green while blind. Roadmap 19.2 added six
// inventory entries for the History API, watched `check-api-floor` pass, then
// deleted an entry and watched it pass *again*: the reads sat inside a template
// literal, which the old scanner deleted whole. The same hole covered optional
// chaining, so `globalThis.location?.protocol` in storage.js had never been
// scanned since M6.
//
// A regex fixed without a test is only the next blind spot, so every evasion is
// asserted here — the shapes that must be SEEN, and the shapes that must stay
// ignored, which is the half that keeps the gate usable.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOf, platformUses, POLICED } from '../../../../../../tools/api-floor-scan.js';

/** @param {string} source @returns {string[]} `kind name` pairs, sorted. */
function uses(source) {
  return platformUses(codeOf(source))
    .map((use) => `${use.kind} ${use.name}`)
    .sort();
}

describe('codeOf', () => {
  it('drops line and block comments', () => {
    expect(codeOf('// location.protocol\nconst a = 1;')).not.toMatch(/location/);
    expect(codeOf('/* uses document.cookie */ const a = 1;')).not.toMatch(/document/);
  });

  it('drops string literals, escapes and all', () => {
    expect(codeOf("const a = 'location.protocol';")).not.toMatch(/location/);
    expect(codeOf('const a = "it\\"s document.cookie";')).not.toMatch(/document/);
  });

  it('drops a template literal’s text but keeps its interpolations', () => {
    const code = codeOf('const url = `prefix ${location.pathname} suffix`;');
    expect(code).toMatch(/location\.pathname/);
    expect(code).not.toMatch(/prefix/);
    expect(code).not.toMatch(/suffix/);
  });

  it('keeps adjacent interpolations separate rather than concatenating them', () => {
    // `${a}${b}` must not become one token, or `${location}${x.y}` would read as
    // a member access that is not there.
    expect(codeOf('`${one}${two}`')).toMatch(/one\s+two/);
  });

  it('tells a nested object literal from the end of an interpolation', () => {
    const code = codeOf('`a ${ f({ x: location.hash }) } b`');
    expect(code).toMatch(/location\.hash/);
    expect(code).not.toMatch(/\ba\b/);
    expect(code).not.toMatch(/\bb\b/);
  });

  it('handles a template nested inside an interpolation', () => {
    const code = codeOf('`outer ${ cond ? `inner ${history.state}` : `` } end`');
    expect(code).toMatch(/history\.state/);
    expect(code).not.toMatch(/outer/);
    expect(code).not.toMatch(/inner/);
    expect(code).not.toMatch(/end/);
  });

  it('drops regular-expression literals, including one carrying a quote', () => {
    // Nothing in the library does this today. "Nothing does that today" is how
    // both blind spots this scanner was rewritten for came about.
    const code = codeOf('const re = /[\'"`] document.cookie/g; const b = 2;');
    expect(code).not.toMatch(/document/);
    expect(code).toMatch(/const b = 2/);
  });

  it('does not mistake division for a regular expression', () => {
    const code = codeOf('const ratio = total / count; location.search;');
    expect(code).toMatch(/total \/ count/);
    expect(code).toMatch(/location\.search/);
  });
});

describe('platformUses — the shapes that must be seen', () => {
  it('a plain member read', () => {
    expect(uses('location.search;')).toContain('member location.search');
  });

  it('a member read behind optional chaining (blind spot, 19.2 → 19.8)', () => {
    expect(uses('location?.protocol;')).toContain('member location.protocol');
    expect(uses('globalThis.location?.protocol;')).toContain('member location.protocol');
  });

  it('a member read inside a template literal (blind spot, 19.2 → 19.8)', () => {
    expect(uses('const u = `${location.pathname}${location.hash}`;')).toEqual([
      'member location.hash',
      'member location.pathname',
    ]);
  });

  it('a bare call', () => {
    expect(uses('await fetch(url);')).toContain('bare fetch');
  });

  it('a type used as a value, and a global read off globalThis', () => {
    expect(uses('if (x instanceof Element) {}')).toContain('reference Element');
    expect(uses('const d = globalThis.document;')).toContain('reference document');
    expect(uses('const d = globalThis?.document;')).toContain('reference document');
  });

  it('a computed key, which it refuses rather than resolves', () => {
    // The scanner cannot know what `key` holds, so passing would be an evasion
    // one bracket wide.
    expect(uses("location['search'];")).toContain('computed location');
    expect(uses('location?.[key];')).toContain('computed location');
  });

  it('every policed global, reached every way', () => {
    // A loop rather than a list, so a global added to POLICED without thought
    // still has to survive all four shapes.
    for (const global of POLICED) {
      expect(uses(`${global}.someMember;`)).toContain(`member ${global}.someMember`);
      expect(uses(`\`\${${global}.someMember}\``)).toContain(`member ${global}.someMember`);
      expect(uses(`${global}?.someMember;`)).toContain(`member ${global}.someMember`);
    }
  });
});

describe('platformUses — the shapes that must stay ignored', () => {
  it('prose in a comment or a string', () => {
    expect(uses('// location.protocol and document.cookie\nconst a = 1;')).toEqual([]);
    expect(uses("throw new TypeError('needs document.cookie');")).toEqual([]);
  });

  it('a feature test, which declares that absence is handled', () => {
    expect(uses("if (typeof fetch === 'function') {}")).toEqual([]);
  });

  it('a property key that merely shares a global’s name', () => {
    expect(uses('const client = make({ fetch: impl, window: view });')).toEqual([]);
    expect(uses('const { window, document } = options;')).toEqual([]);
  });
});

describe('platformUses — where it errs, and in which direction', () => {
  it('sees a member chained off an injected object, and that is the right call', () => {
    // `bindTableHistory` resolves `options.window ?? globalThis` into a local and
    // reads members off that. A text scanner cannot tell `view.history.pushState`
    // from the ambient global's — and it should not try: the API being reached IS
    // History.pushState, so the inventory entry is owed either way.
    expect(uses('const view = injected; view.history.pushState(s, "", u);')).toContain(
      'member history.pushState',
    );
  });

  it('would also see an unrelated property that happens to share the name', () => {
    // The false positive this accepts, stated rather than discovered later: an
    // object of one's own with a `history` or `location` property reads as the
    // global. The cost is one inventory entry with an honest note; the cost of the
    // opposite error is a function broken on a browser the spec promises. This gate
    // errs toward the cheap mistake on purpose.
    expect(uses('const undo = { history: [] }; undo.history.pop();')).toContain(
      'member history.pop',
    );
  });
});

describe('against the real source', () => {
  it('sees the History API reads in dom-history.js', () => {
    // 19.2 had to write these as string concatenation to keep them scannable.
    // With the scanner fixed the workaround is gone, and this asserts the natural
    // form is covered — the point of doing 19.8 at all.
    const found = uses(readFileSync('src/main/javascript/it/d4np/utils/dom-history.js', 'utf8'));
    expect(found).toContain('member location.pathname');
    expect(found).toContain('member location.hash');
    expect(found).toContain('member location.search');
    expect(found).toContain('member history.pushState');
    expect(found).toContain('member history.replaceState');
    expect(found).toContain('member history.state');
  });

  it('sees the optional-chained read in storage.js that M6 shipped unscanned', () => {
    const found = uses(readFileSync('src/main/javascript/it/d4np/utils/storage.js', 'utf8'));
    expect(found).toContain('member location.protocol');
  });
});
