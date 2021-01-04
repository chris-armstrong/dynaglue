import isEqual from 'lodash/isEqual';
import { Key, QueryInput, Converter } from 'aws-sdk/clients/dynamodb';

import { Context } from '../context';
import { DocumentWithId, WrappedDocument } from '../base/common';
import {
  getCollection,
  unwrap,
  assembleIndexedValue,
  IndexedValue,
} from '../base/util';
import { Collection } from '../base/collection';
import {
  InvalidQueryException,
  ConfigurationException,
} from '../base/exceptions';
import {
  KeyPath,
  AccessPattern,
  AccessPatternOptions,
} from '../base/access_pattern';
import { SecondaryIndexLayout } from '../base/layout';
import debugDynamo from '../debug/debugDynamo';
import { CompositeCondition } from '../base/conditions';
import { createNameMapper, createValueMapper } from '../base/mappers';
import { parseCompositeCondition } from '../base/conditions_parser';

/**
 * The query operator to use in the `KeyConditionExpression` to `QueryItem`
 * as called by [[find]]
 */
export type QueryOperator = 'match' | 'equals';

/**
 * A find query. This is a map of key paths (specified dot-separated)
 * to values to match.
 *
 * The query you specify must match an access pattern on the collection,
 * otherwise an [[IndexNotFoundException]] will be thrown by [[find]]
 */
export type FindQuery = { [matchKey: string]: string };

/**
 * The results of a [[find]] operation.
 */
export type FindResults<DocumentType extends DocumentWithId> = {
  /** The items in this batch of results */
  items: DocumentType[];
  /** The pagination token. This value is specified when
   * there are more results to fetch; pass it to another [[find]] call
   * to get the next batch. It will be `undefined` when there is no
   * more results.
   */
  nextToken?: Key;
};

/**
 * @internal
 *
 * Compare key paths and return if they are equal.
 */
export const isEqualKey = (
  lhs: string[] | string,
  rhs: string[] | string
): boolean => {
  const normalisedLhs = typeof lhs === 'string' ? lhs.split('.') : lhs;
  const normalisedRhs = typeof rhs === 'string' ? rhs.split('.') : rhs;
  return isEqual(normalisedLhs, normalisedRhs);
};

/**
 * @internal
 *
 * Find the access pattern for the specified query.
 */
export const findAccessPattern = (
  collection: Collection,
  query: FindQuery
): AccessPattern | undefined => {
  return (collection.accessPatterns || []).find((ap) => {
    const unmatchedQueryKeys = [...Object.keys(query)];
    for (const apKey of ap.partitionKeys) {
      const matchingQueryKeyIndex = unmatchedQueryKeys.findIndex((queryKey) =>
        isEqualKey(apKey, queryKey)
      );
      if (matchingQueryKeyIndex >= 0) {
        unmatchedQueryKeys.splice(matchingQueryKeyIndex, 1);
      } else {
        return false;
      }
    }

    if (ap.sortKeys) {
      for (const apKey of ap.sortKeys) {
        const matchingQueryKeyIndex = unmatchedQueryKeys.findIndex((queryKey) =>
          isEqualKey(apKey, queryKey)
        );
        if (matchingQueryKeyIndex >= 0) {
          unmatchedQueryKeys.splice(matchingQueryKeyIndex, 1);
        } else {
          break;
        }
      }
    }
    return unmatchedQueryKeys.length === 0;
  });
};

/**
 * @internal
 *
 * Find the access pattern layout for the specified access pattern
 */
export const findAccessPatternLayout = (
  findKeys: SecondaryIndexLayout[],
  ap: AccessPattern
): SecondaryIndexLayout | undefined =>
  findKeys.find((fk) => fk.indexName === ap.indexName);

/**
 * @internal
 *
 * Assemble a value into the query, taking into account string normalizer options.
 */
export const assembleQueryValue = (
  type: 'partition' | 'sort',
  collectionName: string,
  query: FindQuery,
  options: AccessPatternOptions,
  paths?: KeyPath[],
  separator?: string
): IndexedValue => {
  if (paths) {
    const values: IndexedValue[] = [];
    for (const path of paths) {
      const pathValue = query[path.join('.')];
      if (!pathValue) break;
      const transformedValue = options.stringNormalizer
        ? options.stringNormalizer(path, pathValue)
        : pathValue;
      values.push(transformedValue);
    }
    return assembleIndexedValue(type, collectionName, values, separator);
  }
  return undefined;
};

// FIXME: distinguish `=` and `begins_with` based on specified sort keys

/**
 * @internal
 */
const getQueryOperator = (
  sortKeyName: string,
  sortValueName: string,
  qo?: QueryOperator
): string => {
  switch (qo) {
    case 'equals':
      return `${sortKeyName} = ${sortValueName}`;
    default:
    case 'match':
      return `begins_with(${sortKeyName}, ${sortValueName})`;
  }
  throw new Error('unreachable');
};

/**
 * The options for a [[find]] operation
 */
export type FindOptions = {
  /**
   * The sort key condition to use
   */
  queryOperator?: QueryOperator;
  /*
   * The item limit to pass to DynamoDB
   */
  limit?: number;
  /**
   * `true` (default) to scan the index forward, `false` to scan it backward
   */
  scanForward?: boolean;
  /**
   * An optional filter expression for the
   * find operation
   */
  filter?: CompositeCondition;
};

/**
 * Find an item using one of its collection's access patterns
 *
 * This method is very strict about how the query object is used. Failure
 * to specify it
 *
 * Each of its keys is one of the keys paths to a field in the collection objects
 * (separated by a full-stop `.`), with the values set to the value to
 * match against. The value is a direct string comparison, so only string
 * values can be looked up (the query object cannot contain nested values
 * or values of types other than string)
 *
 * Every path that is specified must be part of the same access pattern.
 * You cannot have extraneous fields to match or mix keys from different
 * access patterns.
 *
 * All of the key paths in the partition key part of the access pattern
 * must be specified.
 *
 * You do not have to specify all of the sort keys,
 * **but** because they are stored as a composite key, and we can only do
 * `begins_with` match, you must specify the keys in the order they appear,
 * only leaving off those at the end.
 *
 * For example, if your sort key is defined as:
 *
 * `[['state'], ['city'], ['street', 'name'], ['street', 'number']]`
 *
 * you could specify any of the following combinations:
 * - `{ state: '...' }`
 * - `{ state: '...', city: '...' }`
 * - `{ state: '...', city: '...', 'street.name': '...' }`
 * - `{ state: '...', city: '...', 'street.name': '...', 'street.number': '...' }`
 *
 * But these would be invalid:
 * - `{ city: '...' }`
 * - `{ state: '...', 'street.name': '...' }`
 * - `{ city: '...', 'street.name': '...', 'street.number': '...' }`
 *
 *
 * @param ctx the context object
 * @param collectionName the collection name
 * @param query an object, with each of its keys set to the path of
 * each field in the search object to match and their corresponding
 * values to match (see above)s
 * @param nextToken pagination token
 * @param options options controlling the query
 * @param options.queryOperator query operator to use (defaults to `begins_with()`)
 * @param options.limit number of records to return
 * @param options.scanForward scan direction, true for forward across the index (default) or false for backward
 * @param options.filter a filter expression
 * @returns an object containing the items found and a pagination token
 * (if there is more results)
 * @throws [[`CollectionNotFoundException`]] when the collection is not found in the context
 * @throws [[`InvalidQueryException`]] when the access pattern cannot be found for the specfied combination of query key paths
 */
export async function find(
  ctx: Context,
  collectionName: string,
  query: FindQuery,
  nextToken?: Key,
  options: FindOptions = {}
): Promise<FindResults> {
  const collection = getCollection(ctx, collectionName);

  const ap = findAccessPattern(collection, query);
  if (!ap) {
    throw new InvalidQueryException(
      'Unable to find access pattern matching query',
      {
        collection: collectionName,
        query,
      }
    );
  }
  const layout = findAccessPatternLayout(collection.layout?.findKeys ?? [], ap);
  if (!layout) {
    throw new ConfigurationException(
      `Unable to find layout for index specified in access pattern`,
      {
        info: { collectionName, indexName: ap.indexName },
      }
    );
  }

  const partitionKeyValue = assembleQueryValue(
    'partition',
    collection.name,
    query,
    ap.options || {},
    ap.partitionKeys,
    collection.layout.indexKeySeparator
  );
  const sortKeyValue = assembleQueryValue(
    'sort',
    collection.name,
    query,
    ap.options || {},
    ap.sortKeys,
    collection.layout.indexKeySeparator
  );

  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();

  const sortKeyOp =
    sortKeyValue &&
    getQueryOperator(
      nameMapper.map(layout.sortKey!, '#indexSortKey'),
      valueMapper.map(sortKeyValue),
      options?.queryOperator
    );
  const keyConditionExpression = `${nameMapper.map(
    layout.partitionKey,
    '#indexPartitionKey'
  )} = ${valueMapper.map(partitionKeyValue)}${
    sortKeyValue ? ` AND ${sortKeyOp}` : ''
  }`;

  let filterExpression;
  if (options?.filter) {
    filterExpression = parseCompositeCondition(options.filter, {
      nameMapper,
      valueMapper,
      parsePath: [],
    });
  }

  const queryRequest: QueryInput = {
    TableName: collection.layout.tableName,
    IndexName: ap.indexName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: nameMapper.get(),
    ExpressionAttributeValues: valueMapper.get(),
    ExclusiveStartKey: nextToken,
    Limit: options?.limit,
    ScanIndexForward: options?.scanForward ?? true,
    FilterExpression: filterExpression,
  };
  debugDynamo('Query', queryRequest);
  const {
    Items: items,
    LastEvaluatedKey: lastEvaluatedKey,
  } = await ctx.ddb.query(queryRequest).promise();
  const unwrappedItems = items
    ? items.map((item) => unwrap(Converter.unmarshall(item) as WrappedDocument))
    : [];
  return {
    items: unwrappedItems,
    nextToken: lastEvaluatedKey,
  };
}
