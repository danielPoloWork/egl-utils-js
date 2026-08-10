// @vitest-environment jsdom
// Contract tests (roadmap 17.8, ADR-0048) for the option and method vocabulary
// v1.0.0 freezes.
//
// These are not behaviour tests — the behaviour is covered where each component
// lives. They pin the *words*, which is the thing a major boundary makes
// permanent: one meaning per name, and the old spelling rejected loudly rather
// than accepted quietly.
import { describe, expect, it } from 'vitest';

import * as bootstrap from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';
import { inlineAlert } from '../../../../../main/javascript/it/d4np/utils/dom.js';

/** @returns {Element} */
function host() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

describe('`ariaLabel` is the accessible name; `label` is what the user sees', () => {
  it.each([
    ['bsIcon', () => bootstrap.bsIcon('gear', { ariaLabel: 'Settings' })],
    ['bsButtonGroup', () => bootstrap.bsButtonGroup([host()], { ariaLabel: 'Alignment' })],
    ['bsCloseButton', () => bootstrap.bsCloseButton({ ariaLabel: 'Chiudi' })],
    ['bsSpinner', () => bootstrap.bsSpinner({ ariaLabel: 'Caricamento' })],
    ['bsProgress', () => bootstrap.bsProgress({ ariaLabel: 'Upload' })],
    ['bsBreadcrumb', () => bootstrap.bsBreadcrumb(['Home'], { ariaLabel: 'Percorso' })],
  ])('%s takes ariaLabel', (_name, act) => {
    expect(act).not.toThrow();
  });

  it.each([
    ['bsIcon', () => bootstrap.bsIcon('gear', { label: 'Settings' })],
    ['bsButtonGroup', () => bootstrap.bsButtonGroup([host()], { label: 'Alignment' })],
    ['bsCloseButton', () => bootstrap.bsCloseButton({ label: 'Chiudi' })],
    ['bsSpinner', () => bootstrap.bsSpinner({ label: 'Caricamento' })],
    ['bsProgress', () => bootstrap.bsProgress({ label: 'Upload' })],
    ['bsBreadcrumb', () => bootstrap.bsBreadcrumb(['Home'], { label: 'Percorso' })],
  ])('%s rejects the old `label` spelling rather than ignoring it', (_name, act) => {
    // The rename is only safe because ADR-0047 landed first: without it, every
    // one of these would silently fall back to the default name.
    expect(act).toThrow(/unknown option 'label'/);
  });

  it('keeps `label` where it is visible text, beside `ariaLabel` for the name', () => {
    const button = bootstrap.bsButton({ label: 'Save' });
    expect(button.textContent).toBe('Save');
    expect(button.hasAttribute('aria-label')).toBe(false);

    const iconOnly = bootstrap.bsButton({ icon: 'x-lg', ariaLabel: 'Dismiss' });
    expect(iconOnly.getAttribute('aria-label')).toBe('Dismiss');
    expect(iconOnly.textContent).toBe('');
  });

  it('keeps a column `label` as the visible header', () => {
    const { table } = bootstrap.bsTable(host(), {
      columns: [{ key: 'host', label: 'Host name' }],
      data: [{ host: 'a' }],
    });
    expect(table.querySelector('th')?.textContent).toBe('Host name');
  });

  it('keeps `<part>Label` for a named sub-part, where nothing visible competes', () => {
    // `.btn-close` draws its glyph in CSS, so a toast's close control has no
    // visible text for `closeLabel` to be confused with (ADR-0048).
    const toasts = bootstrap.bsToast(host(), { closeLabel: 'Chiudi', bootstrap: {} });
    expect(toasts).toHaveProperty('show');
  });
});

describe('one auto-dismiss vocabulary: autoHideMs', () => {
  it('is the same word on the engine and on its Bootstrap costume', () => {
    expect(() => inlineAlert(host(), { autoHideMs: 3000 })).not.toThrow();
    expect(() => bootstrap.bsAlert(host(), { autoHideMs: 3000 })).not.toThrow();
    expect(() => bootstrap.bsToast(host(), { autoHideMs: 3000 })).not.toThrow();
  });

  it("rejects Bootstrap's own `{autohide, delay}` pair on the wrapper", () => {
    // The pair still exists — inside the config handed to Bootstrap's
    // constructor, which is the only place that vocabulary belongs.
    expect(() => bootstrap.bsToast(host(), { autohide: false })).toThrow(
      /unknown option 'autohide'/,
    );
    expect(() => bootstrap.bsToast(host(), { delay: 2000 })).toThrow(/unknown option 'delay'/);
  });

  it('reads `false` as "until dismissed", the absence inlineAlert already meant', () => {
    expect(() => bootstrap.bsToast(host(), { autoHideMs: false })).not.toThrow();
  });
});

describe('`set<Noun>` takes new state; a bare `update()` recomputes', () => {
  it('names the data setters for what they set', () => {
    const list = bootstrap.bsListGroup(['A']);
    const progress = bootstrap.bsProgress();
    const pager = bootstrap.bsPagination(host(), { onPageChange: () => {} });

    expect(typeof list.setData).toBe('function');
    expect(typeof progress.setValue).toBe('function');
    expect(typeof pager.setView).toBe('function');

    // And the word that used to mean all three is gone from them, so a stale
    // call fails at the call rather than silently doing nothing.
    expect(list).not.toHaveProperty('update');
    expect(progress).not.toHaveProperty('update');
    expect(pager).not.toHaveProperty('update');
  });

  it('leaves the vendor its own name for a no-argument recompute', () => {
    // Bootstrap and Popper both call it `update`, and Bootstrap's ScrollSpy calls
    // its own `refresh`. A wrapper that renamed either would make the vendor's
    // documentation wrong about our surface.
    const tooltip = bootstrap.bsTooltip(host(), { bootstrap: {} });
    const spy = bootstrap.bsScrollspy(host(), { bootstrap: {} });
    expect(typeof tooltip.update).toBe('function');
    expect(typeof spy.refresh).toBe('function');
  });
});

describe('callbacks are `on<Event>`, and the event argument comes last', () => {
  it('names the pagination callback for the event, not the noun', () => {
    expect(() => bootstrap.bsPagination(host(), { onPageChange: () => {} })).not.toThrow();
    expect(() => bootstrap.bsPagination(host(), { onPage: () => {} })).toThrow(
      /unknown option 'onPage'/,
    );
  });

  it('passes data first and the event last on a data-carrying callback', () => {
    /** @type {unknown[]} */
    let received = [];
    const list = bootstrap.bsListGroup([{ content: 'A', value: 1 }], {
      onSelect: (...args) => {
        received = args;
      },
    });
    host().append(list.element);
    /** @type {HTMLElement} */ (list.element.querySelector('button'))?.click();

    expect(received).toHaveLength(3);
    expect(received[0]).toMatchObject({ content: 'A' });
    expect(received[1]).toBe(0);
    expect(received[2]).toBeInstanceOf(Event);
  });
});
