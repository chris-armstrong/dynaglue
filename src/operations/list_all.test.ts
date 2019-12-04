import { DynamoDB } from 'aws-sdk';
import { createContext } from '../context';
import { listAll } from './list_all';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import { IndexNotFoundException } from '../exceptions';
import { QueryOutput } from 'aws-sdk/clients/dynamodb';

describe('listAll', () => {
  const layout = {
    tableName: 'test-table',
    primaryKey: { partitionKey: 'pkey', sortKey: 'skey' },
    listAllKey: { indexName: 'gs1', partitionKey: 'skey', sortKey: 'pkey' },
  };

  const collection = {
    name: 'users',
    layout,
  };

  test('when the list-all index is not defined it throws', () => {
    const ddb = createDynamoMock('query', {});
    const bareCollection = { ...collection, layout: { ...layout, listAllKey: undefined } };
    const context = createContext(ddb as unknown as DynamoDB, [bareCollection]);
    expect(listAll(context, 'users')).rejects.toThrowError(IndexNotFoundException);
  });

  test('when list-all returns items it maps the LastEvaluatedKey properly', async () => {
    const ddb = createDynamoMock('query', {
      Items: [{ value: { M: { _id: { S: 'test-id' } } } }],
      LastEvaluatedKey: { _id: 'test-id-3' }
    } as QueryOutput);
    const context = createContext(ddb as unknown as DynamoDB, [collection]);

    const result = await listAll(context, 'users');
    expect(result.items).toEqual([
      { _id: 'test-id' },
    ]);
    expect(result.nextToken).toEqual({ _id: 'test-id-3' });

    expect(ddb.query).toHaveBeenCalledTimes(1);
    expect(ddb.query).toHaveBeenLastCalledWith(expect.objectContaining({
      TableName: 'test-table',
      ExclusiveStartKey: undefined,
      IndexName: 'gs1',
      ExpressionAttributeNames: {
        '#partitionKeyName': 'skey',
      },
    }));
  });
});