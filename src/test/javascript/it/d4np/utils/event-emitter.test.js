import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../../../../../main/javascript/it/d4np/utils/events.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

describe('EventEmitter — on/emit basics (spec §2 item 6, ADR-0006)', () => {
  it('delivers the payload to every listener, in subscription order', () => {
    /** @type {EventEmitter<{ data: string, error: unknown }>} */
    const emitter = new EventEmitter();
    /** @type {string[]} */
    const seen = [];
    emitter.on('data', (chunk) => seen.push(`first:${chunk}`));
    emitter.on('data', (chunk) => seen.push(`second:${chunk}`));
    const had = emitter.emit('data', 'hello');
    expect(had).toBe(true);
    expect(seen).toEqual(['first:hello', 'second:hello']);
  });

  it('emit returns false when nothing is subscribed to the event', () => {
    const emitter = new EventEmitter();
    expect(emitter.emit('anything', 1)).toBe(false);
  });

  it('keeps events independent — a listener only sees its own event', () => {
    /** @type {EventEmitter<{ a: number, b: number, error: unknown }>} */
    const emitter = new EventEmitter();
    const onA = vi.fn();
    const onB = vi.fn();
    emitter.on('a', onA);
    emitter.on('b', onB);
    emitter.emit('a', 1);
    expect(onA).toHaveBeenCalledWith(1);
    expect(onB).not.toHaveBeenCalled();
  });

  it('allows duplicate registrations, each called once per emit', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.on('tick', fn);
    emitter.on('tick', fn);
    emitter.emit('tick', undefined);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.EventEmitter).toBe(EventEmitter);
  });
});

describe('EventEmitter — unsubscribe (off and the returned closure)', () => {
  it('the closure returned by on() removes exactly that registration, idempotently', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    const unsubscribe = emitter.on('tick', fn);
    emitter.on('tick', fn); // duplicate stays subscribed
    unsubscribe();
    unsubscribe(); // idempotent
    emitter.emit('tick', undefined);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('off removes one matching registration per call', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.on('tick', fn);
    emitter.on('tick', fn);
    emitter.off('tick', fn);
    emitter.emit('tick', undefined);
    expect(fn).toHaveBeenCalledTimes(1);
    emitter.off('tick', fn);
    expect(emitter.emit('tick', undefined)).toBe(false); // none left
  });

  it('the closure stays a no-op after off already emptied the event entirely', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    const unsubscribe = emitter.on('tick', fn);
    emitter.off('tick', fn); // removes the last registration — event key dropped
    expect(() => unsubscribe()).not.toThrow(); // closure hits the emptied-event path
    expect(emitter.emit('tick', undefined)).toBe(false);
  });

  it('off is a no-op for unknown listeners and unknown events', () => {
    const emitter = new EventEmitter();
    expect(() => emitter.off('ghost', () => {})).not.toThrow();
    emitter.on('tick', () => {});
    expect(() => emitter.off('tick', () => {})).not.toThrow(); // different fn
    expect(emitter.emit('tick', undefined)).toBe(true);
  });
});

describe('EventEmitter — once', () => {
  it('fires exactly once and auto-removes', () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.once('tick', fn);
    emitter.emit('tick', 1);
    emitter.emit('tick', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('deregisters before running — a re-emit from inside the listener cannot re-fire it', () => {
    const emitter = new EventEmitter();
    let calls = 0;
    emitter.once('tick', () => {
      calls += 1;
      if (calls === 1) emitter.emit('tick', undefined);
    });
    emitter.emit('tick', undefined);
    expect(calls).toBe(1);
  });

  it('can be removed before firing, via off or its own closure', () => {
    const emitter = new EventEmitter();
    const viaOff = vi.fn();
    const viaClosure = vi.fn();
    emitter.once('tick', viaOff);
    const unsubscribe = emitter.once('tick', viaClosure);
    emitter.off('tick', viaOff);
    unsubscribe();
    expect(emitter.emit('tick', undefined)).toBe(false);
    expect(viaOff).not.toHaveBeenCalled();
    expect(viaClosure).not.toHaveBeenCalled();
  });
});

describe('EventEmitter — snapshot dispatch semantics (ADR-0006)', () => {
  it('a listener subscribed during an emit is not called in that dispatch', () => {
    const emitter = new EventEmitter();
    const late = vi.fn();
    emitter.on('tick', () => {
      emitter.on('tick', late);
    });
    emitter.emit('tick', undefined);
    expect(late).not.toHaveBeenCalled();
    emitter.emit('tick', undefined); // present from the next emit on
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('a listener removed during an emit still runs in that dispatch', () => {
    const emitter = new EventEmitter();
    const second = vi.fn();
    emitter.on('tick', () => emitter.off('tick', second));
    emitter.on('tick', second);
    emitter.emit('tick', undefined);
    expect(second).toHaveBeenCalledTimes(1); // snapshot: still dispatched
    emitter.emit('tick', undefined);
    expect(second).toHaveBeenCalledTimes(1); // gone afterwards
  });
});

describe('EventEmitter — exception isolation via error (spec §2 item 6)', () => {
  it('a throwing listener never prevents the remaining listeners from running', () => {
    /** @type {EventEmitter<{ tick: undefined, error: unknown }>} */
    const emitter = new EventEmitter();
    const after = vi.fn();
    const onError = vi.fn();
    emitter.on('error', onError);
    emitter.on('tick', () => {
      throw new Error('listener one blew up');
    });
    emitter.on('tick', after);
    emitter.emit('tick', undefined);
    expect(after).toHaveBeenCalledTimes(1); // isolation held
  });

  it('reports each thrown exception to the error listeners', () => {
    /** @type {EventEmitter<{ tick: undefined, error: unknown }>} */
    const emitter = new EventEmitter();
    /** @type {unknown[]} */
    const reported = [];
    emitter.on('error', (err) => reported.push(err));
    const boom1 = new Error('first');
    const boom2 = new Error('second');
    emitter.on('tick', () => {
      throw boom1;
    });
    emitter.on('tick', () => {
      throw boom2;
    });
    emitter.emit('tick', undefined);
    expect(reported).toEqual([boom1, boom2]);
  });

  it('throws the failure from emit when no error listener is subscribed', () => {
    const emitter = new EventEmitter();
    const after = vi.fn();
    const boom = new Error('unreported');
    emitter.on('tick', () => {
      throw boom;
    });
    emitter.on('tick', after);
    expect(() => emitter.emit('tick', undefined)).toThrow(boom);
    expect(after).toHaveBeenCalledTimes(1); // all listeners still ran first
  });

  it('aggregates multiple unreported failures into an AggregateError', () => {
    const emitter = new EventEmitter();
    const boom1 = new Error('one');
    const boom2 = new Error('two');
    emitter.on('tick', () => {
      throw boom1;
    });
    emitter.on('tick', () => {
      throw boom2;
    });
    try {
      emitter.emit('tick', undefined);
      expect.unreachable('emit should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect(/** @type {AggregateError} */ (error).errors).toEqual([boom1, boom2]);
    }
  });

  it('swallows exceptions thrown by error listeners themselves (no recursion)', () => {
    /** @type {EventEmitter<{ tick: undefined, error: unknown }>} */
    const emitter = new EventEmitter();
    const secondErrorListener = vi.fn();
    emitter.on('error', () => {
      throw new Error('error listener also blew up');
    });
    emitter.on('error', secondErrorListener);
    emitter.on('tick', () => {
      throw new Error('original failure');
    });
    expect(() => emitter.emit('tick', undefined)).not.toThrow();
    expect(secondErrorListener).toHaveBeenCalledTimes(1); // isolation among error listeners too
  });

  it('a once error listener is consumed by the first reported failure', () => {
    /** @type {EventEmitter<{ tick: undefined, error: unknown }>} */
    const emitter = new EventEmitter();
    const onError = vi.fn();
    emitter.once('error', onError);
    const boom1 = new Error('one');
    const boom2 = new Error('two');
    emitter.on('tick', () => {
      throw boom1;
    });
    emitter.on('tick', () => {
      throw boom2;
    });
    // First failure consumes the once-listener; the second has no error
    // listener left and is thrown from emit.
    expect(() => emitter.emit('tick', undefined)).toThrow(boom2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(boom1);
  });
});

describe('EventEmitter — argument validation (TypeError)', () => {
  it('rejects non-string event names and non-function listeners', () => {
    const emitter = new EventEmitter();
    expect(() => emitter.on(/** @type {any} */ (42), () => {})).toThrow(TypeError);
    expect(() => emitter.on('tick', /** @type {any} */ ('nope'))).toThrow(TypeError);
    expect(() => emitter.once('tick', /** @type {any} */ (null))).toThrow(TypeError);
    expect(() => emitter.emit(/** @type {any} */ (Symbol('s')), 1)).toThrow(TypeError);
  });
});
