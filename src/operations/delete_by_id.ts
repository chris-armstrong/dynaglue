import { Converter, DeleteItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { getCollection, unwrap } from '../util';
import { WrappedDocument } from '../common';

/**
 * Delete an object using its `_id` field
 * @param context the context object
 * @param collectionName the name of the collection
 * @param id the object to remove
 * @returns the deleted object (as stored in the database), or
 * undefined if not found
 */
export async function deleteById(context: Context, collectionName: string, id: string) {
  const collection = getCollection(context, collectionName);
  const request: DeleteItemInput = {
    TableName: collection.layout.tableName,
    Key: Converter.marshall({
      [collection.layout.primaryKey.partitionKey]: id,
      [collection.layout.primaryKey.sortKey]: collectionName,
    }),
    ReturnValues: 'ALL_OLD',
  };
  const result = await context.ddb.deleteItem(request).promise();
  if (result.Attributes) {
    const wrapped = Converter.unmarshall(result.Attributes);
    return unwrap(wrapped as WrappedDocument);
  }
  return undefined;
}
