import './new_id';
import {
  assembleIndexedValue,
  constructKeyValue,
  toWrapped,
  unwrap,
  invertMap,
  isSubsetOfKeyPath,
  findMatchingPath,
  transformTTLValue,
  SEPARATOR,
} from './util';
import { InvalidIdException, InvalidIndexedFieldValueException, InvalidParentIdException } from './exceptions';
import { KeyPath } from './access_pattern';
import {
  ChildCollectionDefinition,
  RootCollectionDefinition,
} from './collection_definition';

jest.mock('./new_id', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => 'test-id'),
}));

describe('assembleIndexedValue', () => {
  test('returns just the collection name for an empty list of values', () => {
    expect(assembleIndexedValue('partition', 'collection', [], [])).toBe(
      'collection'
    );
    expect(assembleIndexedValue('sort', 'collection', [], [])).toBe(
      'collection'
    );
  });

  test('returns undefined for a list of undefined values', () => {
    expect(
      assembleIndexedValue(
        'partition',
        'collection',
        [['value'], ['some', 'thing']],
        [undefined, undefined]
      )
    ).toEqual('collection');
    expect(
      assembleIndexedValue('sort', 'collection', [['value']], [undefined])
    ).toBeUndefined();
  });

  test('returns a separated list of index values when present', () => {
    expect(
      assembleIndexedValue(
        'partition',
        'collection-name',
        [['value']],
        ['value1']
      )
    ).toBe('collection-name|-|value1');
    expect(
      assembleIndexedValue(
        'partition',
        'collection-name',
        [['path', 'one'], ['pathtwo']],
        ['value1', 'value22']
      )
    ).toBe('collection-name|-|value1|-|value22');
    expect(
      assembleIndexedValue(
        'partition',
        'collection-name',
        [['path', 'one'], ['pathtwo']],
        [undefined, 'value22']
      )
    ).toBe('collection-name|-||-|value22');
    expect(
      assembleIndexedValue(
        'sort',
        'collection-name',
        [['path', 'one'], ['pathtwo']],
        ['something', 'else', undefined]
      )
    ).toBe('collection-name|-|something|-|else|-|');
  });

  test('works with a custom separator', () => {
    expect(
      assembleIndexedValue(
        'partition',
        'collection-name',
        [['path', 'one']],
        ['value1'],
        '#'
      )
    ).toBe('collection-name#value1');
    expect(
      assembleIndexedValue(
        'partition',
        'collection-name',
        [['path', 'one'], ['pathtwo']],
        ['value1', 'value22'],
        '!'
      )
    ).toBe('collection-name!value1!value22');
    expect(
      assembleIndexedValue(
        'partition',
        'collection-name',
        [['path', 'one'], ['pathtwo']],
        [undefined, 'value22'],
        'oOo'
      )
    ).toBe('collection-nameoOooOovalue22');
  });
});

describe('constructKeyValue', () => {
  test('throws when a value path is not a string', () => {
    const valuePaths = [['topLevel1'], ['nested', 'value2']];

    const testValue = {
      _id: 'id-1',
      topLevel1: 'test',
      nested: { value2: 13 },
    };

    expect(() =>
      constructKeyValue(
        'partition',
        'test-collection',
        SEPARATOR,
        valuePaths,
        {},
        testValue
      )
    ).toThrow(InvalidIndexedFieldValueException);
  });

  test('throws when required value path is missing', () => {
    const valuePaths = [['topLevel1'], ['required']];

    const testValue = {
      _id: 'id-1',
      topLevel1: 'test',
    };

    expect(() =>
      constructKeyValue(
        'partition',
        'test-collection',
        SEPARATOR,
        valuePaths,
        {},
        testValue,
        [['required']]
      )
    ).toThrow(InvalidIndexedFieldValueException);
  });

  test.each([undefined, null, ''])(
    'throws when required value path is falsy',
    (falsy) => {
      const valuePaths = [['topLevel1'], ['required']];

      const testValue = {
        _id: 'id-1',
        topLevel1: 'test',
        required: falsy,
      };

      expect(() =>
        constructKeyValue(
          'partition',
          'test-collection',
          SEPARATOR,
          valuePaths,
          {},
          testValue,
          [['required']]
        )
      ).toThrow(InvalidIndexedFieldValueException);
    }
  );

  test('extracts and transforms key paths correctly', () => {
    const valuePaths = [['topLevel1'], ['nested', 'value2']];

    const testValue = {
      _id: 'id-1',
      topLevel1: 'test',
    };

    expect(
      constructKeyValue(
        'partition',
        'test-collection',
        SEPARATOR,
        valuePaths,
        {},
        testValue
      )
    ).toBe('test-collection|-|test|-|');
  });

  test('works with custom separators', () => {
    const valuePaths = [['topLevel1'], ['nested', 'value2']];

    const testValue = {
      _id: 'id-1',
      topLevel1: 'test',
    };

    expect(
      constructKeyValue(
        'partition',
        'test-collection',
        '##',
        valuePaths,
        {},
        testValue
      )
    ).toBe('test-collection##test##');
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
      stringNormalizer: (_: KeyPath, value: string): string =>
        value.trim().toLowerCase(),
    };
    expect(
      constructKeyValue(
        'partition',
        'test-collection',
        SEPARATOR,
        valuePaths,
        options,
        testValue
      )
    ).toBe('test-collection|-|au|-|nsw|-|sydney');
  });

  test('should construct TTL types correctly', () => {
    expect(
      constructKeyValue(
        'ttl',
        'test-collection',
        SEPARATOR,
        [['options', 'expiry']],
        {},
        { options: { expiry: new Date() }, _id: 'id1' }
      )
    ).toBe(Math.ceil(Date.now() / 1000));
  });
});

describe('transformTTLValue', () => {
  test('should return undefined when the parameter is undefined', () => {
    expect(transformTTLValue(undefined)).toBeUndefined();
  });

  test('should return undefined when the parameter is an object but not a Date', () => {
    expect(transformTTLValue({})).toBeUndefined();
  });

  test('should return undefined when the parameter is an string but not an ISO Date', () => {
    expect(transformTTLValue('193048394')).toBeUndefined();
  });

  test('should return a UNIX date (seconds) for a Date object', () => {
    const currentDate = new Date();
    expect(transformTTLValue(currentDate)).toEqual(
      Math.ceil(currentDate.getTime() / 1000)
    );
  });

  test('should return a UNIX date (seconds) for a number object', () => {
    const currentDate = new Date();
    expect(transformTTLValue(currentDate.getTime())).toEqual(
      Math.ceil(currentDate.getTime() / 1000)
    );
  });

  test('should return a UNIX date (seconds) for a string in ISO format', () => {
    const currentDate = new Date();
    expect(transformTTLValue(currentDate.toISOString())).toEqual(
      Math.ceil(currentDate.getTime() / 1000)
    );
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
    ],
  };
  const rootCollection: RootCollectionDefinition = {
    name: 'locations',
    layout,
    accessPatterns: [
      {
        indexName: 'gs1',
        partitionKeys: [countryValuePath],
        sortKeys: [stateValuePath, cityValuePath],
      },
    ],
    wrapperExtractKeys: [
      {
        key: 'gs1part',
        type: 'partition',
        valuePaths: [countryValuePath],
        options: {},
      },
      {
        key: 'gs1sort',
        type: 'sort',
        valuePaths: [stateValuePath, cityValuePath],
        options: {},
      },
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
      const value = {
        name: 'Sydney City',
        address: { country: 'AU', state: 'NSW', city: 'Sydney' },
      };
      expect(toWrapped(rootCollection, value)).toEqual({
        id: 'locations|-|test-id',
        sid: 'locations|-|test-id',
        gs1part: 'locations|-|AU',
        gs1sort: 'locations|-|NSW|-|Sydney',
        value: { ...value, _id: 'test-id' },
        type: 'locations',
      });
    });

    test('generates a wrapped value with a provided ID for a collection value', () => {
      const value = {
        _id: 'better-id',
        name: 'Sydney City',
        address: { country: 'AU', state: 'NSW', city: 'Sydney' },
      };
      expect(toWrapped(rootCollection, value)).toEqual({
        id: 'locations|-|better-id',
        sid: 'locations|-|better-id',
        gs1part: 'locations|-|AU',
        gs1sort: 'locations|-|NSW|-|Sydney',
        value: { ...value, _id: 'better-id' },
        type: 'locations',
      });
    });

    test('generates a wrapped value with a custom separator correctly', () => {
      const value = {
        _id: 'better-id',
        name: 'Sydney City',
        address: { country: 'AU', state: 'NSW', city: 'Sydney' },
      };
      const customCollection = {
        ...rootCollection,
        layout: { ...layout, indexKeySeparator: '#' },
      };
      expect(toWrapped(customCollection, value)).toEqual({
        id: 'locations#better-id',
        sid: 'locations#better-id',
        gs1part: 'locations#AU',
        gs1sort: 'locations#NSW#Sydney',
        value: { ...value, _id: 'better-id' },
        type: 'locations',
      });
    });

    test('generates a wrapped value with a custom ID generator for a collection value', () => {
      const value = {
        name: 'Sydney City',
        address: { country: 'AU', state: 'NSW', city: 'Sydney' },
      };
      const customCollection: RootCollectionDefinition = {
        ...rootCollection,
        idGenerator: () => String(Math.ceil(Math.random() * 1000)),
      };
      expect(toWrapped(customCollection, value)).toEqual({
        id: expect.stringMatching(/^locations|-|\d{1,4}$/),
        sid: expect.stringMatching(/^locations|-|\d{1,4}$/),
        gs1part: 'locations|-|AU',
        gs1sort: 'locations|-|NSW|-|Sydney',
        value: { ...value, _id: expect.stringMatching(/\d{1,4}/) },
        type: 'locations',
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
        type: 'locations_descriptors',
      });
    });

    test('throws an exception when the foreign key is missing', () => {
      const value = { lang: 'en', description: 'Sydney' };
      expect(() => toWrapped(childCollection, value)).toThrowError(
        InvalidParentIdException
      );
    });

    test('uses the provided _id correctly when it is valid', () => {
      const value = {
        _id: 'sydney-1-en',
        location: 'sydney-1',
        lang: 'en',
        description: 'Sydney',
      };
      expect(toWrapped(childCollection, value)).toEqual({
        id: 'locations|-|sydney-1',
        sid: 'locations_descriptors|-|sydney-1-en',
        value,
        type: 'locations_descriptors',
      });
    });
  });

  describe('with required index part', () => {
    const rootCollectionWithRequiredParts: RootCollectionDefinition = {
      name: 'locations',
      layout,
      accessPatterns: [
        {
          indexName: 'gs1',
          partitionKeys: [countryValuePath],
          sortKeys: [stateValuePath, cityValuePath],
          requiredPaths: [countryValuePath, stateValuePath, cityValuePath],
        },
      ],
      wrapperExtractKeys: [
        {
          key: 'gs1part',
          type: 'partition',
          valuePaths: [countryValuePath],
          requiredPaths: [countryValuePath, stateValuePath, cityValuePath],
          options: {},
        },
        {
          key: 'gs1sort',
          type: 'sort',
          valuePaths: [stateValuePath, cityValuePath],
          requiredPaths: [countryValuePath, stateValuePath, cityValuePath],
          options: {},
        },
      ],
    };
    test('generates a wrapped value with a generated ID for a collection value', () => {
      const value = {
        name: 'Sydney City',
        address: { country: 'AU', state: 'NSW', city: 'Sydney' },
      };
      expect(toWrapped(rootCollectionWithRequiredParts, value)).toEqual({
        id: 'locations|-|test-id',
        sid: 'locations|-|test-id',
        gs1part: 'locations|-|AU',
        gs1sort: 'locations|-|NSW|-|Sydney',
        value: { ...value, _id: 'test-id' },
        type: 'locations',
      });
    });

    test('throws if required properties are missing (pk)', () => {
      const value = {
        name: 'Sydney City',
        address: { state: 'NSW', city: 'Sydney' },
      };
      expect(() => toWrapped(rootCollectionWithRequiredParts, value)).toThrow(
        InvalidIndexedFieldValueException
      );
    });

    test('throws if required properties are missing (sk)', () => {
      const value = {
        name: 'Sydney City',
        address: { country: 'AU', city: 'Sydney' },
      };
      expect(() => toWrapped(rootCollectionWithRequiredParts, value)).toThrow(
        InvalidIndexedFieldValueException
      );
    });
  });

  test('throws an exception when an invalid ID is provided', () => {
    const value = {
      _id: 234872,
      name: 'Sydney City',
      address: { country: 'AU', state: 'NSW', city: 'Sydney' },
    };
    expect(() => toWrapped(rootCollection, value)).toThrow(InvalidIdException);
  });

  test('generates a wrapped value when some of the extracted keys are all undefined', () => {
    const value = { name: 'United Kingdom', address: { country: 'UK' } };
    expect(toWrapped(rootCollection, value)).toEqual({
      id: 'locations|-|test-id',
      sid: 'locations|-|test-id',
      gs1part: 'locations|-|UK',
      value: { ...value, _id: 'test-id' },
      type: 'locations',
    });
  });
});

describe('unwrap', () => {
  test('should just return the value', () => {
    expect(
      unwrap({
        value: { _id: 'test-id', name: 'Sydney' },
        type: 'test',
      })
    ).toEqual({ _id: 'test-id', name: 'Sydney' });
  });
});

describe('invertMap', () => {
  test('should work on empty maps', () => {
    expect(invertMap(new Map())).toEqual({});
  });

  test('should work safely on a string, string Map', () => {
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
  test('should identify an identical path as a subset', () => {
    expect(isSubsetOfKeyPath(['path'], ['path'])).toBe(true);
    expect(
      isSubsetOfKeyPath(['items', '0', 'values'], ['items', '0', 'values'])
    ).toBe(true);
  });

  test('should identify any subset path correctly', () => {
    expect(isSubsetOfKeyPath(['items', '0', 'values'], ['items'])).toBe(true);
    expect(isSubsetOfKeyPath(['items', '0', 'values'], ['items', '0'])).toBe(
      true
    );
  });

  test('should fail on paths that are not a true subset', () => {
    expect(isSubsetOfKeyPath(['items'], ['values'])).toBe(false);
    expect(isSubsetOfKeyPath(['items', '0', 'values'], ['values'])).toBe(false);
    expect(
      isSubsetOfKeyPath(['items', '0', 'values'], ['items', 'values'])
    ).toBe(false);
  });

  test('should identify the empty path as a subset', () => {
    // This test exists for completeness. An empty path is considered to be an
    // unexpected edge case.
    expect(isSubsetOfKeyPath(['items', '0', 'values'], [])).toBe(true);
  });
});

describe('findMatchingPath', () => {
  const keyPath = ['profile', 'items', '1'];

  test('should return undefined for a empty set of paths', () => {
    expect(findMatchingPath([], keyPath)).toBeUndefined();
  });

  test('should return undefined when there is no matching paths', () => {
    expect(
      findMatchingPath([['items'], ['address', 'line1']], keyPath)
    ).toBeUndefined();
  });

  test('should return the matching path from the keyPaths list', () => {
    expect(
      findMatchingPath(
        [['items'], ['profile', 'items'], ['address', 'line1']],
        keyPath
      )
    ).toEqual(['profile', 'items']);
  });
});
