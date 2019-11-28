import { CollectionLayout } from "../layout";
import { buildAndValidateAccessPatterns } from "./extract_keys";
import { Collection } from "../collection";

describe('buildAndValidateAccessPatterns', () => {
  const partitionKeyName = 'identifier';
  const sortKeyName = 'collectionReference';
  const basicLayout: CollectionLayout = {
    tableName: 'table1',
    primaryKey: { partitionKey: partitionKeyName, sortKey: sortKeyName },
  };

  const multiIndexLayout: CollectionLayout = {
    ...basicLayout,
    findKeys: [
      { indexName: 'index1', partitionKey: 'partkey1' },
      { indexName: 'index2', partitionKey: 'partkey2', sortKey: 'sortkey2' },
      { indexName: 'index3', partitionKey: 'partkey3', sortKey: 'sortkey3' },
    ],
  };

  test('produces correct results when there is no access patterns', () => {
    const collection = {
      name: 'users',
      layout: basicLayout,
    };
    expect(buildAndValidateAccessPatterns(collection)).toEqual([]);
  });

  test('throws when an index has already been used', () => {
    const collection: Collection = {
      name: 'staff',
      layout: multiIndexLayout,
      accessPatterns: [
        { indexName: 'index1', partitionKeys: [['email']] },
        { indexName: 'index1', partitionKeys: [['department']] },
      ],
    };
    expect(() => buildAndValidateAccessPatterns(collection)).toThrowError(/refers to index in use by another pattern/);
  });

  test('throws when an non-existent index is referenced', () => {
    const collection: Collection = {
      name: 'staff',
      layout: multiIndexLayout,
      accessPatterns: [
        { indexName: 'index1', partitionKeys: [['email']] },
        { indexName: 'index50', partitionKeys: [['department']] },
      ],
    };
    expect(() => buildAndValidateAccessPatterns(collection)).toThrowError(/refers to index missing from layout/);
  });

  test('throws when an access pattern defines sort keys but the referenced index does not', () => {
    const collection: Collection = {
      name: 'staff',
      layout: multiIndexLayout,
      accessPatterns: [
        { indexName: 'index1', partitionKeys: [['department']], sortKeys: [['discipline']] },
        { indexName: 'index2', partitionKeys: [['email']] },
      ],
    };
    expect(() => buildAndValidateAccessPatterns(collection)).toThrowError(/has sort keys but index .+ does not/);
  });

  test('throws when an access pattern has no sort keys but the referenced index defines a sort key', () => {
    const collection: Collection = {
      name: 'staff',
      layout: multiIndexLayout,
      accessPatterns: [
        { indexName: 'index2', partitionKeys: [['email']] },
      ],
    };
    expect(() => buildAndValidateAccessPatterns(collection)).toThrowError(/access pattern .+ does not have sort keys but index/);
  });

  test('builds extract keys properly from a correcty defined set of access patterns', () => {
    const collection: Collection = {
      name: 'staff',
      layout: multiIndexLayout,
      accessPatterns: [
        { indexName: 'index1', partitionKeys: [['email']] },
        { indexName: 'index2', partitionKeys: [['department']], sortKeys: [['discipline']] },
      ],
    };

    expect(buildAndValidateAccessPatterns(collection)).toEqual([
      { type: 'partition', key: 'partkey1', valuePaths: [['email']], options: {} },
      { type: 'partition', key: 'partkey2', valuePaths: [['department']], options: {} },
      { type: 'sort', key: 'sortkey2', valuePaths: [['discipline']], options: {} },
    ]);
  })
});