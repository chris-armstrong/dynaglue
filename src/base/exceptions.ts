import { VError, Options as VErrorOptions } from 'verror';
import { ParseElement } from './conditions_types';

/**
 * Thrown when insert() is called with a specified _id
 * that already exists
 */
export class ConflictException extends VError {
  constructor(message: string, id: string) {
    super({ info: { id }, name: 'conflict.error' }, message);
  }
}

/**
 * Thrown when a replace or delete request(s) are rejected as part of transaction
 * that already exists
 */
export class TransactionConflictException extends VError {
  constructor(message: string) {
    super({ name: 'transaction_conflict.error' }, message);
  }
}

/**
 * Thrown when an `_id` value is specified that is not
 * valid (_id values must be a string).
 */
export class InvalidIdException extends VError {
  constructor(id: unknown) {
    super(
      { info: { id }, name: 'invalid_id.error' },
      'The provided document has an invalid ID'
    );
  }
}

/**
 * Thrown when the child object to be inserted has a missing or invalid
 * parent key value.
 */
export class InvalidParentIdException extends VError {
  constructor(
    parentId: unknown,
    collectionName: string,
    parentCollectionName: string
  ) {
    super(
      {
        info: {
          parentId,
          collectionName,
          parentCollectionName,
        },
        name: 'invalid_parent_id.error',
      },
      `The provided document has a missing parent ID or it is the incorrect type`
    );
  }
}

/**
 * Thrown when the collection specified cannot be found in the context, or
 * isn't of the expected type (root or child) for the called API.
 */
export class CollectionNotFoundException extends VError {
  constructor(collection: string) {
    super(
      { info: { collection }, name: 'collection_not_found.error' },
      `Collection not found: '${collection}'`
    );
  }
}

/**
 * Thrown when the index is not found for the provided query.
 */
export class IndexNotFoundException extends VError {
  constructor(index: string) {
    super(
      { info: { index }, name: 'index_not_found.error' },
      `Index not found: ${index}`
    );
  }
}

/**
 * Thrown during context construction to indicate a configuration
 * issue in the specified collections, access patterns or layouts.
 */
export class ConfigurationException extends VError {
  constructor(message: string, options: VErrorOptions = {}) {
    super(
      {
        ...options,
        name: 'configuration.error',
      },
      message
    );
  }
}

/**
 * Thrown on invalid field values that are provided during
 * persistence (insert/update/replace).
 */
export class InvalidIndexedFieldValueException extends VError {
  constructor(
    message: string,
    { collection, keyPath }: { collection: string; keyPath: string[] }
  ) {
    super(
      {
        info: {
          collection,
          keyPath,
        },
        name: 'invalid_indexed_field_value.error',
      },
      message
    );
  }
}

/**
 * Thrown on an invalidly specified query provided to a
 * `find()` operation.
 */
export class InvalidQueryException extends VError {
  constructor(
    message: string,
    {
      collection,
      query,
    }: { collection: string; query: Record<string, unknown> }
  ) {
    super(
      {
        info: {
          collection,
          query,
        },
        name: 'invalid_query.error',
      },
      message
    );
  }
}

/**
 * Thrown when the updates provided to an `update()` operation
 * are invalid.
 */
export class InvalidUpdatesException extends VError {
  constructor(message: string) {
    super(
      {
        name: 'invalid_updates.error',
      },
      message
    );
  }
}

/**
 * Thrown when the update values provided in an `update()` operation
 * are invalid (e.g. `undefined`)
 */
export class InvalidUpdateValueException extends VError {
  constructor(path: string, message: string) {
    super(
      {
        name: 'invalid_update_value',
        info: {
          path,
        },
      },
      message
    );
  }
}

/**
 * Throw when the find descriptor for a transactFindByIds or
 * batchFindByIds is invalid.
 */
export class InvalidFindDescriptorException extends VError {
  constructor(message: string) {
    super(
      {
        name: 'invalid_find_descriptor',
      },
      message
    );
  }
}

/**
 * Thrown when something from DynamoDB doesn't match
 * the context configuration during response processing
 */
export class InternalProcessingException extends VError {
  constructor(message: string) {
    super({ name: 'internal_processing' }, message);
  }
}

/**
 * @internal
 *
 * Print out a condition parser path for debugging / error handling
 * */
const printParsePath = (parsePath: ParseElement[]): string => {
  return parsePath
    .map((e) => {
      if (e.type === 'array') return e.index === 0 ? `[` : `[...@${e.index}:`;
      return `{ ${e.key}: `;
    })
    .join('');
};

/**
 * Thrown when there is a problem with the expression given
 * as a `FilterExpression` or `ConditionExpression`.
 */
export class InvalidCompositeConditionException extends VError {
  constructor(message: string, parsePath: ParseElement[]) {
    super(
      {
        name: 'invalid_composite_condition',
        info: { parsePath },
      },
      `Condition parse exception: ${message} at ${printParsePath(parsePath)}`
    );
  }
}

/**
 * An exception thrown when a bad set of
 * [[BatchReplaceDeleteDescriptor]] is given to
 * [[batchReplaceDelete]]
 */
export class InvalidBatchReplaceDeleteDescriptorException extends VError {
  constructor(message: string, info?: Record<string, unknown>) {
    super({ name: 'invalid_batch_replace_descriptor', info }, message);
  }
}

/**
 * When a TransactGetItems request conflicts with an
 * ongoing TransactWriteItems operation on one or
 * more items in the TransactGetItems request
 */
export class TransactionCanceledException extends VError {
  constructor(message: string, info?: Record<string, unknown>) {
    super({ name: 'transaction_cancelled', info }, message);
  }
}

export class InvalidRangeOperatorException extends VError {
  constructor(message: string, operator: string) {
    super({ name: 'invalid_range_operator', info: { operator } }, message);
  }
}

export class IndexAccessPatternTypeException extends VError {
  constructor(message: string) {
    super({ name: 'index_access_pattern_type' }, message);
  }
}

/**
 * DynamoDB rejected the request because you retried a request with
 * a different payload but with an idempotent token that was already used.
 */
export class IdempotentParameterMismatchException extends VError {
  constructor(message: string) {
    super({ name: 'idempotent_parameter_mismatch' }, message);
  }
}

/**
 * Transaction request cannot include multiple operations on one item
 */

export class TransactionValidationException extends VError {
  constructor(message: string) {
    super({ name: 'transaction_validation' }, message);
  }
}
/**
 * The transaction with the given request token is already in progress
 */
export class TransactionInProgressException extends VError {
  constructor(message: string) {
    super({ name: 'transaction_in_progress' }, message);
  }
}
