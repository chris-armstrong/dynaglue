import { PutItemCommand, PutItemInput } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { Context } from '../context';
import { toWrapped, getCollection } from '../base/util';
import { DocumentWithId, WrappedDocument } from '../base/common';
import { createNameMapper, createValueMapper } from '../base/mappers';
import debugDynamo from '../debug/debugDynamo';
import { CompositeCondition } from '../base/conditions';
import { parseCompositeCondition } from '../base/conditions_parser';

/**
 * Insert or replace a value in a collection.
 *
 * This operation differs from [[insert]] in that it does not check for the existence
 * of a document with the same `_id` value - it will replace whatever is there.
 *
 * @category Mutation
 *
 * @param context the context
 * @param collectionName the collection to update
 * @param value the document to insert or replace
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satisfied for the update to proceed
 * @returns the inserted / replaced value
 * @throws {CollectionNotFoundException} when the collection is not found
 */
export async function replace<DocumentType extends DocumentWithId>(
  context: Context,
  collectionName: string,
  value: Record<string, unknown>,
  options: { condition?: CompositeCondition } = {}
): Promise<DocumentType> {
  const { request, wrapped } = createReplaceByIdRequest(
    context,
    collectionName,
    value,
    options
  );

  debugDynamo('PutItem', request);
  const command = new PutItemCommand(request);
  await context.ddb.send(command);
  return (wrapped as WrappedDocument<DocumentType>).value;
}

/**
 * Create a request for Insert or Replace request
 *
 * This operation differs from [[insert]] in that it does not check for the existence
 * of a document with the same `_id` value - it will replace whatever is there.
 *
 * @category Mutation
 *
 * @param context the context
 * @param collectionName the collection to update
 * @param value the document to insert or replace
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satisfied for the update to proceed
 * @returns the inserted / replaced request @see {PutItemInput}
 * @throws {CollectionNotFoundException} when the collection is not found
 */
export const createReplaceByIdRequest = <DocumentType extends DocumentWithId>(
  context: Context,
  collectionName: string,
  value: Record<string, unknown>,
  options: { condition?: CompositeCondition } = {}
): { request: PutItemInput; wrapped: WrappedDocument<DocumentType> } => {
  const collection = getCollection(context, collectionName);
  const wrapped = toWrapped<DocumentType>(collection, value);

  let conditionExpression;
  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();
  if (options.condition) {
    conditionExpression = parseCompositeCondition(options.condition, {
      nameMapper,
      valueMapper,
      parsePath: [],
    });
  }

  const item = marshall(wrapped, {
    convertEmptyValues: false,
    removeUndefinedValues: true,
  });
  const request: PutItemInput = {
    TableName: collection.layout.tableName,
    Item: item,
    ReturnValues: 'NONE',
    ConditionExpression: conditionExpression,
    ExpressionAttributeNames: nameMapper.get(),
    ExpressionAttributeValues: valueMapper.get(),
  };

  return { request, wrapped };
};
