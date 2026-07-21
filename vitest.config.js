import { defineConfig } from 'vitest/config';

// Test runner config. Tests live under the Maven-style cross-language tree
// (src/test/... mirrors src/main/...), not a top-level tests/ dir.
export default defineConfig({
  test: {
    include: ['src/test/javascript/it/d4np/utils/**/*.test.js'],
    // Leak/handle detection — the profile's "sanitizer" equivalent for a
    // single-threaded runtime (vitest --detectOpenHandles equivalent).
    dangerouslyIgnoreUnhandledErrors: false,
    coverage: {
      provider: 'v8',
      // Measure only the library source, never tests or config.
      include: ['src/main/javascript/it/d4np/utils/**/*.js'],
      reporter: ['text', 'html', 'lcov'],
      // NFR-03 hard gate (enforced since roadmap 2.6, deferred from 1.2 while
      // the source was stub-only): `vitest run --coverage` fails below these.
      // The CI build matrix runs `pnpm coverage`, so every Node cell enforces it.
      thresholds: {
        lines: 95,
        branches: 95,
      },
      reportsDirectory: './coverage',
    },
  },
});
