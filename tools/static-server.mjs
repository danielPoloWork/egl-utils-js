// Minimal static file server for the Playwright browser smoke suite (roadmap
// 6.4). Test-only tooling, never shipped (`files` in package.json is `dist`).
//
// Written by hand rather than adding a server dependency: the browser suite
// needs exactly two things from an HTTP origin — the built `dist/` bundles and
// DOMPurify's browser ESM build from `node_modules` — and a real origin (not
// `file://`) so `localStorage` and `document.cookie` behave as they do in
// production.
//
// Responses are served from memory (roadmap 20.7, ADR-0076). Every test in the
// suite loads a fixture that imports eleven ESM entries, and the Bootstrap
// specs add a 227 kB stylesheet and an 79 kB bundle on top — so the hot set is
// a few hundred kilobytes asked for thousands of times, and re-reading it from
// disk per request bought nothing. Measured against the previous
// stat-stat-stream shape, 140 concurrent fixture loads on an idle machine:
// 1.8 s -> 1.1 s wall, p50 97 ms -> 32 ms. p95 does not move (~195 ms either
// way) — the tail is connection setup, not file I/O, which is the honest limit
// of this change. It is NOT what made the suite flaky either; the worker count
// was (ADR-0076). It is here because a server that wants less CPU takes less of
// it from the engines under test: under the ten-worker runs that flaked, the
// same 140 loads degraded to 8.8 s wall and a 1.4 s p95, the server starving
// alongside everything else.
//
// The cache is validated, not blind: `reuseExistingServer` means a developer's
// server outlives a rebuild, so a stale `dist/` served from memory would be a
// worse failure than the one this replaces. One `statSync` per request decides
// whether the cached bytes are still the file's bytes.
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 4173);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/**
 * Path -> the bytes last read for it, with the identity they were read at.
 *
 * @type {Map<string, { mtimeMs: number, size: number, body: Buffer, type: string }>}
 */
const cache = new Map();

/**
 * The file's current bytes, from memory when the file has not changed underneath
 * us and from disk when it has.
 *
 * @param {string} filePath - An already-resolved path inside {@link ROOT}.
 * @param {import('node:fs').Stats} stats - The stat this request already took.
 * @returns {{ body: Buffer, type: string }}
 */
function bodyFor(filePath, stats) {
  const cached = cache.get(filePath);
  if (cached !== undefined && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return cached;
  }
  const entry = {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    body: readFileSync(filePath),
    type: CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
  };
  cache.set(filePath, entry);
  return entry;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  // Resolve inside ROOT only: a `..` traversal must not escape the repo.
  const candidate = join(ROOT, normalize(url.pathname));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  let filePath = candidate;
  let stats;
  try {
    stats = statSync(filePath);
    if (stats.isDirectory()) {
      filePath = join(filePath, 'index.html');
      stats = statSync(filePath);
    }
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }

  const { body, type } = bodyFor(filePath, stats);
  response.writeHead(200, {
    'content-type': type,
    'content-length': body.byteLength,
    // Never let a stale bundle satisfy a test run.
    'cache-control': 'no-store',
  });
  response.end(body);
});

server.listen(PORT, () => {
  console.log(`static-server: serving ${ROOT} on http://localhost:${PORT}`);
});
