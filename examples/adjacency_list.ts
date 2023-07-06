import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  createContext,
  insert,
  findById,
  find,
  findByIdWithChildren,
} from '../src';
import { ChildCollection, RootCollection } from '../src';

const DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

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

// The collection names are prefixed to specifically
// order the objects in the child collections (see below).
const USERS_COLLECTION = '1users';
const CREDENTIALS_COLLECTION = '0credentials';
const ADDRESSES_COLLECTION = '2addresses';

const usersCollection: RootCollection = {
  name: USERS_COLLECTION,
  layout: globalTableLayout,
};

const credentialsCollection: ChildCollection = {
  type: 'child',
  name: CREDENTIALS_COLLECTION,
  parentCollectionName: USERS_COLLECTION,
  layout: globalTableLayout,
  foreignKeyPath: ['userId'],
  accessPatterns: [
    { indexName: 'gs2', partitionKeys: [['userId']], sortKeys: [['type']] }, // get credential by userId and type
  ],
};

const addressesCollection: ChildCollection = {
  name: ADDRESSES_COLLECTION,
  type: 'child',
  layout: globalTableLayout,
  foreignKeyPath: ['userId'],
  parentCollectionName: USERS_COLLECTION,
};

async function main(): Promise<void> {
  const ddb = new DynamoDBClient({
    endpoint: DYNAMODB_ENDPOINT,
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  });
  const ctx = createContext(ddb, [
    usersCollection,
    credentialsCollection,
    addressesCollection,
  ]);

  // ** Our example contains three access patterns: **
  // 1. Get a user by ID
  // 2. Get a user's credential by ID and type
  // 3. Get a user with their addresses objects
  // 4. Get a user with their credentials objects
  //
  // This example demonstrates how we retrieve the latter two using `findByIdWithChildren`

  const user1 = await insert(ctx, USERS_COLLECTION, {
    type: 'administrator',
    group: 'red',
    name: 'Joyce Mannheim',
  });
  console.log('created user 1', user1);
  const address1 = await insert(ctx, ADDRESSES_COLLECTION, {
    userId: user1._id,
    type: 'home',
    line1: '10 Home Place',
    suburb: 'HomeTown',
  });
  const address2 = await insert(ctx, ADDRESSES_COLLECTION, {
    userId: user1._id,
    type: 'work',
    line1: '78 Work Close',
    suburb: 'CityVillage',
  });
  const credentials1 = await insert(ctx, CREDENTIALS_COLLECTION, {
    userId: user1._id,
    type: 'password',
    password: 'testpassword',
  });
  const credentials2 = await insert(ctx, CREDENTIALS_COLLECTION, {
    userId: user1._id,
    type: 'google',
    googleUser: 'joyce.mannheim@gmail.com',
  });

  const user2 = await insert(ctx, USERS_COLLECTION, {
    type: 'guest',
    group: 'blue',
    name: 'Bill Langham',
  });
  console.log('created user 2', user2);
  const address3 = await insert(ctx, ADDRESSES_COLLECTION, {
    userId: user2._id,
    type: 'home',
    line1: '62 Local St',
    suburb: 'Daceyville',
  });
  const credentials3 = await insert(ctx, CREDENTIALS_COLLECTION, {
    userId: user2._id,
    type: 'password',
    password: '12345',
  });
  const credentials4 = await insert(ctx, CREDENTIALS_COLLECTION, {
    userId: user2._id,
    type: 'google',
    googleUser: 'billham@gmail.com',
  });

  // 1. Get a user by ID
  console.log('user 1', await findById(ctx, USERS_COLLECTION, user1._id));

  // 2. Get a user's credential by ID and type
  console.log(
    'user 2 password',
    await find(ctx, CREDENTIALS_COLLECTION, {
      userId: user2._id,
      type: 'password',
    })
  );

  // In the next two examples, we use the adjacency list to get the user and the child objects
  // in the same result. To ensure the user object comes first in both cases if there is pagination,
  // we have deliberately named the collections so the `users` object is ordered between the `addresses`
  // and `credentials` objects. We then control the index scan direction accordingly.

  // 3. Get a user with their addresses objects
  const result1 = await findByIdWithChildren(
    ctx,
    USERS_COLLECTION,
    user1._id,
    [ADDRESSES_COLLECTION],
    undefined,
    {
      scanForward: true,
    }
  ); // scan forward to get user object first
  console.log(
    'user1 addresses',
    (result1.root as any)?.name,
    result1.children?.[ADDRESSES_COLLECTION],
    JSON.stringify(result1)
  );

  // 4. Get a user with their credentials objects
  const result2 = await findByIdWithChildren(
    ctx,
    USERS_COLLECTION,
    user2._id,
    [CREDENTIALS_COLLECTION],
    undefined,
    {
      scanForward: false,
    }
  ); // scan backward to get user object first
  console.log(
    'user2 credentials',
    (result2.root as any).name,
    result2.children?.[CREDENTIALS_COLLECTION],
    JSON.stringify(result2)
  );
}

main().catch((error) => console.error('error', error));
