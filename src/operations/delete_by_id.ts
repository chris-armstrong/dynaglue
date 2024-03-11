import { DeleteItemCommand, DeleteItemInput } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Context } from '../context';
import {
  unwrap,
  assemblePrimaryKeyValue,
  getRootCollection,
} from '../base/util';
import { DocumentWithId, WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';
import { CompositeCondition } from '../base/conditions';
import { createNameMapper, createValueMapper } from '../base/mappers';
import { parseCompositeCondition } from '../base/conditions_parser';

/**
 * Delete a root object using its `_id` field
 *
 * @category Mutation
 *
 * @param context the context object
 * @param collectionName the name of the collection
 * @param id the object to remove
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satifisfied for the update to proceed
 * @returns the deleted object (as stored in the database), or
 * `undefined` if not found
 * @throws {CollectionNotFoundException} when the collection is not found in the context
 */
export async function deleteById<DocumentType extends DocumentWithId>(
  context: Context,
  collectionName: string,
  id: string,
  options: { condition?: CompositeCondition } = {}
): Promise<DocumentType | undefined> {
  const request: DeleteItemInput = createDeleteByIdRequest(
    context,
    collectionName,
    id,
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
 * Create a delete request using its `_id` field
 *
 * @category Mutation
 *
 * @param context the context object
 * @param collectionName the name of the collection
 * @param id the object to remove
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satifisfied for the update to proceed
 * @returns the delete request as @see {DeleteItemInput}
 * @throws {CollectionNotFoundException} when the collection is not found in the context
 */
export const createDeleteByIdRequest = (
  context: Context,
  collectionName: string,
  id: string,
  options: { condition?: CompositeCondition } = {}
): DeleteItemInput => {
  const collection = getRootCollection(context, collectionName);
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
          collectionName,
          id,
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
