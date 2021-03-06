import { createDynamoMock } from '../testutil/dynamo_mock';
import { createContext } from '../context';
import { DynamoDB } from 'aws-sdk/clients/all';
import { findChildById } from './find_child_by_id';
import { Converter } from 'aws-sdk/clients/dynamodb';
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
    const context = createContext(ddb as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    expect(
      await findChildById(context, 'test-collection', 'test-id1', 'root-id-1')
    ).toBeUndefined();

    expect(ddb.getItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'root-collection|-|root-id-1' },
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
      Item: Converter.marshall(item),
    };
    const ddb = createDynamoMock('getItem', getItemReturnValue);
    const context = createContext(ddb as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);

    expect(
      await findChildById(context, 'test-collection', 'test-id1', 'root-id-1')
    ).toEqual(item.value);

    expect(ddb.getItem.mock.calls[0][0]).toEqual({
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
    const context = createContext(ddb as unknown as DynamoDB, [
      customRootCollection,
      customChildCollection,
    ]);
    expect(
      await findChildById(context, 'test-collection', 'test-id1', 'root-id-1')
    ).toBeUndefined();

    expect(ddb.getItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'root-collection#root-id-1' },
        collection: { S: 'test-collection#test-id1' },
      },
    });
  });
});
