import DynamoDB from 'aws-sdk/clients/dynamodb';
import { Collection } from './collection';
import { describeAccessPattern, KeyPath, AccessPatternOptions } from './access_pattern';
import { ConfigurationException } from './exceptions';

/**
 * Extracted keys from access patterns. Used internally
 * to build stored values
 */
export type ExtractKey = {
  type: 'partition' | 'sort';
  key: string;
  valuePaths: KeyPath[];
  options: AccessPatternOptions;
};

/**
 * Collection mapping used internally
 */
export type CollectionDefinition = Collection & {
  wrapperExtractKeys: ExtractKey[];
};

/**
 * A context object. This type should be considered opaque and
 * subject to change
 */
export interface Context {
  ddb: DynamoDB;
  definitions: Map<string, CollectionDefinition>;
}
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

    if (layout.listAllKey) {
      const { listAllKey, primaryKey } = layout;
      if (listAllKey.partitionKey !== primaryKey.sortKey) {
        throw new ConfigurationException(
          'listAll partition key must be same as primary index sort key'
        );
      }

      if (listAllKey.sortKey !== primaryKey.partitionKey) {
        throw new ConfigurationException(
          'listAll sort key must be same as primary index partition key'
        );
      }
    }

    if (layout.findKeys) {
      const alreadyDefinedIndexes: string[] = [];
      layout.findKeys.forEach((findKey, index) => {
        if (alreadyDefinedIndexes.includes(findKey.indexName)) {
          throw new ConfigurationException(
            `find key at index ${index} has duplicate index reference ${findKey.indexName}`
          );
        }
        alreadyDefinedIndexes.push(findKey.indexName);
      });
    }

    const wrapperExtractKeys: ExtractKey[] = [];
    if (collection.accessPatterns) {
      const findKeys = layout.findKeys || [];
      const usedIndexes: string[] = [];
      collection.accessPatterns.forEach(accessPattern => {
        const { indexName } = accessPattern;
        if (usedIndexes.includes(indexName)) {
          throw new ConfigurationException(
            `accessPattern ${describeAccessPattern(
              accessPattern
            )} refers to index in use by another pattern`
          );
        }
        usedIndexes.push(indexName);
        const layout = findKeys.find(key => key.indexName === indexName);
        if (!layout) {
          throw new ConfigurationException(
            `access pattern ${describeAccessPattern(
              accessPattern
            )} refers to index missing from layout`
          );
        }
        wrapperExtractKeys.push({
          type: 'partition',
          key: layout.partitionKey,
          valuePaths: accessPattern.partitionKeys,
          options: accessPattern.options || {},
        });

        if (accessPattern.sortKeys) {
          if (!layout.sortKey) {
            throw new ConfigurationException(`access pattern ${describeAccessPattern(accessPattern)} has sort keys but index ${indexName} does not`);
          }
          wrapperExtractKeys.push({
            type: 'sort',
            key: layout.sortKey,
            valuePaths: accessPattern.sortKeys,
            options: accessPattern.options || {},
          });
        } else if (!accessPattern.sortKeys && layout.sortKey) {
          throw new ConfigurationException(`access pattern ${describeAccessPattern(accessPattern)} does not ` +
            `have sort keys but index ${indexName} has one defined - values in this collection will not show up`);
        }
      });
    }
    definitions.set(collection.name, {
      ...collection,
      wrapperExtractKeys,
    });
  }
  return {
    ddb: dynamodb,
    definitions,
  };
}
