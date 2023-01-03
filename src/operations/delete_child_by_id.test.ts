import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CollectionNotFoundException } from '../base/exceptions';
import { deleteChildById } from './delete_child_by_id';
import { createContext } from '../context';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import { Collection } from '../base/collection';
import { marshall } from '@aws-sdk/util-dynamodb';

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
    const context = createContext({} as DynamoDBClient, [
      rootCollection,
      childCollection,
    ]);
    return expect(
      deleteChildById(context, 'not-a-collection', 'idvalue', 'rootid')
    ).rejects.toThrowError(CollectionNotFoundException);
  });

  test('returns undefined when there is no old value', async () => {
    const mock = createDynamoMock('deleteItem', {});
    const context = createContext(mock as unknown as DynamoDBClient, [
      rootCollection,
      childCollection,
    ]);
    const result = await deleteChildById(
      context,
      'test-collection',
      'idvalue',
      'rootid'
    );

    expect(mock.send.mock.calls[0][0].input).toEqual({
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
      Attributes: marshall({ value }, { convertEmptyValues: false, removeUndefinedValues: true }),
    });
    const context = createContext(mock as unknown as DynamoDBClient, [
      rootCollection,
      childCollection,
    ]);
    const result = await deleteChildById(
      context,
      'test-collection',
      'idvalue',
      'rootid'
    );

    expect(mock.send.mock.calls[0][0].input).toEqual({
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
    const context = createContext(mock as unknown as DynamoDBClient, [
      customRootCollection,
      customChildCollection,
    ]);
    await deleteChildById(context, 'test-collection', 'idvalue', 'rootid');

    expect(mock.send.mock.calls[0][0].input).toEqual({
      TableName: 'testtable',
      Key: {
        id: { S: 'root-collection#rootid' },
        collection: { S: 'test-collection#idvalue' },
      },
      ReturnValues: 'ALL_OLD',
    });
  });
});
