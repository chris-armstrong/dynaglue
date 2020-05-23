import { Collection } from '../base/collection';
import { CollectionLayout } from '../base/layout';
import { createContext } from '../context';
import { createDynamoMock } from '../testutil/dynamo_mock';
import { findChildren } from '../operations/find_children';
import { DynamoDB } from 'aws-sdk/clients/all';
import { CollectionNotFoundException } from '../base/exceptions';
import { Converter } from 'aws-sdk/clients/dynamodb';

describe('findChildren', () => {
  const layout: CollectionLayout = {
    primaryKey: {
      partitionKey: 'pk1',
      sortKey: 'sk1',
    },
    tableName: 'main-table',
  }

  const rootCollection: Collection = {
    name: 'users',
    type: 'root',
    layout,
  };

  const childCollection: Collection = {
    name: 'addresses',
    type: 'child',
    layout,
    parentCollectionName: 'users',
    foreignKeyPath: ['userId'],
  };

  const address1 = { _id: 'address-1', street: 'Apple Pl' };
  const address2 = { _id: 'address-2', street: 'Timber Cl' };
  const address3 = { _id: 'address-3', street: 'Adrian St' };

  it('should throw when the child collection does not exist', () => {
    const dynamoMock = createDynamoMock('query', {});
    const context = createContext(dynamoMock as unknown as DynamoDB, [rootCollection]);
    expect(findChildren(context, 'addresses', 'user-1')).rejects
      .toThrowError(CollectionNotFoundException);
    expect(dynamoMock.query).not.toBeCalled();
  });

  it('should issue a query correctly and return the results when a nextToken is not provided', async () => {
    const item1 = Converter.marshall({ value: address1 })
    const item2 = Converter.marshall({ value: address2 })
    const dynamoMock = createDynamoMock('query', {
      Items: [item1, item2],
      LastEvaluatedKey: {
        S: 'address-2',
      },
    });
    const context = createContext(dynamoMock as unknown as DynamoDB, [rootCollection, childCollection]);
    const result = await findChildren(context, 'addresses', 'user-1');
    expect(result).toEqual({
      items: [address1, address2],
      nextToken: {
        S: 'address-2',
      },
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(jasmine.objectContaining({
      TableName: layout.tableName,
      ExpressionAttributeNames: undefined,
      ExpressionAttributeValues: {
        ':value0': {
          S: 'users|-|user-1',
        },
        ':value1': {
          S: 'addresses|-|',
        },
      },
    }));
  });

  it('should issue a query correctly and return the results when a nextToken is provided', async () => {
    const item1 = Converter.marshall({ value: address3 })
    const dynamoMock = createDynamoMock('query', {
      Items: [item1],
      LastEvaluatedKey: undefined,
    });
    const context = createContext(dynamoMock as unknown as DynamoDB, [rootCollection, childCollection]);
    const result = await findChildren(context, 'addresses', 'user-1', { 'field': { S: 'address-2' } });
    expect(result).toEqual({
      items: [address3],
      nextToken: undefined
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(jasmine.objectContaining({
      TableName: layout.tableName,
      ExpressionAttributeNames: undefined,
      ExpressionAttributeValues: {
        ':value0': {
          S: 'users|-|user-1',
        },
        ':value1': {
          S: 'addresses|-|',
        },
      },
      ExclusiveStartKey: { field: { S: 'address-2' } },
    }));
  });

  it('should issue a query correctly and return the results when the layout has a custom separator', async () => {
    const item1 = Converter.marshall({ value: address1 })
    const item2 = Converter.marshall({ value: address2 })
    const dynamoMock = createDynamoMock('query', {
      Items: [item1, item2],
      LastEvaluatedKey: {
        S: 'address-2',
      },
    });
    const customRootCollection = { ...rootCollection, layout: { ...layout, indexKeySeparator: '#' } };
    const customChildCollection = { ...childCollection, layout: { ...layout, indexKeySeparator: '#' } };
    const context = createContext(dynamoMock as unknown as DynamoDB, [customRootCollection, customChildCollection]);
    const result = await findChildren(context, 'addresses', 'user-1');
    expect(result).toEqual({
      items: [address1, address2],
      nextToken: {
        S: 'address-2',
      },
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(jasmine.objectContaining({
      TableName: layout.tableName,
      ExpressionAttributeNames: undefined,
      ExpressionAttributeValues: {
        ':value0': {
          S: 'users#user-1',
        },
        ':value1': {
          S: 'addresses#',
        },
      },
    }));
  });

});
