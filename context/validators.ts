import { SecondaryIndexLayout } from '../base/layout';
import { ConfigurationException } from '../base/exceptions';

/**
  * @internal
  *
  * Validate that the find keys specified for an index layout are valid.
  */
export function validateFindKeys(findKeys: SecondaryIndexLayout[]): void {
  const alreadyDefinedIndexes: string[] = [];
  findKeys.forEach((findKey, index) => {
    if (alreadyDefinedIndexes.includes(findKey.indexName)) {
      throw new ConfigurationException(`find key at index ${index} has duplicate index reference ${findKey.indexName}`);
    }
    alreadyDefinedIndexes.push(findKey.indexName);
  });
}
