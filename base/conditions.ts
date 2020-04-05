import { DocumentClient } from 'aws-sdk/clients/dynamodb';

/* The DynamoDB `Set` type */
export type DynamoDBSet = DocumentClient.DynamoDbSet;

/* The value for a condition expression */
export type ConditionValue = undefined; 

/* A DynamoDB type, for the $type condition operator (see [[TypeCondition]]) */
export type DynamoDBType = 'S' | 'SS' | 'N' | 'NS' | 'B' | 'BS' | 'BOOL' | 'NULL' | 'L' | 'M';

/**
 * A filter or condition expression. This type
 * serves as the root of a object structure for specifying a
 * filter/condition expression which is translated to a DynamoDB
 * Conditional expression for use with some of the available
 * operations (in their underlying `ConditionExpression` or
 * `FilterExpression` fields.
 *
 * The syntax is very similar to Mongo's query syntax, but a little
 * bit stricter to help with type evaluation.
 *
 * A simple condition expression consists of key paths mapped to an operator.
 * For example, to test `profile.username = 'test@example.com'`, you would
 * construct an expression as follows:
 *
 * ```
 * {
 *   'profile.username': { $eq: 'test@example.com' },
 * }
 * ```
 *
 * This expression would be translated to DynamoDB's FilterExpression syntax as:
 *
 * `#attr0.username = :value0`
 *
 * (`profile` is a reserved word in DynamoDB and automatically mapped. `#attr0` and `:value0` will be
 * written to `ExpressionAttributeNames` and `ExpressionAttributeValues`
 * respectively for you).
 *
 * Multiple key paths in the same object are treated as an `AND` operation implicitly.
 *
 * * NOTE: For a full list of key path operators, see the [[KeyPathsAndClause]] type.
 *
 * You can also construct AND, OR and NOT expressions for more complex evaluations, e.g.:
 *
 * ```
 * {
 *   $or: [
   *   { $not: { 'location.value': { $lte: 0 } } },
   *   { 
   *      $and: [
   *        { 'location.point.x': { $gt: 10 } },
   *        { 'location.point.y': { $gt: 1.3 } },
   *      ],
   *   }
 *   ],
 * };
 * ```
 * This would be written in DynamoDB's FilterExpression syntax as:
 *
 * `(NOT #attr0.#attr1 <= :value0) OR (#attr0.point.x > :value1 AND #attr0.point.y < :value2)`
 *
 * where:
 * * `#attr0` is mapped to 'location' (reserved word)
 * * `#attr1` is mapped to 'value' (reserved word)
 * * `:value0` is mapped to `0` (Expression Attribute Value)
 * * `:value1` is mapped to `10` (Expression Attribute Value)
 * * `:value2` is mapped to `1.3` (Expression Attribute Value)
 * 
 */
export type CompositeCondition = AndCondition | OrCondition | NotCondition | KeyPathsAndClause;

/**
 * An AND clause in a condition/filter expression. The `$and` array
 * must be the only key on the object, and contain at least one condition
 * clause.
 *
 * Each clause will be connected by an `AND` keyword.
*/
export type AndCondition = {
  /* One or more conditions to apply the AND operator to */
  $and: CompositeCondition[];
};

/**
 * An OR clause in a condition/filter expression. The `$or` array
 * must be the only key on the object, and contain at least one condition
 * clause.
 *
 * Each clause will be connected by an `OR` keyword.
*/
export type OrCondition = {
  /* One or more conditions to apply the OR operator to */
  $or: CompositeCondition[];
};

/**
 * A NOT clause in a condition/filter expression. The $not value must
 * be the only key on the object, and must contain a condition clause.
 */
export type NotCondition = {
  /* The condition to apply the `NOT` operator to */
  $not: CompositeCondition;
};

/**
 * A clause that translates to the $eq operator. The key path this 
 * appears on will be used in a `=` expression.
 *
 * e.g. `{ 'x.y': { $eq: 'once' } } => x.y = :value0 // (where :value0 is set to 'once')`
*/
export type EqCondition = {
  /* The $eq value */
  $eq: ConditionValue;
};

/**
 * A clause that translates to the $eq operator. The key path this 
 * appears on will be used in a `<>` expression.
 *
 * e.g. `{ 'x.y': { $neq: 5 } } => x.y <> :value0 // (where :value0 is set to 5)`
*/
export type NotEqCondition = {
  /* The $neq value */
  $neq: ConditionValue;
};

/**
 * A clause that translates to the $gt operator. The key path this 
 * appears on will be used in a `>` expression.
 *
 * e.g. `{ 'x.y': { $gt: 5 } } => x.y > :value0 // (where :value0 is set to 5)`
*/
export type GtCondition = {
  /* The $gt value */
  $gt: ConditionValue;
};

/**
 * A clause that translates to the $gte operator. The key path this 
 * appears on will be used in a `>=` expression.
 *
 * e.g. `{ 'x.y': { $gte: 5 } } => x.y >= :value0 // (where :value0 is set to 5)`
*/
export type GtEqCondition = {
  /* The $gte value */
  $gte: ConditionValue;
};

/**
 * A clause that translates to the $lt operator. The key path this 
 * appears on will be used in a `<` expression.
 *
 * e.g. `{ 'x.y': { $lt: 5 } } => x.y < :value0 // (where :value0 is set to 5)`
*/
export type LtCondition = {
  /* The $lt value */
  $lt: ConditionValue;
};

/**
 * A clause that translates to the $lte operator. The key path this 
 * appears on will be used in a `<=` expression.
 *
 * e.g. `{ 'x.y': { $lte: 5 } } => x.y <= :value0 // (where :value0 is set to 5)`
*/
export type LtEqCondition = {
  /* The $lte value */
  $lte: ConditionValue;
};

/**
 * A clause that translates to the `$between` operator. The key path this
 * appears on will be used in a `BETWEEN ... AND ...` expression.
 */
export type BetweenCondition = {
  /* The $between clause. You need to have a value for `$gte` and `$lte` */
  $between: {
    /* The lower-bound of the BETWEEN operator clause (inclusive) */
    $gte: ConditionValue;
    /* The upper-bound of the BETWEEN operator clause (inclusive) */
    $lte: ConditionValue;
  };
};

/**
 * A clause that translates to the `$in` operator. The key path this
 * appears on will be used in a `IN (...)` expression.
 *
 * e.g. `{ x: { $in: ['a', 'b', 'c] } }` => `x IN (:v0, :v1, :v2)` (where `:v0 = 'a'`, `:v1 = 'b'`, etc)
 */
export type InCondition = {
  /* The values for the IN expression */
  $in: ConditionValue[];
};

/**
 * A clause that translates to the `$exists` operator. It's value
 * is a boolean expression:
 * * when `true`, it performs an `attribute_exists()` function on the associated property
 * * when `false`, it performs an `attribute_not_exists()` function on the associated property
 */
export type ExistsCondition = {
  /* A boolean that indicates whether to test whether the attribute exists / does not exist */
  $exists: boolean;
};

/**
 * A clause that translates to the `$type` operator. It tests to see if the
 * associated attribute is of the specified type, returning a boolean result.
 *
 * It calls the `attribute_type()` function.
 *
 * The value is the DynamoDB type string to be tested (see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions)
 *
 * e.g. `{ x: { $type: 'L' } }` (see if `x` is a list) => `attribute_type(x, :v)` (where `:v = 'L'`)
 */
export type TypeCondition = {
  /* The type to test */
  $type: DynamoDBType;
};

/**
 * A clause that translates to the `$beginsWith` operator. It tests to see if a string
 * attribute begins with the specified string.
 *
 * It translates to the `begins_with()` function.
 *
 * e.g. `{ x: { $beginsWith: 'abc' } }` => `begins_with(x, :value0)` (where `:value0 = 'abc'`)
 */
export type BeginsWithCondition = {
  /* The string value to test with */
  $beginsWith: string;
};

/**
 * A clause that translates to the `$contains` operator. It tests to see if
 * the given value is contained in the attribute (which may be a Set or string).
 *
 * It translates to the `contains()` function.
 *
 * e.g. `{ x: { $contains: 'abc' } }` => `contains(x, :value0)` (where `:value0 = 'abc'`)
 */
export type ContainsCondition = {
  /* The value to test in the property Set or string */
  $contains: string;
};

/**
 * A comparison condition. These clauses are the right-hand
 * side of a key-path in a condition expression.
 */
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

/**
 * A key path condition clause. The keys in this object are key-paths
 * (`.` separated keys in the target object to be tested), while the values
 * are one of the operators listed in [[ComparisonCondition]].
 *
 * e.g. `{ 'profile.username': { $eq: 'user@example.com } }`
 * tests to see if the path `profile.username` in the target object
 * is equal to the string `'user@example.com'`.
 *
 * A key paths clause can contain multiple key paths with different operators;
 * the resulting DynamoDB clause is AND'ed together.
 *
 * e.g.
 * ```
 * { 
 *   'profile.username': { $eq: 'user@example.com' },
 *   'suburbs': { $in: ['Placeville', 'Townsburb'] },
 *   'point.x': { $gt: 10.3 },
 * }
 * ```
 *
 * results in a DynamoDB condition expression like:
 * `profile.username = :value0 AND suburbs IN (:value1,:value2) AND point.x > :value3)`
 */
export type KeyPathsAndClause = {
  [keyPath: string]: ComparisonCondition;
};
