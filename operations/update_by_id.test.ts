import { 
  createUpdateActionForKey,
  findCollectionIndex,
  createNameMapper, 
  createValueMapper,
  mapAccessPatterns,
} from './update_by_id';
import { InvalidUpdatesException, IndexNotFoundException } from '../base/exceptions';
import { Collection } from '../base/collection';

describe('createUpdateActionForKey', () => {
  const indexLayout = {
    indexName: 'index1',
    partitionKey: 'pk1',
    sortKey: 'sk1',
  };

  const collectionName = 'addresses';

  const partitionKPs = [
    ['userType'],
    ['profile', 'phoneNumber']
  ];

  const sortKPs = [
    ['location', 'department'],
    ['location', 'floor'],
    ['userType'],
  ];

  it('should throw an InvalidUpdatesException for a partition key that is missing updates to all its key paths', () => {
    const updates = { 'profile': { name: 'Chris Armstrong', phoneNumber: '123456' } };
    expect(() => createUpdateActionForKey(collectionName, 'partition', partitionKPs, indexLayout, updates))
      .toThrowError(InvalidUpdatesException);
  });

  it('should return undefined when there is no updates to the partition key in the set of updates', () => {
    const updates = { staffCount: 5 };
    expect(createUpdateActionForKey(collectionName, 'partition', partitionKPs, indexLayout, updates))
      .toBeUndefined();
  });

  it('should return undefined when there is no updates to the sort key in the set of updates', () => {
    const updates = { staffCount: 5 };
    expect(createUpdateActionForKey(collectionName, 'sort', sortKPs, indexLayout, updates))
      .toBeUndefined();
  });

  it('should correctly calculate the update action for a scalar key', () => {
    const updates = { 'profile': { name: 'Chris Armstrong', phoneNumber: '123456' }, type: 'A' };
    const keyPaths = [['profile', 'phoneNumber']];
    expect(createUpdateActionForKey(collectionName, 'partition', keyPaths, indexLayout, updates))
      .toEqual({
        attributeName: 'pk1',
        value: `${collectionName}|-|123456`,
      });
  });

  it('should correctly calculate the update action for an empty key', () => {
    const updates = { 'profile': { name: 'Chris Armstrong', phoneNumber: '123456' }, type: 'A' };
    const keyPaths = [];
    expect(createUpdateActionForKey(collectionName, 'partition', keyPaths, indexLayout, updates))
      .toBeUndefined();
  });

  it('should correctly calculate the update action for a nested-value composite key', () => {
    const updates = { 'profile': { name: 'Chris Armstrong', phoneNumber: '123456' }, userType: 'AAA' };
    expect(createUpdateActionForKey(collectionName, 'partition', partitionKPs, indexLayout, updates))
      .toEqual({
        attributeName: 'pk1',
        value: `${collectionName}|-|AAA|-|123456`,
      });
  });

  it('should correctly calculate the update action for a directly updated composite key', () => {
    const updates = { 'profile.name': 'Chris Armstrong', 'profile.phoneNumber': '123456', userType: 'AAA' };
    expect(createUpdateActionForKey(collectionName, 'partition', partitionKPs, indexLayout, updates))
      .toEqual({
        attributeName: 'pk1',
        value: `${collectionName}|-|AAA|-|123456`,
      });
  });
});

describe('findCollectionIndex', () => {
  const indexLayout = {
    indexName: 'index1',
    partitionKey: 'pk1',
    sortKey: 'sk1',
  };

  const collection: Collection = {
    name: 'test-collection',
    layout: {
      tableName: 'general',
      primaryKey: {
        partitionKey: 'pk0',
        sortKey: 'sk0',
      },
      findKeys: [indexLayout],
    }
  };

  it('should throw when the index is not found', () => {
    expect(() => findCollectionIndex(collection, 'notindex')).toThrowError(IndexNotFoundException);
  });

  it('should return the index when it is found', () => {
    expect(findCollectionIndex(collection, 'index1')).toEqual(indexLayout);
  });
});

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

describe('mapAccessPatterns', () => {
  const layoutForIndex = index => ({ indexName: `index${index}`, partitionKey: `pk${index}`, sortKey: `sk${index}` })
  const collectionWithNoAPs: Collection = {
    name: 'test-collection',
    layout: {
      tableName: 'general',
      primaryKey: {
        partitionKey: 'pk0',
        sortKey: 'sk0',
      },
      findKeys: Array(3).fill({}).map((_, index) => layoutForIndex(index + 1)),
    },
  };

  const collectionWithAPs: Collection = {
    ...collectionWithNoAPs,
    accessPatterns: [
      { indexName: 'index1', partitionKeys: [], sortKeys: [['name']] },
      { indexName: 'index2', partitionKeys: [['department']], sortKeys: [['profile', 'staffNumber']] },
      { indexName: 'index3', partitionKeys: [], sortKeys: [['profile', 'email']]}
    ],
  };

  it('should return an empty array if the collection has no access patterns', () => {
    const mappers = { nameMapper: createNameMapper(), valueMapper: createValueMapper() };
    const updates = {
      'x.y': 8,
      'name': 'new name',
    };
    const { setActions, deleteActions } = mapAccessPatterns(collectionWithNoAPs, mappers, updates);
    expect(setActions).toEqual([]);
    expect(deleteActions).toEqual([]);
    expect(mappers.nameMapper.get()).toEqual({ '#value': 'value' });
    expect(mappers.valueMapper.get()).toEqual({});
  });

  it('should map simple index updates when part of the update object', () => {
    const mappers = { nameMapper: createNameMapper(), valueMapper: createValueMapper() };
    const updates = {
      'name': 'a new name',
      'x.y': 8
    };
    const { setActions, deleteActions } = mapAccessPatterns(collectionWithAPs, mappers, updates);
    expect(setActions).toEqual(['sk1 = :value0']);
    expect(deleteActions).toEqual([]);
    expect(mappers.nameMapper.get()).toEqual({
      '#value': 'value',
    });
    expect(mappers.valueMapper.get()).toEqual({
      ':value0': { S: 'test-collection|-|a new name' },
    });
  });

  it('should handle more complex index updates when part of the update object', () => {
    const mappers = { nameMapper: createNameMapper(), valueMapper: createValueMapper() };
    const updates = {
      name: 'a new name',
      department: 'x',
      profile: {
        staffNumber: 'STAFF38',
      },
    };
    const { setActions, deleteActions } = mapAccessPatterns(collectionWithAPs, mappers, updates);
    expect(setActions).toEqual(['sk1 = :value0', 'pk2 = :value1', 'sk2 = :value2']);
    expect(deleteActions).toEqual(['sk3']);
    expect(mappers.nameMapper.get()).toEqual({
      '#value': 'value',
    });
    expect(mappers.valueMapper.get()).toEqual({
      ':value0': { S: 'test-collection|-|a new name' },
      ':value1': { S: 'test-collection|-|x' },
      ':value2': { S: 'test-collection|-|STAFF38' },
    });
  });
});

xdescribe('updateById', () => {
 xit('should handle basic set updates', async () => {

 });

});
