import {
  Delete,
  Put,
  ReturnConsumedCapacity,
  ReturnItemCollectionMetrics,
  TransactionCanceledException as DDBTransactionCanceledException,
  TransactWriteItem,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { CompositeCondition } from '../base/conditions';
import {
  IdempotentParameterMismatchException,
  InvalidFindDescriptorException,
  TransactionCanceledException,
  TransactionConflictException,
  TransactionValidationException,
} from '../base/exceptions';
import { Context } from '../context';
import debugDynamo from '../debug/debugDynamo';
import { createDeleteByIdRequest } from './delete_by_id';
import { createReplaceByIdRequest } from './replace';
import objectHash from 'object-hash';
import { createDeleteChildByIdRequest } from './delete_child_by_id';

/**
 * @param collectionName the collection to update
 * @param value the document to insert or replace
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satisfied for the update to proceed
 */
export type TransactionReplaceRequest = {
  collectionName: string;
  value: Record<string, unknown>;
  options?: { condition?: CompositeCondition };
};

/**
 * @param collectionName the collection to update
 * @param id the document to delete
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satisfied for the update to proceed
 */
export type TransactionDeleteRequest = {
  collectionName: string;
  id: string;
  options?: { condition?: CompositeCondition };
};

/**
 * @param collectionName the collection to update
 * @param id the document to delete
 * @param rootObjectId parent object id
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satisfied for the update to proceed
 */
export type TransactionDeleteChildRequest = {
  collectionName: string;
  id: string;
  rootObjectId: string;
  options?: { condition?: CompositeCondition };
};

export type TransactionWriteRequest =
  | TransactionReplaceRequest
  | TransactionDeleteRequest
  | TransactionDeleteChildRequest;

const isTransactionReplaceRequest = (
  transactionWriteRequest: TransactionWriteRequest
): transactionWriteRequest is TransactionReplaceRequest =>
  'value' in transactionWriteRequest && !!transactionWriteRequest.value;

const isTransactionDeleteRequest = (
  transactionWriteRequest: TransactionWriteRequest
): transactionWriteRequest is TransactionDeleteRequest =>
  'id' in transactionWriteRequest &&
  !('rootObjectId' in transactionWriteRequest) &&
  !!transactionWriteRequest.id;

const isTransactionDeleteChildRequest = (
  transactionWriteRequest: TransactionWriteRequest
): transactionWriteRequest is TransactionDeleteChildRequest =>
  'id' in transactionWriteRequest &&
  !!transactionWriteRequest.id &&
  'rootObjectId' in transactionWriteRequest &&
  !!transactionWriteRequest.rootObjectId;

/**
 * This operation writes to DynamoDB in a transaction.
 * A transaction can contain upto 25 operations (Insert, Replace or Delete)
 *
 * @category Mutation
 *
 * @param context
 * @param transactionWriteRequests
 * @throws {TransactionCanceledException}
 * @throws {TransactionConflictException}
 */
export const transactionWrite = async (
  context: Context,
  transactionWriteRequests: TransactionWriteRequest[],
  options: {
    ReturnConsumedCapacity?: ReturnConsumedCapacity | string;
    ReturnItemCollectionMetrics?: ReturnItemCollectionMetrics | string;
    ClientRequestToken?: string;
  } = {}
): Promise<void> => {
  if (!transactionWriteRequests || transactionWriteRequests.length === 0) {
    throw new InvalidFindDescriptorException(
      'At least one request should be provided'
    );
  } else if (transactionWriteRequests.length > 25) {
    throw new InvalidFindDescriptorException(
      'No more than 25 requests can be specified to transactionWrite'
    );
  }

  const transactWriteItem: TransactWriteItem[] = transactionWriteRequests.map(
    (request) => {
      /** Checks and create a REPLACE request for a requested item */
      if (isTransactionReplaceRequest(request)) {
        const { collectionName, value, options } = request;
        const { request: putItemInput } = createReplaceByIdRequest(
          context,
          collectionName,
          value,
          options
        );

        return { Put: putItemInput } as { Put: Put };
      }

      /** Checks and create a DELETE request for a requested item */
      if (isTransactionDeleteRequest(request)) {
        const { collectionName, id, options } = request;

        const deleteItem = createDeleteByIdRequest(
          context,
          collectionName,
          id,
          options
        );

        return { Delete: deleteItem } as { Delete: Delete };
      }

      /** Checks and create a DELETE Child request for a requested item */
      if (isTransactionDeleteChildRequest(request)) {
        const { collectionName, id, rootObjectId, options } = request;

        const deleteItem = createDeleteChildByIdRequest(
          context,
          collectionName,
          id,
          rootObjectId,
          options
        );

        return { Delete: deleteItem } as { Delete: Delete };
      }
    }
  ) as unknown as TransactWriteItem[];

  if (!options.ClientRequestToken) {
    options.ClientRequestToken = objectHash(transactWriteItem, {
      algorithm: 'md5',
      encoding: 'base64',
    });
  }

  try {
    const request = { TransactItems: transactWriteItem, ...options };

    debugDynamo('transactWriteItems', JSON.stringify(request));

    const command = new TransactWriteItemsCommand(request);

    await context.ddb.send(command);
  } catch (error) {
    console.error('Error writing transaction to dynamo db : ', error);

    if ((error as Error).name === 'ValidationException') {
      throw new TransactionValidationException(
        'Multiple operations are included for same item id'
      );
    }
    if ((error as Error).name === 'TransactionCanceledException') {
      throw new TransactionCanceledException(
        'The entire transaction request was canceled',
        (error as DDBTransactionCanceledException).CancellationReasons
      );
    }
    if ((error as Error).name === 'TransactionConflictException') {
      throw new TransactionConflictException(
        'Another transaction or request is in progress for one of the requested item'
      );
    }
    if ((error as Error).name === 'IdempotentParameterMismatchException') {
      throw new IdempotentParameterMismatchException(
        'Another transaction or request with same client token'
      );
    }
    throw error;
  }
};
