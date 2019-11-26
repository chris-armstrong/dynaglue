import { SecondaryIndexLayout, PrimaryIndexLayout } from '../layout';
import { ConfigurationException } from '../exceptions';

export function validateListAllKey(listAllKey: SecondaryIndexLayout, primaryKey: PrimaryIndexLayout) {
  if (listAllKey.partitionKey !== primaryKey.sortKey) {
    throw new ConfigurationException('listAll partition key must be same as primary index sort key');
  }

  if (listAllKey.sortKey !== primaryKey.partitionKey) {
    throw new ConfigurationException('listAll sort key must be same as primary index partition key');
  }
}

export function validateFindKeys(findKeys: SecondaryIndexLayout[]) {
  const alreadyDefinedIndexes: string[] = [];
  findKeys.forEach((findKey, index) => {
    if (alreadyDefinedIndexes.includes(findKey.indexName)) {
      throw new ConfigurationException(`find key at index ${index} has duplicate index reference ${findKey.indexName}`);
    }
    alreadyDefinedIndexes.push(findKey.indexName);
  });
}
