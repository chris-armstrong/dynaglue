import {
  getChildCollection,
  assemblePrimaryKeyValue,
  unwrap,
} from '../base/util';
import { QueryInput, Key, Converter } from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { DocumentWithId, WrappedDocument } from '../base/common';
import debugDynamo from '../debug/debugDynamo';
import { CompositeCondition } from '../base/conditions';
import { createNameMapper, createValueMapper } from '../base/mappers';
import { InvalidRangeOperatorException } from '../base/exceptions';
import { decrementLast, incrementLast } from '../base/lexo';

/**
 * The results of a [[findChildren]] operation.
 */
export type FindChildrenResults<DocumentType extends DocumentWithId> = {
  /** the items that were returned in this batch */
  items: DocumentType[];
  /** The pagination token. If this value is specified, it means
   * there is more results for the query. Provide it to another
   * call to `findChildren` to get the next set of results.
   */
  nextToken?: Key;
};

export type KeyRangeExpression =
  | {
      op: 'gte' | 'gt' | 'lte' | 'lt' | 'begins_with';
      value: string;
    }
  | {
      op: 'between';
      min: string;
      max: string;
    };

/**
 * The options to a [[findChildren]] operation
 */
export type FindChildrenOptions = {
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

  /**
   * The range of children to retrieve (on the child's ID value)
   */
  range?: KeyRangeExpression;
};

/**
 * Find all the child objects of a root (top-level) object.
 *
 * The parent collection is determined by the reference in the
 * child collection.
 *
 * This method has a `nextToken`, which is used for pagination - it
 * is returned when there is more values to retrieve. You should
 * write your code to repeatedly call findChildren with the nextToken
 * value of the previous call until it comes back undefined in order
 * to retrieve all the values.
 *
 * @param ctx the context
 * @param childCollectionName name of the child object collection
 * @param rootObjectId the `_id` of the root object
 * @param nextToken the next token from the previous call, or `undefined` if there are no more values
 * @param options the options to control the query
 * @param options.limit number of records to return
 * @param options.scanForward=true true for ascending index order
 * @param options.filter an optional filter expression to apply
 * @throws {CollectionNotFoundException} when the collection is not found in the context
 */
export async function findChildren<DocumentType extends DocumentWithId>(
  ctx: Context,
  childCollectionName: string,
  rootObjectId: string,
  nextToken?: Key,
  options: FindChildrenOptions = {}
): Promise<FindChildrenResults<DocumentType>> {
  const childCollection = getChildCollection(ctx, childCollectionName);
  const nameMapper = createNameMapper();
  const valueMapper = createValueMapper();

  const {
    parentCollectionName,
    layout: {
      primaryKey: { partitionKey, sortKey },
    },
  } = childCollection;

  const parentId = assemblePrimaryKeyValue(
    parentCollectionName,
    rootObjectId,
    childCollection.layout.indexKeySeparator
  );

  const partitionKeyExpression = `${nameMapper.map(
    partitionKey
  )} = ${valueMapper.map(parentId)}`;
  let sortKeyExpression: string;
  if (options.range) {
    // for <, <=, >, >=, we can't use the builtin DynamoDB operators because they
    // will include items from other collections naturally. Instead, we construct
    // a barrier for highest and lowest and use the `BETWEEN` operator (similar
    // to findByIdWithChildren)
    switch (options.range.op) {
      case 'gt': {
        const childCollectionMin = assemblePrimaryKeyValue(
          childCollectionName,
          incrementLast(options.range.value),
          childCollection.layout.indexKeySeparator
        );
        const childCollectionMax = assemblePrimaryKeyValue(
          childCollectionName,
          '\uFFFF',
          childCollection.layout.indexKeySeparator
        );
        sortKeyExpression = `${nameMapper.map(
          sortKey
        )} BETWEEN ${valueMapper.map(childCollectionMin)} AND ${valueMapper.map(
          childCollectionMax
        )}`;
        break;
      }
      case 'lt': {
        const childCollectionMax = assemblePrimaryKeyValue(
          childCollectionName,
          decrementLast(options.range.value),
          childCollection.layout.indexKeySeparator
        );
        const childCollectionMin = assemblePrimaryKeyValue(
          childCollectionName,
          '',
          childCollection.layout.indexKeySeparator
        );
        sortKeyExpression = `${nameMapper.map(
          sortKey
        )} BETWEEN ${valueMapper.map(childCollectionMin)} AND ${valueMapper.map(
          childCollectionMax
        )}`;
        break;
      }
      case 'lte': {
        const childCollectionMax = assemblePrimaryKeyValue(
          childCollectionName,
          options.range.value,
          childCollection.layout.indexKeySeparator
        );
        const childCollectionMin = assemblePrimaryKeyValue(
          childCollectionName,
          '',
          childCollection.layout.indexKeySeparator
        );
        sortKeyExpression = `${nameMapper.map(
          sortKey
        )} BETWEEN ${valueMapper.map(childCollectionMin)} AND ${valueMapper.map(
          childCollectionMax
        )}`;
        break;
      }
      case 'gte': {
        const childCollectionMin = assemblePrimaryKeyValue(
          childCollectionName,
          options.range.value,
          childCollection.layout.indexKeySeparator
        );
        const childCollectionMax = assemblePrimaryKeyValue(
          childCollectionName,
          '\uFFFF',
          childCollection.layout.indexKeySeparator
        );
        sortKeyExpression = `${nameMapper.map(
          sortKey
        )} BETWEEN ${valueMapper.map(childCollectionMin)} AND ${valueMapper.map(
          childCollectionMax
        )}`;
        break;
      }
      case 'begins_with': {
        const childCollectionValue = assemblePrimaryKeyValue(
          childCollectionName,
          options.range.value,
          childCollection.layout.indexKeySeparator
        );
        sortKeyExpression = `begins_with(${nameMapper.map(
          sortKey
        )}, ${valueMapper.map(childCollectionValue)})`;
        break;
      }
      case 'between': {
        const childCollectionMin = assemblePrimaryKeyValue(
          childCollectionName,
          options.range.min,
          childCollection.layout.indexKeySeparator
        );
        const childCollectionMax = assemblePrimaryKeyValue(
          childCollectionName,
          options.range.max,
          childCollection.layout.indexKeySeparator
        );
        sortKeyExpression = `${nameMapper.map(
          sortKey
        )} BETWEEN ${valueMapper.map(childCollectionMin)} AND ${valueMapper.map(
          childCollectionMax
        )}`;
        break;
      }
      default:
        throw new InvalidRangeOperatorException(
          'Unknown range operator',
          (options.range as KeyRangeExpression).op
        );
    }
  } else {
    const childCollectionPrefix = assemblePrimaryKeyValue(
      childCollectionName,
      '',
      childCollection.layout.indexKeySeparator
    );
    sortKeyExpression = `begins_with(${nameMapper.map(
      sortKey
    )}, ${valueMapper.map(childCollectionPrefix)})`;
  }
  const keyConditionExpression = `${partitionKeyExpression} AND ${sortKeyExpression}`;
  const request: QueryInput = {
    TableName: childCollection.layout.tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: nameMapper.get(),
    ExpressionAttributeValues: valueMapper.get(),
    ExclusiveStartKey: nextToken,
    Limit: options?.limit,
    ScanIndexForward: options?.scanForward ?? true,
  };

  debugDynamo('Query', request);
  const results = await ctx.ddb.query(request).promise();
  return {
    items: (results.Items || []).map((item) =>
      unwrap(
        Converter.unmarshall(item, {
          convertEmptyValues: false,
        }) as WrappedDocument<DocumentType>
      )
    ),
    nextToken: results.LastEvaluatedKey,
  };
}
