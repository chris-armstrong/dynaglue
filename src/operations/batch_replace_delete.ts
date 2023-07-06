import {
  BatchWriteItemInput,
  WriteRequest,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { DocumentWithId, WrappedDocument } from '../base/common';
import {
  getCollection,
  toWrapped,
  unwrap,
  assemblePrimaryKeyValue,
} from '../base/util';
import { Context } from '../context';
import debugDynamo from '../debug/debugDynamo';
import { parseKey } from './batch_utils';
import { CollectionLayout } from '../base/layout';
import {
  InternalProcessingException,
  InvalidBatchReplaceDeleteDescriptorException,
} from '../base/exceptions';

/**
 * A replace (PutItem) request to perform with
 * [[batchReplaceDelete]].
 *
 * Performs the equivalent operation as [[replace]],
 * which is a full insert or update on the primary
 * key of the document.
 */
export type BatchReplaceDescriptor = {
  /** The root or child collection */
  collection: string;
  /** The operation to perform (always `'replace'`) */
  op: 'replace';
  /** The document of the item to be replaced */
  replaceItem: DocumentWithId;
};

/**
 * A replace (DeleteItem) request to perform with
 * [[batchReplaceDelete]].
 *
 * Performs the equivalent operation as [[deleteById]]/[[deleteChildById][,
 * which is a full delete on the primary key of a document
 */
export type BatchDeleteDescriptor = {
  /** The root or child collection */
  collection: string;
  /** The operation to perform */
  op: 'delete';
  /** The item identifier */
  id: string;
  /**
   * For child items, this is the parent object identifier
   * (mandatory for root
   * items, left blank for child items).
   */
  parentId?: string;
};

/**
 * A replace (PutItem) or delete (DeleteItem) request
 * to perform with [[batchReplaceDelete]]
 */
export type BatchReplaceDeleteDescriptor =
  | BatchReplaceDescriptor
  | BatchDeleteDescriptor;

/** @internal */
type TableRequestItemTuple = [string, WriteRequest];

/**
 * Response from {@link batchReplaceDelete}. Contains
 * unprocessed items.
 */
export type BatchReplaceDeleteResponse = {
  /**
   * The items that were not processed in this call. You will
   * need to resubmit them to the API in a subsequent call.
   */
  unprocessedDescriptors: BatchReplaceDeleteDescriptor[];
};

/**
 * Replace multiple items in bulk (effectively a bulk
 * `replaceItem()` call).
 * 
 * You can update multiple items across different
 * tables and collections in the same call.
 *
 * @category Batch Operations
 */
export const batchReplaceDelete = async (
  ctx: Context,
  descriptors: BatchReplaceDeleteDescriptor[]
): Promise<BatchReplaceDeleteResponse> => {
  if (descriptors.length === 0) {
    throw new InvalidBatchReplaceDeleteDescriptorException(
      'You must specify at least one replace or delete descriptor'
    );
  }
  // Because we could be accessing multiple tables, we need
  // the layout to discern the key names when parsing the
  // UnprocessedKeys map.
  const tableLayoutMapping = new Map<string, CollectionLayout>();

  const tableRequestItemTuples: TableRequestItemTuple[] = descriptors.map(
    (descriptor) => {
      const collection = getCollection(ctx, descriptor.collection);
      tableLayoutMapping.set(collection.layout.tableName, collection.layout);
      let request: WriteRequest;
      if (descriptor.op === 'replace') {
        // replace item
        request = {
          PutRequest: {
            Item: marshall(toWrapped(collection, descriptor.replaceItem), {
              convertEmptyValues: false,
            }),
          },
        };
      } else {
        if (collection.type === 'child' && !descriptor.parentId) {
          throw new InvalidBatchReplaceDeleteDescriptorException(
            'BatchDeleteDescriptor must specify parentId for child collections',
            { collectionName: descriptor.collection, id: descriptor.id }
          );
        } else if (collection.type !== 'child' && descriptor.parentId) {
          throw new InvalidBatchReplaceDeleteDescriptorException(
            'BatchDeleteDescriptor must not specify parentId for root collections',
            { collectionname: descriptor.collection, id: descriptor.id }
          );
        }
        const partitionKeyValue = assemblePrimaryKeyValue(
          collection.type === 'child'
            ? collection.parentCollectionName
            : collection.name,
          descriptor.parentId ?? descriptor.id,
          collection.layout.indexKeySeparator
        );
        const sortKeyValue = assemblePrimaryKeyValue(
          collection.name,
          descriptor.id,
          collection.layout.indexKeySeparator
        );
        request = {
          DeleteRequest: {
            Key: marshall(
              {
                [collection.layout.primaryKey.partitionKey]: partitionKeyValue,
                [collection.layout.primaryKey.sortKey]: sortKeyValue,
              },
              { convertEmptyValues: false, removeUndefinedValues: true }
            ),
          },
        };
      }
      return [collection.layout.tableName, request];
    }
  );

  const requestItems = tableRequestItemTuples.reduce(
    (riMap, [table, request]) => {
      const items = riMap[table] ?? [];
      riMap[table] = items;
      items.push(request);
      return riMap;
    },
    {} as { [key: string]: WriteRequest [] },
  );

  const request: BatchWriteItemInput = {
    RequestItems: requestItems,
  };

  debugDynamo('batchWriteItem', request);
  const command = new BatchWriteItemCommand(request);
  const { UnprocessedItems = {} } = await ctx.ddb.send(command);

  const unprocessedDescriptors: BatchReplaceDeleteDescriptor[] = [];
  for (const [tableName, unprocessed] of Object.entries(UnprocessedItems)) {
    const tableMapping = tableLayoutMapping.get(tableName);
    if (!tableMapping) {
      throw new InternalProcessingException(
        `Could not find table mapping for ${tableName} while parsing UnprocessedKeys`
      );
    }
    for (const item of unprocessed) {
      const { PutRequest, DeleteRequest } = item;
      if (PutRequest?.Item) {
        const key = parseKey(tableMapping, PutRequest.Item);
        const wrapped = unmarshall(
          PutRequest.Item
        ) as WrappedDocument<DocumentWithId>;
        const document = unwrap(wrapped);
        unprocessedDescriptors.push({
          op: 'replace',
          replaceItem: document,
          collection: key.collection,
        });
      } else if (DeleteRequest?.Key) {
        const key = parseKey(tableMapping, DeleteRequest.Key);
        unprocessedDescriptors.push({
          op: 'delete',
          ...key,
        });
      } else {
        throw new Error('Unknown unprocessed item: ' + JSON.stringify(item));
      }
    }
  }
  return {
    unprocessedDescriptors,
  };
};
