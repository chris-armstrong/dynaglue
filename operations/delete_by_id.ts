import { Converter, DeleteItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { unwrap, assemblePrimaryKeyValue, getRootCollection } from '../base/util';
import { WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';

/**
 * Delete a root object using its `_id` field
 * @param context the context object
 * @param collectionName the name of the collection
 * @param id the object to remove
 * @returns the deleted object (as stored in the database), or
 * undefined if not found
 */
export async function deleteById(context: Context, collectionName: string, id: string): Promise<any> {
  const collection = getRootCollection(context, collectionName);
  const request: DeleteItemInput = {
    TableName: collection.layout.tableName,
    Key: Converter.marshall({
      [collection.layout.primaryKey.partitionKey]: assemblePrimaryKeyValue(collectionName, id),
      [collection.layout.primaryKey.sortKey]: assemblePrimaryKeyValue(collectionName, id),
    }),
    ReturnValues: 'ALL_OLD',
  };
  debugDynamo('DeleteItem', request);
  const result = await context.ddb.deleteItem(request).promise();
  if (result.Attributes) {
    const wrapped = Converter.unmarshall(result.Attributes);
    return unwrap(wrapped as WrappedDocument);
  }
  return undefined;
}
