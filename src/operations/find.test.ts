import { isEqualKey, findAccessPattern, findAccessPatternLayout, assembleQueryValue, find } from './find';
import { AccessPattern, KeyPath } from '../access_pattern';
import { DynamoDB } from 'aws-sdk/clients/all';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import { createContext } from '../context';
import { InvalidQueryException } from '../exceptions';
import { Converter } from 'aws-sdk/clients/dynamodb';
import { Collection } from '../collection';

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
    findKeys: [{ indexName: 'index1', partitionKey: 'gsip1' }]
  };
  const baseCollection = {
    name: 'test-collection',
    layout,
  };

  const collectionWithAPs = (...aps: AccessPattern[]): Collection => ({
    ...baseCollection, accessPatterns: aps,
  })

  test('when there is no access patterns to search', () => {
    expect(findAccessPattern(baseCollection, { name: 'chris' })).toBeUndefined();
  });

  test('when there is a partition-only key that matches', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name']] };
    expect(findAccessPattern(collectionWithAPs(ap1), { name: 'chris' }))
      .toEqual(ap1);
  });

  test('when there is a partition-only key that does not match', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name']] };
    expect(findAccessPattern(collectionWithAPs(ap1), { email: 'chris@example.com' }))
      .toBeUndefined();
  });

  test('when there is a partition-only key that is a partial match', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name']] };
    expect(findAccessPattern(collectionWithAPs(ap1), { name: 'Chris', status: 'active' }))
      .toBeUndefined();
  });

  test('when there is a composite partition-only key that matches', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name'], ['status']] };
    expect(findAccessPattern(collectionWithAPs(ap1), { name: 'Chris', status: 'inactive' }))
      .toEqual(ap1);
  });

  test('when there is a composite partition-only key that partial matches', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['name'], ['status']] };
    expect(findAccessPattern(collectionWithAPs(ap1), { name: 'Chris', department: 'finance' }))
      .toBeUndefined();
  });

  test('when there is a partition and sort key that fully matches', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['email']], sortKeys: [['status']] };
    expect(findAccessPattern(collectionWithAPs(ap1), { email: 'chris@example.com', status: 'active' }))
      .toEqual(ap1);
  });

  test('when there is a partition and sort key that partially matches', () => {
    const ap1 = { indexName: 'index1', partitionKeys: [['email']], sortKeys: [['status']] };
    expect(findAccessPattern(collectionWithAPs(ap1), { email: 'chris@example.com' }))
      .toEqual(ap1);
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
    expect(assembleQueryValue('partition', 'test-collection', query, {})).toBeUndefined();
    expect(assembleQueryValue('sort', 'test-collection', query, {})).toBeUndefined();
  });

  test('when key paths is defined but there is no values to extract', () => {
    const query = {};
    const paths: KeyPath[] = [];
    expect(assembleQueryValue('partition', 'test-collection', query, {}, paths))
      .toBe('test-collection');
    expect(assembleQueryValue('sort', 'test-collection', query, {}, paths))
      .toBe('test-collection');
  });

  test('when key paths specifies multiple values to extract that exist', () => {
    const query = { email: 'chris@example.com', 'location.country': 'AU', 'location.state': 'NSW' };
    const partitionPaths = [['location', 'country'], ['email']];
    const partitionValue = assembleQueryValue('partition', 'test-collection', query, {}, partitionPaths);
    expect(partitionValue).toEqual('test-collection|-|AU|-|chris@example.com');

    const sortPaths = [['location', 'state']];
    const sortValue = assembleQueryValue('sort', 'test-collection', query, {}, sortPaths);
    expect(sortValue).toEqual('test-collection|-|NSW');
  });

  test('when key paths specifies multiple values to extract but one does not exist', () => {
    const query = { 'location.country': 'AU', 'location.state': 'NSW' };
    const partitionPaths = [['location', 'country'], ['email']];
    const partitionValue = assembleQueryValue('partition', 'test-collection', query, {}, partitionPaths);
    expect(partitionValue).toEqual('test-collection|-|AU');
  });

  test('when a string normaliser is given it applies it to the assembled value', () => {
    const query = { email: 'chris@example.com', 'location.country': 'AU', 'location.state': 'NSW' };

    const options = { stringNormalizer: (_: KeyPath, str: string): string => str.trim().toLowerCase() };
    const sortPaths = [['location', 'state']];
    const sortValue = assembleQueryValue('sort', 'test-collection', query, options, sortPaths);
    expect(sortValue).toEqual('test-collection|-|nsw');
  });
});

describe('find', () => {
  const layout = {
    tableName: 'test-table',
    primaryKey: { partitionKey: 'part', sortKey: 'sort' },
    findKeys: [{ indexName: 'index1', partitionKey: 'gsi_p1', sortKey: 'gsi_s1' }]
  };

  const collection = {
    name: 'test-collection',
    layout,
    accessPatterns: [
      {
        indexName: 'index1',
        partitionKeys: [['location', 'country']],
        sortKeys: [['location', 'state'], ['location', 'city']],
      },
    ],
  };

  test('when there is no matching access pattern it throws', () => {
    const ddb = createDynamoMock('query', {});
    const context = createContext((ddb as unknown) as DynamoDB, [collection]);

    expect(find(context, 'test-collection', { email: 'test@example.com'}))
      .rejects.toThrowError(InvalidQueryException);
  });

  test('when an access pattern matches it runs the query correctly', async () => {
    const testItem1 = { value: { _id: 'testValue1' } };
    const ddb = createDynamoMock('query', {
      Items: [Converter.marshall(testItem1)],
    });
    const context = createContext((ddb as unknown) as DynamoDB, [collection]);

    const query = {
      'location.country': 'AU',
      'location.state': 'NSW',
    };

    const result = await find(context, 'test-collection', query);
    expect(result).toEqual({ items: [testItem1.value], nextToken: undefined });

    const params = ddb.query.mock.calls[0][0];
    expect(params.TableName).toEqual('test-table');
  });
});
