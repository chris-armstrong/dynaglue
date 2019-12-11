import './new_id';
import { assembleIndexedValue, constructKeyValue, toWrapped, unwrap } from "./util";
import { PersistenceException, InvalidIdException } from "./exceptions";
import { KeyPath } from "./access_pattern";
import { CollectionDefinition } from "./collection_definition";

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
  const collectionDefinition: CollectionDefinition = {
    name: 'locations',
    layout: {
      tableName: 'table-1',
      primaryKey: { partitionKey: 'id', sortKey: 'sid' },
      findKeys: [
        { indexName: 'gs1', partitionKey: 'gs1part', sortKey: 'gs1sort' },
      ]
    },
    accessPatterns: [
      { indexName: 'gs1', partitionKeys: [countryValuePath], sortKeys: [stateValuePath, cityValuePath] },
    ],
    wrapperExtractKeys: [
      { key: 'gs1part', type: 'partition', valuePaths: [countryValuePath], options: {} },
      { key: 'gs1sort', type: 'sort', valuePaths: [stateValuePath, cityValuePath], options: {} },
    ],
  };

  test('generates a wrapped value with a generated ID for a collection value', () => {
    const value = { name: 'Sydney City', address: { country: 'AU', state: 'NSW', city: 'Sydney' } };
    expect(toWrapped(collectionDefinition, value)).toEqual({
      id: 'locations|-|test-id',
      sid: 'locations|-|test-id',
      gs1part: 'locations|-|AU',
      gs1sort: 'locations|-|NSW|-|Sydney',
      value: { ...value, _id: 'test-id' },
    });
  });

  test('throws an exception when an invalid ID is provided', () => {
    const value = { _id: 234872, name: 'Sydney City', address: { country: 'AU', state: 'NSW', city: 'Sydney' } };
    expect(() => toWrapped(collectionDefinition, value))
      .toThrow(InvalidIdException);
  });

  test('generates a wrapped value with a provided ID for a collection value', () => {
    const value = { _id: 'better-id', name: 'Sydney City', address: { country: 'AU', state: 'NSW', city: 'Sydney' } };
    expect(toWrapped(collectionDefinition, value)).toEqual({
      id: 'locations|-|better-id',
      sid: 'locations|-|better-id',
      gs1part: 'locations|-|AU',
      gs1sort: 'locations|-|NSW|-|Sydney',
      value: { ...value, _id: 'better-id' },
    });
  });

  test('generates a wrapped value when some of the extracted keys are all undefined', () => {
    const value = { name: 'United Kingdom', address: { country: 'UK' } };
    expect(toWrapped(collectionDefinition, value)).toEqual({
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