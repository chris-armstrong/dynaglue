import { Context } from '../context';
import { Updates, updateInternal } from './update_by_id';
import { DocumentWithId } from '../base/common';
import { getChildCollection, assemblePrimaryKeyValue } from '../base/util';
import { CompositeCondition } from '../base/conditions';

/**
  * Update a child document using its `_id` and parent `_id`.
  *
  * This operation allows you to do a partial update of a collection document i.e. without
  * specifying all the values (it uses DynamoDB`s `UpdateItem` operation).
  *
  * At this time, the `updates` value just updates specified key paths on the target document.
  * 
  * If some of the update key paths are indexed values, the indexes will also be updated. Because
  * of this, you must specify all the key values in an access pattern to ensure indexes are
  * updated consistently.
  *
  * @param ctx the context
  * @param collectionName the collection to update
  * @param objectId the `_id` value of the object to update
  * @param parentObjectId: the `_id` value of the parent object
  * @param updates the set of updates to apply.
  * @param options options to apply
  * @param options.condition an optional conditional expression that must be satifisfied for the update to proceed
  * @returns the updated object value in its entirety.
  * @throws {CollectionNotFoundException} collection not found
  * @throws {InvalidUpdatesException} thrown when the updates object is invalid or incomplete
  * @throws {InvalidUpdateValueException} thrown when one of the update values is an invalid type
  */
export async function updateChildById(
  context: Context,
  collectionName: string,
  objectId: string,
  parentObjectId: string,
  updates: Updates,
  options: { condition?: CompositeCondition } = {},
): Promise<DocumentWithId> {
  const collection = getChildCollection(context, collectionName);

  const key = {
    [collection.layout.primaryKey.partitionKey]: { S: assemblePrimaryKeyValue(collectionName, parentObjectId) },
    [collection.layout.primaryKey.sortKey]: { S: assemblePrimaryKeyValue(collectionName, objectId) },
  };
  return updateInternal(context, collection, key, updates, options);
}

