import { 
  createUpdateActionForKey,
  findCollectionIndex,
  createNameMapper, 
  createValueMapper,
  mapAccessPatterns,
  updateById,
} from './update_by_id';
import { InvalidUpdatesException, IndexNotFoundException, InvalidUpdateValueException } from '../base/exceptions';
import { Collection } from '../base/collection';
import { createContext } from '../context';
import { createDynamoMock } from '../testutil/dynamo_mock';
import newId from '../base/new_id';
import { Converter, UpdateItemOutput, UpdateItemInput } from 'aws-sdk/clients/dynamodb';

const layoutForIndex = (index: number) => ({ indexName: `index${index}`, partitionKey: `pk${index}`, sortKey: `sk${index}` })
const layout = {
  tableName: 'general',
  primaryKey: {
    partitionKey: 'pk0',
    sortKey: 'sk0',
  },
  findKeys: Array(3).fill({}).map((_, index) => layoutForIndex(index + 1)),
};
const collectionWithNoAPs: Collection = {
  name: 'test-collection',
  layout,
};

const collectionWithAPs: Collection = {
  ...collectionWithNoAPs,
  accessPatterns: [
    { indexName: 'index1', partitionKeys: [], sortKeys: [['name']] },
    { indexName: 'index2', partitionKeys: [['department']], sortKeys: [['profile', 'staffNumber']] },
    { indexName: 'index3', partitionKeys: [], sortKeys: [['profile', 'email']]}
  ],
};

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
  it('should throw when the index is not found', () => {
    expect(() => findCollectionIndex(collectionWithNoAPs, 'notindex')).toThrowError(IndexNotFoundException);
  });

  it('should return the index when it is found', () => {
    expect(findCollectionIndex(collectionWithNoAPs, 'index1')).toEqual(jasmine.objectContaining({ indexName: 'index1' }));
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

describe('updateById', () => {
  it('should throw InvalidUpdatesException if the updates object is empty', async () => {
    const testId = newId();
    const ddbMock = createDynamoMock('updateItem', { });
    const context = createContext(ddbMock, [collectionWithNoAPs]);
    expect(updateById(
      context,
      collectionWithNoAPs.name,
      testId,
      { },
    )).rejects.toThrowError(InvalidUpdatesException);
  });

  it('should throw InvalidUpdateValueException if one of the updates is empty', async () => {
    const testId = newId();
    const ddbMock = createDynamoMock('updateItem', { });
    const context = createContext(ddbMock, [collectionWithNoAPs]);
    expect(updateById(
      context,
      collectionWithNoAPs.name,
      testId,
      { value1: undefined, value2: {} },
    )).rejects.toThrowError(InvalidUpdateValueException);
  });

  it('should handle basic set updates', async () => {
    const testId = newId();
    const createdValue = {
      _id: testId,
      profile: {
        name: 'new name',
      },
      topLevelValue: [1, 2, 4],
      somethingElse: false,
    };
    const ddbMock = createDynamoMock('updateItem', {
      Attributes: Converter.marshall({
        value: createdValue, 
      } as UpdateItemOutput),
    });
    const context = createContext(ddbMock, [collectionWithNoAPs]);
    const results = await updateById(context, collectionWithNoAPs.name, testId, {
      'profile.name': 'new name',
      'topLevelValue': [
        1,
        2,
        4,
      ],
    });
    expect(results).toEqual(createdValue);
    expect(ddbMock.updateItem).toBeCalledTimes(1);
    expect(ddbMock.updateItem).toBeCalledWith({
      TableName: layout.tableName,
      UpdateExpression: 'SET #value.profile.#attr0 = :value0, #value.topLevelValue = :value1',
      Key: {
        'pk0': { S: `test-collection|-|${testId}` },
        'sk0': { S: `test-collection|-|${testId}` },
      },
      ExpressionAttributeNames: {
        '#value': 'value',
        '#attr0': 'name',
      },
      ExpressionAttributeValues: {
        ':value0': { S: 'new name' },
        ':value1': {
          L: [
            { N: '1' },
            { N: '2' },
            { N: '4' },
          ],
        }
      },
      ReturnValues: 'ALL_NEW',
    } as UpdateItemInput);
  });
  
  it('should handle updates to multiple access patterns', async () => {
    const testId = newId();
    const createdValue = {
      _id: testId,
      name: 'new name',
      profile: {
        email: 'email@email.com',
        enabled: true,
      },
      department: 'department 2',
    };
    const ddbMock = createDynamoMock('updateItem', {
      Attributes: Converter.marshall({
        value: createdValue, 
      } as UpdateItemOutput),
    });
    const context = createContext(ddbMock, [collectionWithAPs]);
    const results = await updateById(context, collectionWithNoAPs.name, testId, {
      name: 'new name',
      profile: {
        email: 'email@email.com',
        enabled: true,
      },
      department: 'department 2', 
    });
    expect(results).toEqual(createdValue);
    expect(ddbMock.updateItem).toHaveBeenCalledWith({
      TableName: layout.tableName,
      UpdateExpression: 'SET #value.#attr0 = :value0, #value.profile = :value1, #value.department = :value2, sk1 = :value3, pk2 = :value4, sk3 = :value5 REMOVE sk2',
      Key: {
        'pk0': { S: `test-collection|-|${testId}` },
        'sk0': { S: `test-collection|-|${testId}` },
      },
      ExpressionAttributeNames: {
        '#value': 'value',
        '#attr0': 'name',
      },
      ExpressionAttributeValues: {
        ':value0': { S: 'new name' },
        ':value1': Converter.input({ email: 'email@email.com', enabled: true }),
        ':value2': { S: 'department 2' },
        ':value3': { S: `test-collection|-|new name` },
        ':value4': { S: `test-collection|-|department 2` },
        ':value5': { S: `test-collection|-|email@email.com` },
      },
      ReturnValues: 'ALL_NEW',
    } as UpdateItemInput);
  });
});
