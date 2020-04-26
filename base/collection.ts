import { CollectionLayout } from "./layout";
import { AccessPattern, KeyPath } from "./access_pattern";

export interface CommonCollection {
  /**
   * The name of the collection. Use this
   * when creating, updating or retrieving values.
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
   * values on keys other than a document's
   * `_id` field
   */
  accessPatterns?: AccessPattern[];
  /**
   * The optional key path of an attribute
   * that will be copied to the TTL attribute
   * on collection documents.
   *
   * The value must be either:
   * * a Date object
   * * a string in ISO8601 format
   * * a number, in milliseconds since the Epoch
   *
   * (any other value will be ignored)
   *
   * The layout must also define `ttlAttribute` when you
   * specify `ttlKeyPath`, otherwise
   * an exception will be thrown when you create
   * the context.
   */
  ttlKeyPath?: KeyPath;
}

/**
 * A root collection (or top-level collection) is
 * one without a parent. It is stored in a such a
 * way to enable the individual retrieval of items
 * or bulk retrieval of of child items by foreign
 * key.
 */
export interface RootCollection extends CommonCollection {
  /**
    * A fixed value that distinguishes this as a
    * parent or 'root' collection (It is optional to
    * specify this)
    */
  type?: 'root';
}

/**
  * A child collection lets you store values related
  * to a parent collection (defined by [[RootCollection]])
  * 
  * It's used to add data to an entity that is not always
  * needed for every access pattern, and can only be referenced
  * with regards to its parent.
  */
export interface ChildCollection extends CommonCollection {
  /** A fixed value that must be defined to distinguish
    * this collection as a child collection
    */
  type: 'child';

  /**
   * The name of the parent collection. It must be added
   * to the same context as this child collection.
   */
  parentCollectionName: string;

  /**
   * The foreign key path
   */
  foreignKeyPath: KeyPath;
}

/**
 * A collection is a division based on entity type
 * for storage in a DynamoDB table. It tells dynaglue
 * how to store your documents and how to index them
 * for this entity type.
 *
 * Defining multiple
 * collections on the same DynamoDB table layout
 * allows you to store multiple data types in the
 * same DynamoDB table (i.e. a single table design).
 *
 * *Use the [[RootCollection]] or [[ChildCollection]] for specifying
 * a collection*
 */
export type Collection = RootCollection | ChildCollection;
