import get from 'lodash/get';
import createDebug from 'debug';
import { Context } from '../context';
import {
  UpdateItemInput,
  Converter,
  AttributeMap,
  Key,
} from 'aws-sdk/clients/dynamodb';
import {
  getRootCollection,
  assemblePrimaryKeyValue,
  unwrap,
  assembleIndexedValue,
  findMatchingPath,
  transformTTLValue,
} from '../base/util';
import { KeyPath } from '../base/access_pattern';
import { WrappedDocument, DocumentWithId } from '../base/common';
import {
  InvalidUpdatesException,
  InvalidUpdateValueException,
  IndexNotFoundException,
} from '../base/exceptions';
import { Collection } from '../base/collection';
import { SecondaryIndexLayout } from '../base/layout';
import debugDynamo from '../debug/debugDynamo';
import {
  createNameMapper,
  createValueMapper,
  NameMapper,
  ValueMapper,
} from '../base/mappers';
import { CompositeCondition } from '../base/conditions';
import { parseCompositeCondition } from '../base/conditions_parser';
import { isEqualKey } from './find';

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
 * A key path and value to set on a document as part
 * of an update operation. Specified as part of [[UpdateChangesDocument]],
 * this is a tuple in the form:
 *
 * `[key_path, new_value]`
 *
 * * *key_path* is the property path into the document to update (either
 *   as a dotted string path e.g. `'profile.name'` or a [[KeyPath]])
 * * *new_value* is the value to update the property path to (it cannot be
 *   undefined -- if you want to clear the value, see [[DeleteChange]])
 */
export type SetChange = [string | KeyPath, any];

/**
 * A property path to delete on a document as part of a [[UpdateChangesDocument]],
 * specified either as a dotted string path (e.g. `'profile.name'`) or a [[KeyPath]]
 */
export type DeleteChange = string | KeyPath;

/**
 * A set of changes to perform in an [[updateById]] or [[updateChildById]]
 * operation as an object. Each property is optional, but at
 * least one change must be specified.
 */
export type UpdateChangesDocument = {
  /**
   * The list of key paths to set a value. This is a list
   * of tuples, in the form [key_path, new_value]. The
   * key paths can be specified in a string form e.g. `'profile.name'`
   * or array form e.g. `['profile', 'name']`
   */
  $set?: SetChange[];
  /**
   * The list of key paths to clear the value. Key paths
   * may be specified in string form e.g. `'profile.name'` or
   * array form e.g. `['profile', 'name']`
   */
  $delete?: DeleteChange[];
};

/**
 * The set of updates to apply to a document. This can be
 * specified one of two ways:
 *
 * * an an object of key paths to values to set e.g. `{ 'profile.name': 'new name', 'status': 3 }`
 * * an operator object of changes to perform (see [[UpdateChangesDocument]])
 */
export type Updates = SetValuesDocument | UpdateChangesDocument;

const makeKeyPath = (pathOrPathArray: string | KeyPath): KeyPath =>
  typeof pathOrPathArray === 'string'
    ? pathOrPathArray.split('.')
    : pathOrPathArray;

/** @internal */
export type StrictSetChange = [KeyPath, any];
/** @internal */
export type StrictDeleteChange = KeyPath;
/** @internal */
export type StrictChangesDocument = {
  $set: StrictSetChange[];
  $delete: StrictDeleteChange[];
};

/**
 * @internal
 * Convert the Updates object to something normalised that
 * is simpler to process internally
 */
export const normaliseUpdates = (
  updatesToPerform: Updates
): StrictChangesDocument => {
  if (updatesToPerform.$set || updatesToPerform.$delete) {
    const changesDocument = updatesToPerform as UpdateChangesDocument;
    return {
      $set:
        changesDocument.$set?.map((setUpdate) => [
          makeKeyPath(setUpdate[0]),
          setUpdate[1],
        ]) ?? [],
      $delete: changesDocument.$delete?.map(makeKeyPath) ?? [],
    };
  } else {
    const updatesDocument = updatesToPerform as Updates;
    return {
      $set: Object.entries(updatesDocument).map(([key, value]) => [
        makeKeyPath(key),
        value,
      ]),
      $delete: [],
    };
  }
};

/**
 * @internal
 */
export const extractUpdateKeyPaths = (
  changes: StrictChangesDocument
): KeyPath[] => [...changes.$set.map(([path]) => path), ...changes.$delete];

/**
 * @internal
 */
export const getValueForUpdatePath = (
  matchingUpdatePath: KeyPath,
  keyPath: KeyPath,
  changes: StrictChangesDocument
): any => {
  // Work out if this was a $set update (in which case we get the index) or
  // a delete path (which we perform by deduction)
  const setPathIndex = changes.$set.findIndex(([setPath]) =>
    isEqualKey(setPath, matchingUpdatePath)
  );
  let value = setPathIndex >= 0 ? changes.$set[setPathIndex][1] : undefined;
  if (setPathIndex >= 0 && keyPath.length !== matchingUpdatePath.length) {
    const difference = keyPath.slice(matchingUpdatePath.length);
    value = get(value, difference);
  }
  return value;
};

/**
 * @internal
 */
export const createUpdateActionForKey = (
  collectionName: string,
  keyType: 'partition' | 'sort',
  keyPaths: KeyPath[],
  indexLayout: SecondaryIndexLayout,
  changes: StrictChangesDocument,
  separator?: string
):
  | { attributeName: string; value?: string; valueErasure: boolean }
  | undefined => {
  const updateKeyPaths = extractUpdateKeyPaths(changes);
  const matchingUpdatePaths = keyPaths.map((partitionKey) =>
    findMatchingPath(updateKeyPaths, partitionKey)
  );
  const attributeName =
    keyType === 'sort'
      ? (indexLayout.sortKey as string)
      : indexLayout.partitionKey;
  debug(
    'createUpdateActionForKey: collection=%s keyType=%s keyPaths=%o attributeName=%s',
    collectionName,
    keyType,
    keyPaths,
    attributeName
  );
  if (
    matchingUpdatePaths.every((updatePath) => typeof updatePath === 'undefined')
  ) {
    debug(
      'createUpdateActionForKey: no updates to %s key in collection %s',
      keyType,
      collectionName
    );
    return undefined;
  }
  debug(
    'createUpdateActionForKey: key to be updated matchingUpdatePaths=%o',
    matchingUpdatePaths
  );
  const updateValues = keyPaths.map((keyPath, index) => {
    const matchingUpdatePath = matchingUpdatePaths[index];
    if (!matchingUpdatePath) {
      return undefined;
    }
    return getValueForUpdatePath(matchingUpdatePath, keyPath, changes);
  });

  return {
    attributeName,
    value: assembleIndexedValue(
      keyType,
      collectionName,
      updateValues,
      separator
    ),
    valueErasure: updateValues.every((value) => typeof value === 'undefined'),
  };
};

/**
 * @internal
 *
 * Create the update action for a TTL key path
 */
export const createUpdateActionForTTLKey = (
  attributeName: string,
  keyPath: KeyPath,
  updates: StrictChangesDocument
): { attributeName: string; value?: number } | undefined => {
  const updateKeyPaths = extractUpdateKeyPaths(updates);
  const matchingUpdatePath = findMatchingPath(updateKeyPaths, keyPath);
  if (matchingUpdatePath) {
    const value = getValueForUpdatePath(matchingUpdatePath, keyPath, updates);
    return {
      attributeName,
      value: value ? transformTTLValue(value) : undefined,
    };
  }
  return undefined;
};

/**
 * @internal
 */
export const findCollectionIndex = (
  collection: Collection,
  indexName: string
): SecondaryIndexLayout => {
  const layout = collection.layout.findKeys?.find(
    (fk) => fk.indexName === indexName
  );
  if (!layout) {
    throw new IndexNotFoundException(indexName);
  }

  return layout;
};

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
  {
    nameMapper,
    valueMapper,
  }: { nameMapper: NameMapper; valueMapper: ValueMapper },
  changes: StrictChangesDocument
): {
  setActions: string[];
  deleteActions: string[];
} => {
  const expressionSetActions: string[] = [];
  const expressionDeleteActions: string[] = [];
  const { accessPatterns = [], ttlKeyPath } = collection;
  for (const { indexName, partitionKeys, sortKeys } of accessPatterns) {
    let partitionKeyUpdateSet: boolean = undefined;
    let sortKeyUpdated = false;
    const layout = findCollectionIndex(collection, indexName);
    if (partitionKeys.length > 0) {
      const update = createUpdateActionForKey(
        collection.name,
        'partition',
        partitionKeys,
        layout,
        changes,
        collection.layout.indexKeySeparator
      );
      if (update) {
        partitionKeyUpdateSet = !update.valueErasure;
        debug(
          'mapAccessPatterns: adding set/delete action for partition key in collection %s: %o',
          collection.name,
          update
        );
        const nameMapping = nameMapper.map(update.attributeName);
        const valueMapping = valueMapper.map(update.value);
        expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
      }
    }
    if (sortKeys && sortKeys.length > 0) {
      const update = createUpdateActionForKey(
        collection.name,
        'sort',
        sortKeys,
        layout,
        changes,
        collection.layout.indexKeySeparator
      );
      if (update) {
        debug(
          'mapAccessPatterns: adding set/delete action for sort key in collection %s: %o',
          collection.name,
          update
        );
        sortKeyUpdated = true;
        if (typeof update.value !== 'undefined') {
          const nameMapping = nameMapper.map(update.attributeName);
          const valueMapping = valueMapper.map(update.value);
          expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
        } else {
          const nameMapping = nameMapper.map(update.attributeName);
          expressionDeleteActions.push(nameMapping);
        }
      }
    } else if (typeof partitionKeyUpdateSet !== 'undefined') {
      // When only primary key has indexed paths (i.e. partitionKeys.length > 0,
      // sortKeys.length === 0, and we applied an update for the partitionKey)
      // make an empty update to the sort key to in-case it wasn't populated
      const nameMapping = nameMapper.map(layout.sortKey!);
      if (partitionKeyUpdateSet) {
        const valueMapping = valueMapper.map(
          assembleIndexedValue(
            'sort',
            collection.name,
            [],
            collection.layout.indexKeySeparator
          )
        );
        expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
      } else {
        expressionDeleteActions.push(nameMapping);
      }
    }

    // In the case the sort key is updated but there is no indexed partition key
    // paths, make sure the partition key gets a value written
    if (sortKeyUpdated && (!partitionKeys || partitionKeys.length === 0)) {
      const nameMapping = nameMapper.map(
        layout.partitionKey,
      );
      const valueMapping = valueMapper.map(
        assembleIndexedValue(
          'partition',
          collection.name,
          [],
          collection.layout.indexKeySeparator
        )
      );
      expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
    }
  }
  if (ttlKeyPath) {
    const updateAction = createUpdateActionForTTLKey(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      collection.layout.ttlAttribute!, // we've already asserted this in context creation
      ttlKeyPath,
      changes
    );
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
  return {
    setActions: expressionSetActions,
    deleteActions: expressionDeleteActions,
  };
};

/**
 * @internal
 *
 * Performs an update operation for the given collection and key
 * value. Shares most of the code between updateById and updateChildById
 *
 */
export async function updateInternal<DocumentType extends DocumentWithId>(
  ctx: Context,
  collection: Collection,
  key: Key,
  updatesToPerform: Updates,
  options: { condition?: CompositeCondition }
): Promise<DocumentType> {
  const changes = normaliseUpdates(updatesToPerform);
  if (changes.$set.length === 0 && changes.$delete.length === 0) {
    throw new InvalidUpdatesException(
      'There must be at least one update path in the updates object'
    );
  }
  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();
  let expressionSetActions: string[] = [];
  let expressionDeleteActions: string[] = [];

  for (const [path, newValue] of changes.$set.values()) {
    if (typeof newValue === 'undefined') {
      throw new InvalidUpdateValueException(
        path.join('.'),
        'value must not be undefined'
      );
    }
    const valueName = valueMapper.map(newValue);

    const expressionAttributeNameParts = [
      nameMapper.map('value', '#value'),
      ...path.map((part) => nameMapper.map(part)),
    ];
    expressionSetActions.push(
      `${expressionAttributeNameParts.join('.')} = ${valueName}`
    );
  }

  for (const path of changes.$delete) {
    const expressionAttributeNameParts = [
      nameMapper.map('value', '#value'),
      ...path.map((part) => nameMapper.map(part)),
    ];
    expressionDeleteActions.push(`${expressionAttributeNameParts.join('.')}`);
  }

  const {
    setActions: additionalSetActions,
    deleteActions: additionalDeleteActions,
  } = mapAccessPatterns(collection, { nameMapper, valueMapper }, changes);
  expressionSetActions = [...expressionSetActions, ...additionalSetActions];
  expressionDeleteActions = [
    ...expressionDeleteActions,
    ...additionalDeleteActions,
  ];

  let conditionExpression;
  if (options.condition) {
    conditionExpression = parseCompositeCondition(options.condition, {
      nameMapper,
      valueMapper,
      parsePath: [],
    });
  }

  const expressionAttributeNames = nameMapper.get();
  const expressionAttributeValues = valueMapper.get();
  const updateExpression =
    (expressionSetActions.length
      ? ` SET ${expressionSetActions.join(', ')}`
      : '') +
    (expressionDeleteActions.length
      ? ` REMOVE ${expressionDeleteActions.join(', ')}`
      : '');

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
  const unmarshalledAttributes = Converter.unmarshall(
    result.Attributes as AttributeMap
  );
  const updatedDocument = unwrap(
    unmarshalledAttributes as WrappedDocument<DocumentType>
  );
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
export async function updateById<DocumentType extends DocumentWithId>(
  ctx: Context,
  collectionName: string,
  objectId: string,
  updates: Updates,
  options: { condition?: CompositeCondition } = {}
): Promise<DocumentType> {
  const collection = getRootCollection(ctx, collectionName);

  const key = {
    [collection.layout.primaryKey.partitionKey]: {
      S: assemblePrimaryKeyValue(
        collectionName,
        objectId,
        collection.layout.indexKeySeparator
      ),
    },
    [collection.layout.primaryKey.sortKey]: {
      S: assemblePrimaryKeyValue(
        collectionName,
        objectId,
        collection.layout.indexKeySeparator
      ),
    },
  };
  return updateInternal(ctx, collection, key, updates, options);
}
