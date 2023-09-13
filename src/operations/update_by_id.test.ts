import {
  createUpdateActionForKey,
  findCollectionIndex,
  mapAccessPatterns,
  updateById,
  createUpdateActionForTTLKey,
  StrictChangesDocument,
} from './update_by_id';
import {
  InvalidUpdatesException,
  IndexNotFoundException,
  InvalidUpdateValueException,
  InvalidIndexedFieldValueException,
} from '../base/exceptions';
import { Collection } from '../base/collection';
import { createContext } from '../context';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import newId from '../base/new_id';
import { createNameMapper, createValueMapper } from '../base/mappers';
import { CollectionLayout, SecondaryIndexLayout } from '../base/layout';
import {
  DynamoDBClient,
  UpdateItemInput,
  UpdateItemOutput,
} from '@aws-sdk/client-dynamodb';
import { convertToAttr, marshall } from '@aws-sdk/util-dynamodb';
import { KeyPath } from '../base/access_pattern';

const layoutForIndex = (index: number): SecondaryIndexLayout => ({
  indexName: `index${index}`,
  partitionKey: `pk${index}`,
  sortKey: `sk${index}`,
});
const layout: CollectionLayout = {
  tableName: 'general',
  primaryKey: {
    partitionKey: 'pk0',
    sortKey: 'sk0',
  },
  findKeys: Array(4)
    .fill({})
    .map((_, index) => layoutForIndex(index + 1)),
  ttlAttribute: 'ttlattr',
};
const collectionWithNoAPs: Collection = {
  name: 'test-collection',
  ttlKeyPath: ['expiresAt'],
  layout,
};

const collectionWithAPs: Collection = {
  ...collectionWithNoAPs,
  accessPatterns: [
    { indexName: 'index1', partitionKeys: [], sortKeys: [['name']] },
    {
      indexName: 'index2',
      partitionKeys: [['department']],
      sortKeys: [['profile', 'staffNumber']],
    },
    {
      indexName: 'index3',
      partitionKeys: [],
      sortKeys: [['profile', 'email']],
    },
    {
      indexName: 'index4',
      // exact match on email by lowercase
      partitionKeys: [['profile', 'email']],
      sortKeys: [],
      options: {
        stringNormalizer: (_, value) => value.trim().toLowerCase(),
      },
    },
  ],
};

const collectionWithRequiredPaths: Collection = {
  ...collectionWithNoAPs,
  accessPatterns: [
    {
      indexName: 'index1',
      partitionKeys: [['department'], ['profile', 'email']],
      sortKeys: [['country'], ['state'], ['town']],
      requiredPaths: [['department'], ['country'], ['state']],
    },
  ],
};

describe('createUpdateActionForKey', () => {
  const indexLayout = {
    indexName: 'index1',
    partitionKey: 'pk1',
    sortKey: 'sk1',
  };

  const collectionName = 'addresses';

  const partitionKPs = [['userType'], ['profile', 'phoneNumber']];

  const sortKPs = [
    ['location', 'department'],
    ['location', 'floor'],
    ['userType'],
  ];

  it('should fail if touches some index paths but does not specify all of them', () => {
    const updates: StrictChangesDocument = {
      $set: [[['profile'], { name: 'Chris Armstrong' }]],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(() =>
      createUpdateActionForKey(
        collectionName,
        'partition',
        partitionKPs,
        indexLayout,
        updates
      )
    ).toThrow(InvalidIndexedFieldValueException);
  });

  it('should return undefined when there is no updates to the partition key in the set of updates', () => {
    const updates: StrictChangesDocument = {
      $set: [[['staffCount'], 5]],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(
      createUpdateActionForKey(
        collectionName,
        'partition',
        partitionKPs,
        indexLayout,
        updates
      )
    ).toBeUndefined();
  });

  it('should return undefined when there is no updates to the sort key in the set of updates', () => {
    const updates: StrictChangesDocument = {
      $set: [[['staffCount'], 5]],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(
      createUpdateActionForKey(
        collectionName,
        'sort',
        sortKPs,
        indexLayout,
        updates
      )
    ).toBeUndefined();
  });

  it('should correctly calculate the update action for a scalar key', () => {
    const updates: StrictChangesDocument = {
      $set: [
        [['profile'], { name: 'Chris Armstrong', phoneNumber: '123456' }],
        [['type'], 'A'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };

    const keyPaths = [['profile', 'phoneNumber']];
    expect(
      createUpdateActionForKey(
        collectionName,
        'partition',
        keyPaths,
        indexLayout,
        updates
      )
    ).toEqual({
      attributeName: 'pk1',
      value: `${collectionName}|-|123456`,
      valueErasure: false,
    });
  });

  it('should correctly calculate the update action for an empty key', () => {
    const updates: StrictChangesDocument = {
      $set: [
        [['profile'], { name: 'Chris Armstrong', phoneNumber: '123456' }],
        [['type'], 'A'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    const keyPaths: KeyPath[] = [];
    expect(
      createUpdateActionForKey(
        collectionName,
        'partition',
        keyPaths,
        indexLayout,
        updates
      )
    ).toBeUndefined();
  });

  it('should correctly calculate the update action for a nested-value composite key', () => {
    const updates: StrictChangesDocument = {
      $set: [
        [['profile'], { name: 'Chris Armstrong', phoneNumber: '123456' }],
        [['userType'], 'AAA'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(
      createUpdateActionForKey(
        collectionName,
        'partition',
        partitionKPs,
        indexLayout,
        updates
      )
    ).toEqual({
      attributeName: 'pk1',
      value: `${collectionName}|-|AAA|-|123456`,
      valueErasure: false,
    });
  });

  it('should correctly calculate the update action for a directly updated composite key', () => {
    const updates: StrictChangesDocument = {
      $set: [
        [['profile', 'name'], 'Chris Armstrong'],
        [['profile', 'phoneNumber'], '123456'],
        [['userType'], 'AAA'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(
      createUpdateActionForKey(
        collectionName,
        'partition',
        partitionKPs,
        indexLayout,
        updates
      )
    ).toEqual({
      attributeName: 'pk1',
      value: `${collectionName}|-|AAA|-|123456`,
      valueErasure: false,
    });
  });
  it('should correctly work with custom separators', () => {
    const updates: StrictChangesDocument = {
      $set: [
        [['profile', 'name'], 'Chris Armstrong'],
        [['profile', 'phoneNumber'], '123456'],
        [['userType'], 'AAA'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(
      createUpdateActionForKey(
        collectionName,
        'partition',
        partitionKPs,
        indexLayout,
        updates,
        '#'
      )
    ).toEqual({
      attributeName: 'pk1',
      value: `${collectionName}#AAA#123456`,
      valueErasure: false,
    });
  });
});

describe('createUpdateActionForTTLKey', () => {
  const attributeName = 'expiry';
  const expiryDate = new Date();
  const updates: StrictChangesDocument = {
    $set: [
      [
        ['test', '0'],
        {
          home: 'string',
          'a date': expiryDate,
        },
      ],
      [['direct', 'path'], expiryDate.getTime()],
    ],
    $delete: [],
    $addToSet: [],
    $deleteFromSet: [],
    $addValue: [],
  };

  it('should return undefined when there is no matching update path', () => {
    expect(
      createUpdateActionForTTLKey(
        attributeName,
        ['test', '1', 'a date'],
        updates
      )
    ).toBeUndefined();
  });

  it('should return with a correct value when it is directly specified in the updates', () => {
    expect(
      createUpdateActionForTTLKey(attributeName, ['direct', 'path'], updates)
    ).toEqual({
      attributeName,
      value: Math.ceil(expiryDate.getTime() / 1000),
    });
  });

  it('should return with a correct value when it is indirectly specified in the updates', () => {
    expect(
      createUpdateActionForTTLKey(
        attributeName,
        ['test', '0', 'a date'],
        updates
      )
    ).toEqual({
      attributeName,
      value: Math.ceil(expiryDate.getTime() / 1000),
    });
  });

  it('should return with an undefined value if the ttl key path points to an undefined value', () => {
    expect(
      createUpdateActionForTTLKey(
        attributeName,
        ['test', '0', 'something else'],
        updates
      )
    ).toEqual({
      attributeName,
      value: undefined,
    });
  });
});

describe('findCollectionIndex', () => {
  it('should throw when the index is not found', () => {
    expect(() =>
      findCollectionIndex(collectionWithNoAPs, 'notindex')
    ).toThrowError(IndexNotFoundException);
  });

  it('should return the index when it is found', () => {
    expect(findCollectionIndex(collectionWithNoAPs, 'index1')).toEqual(
      expect.objectContaining({ indexName: 'index1' })
    );
  });
});

describe('mapAccessPatterns', () => {
  it('should return `undefined` if the collection has no access patterns', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        [['x', 'y'], 8],
        [['name'], 'new name'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    const { setActions, removeActions } = mapAccessPatterns(
      collectionWithNoAPs,
      mappers,
      updates
    );
    expect(setActions).toEqual([]);
    expect(removeActions).toEqual([]);
    expect(mappers.nameMapper.get()).toBeUndefined();
    expect(mappers.valueMapper.get()).toBeUndefined();
  });

  it('should map simple index updates when part of the update object', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        [['name'], 'a new name'],
        [['x', 'y'], 8],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    const { setActions, removeActions } = mapAccessPatterns(
      collectionWithAPs,
      mappers,
      updates
    );
    expect(setActions).toEqual(['sk1 = :value0', 'pk1 = :value1']);
    expect(removeActions).toEqual([]);
    expect(mappers.nameMapper.get()).toBeUndefined();
    expect(mappers.valueMapper.get()).toEqual({
      ':value0': { S: 'test-collection|-|a new name' },
      ':value1': { S: 'test-collection' },
    });
  });

  it('should handle custom separators', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        [['name'], 'a new name'],
        [['x', 'y'], 8],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    const customCollectionWithAPs = {
      ...collectionWithAPs,
      layout: { ...layout, indexKeySeparator: '#' },
    };
    const { setActions, removeActions } = mapAccessPatterns(
      customCollectionWithAPs,
      mappers,
      updates
    );
    expect(setActions).toEqual(['sk1 = :value0', 'pk1 = :value1']);
    expect(removeActions).toEqual([]);
    expect(mappers.nameMapper.get()).toBeUndefined();
    expect(mappers.valueMapper.get()).toEqual({
      ':value0': { S: 'test-collection#a new name' },
      ':value1': { S: 'test-collection' },
    });
  });

  it('should handle more complex index updates when part of the update object', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        [['name'], 'a new name'],
        [['department'], 'x'],
        [
          ['profile'],
          {
            staffNumber: 'STAFF38',
          },
        ],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    const { setActions, removeActions } = mapAccessPatterns(
      collectionWithAPs,
      mappers,
      updates
    );
    expect(setActions).toEqual([
      'sk1 = :value0',
      'pk1 = :value1',
      'pk2 = :value2',
      'sk2 = :value3',
      'pk3 = :value4',
      'pk4 = :value5',
    ]);
    expect(removeActions).toEqual(['sk3', 'sk4']);
    expect(mappers.nameMapper.get()).toBeUndefined();
    expect(mappers.valueMapper.get()).toEqual({
      ':value0': { S: 'test-collection|-|a new name' },
      ':value1': { S: 'test-collection' },
      ':value2': { S: 'test-collection|-|x' },
      ':value3': { S: 'test-collection|-|STAFF38' },
      ':value4': { S: 'test-collection' },
      ':value5': { S: 'test-collection' },
    });
  });

  it('should handle partial index update', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        [['department'], 'eng'],
        [['profile', 'email'], 'test@example.com'],
        [['country'], 'AU'],
        [['state'], 'NSW'],
        [['town'], 'Sydney'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    const { setActions, removeActions } = mapAccessPatterns(
      collectionWithRequiredPaths,
      mappers,
      updates
    );
    expect(setActions).toEqual(['pk1 = :value0', 'sk1 = :value1']);
    expect(removeActions).toEqual([]);
    expect(mappers.nameMapper.get()).toBeUndefined();
    expect(mappers.valueMapper.get()).toEqual({
      ':value0': { S: 'test-collection|-|eng|-|test@example.com' },
      ':value1': { S: 'test-collection|-|AU|-|NSW|-|Sydney' },
    });
  });

  it('should fail partial index update if some of index paths are not specified (pk)', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        // optional parts are missing
        [['department'], 'eng'],
        [['country'], 'AU'],
        [['state'], 'NSW'],
        [['town'], 'Sydney'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(() =>
      mapAccessPatterns(collectionWithRequiredPaths, mappers, updates)
    ).toThrow(InvalidIndexedFieldValueException);
  });

  it('should fail partial index update if some of index paths are not specified (sk)', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        // optional parts are missing
        [['department'], 'eng'],
        [['profile', 'email'], 'test@example.com'],
        [['country'], 'AU'],
        [['state'], 'NSW'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(() =>
      mapAccessPatterns(collectionWithRequiredPaths, mappers, updates)
    ).toThrow(InvalidIndexedFieldValueException);
  });

  it('should fail partial index update if it is required index part (pk)', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        [['profile', 'email'], 'test@example.com'], // department is required
        [['country'], 'AU'],
        [['state'], 'NSW'],
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(() =>
      mapAccessPatterns(collectionWithRequiredPaths, mappers, updates)
    ).toThrow(InvalidIndexedFieldValueException);
  });

  it('should fail partial index update if it is required index part (sk)', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [
        [['department'], 'eng'],
        [['country'], 'AU'], // state is required
      ],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(() =>
      mapAccessPatterns(collectionWithRequiredPaths, mappers, updates)
    ).toThrow(InvalidIndexedFieldValueException);
  });

  it('should fail partial index update if required index part is deleted (pk)', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [],
      $delete: [['department']], // department is required
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(() =>
      mapAccessPatterns(collectionWithRequiredPaths, mappers, updates)
    ).toThrow(InvalidIndexedFieldValueException);
  });

  it('should fail partial index update if required index part is deleted (sk)', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [],
      $delete: [['state']], // state is required
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    expect(() =>
      mapAccessPatterns(collectionWithRequiredPaths, mappers, updates)
    ).toThrow(InvalidIndexedFieldValueException);
  });

  it('should handle deletions on a GSI partition key', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [[['profile'], {}]],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    const { setActions, removeActions } = mapAccessPatterns(
      collectionWithAPs,
      mappers,
      updates
    );
    expect(setActions).toEqual(['pk3 = :value0', 'pk4 = :value1']);
    expect(removeActions).toEqual(['sk2', 'sk3', 'sk4']);
    expect(mappers.nameMapper.get()).toBeUndefined();
    expect(mappers.valueMapper.get()).toEqual({
      ':value0': { S: 'test-collection' },
      ':value1': { S: 'test-collection' },
    });
  });

  it('should correctly update an index with only the primary key populated and a new value specified', () => {
    const mappers = {
      nameMapper: createNameMapper(),
      valueMapper: createValueMapper(),
    };
    const updates: StrictChangesDocument = {
      $set: [[['profile'], { email: 'Chris@example.com' }]],
      $delete: [],
      $addToSet: [],
      $deleteFromSet: [],
      $addValue: [],
    };
    const { setActions, removeActions } = mapAccessPatterns(
      collectionWithAPs,
      mappers,
      updates
    );
    expect(removeActions).toContain('sk2');
    expect(setActions).toContain('pk3 = :value1');
    expect(setActions).toContain('sk3 = :value0');
    expect(setActions).toContain('pk4 = :value2');
    expect(setActions).toContain('sk4 = :value3');
  });
});

describe('updateById', () => {
  it('should throw InvalidUpdatesException if the updates object contains unknown operator', async () => {
    const testId = newId();
    const ddbMock = createDynamoMock('updateItem', {});
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithNoAPs,
    ]);
    return expect(
      updateById(context, collectionWithNoAPs.name, testId, {})
    ).rejects.toThrowError(InvalidUpdatesException);
  });

  it('should throw InvalidUpdatesException if the updates object is empty', async () => {
    const testId = newId();
    const ddbMock = createDynamoMock('updateItem', {});
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithNoAPs,
    ]);
    return expect(
      updateById(context, collectionWithNoAPs.name, testId, { $setValues: {} })
    ).rejects.toThrowError(InvalidUpdatesException);
  });

  it('should throw InvalidUpdateValueException if one of the updates is empty', async () => {
    const testId = newId();
    const ddbMock = createDynamoMock('updateItem', {});
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithNoAPs,
    ]);
    return expect(
      updateById(context, collectionWithNoAPs.name, testId, {
        $setValues: { value1: undefined, value2: {} },
      })
    ).rejects.toThrowError(InvalidUpdateValueException);
  });

  it('should throw InvalidIndexedFieldValueException if one of the required paths is missing (pk)', async () => {
    const testId = newId();
    const ddbMock = createDynamoMock('updateItem', {});
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);
    return expect(
      updateById(context, collectionWithRequiredPaths.name, testId, {
        $setValues: { 'profile.email': 'test@example.com' }, // department is missing
      })
    ).rejects.toThrowError(InvalidIndexedFieldValueException);
  });

  // undefined is not allowed for update -> only null and empty string considered
  it.each([null, ''])(
    'should throw InvalidIndexedFieldValueException if one of the required paths is falsy (pk)',
    async (falsy) => {
      const testId = newId();
      const ddbMock = createDynamoMock('updateItem', {});
      const context = createContext(ddbMock as unknown as DynamoDBClient, [
        collectionWithRequiredPaths,
      ]);
      return expect(
        updateById(context, collectionWithRequiredPaths.name, testId, {
          $setValues: {
            'profile.email': 'test@example.com',
            department: falsy,
          },
        })
      ).rejects.toThrowError(InvalidIndexedFieldValueException);
    }
  );

  // undefined is not allowed for update -> only null and empty string considered
  it.each([null, ''])(
    'should throw InvalidIndexedFieldValueException if one of the required paths is falsy (sk)',
    async (falsy) => {
      const testId = newId();
      const ddbMock = createDynamoMock('updateItem', {});
      const context = createContext(ddbMock as unknown as DynamoDBClient, [
        collectionWithRequiredPaths,
      ]);
      return expect(
        updateById(context, collectionWithRequiredPaths.name, testId, {
          $setValues: { country: 'AU', state: falsy, town: 'Sydney' }, // state is missing
        })
      ).rejects.toThrowError(InvalidIndexedFieldValueException);
    }
  );

  it('should throw if updates index without specifying all paths (pk)', async () => {
    const testId = newId();
    const ddbMock = createDynamoMock('updateItem', {});
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);
    await expect(() =>
      updateById(context, collectionWithRequiredPaths.name, testId, {
        $setValues: {
          name: 'new name',
          department: 'department 2', // profile.email is missing
          country: 'AU',
          state: 'NSW',
          town: 'Sydney',
        },
      })
    ).rejects.toThrow(InvalidIndexedFieldValueException);
  });

  it('should throw if updates index without specifying all paths (sk)', async () => {
    const testId = newId();
    const ddbMock = createDynamoMock('updateItem', {});
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);
    await expect(() =>
      updateById(context, collectionWithRequiredPaths.name, testId, {
        $setValues: {
          name: 'new name',
          profile: {
            email: 'email@email.com',
            enabled: true,
          },
          department: 'department 2',
          country: 'AU',
          state: 'NSW', // town is missing
        },
      })
    ).rejects.toThrow(InvalidIndexedFieldValueException);
  });

  it('should handle set updates with required paths', async () => {
    const testId = newId();
    const createdValue = {
      _id: testId,
      name: 'new name',
      profile: {
        email: 'email@email.com',
        enabled: true,
      },
      department: 'department 2',
      country: 'AU',
      state: 'NSW',
      town: 'Sydney',
    };
    const ddbMock = createDynamoMock('updateItem', {
      Attributes: marshall({
        value: createdValue,
      } as UpdateItemOutput),
    });
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);
    const results = await updateById(
      context,
      collectionWithRequiredPaths.name,
      testId,
      {
        $setValues: {
          name: 'new name',
          profile: {
            email: 'email@email.com',
            enabled: true,
          },
          department: 'department 2',
          country: 'AU',
          state: 'NSW',
          town: 'Sydney',
        },
      }
    );
    expect(results).toEqual(createdValue);
    expect(ddbMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TableName: layout.tableName,
          UpdateExpression:
            'SET #value.#attr0 = :value0, #value.profile = :value1, ' +
            '#value.department = :value2, #value.country = :value3, ' +
            '#value.#attr1 = :value4, #value.town = :value5, ' +
            'pk1 = :value6, sk1 = :value7',
          Key: {
            pk0: { S: `test-collection|-|${testId}` },
            sk0: { S: `test-collection|-|${testId}` },
          },
          ExpressionAttributeNames: {
            '#value': 'value',
            '#attr0': 'name',
            '#attr1': 'state',
          },
          ExpressionAttributeValues: {
            ':value0': { S: 'new name' },
            ':value1': convertToAttr({
              email: 'email@email.com',
              enabled: true,
            }),
            ':value2': { S: 'department 2' },
            ':value3': { S: 'AU' },
            ':value4': { S: 'NSW' },
            ':value5': { S: 'Sydney' },
            ':value6': {
              S: 'test-collection|-|department 2|-|email@email.com',
            },
            ':value7': { S: 'test-collection|-|AU|-|NSW|-|Sydney' },
          },
          ReturnValues: 'ALL_NEW',
          ConditionExpression: undefined,
        } as UpdateItemInput,
      })
    );
  });

  // undefined is not allowed for update -> only null and empty string considered
  it.each([null, ''])(
    'should handle set updates with index paths defined as falsy',
    async (falsy) => {
      const testId = newId();
      const createdValue = {
        _id: testId,
        name: 'new name',
        profile: {
          email: falsy,
          enabled: true,
        },
        department: 'department 2',
        country: 'AU',
        state: 'NSW',
        town: falsy,
      };
      const ddbMock = createDynamoMock('updateItem', {
        Attributes: marshall({
          value: createdValue,
        } as UpdateItemOutput),
      });
      const context = createContext(ddbMock as unknown as DynamoDBClient, [
        collectionWithRequiredPaths,
      ]);
      const results = await updateById(
        context,
        collectionWithRequiredPaths.name,
        testId,
        {
          $setValues: {
            name: 'new name',
            profile: {
              email: falsy,
              enabled: true,
            },
            department: 'department 2',
            country: 'AU',
            state: 'NSW',
            town: falsy,
          },
        }
      );
      expect(results).toEqual(createdValue);
      expect(ddbMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: layout.tableName,
            UpdateExpression:
              'SET #value.#attr0 = :value0, #value.profile = :value1, ' +
              '#value.department = :value2, #value.country = :value3, ' +
              '#value.#attr1 = :value4, #value.town = :value5, ' +
              'pk1 = :value6, sk1 = :value7',
            Key: {
              pk0: { S: `test-collection|-|${testId}` },
              sk0: { S: `test-collection|-|${testId}` },
            },
            ExpressionAttributeNames: {
              '#value': 'value',
              '#attr0': 'name',
              '#attr1': 'state',
            },
            ExpressionAttributeValues: {
              ':value0': { S: 'new name' },
              ':value1': convertToAttr({
                email: falsy,
                enabled: true,
              }),
              ':value2': { S: 'department 2' },
              ':value3': { S: 'AU' },
              ':value4': { S: 'NSW' },
              ':value5': convertToAttr(falsy),
              ':value6': {
                S: 'test-collection|-|department 2|-|',
              },
              ':value7': { S: 'test-collection|-|AU|-|NSW|-|' },
            },
            ReturnValues: 'ALL_NEW',
            ConditionExpression: undefined,
          } as UpdateItemInput,
        })
      );
    }
  );

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
      Attributes: marshall({
        value: createdValue,
      } as UpdateItemOutput),
    });
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithNoAPs,
    ]);
    const results = await updateById(
      context,
      collectionWithNoAPs.name,
      testId,
      {
        $setValues: { 'profile.name': 'new name', topLevelValue: [1, 2, 4] },
      }
    );
    expect(results).toEqual(createdValue);
    expect(ddbMock.send).toBeCalledTimes(1);
    expect(ddbMock.send).toBeCalledWith(
      expect.objectContaining({
        input: {
          TableName: layout.tableName,
          UpdateExpression:
            'SET #value.profile.#attr0 = :value0, #value.topLevelValue = :value1',
          Key: {
            pk0: { S: `test-collection|-|${testId}` },
            sk0: { S: `test-collection|-|${testId}` },
          },
          ExpressionAttributeNames: {
            '#value': 'value',
            '#attr0': 'name',
          },
          ExpressionAttributeValues: {
            ':value0': { S: 'new name' },
            ':value1': {
              L: [{ N: '1' }, { N: '2' }, { N: '4' }],
            },
          },
          ReturnValues: 'ALL_NEW',
        } as UpdateItemInput,
      })
    );
  });

  it('should clear sparse key index values as expected', async () => {
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
      Attributes: marshall({
        value: createdValue,
      } as UpdateItemOutput),
    });
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithAPs,
    ]);
    const results = await updateById(
      context,
      collectionWithNoAPs.name,
      testId,
      {
        $remove: ['profile.email'],
      }
    );
    expect(results).toEqual(createdValue);
    expect(ddbMock.send).toBeCalledWith(
      expect.objectContaining({
        input: {
          TableName: layout.tableName,
          UpdateExpression:
            'SET pk3 = :value0, pk4 = :value1 REMOVE #value.profile.email, sk3, sk4',
          ExpressionAttributeNames: { '#value': 'value' },
          ExpressionAttributeValues: {
            ':value0': { S: 'test-collection' },
            ':value1': { S: 'test-collection' },
          },
          ReturnValues: 'ALL_NEW',
          ConditionExpression: undefined,
          Key: {
            pk0: { S: `test-collection|-|${testId}` },
            sk0: { S: `test-collection|-|${testId}` },
          },
        },
      })
    );
  });

  it('should clear index values across multiple indexes on a top-level update', async () => {
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
      Attributes: marshall({
        value: createdValue,
      } as UpdateItemOutput),
    });
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithAPs,
    ]);
    const results = await updateById(
      context,
      collectionWithNoAPs.name,
      testId,
      {
        $remove: ['profile'],
      }
    );
    expect(results).toEqual(createdValue);
    expect(ddbMock.send).toBeCalledWith(
      expect.objectContaining({
        input: {
          TableName: layout.tableName,
          UpdateExpression:
            'SET pk3 = :value0, pk4 = :value1 REMOVE #value.profile, sk2, sk3, sk4',
          ExpressionAttributeNames: { '#value': 'value' },
          ExpressionAttributeValues: {
            ':value0': { S: 'test-collection' },
            ':value1': { S: 'test-collection' },
          },
          ReturnValues: 'ALL_NEW',
          ConditionExpression: undefined,
          Key: {
            pk0: { S: `test-collection|-|${testId}` },
            sk0: { S: `test-collection|-|${testId}` },
          },
        },
      })
    );
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
      Attributes: marshall({
        value: createdValue,
      } as UpdateItemOutput),
    });
    const customCollectionWithAPs = {
      ...collectionWithAPs,
      layout: { ...layout, indexKeySeparator: '**' },
    };
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      customCollectionWithAPs,
    ]);
    const results = await updateById(
      context,
      customCollectionWithAPs.name,
      testId,
      {
        $setValues: {
          name: 'new name',
          profile: {
            email: 'email@email.com',
            enabled: true,
          },
          department: 'department 2',
        },
      }
    );
    expect(results).toEqual(createdValue);
    expect(ddbMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TableName: layout.tableName,
          UpdateExpression:
            'SET #value.#attr0 = :value0, #value.profile = :value1, ' +
            '#value.department = :value2, sk1 = :value3, pk1 = :value4, ' +
            'pk2 = :value5, sk3 = :value6, pk3 = :value7, pk4 = :value8, ' +
            'sk4 = :value9 REMOVE sk2',
          Key: {
            pk0: { S: `test-collection**${testId}` },
            sk0: { S: `test-collection**${testId}` },
          },
          ExpressionAttributeNames: {
            '#value': 'value',
            '#attr0': 'name',
          },
          ExpressionAttributeValues: {
            ':value0': { S: 'new name' },
            ':value1': convertToAttr({
              email: 'email@email.com',
              enabled: true,
            }),
            ':value2': { S: 'department 2' },
            ':value3': { S: `test-collection**new name` },
            ':value4': { S: 'test-collection' },
            ':value5': { S: `test-collection**department 2` },
            ':value6': { S: `test-collection**email@email.com` },
            ':value7': { S: 'test-collection' },
            ':value8': { S: `test-collection**email@email.com` },
            ':value9': { S: 'test-collection' },
          },
          ReturnValues: 'ALL_NEW',
          ConditionExpression: undefined,
        } as UpdateItemInput,
      })
    );
  });

  it('should handle basic $set/$delete operations', async () => {
    const testId = newId();
    const createdValue = {
      _id: testId,
      profile: {
        name: 'new name',
      },
      topLevelValue: [1, 2, 4],
      somethingElse: false,
      expiresAt: new Date().toISOString(),
    };
    const ddbMock = createDynamoMock('updateItem', {
      Attributes: marshall({
        value: createdValue,
      } as UpdateItemOutput),
    });
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithNoAPs,
    ]);
    const results = await updateById(
      context,
      collectionWithNoAPs.name,
      testId,
      {
        $set: [
          ['profile.name', 'new name'],
          ['topLevelValue', [1, 2, 4]],
          ['profile.status', { disabled: true }],
        ],
        $remove: [['somethingElse'], ['expiresAt']],
      }
    );
    expect(results).toEqual(createdValue);
    expect(ddbMock.send).toBeCalledTimes(1);
    expect(ddbMock.send).toBeCalledWith(
      expect.objectContaining({
        input: {
          TableName: layout.tableName,
          ConditionExpression: undefined,
          UpdateExpression:
            'SET #value.profile.#attr0 = :value0, #value.topLevelValue = :value1, #value.profile.#attr1 = :value2 REMOVE #value.somethingElse, #value.expiresAt, ttlattr',
          Key: {
            pk0: { S: `test-collection|-|${testId}` },
            sk0: { S: `test-collection|-|${testId}` },
          },
          ExpressionAttributeNames: {
            '#value': 'value',
            '#attr0': 'name',
            '#attr1': 'status',
          },
          ExpressionAttributeValues: {
            ':value0': { S: 'new name' },
            ':value1': {
              L: [{ N: '1' }, { N: '2' }, { N: '4' }],
            },
            ':value2': {
              M: { disabled: { BOOL: true } },
            },
          },
          ReturnValues: 'ALL_NEW',
        } as UpdateItemInput,
      })
    );
  });

  it('should handle basic $addValue operations correctly', async () => {
    const testId = newId();
    const createdValue = {
      _id: testId,
      profile: {
        name: 'new name',
      },
      count: 3,
    };
    const ddbMock = createDynamoMock('updateItem', {
      Attributes: marshall({
        value: createdValue,
      } as UpdateItemOutput),
    });
    const context = createContext(ddbMock as unknown as DynamoDBClient, [
      collectionWithNoAPs,
    ]);
    const results = await updateById(
      context,
      collectionWithNoAPs.name,
      testId,
      {
        $addValue: [['count', 5]],
      }
    );
    expect(results).toEqual(createdValue);
    expect(ddbMock.send).toBeCalledTimes(1);
    expect(ddbMock.send).toBeCalledWith(
      expect.objectContaining({
        input: {
          TableName: layout.tableName,
          ConditionExpression: undefined,
          UpdateExpression: 'ADD #value.#attr0 :value0',
          Key: {
            pk0: { S: `test-collection|-|${testId}` },
            sk0: { S: `test-collection|-|${testId}` },
          },
          ExpressionAttributeNames: {
            '#value': 'value',
            '#attr0': 'count',
          },
          ExpressionAttributeValues: {
            ':value0': { N: '5' },
          },
          ReturnValues: 'ALL_NEW',
        } as UpdateItemInput,
      })
    );
  });
});
