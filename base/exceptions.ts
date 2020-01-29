import { VError, Options as VErrorOptions } from 'verror';

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
  * Thrown when an `_id` value is specified that is not
  * valid (_id values must be a string).
  */
export class InvalidIdException extends VError {
  constructor(id: any) {
    super({ info: { id }, name: 'invaild_id.error' }, 'The provided document has an invalid ID');
  }
}

/**
 * Thrown when the child object to be inserted has a missing or invalid
 * parent key value.
 */
export class InvalidParentIdException extends VError {
  constructor(parentId: any, collectionName: string, parentCollectionName: string) {
    super({
      info: {
        parentId,
        collectionName,
        parentCollectionName,
      },
      name: 'invalid_parent_id.error',
    }, `The provided document has a missing parent ID or it is the incorrect type`);
  }
}

/**
  * Thrown when the collection specified cannot be found in the context, or
  * isn't of the expected type (root or child) for the called API.
  */
export class CollectionNotFoundException extends VError {
  constructor(collection: string) {
    super({ info: { collection }, name: 'collection_not_found.error' }, `Collection not found: '${collection}'`);
  }
}

/**
  * Thrown when the index is not found for the provided query.
  */
export class IndexNotFoundException extends VError {
  constructor (index: string) {
    super({ info: { index }, name: 'index_not_found.error' }, `Index not found: ${index}`);
  }
}

/**
  * Thrown during context construction to indicate a configuration
  * issue in the specified collections, access patterns or layouts.
  */
export class ConfigurationException extends VError {
  constructor(message: string, options: VErrorOptions = {}) {
    super({
      ...options,
      name: 'configuration.error',
    }, message);
  }
}

/**
  * Thrown on invalid field values that are provided during
  * persistence (insert/update/replace).
  */
export class PersistenceException extends VError {}

/**
  * Thrown on an invalidly specified query provided to a
  * `find()` operation.
  */
export class InvalidQueryException extends VError {
  constructor(message: string, { collection, query }: { collection: string; query: object }) {
    super({
      info: {
        collection,
        query,
      },
      name: 'invalid_query.error',
    }, message);
  }
}

/**
  * Thrown when the updates provided to an `update()` operation
  * are invalid.
  */
export class InvalidUpdatesException extends VError {
  constructor(message: string) {
    super({
      name: 'invalid_updates.error',
    }, message);
  }
}

/**
  * Thrown when the update values provided in an `update()` operation
  * are an invalid type for an indexed field.
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
