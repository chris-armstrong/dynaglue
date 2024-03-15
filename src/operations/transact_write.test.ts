import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import debug from 'debug';
import objectHash from 'object-hash';
import {
  IdempotentParameterMismatchException,
  TransactionValidationException,
} from '../base/exceptions';
import { CollectionLayout } from '../base/layout';
import { Context, createContext } from '../context';
import { replace } from './replace';
import {
  TransactFindByIdDescriptor,
  transactFindByIds,
} from './transact_find_by_ids';
import { TransactionWriteRequest, transactionWrite } from './transact_write';
import LocalDDBTestKit from '../../testutil/local_dynamo_db';
import { DebugTestsNamespace } from '../../testutil/debug_tests';
import { Collection } from '../base/collection';

const TableDefinitions = [
  {
    TableName: 'User',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
  },
];

const layout: CollectionLayout = {
  tableName: 'User',
  primaryKey: { partitionKey: 'pk', sortKey: 'sk' },
};

const collection: Collection = {
  name: 'users',
  layout,
};

const childCollection: Collection = {
  name: 'users-meta',
  type: 'child',
  layout,
  foreignKeyPath: ['userId'],
  parentCollectionName: 'users',
};

describe('transactions', () => {
  let localDDBClient: DynamoDBClient;
  const hasLocalDBEndpoint = !!process.env.LOCAL_DYNAMODB_ENDPOINT;

  /**
   * create a client with Local DDB, if Local-DDB-Endpoint is provided
   */
  beforeAll(async () => {
    // Enable Debug mode while running test based on namespace
    debug.enable(DebugTestsNamespace);

    if (hasLocalDBEndpoint) {
      localDDBClient = LocalDDBTestKit.connect() as unknown as DynamoDBClient;
    }
  });

  /* create tables */
  beforeAll(async () => {
    if (hasLocalDBEndpoint) {
      await LocalDDBTestKit.createTables(localDDBClient, TableDefinitions);
    }
  });

  /*  Delete tables */
  afterAll(async () => {
    if (hasLocalDBEndpoint) {
      await LocalDDBTestKit.deleteTables(localDDBClient, [
        TableDefinitions[0].TableName,
      ]);
    }

    // Disable Debug mode after running all tests
    debug.disable();
  });

  const describeIfCondition = hasLocalDBEndpoint ? describe : describe.skip;

  describeIfCondition('write transactions', () => {
    let context: Context;

    // initialize the context
    beforeAll(() => {
      context = createContext(localDDBClient as unknown as DynamoDBClient, [
        collection,
        childCollection,
      ]);
    });

    // Insert Root Documents
    test.each([
      { _id: 'test-id', name: 'Moriarty', email: 'moriarty@jim.com' },
      {
        _id: 'test-sh',
        name: 'Sherlock',
        email: 'sh@sh.com',
      },
    ])('Insert items to the collection using replace', async (value) => {
      const result = await replace(context, collection.name, value, {
        condition: { _id: { $exists: false } }, // condition to check user doesn't exists
      });
      expect(result).toHaveProperty('_id');
    });

    // Insert child Documents
    test.each([
      {
        userId: 'test-sh',
        _id: 'test-sh-meta',
        status: 'detective',
      },
      {
        userId: 'test-id',
        _id: 'test-id-meta',
        status: 'hostile',
      },
    ])('Insert items to the child collection using replace', async (value) => {
      const result = await replace(context, childCollection.name, value, {
        condition: { _id: { $exists: false } }, // condition to check user doesn't exists
      });
      expect(result).toHaveProperty('_id');
    });

    test('fetch items using transaction', async () => {
      const items: TransactFindByIdDescriptor[] = [
        {
          id: 'test-sh',
          collection: collection.name,
        },
        {
          id: 'test-id',
          collection: collection.name,
        },
        {
          id: 'test-id-meta',
          rootId: 'test-id',
          collection: childCollection.name,
        },
      ];

      const result = await transactFindByIds(context, items);

      expect(result).toEqual([
        { name: 'Sherlock', email: 'sh@sh.com', _id: 'test-sh' },
        { name: 'Moriarty', email: 'moriarty@jim.com', _id: 'test-id' },
        { status: 'hostile', _id: 'test-id-meta', userId: 'test-id' },
      ]);
    });

    test('write a transaction to ddb consisting multiple ops', async () => {
      const request = [
        // Insert Item
        {
          collectionName: collection.name,
          value: {
            _id: 'test-jw',
            lastName: 'Watson',
            firstName: 'John',
            email: 'jw@sh.sh',
          },
          // condition checks for existence to insert an item with singularity
          options: { condition: { _id: { $exists: false } } },
        },
        // Update Item
        {
          collectionName: collection.name,
          value: {
            _id: 'test-sh',
            lastName: 'Holmes',
            firstName: 'Sherlock',
            email: 'sh@sh.sh',
          },
        },
        // Delete Item
        {
          collectionName: collection.name,
          id: 'test-id',
        },
        // Delete Child Item
        {
          collectionName: childCollection.name,
          id: 'test-id-meta',
          rootObjectId: 'test-id',
        },
      ] as TransactionWriteRequest[];

      /*
       * Note:
       * passing custom token as running tests again and again with same payload results
       * in same token, hence assertion fails
       */
      const ClientRequestToken = objectHash(new Date().getTime(), {
        algorithm: 'md5',
        encoding: 'base64',
      });

      await transactionWrite(context, request, { ClientRequestToken });
    });

    test('fetch inserted, updated(replaced) or deleted items using transaction', async () => {
      const items: TransactFindByIdDescriptor[] = [
        // record was Updated with last test run
        {
          id: 'test-sh',
          collection: collection.name,
        },
        // record was Inserted with last test run
        {
          id: 'test-jw',
          collection: collection.name,
        },
        // record was Deleted with last test run
        {
          id: 'test-id',
          collection: collection.name,
        },
        // child record was Deleted with last test run
        {
          id: 'test-id-meta',
          rootId: 'test-id',
          collection: childCollection.name,
        },
        // child record un-deleted
        {
          id: 'test-sh-meta',
          rootId: 'test-sh',
          collection: childCollection.name,
        },
      ];

      const result = await transactFindByIds(context, items);

      expect(result).toEqual([
        {
          lastName: 'Holmes',
          firstName: 'Sherlock',
          _id: 'test-sh',
          email: 'sh@sh.sh',
        },
        {
          lastName: 'Watson',
          firstName: 'John',
          _id: 'test-jw',
          email: 'jw@sh.sh',
        },
        {
          _id: 'test-sh-meta',
          userId: 'test-sh',
          status: 'detective',
        },
      ]);
    });

    test('TransactionValidationException while write a transaction to ddb consisting multiple ops for same item', async () => {
      const request = [
        // update a existing user
        {
          collectionName: collection.name,
          value: {
            _id: 'test-id-1',
            firstName: 'Neo',
            email: 'neo@matrix.com',
          },
        },
        // Deleting same user as above updated user
        {
          collectionName: collection.name,
          id: 'test-id-1',
        },
      ] as TransactionWriteRequest[];

      expect(transactionWrite(context, request)).rejects.toThrowError(
        TransactionValidationException
      );
    });

    test('writing same transaction twice with same `ClientRequestToken` to ddb', async () => {
      /**
       * Note:
       * We can either create token ourselves
       *  or
       * it's generated implicitly based on request payload
       */

      const request = [
        {
          collectionName: collection.name,
          value: {
            _id: 'test-bob',
            lastName: 'Bob',
            firstName: 'Sponge',
            email: 'sb@sb.sb',
          },
          options: { condition: { _id: { $exists: false } } }, // an insertion
        },
      ] as TransactionWriteRequest[];

      await transactionWrite(context, request);
      await transactionWrite(context, request);
    });

    test('IdempotentParameterMismatchException while writing different transaction with same `ClientRequestToken` to ddb', async () => {
      const ClientRequestToken = objectHash(new Date(), {
        algorithm: 'md5',
        encoding: 'base64',
      });

      const request1 = [
        {
          collectionName: collection.name,
          value: {
            _id: 'test-pat',
            lastName: 'Star',
            firstName: 'Patrick',
            email: 'ps@sb.sb',
          },
          options: { condition: { _id: { $exists: false } } }, // an insertion
        },
      ] as TransactionWriteRequest[];

      await transactionWrite(context, request1, { ClientRequestToken });

      const request2 = [
        {
          collectionName: collection.name,
          value: {
            _id: 'test-bob',
            lastName: 'Bob',
            firstName: 'Sponge',
            email: 'sb@sb.sb',
          },
          options: { condition: { _id: { $exists: false } } }, // an insertion
        },
      ] as TransactionWriteRequest[];

      expect(
        transactionWrite(context, request2, { ClientRequestToken })
      ).rejects.toThrowError(IdempotentParameterMismatchException);
    });
  });
});
