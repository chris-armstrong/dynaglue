import { Converter, GetItemInput } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import {
  unwrap,
  assemblePrimaryKeyValue,
  getChildCollection,
} from '../base/util';
import { DocumentWithId, WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';

/**
 * Retrieve a child item by its `_id` field and its parent `_id`.
 *
 * Child objects can only be directly retrieved with both the parent
 * and child _id. This limitation allows them to be stored without
 * an extra index, and enables the `findChildren` method to retrieve
 * all the children of a root object in the same call.
 *
 * @param context the context object
 * @param collectionName name of the collection to search
 * @param id the `_id` value
 * @param rootObjectId the _id of the root object
 * @param options the the set of options for the search
 * @param options.consistentRead search with strongly consistent reads
 * @returns the stored value, or `undefined` if not found
 * @throws {CollectionNotFoundException} when the collection is not found in the context
 */
export async function findChildById<DocumentType extends DocumentWithId>(
  context: Context,
  collectionName: string,
  id: string,
  rootObjectId: string,
  options?: {
    consistentRead?: boolean;
  }
): Promise<DocumentType | undefined> {
  const collection = getChildCollection(context, collectionName);
  const request: GetItemInput = {
    TableName: collection.layout.tableName,
    ConsistentRead: options?.consistentRead,
    Key: Converter.marshall(
      {
        [collection.layout.primaryKey.partitionKey]: assemblePrimaryKeyValue(
          collection.parentCollectionName,
          rootObjectId,
          collection.layout.indexKeySeparator
        ),
        [collection.layout.primaryKey.sortKey]: assemblePrimaryKeyValue(
          collectionName,
          id,
          collection.layout.indexKeySeparator
        ),
      },
      { convertEmptyValues: false }
    ),
  };
  debugDynamo('GetItem', request);
  const result = await context.ddb.getItem(request).promise();
  if (result.Item) {
    const wrapped = Converter.unmarshall(result.Item, {
      convertEmptyValues: false,
    });
    return unwrap(wrapped as WrappedDocument<DocumentType>);
  }
  return undefined;
}
