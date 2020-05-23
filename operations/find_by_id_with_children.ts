import { Key, Converter, QueryInput } from 'aws-sdk/clients/dynamodb';
import fromPairs from 'lodash/fromPairs';
import { WrappedDocument, DocumentWithId } from '../base/common';
import { Context } from '../context';
import { unwrap, getCollection, getChildCollection, assemblePrimaryKeyValue } from '../base/util';
import { CollectionNotFoundException } from '../base/exceptions';
import { createNameMapper, createValueMapper } from '../base/mappers';
import debugDynamo from '../debug/debugDynamo';

export type FindByIdWithChildrenResult = {
  /**
   * The root object.
   *
   * It may be blank if it is not in the current set of
   * results (this depends on how objects are organised
   * on your index, or if the root object exists at all).
   * If your result is paginated (i.e. there is a `nextToken`),
   * it is important to continue calling `findByIdWithChildren`
   * with the previous `nextToken` and keep checking `root`
   * on each set of results.
   */
  root?: DocumentWithId;
  /**
   * The child objects, organised by collection names.
   *
   * Similar to the root object, you must check each page
   * of results for children, which will come back based
   * on index order and scan direction.
   */
  children: { [collection: string]: DocumentWithId[] };

  /**
   * The pagination token. If this is not blank, you
   * need to call `findByIdWithChildren` with this 
   * value to get the next page of results.
   */
  nextToken?: Key;
};

/**
 * Find a root object with one or more of its child collections.

 * It is used to implement the **adjacency list** access approach,
 * which is used to reduce round-trips by loading a parent
 * object and its associated child objects in the same call. 
 *
 * (Because of this, it's important to understand adjacency lists
 * and why you would have modelled your collections in a
 * parent-child relationship to begin with in order to get
 * the desired performance outcomes)
 *
 * You can restrict the child collections to return by specifying
 * the `childCollectionNames` parameter. Leaving it blank retrieves
 * all the child objects.
 *
 * ## Performance
 *
 * Adjacency lists work by storing all the related items in the
 * same partition (key) i.e. with the same object ID as the 
 * root object, and then keying the individual items in the
 * sort key. 
 *
 * We can then use a `Query` call to return the root object
 * and child objects together. This means that the performance 
 * and behaviour depends on however the items are stored in the index. 
 *
 * For this reason it's vital to have
 * some understanding of how it is implemented, as well as
 * be aware of your most important access patterns, in order
 * to get the best performance (especially when you have
 * many child items or multiple child collections).
 *
 * ## How it works
 *
 * This method works by using a DynamoDB `Query` on the root
 * object ID (in the partition key). It restricts the child
 * objects returned by using a `BETWEEN` filter on the sort
 * key, bounded by lexigraphically lowest and highest collection
 * names. 
 *
 * To ensure that only the specified collections are returned,
 * this is then filtered with a filter expression on the desired
 * child collection names. This is done with a `FilterExpression`
 * in the `Query` call.
 *
 * In the ideal scenario, all the 
 * child objects are small enough be returned within DynamoDB's query limit.
 * In this case the `root` value will contain the specified parent object, and 
 * the `children` value will be a key-value index on the child collection name
 * to its associated child objects.
 *
 * However, if the number of items exceeds the DynamoDB query limit (1MB
 * of total items scanned in the index), you will need to use
 * the `nextToken` to retrieve the next set of results. Because of
 * this, the `root` object may not be returned on the first call,
 * so you should check for it on each set of returned results.
 *
 * ## Working through an example
 *
 * Say you have a root object collection called *users*,
 * with two child collections, `addresses` and `credentials`.
 *
 * We have two main access patterns:
 * 1. Retrieve a user with all their addresses
 * 2. Retrieve a user will all their credentials
 *
 * ### Retrieving all the addresses
 *
 * For 1., where you request with child collection `addresses` only, a query like
 * this will be given to DynamoDB:
 *
 * ```
 * KeyConditionExpression: pk = "users|-|<userId>" AND sk BETWEEN "addresses|-|" AND 'users|-|'
 * FilterExpression: type IN ("users", "addresses")
 * ```
 *
 * Because of the way DynamoDB queries work, it will internally
 * scan over all the child objects (including the *credentials* objects).
 * The unwanted `credentials` objects will be filtered out, but
 * they will still count internally to the DynamoDB Query page limit
 * (about 1MB).
 *
 * The addresses objects will be returned first (the default ordering
 * goes in lexigraphic order), unless you specify `scanIndexForward: false`
 * to start at the end (where the *users* object is).
 *
 * If there isn't many unwanted *credentials*, the performance impact
 * will be neglible. 
 *
 * If there any many *credentials* objects however, there could be many
 * blank pages returned until the root object is returned. 
 *
 * ### Addressing the performance
 *
 * Firstly, we should change the scan behaviour to scan the index backwards.
 * This way, we'll get the root object in the first page. But DynamoDB
 * will still be scanning over the credentials objects internally.
 *
 * In cases like these, it may be better to break your request down into two
 * calls:
 *
 * * `findById` to return the root *users* object
 * * `findChildren` to return all the *addresses* object.
 *
 * However, this would negate the point of using a adjacency list
 * in the first place.
 *
 * If we look at our access patterns, we never want to retrieve 
 * the credentials and addresses objects at the same time, so we
 * really want the *users* root object to appear between the two
 * sets of child objects.
 *
 * We could achieve this by changing the collection names so
 * that it is between the other two by adding a prefix to each collection name:
 *
 * ```
 * 0addresses
 * 1users
 * 2credentials
 * ```
 *
 * Then, we can fulfil (1) by requesting *1addresses* and scanning backwards
 * from *users*. Similarly, we can fulfill (2) by requesting *credentials*
 * and scanning in the default index order. In both cases, we won't be
 * scanning over unnecessary objects.
 *
 * @param ctx the dynaglue context object
 * @param rootObjectCollectionName the root object collection
 * @param rootObjectId the root object ID
 * @param childCollectionNames the child collections to return - defaults to all child collections
 * @param nextToken the pagination token, to request the next page of results
 * @param options options to control the limit, scan order and extra filtering
 * @returns the root and/or child objects found, along with a `nextToken` if there is more results
 *
 */
export const findByIdWithChildren = async (
  ctx: Context,
  rootCollectionName: string,
  rootObjectId: string,
  childCollectionNames?: string[],
  nextToken?: Key,
  options: { limit?: number; scanForward?: boolean } = {},
): Promise<FindByIdWithChildrenResult> => {
  const collection = getCollection(ctx, rootCollectionName);
  let childCollections;
  if (childCollectionNames) {
    childCollections = childCollectionNames.map(name => getChildCollection(ctx, name));
    for (const childCollection of childCollections) {
      if (childCollection.parentCollectionName !== rootCollectionName) {
        throw new CollectionNotFoundException(childCollection.name);
      }
    }
  } else {
    childCollections = [...ctx.childDefinitions.values()]
      .filter(collection => collection.parentCollectionName === rootCollectionName);
  }

  const allChildCollectionNames = childCollections.map(collection => collection.name);
  const allCollectionNames = [rootCollectionName, ...allChildCollectionNames].sort();

  const firstCollection = allCollectionNames[0];
  const lastCollection = allCollectionNames[allCollectionNames.length - 1];
  const lastCollectionBound = assemblePrimaryKeyValue(lastCollection, '\uFFFF', collection.layout.indexKeySeparator);

  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();

  const { partitionKey, sortKey } = collection.layout.primaryKey;

  const keyConditionExpression = `${nameMapper.map(partitionKey)} = ${valueMapper.map(assemblePrimaryKeyValue(rootCollectionName, rootObjectId, collection.layout.indexKeySeparator))} ` + 
    `AND ${nameMapper.map(sortKey)} BETWEEN ${valueMapper.map(assemblePrimaryKeyValue(firstCollection, '', collection.layout.indexKeySeparator))} AND ${valueMapper.map(lastCollectionBound)}`;

  const filterExpression = `${nameMapper.map('type')} IN (${allCollectionNames.map(c => valueMapper.map(c)).join(',')})`;
  const request: QueryInput = {
    TableName: collection.layout.tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: nameMapper.get(),
    ExpressionAttributeValues: valueMapper.get(),
    ExclusiveStartKey: nextToken,
    Limit: options?.limit,
    ScanIndexForward: options?.scanForward ?? true, 
    FilterExpression: filterExpression,
  };

  debugDynamo('Query', request);

  const { Items = [], LastEvaluatedKey } = await ctx.ddb.query(request).promise();

  let root: DocumentWithId | undefined;
  const children: { [collection: string]: DocumentWithId[] } = fromPairs(
    allChildCollectionNames.map(name => [name, []]),
  );
  for (const item of Items) {
    const attributes = Converter.unmarshall(item) as WrappedDocument;
    if (attributes.type === rootCollectionName) {
      root = unwrap(attributes);
    } else {
      children[attributes.type] = children[attributes.type] ?? [];
      children[attributes.type].push(unwrap(attributes));
    }
  }
  return {
    root,
    children,
    nextToken: LastEvaluatedKey,
  };
};

