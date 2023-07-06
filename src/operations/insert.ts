import { Context } from '../context';
import {
  getCollection,
  toWrapped,
  assemblePrimaryKeyValue,
} from '../base/util';
import { ConflictException } from '../base/exceptions';
import get from 'lodash/get';
import { DocumentWithId } from '../base/common';
import debugDynamo from '../debug/debugDynamo';
import { PutItemCommand, PutItemInput } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

/**
 * Insert a value into a collection. Adds an _id field to the value
 * if one is not provided using the `bson` ID generator (similar to
 * MongoDB IDs).
 *
 * @category Mutation
 *
 * @param context the context to use
 * @param collectionName name of the collection
 * @param value value to insert
 * @returns a copy of the inserted value, with appended `_id` field if not provided
 * @throws {ConflictException} when an item with the same _id already exists
 */
export async function insert<DocumentType extends DocumentWithId>(
  context: Context,
  collectionName: string,
  value: Record<string, unknown>
): Promise<DocumentType> {
  const collection = getCollection(context, collectionName);
  const wrapped = toWrapped<DocumentType>(collection, value);
  let request: PutItemInput;
  if (collection.type === 'child') {
    request = {
      TableName: collection.layout.tableName,
      Item: marshall(wrapped, { convertEmptyValues: false, removeUndefinedValues: true }),
      ReturnValues: 'NONE',
      ConditionExpression:
        'attribute_not_exists(#parentIdAttribute) and attribute_not_exists(#childIdAttribute)',
      ExpressionAttributeNames: {
        '#parentIdAttribute': assemblePrimaryKeyValue(
          collection.parentCollectionName,
          get(value, collection.foreignKeyPath),
          collection.layout.indexKeySeparator
        ),
        '#childIdAttribute': assemblePrimaryKeyValue(
          collection.name,
          wrapped.value._id,
          collection.layout.indexKeySeparator
        ),
      },
    };
  } else {
    request = {
      TableName: collection.layout.tableName,
      Item: marshall(wrapped, { convertEmptyValues: false, removeUndefinedValues: true }),
      ReturnValues: 'NONE',
      ConditionExpression: 'attribute_not_exists(#idAttribute)',
      ExpressionAttributeNames: {
        '#idAttribute': assemblePrimaryKeyValue(
          collection.name,
          wrapped.value._id,
          collection.layout.indexKeySeparator
        ),
      },
    };
  }
  try {
    debugDynamo('PutItem', request);
    const command = new PutItemCommand(request);
    await context.ddb.send(command);
  } catch (error) {
    if ((error as Error).name === 'ConditionalCheckFailedException') {
      throw new ConflictException(
        'An item with this _id already exists',
        wrapped.value._id
      );
    }
    throw error;
  }
  return wrapped.value;
}
