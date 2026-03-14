import { describe, it, expect } from 'vitest';
import { normalizeTypographicChars } from '../utils/textUtils';

describe('normalizeTypographicChars', () => {
  describe('smart double quotes', () => {
    it('converts left double quote \u201C to "', () => {
      expect(normalizeTypographicChars('\u201Chello\u201D')).toBe('"hello"');
    });

    it('converts right double quote \u201D to "', () => {
      expect(normalizeTypographicChars('say \u201Chi\u201D')).toBe('say "hi"');
    });

    it('converts double low-9 quote \u201E to "', () => {
      expect(normalizeTypographicChars('\u201Etest\u201C')).toBe('"test"');
    });

    it('converts double high-reversed-9 quote \u201F to "', () => {
      expect(normalizeTypographicChars('\u201Ftest\u201D')).toBe('"test"');
    });

    it('converts double prime \u2033 to "', () => {
      expect(normalizeTypographicChars('5\u2033')).toBe('5"');
    });

    it('converts guillemets \u00AB \u00BB to "', () => {
      expect(normalizeTypographicChars('\u00ABhello\u00BB')).toBe('"hello"');
    });
  });

  describe('smart single quotes', () => {
    it('converts left single quote \u2018 to \'', () => {
      expect(normalizeTypographicChars('\u2018hello\u2019')).toBe("'hello'");
    });

    it('converts right single quote / apostrophe \u2019 to \'', () => {
      expect(normalizeTypographicChars('don\u2019t')).toBe("don't");
    });

    it('converts single low-9 quote \u201A to \'', () => {
      expect(normalizeTypographicChars('\u201Atest\u2018')).toBe("'test'");
    });

    it('converts single high-reversed-9 quote \u201B to \'', () => {
      expect(normalizeTypographicChars('\u201Btest')).toBe("'test");
    });

    it('converts prime \u2032 to \'', () => {
      expect(normalizeTypographicChars('5\u2032')).toBe("5'");
    });
  });

  describe('dashes', () => {
    it('converts en dash \u2013 to -', () => {
      expect(normalizeTypographicChars('2020\u20132024')).toBe('2020-2024');
    });

    it('converts em dash \u2014 to -', () => {
      expect(normalizeTypographicChars('hello\u2014world')).toBe('hello-world');
    });
  });

  describe('ellipsis', () => {
    it('converts horizontal ellipsis \u2026 to ...', () => {
      expect(normalizeTypographicChars('wait\u2026')).toBe('wait...');
    });

    it('expands ellipsis (1 char becomes 3)', () => {
      const result = normalizeTypographicChars('\u2026');
      expect(result).toBe('...');
      expect(result.length).toBe(3);
    });
  });

  describe('spaces', () => {
    it('converts non-breaking space \u00A0 to regular space', () => {
      expect(normalizeTypographicChars('hello\u00A0world')).toBe('hello world');
    });

    it('converts narrow no-break space \u202F to regular space', () => {
      expect(normalizeTypographicChars('hello\u202Fworld')).toBe('hello world');
    });

    it('converts figure space \u2007 to regular space', () => {
      expect(normalizeTypographicChars('100\u2007200')).toBe('100 200');
    });
  });

  describe('fullwidth ASCII', () => {
    it('converts fullwidth colon \uFF1A to :', () => {
      expect(normalizeTypographicChars('status\uFF1Aactive')).toBe('status:active');
    });

    it('converts fullwidth parens', () => {
      expect(normalizeTypographicChars('\uFF08a OR b\uFF09')).toBe('(a OR b)');
    });

    it('converts fullwidth letters', () => {
      expect(normalizeTypographicChars('\uFF21\uFF2E\uFF24')).toBe('AND');
    });

    it('converts fullwidth digits', () => {
      expect(normalizeTypographicChars('\uFF11\uFF12\uFF13')).toBe('123');
    });
  });

  describe('mixed input', () => {
    it('normalizes a realistic Outlook-pasted query', () => {
      const input = 'status:\u201Cactive\u201D AND price:>100';
      expect(normalizeTypographicChars(input)).toBe('status:"active" AND price:>100');
    });

    it('normalizes multiple typographic chars in one string', () => {
      const input = '\u201Chello\u201D \u2014 don\u2019t \u2026 \u00A0';
      expect(normalizeTypographicChars(input)).toBe('"hello" - don\'t ...  ');
    });

    it('leaves normal ASCII unchanged', () => {
      const input = 'status:active AND price:>100 OR (name:"test")';
      expect(normalizeTypographicChars(input)).toBe(input);
    });

    it('returns empty string for empty input', () => {
      expect(normalizeTypographicChars('')).toBe('');
    });
  });
});
