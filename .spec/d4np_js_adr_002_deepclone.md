# ADR-002: `deepClone` — wrap native `structuredClone`, don't reimplement

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-14 |
| **Related spec** | [d4np-js.md](../d4np-js.md) (§1.1, §2 item 9) |

## Context
v1 specified a custom deep-clone implementation handling "dates, regexes, and circular references" — without mentioning that the platform now ships exactly that: `structuredClone` is available in Node ≥ 17 and all baseline browsers (§1.1 sets Node ≥ 18 / Safari ≥ 15.4), and it natively covers Dates, RegExps, Maps, Sets, TypedArrays, and cycles. Reimplementing it means re-owning a long tail of correctness bugs (property descriptors, exotic objects) that the platform already solved, for consumers who overwhelmingly have the native API.

## Options considered

**A. Thin wrapper over `structuredClone` with typed errors** *(chosen)*
- ✅ Platform-grade correctness for the exact edge cases v1 listed, at ~0 bytes of algorithm code (NFR-01 friendly).
- ✅ The wrapper adds the part the platform does badly: **diagnostics**. Native `structuredClone` throws an opaque `DataCloneError`; `deepClone` pre-walks on failure to raise `CloneError` naming the offending path (`"config.handlers[2] is a function — structuredClone does not support functions"`).
- ❌ Cannot clone functions, DOM nodes, or class instances' prototypes (structured-clone semantics: own enumerable data only, prototype lost). **Documented as contract, not bug** — v1's custom clone would have faced the same decisions, just implicitly.

**B. Custom recursive implementation (v1's implied path)**
- ✅ Freedom to define class-instance/prototype semantics.
- ❌ Re-owns cycles, exotic types, transferables, and performance forever; every divergence from structured-clone semantics becomes a surprise for users who know the platform API; bundle cost against NFR-01.

**C. Depend on lodash.clonedeep**
- ✅ Battle-tested.
- ❌ Violates the zero-runtime-dependency rule (NFR-06) and imports different (prototype-preserving) semantics wholesale — a bigger contract than needed.

## Decision
**Option A.** `deepClone(obj)` = `structuredClone(obj)` with a diagnostic pre-walk on `DataCloneError`, raising `CloneError{path, valueType}`. Prototype loss and function/DOM-node rejection are documented in the signature's JSDoc and the §3 contract table. No option to clone functions will be added — callers with class instances get a documented recipe (`Object.assign(Object.create(proto), deepClone(data))`).

## Consequences
- Correctness rides the platform (including future structured-clone improvements); the library's test surface is the wrapper diagnostics, not clone semantics.
- The documented Node ≥ 18 baseline becomes load-bearing for this API — dropping it would reopen this ADR.
- Bundle cost of item 9 is effectively the error-path walker only (~0.3 kB), protecting NFR-01.
