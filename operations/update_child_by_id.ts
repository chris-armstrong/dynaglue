import { Context } from '../context';
import { Updates, updateInternal } from './update_by_id';
import { DocumentWithId } from '../base/common';
import { getChildCollection, assemblePrimaryKeyValue } from '../base/util';

export async function updateChildById(
  context: Context,
  collectionName: string,
  objectId: string,
  parentObjectId: string,
  updates: Updates,
): Promise<DocumentWithId> {
  const collection = getChildCollection(context, collectionName);

  const key = {
    [collection.layout.primaryKey.partitionKey]: { S: assemblePrimaryKeyValue(collectionName, parentObjectId) },
    [collection.layout.primaryKey.sortKey]: { S: assemblePrimaryKeyValue(collectionName, objectId) },
  };
  return updateInternal(context, collection, key, updates);
}
