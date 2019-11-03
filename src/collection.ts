import { CollectionLayout } from "./layout";
import { AccessPattern } from "./access_pattern";

/**
 * A collection is a division based on data type
 * for storage in a DynamoDB table. The layout
 * specifies how to map values into DynamoDB
 * primary and secondary indexes, while the optional
 * access patterns defines how to access data based
 * on key-values in your objects.
 */
export interface Collection {
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

