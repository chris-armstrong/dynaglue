/**
 * A path to a key in a document. Each path element should be
 * a string. For example, a field called 'users' at the top level is
 * simply `['userId']`, while a nested field at 'description.title[0]'
 * is `['description', 'title', '0']`
 */
export type KeyPath = string[];

/** @internal */
export const describeKeyPath = (keyPath: KeyPath): string => keyPath.join('.');

/**
 * A function used to normalise a key value before it is packed into
 * an index value.
 *
 * This is useful when you want to index your fields differently to how
 * they're stored e.g. lowercase values before they are put in the
 * index.
 */
export type NormaliserFunction = (path: KeyPath, value: string) => string;

/**
 * Options for an access pattern.
 */
export type AccessPatternOptions = {
  /** A normaliser for values stored in the access pattern's index */
  stringNormalizer?: NormaliserFunction;
};

/**
 * A **access pattern** defines how to copy values from the entities
 * in a collection into an index. They are used to permit indexed
 * queryies with the [[find]] operation.
 *
 * In order to index values, you must first have defined a GSI in
 * your [[CollectionLayout|collection's layout]].
 */
export interface AccessPattern {
  /** The name of the index in your [[CollectionLayout|collection's layout]] */
  indexName: string;
  /** The [[KeyPath|key paths]] to extract and store in the partition key.
   *
   * Key paths specified for a partition key must be present in documents
   * stored in the associated [[Collection]].
   */
  partitionKeys: KeyPath[];
  /** The [[KeyPath|key paths]] to extract and store in the sort key.
   *
   * Leave this value unspecified if your GSI does not have a sort key. If it does
   * but you don't want a sort key, populate it with an empty array
   */
  sortKeys?: KeyPath[];
  /** Options for the index, such as string normalisers */
  options?: AccessPatternOptions;
}

export const describeAccessPattern = ({
  indexName,
  partitionKeys,
  sortKeys,
}: AccessPattern): string =>
  `[access pattern index=${indexName} partition=${partitionKeys.join(',')} ` +
  `${sortKeys ? `sort=${sortKeys.join(',')}` : ''}]`;
