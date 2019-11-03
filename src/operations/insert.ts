import { PutItemInput, Converter } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { getCollection, toWrapped } from '../util';
import { ConflictException } from '../exceptions';

/**
 * Insert a value into a collection. Adds an _id field to the value
 * if one is not provided using the `bson` ID generator (similar to
 * MongoDB IDs).
 *
 * @param context the context to use
 * @param collectionName name of the collection
 * @param value value to insert
 * @returns a copy of the inserted value, with appended `_id` field if not provided
 * @throws {ConflictException} when an item with the same _id already exists
 */
export async function insert(
  context: Context,
  collectionName: string,
  value: object
) {
  const collection = getCollection(context, collectionName);
  const wrapped = toWrapped(collection, value);
  const request: PutItemInput = {
    TableName: collection.layout.tableName,
    Item: Converter.marshall(wrapped),
    ReturnValues: 'NONE',
    ConditionExpression: 'attribute_not_exists(#idAttribute)',
    ExpressionAttributeNames: {
      '#idAttribute': collection.layout.primaryKey.partitionKey,
    },
  };
  try {
    await context.ddb.putItem(request).promise();
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      throw new ConflictException(
        'An item with this _id already exists',
        wrapped.value._id
      );
    }
    throw error;
  }
  return wrapped.value;
}
