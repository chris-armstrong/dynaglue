import { createDynamoMock } from '../testutil/dynamo_mock';
import { createContext } from '../context';
import { DynamoDB } from 'aws-sdk/clients/all';
import { findById } from './find_by_id';
import { Converter } from 'aws-sdk/clients/dynamodb';

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
    const context = createContext((ddb as unknown) as DynamoDB, [collection]);
    expect(await findById(context, 'test-collection', 'test-id1')).toBeUndefined();

    expect(ddb.getItem.mock.calls[0][0]).toEqual({
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
      Item: Converter.marshall(item),
    };
    const ddb = createDynamoMock('getItem', getItemReturnValue);
    const context = createContext((ddb as unknown) as DynamoDB, [collection]);

    expect(await findById(context, 'test-collection', 'test-id1')).toEqual(item.value);

    expect(ddb.getItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'test-collection|-|test-id1' },
        collection: { S: 'test-collection|-|test-id1' },
      },
    });
  });
});
