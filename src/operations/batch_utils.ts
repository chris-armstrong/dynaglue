import { convertToNative } from '@aws-sdk/util-dynamodb';
import { Key } from '../base/common';
import { InternalProcessingException } from '../base/exceptions';
import { CollectionLayout } from '../base/layout';
import { SEPARATOR } from '../base/util';

/**
 * @internal
 *
 * The ID of a root or child item.
 *
 */
export type ItemIdDescriptor = {
  /** The collection containing the item */
  collection: string;
  /* The ID of the item */
  id: string;
  /* The parent ID of the item (if a child item) */
  parentId?: string;
};

/**
 * @internal
 *
 * Parse a dynaglue key. For use with BatchGetItem/BatchWriteItem interactions,
 * which return unprocessed items in a random order, requiring us to disassemble
 * our request in order to work out what to resubmit.
 *
 */
export const parseKey = (
  layout: CollectionLayout,
  key: Key
): ItemIdDescriptor => {
  const partitionKey = convertToNative(key[layout.primaryKey.partitionKey]);
  const sortKey = convertToNative(key[layout.primaryKey.sortKey]);
  // The following checks are for sanity and should not occur in any real application that
  // has setup the layout correctly
  if (!partitionKey || !sortKey)
    throw new InternalProcessingException(
      `Selected layout could not find key names ${JSON.stringify(
        key
      )} for table ${layout.tableName}`
    );
  if (typeof partitionKey !== 'string')
    throw new InternalProcessingException(
      `Partition key ${layout.primaryKey.partitionKey} for table ${layout.tableName} is not a string`
    );
  if (typeof sortKey !== 'string')
    throw new InternalProcessingException(
      `Sort key ${layout.primaryKey.sortKey} for table ${layout.tableName} is not a string`
    );
  const [, parentId] = partitionKey.split(
    layout.indexKeySeparator ?? SEPARATOR,
    2
  );
  const [childCollection, id] = sortKey.split(
    layout.indexKeySeparator ?? SEPARATOR,
    2
  );
  return {
    collection: childCollection,
    parentId: parentId !== id ? parentId : undefined,
    id: id,
  };
};
