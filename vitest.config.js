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
      // NFR-03 target is >= 95% lines/branches. The hard threshold becomes a
      // CI gate once real modules land (roadmap 2.6); at 1.2 the source is
      // JSDoc-only entry stubs, so the gate is wired but not yet enforced.
      reportsDirectory: './coverage',
    },
  },
});
