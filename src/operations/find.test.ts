import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { convertToAttr, marshall } from '@aws-sdk/util-dynamodb';
import {
  isEqualKey,
  findAccessPattern,
  findAccessPatternLayout,
  assembleQueryValue,
  find,
} from './find';
import { AccessPattern, KeyPath } from '../base/access_pattern';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import { createContext } from '../context';
import { InvalidQueryException } from '../base/exceptions';
import { Collection } from '../base/collection';

describe('isEqualKey', () => {
  test('when both values are strings', () => {
    expect(isEqualKey('test.1.key', 'test.1.key')).toBeTruthy();
    expect(isEqualKey('test.1.key', 'test.1.value')).toBeFalsy();
  });

  test('when both values are key paths', () => {
    expect(isEqualKey(['test', '1', 'key'], ['test', '1', 'key'])).toBeTruthy();
    expect(isEqualKey(['test', '1', 'key'], ['test', '1', 'Key'])).toBeFalsy();
  });

  test('when different types are compared', () => {
    expect(isEqualKey(['test', '1', 'key'], 'test.1.key')).toBeTruthy();
    expect(isEqualKey('test.1.Key', ['test', '1', 'Key'])).toBeTruthy();
    expect(isEqualKey('test.2.Key', ['test', '1', 'Key'])).toBeFalsy();
  });
});

describe('findAccessPattern', () => {
  const layout = {
    tableName: 'test-table',
    primaryKey: { partitionKey: 'part', sortKey: 'sort' },
    findKeys: [{ indexName: 'index1', partitionKey: 'gsip1' }],
  };
  const baseCollection = {
    name: 'test-collection',
    layout,
  };

  const collectionWithAPs = (...aps: AccessPattern[]): Collection => ({
    ...baseCollection,
    accessPatterns: aps,
  });

  test('when there is no access patterns to search', () => {
    expect(
      findAccessPattern(baseCollection, { name: 'chris' })
    ).toBeUndefined();
  });

  test('when there is a partition-only key that matches', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name']] };
    expect(
      findAccessPattern(collectionWithAPs(ap1), { name: 'chris' })
    ).toEqual(ap1);
  });

  test('when there is a partition-only key that does not match', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name']] };
    expect(
      findAccessPattern(collectionWithAPs(ap1), { email: 'chris@example.com' })
    ).toBeUndefined();
  });

  test('when there is a partition-only key that is a partial match', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name']] };
    expect(
      findAccessPattern(collectionWithAPs(ap1), {
        name: 'Chris',
        status: 'active',
      })
    ).toBeUndefined();
  });

  test('when there is a composite partition-only key that matches', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name'], ['status']] };
    expect(
      findAccessPattern(collectionWithAPs(ap1), {
        name: 'Chris',
        status: 'inactive',
      })
    ).toEqual(ap1);
  });

  test('when there is a composite partition-only key that partial matches', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name'], ['status']] };
    expect(
      findAccessPattern(collectionWithAPs(ap1), {
        name: 'Chris',
        department: 'finance',
      })
    ).toBeUndefined();
  });

  test('when there is a partition and sort key that fully matches', () => {
    const ap1 = {
      indexName: 'index1',
      partitionKeys: [['email']],
      sortKeys: [['status']],
    };
    expect(
      findAccessPattern(collectionWithAPs(ap1), {
        email: 'chris@example.com',
        status: 'active',
      })
    ).toEqual(ap1);
  });

  test('when there is a partition and sort key that partially matches', () => {
    const ap1 = {
      indexName: 'index1',
      partitionKeys: [['email']],
      sortKeys: [['status']],
    };
    expect(
      findAccessPattern(collectionWithAPs(ap1), { email: 'chris@example.com' })
    ).toEqual(ap1);
  });
});

describe('findAccessPatternLayout', () => {
  const findKeys = [{ indexName: 'index1', partitionKey: 'gsip1' }];
  test('when the access pattern index exists it finds the right index layout', () => {
    const ap = { indexName: 'index1', partitionKeys: [['testpartkey1s']] };
    expect(findAccessPatternLayout(findKeys, ap)).toEqual(findKeys[0]);
  });

  test('when the access pattern index does not exist it returns undefined', () => {
    const ap = { indexName: 'index5', partitionKeys: [['testpartkey1s']] };
    expect(findAccessPatternLayout(findKeys, ap)).toBeUndefined();
  });
});

describe('assembleQueryValue', () => {
  test('when there are no key paths it returns undefined', () => {
    const query = {};
    expect(
      assembleQueryValue('partition', 'test-collection', query, {})
    ).toBeUndefined();
    expect(
      assembleQueryValue('sort', 'test-collection', query, {})
    ).toBeUndefined();
  });

  test('when key paths is defined but there is no values to extract', () => {
    const query = {};
    const paths: KeyPath[] = [];
    expect(
      assembleQueryValue('partition', 'test-collection', query, {}, paths)
    ).toBe('test-collection');
    expect(
      assembleQueryValue('sort', 'test-collection', query, {}, paths)
    ).toBe('test-collection');
  });

  test('when key paths specifies multiple values to extract that exist', () => {
    const query = {
      email: 'chris@example.com',
      'location.country': 'AU',
      'location.state': 'NSW',
    };
    const partitionPaths = [['location', 'country'], ['email']];
    const partitionValue = assembleQueryValue(
      'partition',
      'test-collection',
      query,
      {},
      partitionPaths
    );
    expect(partitionValue).toEqual('test-collection|-|AU|-|chris@example.com');

    const sortPaths = [['location', 'state']];
    const sortValue = assembleQueryValue(
      'sort',
      'test-collection',
      query,
      {},
      sortPaths
    );
    expect(sortValue).toEqual('test-collection|-|NSW');
  });

  test('when key paths specifies multiple values to extract but one does not exist', () => {
    const query = { 'location.country': 'AU', 'location.state': 'NSW' };
    const partitionPaths = [['location', 'country'], ['email']];
    const partitionValue = assembleQueryValue(
      'partition',
      'test-collection',
      query,
      {},
      partitionPaths
    );
    expect(partitionValue).toEqual('test-collection|-|AU');
  });

  test('when a string normaliser is given it applies it to the assembled value', () => {
    const query = {
      email: 'chris@example.com',
      'location.country': 'AU',
      'location.state': 'NSW',
    };

    const options = {
      stringNormalizer: (_: KeyPath, str: string): string =>
        str.trim().toLowerCase(),
    };
    const sortPaths = [['location', 'state']];
    const sortValue = assembleQueryValue(
      'sort',
      'test-collection',
      query,
      options,
      sortPaths
    );
    expect(sortValue).toEqual('test-collection|-|nsw');
  });
});

describe('find', () => {
  const layout = {
    tableName: 'test-table',
    primaryKey: { partitionKey: 'part', sortKey: 'sort' },
    findKeys: [
      { indexName: 'index1', partitionKey: 'gsi_p1', sortKey: 'gsi_s1' },
      { indexName: 'index2', partitionKey: 'gsi_p2', sortKey: 'gsi_s2' },
    ],
  };

  const collection = {
    name: 'test-collection',
    layout,
    accessPatterns: [
      {
        indexName: 'index1',
        partitionKeys: [['location', 'country']],
        sortKeys: [
          ['location', 'state'],
          ['location', 'city'],
        ],
      },
      {
        indexName: 'index2',
        partitionKeys: [['location', 'country']],
        sortKeys: [['updatedAt']],
      },
    ],
  };

  test('when there is no matching access pattern it throws', () => {
    const ddb = createDynamoMock('query', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    return expect(
      find(context, 'test-collection', { email: 'test@example.com' })
    ).rejects.toThrowError(InvalidQueryException);
  });

  test('when an access pattern matches it runs the query correctly', async () => {
    const testItem1 = { value: { _id: 'testValue1' } };
    const ddb = createDynamoMock('query', {
      Items: [marshall(testItem1)],
    });
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    const query = {
      'location.country': 'AU',
      'location.state': 'NSW',
    };

    const result = await find(context, 'test-collection', query);
    expect(ddb.send).toHaveBeenCalled();
    expect(ddb.send).lastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: layout.tableName,
          IndexName: 'index1',
          ExpressionAttributeNames: {
            '#indexPartitionKey': layout.findKeys[0].partitionKey,
            '#indexSortKey': layout.findKeys[0].sortKey,
          },
          ExpressionAttributeValues: {
            ':value0': convertToAttr('test-collection|-|NSW'),
            ':value1': convertToAttr('test-collection|-|AU'),
          },
          KeyConditionExpression:
            '#indexPartitionKey = :value1 AND begins_with(#indexSortKey, :value0)',
        }),
      })
    );
    expect(result).toEqual({ items: [testItem1.value], nextToken: undefined });

    const params = ddb.send.mock.calls[0][0].input;
    expect(params.TableName).toEqual('test-table');
  });

  it('should pass on a nextToken when specified', async () => {
    const testItem1 = { value: { _id: 'testValue1' } };
    const ddb = createDynamoMock('query', {
      Items: [marshall(testItem1)],
    });
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    const query = {
      'location.country': 'AU',
      'location.state': 'NSW',
    };
    const nextToken = {
      [layout.primaryKey.partitionKey]: { S: 'a' },
      [layout.primaryKey.sortKey]: { S: 'b' },
    };
    await find(context, 'test-collection', query, nextToken);
    expect(ddb.send).lastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ ExclusiveStartKey: nextToken }),
      })
    );
  });

  it('should pass on a limit parameter when specified', async () => {
    const testItem1 = { value: { _id: 'testValue1' } };
    const ddb = createDynamoMock('query', {
      Items: [marshall(testItem1)],
    });
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    const query = {
      'location.country': 'AU',
      'location.state': 'NSW',
    };
    await find(context, 'test-collection', query, undefined, { limit: 5 });
    expect(ddb.send).lastCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ Limit: 5 }) })
    );
  });

  it('should integrate a filter expression if given', async () => {
    const testItem1 = { value: { _id: 'testValue1' } };
    const ddb = createDynamoMock('query', {
      Items: [marshall(testItem1)],
    });
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    const query = {
      'location.country': 'AU',
      'location.state': 'NSW',
    };

    const filterExpression = {
      'location.suburb': { $beginsWith: 'c' },
    };
    await find(context, 'test-collection', query, undefined, {
      limit: 5,
      filter: filterExpression,
    });
    expect(ddb.send).lastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          FilterExpression: 'begins_with(#value.#attr0.suburb,:value2)',
          ExpressionAttributeNames: expect.objectContaining({
            '#attr0': 'location',
          }),
          ExpressionAttributeValues: expect.objectContaining({
            ':value2': convertToAttr('c'),
          }),
        }),
      })
    );
  });

  it('should correctly handle other query operators', async () => {
    const testItem1 = { value: { _id: 'testValue1' } };
    const ddb = createDynamoMock('query', {
      Items: [marshall(testItem1)],
    });
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    const query = {
      'location.country': 'AU',
      updatedAt: '2021-01-20',
    };

    await find(context, 'test-collection', query, undefined, {
      limit: 5,
      queryOperator: 'gte',
    });
    expect(ddb.send).lastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          KeyConditionExpression:
            '#indexPartitionKey = :value1 AND #indexSortKey >= :value0',
          IndexName: 'index2',
          ExpressionAttributeValues: expect.objectContaining({
            ':value1': convertToAttr('test-collection|-|AU'),
            ':value0': convertToAttr('test-collection|-|2021-01-20'),
          }),
        }),
      })
    );
  });

  it('should correctly handle the between operator', async () => {
    const testItem1 = { value: { _id: 'testValue1' } };
    const ddb = createDynamoMock('query', {
      Items: [marshall(testItem1)],
    });
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    const query = {
      'location.country': 'AU',
      updatedAt: ['2021-01-20', '2021-02-20'] as [string, string],
    };

    await find(context, 'test-collection', query, undefined, {
      limit: 5,
      queryOperator: 'between',
    });
    expect(ddb.send).lastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          KeyConditionExpression:
            '#indexPartitionKey = :value2 AND #indexSortKey BETWEEN :value0 AND :value1',
          IndexName: 'index2',
          ExpressionAttributeValues: expect.objectContaining({
            ':value2': convertToAttr('test-collection|-|AU'),
            ':value0': convertToAttr('test-collection|-|2021-01-20'),
            ':value1': convertToAttr('test-collection|-|2021-02-20'),
          }),
        }),
      })
    );
  });
});
