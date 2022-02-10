import { AttributeValue } from "@aws-sdk/client-dynamodb";

/**
 * A document stored in a collection. If an _id field
 * is not provided, one will be generated on insert.
 */
export type DocumentWithId = {
  _id: string;
};

/**
 * A wrapped document, as it is written to DynamoDB.
 * You should not have to manipulate this type directly.
 */
export type WrappedDocument<DocumentType extends DocumentWithId> = {
  type: string;
  value: DocumentType;
};

/**
 * A DynamoDB primary key
 */
export type Key = { [key: string]: AttributeValue };