import { describe, it, expect } from 'vitest';

// Smoke test (roadmap 1.2): proves the test framework runs and the four
// exports-map entry modules (ADR-001) are importable. Behavioral suites
// arrive per module group with their own milestones (errors/async M2,
// data/validation M3, events M4, web/crypto M5).
describe('package entry points', () => {
  it('imports the root entry without throwing', async () => {
    const mod = await import('../../../../../main/javascript/it/d4np/utils/index.js');
    expect(mod).toBeTypeOf('object');
  });

  it('imports the errors entry without throwing', async () => {
    const mod = await import('../../../../../main/javascript/it/d4np/utils/errors.js');
    expect(mod).toBeTypeOf('object');
  });

  it('imports the storage entry without throwing', async () => {
    const mod = await import('../../../../../main/javascript/it/d4np/utils/storage.js');
    expect(mod).toBeTypeOf('object');
  });

  it('imports the sanitize entry without throwing', async () => {
    const mod = await import('../../../../../main/javascript/it/d4np/utils/sanitize.js');
    expect(mod).toBeTypeOf('object');
  });
});
