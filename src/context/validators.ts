import { SecondaryIndexLayout } from '../layout';
import { ConfigurationException } from '../exceptions';

export function validateFindKeys(findKeys: SecondaryIndexLayout[]): void {
  const alreadyDefinedIndexes: string[] = [];
  findKeys.forEach((findKey, index) => {
    if (alreadyDefinedIndexes.includes(findKey.indexName)) {
      throw new ConfigurationException(`find key at index ${index} has duplicate index reference ${findKey.indexName}`);
    }
    alreadyDefinedIndexes.push(findKey.indexName);
  });
}
