import DynamoDB from 'aws-sdk/clients/dynamodb';
import { Collection } from '../base/collection';
import { ConfigurationException } from '../base/exceptions';
import { validateFindKeys } from './validators';
import { DynaglueContext } from './context_types';
import { buildAndValidateAccessPatterns } from './extract_keys';
import { ExtractKey, RootCollectionDefinition, ChildCollectionDefinition } from '../base/collection_definition';
import isEqual from 'lodash/isEqual';

/**
  * @internal
  */
type Opaque<K, T> = T & { __TYPE__: K };

/**
  * @internal
  * @ignore
  */
export type Context = Opaque<'DynaglueContext', DynaglueContext>

/**
 * Create a context object, with layouts and access patterns for
 * storing and retrieving data.
 *
 * @param dynamodb dynamodb instance, initialised with correct access key and region
 * @param collections a list of collection definitions to use with this context
 * @returns a context object
*  @throws {ConfigurationException} when there is a configuration issue in the given collections
 */
export function createContext(
  dynamodb: DynamoDB,
  collections: Collection[]
): Context {
  const definitions = new Map();
  const rootDefinitions = new Map<string, RootCollectionDefinition>();
  const childDefinitions = new Map<string, ChildCollectionDefinition>();

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

    if (collection.type === 'child') {
      childDefinitions.set(collection.name, { ...collection, wrapperExtractKeys });
    } else {
      rootDefinitions.set(collection.name, { ...collection, wrapperExtractKeys });
    }
  }

  for (const childDefinition of childDefinitions.values()) {
    const parentDefinition = rootDefinitions.get(childDefinition.parentCollectionName);
    if (!parentDefinition) {
      throw new ConfigurationException(`Child collection ${childDefinition.name} refers to non-existent parent definition ${childDefinition.parentCollectionName}`);
    }
    if (!isEqual(parentDefinition.layout, childDefinition.layout)) {
      throw new ConfigurationException(`Child collection ${childDefinition.name} must have same layout as parent definition ${parentDefinition.name}`);
    }
  }

  return {
    ddb: dynamodb,
    definitions,
    rootDefinitions,
    childDefinitions,
    __TYPE__: 'DynaglueContext',
  };
}
