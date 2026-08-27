/**
 * egl-utils-js/bootstrap — Bootstrap's names for the F120 feedback slots.
 *
 * **Frozen data, and deliberately not a function.** ADR-0038's costume shape is
 * "a frozen constant plus a thin call", and 21.3 measured the thin call: a
 * `bsFormFeedback` wrapper on this entry drags the whole renderer in with it and
 * takes `/bootstrap` to 25 987 B — **987 B over** ADR-0041's 25 kB clause. The
 * constant alone costs 137 B and leaves 368 B. So the composition happens at the
 * call site, one spread wide, exactly as `bootstrapIconsSet` is composed into
 * `bsIcon` (ADR-0079).
 *
 * ```js
 * import { bindFormFeedback } from 'egl-utils-js/forms';
 * import { BOOTSTRAP_FEEDBACK_CLASSES } from 'egl-utils-js/bootstrap';
 *
 * bindFormFeedback(validator, { classes: BOOTSTRAP_FEEDBACK_CLASSES });
 * ```
 *
 * @module egl-utils-js/bootstrap
 */

/**
 * Bootstrap 5's validation vocabulary, in the shape `bindFormFeedback`
 * (`egl-utils-js/forms`) expects — read from its own `scss/forms/_validation.scss`
 * rather than remembered. Not a `{@link}`: the two live on different entries, and
 * TypeDoc resolves links within one.
 *
 * Two slots are worth explaining, because both look like omissions and are not.
 *
 * **`controlValid` is empty on purpose.** Bootstrap styles a valid control green
 * through `.was-validated .form-control:valid`, and `:valid` reflects the
 * *native* constraint state — which, since F119 pushes every rule error back
 * through `setCustomValidity`, already tracks this library's engine. Adding
 * `is-valid` on top would apply the same styling twice and, worse, would apply it
 * to a control the engine has not looked at.
 *
 * **`note` is `form-text`, not a validation class.** Bootstrap has no vocabulary
 * for a warning: `.invalid-feedback` is hidden unless a sibling is `:invalid`, so
 * rendering a warning there would hide it. `form-text` is Bootstrap's own class
 * for always-visible helper text under a control, which is precisely what a
 * non-blocking finding is.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BOOTSTRAP_FEEDBACK_CLASSES = /* @__PURE__ */ Object.freeze({
  validated: 'was-validated',
  controlInvalid: 'is-invalid',
  controlValid: '',
  invalid: 'invalid-feedback',
  valid: 'valid-feedback',
  note: 'form-text',
  error: '',
  warning: 'text-warning',
  info: 'text-body-secondary',
});
