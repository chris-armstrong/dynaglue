import {
  TransactionCanceledException as DDBTransactionCanceledException,
  ReturnConsumedCapacity,
  ReturnItemCollectionMetrics,
  TransactWriteItem,
  TransactWriteItemsCommand,
  TransactWriteItemsCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { isEmpty } from 'lodash';
import createDebug from 'debug';
import { CompositeCondition } from '../base/conditions';
import {
  IdempotentParameterMismatchException,
  InvalidArgumentException,
  InvalidFindDescriptorException,
  TransactionCanceledException,
  TransactionConflictException,
  TransactionInProgressException,
  TransactionValidationException,
} from '../base/exceptions';
import { Context } from '../context';
import debugDynamo from '../debug/debugDynamo';
import { createDeleteByIdRequest } from './delete_by_id';
import { createReplaceByIdRequest } from './replace';
import { coerceError } from '../base/coerce_error';
import { createDeleteChildByIdRequest } from './delete_child_by_id';

const debug = createDebug('dynaglue:transact:write');

/**
 * A replace request, it helps dynaglue to identify action as Put,
 * required to add to the list of actions in a transaction
 *
 * @param collectionName the collection to update
 * @param value the document to insert or replace
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satisfied for the update to proceed
 */
export type TransactionReplaceRequest = {
  type: 'replace';
  collectionName: string;
  value: Record<string, unknown>;
  options?: { condition?: CompositeCondition };
};

/**
 * A delete request, it helps dynaglue to identify action as Delete,
 * required to add to the list of actions in a transaction
 *
 * @param collectionName the collection to update
 * @param id the document to delete
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satisfied for the update to proceed
 */
export type TransactionDeleteRequest = {
  type: 'delete';
  collectionName: string;
  id: string;
  options?: { condition?: CompositeCondition };
};

/**
 * A delete request for child, it helps dynaglue to identify action as Delete but for a child collection,
 * required to add to the list of actions in a transaction
 *
 * @param collectionName the collection to update
 * @param id the document to delete
 * @param rootObjectId parent object id
 * @param options options to apply
 * @param options.condition an optional conditional expression that must be satisfied for the update to proceed
 */
export type TransactionDeleteChildRequest = {
  type: 'delete-child';
  collectionName: string;
  id: string;
  rootObjectId: string;
  options?: { condition?: CompositeCondition };
};

/**
 * TransactionWrite can be combination of Replace (Insert or Replace), Delete or Delete a child operation
 */
export type TransactionWriteRequest =
  | TransactionReplaceRequest
  | TransactionDeleteRequest
  | TransactionDeleteChildRequest;

/**
 * check to confirmation request is for Replace operation
 * @param transactionWriteRequest
 * @returns
 */
const isTransactionReplaceRequest = (
  transactionWriteRequest: TransactionWriteRequest
): transactionWriteRequest is TransactionReplaceRequest =>
  transactionWriteRequest.type === 'replace';

/**
 * check to confirmation request is for Delete operation
 * @param transactionWriteRequest
 * @returns
 */
const isTransactionDeleteRequest = (
  transactionWriteRequest: TransactionWriteRequest
): transactionWriteRequest is TransactionDeleteRequest =>
  transactionWriteRequest.type === 'delete';

/**
 * check to confirmation request is for child Delete operation
 * @param transactionWriteRequest
 * @returns
 */
const isTransactionDeleteChildRequest = (
  transactionWriteRequest: TransactionWriteRequest
): transactionWriteRequest is TransactionDeleteChildRequest =>
  transactionWriteRequest.type === 'delete-child';

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
    ReturnConsumedCapacity?: ReturnConsumedCapacity;
    ReturnItemCollectionMetrics?: ReturnItemCollectionMetrics;
    ClientRequestToken?: string;
  } = {}
): Promise<TransactWriteItemsCommandOutput> => {
  if (isEmpty(transactionWriteRequests)) {
    throw new InvalidArgumentException(
      'At least one request should be provided'
    );
  } else if (transactionWriteRequests.length > 100) {
    throw new InvalidFindDescriptorException(
      'No more than 100 requests can be specified to transactionWrite'
    );
  }

  const transactWriteItem: TransactWriteItem[] =
    transactionWriteRequests.reduce(
      (result: TransactWriteItem[], request: TransactionWriteRequest) => {
        /** Checks and create a REPLACE request for a requested item */
        if (isTransactionReplaceRequest(request)) {
          const { collectionName, value, options } = request;
          const { request: putItemInput } = createReplaceByIdRequest(
            context,
            collectionName,
            value,
            options
          );

          result.push({ Put: putItemInput });
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

          result.push({ Delete: deleteItem });
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

          result.push({ Delete: deleteItem });
        }

        return result;
      },
      []
    );

  try {
    const request = { TransactItems: transactWriteItem, ...options };

    debugDynamo('TransactWriteItems', JSON.stringify(request));

    const command = new TransactWriteItemsCommand(request);

    return await context.ddb.send(command);
  } catch (error) {
    const errObject = coerceError(error);
    debug('transact_write: error', error);

    if (errObject.name === 'ValidationException') {
      throw new TransactionValidationException(
        'Multiple operations are included for same item id'
      );
    }
    if (
      (errObject).name ===
      'TransactionCanceledException'
    ) {
      throw new TransactionCanceledException(
        'The entire transaction request was canceled',
        {
          cancellationReasons: (error as DDBTransactionCanceledException)
            .CancellationReasons,
        }
      );
    }

    if (
      (errObject).name ===
      'TransactionConflictException'
    ) {
      throw new TransactionConflictException(
        'Another transaction or request is in progress for one of the requested item'
      );
    }
    if (
      (errObject).name ===
      'IdempotentParameterMismatchException'
    ) {
      throw new IdempotentParameterMismatchException(
        'Another transaction or request with same client token',
        { clientRequestToken: options.ClientRequestToken }
      );
    }
    if (
      (errObject).name ===
      'TransactionInProgressException'
    ) {
      throw new TransactionInProgressException(
        'Transaction is in progress with same client token',
        { clientRequestToken: options.ClientRequestToken }
      );
    }
    throw error;
  }
};
