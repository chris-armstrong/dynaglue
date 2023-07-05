import get from 'lodash/get';
import isISOString from 'validator/lib/isISO8601';
import { Context } from '../context';
import {
  CollectionNotFoundException,
  InvalidIdException,
  InvalidIndexedFieldValueException,
  InvalidParentIdException,
} from './exceptions';
import { DocumentWithId, WrappedDocument } from './common';
import newId from './new_id';
import {
  KeyPath,
  describeKeyPath,
  AccessPatternOptions,
} from './access_pattern';
import {
  CollectionDefinition,
  ChildCollectionDefinition,
  RootCollectionDefinition,
} from './collection_definition';

/**
 * @internal
 * The separator value.
 */
export const SEPARATOR = '|-|';

/**
 * @internal
 */
export type IndexedValue = string | undefined;

/**
 * @internal
 *
 * Assemble an _id value into its indexed primary key field
 */
export const assemblePrimaryKeyValue = (
  collectionName: string,
  _id: string,
  separator: string = SEPARATOR
): string => `${collectionName}${separator}${_id}`;

// FIXME: distinguish correctly between:
//  - sparse keys - a value is not always written to the all the key fields (from DynamoDB's persective, not optional sort
//                  key values) which leverages DynamoDB's behaviour to not index the record in that GSI
//  - empty key value - an access pattern mapped to a partition+sort defined GSI but that only has partition key values
//                   needs a "dummy" value in the sort key slot so it gets indexed, and not treated like a sort key

/**
 * @internal
 *
 * Assemble extracted key paths into their indexed value
 */
export const assembleIndexedValue = (
  keyType: 'partition' | 'sort',
  collectionName: string,
  values: (string | undefined)[],
  separator: string = SEPARATOR
): IndexedValue => {
  if (values.length === 0) {
    // empty key value
    return collectionName;
  } else if (values.every((value) => typeof value === 'undefined')) {
    // sparse key? - keep the value blank to avoid showing up in searches
    return keyType === 'partition' ? collectionName : undefined;
  }
  return `${collectionName}${separator}${values
    .map((x) => (typeof x === 'string' ? x : ''))
    .join(separator)}`;
};

/**
 * @internal
 */
export const getRootCollection = (
  context: Context,
  collectionName: string
): RootCollectionDefinition => {
  const c = context.rootDefinitions.get(collectionName);
  if (!c) throw new CollectionNotFoundException(collectionName);
  return c;
};

/**
 * @internal
 */
export const getChildCollection = (
  context: Context,
  collectionName: string
): ChildCollectionDefinition => {
  const c = context.childDefinitions.get(collectionName);
  if (!c) throw new CollectionNotFoundException(collectionName);
  return c;
};

/**
 * @internal
 */
export const getCollection = (
  context: Context,
  collectionName: string
): CollectionDefinition => {
  const c = context.definitions.get(collectionName);
  if (!c) throw new CollectionNotFoundException(collectionName);
  return c;
};

/**
 * @internal
 *
 * Converts a TTL value from a document
 * to a DynamoDB compatible TTL value (UNIX date in seconds stored as a number)
 *
 * If the value does not conform to the type below or if
 * it is a string but not a ISO date string, it will not
 * be transformed.
 */
export const transformTTLValue = (ttlValue: Date | number | string): number | undefined => {
  let transformedValue;
  if (typeof ttlValue === 'object' && ttlValue instanceof Date) {
    transformedValue = Math.ceil(ttlValue.getTime() / 1000);
  } else if (typeof ttlValue === 'number') {
    transformedValue = Math.ceil(ttlValue / 1000);
  } else if (typeof ttlValue === 'string' && isISOString(ttlValue)) {
    transformedValue = Math.ceil(new Date(ttlValue).getTime() / 1000);
  }
  return transformedValue;
};

/**
 * @internal
 *
 * Extract a transformed TTL value from a document
 */
export const extractTransformedTTLValue = <DocumentType extends DocumentWithId>(
  value: DocumentType,
  valuePath: KeyPath
): number | undefined => {
  const ttlValue = get(value, valuePath);
  return transformTTLValue(ttlValue);
};

/**
 * @internal
 *
 * Given a collection, and set of key paths from an access pattern, create a value that can be used
 * to look up an index attribute. This is used to generate the value to store in the indexed attribute.
 */
export const constructKeyValue = <DocumentType extends DocumentWithId>(
  type: 'partition' | 'sort' | 'ttl',
  collectionName: string,
  separator: string,
  valuePaths: KeyPath[],
  options: AccessPatternOptions,
  value: DocumentType
): string | number | undefined => {
  if (type === 'ttl') {
    return extractTransformedTTLValue(value, valuePaths[0]);
  }
  const values = valuePaths.map((valuePath) => {
    const extractedValue = get(value, valuePath);
    if (
      typeof extractedValue !== 'undefined' &&
      typeof extractedValue !== 'string'
    ) {
      throw new InvalidIndexedFieldValueException(
        `Indexed value at path ${describeKeyPath(
          valuePath
        )} was not a string for collection ${collectionName}`,
        { keyPath: valuePath, collection: collectionName }
      );
    }
    const transformedValue =
      options.stringNormalizer && extractedValue
        ? options.stringNormalizer(valuePath, extractedValue)
        : extractedValue;
    return transformedValue;
  });

  return assembleIndexedValue(type, collectionName, values, separator);
};

/**
 * @internal
 *
 * Generate the wrapped value of a document to store in a table for a collection.
 */
export const toWrapped = <DocumentType extends DocumentWithId>(
  collection: CollectionDefinition,
  value: { [key: string]: unknown }
): WrappedDocument<DocumentType> => {
  let updatedValue: DocumentType;
  if (typeof value._id !== 'undefined') {
    if (typeof value._id !== 'string') {
      throw new InvalidIdException(value._id);
    }
    updatedValue = value as DocumentType;
  } else {
    const _id = collection.idGenerator ? collection.idGenerator() : newId();
    updatedValue = { ...value, _id } as DocumentType;
  }

  const extractedKeys = collection.wrapperExtractKeys
    .map(({ type, key, valuePaths, options }) => {
      const keyValue = constructKeyValue(
        type,
        collection.name,
        collection.layout.indexKeySeparator ?? SEPARATOR,
        valuePaths,
        options,
        updatedValue
      );
      if (typeof keyValue !== undefined) {
        return { [key]: keyValue };
      }
    })
    .filter((x) => typeof x !== 'undefined');

  let partitionKeyValue;
  let sortKeyValue;
  if (collection.type === 'child') {
    const parentId = get(value, collection.foreignKeyPath);
    if (typeof parentId !== 'string') {
      throw new InvalidParentIdException(
        parentId,
        collection.name,
        collection.parentCollectionName
      );
    }
    partitionKeyValue = assemblePrimaryKeyValue(
      collection.parentCollectionName,
      parentId,
      collection.layout.indexKeySeparator
    );
    sortKeyValue = assemblePrimaryKeyValue(
      collection.name,
      updatedValue._id,
      collection.layout.indexKeySeparator
    );
  } else {
    partitionKeyValue = sortKeyValue = assemblePrimaryKeyValue(
      collection.name,
      updatedValue._id,
      collection.layout.indexKeySeparator
    );
  }

  const wrapped = Object.assign(
    {
      [collection.layout.primaryKey.partitionKey]: partitionKeyValue,
      [collection.layout.primaryKey.sortKey]: sortKeyValue,
      value: updatedValue,
      type: collection.name,
    },
    ...extractedKeys
  );
  return wrapped;
};

/**
 * @internal
 */
export const unwrap = <DocumentType extends DocumentWithId>(
  document: WrappedDocument<DocumentType>
): DocumentType => {
  return document.value;
};

/**
 * @internal
 */
export const invertMap = (
  map: Map<string, string>
): {
  [key: string]: string;
} => Object.assign({}, ...Array.from(map.entries(), ([k, v]) => ({ [v]: k })));

/**
 * @internal
 */
export const isSubsetOfKeyPath = (
  mainPath: KeyPath,
  subsetPath: KeyPath
): boolean => subsetPath.every((key, index) => mainPath[index] === key);

/**
 * @internal
 */
export const findMatchingPath = (
  keyPaths: KeyPath[],
  path: KeyPath
): KeyPath | undefined => {
  for (const keyPath of keyPaths) {
    if (isSubsetOfKeyPath(path, keyPath)) {
      return keyPath;
    }
  }
};
