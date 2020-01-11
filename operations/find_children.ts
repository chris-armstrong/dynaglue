import { getChildCollection, assemblePrimaryKeyValue, SEPARATOR, unwrap } from '../base/util';
import { QueryInput, Key, Converter } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { DocumentWithId, WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';

type FindChildrenResults = {
  items: DocumentWithId[];
  nextToken?: Key;
};

/**
 * Find all the child objects of a root (top-level) object.
 *
 * The parent collection is determined by the reference in the
 * child collection.
 *
 * This method has a `nextToken`, which is used for pagination - it
 * is returned when there is more values to retrieve. You should
 * write your code to repeatedly call findChildren with the nextToken
 * value of the previous call until it comes back undefined in order
 * to retrieve all the values.
 *
 * @param ctx the context
 * @param childCollectionName name of the child object collection
 * @param rootObjectId the `_id` of the root object
 * @param nextToken the next token from the previous call, or `undefined` if there are no more values
 */
export async function findChildren(
  ctx: Context,
  childCollectionName: string,
  rootObjectId: string,
  nextToken?: Key,
): Promise<FindChildrenResults> {
  const childCollection = getChildCollection(ctx, childCollectionName);

  const request: QueryInput = {
    TableName: childCollection.layout.tableName,
    KeyConditionExpression: '#partitionKeyName = :parentId AND begins_with(#sortKeyName, :childCollectionName)',
    ExpressionAttributeNames: {
      '#partitionKeyName': childCollection.layout.primaryKey.partitionKey,
      '#sortKeyName': childCollection.layout.primaryKey.sortKey,
    },
    ExpressionAttributeValues: {
      ':parentId': {
        S: assemblePrimaryKeyValue(childCollection.parentCollectionName, rootObjectId),
      },
      ':childCollectionName': {
        S: `${childCollection.name}${SEPARATOR}`,
      },
    },
    ExclusiveStartKey: nextToken,
  };

  debugDynamo('Query', request);
  const results = await ctx.ddb.query(request).promise();
  return {
    items: (results.Items||[]).map(item => unwrap(Converter.unmarshall(item) as WrappedDocument)),
    nextToken: results.LastEvaluatedKey,
  };
}
