/**
 * egl-utils-js — the instance lifecycle contract (ADR-0049).
 *
 * Every component in this library returns an instance that owns something —
 * listeners, a Bootstrap object, a timer, a node — and every one of them ends
 * the same way: `destroy()`. What happens to the *rest* of the instance after
 * that is the part a 1.0 has to fix, because it is the part a caller reaches by
 * accident, from a callback that outlived the component or a cleanup path that
 * ran twice.
 *
 * Three rules, in the shape of command–query separation:
 *
 * 1. **A command throws.** Anything that would act — `show`, `hide`, `setData`,
 *    `on`, `instance`, `refresh` — raises a `TypeError` naming the API and the
 *    method. Silently doing nothing is the failure this library refuses
 *    elsewhere (ADR-0028): the caller believes the UI moved.
 * 2. **A query answers.** `isShown()` on a destroyed component is `false`, which
 *    is true rather than merely convenient. Throwing there would make a caller
 *    guard a question that already has an answer.
 * 3. **`destroy()` is idempotent.** It is the one method cleanup code calls
 *    without knowing the state, so it must never punish being called twice.
 *
 * A state violation stays a plain `TypeError` and takes no `EGL_*` code: the
 * taxonomy is for operational failures a caller branches on, and using a
 * destroyed component is a programming error, like every other argument
 * violation in this library (ADR-0003, ADR-0047). Adding a code later would be
 * a MINOR, so the door is open if a real lifecycle race ever needs one.
 *
 * @module egl-utils-js
 */

/**
 * Guard a command on an instance that may have been destroyed.
 *
 * One helper rather than a throw per method, so all fifteen instance shapes
 * report the same sentence — three different ones existed before this
 * (`this wrapper has been destroyed`, `this manager has been destroyed`, and
 * the method-naming form kept here, which is the only one that tells the reader
 * *which* call was too late).
 *
 * @param {boolean} destroyed - Whether `destroy()` has run.
 * @param {string} api - Public function name (`'bsModal'`, `'bsToast.add'`).
 * @param {string} method - The command being refused, without parentheses.
 * @returns {void}
 * @throws {TypeError} When `destroyed`.
 */
export function assertAlive(destroyed, api, method) {
  if (destroyed) {
    throw new TypeError(`${api}: ${method}() was called after destroy()`);
  }
}
