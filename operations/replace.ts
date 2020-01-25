import { Converter, PutItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { toWrapped, getCollection } from '../base/util';
import { DocumentWithId } from '../base/common';
import debugDynamo from '../debug/debugDynamo';

/**
  * Insert or replace a value in a collection. 
  * 
  * This operation differs from [[insert]] in that it does not check for the existence
  * of a document with the same `_id` value - it will replace whatever is there.
  *
  * @param context the context
  * @param collectionName the collection to update
  * @param value the document to insert or replace
  * @returns the inserted / replaced value
  * @throws {CollectionNotFoundException} when the collection is not found
  */
export async function replace(context: Context, collectionName: string, value: object): Promise<DocumentWithId> {
  const collection = getCollection(context, collectionName);
  const wrapped = toWrapped(collection, value);
  const request: PutItemInput = {
    TableName: collection.layout.tableName,
    Item: Converter.marshall(wrapped),
    ReturnValues: 'NONE',
  };
  debugDynamo('PutItem', request);
  await context.ddb.putItem(request).promise();
  return wrapped.value;
}
