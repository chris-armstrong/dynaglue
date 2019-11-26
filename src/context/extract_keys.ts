import { KeyPath, AccessPatternOptions } from '../access_pattern';
import { Collection } from '../collection';
import { describeAccessPattern } from '../access_pattern';
import { ConfigurationException } from '../exceptions';
import { ExtractKey } from '../collection_definition';

export const withTypeCreateExtractKey = (type: 'partition' | 'sort') =>
  (key: string, valuePaths: KeyPath[], options?: AccessPatternOptions): ExtractKey => ({
  type,
  key,
  valuePaths,
  options: options || {},
});

export const createPartitionExtractKey = withTypeCreateExtractKey('partition');
export const createSortExtractKey = withTypeCreateExtractKey('sort');

export function buildAndValidateAccessPatterns(collection: Collection): ExtractKey[] {
  const wrapperExtractKeys: ExtractKey[] = [];
  const findKeys = collection.layout.findKeys || [];
  const usedIndexes: string[] = [];
  for (const accessPattern of (collection.accessPatterns || [])) {
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
    wrapperExtractKeys.push(createPartitionExtractKey(layout.partitionKey, accessPattern.partitionKeys, accessPattern.options));

    if (accessPattern.sortKeys) {
      if (!layout.sortKey) {
        throw new ConfigurationException(`access pattern ${describeAccessPattern(accessPattern)} has sort keys but index ${indexName} does not`);
      }
      wrapperExtractKeys.push(createSortExtractKey(layout.partitionKey, accessPattern.sortKeys, accessPattern.options));
    } else if (!accessPattern.sortKeys && layout.sortKey) {
      throw new ConfigurationException(`access pattern ${describeAccessPattern(accessPattern)} does not ` +
        `have sort keys but index ${indexName} has one defined - values in this collection will not show up`);
    }
  }
  return wrapperExtractKeys;
}
