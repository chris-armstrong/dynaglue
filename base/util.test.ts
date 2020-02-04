import './new_id';
import { assembleIndexedValue, constructKeyValue, toWrapped, unwrap, invertMap, isSubsetOfKeyPath, findMatchingPath } from "./util";
import { PersistenceException, InvalidIdException, InvalidParentIdException } from "./exceptions";
import { KeyPath } from "./access_pattern";
import { ChildCollectionDefinition, RootCollectionDefinition } from "./collection_definition";

jest.mock('./new_id', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => 'test-id'),
}));

describe('assembleIndexedValue', () => {
  test('returns just the collection name for an empty list of values', () => {
    expect(assembleIndexedValue('partition', 'collection', [])).toBe('collection');
    expect(assembleIndexedValue('sort', 'collection', [])).toBe('collection');
  });

  test('returns undefined for a list of undefined values', () => {
    expect(assembleIndexedValue('partition', 'collection', [undefined, undefined])).toBeUndefined();
    expect(assembleIndexedValue('sort', 'collection', [undefined])).toBeUndefined();
  });

  test('returns a separated list of index values when present', () => {
    expect(assembleIndexedValue('partition', 'collection-name', ['value1']))
      .toBe('collection-name|-|value1');
    expect(assembleIndexedValue('partition', 'collection-name', ['value1', 'value22']))
      .toBe('collection-name|-|value1|-|value22');
    expect(assembleIndexedValue('partition', 'collection-name', [undefined, 'value22']))
      .toBe('collection-name|-||-|value22');
    expect(assembleIndexedValue('sort', 'collection-name', ['something', 'else', undefined]))
      .toBe('collection-name|-|something|-|else|-|');
  });
});

describe('constructKeyValue', () => {
  test('throws when a value path is not a string', () => {
    const valuePaths = [
      ['topLevel1'],
      ['nested', 'value2']
    ];

    const testValue = {
      _id: 'id-1',
      topLevel1: 'test',
      nested: { value2: 13 },
    };

    expect(() => constructKeyValue('partition', 'test-collection', valuePaths, {}, testValue))
      .toThrow(PersistenceException);
  });

  test('extracts and transforms key paths correctly', () => {
    const valuePaths = [
      ['topLevel1'],
      ['nested', 'value2']
    ];

    const testValue = {
      _id: 'id-1',
      topLevel1: 'test',
    };

    expect(constructKeyValue('partition', 'test-collection', valuePaths, {}, testValue))
      .toBe('test-collection|-|test|-|');
  });

  test('applies string normalisers as expected', () => {
    const valuePaths = [
      ['address', 'countryCode'],
      ['address', 'state'],
      ['address', 'city'],
    ];

    const testValue = {
      _id: 'id-1',
      address: {
        countryCode: 'AU',
        state: 'NSW',
        city: 'Sydney ',
      },
    };

    const options = {
      stringNormalizer: (path: KeyPath, value: string): string => value.trim().toLowerCase(),
    };
    expect(constructKeyValue('partition', 'test-collection', valuePaths, options, testValue))
      .toBe('test-collection|-|au|-|nsw|-|sydney');
  });
});

describe('toWrapped', () => {
  const countryValuePath = ['address', 'country'];
  const stateValuePath = ['address', 'state'];
  const cityValuePath = ['address', 'city'];
  const layout = {
    tableName: 'table-1',
    primaryKey: { partitionKey: 'id', sortKey: 'sid' },
    findKeys: [
      { indexName: 'gs1', partitionKey: 'gs1part', sortKey: 'gs1sort' },
    ]
  };
  const rootCollection: RootCollectionDefinition = {
    name: 'locations',
    layout,
    accessPatterns: [
      { indexName: 'gs1', partitionKeys: [countryValuePath], sortKeys: [stateValuePath, cityValuePath] },
    ],
    wrapperExtractKeys: [
      { key: 'gs1part', type: 'partition', valuePaths: [countryValuePath], options: {} },
      { key: 'gs1sort', type: 'sort', valuePaths: [stateValuePath, cityValuePath], options: {} },
    ],
  };

  const childCollection: ChildCollectionDefinition = {
    name: 'locations_descriptors',
    type: 'child',
    layout,
    foreignKeyPath: ['location'],
    parentCollectionName: 'locations',
    wrapperExtractKeys: [],
  };

  describe('with top-level collections', () => {
    test('generates a wrapped value with a generated ID for a collection value', () => {
      const value = { name: 'Sydney City', address: { country: 'AU', state: 'NSW', city: 'Sydney' } };
      expect(toWrapped(rootCollection, value)).toEqual({
        id: 'locations|-|test-id',
        sid: 'locations|-|test-id',
        gs1part: 'locations|-|AU',
        gs1sort: 'locations|-|NSW|-|Sydney',
        value: { ...value, _id: 'test-id' },
      });
    });

    test('generates a wrapped value with a provided ID for a collection value', () => {
      const value = { _id: 'better-id', name: 'Sydney City', address: { country: 'AU', state: 'NSW', city: 'Sydney' } };
      expect(toWrapped(rootCollection, value)).toEqual({
        id: 'locations|-|better-id',
        sid: 'locations|-|better-id',
        gs1part: 'locations|-|AU',
        gs1sort: 'locations|-|NSW|-|Sydney',
        value: { ...value, _id: 'better-id' },
      });
    });
  });

  describe('with child collections', () => {
    test('generates a wrapped value with a generated ID for a collection value', () => {
      const value = { location: 'sydney-1', lang: 'en', description: 'Sydney' };
      expect(toWrapped(childCollection, value)).toEqual({
        id: 'locations|-|sydney-1',
        sid: 'locations_descriptors|-|test-id',
        value: { ...value, _id: 'test-id' },
      });
    });

    test('throws an exception when the foreign key is missing', () => {
      const value = { lang: 'en', description: 'Sydney' };
      expect(() => toWrapped(childCollection, value)).toThrowError(InvalidParentIdException);
    });

    test('uses the provided _id correctly when it is valid', () => {
      const value = { _id: 'sydney-1-en', location: 'sydney-1', lang: 'en', description: 'Sydney' };
      expect(toWrapped(childCollection, value)).toEqual({
        id: 'locations|-|sydney-1',
        sid: 'locations_descriptors|-|sydney-1-en',
        value,
      });
    });
  });

  test('throws an exception when an invalid ID is provided', () => {
    const value = { _id: 234872, name: 'Sydney City', address: { country: 'AU', state: 'NSW', city: 'Sydney' } };
    expect(() => toWrapped(rootCollection, value))
      .toThrow(InvalidIdException);
  });

  test('generates a wrapped value when some of the extracted keys are all undefined', () => {
    const value = { name: 'United Kingdom', address: { country: 'UK' } };
    expect(toWrapped(rootCollection, value)).toEqual({
      id: 'locations|-|test-id',
      sid: 'locations|-|test-id',
      gs1part: 'locations|-|UK',
      value: { ...value, _id: 'test-id' },
    });
  });
});

describe('unwrap', () => {
  test('should just return the value', () => {
    expect(unwrap({
      value: { _id: 'test-id', name: 'Sydney' },
    })).toEqual({ _id: 'test-id', name: 'Sydney' });
  });
});

describe('invertMap', () => {
  it('should work on empty maps', () => {
    expect(invertMap(new Map())).toEqual({});
  });

  it('should work safely on a string, string Map', () => {
    const myMap = new Map<string, string>();
    myMap.set('part1', 'value 1');
    myMap.set('part2', 'value 2');
    expect(invertMap(myMap)).toEqual({
      'value 1': 'part1',
      'value 2': 'part2',
    });
  });
});

describe('isSubsetOfKeyPath', () => {
  it('should identify an identical path as a subset', () => {
    expect(isSubsetOfKeyPath(['path'], ['path'])).toBe(true);
    expect(isSubsetOfKeyPath(['items', '0', 'values'], ['items', '0', 'values'])).toBe(true);
  });

  it('should identify any subset path correctly', () => {
    expect(isSubsetOfKeyPath(['items', '0', 'values'], ['items'])).toBe(true);
    expect(isSubsetOfKeyPath(['items', '0', 'values'], ['items', '0'])).toBe(true);
  });

  it('should fail on paths that are not a true subset', () => {
    expect(isSubsetOfKeyPath(['items'], ['values'])).toBe(false);
    expect(isSubsetOfKeyPath(['items', '0', 'values'], ['values'])).toBe(false);
    expect(isSubsetOfKeyPath(['items', '0', 'values'], ['items', 'values'])).toBe(false);
  });

  it('should identify the empty path as a subset', () => {
    // This test exists for completeness. An empty path is considered to be an
    // unexpected edge case.
    expect(isSubsetOfKeyPath(['items', '0', 'values'], [])).toBe(true);
  });
});

describe('findMatchingPath', () => {
  const keyPath = ['profile', 'items', '1'];
  
  it('should return undefined for a empty set of paths', () => {
    expect(findMatchingPath([], keyPath)).toBeUndefined();
  });

  it('should return undefined when there is no matching paths', () => {
    expect(findMatchingPath([['items'], ['address', 'line1']], keyPath)).toBeUndefined();
  });

  it('should return the matching path from the keyPaths list', () => {
    expect(findMatchingPath([['items'], ['profile', 'items'], ['address', 'line1']], keyPath)).toEqual(['profile', 'items']);
  });
});
