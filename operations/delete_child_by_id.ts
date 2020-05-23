import { Converter, DeleteItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { unwrap, assemblePrimaryKeyValue, getChildCollection } from '../base/util';
import { WrappedDocument, DocumentWithId } from '../base/common';
import debugDynamo from '../debug/debugDynamo';
import { createNameMapper, createValueMapper } from '../base/mappers';
import { CompositeCondition } from '../base/conditions';
import { parseCompositeCondition } from '../base/conditions_parser';

/**
 * Delete a child object using its `_id` field and its parents `_id`.
 *
 * @param context the context object
 * @param collectionName the name of the collection
 * @param id the child object to remove
 * @param rootObjectId the parent object id
 * @param options options to change behaviour of DynamoDB
 * @param options.condition a condition expression blocking the delete operation
 * @returns the deleted object (as stored in the database), or
 * `undefined` if not found
 * @throws {CollectionNotFoundException} when the collection is not found in the context
 */
export async function deleteChildById(
  context: Context,
  collectionName: string,
  id: string, 
  rootObjectId: string,
  options: { condition?: CompositeCondition } = {},
): Promise<DocumentWithId|undefined> {
  const collection = getChildCollection(context, collectionName);
  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();
  let conditionExpression;
  if (options.condition) {
    conditionExpression = parseCompositeCondition(options.condition, { nameMapper, valueMapper, parsePath: [] });
  }
  const request: DeleteItemInput = {
    TableName: collection.layout.tableName,
    Key: Converter.marshall({
      [collection.layout.primaryKey.partitionKey]: assemblePrimaryKeyValue(collection.parentCollectionName, rootObjectId, collection.layout.indexKeySeparator),
      [collection.layout.primaryKey.sortKey]: assemblePrimaryKeyValue(collectionName, id, collection.layout.indexKeySeparator),
    }),
    ReturnValues: 'ALL_OLD',
    ConditionExpression: conditionExpression,
    ExpressionAttributeNames: nameMapper.get(),
    ExpressionAttributeValues: valueMapper.get(),
  };
  debugDynamo('DeleteItem', request);
  const result = await context.ddb.deleteItem(request).promise();
  if (result.Attributes) {
    const wrapped = Converter.unmarshall(result.Attributes);
    return unwrap(wrapped as WrappedDocument);
  }
  return undefined;
}
