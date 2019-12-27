import { Converter, PutItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { toWrapped, getCollection } from '../base/util';
import { DocumentWithId } from '../base/common';

export async function replace(context: Context, collectionName: string, value: object): Promise<DocumentWithId> {
  const collection = getCollection(context, collectionName);
  const wrapped = toWrapped(collection, value);
  const request: PutItemInput = {
    TableName: collection.layout.tableName,
    Item: Converter.marshall(wrapped),
    ReturnValues: 'NONE',
  };

  await context.ddb.putItem(request).promise();
  return wrapped.value;
}
