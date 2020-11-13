import { NameMapper, ValueMapper } from './mappers';

/**
 * @internal
 *
 * An element in the expression parse tree, used
 * to assist error messaging.
 */
export type ParseElement =
  | { type: 'array'; index: number }
  | { type: 'object'; key: string };

/**
 * @internal
 *
 * A context object passed between
 * parse functions to track value and name
 * mapping and current parse context.
 */
export type ConditionParseContext = {
  nameMapper: NameMapper;
  valueMapper: ValueMapper;
  parsePath: ParseElement[];
};
