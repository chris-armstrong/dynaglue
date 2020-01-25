import get from 'lodash/get';
import createDebug from 'debug';
import { Context } from '../context';
import { UpdateItemInput, Converter, AttributeMap } from 'aws-sdk/clients/dynamodb';
import { getRootCollection, assemblePrimaryKeyValue, unwrap, assembleIndexedValue } from '../base/util';
import { KeyPath, AccessPattern } from '../base/access_pattern';
import { WrappedDocument, DocumentWithId } from '../base/common';
import { InvalidUpdatesException, InvalidUpdateValueException, IndexNotFoundException } from '../base/exceptions';
import { Collection } from '../base/collection';
import { SecondaryIndexLayout } from '../base/layout';
import debugDynamo from '../debug/debugDynamo';

/** @internal */
const debug = createDebug('dynaglue:operations:updateById');

/**
  * An update object, where the key paths are specified as keys and the values
  * as the new field values.
  *
  * Keep in mind, that although this is a partial update, you need to specify
  * all the keys for a composite key in an access pattern - it cannot partially
  * update composite index values.
  */
export type SetValuesDocument = {
  [path: string]: any;
};

/**
  * The set of updates to apply to a document.
  */
export type Updates = SetValuesDocument;

/* eslint-disable */
// prettier-ignore
/** @internal */
const DYNAMODB_RESERVED_WORDS = [ 'ABORT', 'ABSOLUTE', 'ACTION', 'ADD', 'AFTER', 'AGENT', 'AGGREGATE', 'ALL', 'ALLOCATE', 'ALTER', 'ANALYZE', 'AND', 'ANY', 'ARCHIVE', 'ARE', 'ARRAY', 'AS', 'ASC', 'ASCII', 'ASENSITIVE', 'ASSERTION', 'ASYMMETRIC', 'AT', 'ATOMIC', 'ATTACH', 'ATTRIBUTE', 'AUTH', 'AUTHORIZATION', 'AUTHORIZE', 'AUTO', 'AVG', 'BACK', 'BACKUP', 'BASE', 'BATCH', 'BEFORE', 'BEGIN', 'BETWEEN', 'BIGINT', 'BINARY', 'BIT', 'BLOB', 'BLOCK', 'BOOLEAN', 'BOTH', 'BREADTH', 'BUCKET', 'BULK', 'BY', 'BYTE', 'CALL', 'CALLED', 'CALLING', 'CAPACITY', 'CASCADE', 'CASCADED', 'CASE', 'CAST', 'CATALOG', 'CHAR', 'CHARACTER', 'CHECK', 'CLASS', 'CLOB', 'CLOSE', 'CLUSTER', 'CLUSTERED', 'CLUSTERING', 'CLUSTERS', 'COALESCE', 'COLLATE', 'COLLATION', 'COLLECTION', 'COLUMN', 'COLUMNS', 'COMBINE', 'COMMENT', 'COMMIT', 'COMPACT', 'COMPILE', 'COMPRESS', 'CONDITION', 'CONFLICT', 'CONNECT', 'CONNECTION', 'CONSISTENCY', 'CONSISTENT', 'CONSTRAINT', 'CONSTRAINTS', 'CONSTRUCTOR', 'CONSUMED', 'CONTINUE', 'CONVERT', 'COPY', 'CORRESPONDING', 'COUNT', 'COUNTER', 'CREATE', 'CROSS', 'CUBE', 'CURRENT', 'CURSOR', 'CYCLE', 'DATA', 'DATABASE', 'DATE', 'DATETIME', 'DAY', 'DEALLOCATE', 'DEC', 'DECIMAL', 'DECLARE', 'DEFAULT', 'DEFERRABLE', 'DEFERRED', 'DEFINE', 'DEFINED', 'DEFINITION', 'DELETE', 'DELIMITED', 'DEPTH', 'DEREF', 'DESC', 'DESCRIBE', 'DESCRIPTOR', 'DETACH', 'DETERMINISTIC', 'DIAGNOSTICS', 'DIRECTORIES', 'DISABLE', 'DISCONNECT', 'DISTINCT', 'DISTRIBUTE', 'DO', 'DOMAIN', 'DOUBLE', 'DROP', 'DUMP', 'DURATION', 'DYNAMIC', 'EACH', 'ELEMENT', 'ELSE', 'ELSEIF', 'EMPTY', 'ENABLE', 'END', 'EQUAL', 'EQUALS', 'ERROR', 'ESCAPE', 'ESCAPED', 'EVAL', 'EVALUATE', 'EXCEEDED', 'EXCEPT', 'EXCEPTION', 'EXCEPTIONS', 'EXCLUSIVE', 'EXEC', 'EXECUTE', 'EXISTS', 'EXIT', 'EXPLAIN', 'EXPLODE', 'EXPORT', 'EXPRESSION', 'EXTENDED', 'EXTERNAL', 'EXTRACT', 'FAIL', 'FALSE', 'FAMILY', 'FETCH', 'FIELDS', 'FILE', 'FILTER', 'FILTERING', 'FINAL', 'FINISH', 'FIRST', 'FIXED', 'FLATTERN', 'FLOAT', 'FOR', 'FORCE', 'FOREIGN', 'FORMAT', 'FORWARD', 'FOUND', 'FREE', 'FROM', 'FULL', 'FUNCTION', 'FUNCTIONS', 'GENERAL', 'GENERATE', 'GET', 'GLOB', 'GLOBAL', 'GO', 'GOTO', 'GRANT', 'GREATER', 'GROUP', 'GROUPING', 'HANDLER', 'HASH', 'HAVE', 'HAVING', 'HEAP', 'HIDDEN', 'HOLD', 'HOUR', 'IDENTIFIED', 'IDENTITY', 'IF', 'IGNORE', 'IMMEDIATE', 'IMPORT', 'IN', 'INCLUDING', 'INCLUSIVE', 'INCREMENT', 'INCREMENTAL', 'INDEX', 'INDEXED', 'INDEXES', 'INDICATOR', 'INFINITE', 'INITIALLY', 'INLINE', 'INNER', 'INNTER', 'INOUT', 'INPUT', 'INSENSITIVE', 'INSERT', 'INSTEAD', 'INT', 'INTEGER', 'INTERSECT', 'INTERVAL', 'INTO', 'INVALIDATE', 'IS', 'ISOLATION', 'ITEM', 'ITEMS', 'ITERATE', 'JOIN', 'KEY', 'KEYS', 'LAG', 'LANGUAGE', 'LARGE', 'LAST', 'LATERAL', 'LEAD', 'LEADING', 'LEAVE', 'LEFT', 'LENGTH', 'LESS', 'LEVEL', 'LIKE', 'LIMIT', 'LIMITED', 'LINES', 'LIST', 'LOAD', 'LOCAL', 'LOCALTIME', 'LOCALTIMESTAMP', 'LOCATION', 'LOCATOR', 'LOCK', 'LOCKS', 'LOG', 'LOGED', 'LONG', 'LOOP', 'LOWER', 'MAP', 'MATCH', 'MATERIALIZED', 'MAX', 'MAXLEN', 'MEMBER', 'MERGE', 'METHOD', 'METRICS', 'MIN', 'MINUS', 'MINUTE', 'MISSING', 'MOD', 'MODE', 'MODIFIES', 'MODIFY', 'MODULE', 'MONTH', 'MULTI', 'MULTISET', 'NAME', 'NAMES', 'NATIONAL', 'NATURAL', 'NCHAR', 'NCLOB', 'NEW', 'NEXT', 'NO', 'NONE', 'NOT', 'NULL', 'NULLIF', 'NUMBER', 'NUMERIC', 'OBJECT', 'OF', 'OFFLINE', 'OFFSET', 'OLD', 'ON', 'ONLINE', 'ONLY', 'OPAQUE', 'OPEN', 'OPERATOR', 'OPTION', 'OR', 'ORDER', 'ORDINALITY', 'OTHER', 'OTHERS', 'OUT', 'OUTER', 'OUTPUT', 'OVER', 'OVERLAPS', 'OVERRIDE', 'OWNER', 'PAD', 'PARALLEL', 'PARAMETER', 'PARAMETERS', 'PARTIAL', 'PARTITION', 'PARTITIONED', 'PARTITIONS', 'PATH', 'PERCENT', 'PERCENTILE', 'PERMISSION', 'PERMISSIONS', 'PIPE', 'PIPELINED', 'PLAN', 'POOL', 'POSITION', 'PRECISION', 'PREPARE', 'PRESERVE', 'PRIMARY', 'PRIOR', 'PRIVATE', 'PRIVILEGES', 'PROCEDURE', 'PROCESSED', 'PROJECT', 'PROJECTION', 'PROPERTY', 'PROVISIONING', 'PUBLIC', 'PUT', 'QUERY', 'QUIT', 'QUORUM', 'RAISE', 'RANDOM', 'RANGE', 'RANK', 'RAW', 'READ', 'READS', 'REAL', 'REBUILD', 'RECORD', 'RECURSIVE', 'REDUCE', 'REF', 'REFERENCE', 'REFERENCES', 'REFERENCING', 'REGEXP', 'REGION', 'REINDEX', 'RELATIVE', 'RELEASE', 'REMAINDER', 'RENAME', 'REPEAT', 'REPLACE', 'REQUEST', 'RESET', 'RESIGNAL', 'RESOURCE', 'RESPONSE', 'RESTORE', 'RESTRICT', 'RESULT', 'RETURN', 'RETURNING', 'RETURNS', 'REVERSE', 'REVOKE', 'RIGHT', 'ROLE', 'ROLES', 'ROLLBACK', 'ROLLUP', 'ROUTINE', 'ROW', 'ROWS', 'RULE', 'RULES', 'SAMPLE', 'SATISFIES', 'SAVE', 'SAVEPOINT', 'SCAN', 'SCHEMA', 'SCOPE', 'SCROLL', 'SEARCH', 'SECOND', 'SECTION', 'SEGMENT', 'SEGMENTS', 'SELECT', 'SELF', 'SEMI', 'SENSITIVE', 'SEPARATE', 'SEQUENCE', 'SERIALIZABLE', 'SESSION', 'SET', 'SETS', 'SHARD', 'SHARE', 'SHARED', 'SHORT', 'SHOW', 'SIGNAL', 'SIMILAR', 'SIZE', 'SKEWED', 'SMALLINT', 'SNAPSHOT', 'SOME', 'SOURCE', 'SPACE', 'SPACES', 'SPARSE', 'SPECIFIC', 'SPECIFICTYPE', 'SPLIT', 'SQL', 'SQLCODE', 'SQLERROR', 'SQLEXCEPTION', 'SQLSTATE', 'SQLWARNING', 'START', 'STATE', 'STATIC', 'STATUS', 'STORAGE', 'STORE', 'STORED', 'STREAM', 'STRING', 'STRUCT', 'STYLE', 'SUB', 'SUBMULTISET', 'SUBPARTITION', 'SUBSTRING', 'SUBTYPE', 'SUM', 'SUPER', 'SYMMETRIC', 'SYNONYM', 'SYSTEM', 'TABLE', 'TABLESAMPLE', 'TEMP', 'TEMPORARY', 'TERMINATED', 'TEXT', 'THAN', 'THEN', 'THROUGHPUT', 'TIME', 'TIMESTAMP', 'TIMEZONE', 'TINYINT', 'TO', 'TOKEN', 'TOTAL', 'TOUCH', 'TRAILING', 'TRANSACTION', 'TRANSFORM', 'TRANSLATE', 'TRANSLATION', 'TREAT', 'TRIGGER', 'TRIM', 'TRUE', 'TRUNCATE', 'TTL', 'TUPLE', 'TYPE', 'UNDER', 'UNDO', 'UNION', 'UNIQUE', 'UNIT', 'UNKNOWN', 'UNLOGGED', 'UNNEST', 'UNPROCESSED', 'UNSIGNED', 'UNTIL', 'UPDATE', 'UPPER', 'URL', 'USAGE', 'USE', 'USER', 'USERS', 'USING', 'UUID', 'VACUUM', 'VALUE', 'VALUED', 'VALUES', 'VARCHAR', 'VARIABLE', 'VARIANCE', 'VARINT', 'VARYING', 'VIEW', 'VIEWS', 'VIRTUAL', 'VOID', 'WAIT', 'WHEN', 'WHENEVER', 'WHERE', 'WHILE', 'WINDOW', 'WITH', 'WITHIN', 'WITHOUT', 'WORK', 'WRAPPED', 'WRITE', 'YEAR', 'ZONE' ];
/* eslint-enable */

/**
  * @internal
  */
const isReservedWord = (word: string): boolean => DYNAMODB_RESERVED_WORDS.includes(word.toUpperCase());

/**
  * @internal
  */
const isSafeAttributeName = (attributeName: string): boolean => {
  if (isReservedWord(attributeName)) {
    return false;
  }
  return /[A-Za-z][A-Za-z0-9]*/.test(attributeName);
};

/**
  * @internal
  */
const invertMap = (
  map: Map<string, string>
): {
  [key: string]: string;
} => Object.assign({}, ...Array.from(map.entries(), ([k, v]) => ({ [v]: k })));

/**
  * @internal
  */
export const isSubsetOfKeyPath = (mainPath: KeyPath, subsetPath: KeyPath): boolean =>
  subsetPath.every((key, index) => mainPath[index] === key);

/**
  * @internal
  */
export const findMatchingPath = (keyPaths: KeyPath[], path: KeyPath): KeyPath | undefined => {
  for (const keyPath of keyPaths) {
    if (isSubsetOfKeyPath(path, keyPath)) {
      return keyPath;
    }
  }
}

/**
  * @internal
  */
export const extractUpdateKeyPaths = (updates: Updates) => Object.keys(updates).map(updatePath => updatePath.split('.'));

/**
  * @internal
  */
export const createUpdateActionForKey = (collectionName: string, keyType: 'partition' | 'sort', keyPaths: KeyPath[], indexLayout: SecondaryIndexLayout, updates: Updates) => {
  const updateKeyPaths = extractUpdateKeyPaths(updates);
  const matchingUpdatePaths = keyPaths.map(partitionKey => findMatchingPath(updateKeyPaths, partitionKey));
  const attributeName = (keyType === 'sort' ? indexLayout.sortKey as string : indexLayout.partitionKey);
  debug('createUpdateActionForKey collection=%s keyType=%s keyPaths=%o attributeName=%s', collectionName, keyType, keyPaths, attributeName);
  if (keyType === 'partition') {
    if (matchingUpdatePaths.every(updatePath => updatePath === undefined)) {
      debug('createUpdateActionForKey: no updates to this key');
      return undefined;
    } else if (!matchingUpdatePaths.every(updatePath => updatePath !== undefined)) {
      throw new InvalidUpdatesException(`all values are required for ${keyType} access pattern with keys {${keyPaths.map(kp => kp.join('.')).join(', ')}}`)
    }
  }

  debug('createUpdateActionForKey: key to be updated matchingUpdatePaths=%o', matchingUpdatePaths);
  const updateValues = keyPaths.map((keyPath, index) => {
    const matchingUpdatePath = matchingUpdatePaths[index];
    if (!matchingUpdatePath) {
      return undefined;
    }
    let value = updates[matchingUpdatePath.join('.')];
    if (keyPath.length !== matchingUpdatePath.length) {
      const difference = keyPath.slice(matchingUpdatePath.length);
      value = get(value, difference);
    }
    return value;
  });

  return {
    attributeName,
    value: assembleIndexedValue(keyType, collectionName, updateValues),
  };
}

/**
  * @internal
  */
export const findCollectionIndex = (collection: Collection, indexName: string): SecondaryIndexLayout => {
  const layout = collection.layout.findKeys?.find(fk => fk.indexName === indexName);
  if (!layout) {
    throw new IndexNotFoundException(indexName);
  }

  return layout;
}

/**
  * @internal
  */
export const replaceStringHex = (sub: string): string => {
  let replacement = '';
  for (let i = 0; i < sub.length; i++) {
    replacement += sub[i].charCodeAt(i).toString(16);
  }
  return replacement;
}

/**
  * @internal
  */
export const makeSafeAttributeName = (partName: string): string => `#attr_${partName.replace(/[^A-Za-z]+/g, replaceStringHex)}`

/**
  * @internal
  */
export type Action = {
  action: string;
  expressionAttributeValue: [string, any];
  expressionAttributeNames: [string, string][];
};

/**
  * @internal
  */
export const setActionCreator = () => {
  let safeNameIndex = 0;
  let safeValueIndex = 0;
  return (keyPath: KeyPath, value: any): Action => {
    const valueName = `:value${safeValueIndex++}`;
    const marshalledValue = typeof value === 'object' && !Array.isArray(value) ?
      Converter.marshall(value) : Converter.input(value);

    const updateKeyPath = ['value', ...keyPath];
    const updateKeyPathMappings: [string, string][] = updateKeyPath.map(part => {
      if (isSafeAttributeName(part)) {
        return [part, part];
      }
      return [part, `#attr${safeNameIndex++}`];
    });

    return {
      expressionAttributeValue: [valueName, marshalledValue],
      expressionAttributeNames: updateKeyPathMappings.filter(([attr, mapped]) => attr !== mapped),
      action: `${updateKeyPathMappings.map(([, mapped]) => mapped).join('.')} = ${valueName}`,
    };
  };
};

/**
  * Update a document using its `_id`.
  *
  * This operation allows you to do a partial update of a collection document i.e. without
  * specifying all the values (it uses DynamoDB`s `UpdateItem` operation).
  *
  * At this time, the `updates` value just updates specified key paths on the target document.
  * 
  * If some of the update key paths are indexed values, the indexes will also be updated. Because
  * of this, you must specify all the key values in an access pattern to ensure indexes are
  * updated consistently.
  *
  * @param ctx the context
  * @param collectionName the collection to update
  * @param objectId the `_id` value of the object to update
  * @param updates the set of updates to apply.
  * @returns the updated object value in its entirety.
  * @throws {CollectionNotFoundException} collection not found
  * @throws {InvalidUpdatesException} thrown when the updates object is invalid or incomplete
  * @throws {InvalidUpdateValueException} thrown when one of the update values is an invalid type
  */
export async function updateById(
  ctx: Context,
  collectionName: string,
  objectId: string,
  updates: Updates
): Promise<DocumentWithId> {
  const collection = getRootCollection(ctx, collectionName);

  const updatePaths: string[] = Object.keys(updates);
  if (updatePaths.length === 0) {
    throw new InvalidUpdatesException('There must be at least one update path in the updates object');
  }
  const updateKeyPaths: KeyPath[] = extractUpdateKeyPaths(updates);
  const attributeNameMap = new Map<string, string>();
  attributeNameMap.set('value', '#value');

  const expressionAttributeValues: { [key: string]: any } = {};
  let safeNameIndex = 0;
  const expressionSetActions = [];
  for (const [index, updatePath] of updatePaths.entries()) {
    const updateKeyPath = updateKeyPaths[index];

    const value = updates[updatePath];
    if (typeof value === 'undefined') {
      throw new InvalidUpdateValueException(updatePath, 'value must not be undefined');
    }
    const valueName = `:value${index}`;
    expressionAttributeValues[valueName] =
      typeof value === 'object' && !Array.isArray(value) ? Converter.marshall(value) : Converter.input(value);

    const expressionAttributeNameParts = ['#value', ...updateKeyPath];
    expressionAttributeNameParts.forEach((part, index) => {
      if (isSafeAttributeName(part)) {
        return;
      }
      let nameMapping = attributeNameMap.get(part);
      if (!nameMapping) {
        nameMapping = `#attr${safeNameIndex++}`;
        attributeNameMap.set(part, nameMapping);
      }
      expressionAttributeNameParts[index] = nameMapping;
    });
    expressionSetActions.push(`${expressionAttributeNameParts.join('.')} = ${valueName}`);
  }

  let keyValueIndex = 0;

  if (collection.accessPatterns) {
    for (const { indexName, partitionKeys, sortKeys } of collection.accessPatterns) {

      if (partitionKeys.length > 0) {
        const layout = findCollectionIndex(collection, indexName);

        const update = createUpdateActionForKey(collection.name, 'partition', partitionKeys, layout, updates);
        if (update) {
          const nameMapping = `#key${keyValueIndex}`;
          const valueMapping = `:key${keyValueIndex}`;
          keyValueIndex++;
          attributeNameMap.set(update.attributeName, nameMapping);
          expressionAttributeValues[valueMapping] = Converter.input(update.value);
          expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
        }
      }
      if (sortKeys && sortKeys.length > 0) {
        const layout = findCollectionIndex(collection, indexName);
        const update = createUpdateActionForKey(collection.name, 'sort', sortKeys, layout, updates);
        if (update) {
          const nameMapping = `#key${keyValueIndex}`;
          const valueMapping = `:key${keyValueIndex}`;
          keyValueIndex++;
          attributeNameMap.set(update.attributeName, nameMapping);
          expressionAttributeValues[valueMapping] = Converter.input(update.value);
          expressionSetActions.push(`${nameMapping} = ${valueMapping}`);
        }
      }
    }
  }

  const expressionAttributeNames = invertMap(attributeNameMap);

  const updateExpression = `SET ${expressionSetActions.join(', ')}`;

  const updateItem: UpdateItemInput = {
    TableName: collection.layout.tableName,
    Key: {
      [collection.layout.primaryKey.partitionKey]: { S: assemblePrimaryKeyValue(collectionName, objectId) },
      [collection.layout.primaryKey.sortKey]: { S: assemblePrimaryKeyValue(collectionName, objectId) },
    },
    ReturnValues: 'ALL_NEW',
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    UpdateExpression: updateExpression,
  };

  debugDynamo('UpdateItem', updateItem);

  const result = await ctx.ddb.updateItem(updateItem).promise();
  const unmarshalledAttributes = Converter.unmarshall(result.Attributes as AttributeMap);
  const updatedDocument = unwrap(unmarshalledAttributes as WrappedDocument);
  return updatedDocument;
}
