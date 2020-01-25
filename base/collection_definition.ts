import { KeyPath, AccessPatternOptions } from "./access_pattern";
import { Collection, ChildCollection, RootCollection } from "./collection";

/**
 * @internal
 *
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
 * @internal
 * 
 * Collection mapping used internally
 */
export type CollectionDefinition = Collection & {
  wrapperExtractKeys: ExtractKey[];
};

/** 
  * @internal
  * Root collection definition (used internally)
  */
export type RootCollectionDefinition = RootCollection & {
  wrapperExtractKeys: ExtractKey[];
};
/**
  * @internal
  * Child collection definition (used internally)
  */
export type ChildCollectionDefinition = ChildCollection & {
  wrapperExtractKeys: ExtractKey[];
};
