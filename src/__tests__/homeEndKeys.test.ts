import { describe, it, expect } from 'vitest';
import { resolveHomeEndKey } from '../utils/homeEndKeys';

describe('resolveHomeEndKey', () => {
  describe('false — never consumed', () => {
    it('passes both keys through regardless of selection', () => {
      expect(resolveHomeEndKey(false, 'Home', 2, 5)).toBeNull();
      expect(resolveHomeEndKey(false, 'End', 2, 5)).toBeNull();
    });
  });

  describe('true — always jump within the dropdown', () => {
    it('Home goes to the first item, End to the last', () => {
      expect(resolveHomeEndKey(true, 'Home', 2, 5)).toBe(0);
      expect(resolveHomeEndKey(true, 'End', 2, 5)).toBe(4);
    });

    it('stays consumed even when already at that end', () => {
      expect(resolveHomeEndKey(true, 'Home', 0, 5)).toBe(0);
      expect(resolveHomeEndKey(true, 'End', 4, 5)).toBe(4);
    });
  });

  describe("'once' — pass through when the highlight can't move", () => {
    it('jumps when not yet at that end', () => {
      expect(resolveHomeEndKey('once', 'End', 0, 5)).toBe(4);
      expect(resolveHomeEndKey('once', 'Home', 3, 5)).toBe(0);
    });

    it('End passes through when already on the last item', () => {
      expect(resolveHomeEndKey('once', 'End', 4, 5)).toBeNull();
    });

    it('Home passes through when already on the first item', () => {
      expect(resolveHomeEndKey('once', 'Home', 0, 5)).toBeNull();
    });

    it('a single-item list passes both keys through', () => {
      expect(resolveHomeEndKey('once', 'Home', 0, 1)).toBeNull();
      expect(resolveHomeEndKey('once', 'End', 0, 1)).toBeNull();
    });
  });

  describe('no highlighted item', () => {
    it('passes through in every mode', () => {
      for (const mode of [true, 'once'] as const) {
        expect(resolveHomeEndKey(mode, 'Home', -1, 5)).toBeNull();
        expect(resolveHomeEndKey(mode, 'End', -1, 5)).toBeNull();
      }
    });

    it('passes through for an empty list', () => {
      expect(resolveHomeEndKey(true, 'End', 0, 0)).toBeNull();
    });
  });
});
