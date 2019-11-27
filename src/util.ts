import get from 'lodash/get';
import { Context } from './context';
import { CollectionNotFoundException, InvalidIdException, PersistenceException } from './exceptions';
import { DocumentWithId, WrappedDocument } from './common';
import newId from './new_id';
import { KeyPath, describeKeyPath, AccessPatternOptions } from './access_pattern';
import { CollectionDefinition } from './collection_definition';

export const SEPARATOR = '|-|';

export type IndexValue = string | undefined;

// FIXME: distinguish correctly between:
//  - sparse keys - a value is not always written to the all the key fields (from DynamoDB's persective, not optional sort
//                  key values) which leverages DynamoDB's behaviour to not index the record in that GSI
//  - empty key value - an access pattern mapped to a partition+sort defined GSI but that only has partition key values
//                   needs a "dummy" value in the sort key slot so it gets indexed, and not treated like a sort key

export const assembleIndexedValue = (type: 'partition' | 'sort', collectionName: string, values: (string | undefined)[]): IndexValue => {
  if (values.length === 0) {
    // empty key value
    return collectionName;
  } else if (values.every(value => typeof value === 'undefined')) {
    // sparse key? - keep the value blank to avoid showing up in searches
    return undefined;
  }
  return `${collectionName}${SEPARATOR}${values.map(x => typeof x === 'string' ? x : '').join(SEPARATOR)}`;
};

export const getCollection = (context: Context, collectionName: string): CollectionDefinition => {
  const c = context.definitions.get(collectionName);
  if (!c) throw new CollectionNotFoundException(collectionName);
  return c;
};

export const constructKeyValue = (
  type: 'partition' | 'sort',
  collection: CollectionDefinition,
  valuePaths: KeyPath[],
  options: AccessPatternOptions,
  value: DocumentWithId
): string|undefined => {
  const values = valuePaths.map(valuePath => {
    const extractedValue = get(value, valuePath);
    if (typeof extractedValue !== 'undefined' && typeof extractedValue !== 'string') {
      throw new PersistenceException(
        `Indexed value at path ${describeKeyPath(valuePath)} was not a string for collection ${collection.name}`
      );
    }
    const transformedValue = options.stringNormalizer && extractedValue ?
      options.stringNormalizer(valuePath, extractedValue) : extractedValue;
    return transformedValue;
  });

  return assembleIndexedValue(type, collection.name, values);
};

export const toWrapped = (
  collection: CollectionDefinition,
  value: { [key: string]: any }
): WrappedDocument => {
  let updatedValue: DocumentWithId;
  if (value._id) {
    if (typeof value._id !== 'string') {
      throw new InvalidIdException(value._id);
    }
    updatedValue = value as DocumentWithId;
  } else {
    updatedValue = { ...value, _id: newId() };
  }

  const extractedKeys = collection.wrapperExtractKeys
    .map(({ type, key, valuePaths, options }) => {
      const keyValue = constructKeyValue(type, collection, valuePaths, options, updatedValue);
      if (typeof keyValue !== undefined) {
        return { [key]: keyValue };
      }
    })
    .filter(x => typeof x !== 'undefined');

  const wrapped = Object.assign({
    [collection.layout.primaryKey.partitionKey]: updatedValue._id,
    [collection.layout.primaryKey.sortKey]: collection.name,
    value: updatedValue,
  }, ...extractedKeys);
  return wrapped;
};

export const unwrap = (document: WrappedDocument): any => {
  return document.value;
};
