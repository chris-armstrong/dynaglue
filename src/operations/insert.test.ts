import { CollectionLayout } from "../layout";
import { createDynamoMock, createDynamoMockError, createAWSError } from "../../testutil/dynamo_mock";
import { createContext } from "../context";
import { DynamoDB } from "aws-sdk/clients/all";
import { insert } from "./insert";
import { ConflictException } from "../exceptions";

describe('insert', () => {
  const layout: CollectionLayout = {
    tableName: 'my-objects',
    primaryKey: { partitionKey: 'pkey', sortKey: 'skey' },
  };
  const collection = {
    name: 'users',
    layout,
  };

  test('should insert an item conditionally', async () => {
    const ddb = createDynamoMock('putItem', {});
    const context = createContext(ddb as unknown as DynamoDB, [collection]);

    const value = { name: 'Chris', email: 'chris@example.com' };
    const result = await insert(context, 'users', value);
    expect(result).toHaveProperty('_id');

    const request = ddb.putItem.mock.calls[0][0];
    expect(request.TableName).toBe('my-objects');
    expect(request.Item).toBeDefined();
    expect(request.ConditionExpression).toMatch('attribute_not_exists');
  });

  test('should wrap and throw an exception if the item already exists', async () => {
    const ddb = createDynamoMockError('putItem', createAWSError('ConditionalCheckFailedException', 'The conditional check failed'));
    const context = createContext(ddb as unknown as DynamoDB, [collection]);

    const value = { _id: 'test-id', name: 'Chris', email: 'chris@example.com' };
    expect(insert(context, 'users', value)).rejects.toThrowError(ConflictException);
  });
})