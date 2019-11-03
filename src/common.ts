/**
 * A document stored in a collection. If an _id field
 * is not provided, one will be generated on insert.
*/
export type DocumentWithId = {
  [key: string]: any;
  _id: string;
};

/**
 * A wrapped document, as it is written to DynamoDB.
 * You should not have to manipulate this type directly.
 */
export type WrappedDocument = {
  value: DocumentWithId;
};
