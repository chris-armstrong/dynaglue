import DynamoDB from 'aws-sdk/clients/dynamodb';
import { Collection } from '../collection';
import { ConfigurationException } from '../exceptions';
import { validateFindKeys } from './validators';
import { DynaglueContext } from './context_types';
import { buildAndValidateAccessPatterns } from './extract_keys';
import { ExtractKey } from '../collection_definition';

type Opaque<K, T> = T & { __TYPE__: K };
export type Context = Opaque<'DynaglueContext', DynaglueContext>

/**
 * Create a context object, with layouts and access patterns for
 * storing and retrieving data.
 *
 * @param dynamodb dynamodb instance, initialised with correct access key and region
 * @param collections a list of collection definitions to use with this context
 * @returns a context object
 */
export function createContext(
  dynamodb: DynamoDB,
  collections: Collection[]
): Context {
  const definitions = new Map();

  for (const collection of collections) {
    const { name, layout } = collection;
    if (definitions.has(name)) {
      throw new ConfigurationException(
        `Duplicate collection definition: '${name}'`
      );
    }

    if (layout.findKeys) {
      validateFindKeys(layout.findKeys);
    }

    let wrapperExtractKeys: ExtractKey[] = [];
    if (collection.accessPatterns) {
      wrapperExtractKeys = buildAndValidateAccessPatterns(collection);
    }
    definitions.set(collection.name, {
      ...collection,
      wrapperExtractKeys,
    });
  }
  return {
    ddb: dynamodb,
    definitions,
    __TYPE__: 'DynaglueContext',
  };
}
