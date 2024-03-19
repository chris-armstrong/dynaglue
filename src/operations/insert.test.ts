import { CollectionLayout } from '../base/layout';
import {
  createDynamoMock,
  createDynamoMockError,
  createAWSError,
} from '../../testutil/dynamo_mock';
import { createContext } from '../context';
import { insert } from './insert';
import {
  ConflictException,
  InvalidIndexedFieldValueException,
} from '../base/exceptions';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ChildCollection, RootCollection } from '../base/collection';

jest.mock('../base/new_id', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => 'test-id'),
}));

describe('insert', () => {
  const layout: CollectionLayout = {
    tableName: 'my-objects',
    primaryKey: { partitionKey: 'pkey', sortKey: 'skey' },
  };
  const collection: RootCollection = {
    name: 'users',
    layout,
  };

  const collectionWithRequiredPaths: RootCollection = {
    name: 'users',
    layout: {
      ...layout,
      findKeys: [
        { indexName: 'index1', partitionKey: 'gpk1', sortKey: 'gsk1' },
      ],
    },
    accessPatterns: [
      {
        indexName: 'index1',
        partitionKeys: [['email']],
        sortKeys: [['location']],
        requiredPaths: [['email'], ['location']],
      },
    ],
  };

  const childCollection: ChildCollection = {
    name: 'addresses',
    type: 'child',
    layout,
    parentCollectionName: 'users',
    foreignKeyPath: ['userId'],
  };

  test('should insert a root item conditionally', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
      childCollection,
    ]);

    const value = { name: 'Chris', email: 'chris@example.com' };
    const result = await insert(context, 'users', value);
    expect(result).toHaveProperty('_id');

    const request = ddb.send.mock.calls[0][0].input;
    expect(request.TableName).toBe('my-objects');
    expect(request.Item).toBeDefined();
    expect(request.ConditionExpression).toMatch('attribute_not_exists');
    expect(request.ExpressionAttributeNames['#idAttribute']).toBe(
      'users|-|test-id'
    );
  });

  test('should insert a root item with required paths', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);

    const value = {
      name: 'name',
      email: 'test@example.com',
      location: 'Wonderland',
    };
    const result = await insert(context, 'users', value);
    expect(result).toHaveProperty('_id');

    const request = ddb.send.mock.calls[0][0].input;
    expect(request).toEqual({
      TableName: 'my-objects',
      Item: {
        pkey: { S: 'users|-|test-id' },
        skey: { S: 'users|-|test-id' },
        value: {
          M: {
            name: { S: 'name' },
            email: { S: 'test@example.com' },
            location: { S: 'Wonderland' },
            _id: { S: 'test-id' },
          },
        },
        type: { S: 'users' },
        gpk1: { S: 'users|-|test@example.com' },
        gsk1: { S: 'users|-|Wonderland' },
      },
      ReturnValues: 'NONE',
      ConditionExpression: 'attribute_not_exists(#idAttribute)',
      ExpressionAttributeNames: { '#idAttribute': 'users|-|test-id' },
    });
  });

  test('should throw if required path is missing (pk)', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);

    const value = {
      // email is required
      name: 'name',
      location: 'Wonderland',
    };
    await expect(() => insert(context, 'users', value)).rejects.toThrow(
      InvalidIndexedFieldValueException
    );
  });

  test('should throw if required path is missing (sk)', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);

    const value = {
      // location is required
      name: 'name',
      email: 'test@example.com',
    };
    await expect(() => insert(context, 'users', value)).rejects.toThrow(
      InvalidIndexedFieldValueException
    );
  });

  test('should work with custom separators', async () => {
    const ddb = createDynamoMock('putItem', {});
    const rootCollection = {
      ...collection,
      layout: { ...layout, indexKeySeparator: '#' },
    };
    const context = createContext(ddb as unknown as DynamoDBClient, [
      rootCollection,
    ]);

    const value = { name: 'Chris', email: 'chris@example.com' };
    const result = await insert(context, 'users', value);
    expect(result).toHaveProperty('_id');

    const request = ddb.send.mock.calls[0][0].input;
    expect(request.TableName).toBe('my-objects');
    expect(request.Item).toBeDefined();
    expect(request.ConditionExpression).toMatch('attribute_not_exists');
    expect(request.ExpressionAttributeNames['#idAttribute']).toBe(
      'users#test-id'
    );
  });

  test('should insert a child item conditionally', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
      childCollection,
    ]);

    const value = {
      firstLine: '80 Place St',
      suburb: 'Town',
      country: 'UK',
      userId: 'user-id-1',
    };
    const result = await insert(context, 'addresses', value);
    expect(result).toHaveProperty('_id');

    const request = ddb.send.mock.calls[0][0].input;
    expect(request.TableName).toBe('my-objects');
    expect(request.Item).toBeDefined();
    expect(request.ConditionExpression).toMatch('attribute_not_exists');
    expect(request.ExpressionAttributeNames['#parentIdAttribute']).toBe(
      'users|-|user-id-1'
    );
    expect(request.ExpressionAttributeNames['#childIdAttribute']).toBe(
      'addresses|-|test-id'
    );
  });

  test('should wrap and throw an exception if the item already exists', async () => {
    const ddb = createDynamoMockError(
      'putItem',
      createAWSError(
        'ConditionalCheckFailedException',
        'The conditional check failed'
      )
    );
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    const value = { _id: 'test-id', name: 'Chris', email: 'chris@example.com' };
    expect(insert(context, 'users', value)).rejects.toThrowError(
      ConflictException
    );
  });
});
