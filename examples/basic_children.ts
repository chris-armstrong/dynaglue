import { DynamoDB } from 'aws-sdk';
import { Collection, createContext, insert, find, findChildren, findChildById, deleteChildById, updateById } from '../dist';
import { ChildCollection, RootCollection } from '../dist/base/collection';

const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

/**
 *  in order to use this layout, you will need to start up DynamoDB local
 *  and provision the table
 *
 *  docker run -p 8000:8000 amazon/dynamodb-local
 *
 *  aws dynamodb create-table \
 *    --endpoint-url http://localhost:8000 \
 *    --table-name global \
 *    --attribute-definitions AttributeName=id,AttributeType=S AttributeName=collection,AttributeType=S \
 *      AttributeName=gs2p,AttributeType=S AttributeName=gs2s,AttributeType=S \
 *      AttributeName=gs3p,AttributeType=S AttributeName=gs3s,AttributeType=S \
 *    --key-schema KeyType=HASH,AttributeName=id KeyType=SORT,AttributeName=collection \
 *    --billing-mode PAY_PER_REQUEST \
 *    --global-secondary-indexes 'IndexName=gs1,KeySchema=[{KeyType="HASH",AttributeName=collection},{KeyType=SORT,AttributeName=id}],Projection={ProjectionType=ALL}' \
 *      'IndexName=gs2,KeySchema=[{KeyType="HASH",AttributeName="gs2p"},{KeyType=SORT,AttributeName=gs2s}],Projection={ProjectionType=ALL}' \
 *      'IndexName=gs3,KeySchema=[{KeyType="HASH",AttributeName="gs3p"},{KeyType=SORT,AttributeName=gs3s}],Projection={ProjectionType=ALL}'
 */

const globalTableLayout = {
  tableName: 'global',
  primaryKey: {
    partitionKey: 'id',
    sortKey: 'collection',
  },
  findKeys: [
    { indexName: 'gs2', partitionKey: 'gs2p', sortKey: 'gs2s' },
    { indexName: 'gs3', partitionKey: 'gs3p', sortKey: 'gs3s' },
  ],
};

const usersCollection: RootCollection = {
  name: 'users',
  layout: globalTableLayout,
  accessPatterns: [
    { indexName: 'gs2', partitionKeys: [['group'], ['type']], sortKeys: [['name']] },
  ]
};

const addressesCollection: ChildCollection = {
  name: 'addresses',
  type: 'child',
  layout: globalTableLayout,
  foreignKeyPath: ['userId'],
  parentCollectionName: 'users',
};

async function main(): Promise<void> {
  const ddb = new DynamoDB({
    endpoint: DYNAMODB_ENDPOINT,
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  });
  const ctx = createContext(ddb, [usersCollection, addressesCollection]);

  const user1 = await insert(ctx, 'users', { type: 'administrator', group: 'red', name: 'Joyce Mannheim' });
  console.log('created user 1', user1);
  const address1 = await insert(ctx, 'addresses', { userId: user1._id, type: 'home', line1: '10 Home Place', suburb: 'HomeTown' });
  const address2 = await insert(ctx, 'addresses', { userId: user1._id, type: 'work', line1: '78 Work Close', suburb: 'CityVillage' });

  const user2 = await insert(ctx, 'users', { type: 'guest', group: 'blue', name: 'Bill Langham' });
  console.log('created user 2', user2);
  const address3 = await insert(ctx, 'addresses', { userId: user2._id, type: 'home', line1: '62 Local St', suburb: 'Daceyville' });

  console.log('all addresses for for user 1', await findChildren(ctx, 'addresses', user1._id));
  console.log('all addresses for for user 2', await findChildren(ctx, 'addresses', user2._id));

  console.log('address 2 retrieved', await findChildById(ctx, 'addresses', address2._id, user1._id));

  const deleteAddress1 = await deleteChildById(ctx, 'addresses', address1._id, user1._id);
  console.log('deleted address 1', deleteAddress1);

  const newObject = await updateById(ctx, 'users', user1._id, { name: 'James Mannheim', password: 'test-password', group: 'red', type: 'blue' });
  console.log('updated user 1', newObject);
}

main().catch(error => console.error('error', error));