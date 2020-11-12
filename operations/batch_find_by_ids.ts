import { Context } from '../context';
import { Converter, KeysAndAttributes, Key } from 'aws-sdk/clients/dynamodb';
import {
  InvalidFindDescriptorException,
  InternalProcessingException,
} from '../base/exceptions';
import {
  getChildCollection,
  getRootCollection,
  assemblePrimaryKeyValue,
  unwrap,
  getCollection,
} from '../base/util';
import { DocumentWithId, WrappedDocument } from '../base/common';
import { CollectionLayout } from '../base/layout';
import debugDynamo from '../debug/debugDynamo';
import { parseKey } from './batch_utils';

/**
 * The collection and ID of a root or child
 * item to retrieve with #transactFindByIds
 */
export type BatchFindByIdDescriptor = {
  /** The collection containing the item */
  collection: string;
  /* The ID of the item */
  id: string;
  /* The parent ID of the item (if a child item) */
  parentId?: string;
};

/** @internal */
export type TableKeyTuple = [string, Key];

/**
 * The response to a [[batchFindByIds]] request. The
 * retrieved documents are stored in a map, organised by
 * collection name.
 *
 * Any unprocessed request keys are included in the
 * unprocessedDescriptors list. You will need to submit
 * another request to obtain these.
 */
export type BatchFindByIdsResponse = {
  documentsByCollection: {
    [collection: string]: DocumentWithId[];
  };

  unprocessedDescriptors: BatchFindByIdDescriptor[];
};

export const batchFindByIds = async (
  ctx: Context,
  items: BatchFindByIdDescriptor[],
  options?: {
    consistentReadTableNames?: string[];
  }
): Promise<BatchFindByIdsResponse> => {
  if (items.length === 0) {
    throw new InvalidFindDescriptorException(
      'At least one find descriptor must be specified'
    );
  } else if (items.length > 100) {
    throw new InvalidFindDescriptorException(
      'No more than 100 find descriptors can be specified to batchFindByIds'
    );
  }

  // Map tables to their 'predicted' layouts - this is needed
  // because of the abject uselessness of the UnprocessedKeys structure, which
  // returns unprocessed items in random order arranged only
  // by table name.
  //
  // Because we could be accessing multiple tables, we need
  // the layout to discern the key names when parsing the
  // UnprocessedKeys map.
  const tableLayoutMapping = new Map<string, CollectionLayout>();

  const tableRequestItemTuples: TableKeyTuple[] = items.map(
    ({ collection, id, parentId }) => {
      const collectionDefinition = parentId
        ? getChildCollection(ctx, collection)
        : getRootCollection(ctx, collection);
      tableLayoutMapping.set(
        collectionDefinition.layout.tableName,
        collectionDefinition.layout
      );
      const {
        layout: { tableName, primaryKey, indexKeySeparator },
      } = collectionDefinition;
      return [
        tableName,
        {
          [primaryKey.partitionKey]: Converter.input(
            assemblePrimaryKeyValue(
              collection,
              parentId ? parentId : id,
              indexKeySeparator
            )
          ),
          [primaryKey.sortKey]: Converter.input(
            assemblePrimaryKeyValue(collection, id, indexKeySeparator)
          ),
        },
      ];
    }
  );

  const requestItems = tableRequestItemTuples.reduce((req, tuple) => {
    const keyAndsAttrs = req[tuple[0]] ?? {
      ConsistentRead: (options?.consistentReadTableNames ?? []).includes(
        tuple[0]
      ),
      Keys: [],
    };
    req[tuple[0]] = keyAndsAttrs;
    keyAndsAttrs.Keys.push(tuple[1]);
    return req;
  }, {} as { [collection: string]: KeysAndAttributes });

  const request = { RequestItems: requestItems };
  debugDynamo('batchGetItem', request);
  const { Responses = {}, UnprocessedKeys = {} } = await ctx.ddb
    .batchGetItem(request)
    .promise();

  const response: BatchFindByIdsResponse = {
    documentsByCollection: {},
    unprocessedDescriptors: [],
  };
  for (const items of Object.values(Responses)) {
    for (const item of items) {
      const unmarshalled = Converter.unmarshall(item) as WrappedDocument;
      const collection = getCollection(ctx, unmarshalled.type);
      const document = unwrap(unmarshalled);
      const collectionMap =
        response.documentsByCollection[collection.name] ?? [];
      response.documentsByCollection[collection.name] = collectionMap;
      collectionMap.push(document);
    }
  }

  for (const [tableName, unprocessed] of Object.entries(UnprocessedKeys)) {
    const tableMapping = tableLayoutMapping.get(tableName);
    if (!tableMapping) {
      throw new InternalProcessingException(
        `Could not find table mapping for ${tableName} while parsing UnprocessedKeys`
      );
    }
    for (const key of unprocessed.Keys) {
      const descriptor = parseKey(tableMapping, key);
      response.unprocessedDescriptors.push(descriptor);
    }
  }
  return response;
};
