import get from 'lodash/get';
import createDebug from 'debug';
import { Context } from '../context';
import { UpdateItemInput, Converter, AttributeMap, Key } from 'aws-sdk/clients/dynamodb';
import { getRootCollection, assemblePrimaryKeyValue, unwrap, assembleIndexedValue, findMatchingPath, transformTTLValue } from '../base/util';
import { KeyPath } from '../base/access_pattern';
import { WrappedDocument, DocumentWithId } from '../base/common';
import { InvalidUpdatesException, InvalidUpdateValueException, IndexNotFoundException } from '../base/exceptions';
import { Collection } from '../base/collection';
import { SecondaryIndexLayout } from '../base/layout';
import debugDynamo from '../debug/debugDynamo';
import { createNameMapper, createValueMapper, NameMapper, ValueMapper } from '../base/mappers';
import { CompositeCondition } from '../base/conditions';
import { parseCompositeCondition } from '../base/conditions_parser';

/** @internal */
const debug = createDebug('dynaglue:operations:updateById');

/**
  * An update object, where the key paths are specified as keys and the values
  * as the new field values.
  *
  * Keep in mind, that although this is a partial update, you need to specify
  * all the keys for a composite key in an access pattern - it cannot partially
  * update composite index values.
  */
export type SetValuesDocument = {
  [path: string]: any;
};

/**
  * The set of updates to apply to a document.
  */
export type Updates = SetValuesDocument;

/**
  * @internal
  */
export const extractUpdateKeyPaths = (updates: Updates): KeyPath[] =>
  Object.keys(updates).map(updatePath => updatePath.split('.'));

/**
 * @internal
 */
export const getValueForUpdatePath = (matchingUpdatePath: KeyPath, keyPath: KeyPath, updates: Updates): any => {
  let value = updates[matchingUpdatePath.join('.')];
  if (keyPath.length !== matchingUpdatePath.length) {
    const difference = keyPath.slice(matchingUpdatePath.length);
    value = get(value, difference);
  }
  return value;
}

/**
  * @internal
  */
export const createUpdateActionForKey = (
  collectionName: string,
  keyType: 'partition' | 'sort',
  keyPaths: KeyPath[],
  indexLayout: SecondaryIndexLayout,
  updates: Updates,
): { attributeName: string; value?: string } | undefined => {
  const updateKeyPaths = extractUpdateKeyPaths(updates);
  const matchingUpdatePaths = keyPaths.map(partitionKey => findMatchingPath(updateKeyPaths, partitionKey));
  const attributeName = (keyType === 'sort' ? indexLayout.sortKey as string : indexLayout.partitionKey);
  debug('createUpdateActionForKey: collection=%s keyType=%s keyPaths=%o attributeName=%s', collectionName, keyType, keyPaths, attributeName);
  if (matchingUpdatePaths.every(updatePath => updatePath === undefined)) {
    debug('createUpdateActionForKey: no updates to %s key in collection %s', keyType, collectionName);
    return undefined;
  }
  if (keyType === 'partition' && !matchingUpdatePaths.every(updatePath => updatePath !== undefined)) {
    throw new InvalidUpdatesException(`all values are required for ${keyType} access pattern with keys {${keyPaths.map(kp => kp.join('.')).join(', ')}}`)
  } 
  debug('createUpdateActionForKey: key to be updated matchingUpdatePaths=%o', matchingUpdatePaths);
  const updateValues = keyPaths.map((keyPath, index) => {
    const matchingUpdatePath = matchingUpdatePaths[index];
    if (!matchingUpdatePath) {
      return undefined;
    }
    return getValueForUpdatePath(matchingUpdatePath, keyPath, updates);
  });

  return {
    attributeName,
    value: assembleIndexedValue(keyType, collectionName, updateValues),
  };
}

/**
 * @internal
 *
 * Create the update action for a TTL key path
 */
export const createUpdateActionForTTLKey = (
  attributeName: string,
  keyPath: KeyPath,
  updates: Updates,
): { attributeName: string; value?: number } | undefined => {
  const updateKeyPaths = extractUpdateKeyPaths(updates);
  const matchingUpdatePath = findMatchingPath(updateKeyPaths, keyPath);
  if (matchingUpdatePath) {
    const value = getValueForUpdatePath(matchingUpdatePath, keyPath, updates);
    return { attributeName, value: value ? transformTTLValue(value) : undefined };
  }
  return undefined;
}

/**
  * @internal
  */
export const findCollectionIndex = (
  collection: Collection,
  indexName: string
): SecondaryIndexLayout => {
  const layout = collection.layout.findKeys?.find(fk => fk.indexName === indexName);
  if (!layout) {
    throw new IndexNotFoundException(indexName);
  }

  return layout;
}

/**
  * @internal
  */
export type Action = {
  action: string;
  expressionAttributeValue: [string, any];
  expressionAttributeNames: [string, string][];
};

/**
 * @internal
 *
 * Given the set of updates, create the SET and DELETE
 * actions for the access patterns that also have to be
 * changed.
 */
export const mapAccessPatterns = (
  collection: Collection,
  { nameMapper, valueMapper }: { nameMapper: NameMapper; valueMapper: ValueMapper },
  updates: Updates,
): {
  setActions: string[];
  deleteActions: string[];
} => {
  const expressionSetActions: string[] = [];
  const expressionDeleteActions: string[] = [];
  const { accessPatterns = [], ttlKeyPath } = collection
  for (const { indexName, partitionKeys, sortKeys } of accessPatterns) {
    if (partitionKeys.length > 0) {
      const layout = findCollectionIndex(collection, indexName);
      const update = createUpdateActionForKey(collection.name, 'partition', partitionKeys, layout, updates);
      if (update) {
        debug('mapAccessPatterns: adding set action for partition key in collection %s: %o', collection.name, update);
        const nameMapping = nameMapper.map(update.attributeName);
        const valueMapping = valueMapper.map(update.value);
        expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
      }
    }
    if (sortKeys && sortKeys.length > 0) {
      const layout = findCollectionIndex(collection, indexName);
      const update = createUpdateActionForKey(collection.name, 'sort', sortKeys, layout, updates);
      if (update) {
        debug('mapAccessPatterns: adding set/delete action for sort key in collection %s: %o', collection.name, update);
        if (typeof update.value !== 'undefined') {
          const nameMapping = nameMapper.map(update.attributeName);
          const valueMapping = valueMapper.map(update.value);
          expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
        } else {
          const nameMapping = nameMapper.map(update.attributeName);
          expressionDeleteActions.push(nameMapping);
        }
      }
    }
  }
  if (ttlKeyPath) {
    const updateAction = createUpdateActionForTTLKey(collection.layout.ttlAttribute!, ttlKeyPath, updates);
    if (updateAction) {
      const nameMapping = nameMapper.map(updateAction.attributeName);
      if (updateAction.value) {
        const valueMapping = valueMapper.map(updateAction.value);
        expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
      } else {
        expressionDeleteActions.push(nameMapping);
      }
    }
  }
  return { setActions: expressionSetActions, deleteActions: expressionDeleteActions };
}

/**
 * @internal
 *
 * Performs an update operation for the given collection and key
 * value. Shares most of the code between updateById and updateChildById
 *
 */
export async function updateInternal(
  ctx: Context,
  collection: Collection,
  key: Key,
  updates: Updates,
  options: { condition?: CompositeCondition },
): Promise<DocumentWithId> {
  const updatePaths: string[] = Object.keys(updates);
  if (updatePaths.length === 0) {
    throw new InvalidUpdatesException('There must be at least one update path in the updates object');
  }
  const updateKeyPaths: KeyPath[] = extractUpdateKeyPaths(updates);

  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();
  let expressionSetActions: string[] = [];
  let expressionDeleteActions: string[] = [];
  for (const [index, updatePath] of updatePaths.entries()) {
    const updateKeyPath = updateKeyPaths[index];

    const value = updates[updatePath];
    if (typeof value === 'undefined') {
      throw new InvalidUpdateValueException(updatePath, 'value must not be undefined');
    }
    const valueName = valueMapper.map(value);

    const expressionAttributeNameParts = [nameMapper.map('value', '#value'), ...updateKeyPath.map(part => nameMapper.map(part))];
    expressionSetActions.push(`${expressionAttributeNameParts.join('.')} = ${valueName}`);
  }

  const { setActions: additionalSetActions, deleteActions: additionalDeleteActions } = 
    mapAccessPatterns(collection, { nameMapper, valueMapper }, updates);
  expressionSetActions = [...expressionSetActions, ...additionalSetActions];
  expressionDeleteActions = [...expressionDeleteActions, ...additionalDeleteActions];

  let conditionExpression;
  if (options.condition) {
    conditionExpression = parseCompositeCondition(options.condition, { nameMapper, valueMapper, parsePath: [] });
  }

  const expressionAttributeNames = nameMapper.get();
  const expressionAttributeValues = valueMapper.get();
  const updateExpression = 
    (expressionSetActions.length ? ` SET ${expressionSetActions.join(', ')}` : '') +
    (expressionDeleteActions.length ? ` REMOVE ${expressionDeleteActions.join(', ')}` : '');

  const updateItem: UpdateItemInput = {
    TableName: collection.layout.tableName,
    Key: key,
    ReturnValues: 'ALL_NEW',
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    UpdateExpression: updateExpression.trim(),
    ConditionExpression: conditionExpression,
  };

  debugDynamo('UpdateItem', updateItem);

  const result = await ctx.ddb.updateItem(updateItem).promise();
  const unmarshalledAttributes = Converter.unmarshall(result.Attributes as AttributeMap);
  const updatedDocument = unwrap(unmarshalledAttributes as WrappedDocument);
  return updatedDocument;
}

/**
  * Update a document using its `_id`.
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
  * @param updates the set of updates to apply.
  * @returns the updated object value in its entirety.
  * @throws {CollectionNotFoundException} collection not found
  * @throws {InvalidUpdatesException} thrown when the updates object is invalid or incomplete
  * @throws {InvalidUpdateValueException} thrown when one of the update values is an invalid type
  */
export async function updateById(
  ctx: Context,
  collectionName: string,
  objectId: string,
  updates: Updates,
  options: { condition?: CompositeCondition } = {},
): Promise<DocumentWithId> {
  const collection = getRootCollection(ctx, collectionName);

  const key = {
    [collection.layout.primaryKey.partitionKey]: { S: assemblePrimaryKeyValue(collectionName, objectId) },
    [collection.layout.primaryKey.sortKey]: { S: assemblePrimaryKeyValue(collectionName, objectId) },
  };
  return updateInternal(ctx, collection, key, updates, options);
};

