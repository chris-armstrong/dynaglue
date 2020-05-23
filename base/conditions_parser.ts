import VError from 'verror';
import { NameMapper, ValueMapper } from './mappers';
import {
  CompositeCondition,
  ConditionValue,
  AndCondition,
  OrCondition,
  NotCondition,
  KeyPathsAndClause,
} from './conditions';

/**
 * @internal
 * An element in the expression parse tree, used
 * to assist error messaging.
 */
type ParseElement = { type: 'array'; index: number } | { type: 'object'; key: string }; 

/**
 * @internal
 *
 * A context object passed between
 * parse functions to track value and name
 * mapping and current parse context.
 */
type ConditionParseContext = {
  nameMapper: NameMapper;
  valueMapper: ValueMapper;
  parsePath: ParseElement[];
};

const printParsePath = (parsePath: ParseElement[]): string => {
  return parsePath.map(e => {
    if (e.type === 'array') return e.index === 0 ? `[` : `[...@${e.index}:`;
    return `{ ${e.key}: `;
  }).join('');
};

/**
 * Thrown when there is a problem with the expression given
 * as a `FilterExpression` or `ConditionExpression`.
 */
export class InvalidCompositeConditionException extends VError {
  constructor(message: string, parsePath: ParseElement[]) {
    super({
      name: 'invalid_composite_condition',
      info: { parsePath },
    }, `Condition parse exception: ${message} at ${printParsePath(parsePath)}`);
  }
}

/**
 * @internal
 * Is one of the keys in the object a condition operator
 */
const isConditionKey = (key: string): boolean => ['$or', '$and', '$eq', '$neq', '$gt', '$gte', '$lt', '$lte', '$between', '$in', '$exists', '$type', '$beginsWith', '$contains']
  .includes(key);

/**
 * @internal
 * Convert a string to a key path, adding the `value` object prefix.
 */
const mapKeyPath = (key: string, nameMapper: NameMapper): string =>
  [nameMapper.map('value', '#value'), ...key.split('.').map(pathElement => nameMapper.map(pathElement))].join('.');

/**
 * @internal
 *
 * Parse an object expression and give back a filter/condition expression
 * for DynamoDB.
 *
 * @param clause the expression object
 * @param context a context - pass your current NameMapper and ValueMapper, which will be filled out with filter expression parts
 * @returns the condition/filter expression
 */
export const parseCompositeCondition = (clause: CompositeCondition, context: ConditionParseContext): string => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  if (Object.keys(clause).length === 1) {
    if ('$and' in clause) {
      return parseAndCondition(clause as AndCondition, context);
    } else if ('$or' in clause) {
      return parseOrCondition(clause as OrCondition, context);
    } else if ('$not' in clause) {
      return parseNotCondition(clause as NotCondition, context);
    }
  }
  return parseKeyPathsAndClause(clause as KeyPathsAndClause, context);
  /* eslint-enable @typescript-eslint/no-use-before-define */
};

/**
 * @internal
 * Parse an AND condition expression
 */
const parseAndCondition = (clause: AndCondition, context: ConditionParseContext): string => {
  const parsePath: ParseElement[] = [...context.parsePath, { type: 'object', key: '$and' }];
  const updatedContextForIndex = (index: number): ConditionParseContext => ({ ...context, parsePath: [...parsePath, { type: 'array', index }] });
  const subclauses = clause.$and.map((clause, index) => parseCompositeCondition(clause, updatedContextForIndex(index)));

  return subclauses.map(clause => `(${clause})`).join(' AND ');
};

/**
 * @internal
 * Parse an OR condition expression
 */
const parseOrCondition = (clause: OrCondition, context: ConditionParseContext): string => {
  const parsePath: ParseElement[] = [...context.parsePath, { type: 'object', key: '$or' }];
  const updatedContextForIndex = (index: number): ConditionParseContext => ({ ...context, parsePath: [...parsePath, { type: 'array', index }] });
  const subclauses = clause.$or.map((clause, index) => parseCompositeCondition(clause, updatedContextForIndex(index)));

  return subclauses.map(clause => `(${clause})`).join(' OR ');
};

/**
 * @internal
 * Parse an NOT condition expression.
 */
const parseNotCondition = (clause: NotCondition, context: ConditionParseContext): string => {
  const parsePath: ParseElement[] = [...context.parsePath, { type: 'object', key: '$not' }];
  const updatedContext = { ...context, parsePath };
  const subclause = parseCompositeCondition(clause.$not, updatedContext);

  return `NOT ${subclause}`; 
};

/**
 * Parse a key paths object (one that has key paths as keys and
 * operators as values.
 */
const parseKeyPathsAndClause = (clause: KeyPathsAndClause, context: ConditionParseContext): string => {
  const { nameMapper, valueMapper, parsePath } = context;
  const paths = Object.keys(clause);
  if (paths.length < 1) {
    throw new InvalidCompositeConditionException('expected at least one key path with operator', parsePath);
  }
  const conditionKey = paths.find(isConditionKey);
  if (conditionKey) {
    const keyParsePath: ParseElement[] = [...parsePath, { type: 'object', key: conditionKey }];
    throw new InvalidCompositeConditionException(`unexpected condition key`, keyParsePath);
  }
  const clauses: string[] = [];
  Object.entries(clause).forEach(([path, condition]) => {
    const keyParsePath: ParseElement[] = [...parsePath, { type: 'object', key: path }];
    let clauseString;
    const simpleClause = (operator: string, value: ConditionValue): string => {
      const valueName = valueMapper.map(value);
      return `${mapKeyPath(path, nameMapper)} ${operator} ${valueName}`;
    };
    if ('$eq' in condition) {
      const value = condition.$eq;
      clauseString = simpleClause('=', value);
    } else if ('$neq' in condition) {
      const value = condition.$neq;
      clauseString = simpleClause('<>', value);
    } else if ('$gt' in condition) {
      const value = condition.$gt;
      clauseString = simpleClause('>', value);
    } else if ('$gte' in condition) {
      const value = condition.$gte;
      clauseString = simpleClause('>=', value);
    } else if ('$lt' in condition) {
      const value = condition.$lt;
      clauseString = simpleClause('<', value);
    } else if ('$lte' in condition) {
      const value = condition.$lte;
      clauseString = simpleClause('<=', value);
    } else if ('$between' in condition) {
      const value = condition.$between;
      if (!value || typeof value !== 'object' || typeof value.$lte === 'undefined' || typeof value.$gte === 'undefined') {
        throw new InvalidCompositeConditionException('$between must be an object with values for $lte and $gte', keyParsePath);
      }
      const { $lte, $gte } = condition.$between;
      const value1 = valueMapper.map($gte);
      const value2 = valueMapper.map($lte);
      clauseString = `${mapKeyPath(path, nameMapper)} BETWEEN ${value1} AND ${value2}`;
    } else if ('$in' in condition) {
      if (!Array.isArray(condition.$in)) {
        throw new InvalidCompositeConditionException('$in must be an array of values', keyParsePath);
      }
      const values = condition.$in;
      if (values.length > 100) {
        throw new InvalidCompositeConditionException('$in condition has too many values', keyParsePath);
      } else if (values.length === 0) {
        throw new InvalidCompositeConditionException('$in condition must have at least one value', keyParsePath);
      }
      const valueNames = values.map(value => valueMapper.map(value));
      clauseString = `${mapKeyPath(path, nameMapper)} IN (${valueNames.join(',')})`;
    } else if ('$exists' in condition) {
      const fn = condition.$exists ? 'attribute_exists' : 'attribute_not_exists';
      clauseString = `${fn}(${mapKeyPath(path, nameMapper)})`;
    } else if ('$type' in condition) {
      const valueName = valueMapper.map(condition.$type);
      clauseString = `attribute_type(${mapKeyPath(path, nameMapper)},${valueName})`;
    } else if ('$beginsWith' in condition) {
      const valueName = valueMapper.map(condition.$beginsWith);
      clauseString = `begins_with(${mapKeyPath(path, nameMapper)},${valueName})`;
    } else if ('$contains' in condition) {
      const valueName = valueMapper.map(condition.$contains);
      clauseString = `contains(${mapKeyPath(path, nameMapper)},${valueName})`;
    } else throw new InvalidCompositeConditionException('unknown operator', keyParsePath);

    clauses.push(clauseString);
  });

  return clauses.join(' AND ');
};


