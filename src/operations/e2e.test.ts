import { startDb, stopDb, createTables } from 'jest-dynalite';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import type { RootCollection } from '../base/collection';
import { CollectionLayout } from '../base/layout';
import { createContext } from '../context';
import { insert } from '../operations/insert';
import { updateById } from '../operations/update_by_id';
import { find } from '../operations/find';

describe('E2E tests', () => {
  beforeAll(startDb, 10000);
  beforeAll(createTables);
  afterAll(stopDb, 5000);

  const createDynamoDB = (): DynamoDBClient =>
    new DynamoDBClient({
      endpoint: process.env.MOCK_DYNAMODB_ENDPOINT,
      region: 'local',
    });

  const layout: CollectionLayout = {
    tableName: 'general',
    primaryKey: {
      partitionKey: 'pk',
      sortKey: 'sk',
    },
    findKeys: [
      { indexName: 'gsi1', partitionKey: 'gpk1', sortKey: 'gsk1' },
      { indexName: 'gsi2', partitionKey: 'gpk2', sortKey: 'gsk2' },
      { indexName: 'gsi3', partitionKey: 'gpk3', sortKey: 'gsk3' },
      { indexName: 'gsi4', partitionKey: 'gpk4', sortKey: 'gsk4' },
    ],
  };

  const staffDefinition: RootCollection = {
    name: 'staff',
    layout,
    accessPatterns: [
      {
        indexName: 'gsi1',
        partitionKeys: [['name']],
        sortKeys: [],
        options: { stringNormalizer: (_, value) => value.toLowerCase() },
      },
      {
        indexName: 'gsi2',
        partitionKeys: [['profile', 'email']],
        sortKeys: [['profile', 'email']],
        options: { stringNormalizer: (_, value) => value.toLowerCase() },
      },
      {
        indexName: 'gsi3',
        partitionKeys: [['profile', 'departmentNumber']],
        sortKeys: [['name']],
      },
      {
        indexName: 'gsi4',
        partitionKeys: [],
        sortKeys: [['updatedAt']],
      },
    ],
  };

  it('should sparse update correctly', async () => {
    const dynamodb = createDynamoDB();
    const staffOriginal = {
      name: 'test',
      profile: { email: 'test@EXAMPLE.COM', departmentNumber: '1' },
    };
    const context = createContext(dynamodb, [staffDefinition]);
    const inserted = await insert(context, 'staff', staffOriginal);

    const findNameResults = await find(context, 'staff', { name: 'test' });
    expect(findNameResults.items?.[0]).toEqual(inserted);
    const findByEmailResults = await find(context, 'staff', {
      'profile.email': 'test@example.com',
    });
    expect(findByEmailResults.items?.[0]).toEqual(inserted);

    const updated = await updateById(context, 'staff', inserted._id, {
      name: 'other name',
      profile: {},
    });
    const findNameResults2 = await find(context, 'staff', {
      name: 'other name',
    });
    expect(findNameResults2.items?.[0]).toEqual(updated);
    const findByEmailResults2 = await find(context, 'staff', {
      'profile.email': 'test@example.com',
    });
    expect(findByEmailResults2.items?.[0]).toBeUndefined();
  });

  it('should allow search on a duplicated index key path', async () => {
    const dynamodb = createDynamoDB();
    const staff1 = {
      name: 'test',
      profile: { email: 'test@example.com', departmentNumber: '1' },
    };
    const staff2 = {
      name: 'test2',
      profile: { email: 'test2@example.com', departmentNumber: '1' },
    };
    const staff3 = { name: 'test3', profile: { departmentNumber: '2' } };
    const context = createContext(dynamodb, [staffDefinition]);
    const inserted1 = await insert(context, 'staff', staff1);
    const inserted2 = await insert(context, 'staff', staff2);
    await insert(context, 'staff', staff3);

    const byDepartment1 = await find(context, 'staff', {
      'profile.departmentNumber': '1',
    });
    expect(byDepartment1.items[0]).toEqual(inserted1);
    expect(byDepartment1.items[1]).toEqual(inserted2);
    expect(byDepartment1.items[2]).toBeUndefined();

    const { items } = await find(context, 'staff', {
      'profile.email': 'test2@example.com',
    });
    expect(items).toHaveLength(1);
    expect(items[0]._id).toEqual(inserted2._id);
  });

  it('should find with the BETWEEN operator correctly', async () => {
    const dynamodb = createDynamoDB();
    const staff1 = {
      name: 'test',
      updatedAt: '2021-01-21T01',
    };
    const staff2 = {
      name: 'test2',
      updatedAt: '2021-01-20T00',
    };
    const staff3 = {
      name: 'test3',
      updatedAt: '2021-01-21T00',
    };
    const staff4 = {
      name: 'test4',
      updatedAt: '2021-01-23T01',
    };
    const staff5 = {
      name: 'test5',
      updatedAt: '2021-01-22T03',
    };

    const ctx = createContext(dynamodb, [staffDefinition]);
    await Promise.all([
      insert(ctx, 'staff', staff1),
      insert(ctx, 'staff', staff2),
      insert(ctx, 'staff', staff3),
      insert(ctx, 'staff', staff4),
      insert(ctx, 'staff', staff5),
    ]);
    const { items } = await find(
      ctx,
      'staff',
      {
        updatedAt: ['2021-01-21T00', '2021-01-23T00'],
      },
      undefined,
      { queryOperator: 'between' }
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveProperty('name', 'test3');
    expect(items[2]).toHaveProperty('name', 'test5');
  });
});
