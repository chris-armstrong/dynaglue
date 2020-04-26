import { KeyPath, AccessPatternOptions } from "./access_pattern";
import { Collection, ChildCollection, RootCollection } from "./collection";

/**
 *
 * Extracted keys from access patterns. Used internally
 * to build stored values
 */
export type ExtractKey = {
  type: 'partition' | 'sort' | 'ttl';
  key: string;
  valuePaths: KeyPath[];
  options: AccessPatternOptions;
};

/**
 * 
 * Collection mapping (used internally)
 */
export type CollectionDefinition = Collection & {
  wrapperExtractKeys: ExtractKey[];
};

/** 
  * Root collection definition (used internally)
  */
export type RootCollectionDefinition = RootCollection & {
  wrapperExtractKeys: ExtractKey[];
};
/**
  * Child collection definition (used internally)
  */
export type ChildCollectionDefinition = ChildCollection & {
  wrapperExtractKeys: ExtractKey[];
};
