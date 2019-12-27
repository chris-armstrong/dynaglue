import { KeyPath, AccessPatternOptions } from "./access_pattern";
import { Collection, ChildCollection, RootCollection } from "./collection";

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
export type RootCollectionDefinition = RootCollection & {
  wrapperExtractKeys: ExtractKey[];
};
export type ChildCollectionDefinition = ChildCollection & {
  wrapperExtractKeys: ExtractKey[];
};