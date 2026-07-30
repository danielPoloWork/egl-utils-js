// Minimal static file server for the Playwright browser smoke suite (roadmap
// 6.4). Test-only tooling, never shipped (`files` in package.json is `dist`).
//
// Written by hand rather than adding a server dependency: the browser suite
// needs exactly two things from an HTTP origin — the built `dist/` bundles and
// DOMPurify's browser ESM build from `node_modules` — and a real origin (not
// `file://`) so `localStorage` and `document.cookie` behave as they do in
// production.
import { createReadStream, statSync } from 'node:fs';
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

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  // Resolve inside ROOT only: a `..` traversal must not escape the repo.
  const candidate = join(ROOT, normalize(url.pathname));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  let filePath = candidate;
  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }

  let size;
  try {
    size = statSync(filePath).size;
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
    'content-length': size,
    // Never let a stale bundle satisfy a test run.
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(PORT, () => {
  console.log(`static-server: serving ${ROOT} on http://localhost:${PORT}`);
});
