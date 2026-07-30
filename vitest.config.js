import { defineConfig } from 'vitest/config';

// Test runner config. Tests live under the Maven-style cross-language tree
// (src/test/... mirrors src/main/...), not a top-level tests/ dir.
export default defineConfig({
  test: {
    include: ['src/test/javascript/it/d4np/utils/**/*.test.js'],
    // The heaviest property suites (validateEmail totality over 400-char
    // binary strings, hashString's real-subtle.digest oracle) run ~1 s each
    // in isolation but share a worker pool with the whole suite; under v8
    // coverage instrumentation plus that contention the default 5 s window is
    // too tight and flakes. 20 s is headroom for a growing suite, not slack
    // for slow code — the ReDoS/timing gate (NFR-05) lives separately and
    // un-instrumented in *.redos.test.js.
    testTimeout: 20_000,
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
