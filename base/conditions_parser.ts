import VError from 'verror';
import { NameMapper, ValueMapper } from './mappers';
import {
  ConditionClause,
  ConditionValue,
  AndCondition,
  OrCondition,
  KeyPathsAndClause,

  EqCondition,
  NotEqCondition,
  GtCondition,
  GtEqCondition,
  LtCondition,
  LtEqCondition,
  BetweenCondition,
  InCondition,
  ExistsCondition,
  TypeCondition,
  BeginsWithCondition,
  ContainsCondition,
} from './conditions';

type ParseElement = { type: 'array', index: number } | { type: 'object', key: string }; 

type ConditionParseContext = {
  nameMapper: NameMapper;
  valueMapper: ValueMapper;
  parsePath: ParseElement[];
};

export const printParsePath = (parsePath: ParseElement[]) => {
  return parsePath.map(e => {
    if (e.type === 'array') return e.index === 0 ? `[` : `[...@${e.index}:`;
    return `{ ${e.key}: `;
  }).join('');
};

export class InvalidConditionClauseException extends VError {
  constructor(message: string, parsePath: ParseElement[]) {
    super({
      info: { parsePath },
    }, `Condition parse exception: ${message} at ${printParsePath(parsePath)}`);
  }
}

export const isConditionKey = (key: string) => ['$or', '$and', '$eq', '$neq', '$gt', '$gte', '$lt', '$lte', '$between', '$in', '$exists', '$type', '$beginsWith', '$contains']
  .includes(key);

export const mapKeyPath = (key: string, nameMapper: NameMapper) => {
  const path = ['value', ...key.split('.')];
  return path.map(pathElement => nameMapper.map(pathElement)).join('.');
}

const hasProp = (value: any, propName: string) => typeof value[propName] !== 'undefined';

const parseAndCondition = (clause: AndCondition, context: ConditionParseContext): string => {
  const parsePath: ParseElement[] = [...context.parsePath, { type: 'object', key: '$and' }];
  const updatedContext = { ...context, parsePath };
  const subclauses = clause.$and.map(clause => parseConditionClause(clause, updatedContext));

  return subclauses.map(clause => `(${clause})`).join(' AND ');
};

const parseOrCondition = (clause: OrCondition, context: ConditionParseContext): string => {
  const parsePath: ParseElement[] = [...context.parsePath, { type: 'object', key: '$or' }];
  const updatedContext = { ...context, parsePath };
  const subclauses = clause.$or.map(clause => parseConditionClause(clause, updatedContext));

  return subclauses.map(clause => `(${clause})`).join(' OR ');
};

const parseKeyPathsAndClause = (clause: KeyPathsAndClause, context: ConditionParseContext): string => {
  const { nameMapper, valueMapper, parsePath } = context;
  const paths = Object.keys(clause);
  const conditionKey = paths.find(isConditionKey);
  if (conditionKey) {
    const keyParsePath: ParseElement[] = [...parsePath, { type: 'object', key: conditionKey }];
    throw new InvalidConditionClauseException(`unexpected condition key`, keyParsePath);
  }
  const clauses: string[] = [];
  Object.entries(clause).forEach(([path, condition]) => {
    const keyParsePath: ParseElement[] = [...parsePath, { type: 'object', key: path }];
    let clauseString;
    const simpleClause = (operator: string, value: ConditionValue) => {
      const valueName = valueMapper.map(value);
      return `${mapKeyPath(path, nameMapper)} ${operator} ${valueName}`;
    };
    if (hasProp(condition, '$eq')) {
      const value = (condition as EqCondition).$eq;
      clauseString = simpleClause('=', value);
    } else if (hasProp(condition, '$neq')) {
      const value = (condition as NotEqCondition).$neq;
      clauseString = simpleClause('<>', value);
    } else if (hasProp(condition, '$gt')) {
      const value = (condition as GtCondition).$gt;
      clauseString = simpleClause('>', value);
    } else if (hasProp(condition, '$gte')) {
      const value = (condition as GtEqCondition).$gte;
      clauseString = simpleClause('>=', value);
    } else if (hasProp(condition, '$lt')) {
      const value = (condition as LtCondition).$lt;
      clauseString = simpleClause('<', value);
    } else if (hasProp(condition, '$lte')) {
      const value = (condition as LtEqCondition).$lte;
      clauseString = simpleClause('<=', value);
    } else if (hasProp(condition, '$between')) {
      const { $lte, $gte } = (condition as BetweenCondition).$between;
      const value1 = valueMapper.map($gte);
      const value2 = valueMapper.map($lte);
      clauseString = `${mapKeyPath(path, nameMapper)} BETWEEN ${value1} AND ${value2}`;
    } else if (hasProp(condition, '$in')) {
      const values = (condition as InCondition).$in;
      if (values.length > 100) {
        throw new InvalidConditionClauseException('$in condition has too many values', keyParsePath);
      } else if (values.length === 0) {
        throw new InvalidConditionClauseException('$in condition must have at least one value', keyParsePath);
      }
      const valueNames = values.map(value => valueMapper.map(value));
      clauseString = `${mapKeyPath(path, nameMapper)} IN (${valueNames.join(',')})`;
    } else if (hasProp(condition, '$exists')) {
      const fn = (condition as ExistsCondition).$exists ? 'attribute_exists' : 'attribute_not_exists';
      clauseString = `${fn}(${mapKeyPath(path, nameMapper)})`;
    } else if (hasProp(condition, '$type')) {
      const valueName = valueMapper.map((condition as TypeCondition).$type);
      clauseString = `attribute_type(${mapKeyPath(path, nameMapper)},${valueName})`;
    } else if (hasProp(condition, '$beginsWith')) {
      const valueName = valueMapper.map((condition as BeginsWithCondition).$beginsWith);
      clauseString = `begins_with(${mapKeyPath(path, nameMapper)},${valueName})`;
    } else if (hasProp(condition, '$contains')) {
      const valueName = valueMapper.map((condition as ContainsCondition).$contains);
      clauseString = `contains(${mapKeyPath(path, nameMapper)},${valueName})`;
    } else throw new InvalidConditionClauseException('unknown operator', keyParsePath);

    clauses.push(clauseString);
  });

  return clauses.join(' AND ');
};

export const parseConditionClause = (clause: ConditionClause, context: ConditionParseContext): string => {
  if ((clause as AndCondition).$and) {
    return parseAndCondition(clause as AndCondition, context);
  } else if ((clause as OrCondition).$or) {
    return parseOrCondition(clause as OrCondition, context);
  } else {
    // must be a key paths clause
    return parseKeyPathsAndClause(clause as KeyPathsAndClause, context);
  }
};

export const parseConditions = (clause: ConditionClause, context: ConditionParseContext): string => {
  return parseConditionClause(clause, context); 
};

