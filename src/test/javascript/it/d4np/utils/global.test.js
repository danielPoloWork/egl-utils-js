import { describe, it, expect } from 'vitest';
import * as composed from '../../../../../main/javascript/it/d4np/utils/global.js';
import * as root from '../../../../../main/javascript/it/d4np/utils/index.js';
import * as storage from '../../../../../main/javascript/it/d4np/utils/storage.js';
import * as sanitize from '../../../../../main/javascript/it/d4np/utils/sanitize.js';
import * as errors from '../../../../../main/javascript/it/d4np/utils/errors.js';
import * as text from '../../../../../main/javascript/it/d4np/utils/text.js';
import * as net from '../../../../../main/javascript/it/d4np/utils/net.js';
import * as table from '../../../../../main/javascript/it/d4np/utils/table.js';
import * as logging from '../../../../../main/javascript/it/d4np/utils/logging.js';
import * as dom from '../../../../../main/javascript/it/d4np/utils/dom.js';
import * as bootstrap from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

// `global.js` is the source of the F83 single-file artifact (roadmap 18.2,
// ADR-0059): it composes the whole public surface by `export *` so the namespace
// cannot drift by omission.
//
// `tools/assert-global-artifact.mjs` already proves that property against the
// BUILT file, which is the one a CDN serves. This suite proves it against the
// SOURCE, and the difference is when you find out: the packaging gate needs a
// build and runs in `check:package`, while a missing `export *` or a name
// collision is a fact about the module that a unit test catches in seconds.
//
// It also keeps the module honest about the two things `export *` cannot say for
// itself — that the re-exported binding is the SAME value as the entry's, and
// that no sub-namespace name shadows a root export.

/** The nine subpaths, each expected as a sub-namespace named after its exports path. */
const SUBPATHS = {
  storage,
  sanitize,
  errors,
  text,
  net,
  table,
  logging,
  dom,
  bootstrap,
};

describe('the composed namespace carries the root entry', () => {
  it('exposes every root export, as the same binding', () => {
    for (const name of Object.keys(root)) {
      expect(composed, `\`${name}\` is missing from the composed namespace`).toHaveProperty(name);
      expect(composed[name], `\`${name}\` is not the root entry's binding`).toBe(root[name]);
    }
  });

  it('adds nothing to the top level beyond the root entry and the sub-namespaces', () => {
    // The artifact must not grow a surface the entries do not have: anything at
    // the top level is either a root export or one of the nine namespaces.
    const allowed = new Set([...Object.keys(root), ...Object.keys(SUBPATHS)]);
    const unexpected = Object.keys(composed).filter((name) => !allowed.has(name));
    expect(unexpected).toEqual([]);
  });
});

describe('the composed namespace carries every subpath', () => {
  for (const [name, entry] of Object.entries(SUBPATHS)) {
    it(`\`${name}\` holds exactly the ${name} entry's exports`, () => {
      expect(composed).toHaveProperty(name);
      expect(Object.keys(composed[name]).sort()).toEqual(Object.keys(entry).sort());
      for (const exported of Object.keys(entry)) {
        expect(composed[name][exported]).toBe(entry[exported]);
      }
    });
  }

  it('no sub-namespace name collides with a root export', () => {
    // A collision would shadow one of the two silently — `export *` reports
    // nothing — so it is worth an assertion at the source as well as at the
    // packaging gate.
    const collisions = Object.keys(SUBPATHS).filter((name) => name in root);
    expect(collisions).toEqual([]);
  });
});

describe('the module is a namespace and nothing more', () => {
  it('has no default export — the artifact is a namespace, not an object to import', () => {
    expect(composed).not.toHaveProperty('default');
  });

  it('reports the same VERSION as the root entry', () => {
    expect(composed.VERSION).toBe(root.VERSION);
  });
});
