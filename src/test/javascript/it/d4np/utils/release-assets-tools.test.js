// Tests for the release-asset gate's pure logic (roadmap 22.3, ADR-0087).
//
// The gate itself (tools/build-release-assets.mjs) shells out to `npm pack`
// and the OS archiver, so what runs here is the half that decides — listing
// normalization, the dist-parity rule, and the shared "what does package.json
// advertise" derivation the F84 tarball gate uses too. The 19.8 discipline:
// a gate whose logic is untested is the next blind spot (ADR-0064, ADR-0082).
import { describe, expect, it } from 'vitest';
import {
  distParity,
  normalizeArchiveEntries,
} from '../../../../../../tools/release-assets-core.mjs';
import {
  advertisedPaths,
  exportsTargets,
  normalizePath,
} from '../../../../../../tools/advertised-paths.mjs';

describe('normalizeArchiveEntries', () => {
  const ROOT = 'egl-utils-js-1.4.0';

  it('strips the version-stamped root and drops directory entries', () => {
    const listing = [
      `${ROOT}/`,
      `${ROOT}/LICENSE`,
      `${ROOT}/dist/`,
      `${ROOT}/dist/esm/`,
      `${ROOT}/dist/esm/index.js`,
      `${ROOT}/dist/global/egl-utils.global.js`,
      '',
    ].join('\n');
    expect(normalizeArchiveEntries(listing, ROOT)).toEqual({
      files: ['LICENSE', 'dist/esm/index.js', 'dist/global/egl-utils.global.js'],
      strays: [],
    });
  });

  it('tolerates CRLF line endings without mangling names', () => {
    const listing = `${ROOT}/dist/esm/index.js\r\n${ROOT}/LICENSE\r\n`;
    expect(normalizeArchiveEntries(listing, ROOT).files).toEqual(['dist/esm/index.js', 'LICENSE']);
  });

  it('reports an entry outside the root as a stray, never as a file', () => {
    const listing = [`${ROOT}/dist/esm/index.js`, 'stray.txt', 'other-root/dist/x.js'].join('\n');
    expect(normalizeArchiveEntries(listing, ROOT)).toEqual({
      files: ['dist/esm/index.js'],
      strays: ['stray.txt', 'other-root/dist/x.js'],
    });
  });

  it('does not mistake a sibling with the root as a name prefix for the root', () => {
    // `egl-utils-js-1.4.0-dist.zip` inside the archive would be a stray, not a
    // member of `egl-utils-js-1.4.0/` — the prefix check includes the slash.
    const listing = `${ROOT}-dist.zip\n${ROOT}/LICENSE\n`;
    expect(normalizeArchiveEntries(listing, ROOT)).toEqual({
      files: ['LICENSE'],
      strays: [`${ROOT}-dist.zip`],
    });
  });
});

describe('distParity', () => {
  it('holds when both archives ship the same dist/** set', () => {
    const dist = ['dist/esm/index.js', 'dist/cjs/index.cjs', 'dist/global/egl-utils.global.js'];
    expect(distParity([...dist, 'LICENSE'], [...dist, 'package.json', 'README.md'])).toEqual({
      missingFromZip: [],
      extraInZip: [],
    });
  });

  it('names what the zip is missing, sorted', () => {
    const tarball = ['dist/b.js', 'dist/a.js', 'dist/c.js'];
    expect(distParity(['dist/c.js'], tarball).missingFromZip).toEqual(['dist/a.js', 'dist/b.js']);
  });

  it('names what the zip has that the tarball does not', () => {
    expect(distParity(['dist/stale-chunk.js', 'dist/a.js'], ['dist/a.js']).extraInZip).toEqual([
      'dist/stale-chunk.js',
    ]);
  });

  it('ignores non-dist entries on both sides — each archive owns its own extras', () => {
    expect(distParity(['LICENSE'], ['package.json', 'README.md'])).toEqual({
      missingFromZip: [],
      extraInZip: [],
    });
  });
});

describe('advertisedPaths', () => {
  const pkg = {
    unpkg: './dist/global/egl-utils.global.js',
    jsdelivr: './dist/global/egl-utils.global.js',
    exports: {
      '.': { import: './dist/esm/index.js', require: './dist/cjs/index.cjs' },
      './text': { import: './dist/esm/text.js', require: './dist/cjs/text.cjs' },
      './package.json': './package.json',
    },
  };

  it('pairs every advertised path with the field that advertises it', () => {
    const pairs = advertisedPaths(pkg);
    expect(pairs).toContainEqual({
      path: 'dist/global/egl-utils.global.js',
      advertisedBy: '`unpkg`',
    });
    expect(pairs).toContainEqual({
      path: 'dist/global/egl-utils.global.js.map',
      advertisedBy: "the artifact's `sourceMappingURL`",
    });
    expect(pairs).toContainEqual({
      path: 'dist/global/egl-utils.global.js',
      advertisedBy: '`jsdelivr`',
    });
    expect(pairs).toContainEqual({ path: 'dist/esm/text.js', advertisedBy: '`exports`' });
    expect(pairs).toContainEqual({ path: 'package.json', advertisedBy: '`exports`' });
  });

  it('normalizes the ./ prefix everywhere — a tarball has no such path', () => {
    for (const { path } of advertisedPaths(pkg)) expect(path.startsWith('./')).toBe(false);
  });

  it('omits the CDN pairs when the fields are absent, instead of inventing paths', () => {
    const pairs = advertisedPaths({ exports: { '.': './dist/esm/index.js' } });
    expect(pairs).toEqual([{ path: 'dist/esm/index.js', advertisedBy: '`exports`' }]);
  });
});

describe('exportsTargets', () => {
  it('collects string leaves through arbitrarily nested condition objects', () => {
    expect(
      exportsTargets({ '.': { node: { import: './a.js' }, default: './b.js' } }).sort(),
    ).toEqual(['./a.js', './b.js']);
  });

  it('returns nothing for null and non-object nodes', () => {
    expect(exportsTargets(null)).toEqual([]);
    expect(exportsTargets(undefined)).toEqual([]);
    expect(exportsTargets(42)).toEqual([]);
  });
});

describe('normalizePath', () => {
  it('strips exactly one leading ./ and nothing else', () => {
    expect(normalizePath('./dist/a.js')).toBe('dist/a.js');
    expect(normalizePath('dist/./a.js')).toBe('dist/./a.js');
    expect(normalizePath('dist/a.js')).toBe('dist/a.js');
  });
});
