import { CollectionNotFoundException } from '../base/exceptions';
import { deleteChildById } from './delete_child_by_id';
import { createContext } from '../context';
import { DynamoDB } from 'aws-sdk/clients/all';
import { Converter } from 'aws-sdk/clients/dynamodb';
import { createDynamoMock } from '../testutil/dynamo_mock';
import { Collection } from '../base/collection';

describe('deleteChildById', () => {
  const layout = {
    tableName: 'testtable',
    primaryKey: { partitionKey: 'id', sortKey: 'collection' },
  };

  const rootCollection: Collection = {
    name: 'root-collection',
    layout,
  };

  const childCollection: Collection = {
    name: 'test-collection',
    type: 'child',
    layout,
    foreignKeyPath: ['rootId'],
    parentCollectionName: 'root-collection',
  };

  test('throws when the collection does not exist', () => {
    const context = createContext({} as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    expect(
      deleteChildById(context, 'not-a-collection', 'idvalue', 'rootid')
    ).rejects.toThrowError(CollectionNotFoundException);
  });

  test('returns undefined when there is no old value', async () => {
    const mock = {
      deleteItem: jest
        .fn()
        .mockReturnValue({ promise: jest.fn().mockResolvedValue({}) }),
    };
    const context = createContext(mock as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    const result = await deleteChildById(
      context,
      'test-collection',
      'idvalue',
      'rootid'
    );

    expect(mock.deleteItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'root-collection|-|rootid' },
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
      Attributes: Converter.marshall({ value }, { convertEmptyValues: false }),
    });
    const context = createContext(mock as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    const result = await deleteChildById(
      context,
      'test-collection',
      'idvalue',
      'rootid'
    );

    expect(mock.deleteItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'root-collection|-|rootid' },
        collection: { S: 'test-collection|-|idvalue' },
      },
      ReturnValues: 'ALL_OLD',
    });
    expect(result).toEqual(value);
  });

  test('works with custom separators', async () => {
    const mock = createDynamoMock('deleteItem', {});
    const customLayout = { ...layout, indexKeySeparator: '#' };
    const customRootCollection = { ...rootCollection, layout: customLayout };
    const customChildCollection = { ...childCollection, layout: customLayout };
    const context = createContext(mock as unknown as DynamoDB, [
      customRootCollection,
      customChildCollection,
    ]);
    await deleteChildById(context, 'test-collection', 'idvalue', 'rootid');

    expect(mock.deleteItem.mock.calls[0][0]).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'root-collection#rootid' },
        collection: { S: 'test-collection#idvalue' },
      },
      ReturnValues: 'ALL_OLD',
    });
  });
});
