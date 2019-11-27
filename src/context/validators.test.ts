import { validateListAllKey, validateFindKeys } from './validators';
import { ConfigurationException } from '../exceptions';

test('validateListAllKey checks partitionKey equals primary sort key', () => {
  const listAllKey = { indexName: 'gs1', partitionKey: 'not_value', sortKey: 'id' };
  const primaryKey = { partitionKey: 'id', sortKey: 'value' };
  expect(() => validateListAllKey(listAllKey, primaryKey)).toThrow(ConfigurationException);
});

test('validateListAllKey checks sortKey equals primary partition key', () => {
  const listAllKey = { indexName: 'gs1', partitionKey: 'value', sortKey: 'not_id' };
  const primaryKey = { partitionKey: 'id', sortKey: 'value' };
  expect(() => validateListAllKey(listAllKey, primaryKey)).toThrow(ConfigurationException);
});

test('validateListAllKey passes on valid configuration', () => {
  const listAllKey = { indexName: 'gs1', partitionKey: 'value', sortKey: 'id' };
  const primaryKey = { partitionKey: 'id', sortKey: 'value' };
  expect(() => validateListAllKey(listAllKey, primaryKey)).not.toThrow(ConfigurationException);
});

test('validateFindKeys throws on already used indexes', () => {
  const findKeys = [
    { indexName: 'testi1', partitionKey: 'key1', sortKey: 'sort1' },
    { indexName: 'testi1', partitionKey: 'key1', sortKey: 'sort1' },
  ];

  expect(() => validateFindKeys(findKeys)).toThrow(ConfigurationException);
});

test('validateFindKeys passes on valid index configuration', () => {
  const findKeys = [
    { indexName: 'testi1', partitionKey: 'key1', sortKey: 'sort1' },
    { indexName: 'testi2', partitionKey: 'key2', sortKey: 'sort2' },
  ];

  expect(() => validateFindKeys(findKeys)).not.toThrow(ConfigurationException);
});
