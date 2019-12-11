import { Converter, PutItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { toWrapped, getCollection } from '../base/util';
import { InvalidUpdateException, ExistingItemNotFoundForUpdateException } from '../base/exceptions';
import { DocumentWithId } from '../base/common';

export async function updateById(context: Context, collectionName: string, value: DocumentWithId): Promise<DocumentWithId> {
  const collection = getCollection(context, collectionName);
  if (!value._id) {
    throw new InvalidUpdateException('must be an existing indexed value');
  }
  const wrapped = toWrapped(collection, value);

  const request: PutItemInput = {
    TableName: collection.layout.tableName,
    Item: Converter.marshall(wrapped),
    ReturnValues: 'NONE',
    ConditionExpression: 'attribute_exists(#idAttribute)',
    ExpressionAttributeNames: {
      '#idAttribute': collection.layout.primaryKey.partitionKey,
    },
  };

  try {
    await context.ddb.putItem(request).promise();
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      throw new ExistingItemNotFoundForUpdateException(
        'An item with this _id does not exist',
        wrapped.value._id
      );
    }
    throw error;
  }
  return wrapped.value;
}
