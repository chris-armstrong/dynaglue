import { DynamoDB } from 'aws-sdk';
import { Collection, createContext, insert, findById, find, deleteById, replaceById } from '../../dist';

const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const REGION = process.env.REGION || 'fake';

/**
 *  in order to use this layout, you will need to start up DynamoDB local
 *  and provision the table
 *
 *  docker run -p 8000:8000 amazon/dynamodb-local
 *
 *
  aws dynamodb create-table \
     --endpoint-url http://localhost:8000 \
     --table-name global \
     --attribute-definitions AttributeName=id,AttributeType=S AttributeName=collection,AttributeType=S \
       AttributeName=gs2p,AttributeType=S AttributeName=gs2s,AttributeType=S \
       AttributeName=gs3p,AttributeType=S AttributeName=gs3s,AttributeType=S \
     --key-schema KeyType=HASH,AttributeName=id KeyType=SORT,AttributeName=collection \
     --billing-mode PAY_PER_REQUEST \
     --global-secondary-indexes 'IndexName=gs1,KeySchema=[{KeyType="HASH",AttributeName=collection},{KeyType=SORT,AttributeName=id}],Projection={ProjectionType=ALL}' \
       'IndexName=gs2,KeySchema=[{KeyType="HASH",AttributeName="gs2p"},{KeyType=SORT,AttributeName=gs2s}],Projection={ProjectionType=ALL}' \
       'IndexName=gs3,KeySchema=[{KeyType="HASH",AttributeName="gs3p"},{KeyType=SORT,AttributeName=gs3s}],Projection={ProjectionType=ALL}'
 */

const globalTableLayout = {
  tableName: 'global',
  primaryKey: {
    partitionKey: 'id',
    sortKey: 'collection',
  },
  findKeys: [
    {
      indexName: 'gs2',
      partitionKey: 'gs2p',
      sortKey: 'gs2s',
    },
    {
      indexName: 'gs3',
      partitionKey: 'gs3p',
      sortKey: 'gs3s',
    },
  ],
};

const usersCollection: Collection = {
  name: 'users',
  layout: globalTableLayout,
  accessPatterns: [
    { indexName: 'gs2', partitionKeys: [], sortKeys: [['email']] },
    { indexName: 'gs3', partitionKeys: [['team', 'id']], sortKeys: [['team', 'employeeCode']] }
  ]
};

const postsCollection: Collection = {
  name: 'posts',
  layout: globalTableLayout,
  accessPatterns: [
    { indexName: 'gs2', partitionKeys: [['userId']], sortKeys: [] },
  ]
}

async function main() {
  const ddb = new DynamoDB({ endpoint: DYNAMODB_ENDPOINT, region: REGION });
  const ctx = createContext(ddb, [usersCollection, postsCollection]);

  console.log(`Connecting at endpoint ${ddb.endpoint.href}`);
  const tables = await ddb.listTables().promise();
  console.log('tables: ', tables.TableNames);

  const user1 = await insert(ctx, 'users', {
    name: 'Anayah Dyer',
    email: 'anayahd@example.com',
    team: { id: 'team-code-1', employeeCode: 'AC-1' },
  });
  const user2 = await insert(ctx, 'users', {
    name: 'Ruairidh Hughes',
    email: 'ruairidhh@example.com',
    team: { id: 'team-code-1', employeeCode: 'AC-2' },
  });
  const user3 = await insert(ctx, 'users', {
    name: 'Giles Major',
    email: 'giles@example.com',
    team: { id: 'team-code-2', employeeCode: 'GT-5' },
  });
  const user4 = await insert(ctx, 'users', {
    name: 'Lance Alles',
    email: 'lance@example.com',
    team: { id: 'team-code-2', employeeCode: 'GT-6' },
  });

  console.log('inserted users', [user1, user2, user3, user4]);

  const post1 = await insert(ctx, 'posts', {
    userId: user1._id,
    title: 'How to cook an apple pie'
  });

  const post2 = await insert(ctx, 'posts', {
    userId: user1._id,
    title: 'Cooking for a dinner party'
  });

  const post3 = await insert(ctx, 'posts', {
    userId: user2._id,
    title: 'My first blog post',
  });

  console.log('inserted posts', [post1, post2, post3]);

  const foundUser2 = await findById(ctx, 'users', user2._id);
  const notFoundUser4 = await findById(ctx, 'users', 'not-found-id');

  console.log('user 2', foundUser2);
  console.log('non-existent user 4', notFoundUser4);

  const postsByUser1 = await find(ctx, 'posts', { userId: user1._id });
  console.log('posts by user 1', postsByUser1.items);

  const deletedItem = await deleteById(ctx, 'posts', post2._id);
  console.log('deleted post #2', deletedItem);

  const updatedPost = await replaceById(ctx, 'posts', {
    ...post3,
    title: 'Updated first post',
  });
  console.log('updated post #3', updatedPost);

  console.log('posts by user 2', await find(ctx, 'posts', { userId: user2._id }));

  const emailSearch = await find(ctx, 'users', { email: 'anayah' });
  console.log('email search results', emailSearch);

  // Find all users in a team (access pattern 2)
  const usersInTeam2 = await find(ctx, 'users', { 'team.id': 'team-code-2' });
  console.log('team 2 users', usersInTeam2);

  // Find user by teamId and employeeCode (access pattern 2)
  const userByEmployeeCode = await find(ctx, 'users', { 'team.id': 'team-code-1', 'team.employeeCode': 'AC-2' });
  console.log('user by employee code', userByEmployeeCode);
}

main()
  .catch(err => console.error('error during execution', err));
