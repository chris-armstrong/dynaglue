import { QueryCommand, QueryInput } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  getChildCollection,
  assemblePrimaryKeyValue,
  unwrap,
} from '../base/util';
import { Context } from '../context';
import { DocumentWithId, Key, WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';
import { CompositeCondition } from '../base/conditions';
import { createNameMapper, createValueMapper } from '../base/mappers';

/**
 * The results of a [[findChildren]] operation.
 */
export type FindChildrenResults<DocumentType extends DocumentWithId> = {
  /** the items that were returned in this batch */
  items: DocumentType[];
  /** The pagination token. If this value is specified, it means
   * there is more results for the query. Provide it to another
   * call to `findChildren` to get the next set of results.
   */
  nextToken?: Key;
};

/**
 * The options to a [[findChildren]] operation
 */
export type FindChildrenOptions = {
  /*
   * The item limit to pass to DynamoDB
   */
  limit?: number;
  /**
   * `true` (default) to scan the index forward, `false` to scan it backward
   */
  scanForward?: boolean;
  /**
   * An optional filter expression for the
   * find operation
   */
  filter?: CompositeCondition;
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
 * @param options the options to control the query
 * @param options.limit number of records to return
 * @param options.scanForward=true true for ascending index order
 * @param options.filter an optional filter expression to apply
 * @throws {CollectionNotFoundException} when the collection is not found in the context
 */
export async function findChildren<DocumentType extends DocumentWithId>(
  ctx: Context,
  childCollectionName: string,
  rootObjectId: string,
  nextToken?: Key,
  options: FindChildrenOptions = {}
): Promise<FindChildrenResults<DocumentType>> {
  const childCollection = getChildCollection(ctx, childCollectionName);
  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();

  const {
    parentCollectionName,
    layout: {
      primaryKey: { partitionKey, sortKey },
    },
  } = childCollection;

  const parentId = assemblePrimaryKeyValue(
    parentCollectionName,
    rootObjectId,
    childCollection.layout.indexKeySeparator
  );
  const childCollectionPrefix = assemblePrimaryKeyValue(
    childCollectionName,
    '',
    childCollection.layout.indexKeySeparator
  );

  const keyConditionExpression =
    `${nameMapper.map(partitionKey)} = ${valueMapper.map(parentId)} ` +
    `AND begins_with(${nameMapper.map(sortKey)}, ${valueMapper.map(
      childCollectionPrefix
    )})`;
  const request: QueryInput = {
    TableName: childCollection.layout.tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: nameMapper.get(),
    ExpressionAttributeValues: valueMapper.get(),
    ExclusiveStartKey: nextToken,
    Limit: options?.limit,
    ScanIndexForward: options?.scanForward ?? true,
  };

  debugDynamo('Query', request);
  const command = new QueryCommand(request);
  const results = await ctx.ddb.send(command);
  return {
    items: (results.Items || []).map((item) =>
      unwrap(unmarshall(item) as WrappedDocument<DocumentType>)
    ),
    nextToken: results.LastEvaluatedKey,
  };
}
