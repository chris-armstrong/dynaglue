import { decrementLast, incrementLast } from './lexo';

describe('Lexographical operations', () => {
  describe('incrementLast', () => {
    it('should increment the empty string correctly', () =>
      expect(incrementLast('')).toBe(String.fromCodePoint(0)));
    it('should increment a random value correctly', () =>
      expect(incrementLast('123')).toBe('124'));
    it('should increment on the last character being max correctly', () =>
      expect(incrementLast('12\uFFFF')).toBe(
        '13\u0000'
      ));
  });
  describe('decrementLast', () => {
    it('should decrement the empty string correctly', () =>
      expect(decrementLast('')).toBe(''));
    it('should decrement a random value correctly', () =>
      expect(decrementLast('123')).toBe('122'));
    it('should decrement on the last character being min correctly', () =>
      expect(decrementLast('12\u0000')).toBe(
        '11\uFFFF'
      ));
  });
});
