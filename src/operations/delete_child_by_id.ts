import { DeleteItemInput, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Context } from '../context';
import {
  unwrap,
  assemblePrimaryKeyValue,
  getChildCollection,
} from '../base/util';
import { WrappedDocument, DocumentWithId } from '../base/common';
import debugDynamo from '../debug/debugDynamo';
import { createNameMapper, createValueMapper } from '../base/mappers';
import { CompositeCondition } from '../base/conditions';
import { parseCompositeCondition } from '../base/conditions_parser';

/**
 * Delete a child object using its `_id` field and its parents `_id`.
 *
 * @category Mutation
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
export async function deleteChildById<DocumentType extends DocumentWithId>(
  context: Context,
  collectionName: string,
  id: string,
  rootObjectId: string,
  options: { condition?: CompositeCondition } = {}
): Promise<DocumentType | undefined> {
  const request: DeleteItemInput = createDeleteChildByIdRequest(
    context,
    collectionName,
    id,
    rootObjectId,
    options
  );

  debugDynamo('DeleteItem', request);

  const command = new DeleteItemCommand(request);
  const result = await context.ddb.send(command);
  if (result.Attributes) {
    const wrapped = unmarshall(result.Attributes);
    return unwrap(wrapped as WrappedDocument<DocumentType>);
  }
  return undefined;
}

/**
 * Create a delete child request using its `_id` field and its parents `_id`
 *
 * @category Mutation
 *
 * @param context the context object
 * @param collectionName the name of the collection
 * @param id the child object to remove
 * @param rootObjectId the parent object id
 * @param options options to apply
 * @param options.condition a condition expression blocking the delete operation
 * @returns the deleted request as @see {DeleteItemInput}
 * @throws {CollectionNotFoundException} when the collection is not found in the context
 */
export const createDeleteChildByIdRequest = (
  context: Context,
  collectionName: string,
  id: string,
  rootObjectId: string,
  options: { condition?: CompositeCondition } = {}
): DeleteItemInput => {
  const collection = getChildCollection(context, collectionName);

  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();

  let conditionExpression;
  if (options.condition) {
    conditionExpression = parseCompositeCondition(options.condition, {
      nameMapper,
      valueMapper,
      parsePath: [],
    });
  }
  const request: DeleteItemInput = {
    TableName: collection.layout.tableName,
    Key: marshall(
      {
        [collection.layout.primaryKey.partitionKey]: assemblePrimaryKeyValue(
          collection.parentCollectionName,
          rootObjectId,
          collection.layout.indexKeySeparator
        ),
        [collection.layout.primaryKey.sortKey]: assemblePrimaryKeyValue(
          collectionName,
          id,
          collection.layout.indexKeySeparator
        ),
      },
      { convertEmptyValues: false, removeUndefinedValues: true }
    ),
    ReturnValues: 'ALL_OLD',
    ConditionExpression: conditionExpression,
    ExpressionAttributeNames: nameMapper.get(),
    ExpressionAttributeValues: valueMapper.get(),
  };

  return request;
};
