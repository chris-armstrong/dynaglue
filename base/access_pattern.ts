/**
 * A path to a key in a document. Each path element should be
 * a string. For example, a field called 'users' at the top level is
 * simply `['userId']`, while a nested field at 'description.title[0]'
 * is `['description', 'title', '0']`
 */
export type KeyPath = string[];

export const describeKeyPath = (keyPath: KeyPath): string => keyPath.join('.');

/**
 * A function used to normalise a key value before it is packed into
 * an index value.
 */
export type NormaliserFunction = (path: KeyPath, value: string) => string;

export type AccessPatternOptions = {
  stringNormalizer?: NormaliserFunction;
};

export interface AccessPattern {
  indexName: string;
  partitionKeys: KeyPath[];
  sortKeys?: KeyPath[];
  options?: AccessPatternOptions;
};

export const describeAccessPattern = ({ indexName, partitionKeys, sortKeys }: AccessPattern): string =>
  `[access pattern index=${indexName} partition=${partitionKeys.join(',')} ` +
  `${sortKeys ? `sort=${sortKeys.join(',')}` : ''}]`;