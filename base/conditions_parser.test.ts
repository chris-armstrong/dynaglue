import { parseConditionClause } from './conditions_parser';
import { createNameMapper, createValueMapper } from './mappers';

describe('parseConditionClause', () => {
  const nc = () => ({ nameMapper: createNameMapper(), valueMapper: createValueMapper(), parsePath: [] });
  
  describe('operators', () => {

    it('should handle $eq', () => {
      const context = nc();
      const expression = parseConditionClause({ 'x.y': { $eq: 4 } }, context);
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
      const expression = parseConditionClause({ 'x.y': { $neq: 4 } }, context);
      expect(expression).toEqual('#value.x.y <> :value0');
    });
  });

  describe('key paths', () => {
    it('should AND multiple key paths in the same object', () => {
      const context = nc();
      const expression = parseConditionClause({ 'x.y': { $neq: 4 }, 'myvalue': { $eq: 'a value' } }, context);
      expect(expression).toEqual('#value.x.y <> :value0 AND #value.myvalue = :value1');
    });
  })
});
