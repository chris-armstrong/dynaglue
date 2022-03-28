import DynamoDB, { Converter } from 'aws-sdk/clients/dynamodb';
import { Collection } from '../base/collection';
import { CollectionLayout } from '../base/layout';
import { createContext } from '../context';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import { findChildren } from '../operations/find_children';
import { CollectionNotFoundException } from '../base/exceptions';

describe('findChildren', () => {
  const layout: CollectionLayout = {
    primaryKey: {
      partitionKey: 'pk1',
      sortKey: 'sk1',
    },
    tableName: 'main-table',
  };

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
  const address4 = { _id: 'address-4', street: 'Blank Bvl' };

  it('should throw when the child collection does not exist', async () => {
    const dynamoMock = createDynamoMock('query', {});
    const context = createContext(dynamoMock as unknown as DynamoDB, [
      rootCollection,
    ]);
    await expect(
      findChildren(context, 'addresses', 'user-1')
    ).rejects.toThrowError(CollectionNotFoundException);
    expect(dynamoMock.query).not.toBeCalled();
  });

  it('should issue a query correctly and return the results when a nextToken is not provided', async () => {
    const item1 = Converter.marshall(
      { value: address1 },
      { convertEmptyValues: false }
    );
    const item2 = Converter.marshall(
      { value: address2 },
      { convertEmptyValues: false }
    );
    const dynamoMock = createDynamoMock('query', {
      Items: [item1, item2],
      LastEvaluatedKey: {
        S: 'address-2',
      },
    });
    const context = createContext(dynamoMock as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    const result = await findChildren(context, 'addresses', 'user-1');
    expect(result).toEqual({
      items: [address1, address2],
      nextToken: {
        S: 'address-2',
      },
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(
      expect.objectContaining({
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
        KeyConditionExpression: 'pk1 = :value0 AND begins_with(sk1, :value1)',
      })
    );
  });

  it('should issue a query correctly and return the results when a nextToken is provided', async () => {
    const item1 = Converter.marshall(
      { value: address3 },
      { convertEmptyValues: false }
    );
    const dynamoMock = createDynamoMock('query', {
      Items: [item1],
      LastEvaluatedKey: undefined,
    });
    const context = createContext(dynamoMock as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    const result = await findChildren(context, 'addresses', 'user-1', {
      field: { S: 'address-2' },
    });
    expect(result).toEqual({
      items: [address3],
      nextToken: undefined,
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(
      expect.objectContaining({
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
      })
    );
  });

  it('should issue a query correctly and return the results when the layout has a custom separator', async () => {
    const item1 = Converter.marshall(
      { value: address1 },
      { convertEmptyValues: false }
    );
    const item2 = Converter.marshall(
      { value: address2 },
      { convertEmptyValues: false }
    );
    const dynamoMock = createDynamoMock('query', {
      Items: [item1, item2],
      LastEvaluatedKey: {
        S: 'address-2',
      },
    });
    const customRootCollection = {
      ...rootCollection,
      layout: { ...layout, indexKeySeparator: '#' },
    };
    const customChildCollection = {
      ...childCollection,
      layout: { ...layout, indexKeySeparator: '#' },
    };
    const context = createContext(dynamoMock as unknown as DynamoDB, [
      customRootCollection,
      customChildCollection,
    ]);
    const result = await findChildren(context, 'addresses', 'user-1');
    expect(result).toEqual({
      items: [address1, address2],
      nextToken: {
        S: 'address-2',
      },
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(
      expect.objectContaining({
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
      })
    );
  });

  it('should correctly construct a gt range expression', async () => {
    const item2 = Converter.marshall(
      { value: address2 },
      { convertEmptyValues: false }
    );
    const item3 = Converter.marshall(
      { value: address3 },
      { convertEmptyValues: false }
    );
    const item4 = Converter.marshall(
      { value: address4 },
      { convertEmptyValues: false }
    );
    const dynamoMock = createDynamoMock('query', {
      Items: [item2, item3, item4],
      LastEvaluatedKey: {
        S: 'address-2',
      },
    });
    const context = createContext(dynamoMock as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    const result = await findChildren(
      context,
      'addresses',
      'user-1',
      undefined,
      { range: { op: 'gt', value: 'address-1' } }
    );
    expect(result).toEqual({
      items: [address2, address3, address4],
      nextToken: {
        S: 'address-2',
      },
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(
      expect.objectContaining({
        TableName: layout.tableName,
        ExpressionAttributeNames: undefined,
        ExpressionAttributeValues: {
          ':value0': {
            S: 'users|-|user-1',
          },
          ':value1': {
            S: 'addresses|-|address-2',
          },
          ':value2': {
            S: 'addresses|-|\uFFFF',
          },
        },
        KeyConditionExpression:
          'pk1 = :value0 AND sk1 BETWEEN :value1 AND :value2',
      })
    );
  });

  it('should correctly construct a begins_with range expression', async () => {
    const item2 = Converter.marshall(
      { value: address2 },
      { convertEmptyValues: false }
    );
    const item3 = Converter.marshall(
      { value: address3 },
      { convertEmptyValues: false }
    );
    const item4 = Converter.marshall(
      { value: address4 },
      { convertEmptyValues: false }
    );
    const dynamoMock = createDynamoMock('query', {
      Items: [item2, item3, item4],
      LastEvaluatedKey: {
        S: 'address-2',
      },
    });
    const context = createContext(dynamoMock as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    const result = await findChildren(
      context,
      'addresses',
      'user-1',
      undefined,
      { range: { op: 'begins_with', value: 'address-' } }
    );
    expect(result).toEqual({
      items: [address2, address3, address4],
      nextToken: {
        S: 'address-2',
      },
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(
      expect.objectContaining({
        TableName: layout.tableName,
        ExpressionAttributeNames: undefined,
        ExpressionAttributeValues: {
          ':value0': {
            S: 'users|-|user-1',
          },
          ':value1': {
            S: 'addresses|-|address-',
          },
        },
        KeyConditionExpression: 'pk1 = :value0 AND begins_with(sk1, :value1)',
      })
    );
  });

  it('should correctly construct a lte range expression', async () => {
    const item2 = Converter.marshall(
      { value: address1 },
      { convertEmptyValues: false }
    );
    const item3 = Converter.marshall(
      { value: address2 },
      { convertEmptyValues: false }
    );
    const item4 = Converter.marshall(
      { value: address3 },
      { convertEmptyValues: false }
    );
    const dynamoMock = createDynamoMock('query', {
      Items: [item2, item3, item4],
    });
    const context = createContext(dynamoMock as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    const result = await findChildren(
      context,
      'addresses',
      'user-1',
      undefined,
      { range: { op: 'lte', value: 'address-3' } }
    );
    expect(result).toEqual({
      items: [address1, address2, address3],
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(
      expect.objectContaining({
        TableName: layout.tableName,
        ExpressionAttributeNames: undefined,
        ExpressionAttributeValues: {
          ':value0': {
            S: 'users|-|user-1',
          },
          ':value1': {
            S: 'addresses|-|',
          },
          ':value2': {
            S: 'addresses|-|address-3',
          },
        },
        KeyConditionExpression:
          'pk1 = :value0 AND sk1 BETWEEN :value1 AND :value2',
      })
    );
  });

  it('should correctly construct a between range expression', async () => {
    const item2 = Converter.marshall(
      { value: address2 },
      { convertEmptyValues: false }
    );
    const item3 = Converter.marshall(
      { value: address3 },
      { convertEmptyValues: false }
    );
    const item4 = Converter.marshall(
      { value: address4 },
      { convertEmptyValues: false }
    );
    const dynamoMock = createDynamoMock('query', {
      Items: [item2, item3, item4],
      LastEvaluatedKey: {
        S: 'address-2',
      },
    });
    const context = createContext(dynamoMock as unknown as DynamoDB, [
      rootCollection,
      childCollection,
    ]);
    const result = await findChildren(
      context,
      'addresses',
      'user-1',
      undefined,
      { range: { op: 'between', min: 'address-2', max: 'address-4' } }
    );
    expect(result).toEqual({
      items: [address2, address3, address4],
      nextToken: {
        S: 'address-2',
      },
    });

    expect(dynamoMock.query).toBeCalledTimes(1);
    expect(dynamoMock.query).toBeCalledWith(
      expect.objectContaining({
        TableName: layout.tableName,
        ExpressionAttributeNames: undefined,
        ExpressionAttributeValues: {
          ':value0': {
            S: 'users|-|user-1',
          },
          ':value1': {
            S: 'addresses|-|address-2',
          },
          ':value2': {
            S: 'addresses|-|address-4',
          },
        },
        KeyConditionExpression:
          'pk1 = :value0 AND sk1 BETWEEN :value1 AND :value2',
      })
    );
  });
});
