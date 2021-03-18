import DynamoDB from 'aws-sdk/clients/dynamodb';
import { startDb, stopDb, createTables } from 'jest-dynalite';

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

  const createDynamoDB = (): DynamoDB =>
    new DynamoDB({
      endpoint: process.env.MOCK_DYNAMODB_ENDPOINT,
      sslEnabled: false,
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
    ],
  };

  it('should sparse update correctly', async () => {
    const dynamodb = createDynamoDB();
    const staffOriginal =  { name: 'test', profile: { email: 'test@example.com', departmentNumber: '1' } };
    const context = createContext(dynamodb, [staffDefinition]);
    const inserted = await insert(context, 'staff', staffOriginal);

    await updateById(context, 'staff', inserted._id, {
      profile: { },
    });
  });

  it('should allow search on a duplicated index key path', async () => {
    const dynamodb = createDynamoDB();
    const staff1 =  { name: 'test', profile: { email: 'test@example.com', departmentNumber: '1' } };
    const staff2 =  { name: 'test2', profile: { email: 'test2@example.com', departmentNumber: '1' } };
    const staff3 =  { name: 'test3', profile: {} };
    const context = createContext(dynamodb, [staffDefinition]);
    await insert(context, 'staff', staff1);
    const inserted2 = await insert(context, 'staff', staff2);
    await insert(context, 'staff', staff3);

    const { items } = await find(context, 'staff', { 'profile.email': 'test2@example.com' });
    expect(items).toHaveLength(1);
    expect(items[0]._id).toEqual(inserted2._id);
  });
});
