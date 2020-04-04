import { createNameMapper, createValueMapper } from './mappers';

describe('createNameMapper', () => {
  it('should return a mapper when instantiated', () => {
    expect(createNameMapper()).toHaveProperty('get');
    expect(createNameMapper()).toHaveProperty('map');
  });

  it('should automatically include a mapping of value => #value', () => {
    const mapper = createNameMapper();
    expect(mapper.map('value')).toEqual('#value');
    expect(mapper.get()).toEqual({ '#value': 'value' });
  });

  it('should collect and add mapping properly', () => {
    const mapper = createNameMapper();

    // Remember that .map() calls are mutating the mapper internally
    // i.e. it has side-effects internally.
    expect(mapper.map('safeattribute1')).toBe('safeattribute1');
    expect(mapper.map('not.a.safe.one')).toBe('#attr0');
    expect(mapper.map('attribute')).toBe('#attr1');
    expect(mapper.map('1unsafe')).toBe('#attr2');

    // repeating a request should just return the previous match
    expect(mapper.map('attribute')).toBe('#attr1');

    expect(mapper.get()).toEqual({
      '#value': 'value',
      '#attr0': 'not.a.safe.one',
      '#attr1': 'attribute',
      '#attr2': '1unsafe',
    });
  });
});

describe('createValueMapper', () => {
  it('should return a mapper when instantiated', () => {
    expect(createValueMapper()).toHaveProperty('get');
    expect(createValueMapper()).toHaveProperty('map');
  });

  it('should collect and add mapping properly', () => {
    const mapper = createValueMapper();

    // Remember that .map() calls are mutating the mapper internally
    // i.e. it has side-effects internally.
    expect(mapper.map('a string value')).toBe(':value0');
    expect(mapper.map(1234)).toBe(':value1')
    expect(mapper.map([{ name: '1', value: 1}, { name: '2', value: null}])).toBe(':value2');
    expect(mapper.map({ anObject: true })).toBe(':value3');

    // repeated values are mapped again
    expect(mapper.map(1234)).toBe(':value4');

    expect(mapper.get()).toEqual({
      // values appear in DynamoDB format already
      ':value0': { S: 'a string value' },
      ':value1': { N: '1234' },
      ':value2': {
        L: [
          { M: { name: { S: '1'}, value: { N: '1' } } },
          { M: { name: { S: '2'}, value: { NULL: true } } },
        ],
      },
      ':value3': {
        M: {
          anObject: { BOOL: true },
        },
      },
      ':value4': { N: '1234' },
    });
  });
});

