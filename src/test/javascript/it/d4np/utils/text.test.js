import { describe, it, expect } from 'vitest';
import {
  truncate,
  wrapText,
  fixedWidth,
} from '../../../../../main/javascript/it/d4np/utils/text.js';

// Example tests (roadmap 9.1, spec 02 §2 items F26-F28, ADR-0019) for the text helpers.

describe('truncate — spec examples', () => {
  it('shortens with the default ellipsis, marker included in the budget', () => {
    expect(truncate('The quick brown fox', 10)).toBe('The quick…');
    expect(truncate('The quick brown fox', 10)).toHaveLength(10);
  });

  it('returns a fitting string unchanged, without a marker', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('exactly-10', 10)).toBe('exactly-10');
  });

  it('keeps the ending when cutting from the start', () => {
    expect(truncate('/very/long/path/file.txt', 12, { position: 'start' })).toBe('…th/file.txt');
  });

  it('cuts hard when the ellipsis is empty', () => {
    expect(truncate('abcdef', 3, { ellipsis: '' })).toBe('abc');
  });
});

describe('truncate — edge cases', () => {
  it('is idempotent — truncating an already truncated string changes nothing', () => {
    const once = truncate('The quick brown fox', 10);
    expect(truncate(once, 10)).toBe(once);
  });

  it('truncates the ellipsis itself when the budget cannot hold it', () => {
    expect(truncate('abcdef', 2, { ellipsis: '...' })).toBe('..');
    expect(truncate('abcdef', 2, { ellipsis: '...', position: 'start' })).toBe('..');
    expect(truncate('abcdef', 0)).toBe('');
  });

  it('accepts a multi-character marker', () => {
    expect(truncate('abcdefghij', 8, { ellipsis: '...' })).toBe('abcde...');
  });

  it('handles the empty string', () => {
    expect(truncate('', 5)).toBe('');
    expect(truncate('', 0)).toBe('');
  });

  it('never emits a lone surrogate, shortening by one unit instead', () => {
    // '😀' is two code units; a cut between its halves drops the whole pair.
    const result = truncate('a😀bc', 2, { ellipsis: '' });
    expect(result).toBe('a');
    expect(result.length).toBeLessThan(2);
  });

  it('keeps a whole surrogate pair when the budget reaches its end', () => {
    expect(truncate('a😀bc', 3, { ellipsis: '' })).toBe('a😀');
    expect(truncate('a😀bc', 4, { ellipsis: '' })).toBe('a😀b');
  });
});

describe('truncate — rejected input', () => {
  it('throws TypeError on non-string input', () => {
    expect(() => truncate(/** @type {any} */ (42), 5)).toThrow(TypeError);
    expect(() => truncate(/** @type {any} */ (null), 5)).toThrow(TypeError);
  });

  it('throws TypeError on an invalid maxLength', () => {
    expect(() => truncate('abc', -1)).toThrow(TypeError);
    expect(() => truncate('abc', 1.5)).toThrow(TypeError);
    expect(() => truncate('abc', /** @type {any} */ ('5'))).toThrow(TypeError);
  });

  it('throws TypeError on an invalid ellipsis or position', () => {
    expect(() => truncate('abc', 2, { ellipsis: /** @type {any} */ (1) })).toThrow(TypeError);
    expect(() => truncate('abc', 2, { position: /** @type {any} */ ('middle') })).toThrow(
      TypeError,
    );
  });
});

describe('wrapText — spec examples', () => {
  it('wraps greedily on word boundaries', () => {
    expect(wrapText('the quick brown fox jumps', 10)).toBe('the quick\nbrown fox\njumps');
  });

  it('breaks long words only when asked', () => {
    expect(wrapText('supercalifragilistic', 8, { breakLongWords: true })).toBe(
      'supercal\nifragili\nstic',
    );
    expect(wrapText('supercalifragilistic', 8)).toBe('supercalifragilistic');
  });
});

describe('wrapText — whitespace and paragraphs', () => {
  it('collapses runs of whitespace into a single space', () => {
    expect(wrapText('a   \t  b', 10)).toBe('a b');
  });

  it('preserves existing line breaks as paragraph boundaries', () => {
    expect(wrapText('one two\nthree four', 8)).toBe('one two\nthree\nfour');
  });

  it('re-wrapping at the same width is a no-op', () => {
    const once = wrapText('the quick brown fox jumps over the lazy dog', 12);
    expect(wrapText(once, 12)).toBe(once);
  });

  it('handles empty and whitespace-only input', () => {
    expect(wrapText('', 5)).toBe('');
    expect(wrapText('   ', 5)).toBe('');
    expect(wrapText('\n\n', 5)).toBe('\n\n');
  });

  it('gives an over-long word its own line without losing neighbours', () => {
    expect(wrapText('hi supercalifragilistic ok', 8)).toBe('hi\nsupercalifragilistic\nok');
  });

  it('breaks a long word while filling the line already in progress', () => {
    expect(wrapText('abc defghijklmno', 8, { breakLongWords: true })).toBe('abc defg\nhijklmno');
  });

  it('advances even when the width is narrower than one code point', () => {
    expect(wrapText('😀😀', 1, { breakLongWords: true })).toBe('😀\n😀');
  });
});

describe('wrapText — rejected input', () => {
  it('throws TypeError on non-string input', () => {
    expect(() => wrapText(/** @type {any} */ (null), 5)).toThrow(TypeError);
  });

  it('throws TypeError on a non-positive width', () => {
    expect(() => wrapText('abc', 0)).toThrow(TypeError);
    expect(() => wrapText('abc', -3)).toThrow(TypeError);
    expect(() => wrapText('abc', 2.5)).toThrow(TypeError);
  });
});

describe('fixedWidth — spec examples', () => {
  it('pads to the right by default', () => {
    expect(fixedWidth('INFO', 8)).toBe('INFO    ');
  });

  it('pads left with a custom fill when right-aligned', () => {
    expect(fixedWidth('42', 6, { align: 'right', pad: '0' })).toBe('000042');
  });

  it('truncates content that does not fit', () => {
    expect(fixedWidth('egl-utils-js', 6)).toBe('egl-ut');
  });

  it('keeps the ending when truncating from the start', () => {
    expect(fixedWidth('com.example.Service', 12, { truncate: 'start' })).toBe('mple.Service');
  });
});

describe('fixedWidth — alignment and padding', () => {
  it('centers with the extra pad char on the right', () => {
    expect(fixedWidth('ab', 6, { align: 'center' })).toBe('  ab  ');
    expect(fixedWidth('ab', 7, { align: 'center' })).toBe('  ab   ');
  });

  it('repeats a multi-character pad and still lands on the exact width', () => {
    expect(fixedWidth('x', 5, { pad: '-=' })).toBe('x-=-=');
    expect(fixedWidth('x', 5, { pad: '-=', align: 'right' })).toBe('-=-=x');
  });

  it('returns the input unchanged when it already measures exactly', () => {
    expect(fixedWidth('abcd', 4)).toBe('abcd');
  });

  it('produces exactly width even when a surrogate pair is dropped', () => {
    const result = fixedWidth('a😀', 2);
    expect(result).toHaveLength(2);
    expect(result).toBe('a ');
  });

  it('handles zero width and the empty string', () => {
    expect(fixedWidth('abc', 0)).toBe('');
    expect(fixedWidth('', 3)).toBe('   ');
  });
});

describe('fixedWidth — rejected input', () => {
  it('throws TypeError on non-string input', () => {
    expect(() => fixedWidth(/** @type {any} */ (7), 5)).toThrow(TypeError);
  });

  it('throws TypeError on an invalid width', () => {
    expect(() => fixedWidth('abc', -1)).toThrow(TypeError);
    expect(() => fixedWidth('abc', Number.NaN)).toThrow(TypeError);
  });

  it('throws TypeError on an empty or non-string pad', () => {
    expect(() => fixedWidth('abc', 5, { pad: '' })).toThrow(TypeError);
    expect(() => fixedWidth('abc', 5, { pad: /** @type {any} */ (0) })).toThrow(TypeError);
  });

  it('throws TypeError on an unknown align or truncate side', () => {
    expect(() => fixedWidth('abc', 5, { align: /** @type {any} */ ('middle') })).toThrow(TypeError);
    expect(() => fixedWidth('abc', 5, { truncate: /** @type {any} */ ('both') })).toThrow(
      TypeError,
    );
  });
});
