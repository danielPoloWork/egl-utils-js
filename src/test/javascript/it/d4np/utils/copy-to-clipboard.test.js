// @vitest-environment node
// Tests (roadmap 19.4, spec 06 §2 item F97, §6) for the clipboard write.
//
// Node, deliberately, and with the window injected: every path this suite cares
// about is a *refusal*, and the refusals are what F97 exists for. A real engine
// adds the success path and the real permission prompt, which is Playwright's job
// (smoke.spec.js) — jsdom would only be a third fake in the middle.
import { describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../../../../../main/javascript/it/d4np/utils/dom.js';
import { ClipboardError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

/** @param {object} [clipboard] @param {object} [extra] */
function windowWith(clipboard, extra = {}) {
  return { navigator: clipboard === undefined ? {} : { clipboard }, ...extra };
}

describe('writing', () => {
  it('hands the text to the platform', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await copyToClipboard('id,name\r\n7,ada\r\n', { window: windowWith({ writeText }) });
    expect(writeText).toHaveBeenCalledWith('id,name\r\n7,ada\r\n');
  });

  it('calls writeText on the clipboard it came from', async () => {
    // `this` matters: a bound-method extraction that lost it would throw an
    // "Illegal invocation" in a real engine and pass against a loose fake.
    const clipboard = {
      seen: null,
      writeText(text) {
        this.seen = text;
        return Promise.resolve();
      },
    };
    await copyToClipboard('x', { window: windowWith(clipboard) });
    expect(clipboard.seen).toBe('x');
  });

  it('allows the empty string — clearing is a thing a caller may mean', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await copyToClipboard('', { window: windowWith({ writeText }) });
    expect(writeText).toHaveBeenCalledWith('');
  });
});

describe('refusals are typed, never silent', () => {
  it('names an insecure context, because that one is fixable', async () => {
    const error = await copyToClipboard('x', {
      window: windowWith(undefined, { isSecureContext: false }),
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ClipboardError);
    expect(error.code).toBe('EGL_CLIPBOARD');
    expect(error.reason).toBe('insecure');
    expect(error.message).toMatch(/HTTPS/);
  });

  it('says unsupported when there is no clipboard and no secure-context signal', async () => {
    // `isSecureContext` absent means we genuinely do not know, and guessing
    // "insecure" would send a caller to fix a certificate that is not the problem.
    const error = await copyToClipboard('x', { window: windowWith(undefined) }).catch((e) => e);
    expect(error.reason).toBe('unsupported');
  });

  it('says unsupported when writeText is not a function', async () => {
    const error = await copyToClipboard('x', { window: windowWith({ writeText: 'nope' }) }).catch(
      (e) => e,
    );
    expect(error.reason).toBe('unsupported');
  });

  it('classifies a refused permission, matching on the DOM name and not on prose', async () => {
    for (const name of ['NotAllowedError', 'SecurityError']) {
      const cause = Object.assign(new Error('nope'), { name });
      const error = await copyToClipboard('x', {
        window: windowWith({ writeText: () => Promise.reject(cause) }),
      }).catch((e) => e);

      expect(error.reason).toBe('denied');
      expect(error.cause).toBe(cause);
      expect(error.message).toMatch(/permission was refused/);
    }
  });

  it('classifies anything else as failed, keeping the platform error as cause', async () => {
    const cause = new Error('disk on fire');
    const error = await copyToClipboard('x', {
      window: windowWith({ writeText: () => Promise.reject(cause) }),
    }).catch((e) => e);

    expect(error.reason).toBe('failed');
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(ClipboardError);
  });

  it('survives a rejection that is not an object at all', async () => {
    const error = await copyToClipboard('x', {
      window: windowWith({ writeText: () => Promise.reject('a string') }),
    }).catch((e) => e);
    expect(error.reason).toBe('failed');
    expect(error.cause).toBe('a string');
  });

  it('has no fallback, deliberately', async () => {
    // No execCommand rescue: it is deprecated, silently unreliable, and would turn
    // the typed failure back into the ambiguity this requirement removes.
    const execCommand = vi.fn();
    const error = await copyToClipboard('x', {
      window: windowWith(undefined, { document: { execCommand } }),
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ClipboardError);
    expect(execCommand).not.toHaveBeenCalled();
  });
});

describe('contract', () => {
  it('requires text to be a string', async () => {
    await expect(copyToClipboard(42)).rejects.toThrow(/text must be a string/);
    await expect(copyToClipboard(null)).rejects.toThrow(/text must be a string/);
  });

  it('rejects an unknown option', async () => {
    await expect(copyToClipboard('x', { win: {} })).rejects.toThrow(/unknown option 'win'/);
  });

  it('takes a null options bag as none', async () => {
    // Reaches the ambient global, which in Node has no clipboard — the typed
    // refusal, which is the right answer here.
    const error = await copyToClipboard('x', null).catch((e) => e);
    expect(error).toBeInstanceOf(ClipboardError);
  });
});

describe('the error is part of the taxonomy', () => {
  it('carries a stable code and a name, and defaults its reason', () => {
    const error = new ClipboardError('nope');
    expect(error.code).toBe('EGL_CLIPBOARD');
    expect(error.name).toBe('ClipboardError');
    expect(error.reason).toBe('failed');
  });
});
