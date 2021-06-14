import { CollectionNotFoundException } from '../base/exceptions';
import { deleteById } from './delete_by_id';
import { createContext } from '../context';
import { DynamoDB } from 'aws-sdk/clients/all';
import { Converter } from 'aws-sdk/clients/dynamodb';
import { createDynamoMock } from '../testutil/dynamo_mock';

describe('deleteById', () => {
  const layout = {
    tableName: 'testtable',
    primaryKey: { partitionKey: 'id', sortKey: 'collection' },
  };

  const collection = {
    name: 'test-collection',
    layout,
  };

  test('throws when the collection does not exist', () => {
    const context = createContext({} as DynamoDB, [collection]);
    expect(
      deleteById(context, 'not-a-collection', 'idvalue')
    ).rejects.toThrowError(CollectionNotFoundException);
  });

  test('returns undefined when there is no old value', async () => {
    const mock = {
      deleteItem: jest
        .fn()
        .mockReturnValue({ promise: jest.fn().mockResolvedValue({}) }),
    };
    const context = createContext(mock as unknown as DynamoDB, [collection]);
    const result = await deleteById(context, 'test-collection', 'idvalue');

    expect(mock.deleteItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'test-collection|-|idvalue' },
        collection: { S: 'test-collection|-|idvalue' },
      },
      ReturnValues: 'ALL_OLD',
    });
    expect(result).toBeUndefined();
  });

  test('returns old value when it is returned', async () => {
    const value = {
      _id: 'idvalue',
      name: 'Test Name',
    };

    const mock = createDynamoMock('deleteItem', {
      Attributes: Converter.marshall({ value }),
    });
    const context = createContext(mock as unknown as DynamoDB, [collection]);
    const result = await deleteById(context, 'test-collection', 'idvalue');

    expect(mock.deleteItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'test-collection|-|idvalue' },
        collection: { S: 'test-collection|-|idvalue' },
      },
      ReturnValues: 'ALL_OLD',
    });
    expect(result).toEqual(value);
  });

  test('works with custom separators', async () => {
    const mock = createDynamoMock('deleteItem', {});
    const customCollection = {
      ...collection,
      layout: { ...layout, indexKeySeparator: '#' },
    };
    const context = createContext(mock as unknown as DynamoDB, [
      customCollection,
    ]);
    await deleteById(context, 'test-collection', 'idvalue');

    expect(mock.deleteItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'test-collection#idvalue' },
        collection: { S: 'test-collection#idvalue' },
      },
      ReturnValues: 'ALL_OLD',
    });
  });
});
