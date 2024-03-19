import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CollectionLayout } from '../base/layout';
import {
  createDynamoMock,
} from '../../testutil/dynamo_mock';
import { createContext } from '../context';
import { replace } from './replace';
import { RootCollection } from '../base/collection';
import { InvalidIndexedFieldValueException } from '../base/exceptions';

describe('replace', () => {
  const layout: CollectionLayout = {
    tableName: 'my-objects',
    primaryKey: { partitionKey: 'pkey', sortKey: 'skey' },
  };
  const collection = {
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

  test('should replace an item conditionally', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collection,
    ]);

    const value = { _id: 'test-id', name: 'Chris', email: 'chris@example.com' };
    const result = await replace(context, 'users', value);
    expect(result).toHaveProperty('_id');

    const request = ddb.send.mock.calls[0][0].input;
    expect(request.TableName).toBe('my-objects');
    expect(request.Item).toBeDefined();
  });

  test('should insert a root item with required paths', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);

    const value = {
      _id: 'test-id',
      name: 'name',
      email: 'test@example.com',
      location: 'Wonderland',
    };
    const result = await replace(context, 'users', value);
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
    });
  });

  test('should throw if required path is missing (pk)', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);

    const value = {
      _id: 'test-id',
      // email is required
      name: 'name',
      location: 'Wonderland',
    };
    await expect(() => replace(context, 'users', value)).rejects.toThrow(
      InvalidIndexedFieldValueException
    );
  });

  test('should throw if required path is missing (sk)', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDBClient, [
      collectionWithRequiredPaths,
    ]);

    const value = {
      _id: 'test-id',
      // location is required
      name: 'name',
      email: 'test@example.com',
    };
    await expect(() => replace(context, 'users', value)).rejects.toThrow(
      InvalidIndexedFieldValueException
    );
  });
});
