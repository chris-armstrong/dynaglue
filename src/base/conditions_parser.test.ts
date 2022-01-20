import {
  parseCompositeCondition,
  InvalidCompositeConditionException,
} from './conditions_parser';
import { createNameMapper, createValueMapper } from './mappers';
import { BetweenCondition, KeyPathsAndClause } from './conditions';
import { ConditionParseContext } from './conditions_types';

describe('parseCompositeCondition', () => {
  const nc = (): ConditionParseContext => ({
    nameMapper: createNameMapper(),
    valueMapper: createValueMapper(),
    parsePath: [],
  }); // eslint-ignore @typescript-eslint/explicit-function-return-type

  describe('operators', () => {
    it('should handle $eq', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $eq: 4 } },
        context
      );
      expect(expression).toEqual('#value.x.y = :value0');
      expect(context.valueMapper.get()).toEqual({
        ':value0': { N: '4' },
      });
      expect(context.nameMapper.get()).toEqual({
        '#value': 'value',
      });
    });

    it('should handle $neq', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $neq: 4 } },
        context
      );
      expect(expression).toEqual('#value.x.y <> :value0');
    });

    it('should handle $lt', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $lt: 4 } },
        context
      );
      expect(expression).toEqual('#value.x.y < :value0');
    });

    it('should handle $lte', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $lte: 4 } },
        context
      );
      expect(expression).toEqual('#value.x.y <= :value0');
    });

    it('should handle $gt', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $gt: 4 } },
        context
      );
      expect(expression).toEqual('#value.x.y > :value0');
    });

    it('should handle $gte', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $gte: 4 } },
        context
      );
      expect(expression).toEqual('#value.x.y >= :value0');
    });

    it('should handle $between', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $between: { $gte: 2, $lte: 10.2 } } },
        context
      );
      expect(expression).toEqual('#value.x.y BETWEEN :value0 AND :value1');
    });

    it('should throw on an invalid $between value', () => {
      const context = nc();
      expect(() =>
        parseCompositeCondition({ x: { $between: null } }, context)
      ).toThrowError(InvalidCompositeConditionException);
      expect(() =>
        parseCompositeCondition(
          { x: { $between: {} } as BetweenCondition },
          context
        )
      ).toThrowError(InvalidCompositeConditionException);
      expect(() =>
        parseCompositeCondition(
          { x: { $between: { $gte: 1 } } as BetweenCondition },
          context
        )
      ).toThrowError(InvalidCompositeConditionException);
      expect(() =>
        parseCompositeCondition(
          { x: { $between: { $lte: 1 } } as BetweenCondition },
          context
        )
      ).toThrowError(InvalidCompositeConditionException);
    });

    it('should handle $in', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $in: [4, 5, 6] } },
        context
      );
      expect(expression).toEqual('#value.x.y IN (:value0,:value1,:value2)');
    });

    it('should throw when a $in operator has 0 arguments', () => {
      const context = nc();
      expect(() =>
        parseCompositeCondition({ x: { $in: [] } }, context)
      ).toThrow(InvalidCompositeConditionException);
    });

    it('should throw when a $in operator has more than 100 arguments', () => {
      const context = nc();
      expect(() =>
        parseCompositeCondition(
          { x: { $in: new Array(101).fill(null).map((_, index) => index) } },
          context
        )
      ).toThrow(InvalidCompositeConditionException);
    });

    it('should on an invalid $in value', () => {
      expect(() =>
        parseCompositeCondition({ x: { $in: null } }, nc())
      ).toThrowError(InvalidCompositeConditionException);
    });
  });

  describe('functions', () => {
    it('should handle $exists true', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { y: { $exists: true } },
        context
      );
      expect(expression).toEqual('attribute_exists(#value.y)');
    });

    it('should handle $exists false', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { y: { $exists: false } },
        context
      );
      expect(expression).toEqual('attribute_not_exists(#value.y)');
    });

    it('should handle $contains', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { $yes: { $contains: 'a string' } },
        context
      );
      expect(expression).toEqual('contains(#value.#attr0,:value0)');
    });

    it('should handle $beginsWith', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'profile.user': { $beginsWith: 'example_1' } },
        context
      );
      expect(expression).toEqual('begins_with(#value.profile.#attr0,:value0)');
    });

    it('should handle $type', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'profile.user': { $type: 'S' } },
        context
      );
      expect(expression).toEqual(
        'attribute_type(#value.profile.#attr0,:value0)'
      );
    });
  });

  describe('key paths', () => {
    it('should AND multiple key paths in the same object', () => {
      const context = nc();
      const expression = parseCompositeCondition(
        { 'x.y': { $neq: 4 }, myvalue: { $eq: 'a value' } },
        context
      );
      expect(expression).toEqual(
        '#value.x.y <> :value0 AND #value.myvalue = :value1'
      );
    });

    it('should throw an exception when one of the key paths is an operator', () => {
      const context = nc();
      expect(() =>
        parseCompositeCondition(
          { x: { $eq: 4 }, $or: [{ y: { $gt: 4 } }] },
          context
        )
      ).toThrow(InvalidCompositeConditionException);
      expect(() =>
        parseCompositeCondition(
          { x: { $eq: 4 }, $gt: 4 } as unknown as KeyPathsAndClause,
          context
        )
      ).toThrow(InvalidCompositeConditionException);
    });
  });

  it('should handle AND correctly', () => {
    const context = nc();
    const expression = {
      $and: [
        { x: { $eq: true }, y: { $gt: 7 } },
        { username: { $beginsWith: 'example1' } },
      ],
    };
    expect(parseCompositeCondition(expression, context)).toEqual(
      '(#value.x = :value0 AND #value.y > :value1) AND (begins_with(#value.username,:value2))'
    );
  });

  it('should handle OR correctly', () => {
    const context = nc();
    const expression = {
      $or: [
        { username: { $beginsWith: 'example1' } },
        { x: { $eq: true }, y: { $gt: 7 } },
      ],
    };
    expect(parseCompositeCondition(expression, context)).toEqual(
      '(begins_with(#value.username,:value0)) OR (#value.x = :value1 AND #value.y > :value2)'
    );
  });

  it('should handle NOT correctly', () => {
    const context = nc();
    const expression = {
      $not: { username: { $beginsWith: 'example1' } },
    };
    expect(parseCompositeCondition(expression, context)).toEqual(
      'NOT begins_with(#value.username,:value0)'
    );
  });

  it('should handle combined OR and AND and NOT correctly', () => {
    const context = nc();
    const expression = {
      $and: [
        { $or: [{ 'point.x': { $lt: 0 } }, { 'point.y': { $lt: 0 } }] },
        { $not: { range: { $gte: 1.0 } } },
      ],
    };
    expect(parseCompositeCondition(expression, context)).toBe(
      '((#value.point.x < :value0) OR (#value.point.y < :value1)) AND (NOT #value.#attr0 >= :value2)'
    );
  });
});
