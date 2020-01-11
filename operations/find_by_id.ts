import { Converter, GetItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { unwrap, assemblePrimaryKeyValue, getRootCollection } from '../base/util';
import { WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';

/**
 * Retrieve a root item by its `_id` field.
 *
 * @param context the context object
 * @param collectionName name of the collection to search
 * @param id the `_id` value
 * @returns the stored value, or `undefined` if not found
 */
export async function findById(
  context: Context,
  collectionName: string,
  id: string
): Promise<any> {
  const collection = getRootCollection(context, collectionName);
  const request: GetItemInput = {
    TableName: collection.layout.tableName,
    Key: Converter.marshall({
      [collection.layout.primaryKey.partitionKey]: assemblePrimaryKeyValue(collectionName, id),
      [collection.layout.primaryKey.sortKey]: assemblePrimaryKeyValue(collectionName, id),
    }),
  };
  debugDynamo('GetItem', request);
  const result = await context.ddb.getItem(request).promise();
  if (result.Item) {
    const wrapped = Converter.unmarshall(result.Item);
    return unwrap(wrapped as WrappedDocument);
  }
  return undefined;
}
