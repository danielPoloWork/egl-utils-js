// Example tests (roadmap 10.1, spec 02 §2 items F40-F41, ADR-0027) for the
// /logging entry: the two pure formatters and the logger factory.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOG_LEVELS,
  formatLogLine,
  formatTimestamp,
  logger,
} from '../../../../../main/javascript/it/d4np/utils/logging.js';

/** A record with every field set, for formatter tests. */
function record(overrides = {}) {
  return {
    ts: new Date(2026, 7, 6, 9, 30, 12, 7).getTime(),
    level: 'info',
    name: '',
    id: '',
    message: 'hello',
    args: [],
    ...overrides,
  };
}

/** A logger whose records land in an array, with a frozen clock. */
function capturing(options = {}) {
  /** @type {{ record: object, line: string }[]} */
  const captured = [];
  const log = logger({
    now: () => 0,
    sink: (rec, format) => captured.push({ record: rec, line: format(rec) }),
    ...options,
  });
  return { log, captured };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LOG_LEVELS — the level vocabulary', () => {
  it('is ordered from most to least verbose and ends at silent', () => {
    expect([...LOG_LEVELS]).toEqual(['trace', 'debug', 'info', 'warn', 'error', 'silent']);
  });

  it('is frozen, so a consumer cannot reorder severity for everyone else', () => {
    expect(Object.isFrozen(LOG_LEVELS)).toBe(true);
  });
});

describe('formatTimestamp — accepted inputs', () => {
  it('formats a Date as YYYY-MM-DD HH:mm:ss.SSS in local time', () => {
    expect(formatTimestamp(new Date(2026, 7, 6, 9, 30, 12, 7))).toBe('2026-08-06 09:30:12.007');
  });

  it('accepts epoch milliseconds, which is what a record carries', () => {
    const at = new Date(2026, 0, 2, 3, 4, 5, 6);
    expect(formatTimestamp(at.getTime())).toBe(formatTimestamp(at));
  });

  it('zero-pads every field', () => {
    expect(formatTimestamp(new Date(2026, 0, 2, 3, 4, 5, 6))).toBe('2026-01-02 03:04:05.006');
  });

  it('omits the milliseconds without leaving a trailing separator', () => {
    const line = formatTimestamp(new Date(2026, 7, 6, 9, 30, 12, 7), { fractional: false });
    expect(line).toBe('2026-08-06 09:30:12');
    expect(line.endsWith('.')).toBe(false);
  });

  it('accepts the epoch itself (a falsy timestamp is still an instant)', () => {
    expect(formatTimestamp(0)).toBe(formatTimestamp(new Date(0)));
  });
});

describe('formatTimestamp — rejected inputs', () => {
  it.each([
    ['a string', '2026-08-06'],
    ['null', null],
    ['undefined', undefined],
    ['a plain object', {}],
  ])('throws TypeError for %s', (_label, value) => {
    expect(() => formatTimestamp(/** @type {never} */ (value))).toThrow(TypeError);
  });

  it.each([
    ['an invalid Date', new Date('not a date')],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('throws TypeError for %s', (_label, value) => {
    expect(() => formatTimestamp(/** @type {never} */ (value))).toThrow(/valid instant/);
  });
});

describe('formatLogLine — line shape', () => {
  it('renders timestamp, padded level, id, marker, padded name, and message', () => {
    expect(formatLogLine(record({ level: 'info', name: 'checkout', id: 'a1b2c3d4' }))).toBe(
      '2026-08-06 09:30:12.007 INFO  a1b2c3d4 --- [            checkout] hello',
    );
  });

  it('pads the level column to five, the width of ERROR', () => {
    const line = formatLogLine(record({ level: 'error' }));
    expect(line).toContain('.007 ERROR --- hello');
  });

  it('uppercases the level', () => {
    expect(formatLogLine(record({ level: 'warn' }))).toContain('WARN ');
  });

  it('omits the id token entirely when there is no id, leaving no double space', () => {
    const line = formatLogLine(record({ id: '' }));
    expect(line).toBe('2026-08-06 09:30:12.007 INFO  --- hello');
    // The single gap before `---` is the level column's padding; a blanked-out
    // id token would add a third space.
    expect(line).not.toMatch(/ {3}/);
  });

  it('omits the bracket group when unnamed rather than padding it to blanks', () => {
    expect(formatLogLine(record({ name: '' }))).not.toContain('[');
  });

  it('keeps the tail of a long dotted name, where the specific part lives', () => {
    const line = formatLogLine(record({ name: 'it.d4np.utils.checkout.PaymentService' }));
    expect(line).toContain('[ckout.PaymentService]');
  });

  it('passes the args through to the sink rather than into the line', () => {
    expect(formatLogLine(record({ args: [{ id: 42 }] }))).toBe(
      '2026-08-06 09:30:12.007 INFO  --- hello',
    );
  });
});

describe('formatLogLine — one record, exactly one line (log injection)', () => {
  it.each([
    ['LF', 'first\nINFO forged'],
    ['CRLF', 'first\r\nINFO forged'],
    ['CR', 'first\rINFO forged'],
    ['a run of breaks', 'first\n\n\nINFO forged'],
  ])('collapses %s in the message to a single space', (_label, message) => {
    const line = formatLogLine(record({ message }));
    expect(line).not.toMatch(/[\r\n]/);
    expect(line).toContain('first INFO forged');
  });

  it('collapses breaks in the id, which an injected function controls', () => {
    const line = formatLogLine(record({ id: 'a1\nb2' }));
    expect(line).not.toMatch(/[\r\n]/);
    expect(line).toContain('a1 b2');
  });

  it('collapses breaks in the name, which configuration controls', () => {
    expect(formatLogLine(record({ name: 'check\nout' }))).not.toMatch(/[\r\n]/);
  });
});

describe('formatLogLine — rejected records', () => {
  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['a number', 42],
    ['undefined', undefined],
  ])('throws TypeError when the record is %s', (_label, value) => {
    expect(() => formatLogLine(/** @type {never} */ (value))).toThrow(TypeError);
  });

  it.each(['level', 'name', 'id', 'message'])('throws TypeError when %s is not a string', (key) => {
    expect(() => formatLogLine(record({ [key]: 42 }))).toThrow(new RegExp(`record.${key}`));
  });

  it('propagates the timestamp contract for a bad ts', () => {
    expect(() => formatLogLine(record({ ts: 'today' }))).toThrow(TypeError);
  });
});

describe('logger — the level threshold', () => {
  it('emits info and above by default, skipping debug and trace', () => {
    const { log, captured } = capturing();
    log.trace('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(captured.map((entry) => entry.record.level)).toEqual(['info', 'warn', 'error']);
  });

  it.each([
    ['trace', ['trace', 'debug', 'info', 'warn', 'error']],
    ['debug', ['debug', 'info', 'warn', 'error']],
    ['info', ['info', 'warn', 'error']],
    ['warn', ['warn', 'error']],
    ['error', ['error']],
    ['silent', []],
  ])('at level %s emits exactly %j', (level, expected) => {
    const { log, captured } = capturing({ level });
    log.trace('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(captured.map((entry) => entry.record.level)).toEqual(expected);
  });
});

describe('logger — the record handed to the sink', () => {
  it('carries the clock, level, name, id, message and args', () => {
    const { log, captured } = capturing({ name: 'checkout', id: 'a1b2c3d4' });
    log.info('order placed', { id: 42 }, 'extra');
    expect(captured[0].record).toEqual({
      ts: 0,
      level: 'info',
      name: 'checkout',
      id: 'a1b2c3d4',
      message: 'order placed',
      args: [{ id: 42 }, 'extra'],
    });
  });

  it('reads the injected clock per record', () => {
    let tick = 100;
    const { log, captured } = capturing({ now: () => (tick += 100) });
    log.info('one');
    log.info('two');
    expect(captured.map((entry) => entry.record.ts)).toEqual([200, 300]);
  });

  it('resolves a function id on every record, so it can change', () => {
    let n = 0;
    const { log, captured } = capturing({ id: () => `req-${(n += 1)}` });
    log.info('one');
    log.info('two');
    expect(captured.map((entry) => entry.record.id)).toEqual(['req-1', 'req-2']);
  });

  it('coerces a non-string id function result', () => {
    const { log, captured } = capturing({ id: () => /** @type {never} */ (99) });
    log.info('x');
    expect(captured[0].record.id).toBe('99');
  });

  it.each([
    ['a number', 42, '42'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
    ['an object', { a: 1 }, '[object Object]'],
  ])('coerces %s message to a string', (_label, message, expected) => {
    const { log, captured } = capturing();
    log.info(message);
    expect(captured[0].record.message).toBe(expected);
  });

  it('defaults the message to "undefined" when called with no arguments', () => {
    const { log, captured } = capturing();
    log.info();
    expect(captured[0].record).toMatchObject({ message: 'undefined', args: [] });
  });

  it('hands the sink the configured formatter, defaulting to formatLogLine', () => {
    const { log, captured } = capturing({ name: 'checkout' });
    log.info('hello');
    expect(captured[0].line).toBe(formatLogLine(captured[0].record));
  });

  it('uses a custom formatter when one is injected', () => {
    const { log, captured } = capturing({ format: (rec) => `${rec.level}:${rec.message}` });
    log.warn('careful');
    expect(captured[0].line).toBe('warn:careful');
  });
});

describe('logger — child contexts', () => {
  it('names a child after the context when the parent is unnamed', () => {
    const { log, captured } = capturing();
    log.child('db').info('x');
    expect(captured[0].record.name).toBe('db');
  });

  it('joins parent and child names with a dot', () => {
    const { log, captured } = capturing({ name: 'checkout' });
    log.child('db').info('x');
    expect(captured[0].record.name).toBe('checkout.db');
  });

  it('nests to any depth', () => {
    const { log, captured } = capturing({ name: 'a' });
    log.child('b').child('c').info('x');
    expect(captured[0].record.name).toBe('a.b.c');
  });

  it('inherits the level, sink, formatter, clock and id', () => {
    const { log, captured } = capturing({ level: 'error', id: 'shared', now: () => 7 });
    const child = log.child('db');
    child.info('skipped');
    child.error('kept');
    expect(captured).toHaveLength(1);
    expect(captured[0].record).toMatchObject({ id: 'shared', ts: 7, level: 'error' });
  });

  it('leaves the parent untouched', () => {
    const { log, captured } = capturing({ name: 'checkout' });
    log.child('db');
    log.info('x');
    expect(captured[0].record.name).toBe('checkout');
  });

  it.each([
    ['an empty string', ''],
    ['a number', 42],
    ['null', null],
  ])('throws TypeError for a context that is %s', (_label, context) => {
    const { log } = capturing();
    expect(() => log.child(/** @type {never} */ (context))).toThrow(TypeError);
  });
});

describe('logger — logging never throws into application code', () => {
  it('contains a throwing sink and reports it once through console.error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = logger({
      sink: () => {
        throw new Error('transport down');
      },
    });
    expect(() => log.info('x')).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toContain('log record dropped');
  });

  it('contains a throwing clock', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = logger({
      now: () => {
        throw new Error('no clock');
      },
      sink: () => {},
    });
    expect(() => log.info('x')).not.toThrow();
  });

  it('contains a throwing id function', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = logger({
      id: () => {
        throw new Error('no session');
      },
      sink: () => {},
    });
    expect(() => log.info('x')).not.toThrow();
  });

  it('contains a message whose toString throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { log } = capturing();
    const hostile = {
      toString() {
        throw new Error('hostile');
      },
    };
    expect(() => log.info(hostile)).not.toThrow();
  });

  it('contains a throwing formatter, since the default sink calls it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = logger({
      format: () => {
        throw new Error('bad format');
      },
    });
    expect(() => log.info('x')).not.toThrow();
  });

  it('stays silent rather than escalating when console.error itself throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('console gone');
    });
    const log = logger({
      sink: () => {
        throw new Error('transport down');
      },
    });
    expect(() => log.info('x')).not.toThrow();
  });

  it('survives an environment with no console at all', () => {
    const saved = globalThis.console;
    // @ts-expect-error — deleting the global is the scenario under test.
    delete globalThis.console;
    try {
      const log = logger({
        sink: () => {
          throw new Error('transport down');
        },
      });
      expect(() => log.info('x')).not.toThrow();
      expect(() => logger().info('x')).not.toThrow();
    } finally {
      globalThis.console = saved;
    }
  });

  it('skips a level below the threshold without touching the clock or sink', () => {
    const now = vi.fn(() => 0);
    const sink = vi.fn();
    logger({ level: 'error', now, sink }).debug('x');
    expect(now).not.toHaveBeenCalled();
    expect(sink).not.toHaveBeenCalled();
  });
});

describe('logger — the default console sink', () => {
  it.each([
    ['trace', 'debug'],
    ['debug', 'debug'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
  ])('writes a %s record with console.%s', (level, method) => {
    const spy = vi.spyOn(console, /** @type {'debug'} */ (method)).mockImplementation(() => {});
    logger({ level: 'trace', now: () => 0 })[level]('hello', { id: 42 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('hello');
    // Args stay separate so a devtools console still renders them as objects.
    expect(spy.mock.calls[0][1]).toEqual({ id: 42 });
  });

  it('does nothing when the console lacks the method, instead of throwing', () => {
    const saved = console.info;
    // @ts-expect-error — a console without the method is the scenario.
    console.info = undefined;
    try {
      expect(() => logger().info('x')).not.toThrow();
    } finally {
      console.info = saved;
    }
  });
});

describe('logger — rejected configuration', () => {
  it.each([
    ['an unknown level', { level: 'verbose' }],
    ['a non-string level', { level: 3 }],
    ['a non-string name', { name: 42 }],
    ['a non-function sink', { sink: 'console' }],
    ['a non-function format', { format: {} }],
    ['a non-function clock', { now: 0 }],
    ['an id that is neither string nor function', { id: 42 }],
  ])('throws TypeError for %s', (_label, options) => {
    expect(() => logger(/** @type {never} */ (options))).toThrow(TypeError);
  });

  it('names the allowed levels when the level is wrong', () => {
    expect(() => logger({ level: /** @type {never} */ ('verbose') })).toThrow(
      /trace, debug, info, warn, error, silent/,
    );
  });

  it('accepts no arguments at all', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(() => logger().info('x')).not.toThrow();
  });
});
