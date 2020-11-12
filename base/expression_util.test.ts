import { isSafeAttributeName } from './expression_util';

describe('isSafeAttributeName', () => {
  it('should return false on reserved words of any case', () => {
    expect(isSafeAttributeName('agent')).toBe(false);
    expect(isSafeAttributeName('CLUSTERING')).toBe(false);
    expect(isSafeAttributeName('Comment')).toBe(false);
  });

  it('should return false on attribute names that are not safe to use unescaped', () => {
    expect(isSafeAttributeName('not safe')).toBe(false);
    expect(isSafeAttributeName('a.dotted.Value')).toBe(false);
    expect(isSafeAttributeName('3value')).toBe(false);
  });

  it('should return true on safe attribute names', () => {
    expect(isSafeAttributeName('animalType')).toBe(true);
    expect(isSafeAttributeName('usertype1')).toBe(true);
  });
});
