import { Converter, DeleteItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { unwrap, assemblePrimaryKeyValue, getChildCollection } from '../base/util';
import { WrappedDocument, DocumentWithId } from '../base/common';
import debugDynamo from '../debug/debugDynamo';

/**
 * Delete a child object using its `_id` field and its parents `_id`.
 * @param context the context object
 * @param collectionName the name of the collection
 * @param id the child object to remove
 * @param rootObjectId the parent object id
 * @returns the deleted object (as stored in the database), or
 * undefined if not found
 */
export async function deleteChildById(context: Context, collectionName: string, id: string, rootObjectId: string): Promise<DocumentWithId|undefined> {
  const collection = getChildCollection(context, collectionName);
  const request: DeleteItemInput = {
    TableName: collection.layout.tableName,
    Key: Converter.marshall({
      [collection.layout.primaryKey.partitionKey]: assemblePrimaryKeyValue(collection.parentCollectionName, rootObjectId),
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
