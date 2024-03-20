import {
  TransactGetItem,
  TransactGetItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { convertToAttr, unmarshall } from '@aws-sdk/util-dynamodb';
import { Context } from '../context';
import { InvalidFindDescriptorException } from '../base/exceptions';
import {
  getChildCollection,
  getRootCollection,
  assemblePrimaryKeyValue,
  unwrap,
} from '../base/util';
import { DocumentWithId, WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';
import { ChildCollection } from '../base/collection';

/**
 * The collection and ID of a root or child
 * item to retrieve with #transactFindByIds
 */
export type TransactFindByIdDescriptor = {
  /** The collection containing the item */
  collection: string;
  /* The ID of the item */
  id: string;
  /* The parent ID of the item (if a child item) */
  rootId?: string;
};

export const transactFindByIds = async <DocumentType extends DocumentWithId>(
  ctx: Context,
  items: TransactFindByIdDescriptor[]
): Promise<(DocumentType | null)[]> => {
  if (items.length === 0) {
    throw new InvalidFindDescriptorException(
      'At least one find descriptor must be specified'
    );
  } else if (items.length > 25) {
    throw new InvalidFindDescriptorException(
      'No more than 25 find descriptors can be specified to transactFindByIds'
    );
  }
  const transactGetItems: TransactGetItem[] = items.map(
    ({ collection, id, rootId }) => {
      const collectionDefinition = rootId
        ? getChildCollection(ctx, collection)
        : getRootCollection(ctx, collection);
      const {
        layout: { tableName, primaryKey, indexKeySeparator },
      } = collectionDefinition;
      return {
        Get: {
          TableName: tableName,
          Key: {
            [primaryKey.partitionKey]: convertToAttr(
              assemblePrimaryKeyValue(
                rootId
                  ? (collectionDefinition as ChildCollection)
                      .parentCollectionName
                  : collectionDefinition.name,
                rootId ? rootId : id,
                indexKeySeparator
              ),
              { convertEmptyValues: false }
            ),
            [primaryKey.sortKey]: convertToAttr(
              assemblePrimaryKeyValue(collection, id, indexKeySeparator),
              { convertEmptyValues: false }
            ),
          },
        },
      };
    }
  );

  const request = { TransactItems: transactGetItems };
  debugDynamo('transactGetItems', request);
  const command = new TransactGetItemsCommand(request);
  const { Responses = [] } = await ctx.ddb.send(command);

  const returnedItems = [];
  for (const response of Responses) {
    if (response.Item) {
      const unmarshalled = unmarshall(response.Item);
      const item = unwrap(unmarshalled as WrappedDocument<DocumentType>);
      returnedItems.push(item);
    }
  }
  return returnedItems;
};
