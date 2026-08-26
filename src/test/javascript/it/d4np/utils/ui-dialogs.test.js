// @vitest-environment jsdom
// Tests for the promise-based dialogs (roadmap 20.1, spec 07 §2 items F101-F103,
// NFR-31/NFR-35/NFR-36, ADR-0071).
//
// Four properties carry the weight, and they are the four spec 07 §6 names:
// every settlement path resolves with the right answer, a dismissal is never a
// rejection, **exactly one** settlement survives any race — asserted by counting
// rather than by looking at the value, because a double-resolve is invisible from
// the value — and focus goes back where it came from.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDialogs } from '../../../../../main/javascript/it/d4np/utils/ui.js';

/**
 * A stand-in for Bootstrap's namespace.
 *
 * It dispatches the real lifecycle events, because those are the contract the
 * wrappers are written against: `hidden.bs.modal` is what settles a dialog, and a
 * double that only recorded calls would leave every settlement path untested.
 *
 * @param {{ async?: boolean }} [config] - With `async`, transitions settle on a
 *   later turn, as an animated one does.
 * @returns {{ namespace: Record<string, unknown>, created: any[] }}
 */
function makeBootstrap(config = {}) {
  /** @type {any[]} */
  const created = [];

  class Modal {
    /**
     * @param {Element} element
     * @param {Record<string, unknown>} [options]
     */
    constructor(element, options) {
      this.element = element;
      this.options = options ?? {};
      this.shown = false;
      this.disposed = false;
      created.push(this);
    }

    /** @param {string} type */
    #fire(type) {
      this.element.dispatchEvent(new Event(type));
    }

    show() {
      this.shown = true;
      const done = () => this.#fire('shown.bs.modal');
      if (config.async === true) queueMicrotask(done);
      else done();
    }

    hide() {
      this.shown = false;
      const done = () => this.#fire('hidden.bs.modal');
      if (config.async === true) queueMicrotask(done);
      else done();
    }

    dispose() {
      this.disposed = true;
    }
  }

  return { namespace: { Modal }, created };
}

/**
 * A manager wired to a fresh double.
 *
 * @param {Record<string, any>} [options]
 * @param {{ async?: boolean }} [config]
 */
function withBootstrap(options = {}, config = {}) {
  const peer = makeBootstrap(config);
  return { peer, dialogs: createDialogs({ bootstrap: peer.namespace, ...options }) };
}

/** The `.modal` this library just appended. @returns {Element} */
function dialogElement() {
  const el = document.querySelector('.modal');
  if (el === null) throw new Error('no dialog in the document');
  return el;
}

/**
 * @param {string} label
 * @returns {HTMLElement}
 */
function button(label) {
  const match = [...dialogElement().querySelectorAll('button')].find(
    (el) => el.textContent === label || el.getAttribute('aria-label') === label,
  );
  if (match === undefined) throw new Error(`no button labelled ${label}`);
  return /** @type {HTMLElement} */ (match);
}

/**
 * Let the queued `shown.bs.modal` of an async double arrive.
 *
 * The entrance transition matters to more than tidiness: Bootstrap's own `hide()`
 * returns without emitting anything while a show is in flight, so "has it
 * finished appearing" changes which settlement path a dismissal takes.
 *
 * @returns {Promise<void>}
 */
const shown = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = '';
  delete (/** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap);
  vi.restoreAllMocks();
});

describe('F101 — a dialog is a promise', () => {
  it('resolves true when the affirming button is pressed', async () => {
    const { dialogs } = withBootstrap();
    const answer = dialogs.confirm('Delete this?');
    button('OK').click();
    await expect(answer).resolves.toBe(true);
  });

  it('resolves the prompt field as typed, untrimmed', async () => {
    const { dialogs } = withBootstrap();
    const answer = dialogs.prompt('Name', { value: 'draft' });
    const field = /** @type {HTMLInputElement} */ (dialogElement().querySelector('input'));
    field.value = '  spaced  ';
    button('OK').click();
    // Trimming is a decision about the caller's data, so it is not made here.
    await expect(answer).resolves.toBe('  spaced  ');
  });

  it('seeds the prompt field from options.value, as attribute and property', () => {
    const { dialogs } = withBootstrap();
    void dialogs.prompt('Name', { value: 'draft', placeholder: 'e.g. Untitled' });
    const field = /** @type {HTMLInputElement} */ (dialogElement().querySelector('input'));
    expect(field.value).toBe('draft');
    expect(field.getAttribute('value')).toBe('draft');
    expect(field.getAttribute('placeholder')).toBe('e.g. Untitled');
  });

  it('resolves an open dialog with the pressed action’s value', async () => {
    const { dialogs } = withBootstrap();
    const answer = dialogs.open({
      title: 'Unsaved changes',
      content: 'Save before closing?',
      actions: [
        { label: 'Discard', value: 'discard' },
        { label: 'Save', value: 'save', variant: 'primary' },
      ],
      dismissValue: 'cancel',
    });
    button('Discard').click();
    await expect(answer).resolves.toBe('discard');
  });

  it('inherits Bootstrap’s own open/close rather than reimplementing it', () => {
    const { peer, dialogs } = withBootstrap();
    void dialogs.confirm('Sure?', { backdrop: 'static', keyboard: false });
    // The wrapper passed the config through and Bootstrap was actually shown —
    // this library never toggles a class to fake a modal (spec 07 §4).
    expect(peer.created).toHaveLength(1);
    expect(peer.created[0].shown).toBe(true);
    expect(peer.created[0].options).toMatchObject({ backdrop: 'static', keyboard: false });
  });

  it('plays the configured transition: the answer waits for hidden, not for the click', async () => {
    const { dialogs } = withBootstrap({}, { async: true });
    const answer = dialogs.confirm('Sure?');
    await shown();
    let settledEarly = false;
    void answer.then(() => {
      settledEarly = true;
    });
    button('OK').click();
    // The click chose the answer; the dialog is still animating out, and its
    // markup is still in the document while it does.
    expect(settledEarly).toBe(false);
    expect(document.querySelector('.modal')).not.toBeNull();
    await expect(answer).resolves.toBe(true);
  });

  it('settles at once when a dismissal beats the entrance transition', async () => {
    // Bootstrap's `hide()` is a no-op mid-show and emits nothing, so waiting for
    // `hidden` here would hang the promise for good. There is no exit animation
    // because there was no entrance to reverse.
    const { dialogs } = withBootstrap({}, { async: true });
    const answer = dialogs.confirm('Sure?');
    button('Cancel').click();
    await expect(answer).resolves.toBe(false);
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
  });
});

describe('F102 — a dismissal is an answer, not an error', () => {
  it('resolves false when the cancel button is pressed', async () => {
    const { dialogs } = withBootstrap();
    const answer = dialogs.confirm('Sure?');
    button('Cancel').click();
    await expect(answer).resolves.toBe(false);
  });

  it('resolves false when the header close control is pressed', async () => {
    const { dialogs } = withBootstrap();
    const answer = dialogs.confirm('Sure?');
    button('Close').click();
    await expect(answer).resolves.toBe(false);
  });

  it('resolves false when Escape or the backdrop closes the dialog', async () => {
    // Both reach us the same way, and it is the way that matters: Bootstrap
    // hides itself and emits `hidden`. Nothing in this library listens for the
    // key or the click, which is why the two need no separate handling.
    const { dialogs } = withBootstrap();
    const answer = dialogs.confirm('Sure?');
    dialogElement().dispatchEvent(new Event('hidden.bs.modal'));
    await expect(answer).resolves.toBe(false);
  });

  it('resolves null on a dismissed prompt — distinguishable from the empty string', async () => {
    const { dialogs } = withBootstrap();
    const dismissed = dialogs.prompt('Name');
    button('Cancel').click();
    await expect(dismissed).resolves.toBeNull();

    const emptied = dialogs.prompt('Name');
    button('OK').click();
    await expect(emptied).resolves.toBe('');
  });

  it('resolves the caller’s dismissValue for an open dialog', async () => {
    const { dialogs } = withBootstrap();
    const answer = dialogs.open({
      content: 'Anything',
      actions: [{ label: 'Go', value: 'go' }],
      dismissValue: 'cancel',
    });
    dialogElement().dispatchEvent(new Event('hidden.bs.modal'));
    await expect(answer).resolves.toBe('cancel');
  });

  it('never rejects for any dismissal', async () => {
    const { dialogs } = withBootstrap();
    const rejections = [];
    const answers = [dialogs.confirm('a'), dialogs.prompt('b')];
    for (const promise of answers) promise.catch((error) => rejections.push(error));
    for (const el of document.querySelectorAll('.modal')) {
      el.dispatchEvent(new Event('hidden.bs.modal'));
    }
    await Promise.all(answers);
    expect(rejections).toEqual([]);
  });

  it('rejects EGL_PEER_MISSING when the dialog cannot be asked at all', async () => {
    // No injected namespace and no global: the question was never put to anyone,
    // which is the fact F102 keeps distinguishable from "the user said no".
    const dialogs = createDialogs();
    await expect(dialogs.confirm('Sure?')).rejects.toMatchObject({
      code: 'EGL_PEER_MISSING',
      peer: 'bootstrap',
    });
  });

  it('leaves nothing in the document when the question could not be asked', async () => {
    const dialogs = createDialogs();
    await expect(dialogs.confirm('Sure?')).rejects.toBeInstanceOf(Error);
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
  });

  it('rejects EGL_DOM_CONTRACT when there is nowhere to draw — and constructs fine', () => {
    // The manager is legitimate during a server render; only asking needs a
    // document, which is why the document is resolved per dialog.
    const documentSpy = vi.spyOn(globalThis, 'document', 'get').mockReturnValue(undefined);
    const dialogs = createDialogs();
    const answer = dialogs.confirm('Sure?');
    documentSpy.mockRestore();
    return expect(answer).rejects.toMatchObject({ code: 'EGL_DOM_CONTRACT' });
  });
});

describe('F102 — exactly one settlement, counted', () => {
  it('settles once when a dismissal races behind a pressed button', async () => {
    const { dialogs } = withBootstrap({}, { async: true });
    let settlements = 0;
    const answer = dialogs.confirm('Sure?').then((value) => {
      settlements += 1;
      return value;
    });
    await shown();

    button('OK').click();
    // Escape arriving while the dialog animates out, twice for good measure.
    const el = dialogElement();
    el.dispatchEvent(new Event('hidden.bs.modal'));
    el.dispatchEvent(new Event('hidden.bs.modal'));

    await expect(answer).resolves.toBe(true);
    await Promise.resolve();
    expect(settlements).toBe(1);
  });

  it('keeps the answer the button chose, not the dismissal that followed', async () => {
    const { dialogs } = withBootstrap({}, { async: true });
    const answer = dialogs.prompt('Name');
    await shown();
    const field = /** @type {HTMLInputElement} */ (dialogElement().querySelector('input'));
    field.value = 'typed';
    button('OK').click();
    dialogElement().dispatchEvent(new Event('hidden.bs.modal'));
    await expect(answer).resolves.toBe('typed');
  });

  it('ignores a second press after the dialog has settled', async () => {
    // The footer is still attached between `hide()` and `hidden`, so a second
    // press is reachable — and after settlement it must reach nothing: the
    // wrapper is disposed by then, and asking it to hide again would throw.
    const { dialogs } = withBootstrap();
    const answer = dialogs.confirm('Sure?');
    const affirm = button('OK');
    const cancel = button('Cancel');
    affirm.click();
    await expect(answer).resolves.toBe(true);
    // Both, on the detached nodes the caller may still hold a reference to.
    expect(() => cancel.click()).not.toThrow();
    expect(() => affirm.click()).not.toThrow();
  });

  it('settles once when destroy() lands mid-dialog', async () => {
    const { dialogs } = withBootstrap();
    let settlements = 0;
    const answer = dialogs.confirm('Sure?').then((value) => {
      settlements += 1;
      return value;
    });
    dialogs.destroy();
    // A pending promise nobody will ever settle is a leak with an `await` on the
    // other end, so destroy answers rather than abandoning.
    await expect(answer).resolves.toBe(false);
    expect(settlements).toBe(1);
  });

  it('settles every open dialog on destroy(), each with its own dismissal answer', async () => {
    const { dialogs } = withBootstrap();
    const confirmed = dialogs.confirm('a');
    const prompted = dialogs.prompt('b');
    const opened = dialogs.open({ content: 'c', dismissValue: 'gone' });
    dialogs.destroy();
    await expect(Promise.all([confirmed, prompted, opened])).resolves.toEqual([
      false,
      null,
      'gone',
    ]);
  });

  it('settles with the dismissal answer when a call signal aborts', async () => {
    const { dialogs } = withBootstrap();
    const controller = new AbortController();
    const answer = dialogs.confirm('Sure?', { signal: controller.signal });
    controller.abort();
    await expect(answer).resolves.toBe(false);
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
  });

  it('draws nothing at all for a signal that is already aborted', async () => {
    const { peer, dialogs } = withBootstrap();
    const answer = dialogs.prompt('Name', { signal: AbortSignal.abort() });
    await expect(answer).resolves.toBeNull();
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
    expect(peer.created).toHaveLength(0);
  });

  it('destroys the manager when its own signal aborts', async () => {
    const controller = new AbortController();
    const peer = makeBootstrap();
    const dialogs = createDialogs({
      bootstrap: peer.namespace,
      signal: controller.signal,
    });
    const answer = dialogs.confirm('Sure?');
    controller.abort();
    await expect(answer).resolves.toBe(false);
    expect(() => dialogs.confirm('again')).toThrow(/after destroy/);
  });

  it('throws synchronously when a destroyed manager is asked for a dialog', () => {
    // A programming error, in the same class as a malformed option — so it throws
    // where it happens rather than becoming a rejection, which F102 reserves for
    // "the question could not be asked" (17.9's rule).
    const { dialogs } = withBootstrap();
    dialogs.destroy();
    expect(() => dialogs.confirm('x')).toThrow(
      /createDialogs: confirm\(\) was called after destroy/,
    );
    expect(() => dialogs.prompt('x')).toThrow(/prompt\(\) was called after destroy/);
    expect(() => dialogs.open({ content: 'x' })).toThrow(/open\(\) was called after destroy/);
    expect(() => dialogs.destroy()).not.toThrow();
  });
});

describe('F103 — focus is trapped, then given back', () => {
  it('restores focus to the element that had it when the dialog opened', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.append(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { dialogs } = withBootstrap();
    const answer = dialogs.confirm('Sure?');
    // Bootstrap moves focus into the dialog on `shown`; the double fires the
    // event, and the point being asserted is where focus lands afterwards.
    button('OK').click();
    await answer;

    // Not `<body>`. A dialog that leaves focus on the body has stranded every
    // keyboard user at the top of the page (F103).
    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab inside the dialog even when Bootstrap’s own focus handling is off', () => {
    // `{ focus: false }` is a legal Bootstrap config and it disables Bootstrap's
    // internal focus trap entirely (`if (this._config.focus)` in modal.js). F103
    // holds regardless, which is why the trap is ours (ADR-0071).
    const outside = document.createElement('button');
    document.body.append(outside);
    const { dialogs } = withBootstrap();
    void dialogs.confirm('Sure?');

    const buttons = [...dialogElement().querySelectorAll('button')];
    const last = /** @type {HTMLElement} */ (buttons[buttons.length - 1]);
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(dialogElement().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(outside);
  });

  it('focuses the prompt field once the dialog is actually visible', () => {
    const { dialogs } = withBootstrap();
    void dialogs.prompt('Name');
    // The double fires `shown.bs.modal` synchronously from show().
    expect(document.activeElement).toBe(dialogElement().querySelector('input'));
  });

  it('focuses the dialog itself for a confirm — not a button, and not the page', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { dialogs } = withBootstrap();
    void dialogs.confirm('Sure?');
    // The dialog, so the trap's root holds the next Tab keydown (the WebKit case
    // that made this explicit rather than left to Bootstrap), and NOT the
    // affirming button, because Enter agreeing to a question by default is not a
    // default a destructive confirm should have.
    expect(document.activeElement).toBe(dialogElement());
  });
});

describe('NFR-36 — a dialog says what it is', () => {
  it('names itself from the title, and describes itself with the body', () => {
    const { dialogs } = withBootstrap();
    void dialogs.open({ title: 'Unsaved changes', content: 'Save first?' });
    const el = dialogElement();
    const labelledBy = el.getAttribute('aria-labelledby');
    const describedBy = el.getAttribute('aria-describedby');
    expect(el.querySelector('.modal-title')?.id).toBe(labelledBy);
    expect(el.querySelector('.modal-body')?.id).toBe(describedBy);
    expect(el.querySelector('.modal-title')?.textContent).toBe('Unsaved changes');
  });

  it('names itself from the question when there is no title', () => {
    // Always named, with no `ariaLabel` option to forget: the question is a
    // perfectly good accessible name for a dialog that asks it.
    const { dialogs } = withBootstrap();
    void dialogs.confirm('Delete this row?');
    const el = dialogElement();
    expect(el.querySelector('.modal-title')).toBeNull();
    expect(el.getAttribute('aria-describedby')).toBeNull();
    const named = el.querySelector(`#${el.getAttribute('aria-labelledby')}`);
    expect(named?.textContent).toBe('Delete this row?');
  });

  it('labels the prompt field with the question, through for/id', () => {
    const { dialogs } = withBootstrap();
    void dialogs.prompt('New folder name');
    const el = dialogElement();
    const label = /** @type {HTMLLabelElement} */ (el.querySelector('label'));
    const field = /** @type {HTMLInputElement} */ (el.querySelector('input'));
    expect(label.textContent).toBe('New folder name');
    expect(label.getAttribute('for')).toBe(field.id);
    expect(field.id).not.toBe('');
  });

  it('gives every button an accessible name, the close control included', () => {
    const { dialogs } = withBootstrap();
    void dialogs.confirm('Sure?', { labels: { close: 'Dismiss' } });
    const close = dialogElement().querySelector('.btn-close');
    expect(close?.getAttribute('aria-label')).toBe('Dismiss');
  });

  it('mints ids that do not collide with a second dialog', () => {
    const { dialogs } = withBootstrap();
    void dialogs.open({ title: 'One', content: 'a' });
    void dialogs.open({ title: 'Two', content: 'b' });
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the markup, and what it does not do', () => {
  it('escapes string content by default', () => {
    const { dialogs } = withBootstrap();
    void dialogs.confirm('<img src=x onerror=alert(1)>');
    const body = dialogElement().querySelector('.modal-body');
    expect(body?.querySelector('img')).toBeNull();
    expect(body?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('refuses markup without a sanitizer — synchronously, where the caller is', () => {
    // A promise-returning method still THROWS for a programming error. Turning
    // this into a rejection would put it in the same channel as F102's missing
    // peer, and telling those two apart is the whole point of that clause.
    const { dialogs } = withBootstrap();
    expect(() => dialogs.confirm('<b>bold</b>', { html: true })).toThrow(/sanitize/);
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
  });

  it('refuses a content value it will not render, and draws nothing', () => {
    const { dialogs } = withBootstrap();
    expect(() => dialogs.open({ content: 42 })).toThrow(
      /content must be a string, a Node, or an array of those/,
    );
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
  });

  it('renders markup through the caller’s sanitizer when asked', () => {
    const { dialogs } = withBootstrap();
    void dialogs.confirm('<b>bold</b><script>bad()</script>', {
      html: true,
      sanitize: (html) => html.replace(/<script[\s\S]*?<\/script>/g, ''),
    });
    const body = dialogElement().querySelector('.modal-body');
    expect(body?.querySelector('b')?.textContent).toBe('bold');
    expect(body?.querySelector('script')).toBeNull();
  });

  it('takes a node the caller built', () => {
    const { dialogs } = withBootstrap();
    const node = document.createElement('p');
    node.textContent = 'built by the caller';
    void dialogs.open({ content: node });
    expect(dialogElement().querySelector('.modal-body p')).toBe(node);
  });

  it('centres by default and applies size and class', () => {
    const { dialogs } = withBootstrap();
    void dialogs.confirm('Sure?', { size: 'lg', class: 'my-dialog' });
    const el = dialogElement();
    expect(el.classList.contains('my-dialog')).toBe(true);
    const dialog = /** @type {Element} */ (el.querySelector('.modal-dialog'));
    expect(dialog.classList.contains('modal-dialog-centered')).toBe(true);
    expect(dialog.classList.contains('modal-lg')).toBe(true);
  });

  it('omits the header entirely when there is no title and no close control', () => {
    const { dialogs } = withBootstrap();
    void dialogs.open({
      content: 'text',
      dismissible: false,
      actions: [{ label: 'Ok', value: 1 }],
    });
    expect(dialogElement().querySelector('.modal-header')).toBeNull();
  });

  it('omits the footer when there are no actions', () => {
    const { dialogs } = withBootstrap();
    void dialogs.open({ content: 'Just so you know' });
    expect(dialogElement().querySelector('.modal-footer')).toBeNull();
  });

  it('refuses a dialog that cannot be answered at all', () => {
    // No button, no close control, no Escape, a static backdrop: the `await`
    // would never return and the page would sit behind a modal it cannot close.
    // The empty focus trap (F109) has the same shape and the same answer.
    const { dialogs } = withBootstrap();
    expect(() =>
      dialogs.open({
        content: 'trapped',
        dismissible: false,
        keyboard: false,
        backdrop: 'static',
      }),
    ).toThrow(/cannot be answered/);
  });

  it('allows a dismissible-only dialog, which is answerable', () => {
    const { dialogs } = withBootstrap();
    expect(() =>
      dialogs.open({ content: 'fine', keyboard: false, backdrop: 'static' }),
    ).not.toThrow();
  });

  it('removes its markup and disposes Bootstrap once settled', async () => {
    const { peer, dialogs } = withBootstrap();
    const answer = dialogs.confirm('Sure?');
    button('OK').click();
    await answer;
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
    expect(peer.created[0].disposed).toBe(true);
  });

  it('waits for hidden before removing the node when it tears down a shown dialog', async () => {
    // Pulling a shown `.modal` out of the document strands Bootstrap's backdrop
    // and leaves <body> scroll-locked, because the component never sees the
    // `hidden` it disposes on.
    const { peer, dialogs } = withBootstrap({}, { async: true });
    const answer = dialogs.confirm('Sure?');
    await shown();
    dialogs.destroy();
    await answer;
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
    expect(peer.created[0].disposed).toBe(true);
  });
});

describe('options: defaults, overrides, and the rest element as the schema', () => {
  it('takes the manager’s defaults', () => {
    const { dialogs } = withBootstrap({ labels: { confirm: 'Delete' }, variant: 'danger' });
    void dialogs.confirm('Sure?');
    const affirm = button('Delete');
    expect(affirm.classList.contains('btn-danger')).toBe(true);
  });

  it('lets a call override one default without blanking the others', () => {
    const { dialogs } = withBootstrap({ labels: { confirm: 'Delete', cancel: 'Keep' } });
    void dialogs.confirm('Sure?', { labels: { cancel: 'Never mind' } });
    expect(() => button('Delete')).not.toThrow();
    expect(() => button('Never mind')).not.toThrow();
  });

  it('treats an omitted option as “not said”, not as false', () => {
    const { dialogs } = withBootstrap({ dismissible: false });
    void dialogs.confirm('Sure?');
    // Inherited, rather than reset by the destructuring's own `undefined`.
    expect(dialogElement().querySelector('.btn-close')).toBeNull();
  });

  it('lets a call turn a manager default back on', () => {
    const { dialogs } = withBootstrap({ dismissible: false });
    void dialogs.confirm('Sure?', { dismissible: true });
    expect(dialogElement().querySelector('.btn-close')).not.toBeNull();
  });

  it('rejects an unknown key on the manager, naming it (ADR-0047)', () => {
    expect(() => createDialogs({ varient: 'danger' })).toThrow(
      /createDialogs: unknown option 'varient'/,
    );
  });

  it('rejects an unknown key on every method', () => {
    const { dialogs } = withBootstrap();
    expect(() => dialogs.confirm('x', { autoHideMs: 10 })).toThrow(
      /confirm: unknown option 'autoHideMs'/,
    );
    expect(() => dialogs.prompt('x', { defaultValue: 'y' })).toThrow(
      /prompt: unknown option 'defaultValue'/,
    );
    expect(() => dialogs.open({ content: 'x', buttons: [] })).toThrow(
      /open: unknown option 'buttons'/,
    );
  });

  it('rejects an unknown key on an action, naming the index', () => {
    const { dialogs } = withBootstrap();
    expect(() =>
      dialogs.open({ content: 'x', actions: [{ label: 'Go', value: 1, colour: 'red' }] }),
    ).toThrow(/options\.actions\[0\]: unknown property 'colour'/);
  });

  it('rejects malformed options, naming the option', () => {
    const { dialogs } = withBootstrap();
    // Every key the shared reader validates, because a validator nothing
    // exercises is a validator nobody knows is wrong.
    expect(() => dialogs.confirm('x', { centered: 'yes' })).toThrow(
      /confirm: options\.centered must be a boolean/,
    );
    expect(() => dialogs.confirm('x', { dismissible: 'no' })).toThrow(
      /options\.dismissible must be a boolean/,
    );
    expect(() => dialogs.confirm('x', { keyboard: 'off' })).toThrow(
      /options\.keyboard must be a boolean/,
    );
    expect(() => dialogs.confirm('x', { html: 'yes' })).toThrow(/options\.html must be a boolean/);
    expect(() => dialogs.confirm('x', { backdrop: 'sticky' })).toThrow(
      /options\.backdrop must be a boolean or 'static'/,
    );
    expect(() => dialogs.confirm('x', { signal: 'later' })).toThrow(
      /options\.signal must be an AbortSignal/,
    );
    expect(() => dialogs.confirm('x', { labels: 'OK' })).toThrow(/options\.labels/);
    expect(() => dialogs.confirm('x', { variant: 'not a token' })).toThrow(/options\.variant/);
    expect(() => dialogs.confirm('x', { size: 'not a token' })).toThrow(/options\.size/);
    expect(() => dialogs.confirm('x', { bootstrap: 'window.bootstrap' })).toThrow(
      /options\.bootstrap/,
    );
    expect(() => dialogs.confirm('x', { document: 'the page' })).toThrow(
      /options\.document must be a Document/,
    );
    expect(() => dialogs.prompt('x', { value: 42 })).toThrow(/options\.value must be a string/);
    expect(() => dialogs.prompt('x', { placeholder: 42 })).toThrow(
      /options\.placeholder must be a string/,
    );
    expect(() => dialogs.open({})).toThrow(/options\.content is required/);
    expect(() => dialogs.open({ content: 'x', actions: 'none' })).toThrow(
      /options\.actions must be an array/,
    );
    expect(() => dialogs.open({ content: 'x', actions: [{ label: '', value: 1 }] })).toThrow(
      /label must be a non-empty string/,
    );
    expect(() =>
      dialogs.open({ content: 'x', actions: [{ label: 'Go', value: 1, variant: 'not a token' }] }),
    ).toThrow(/options\.actions\[0\]\.variant/);
    expect(() => dialogs.open({ content: 'x', actions: ['Go'] })).toThrow(/options\.actions\[0\]/);
  });

  it('puts a caller class on the action it belongs to', () => {
    const { dialogs } = withBootstrap();
    void dialogs.open({
      content: 'x',
      actions: [
        { label: 'Go', value: 1, class: 'w-100' },
        { label: 'Stop', value: 2 },
      ],
    });
    expect(button('Go').classList.contains('w-100')).toBe(true);
    expect(button('Stop').classList.contains('w-100')).toBe(false);
  });

  it('is born destroyed when its signal was already aborted', () => {
    const peer = makeBootstrap();
    const dialogs = createDialogs({ bootstrap: peer.namespace, signal: AbortSignal.abort() });
    expect(() => dialogs.confirm('x')).toThrow(/after destroy/);
    expect(peer.created).toHaveLength(0);
  });

  it('prefers the injected namespace over the ambient global', () => {
    const ambient = makeBootstrap();
    const injected = makeBootstrap();
    /** @type {{ bootstrap?: unknown }} */ (globalThis).bootstrap = ambient.namespace;
    void createDialogs({ bootstrap: injected.namespace }).confirm('Sure?');
    expect(injected.created).toHaveLength(1);
    expect(ambient.created).toHaveLength(0);
  });
});

describe('NFR-35 — no module state', () => {
  it('two managers on one page share nothing', async () => {
    // The test ADR-0031 wishes had existed before the static-singleton alert it
    // replaced: the second instance is the one that breaks.
    const first = withBootstrap({ labels: { confirm: 'First' } });
    const second = withBootstrap({ labels: { confirm: 'Second' } });

    const a = first.dialogs.confirm('a');
    const b = second.dialogs.confirm('b');
    expect(document.querySelectorAll('.modal')).toHaveLength(2);

    // Destroying one settles only its own dialog.
    first.dialogs.destroy();
    await expect(a).resolves.toBe(false);
    expect(document.querySelectorAll('.modal')).toHaveLength(1);

    let settled = false;
    void b.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    second.dialogs.destroy();
    await expect(b).resolves.toBe(false);
  });

  it('keeps two dialogs from one manager independent', async () => {
    const { dialogs } = withBootstrap();
    const first = dialogs.confirm('first');
    const second = dialogs.confirm('second');
    const modals = [...document.querySelectorAll('.modal')];
    expect(modals).toHaveLength(2);

    modals[0].dispatchEvent(new Event('hidden.bs.modal'));
    await expect(first).resolves.toBe(false);
    expect(document.querySelectorAll('.modal')).toHaveLength(1);

    dialogs.destroy();
    await expect(second).resolves.toBe(false);
  });
});
