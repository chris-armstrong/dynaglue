import { CollectionLayout } from "./layout";
import { AccessPattern, KeyPath } from "./access_pattern";

/**
 * A collection is a division based on data type
 * for storage in a DynamoDB table. The layout
 * specifies how to map values into DynamoDB
 * primary and secondary indexes, while the optional
 * access patterns defines how to access data based
 * on key-values in your objects.
 */

/**
 * Common collection elements
 */
export interface CommonCollection {
  /**
   * The name of the collection. Use this
   * when inserting or retrieving values
   */
  name: string;
  /**
   * The layout, which maps out how
   * to assemble values for storage and
   * retrieval so they are indexed
   * correctly.
   */
  layout: CollectionLayout;
  /**
   * Access patterns define how to retrieve
   * values on keys other than a documents
   * `_id` field
   */
  accessPatterns?: AccessPattern[];
}

/**
 * A root collection (or top-level collection) is
 * one without a parent. It is stored in a such a
 * way to enable the individual retrieval of items
 * or bulk retrieval of of child items by foreign
 * key.
 */
export interface RootCollection extends CommonCollection {
  type?: 'root';
}

export interface ChildCollection extends CommonCollection {
  type: 'child';

  /**
   * The parent collection
   */
  parentCollectionName: string;

  /**
   * The foreign key path
   */
  foreignKeyPath: KeyPath;
}

export type Collection = RootCollection | ChildCollection;
