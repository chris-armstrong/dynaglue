import {
  Converter,
  Key,
  QueryInput,
} from 'aws-sdk/clients/dynamodb';
import { Context } from '../context';
import { getCollection, unwrap } from '../util';
import { IndexNotFoundException } from '../exceptions';
import { WrappedDocument } from '../common';

export type ListAllResult = {
  items: any[];
  nextToken?: Key;
}

/**
 * List all the items in a collection. Effectively a scan on the
 * items demarcated by the collection
 *
 * @param context the context
 * @param collectionName the collection name to retrieve elements for
 * @param nextToken pagination token
 */
export async function listAll(
  context: Context,
  collectionName: string,
  nextToken?: Key
): Promise<ListAllResult> {
  const collection = getCollection(context, collectionName);

  if (!collection.layout.listAllKey) {
    throw new IndexNotFoundException('listAll');
  }

  const request: QueryInput = {
    IndexName: collection.layout.listAllKey.indexName,
    KeyConditionExpression: '#partitionKeyName = :partitionKeyValue',
    ExpressionAttributeNames: {
      '#partitionKeyName': collection.layout.listAllKey.partitionKey,
    },
    ExpressionAttributeValues: {
      ':partitionKeyValue': {
        S: collection.name,
      },
    },
    ExclusiveStartKey: nextToken,
    TableName: collection.layout.tableName,
  };

  const result = await context.ddb.query(request).promise();
  return {
    items: result.Items
      ? result.Items.map(value =>
          unwrap(Converter.unmarshall(value) as WrappedDocument)
        )
      : [],
    nextToken: result.LastEvaluatedKey,
  };
}
