// NFR-06 gate: the root entry must ship zero runtime dependencies (DOMPurify is
// a peer dependency on the /sanitize subpath only, never a `dependencies` entry).
// A misconfigured budget that silently passes is false security, so this fails
// loudly on any `dependencies` key.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});

if (deps.length > 0) {
  console.error(
    `NFR-06 violated: the root entry must have zero runtime dependencies, found: ${deps.join(', ')}`,
  );
  process.exit(1);
}

console.log('NFR-06 OK: zero runtime dependencies');
