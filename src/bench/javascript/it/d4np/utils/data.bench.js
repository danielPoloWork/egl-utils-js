import { bench, describe } from 'vitest';
import lodash from 'lodash';
import {
  deepClone,
  deepMerge,
  pick,
  omit,
  groupBy,
  uniq,
} from '../../../../../main/javascript/it/d4np/utils/index.js';
import {
  NESTED_OBJECT,
  MERGE_SOURCE,
  ARRAY_FREE_TARGET,
  ARRAY_FREE_SOURCE,
  WIDE_OBJECT,
  PICK_KEYS,
  RECORDS,
  DUPLICATED_NUMBERS,
} from './fixtures.js';

// NFR-04 parity benchmarks for the data group against pinned lodash
// (roadmap 7.1). Methodology is ADR-0013; the short version is that each
// comparison is against the lodash USAGE that achieves the same result, not
// merely the lodash function with the same name — and where the semantics
// cannot be made equivalent, the difference is disclosed instead of hidden.

describe('deepClone vs lodash.cloneDeep', () => {
  // Fair on this input by construction: NESTED_OBJECT contains nothing that
  // only one of the two can clone. Note the mechanisms differ — ours delegates
  // to native structuredClone (and supports cycles, Map/Set, typed arrays),
  // lodash walks in JS. Different capability sets, comparable on the overlap.
  bench('egl deepClone', () => {
    deepClone(NESTED_OBJECT);
  });

  bench('lodash cloneDeep', () => {
    lodash.cloneDeep(NESTED_OBJECT);
  });
});

describe('deepMerge vs lodash.merge — array-free input (the like-for-like number)', () => {
  // THE NFR-04 COMPARISON FOR MERGE. Two adjustments make it honest:
  //
  //  1. lodash.merge MUTATES its target; ours returns a new object and never
  //     mutates. The baseline is therefore the lodash NON-MUTATING idiom,
  //     `merge({}, a, b)` — comparing against the mutating call would credit
  //     lodash for allocation it never does.
  //  2. The input contains NO ARRAYS. Ours replaces arrays wholesale while
  //     lodash merges them element-wise, so an array in the input makes the two
  //     perform different amounts of work and the ratio stops measuring speed.
  bench('egl deepMerge (returns a new object)', () => {
    deepMerge(ARRAY_FREE_TARGET, ARRAY_FREE_SOURCE);
  });

  bench('lodash merge({}, a, b) (non-mutating idiom)', () => {
    lodash.merge({}, ARRAY_FREE_TARGET, ARRAY_FREE_SOURCE);
  });
});

describe('deepMerge vs lodash.merge — array-heavy input (NOT a parity claim)', () => {
  // Kept because array-bearing input is realistic, but the ratio here is
  // dominated by a SEMANTIC difference, not by efficiency: ours replaces the
  // 40-element `items` array, lodash deep-merges it element by element. The
  // resulting number (two orders of magnitude) must never be quoted as a
  // performance claim — it is the cost of doing different work, and it is
  // recorded only so the regression gate (roadmap 7.2) can watch our side.
  bench('egl deepMerge (replaces arrays)', () => {
    deepMerge(NESTED_OBJECT, MERGE_SOURCE);
  });

  bench('lodash merge (merges arrays element-wise)', () => {
    lodash.merge({}, NESTED_OBJECT, MERGE_SOURCE);
  });
});

describe('pick vs lodash.pick', () => {
  bench('egl pick', () => {
    pick(WIDE_OBJECT, PICK_KEYS);
  });

  bench('lodash pick', () => {
    lodash.pick(WIDE_OBJECT, PICK_KEYS);
  });
});

describe('omit vs lodash.omit', () => {
  // DISCLOSURE: lodash.omit accepts deep paths and clones more aggressively;
  // ours is an own-enumerable-key filter. Any win here is partly a difference
  // in feature surface, not purely in efficiency.
  bench('egl omit', () => {
    omit(WIDE_OBJECT, PICK_KEYS);
  });

  bench('lodash omit', () => {
    lodash.omit(WIDE_OBJECT, PICK_KEYS);
  });
});

describe('groupBy vs lodash.groupBy', () => {
  // DISCLOSURE: ours returns a Map, lodash a plain object. That was a
  // deliberate safety choice (an arbitrary key such as '__proto__' is just a
  // key in a Map), and Map.set has a different cost profile from property
  // assignment. The comparison is still the one a caller faces when choosing.
  bench('egl groupBy (-> Map)', () => {
    groupBy(RECORDS, (record) => record.group);
  });

  bench('lodash groupBy (-> object)', () => {
    lodash.groupBy(RECORDS, (record) => record.group);
  });
});

describe('uniq vs lodash.uniq', () => {
  bench('egl uniq', () => {
    uniq(DUPLICATED_NUMBERS);
  });

  bench('lodash uniq', () => {
    lodash.uniq(DUPLICATED_NUMBERS);
  });
});

describe('uniq with iteratee vs lodash.uniqBy', () => {
  // Ours folds the iteratee into `uniq`; lodash splits it into `uniqBy`. The
  // like-for-like baseline is therefore uniqBy, not uniq.
  bench('egl uniq(array, iteratee)', () => {
    uniq(RECORDS, (record) => record.group);
  });

  bench('lodash uniqBy', () => {
    lodash.uniqBy(RECORDS, (record) => record.group);
  });
});
