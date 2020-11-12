import { AttributeValue, Converter } from 'aws-sdk/clients/dynamodb';
import { isSafeAttributeName } from './expression_util';
import { invertMap } from './util';

/**
 * @internal
 */
export type NameMapper = {
  map(name: string, mappedName?: string): string;
  get(): { [mappedName: string]: string } | undefined;
};

/**
 * @internal
 *
 * Create a mapper for generating `ExpressionAttributeNames`
 * entries. [[map]] will generate a new attribute name
 * that can be used in expressions for every attribute it
 * is given.
 *
 * The value for `ExpressionAttributeNames` can be
 * returned by [[get]] at the end.
 */
export const createNameMapper = (): NameMapper => {
  let currentIndex = 0;
  const attributeNameMap = new Map<string, string>();

  return {
    /**
     * Generate an expression attribute name for
     * `name` (if necessary - values not requiring
     * escaping will be returned as-is)
     */
    map(name: string, mappedName?: string): string {
      if (!mappedName && isSafeAttributeName(name)) {
        return name;
      }
      let nameMapping = attributeNameMap.get(name);
      if (!nameMapping) {
        nameMapping = mappedName ?? `#attr${currentIndex++}`;
        attributeNameMap.set(name, nameMapping);
      }
      return nameMapping;
    },

    /**
     * Return the map of attribute names
     */
    get(): Record<string, string> | undefined {
      const result = invertMap(attributeNameMap);
      if (Object.keys(result).length === 0) return undefined;
      return result;
    },
  };
};

/**
 * @internal
 */
export type ValueMapper = {
  map(value: any): string;
  get(): { [mappedName: string]: AttributeValue } | undefined;
};

/**
 * @internal
 *
 * Create a mapper for generating `ExpressionAttributeValues`
 * entries. [[map]] will generate a new attribute name
 * that can be used in expressions for every attribute it
 * is given.
 *
 * The value for `ExpressionAttributeValues` can be
 * returned by [[get]] at the end.
 */
export const createValueMapper = (): ValueMapper => {
  let currentIndex = 0;
  const valueMap = new Map<string, AttributeValue>();

  return {
    /**
     * Given `value`, marshall it to DynamoDB format, store
     * it internally, and return the `:value` reference that
     * can be used in expressions
     */
    map(value: any): string {
      const valueKey = `:value${currentIndex++}`;
      const convertedValue = Converter.input(value);
      valueMap.set(valueKey, convertedValue);
      return valueKey;
    },

    /**
     * Get the map for `ExpressionAttributeValues`
     */
    get(): { [key: string]: AttributeValue } | undefined {
      if (valueMap.size === 0) return undefined;
      return Array.from(valueMap).reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {} as { [key: string]: AttributeValue });
    },
  };
};
