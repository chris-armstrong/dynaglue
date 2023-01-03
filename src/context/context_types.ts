import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  CollectionDefinition,
  ChildCollectionDefinition,
  RootCollectionDefinition,
} from '../base/collection_definition';

/**
 * The internal representation of the context object.
 *
 * **This type should be considered opaque and subject to change.**
 */
export interface DynaglueContext {
  ddb: DynamoDBClient;
  definitions: Map<string, CollectionDefinition>;
  rootDefinitions: Map<string, RootCollectionDefinition>;
  childDefinitions: Map<string, ChildCollectionDefinition>;
}
