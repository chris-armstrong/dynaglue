import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import { createContext } from '../context';
import { findById } from './find_by_id';

describe('findById', () => {
  const layout = {
    tableName: 'testtable',
    primaryKey: { partitionKey: 'id', sortKey: 'collection' },
  };

  const collection = {
    name: 'test-collection',
    layout,
  };

  test('returns undefined when it cannot find a value', async () => {
    const getItemReturnValue = {};
    const ddb = createDynamoMock('getItem', getItemReturnValue);
    const context = createContext(ddb as unknown as DynamoDBClient, [collection]);
    expect(
      await findById(context, 'test-collection', 'test-id1')
    ).toBeUndefined();

    expect(ddb.send.mock.calls[0][0].input).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'test-collection|-|test-id1' },
        collection: { S: 'test-collection|-|test-id1' },
      },
    });
  });

  test('returns the unwrapped value when it exists', async () => {
    const item = {
      value: {
        _id: 'test-id1',
        location: {
          lat: 123,
          lon: 456.78,
        },
      },
    };
    const getItemReturnValue = {
      Item: marshall(item),
    };
    const ddb = createDynamoMock('getItem', getItemReturnValue);
    const context = createContext(ddb as unknown as DynamoDBClient, [collection]);

    expect(await findById(context, 'test-collection', 'test-id1')).toEqual(
      item.value
    );

    expect(ddb.send.mock.calls[0][0].input).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'test-collection|-|test-id1' },
        collection: { S: 'test-collection|-|test-id1' },
      },
    });
  });

  test('works with custom separators correctly', async () => {
    const getItemReturnValue = {};
    const ddb = createDynamoMock('getItem', getItemReturnValue);
    const customCollection = {
      ...collection,
      layout: { ...layout, indexKeySeparator: '@' },
    };
    const context = createContext(ddb as unknown as DynamoDBClient, [
      customCollection,
    ]);
    await findById(context, 'test-collection', 'test-id1');

    expect(ddb.send.mock.calls[0][0].input).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'test-collection@test-id1' },
        collection: { S: 'test-collection@test-id1' },
      },
    });
  });
});
