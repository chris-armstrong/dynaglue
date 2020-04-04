import { DocumentClient } from 'aws-sdk/clients/dynamodb';

export type DynamoDBSet = DocumentClient.DynamoDbSet;

export type ConditionValue = string | number | null | boolean | DynamoDBSet; 

export type DynamoDBType = 'S' | 'SS' | 'N' | 'NS' | 'B' | 'BS' | 'BOOL' | 'NULL' | 'L' | 'M';

export type ConditionClause = AndCondition | OrCondition | KeyPathsAndClause;

export type AndCondition = {
  $and: ConditionClause[];
};

export type OrCondition = {
  $or: ConditionClause[];
};

export type EqCondition = {
  $eq: ConditionValue;
};

export type NotEqCondition = {
  $neq: ConditionValue;
};

export type GtCondition = {
  $gt: ConditionValue;
};

export type GtEqCondition = {
  $gte: ConditionValue;
};

export type LtCondition = {
  $lt: ConditionValue;
};

export type LtEqCondition = {
  $lte: ConditionValue;
};

export type BetweenCondition = {
  $between: {
    $gte: ConditionValue;
    $lte: ConditionValue;
  };
};

export type InCondition = {
  $in: ConditionValue[];
};

export type ExistsCondition = {
  $exists: boolean;
};

export type TypeCondition = {
  $type: DynamoDBType;
};

export type BeginsWithCondition = {
  $beginsWith: string;
};

export type ContainsCondition = {
  $contains: string | DynamoDBSet;
};

export type ComparisonCondition = 
  EqCondition |
  NotEqCondition |
  GtCondition |
  LtCondition |
  GtEqCondition |
  LtEqCondition |
  BetweenCondition |
  InCondition |
  ExistsCondition |
  TypeCondition |
  BeginsWithCondition |
  ContainsCondition;

export type KeyPathsAndClause = {
  [keyPath: string]: ComparisonCondition;
};
