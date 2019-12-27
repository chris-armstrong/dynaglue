import DynamoDB from 'aws-sdk/clients/dynamodb';
import { CollectionDefinition, ChildCollectionDefinition, RootCollectionDefinition } from '../base/collection_definition';

/**
 * A context object. This type should be considered opaque and
 * subject to change
 */
export interface DynaglueContext {
  ddb: DynamoDB;
  definitions: Map<string, CollectionDefinition>;
  rootDefinitions: Map<string, RootCollectionDefinition>;
  childDefinitions: Map<string, ChildCollectionDefinition>;
};