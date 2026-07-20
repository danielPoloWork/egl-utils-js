import { describe, it, expect } from 'vitest';
import { VERSION } from '../../../../../main/javascript/it/d4np/utils/version.js';
import pkg from '../../../../../../package.json';

describe('version constant', () => {
  it('is in lockstep with package.json (consistency_lint version-lockstep)', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('is a plain X.Y.Z SemVer string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
