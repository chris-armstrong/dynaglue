import { Context } from '../context';
import { TransactGetItem, Converter } from 'aws-sdk/clients/dynamodb';
import { InvalidFindDescriptorException } from '../base/exceptions';
import {
  getChildCollection,
  getRootCollection,
  assemblePrimaryKeyValue,
  unwrap,
} from '../base/util';
import { DocumentWithId, WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';

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
            [primaryKey.partitionKey]: Converter.input(
              assemblePrimaryKeyValue(
                collection,
                rootId ? rootId : id,
                indexKeySeparator
              ),
              { convertEmptyValues: false }
            ),
            [primaryKey.sortKey]: Converter.input(
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
  const { Responses = [] } = await ctx.ddb.transactGetItems(request).promise();

  const returnedItems = new Array(items.length);
  for (const response of Responses) {
    let item = null;
    if (response.Item) {
      const unmarshalled = Converter.unmarshall(response.Item, {
        convertEmptyValues: false,
      });
      item = unwrap(unmarshalled as WrappedDocument<DocumentType>);
    }
    returnedItems.push(item);
  }
  return returnedItems;
};
