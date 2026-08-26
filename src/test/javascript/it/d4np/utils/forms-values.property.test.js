// @vitest-environment jsdom
// Property suites (roadmap 21.1, spec 08 §6) for form value binding.
//
// The invariant spec 08 asks for is the round trip: `setValues(v)` then
// `getValues()` returns `v`, for every value the contract admits. It is the
// assertion that catches a coercion asymmetry no example test will — a read that
// says `false` where the write took `'off'`, or a group whose shape changes with
// its size — because it exercises the two halves against each other rather than
// against one hand-written expectation.
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createForm } from '../../../../../main/javascript/it/d4np/utils/forms.js';

/** @type {Element} */
let root;

beforeEach(() => {
  document.body.innerHTML = `
    <form id="root">
      <input name="text" />
      <textarea name="notes"></textarea>
      <input name="quantity" type="number" />
      <input name="flag" type="checkbox" />
      <input name="tier" type="radio" value="free" />
      <input name="tier" type="radio" value="pro" />
      <input name="tags" type="checkbox" value="a" />
      <input name="tags" type="checkbox" value="b" />
      <input name="tags" type="checkbox" value="c" />
      <select name="country"><option value="it">it</option><option value="fr">fr</option></select>
      <select name="langs" multiple>
        <option value="en">en</option><option value="de">de</option><option value="es">es</option>
      </select>
    </form>
  `;
  root = /** @type {Element} */ (document.getElementById('root'));
});

/**
 * A canonical value per field — the shapes `getValues` returns, which are the
 * shapes the round trip is claimed for.
 *
 * `text` and `notes` exclude CR and LF deliberately: the platform's own value
 * sanitization strips them from an `<input>`, so a newline would fail the round
 * trip against HTML rather than against this library.
 */
const line = fc.string({ maxLength: 12 }).filter((s) => !/[\r\n]/.test(s));

const values = fc.record({
  text: line,
  notes: line,
  quantity: fc.oneof(fc.integer({ min: -999, max: 999 }), fc.constant(null)),
  flag: fc.boolean(),
  tier: fc.constantFrom('free', 'pro', null),
  tags: fc.uniqueArray(fc.constantFrom('a', 'b', 'c'), { maxLength: 3 }),
  country: fc.constantFrom('it', 'fr'),
  langs: fc.uniqueArray(fc.constantFrom('en', 'de', 'es'), { maxLength: 3 }),
});

/**
 * Field order is the DOM's, so a set-valued field reads back in document order
 * whatever order it was written in. Comparing sets rather than arrays would hide
 * a real bug; sorting the expectation the same way the DOM does is the honest
 * normalisation.
 *
 * @param {Record<string, any>} v
 * @returns {Record<string, any>}
 */
function inDocumentOrder(v) {
  const order = { tags: ['a', 'b', 'c'], langs: ['en', 'de', 'es'] };
  return {
    ...v,
    tags: order.tags.filter((entry) => v.tags.includes(entry)),
    langs: order.langs.filter((entry) => v.langs.includes(entry)),
  };
}

describe('the round trip', () => {
  it('reads back exactly what was written, for every shape the contract admits', () => {
    fc.assert(
      fc.property(values, (written) => {
        const form = createForm(root);
        form.setValues(written);
        expect(form.getValues()).toEqual(inDocumentOrder(written));
      }),
      { numRuns: 200 },
    );
  });

  it('is idempotent: writing the same values twice changes nothing', () => {
    fc.assert(
      fc.property(values, (written) => {
        const form = createForm(root);
        form.setValues(written);
        const once = form.getValues();
        form.setValues(written);
        expect(form.getValues()).toEqual(once);
      }),
      { numRuns: 100 },
    );
  });
});

describe('a partial write is partial', () => {
  it('leaves every field it does not name untouched', () => {
    fc.assert(
      fc.property(
        values,
        fc.uniqueArray(fc.constantFrom('text', 'flag', 'tier', 'tags'), {
          minLength: 1,
          maxLength: 4,
        }),
        (written, subset) => {
          const form = createForm(root);
          form.setValues(written);
          const before = form.getValues();

          const partial = Object.fromEntries(subset.map((name) => [name, before[name]]));
          form.setValues(partial);
          expect(form.getValues()).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('reset returns to the baseline, whatever happened in between', () => {
  it('restores the baseline from any reachable state', () => {
    fc.assert(
      fc.property(values, values, (loaded, edited) => {
        const form = createForm(root);
        form.setValues(loaded);
        form.setBaseline();
        const clean = form.getValues();

        form.setValues(edited);
        form.reset();
        expect(form.getValues()).toEqual(clean);
      }),
      { numRuns: 150 },
    );
  });
});

describe('FormData carries what the controls hold', () => {
  it('never invents an entry for an unchecked box, and never drops a checked one', () => {
    fc.assert(
      fc.property(values, (written) => {
        const form = createForm(root);
        form.setValues(written);
        const data = form.toFormData();

        expect(data.getAll('tags')).toEqual(inDocumentOrder(written).tags);
        expect(data.getAll('flag')).toEqual(written.flag ? ['on'] : []);
        expect(data.getAll('tier')).toEqual(written.tier === null ? [] : [written.tier]);
        // Present-and-empty is a state FormData can express and `getValues`
        // cannot: an empty number reads as `null` and serializes as `''`.
        expect(data.getAll('quantity')).toEqual([
          written.quantity === null ? '' : String(written.quantity),
        ]);
      }),
      { numRuns: 150 },
    );
  });
});
