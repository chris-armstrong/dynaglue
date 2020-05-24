import { Context } from "../context";
import { Converter, KeysAndAttributes, Key } from "aws-sdk/clients/dynamodb";
import { InvalidFindDescriptorException, InternalProcessingException } from "../base/exceptions";
import { getChildCollection, getRootCollection, assemblePrimaryKeyValue, unwrap, getCollection, SEPARATOR } from "../base/util";
import { DocumentWithId, WrappedDocument } from "../base/common";
import { CollectionLayout } from '../base/layout';
import debugDynamo from "../debug/debugDynamo";

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
  rootId?: string;
};

type TableKeyTuple = [string, Key];

export type BatchFindByIdsResponse = {
  documentsByCollection: {
    [collection: string]: DocumentWithId[];
  };

  unprocessedDescriptors: BatchFindByIdDescriptor[];
};

const parseKey = (layout: CollectionLayout, key: Key): BatchFindByIdDescriptor => {
  const partitionKey = Converter.output(key[layout.primaryKey.partitionKey]);
  const sortKey = Converter.output(key[layout.primaryKey.sortKey]);
  // The following checks are for sanity and should not occur in any real application that
  // has setup the layout correctly
  if (!partitionKey || !sortKey) throw new InternalProcessingException(`Selected layout could not find key names ${JSON.stringify(key)} for table ${layout.tableName}`);
  if (typeof partitionKey !== 'string') throw new InternalProcessingException(`Partition key ${layout.primaryKey.partitionKey} for table ${layout.tableName} is not a string`);
  if (typeof sortKey !== 'string') throw new InternalProcessingException(`Sort key ${layout.primaryKey.sortKey} for table ${layout.tableName} is not a string`);
  const [, rootId] = partitionKey.split(layout.indexKeySeparator ?? SEPARATOR, 2);
  const [childCollection, id] = sortKey.split(layout.indexKeySeparator ?? SEPARATOR, 2);
  return {
    collection: childCollection,
    rootId: rootId !== id ? rootId : undefined,
    id: id,
  };
};

export const batchFindByIds = async (
  ctx: Context,
  items: BatchFindByIdDescriptor[],
  options?: {
    consistentReadTableNames?: string[];
  },
): Promise<BatchFindByIdsResponse> => {
  if (items.length === 0) {
    throw new InvalidFindDescriptorException('At least one find descriptor must be specified');
  } else if (items.length > 100) {
    throw new InvalidFindDescriptorException('No more than 100 find descriptors can be specified to batchFindByIds');
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

  const tableRequestItemTuples: TableKeyTuple[] = items.map(({ collection, id, rootId }) => {
    const collectionDefinition = rootId ? getChildCollection(ctx, collection) : getRootCollection(ctx, collection);
    tableLayoutMapping.set(collectionDefinition.layout.tableName, collectionDefinition.layout);
    const { layout: { tableName, primaryKey, indexKeySeparator } } = collectionDefinition;
    return [
      tableName,
      {
        [primaryKey.partitionKey]: Converter.input(assemblePrimaryKeyValue(collection, rootId ? rootId : id, indexKeySeparator)),
        [primaryKey.sortKey]: Converter.input(assemblePrimaryKeyValue(collection, id, indexKeySeparator)),
      }
    ];
  });

  const requestItems = tableRequestItemTuples.reduce((req, tuple) => {
    const keyAndsAttrs = req[tuple[0]] ?? {
      ConsistentRead: (options?.consistentReadTableNames ?? []).includes(tuple[0]),
      Keys: [], 
    };
    req[tuple[0]] = keyAndsAttrs;
    keyAndsAttrs.Keys.push(tuple[1]);
    return req;
  }, {} as { [collection: string]: KeysAndAttributes });

  const request = { RequestItems: requestItems };
  debugDynamo('batchGetItem', request);
  const { Responses = {}, UnprocessedKeys = {} } = await ctx.ddb.batchGetItem(request).promise();

  const response: BatchFindByIdsResponse = {
    documentsByCollection: {},
    unprocessedDescriptors: [],
  };
  for (const items of Object.values(Responses)) {
    for (const item of items) {
      const unmarshalled = Converter.unmarshall(item) as WrappedDocument;
      const collection = getCollection(ctx, unmarshalled.type);
      const document = unwrap(unmarshalled);
      const collectionMap = response.documentsByCollection[collection.name] ?? [];
      response.documentsByCollection[collection.name] = collectionMap;
      collectionMap.push(document);
    }
  }

  for (const [tableName, unprocessed] of Object.entries(UnprocessedKeys)) {
    const tableMapping = tableLayoutMapping.get(tableName);
    if (!tableMapping) {
      throw new InternalProcessingException(`Could not find table mapping for ${tableName} while parsing UnprocessedKeys`);
    }
    for (const key of unprocessed.Keys) {
      const descriptor = parseKey(tableMapping, key);
      response.unprocessedDescriptors.push(descriptor);
    }
  }
  return response;
};

