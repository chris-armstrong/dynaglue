import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import { createContext } from '../context';
import { findChildById } from './find_child_by_id';
import { Collection } from '../base/collection';

describe('findChildById', () => {
  const layout = {
    tableName: 'testtable',
    primaryKey: { partitionKey: 'id', sortKey: 'collection' },
  };

  const rootCollection: Collection = {
    name: 'root-collection',
    type: 'root',
    layout,
  };
  const childCollection: Collection = {
    name: 'test-collection',
    layout,
    type: 'child',
    parentCollectionName: 'root-collection',
    foreignKeyPath: ['rootId'],
  };

  test('returns undefined when it cannot find a value', async () => {
    const getItemReturnValue = {};
    const ddb = createDynamoMock('getItem', getItemReturnValue);
    const context = createContext(ddb as unknown as DynamoDBClient, [
      rootCollection,
      childCollection,
    ]);
    expect(
      await findChildById(context, 'test-collection', 'test-id1', 'root-id-1')
    ).toBeUndefined();

    expect(ddb.send.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        input: {
          TableName: 'testtable',
          Key: {
            id: { S: 'root-collection|-|root-id-1' },
            collection: { S: 'test-collection|-|test-id1' },
          },
        },
      })
    );
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
    const context = createContext(ddb as unknown as DynamoDBClient, [
      rootCollection,
      childCollection,
    ]);

    expect(
      await findChildById(context, 'test-collection', 'test-id1', 'root-id-1')
    ).toEqual(item.value);

    expect(ddb.send.mock.calls[0][0].input).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'root-collection|-|root-id-1' },
        collection: { S: 'test-collection|-|test-id1' },
      },
    });
  });

  test('works with a custom layout index key separator correctly', async () => {
    const getItemReturnValue = {};
    const ddb = createDynamoMock('getItem', getItemReturnValue);
    const customLayout = { ...layout, indexKeySeparator: '#' };
    const customRootCollection = { ...rootCollection, layout: customLayout };
    const customChildCollection = { ...childCollection, layout: customLayout };
    const context = createContext(ddb as unknown as DynamoDBClient, [
      customRootCollection,
      customChildCollection,
    ]);
    expect(
      await findChildById(context, 'test-collection', 'test-id1', 'root-id-1')
    ).toBeUndefined();

    expect(ddb.send.mock.calls[0][0].input).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'root-collection#root-id-1' },
        collection: { S: 'test-collection#test-id1' },
      },
    });
  });
});
