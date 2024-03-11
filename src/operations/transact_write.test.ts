import {
  CreateTableCommand,
  CreateTableInput,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import { CollectionLayout } from '../base/layout';
import { createContext } from '../context';
import { replace } from './replace';
import {
  TransactFindByIdDescriptor,
  transactFindByIds,
} from './transact_find_by_ids';
import { TransactionWriteRequest, transactionWrite } from './transact_write';
import debug from 'debug';
import { DebugTestsNamespace, debugDynamoTests } from '../debug';
import { TransactionValidationException } from '../base/exceptions';

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
const collection = {
  name: 'users',
  layout,
};

const showTimeTaken = (startTime: number) =>
  `[${new Date().getTime() - startTime}ms]`;

const LocalDDBTestKit = {
  connect: (): DynamoDBClient | null => {
    const startBy = new Date().getTime();
    try {
      const localDDBClient = new DynamoDBClient({
        endpoint: 'http://localhost:8000',
        region: 'local',
      });
      debugDynamoTests(`${showTimeTaken(startBy)} Connected to Local DDB`, '');
      return localDDBClient;
    } catch (error) {
      debugDynamoTests('Error connecting to local DDB', error);
      return null;
    }
  },
  createTables: async (
    client: DynamoDBClient,
    tableDefinitions: CreateTableInput[] = []
  ) => {
    const startBy = new Date().getTime();
    try {
      await Promise.all(
        tableDefinitions?.map((tableDefinition) => {
          const createTableCmd = new CreateTableCommand(tableDefinition);
          return client.send(createTableCmd);
        })
      );

      debugDynamoTests(
        `${showTimeTaken(startBy)} tables created in local DDB`,
        ''
      );
    } catch (error) {
      debugDynamoTests('Error creating tables in local DDB', error);
    }
  },
  deleteTables: async (client: DynamoDBClient, tableNames: string[] = []) => {
    const startBy = new Date().getTime();
    try {
      await Promise.all(
        tableNames?.map((tableName) => {
          return client.send(
            new DeleteTableCommand({
              TableName: tableName,
            })
          );
        })
      );

      debugDynamoTests(
        `${showTimeTaken(startBy)} tables deleted in local DDB`,
        ''
      );
    } catch (error) {
      debugDynamoTests('Error deleting tables in local DDB', error);
    }
  },
  listTables: async (client: DynamoDBClient) => {
    try {
      await client.send(new ListTablesCommand({}));
    } catch (error) {
      debugDynamoTests('Error listing tables in local DDB', error);
    }
  },
};

describe('transactions', () => {
  let localDDBClient: DynamoDBClient;

  // create a client with DDB local
  beforeAll(async () => {
    debug.enable(DebugTestsNamespace);
    localDDBClient = LocalDDBTestKit.connect() as unknown as DynamoDBClient;
  });

  // create tables
  beforeAll(async () => {
    await LocalDDBTestKit.createTables(localDDBClient, TableDefinitions);
  });

  // Delete tables
  afterAll(async () => {
    await LocalDDBTestKit.deleteTables(localDDBClient, [
      TableDefinitions[0].TableName,
    ]);
    debug.disable();
  });

  test.each([
    { _id: 'test-id', name: 'Moriarty', email: 'moriarty@jim.com' },
    {
      _id: 'test-sh',
      name: 'Sherlock',
      email: 'sh@sh.com',
    },
  ])('Insert items to the collection using replace', async (value) => {
    const context = createContext(localDDBClient as unknown as DynamoDBClient, [
      collection,
    ]);

    const result = await replace(context, collection.name, value, {
      condition: { _id: { $exists: false } }, // condition to check user doesn't exists
    });
    expect(result).toHaveProperty('_id');
  });

  test('fetch items using transaction', async () => {
    const context = createContext(localDDBClient as unknown as DynamoDBClient, [
      collection,
    ]);

    const items: TransactFindByIdDescriptor[] = [
      {
        id: 'test-sh',
        collection: collection.name,
      },
      {
        id: 'test-id',
        collection: collection.name,
      },
    ];
    const result = await transactFindByIds(context, items);

    debugDynamoTests(
      'fetched items using transactFindByIds',
      JSON.stringify(result)
    );

    expect(result).toEqual([
      { name: 'Sherlock', email: 'sh@sh.com', _id: 'test-sh' },
      { name: 'Moriarty', email: 'moriarty@jim.com', _id: 'test-id' },
    ]);
  });

  test('write a transaction to ddb consisting multiple ops for same item', async () => {
    const context = createContext(localDDBClient as unknown as DynamoDBClient, [
      collection,
    ]);

    const request = [
      {
        collectionName: collection.name,
        value: {
          _id: 'test-sh',
          lastName: 'Holmes',
          firstName: 'Sherlock',
          email: 'sh@sh.sh',
        }, // an update to existing user
      },
      {
        collectionName: collection.name,
        id: 'test-sh',
      }, // a deletion
    ] as TransactionWriteRequest[];

    expect(transactionWrite(context, request)).rejects.toThrowError(
      TransactionValidationException
    );
  });

  test('write a transaction to ddb consisting multiple ops', async () => {
    const context = createContext(localDDBClient as unknown as DynamoDBClient, [
      collection,
    ]);

    const request = [
      {
        collectionName: collection.name,
        value: {
          _id: 'test-jw',
          lastName: 'Watson',
          firstName: 'John',
          email: 'jw@sh.sh',
        },
        options: { condition: { _id: { $exists: false } } }, // an insertion
      },
      {
        collectionName: collection.name,
        value: {
          _id: 'test-sh',
          lastName: 'Holmes',
          firstName: 'Sherlock',
          email: 'sh@sh.sh',
        }, // an update to existing user
      },
      {
        collectionName: collection.name,
        id: 'test-id',
      }, // a deletion
    ] as TransactionWriteRequest[];

    await transactionWrite(context, request);
  });

  test('fetch inserted, updated(replaced) or deleted items using transaction', async () => {
    const context = createContext(localDDBClient as unknown as DynamoDBClient, [
      collection,
    ]);

    const items: TransactFindByIdDescriptor[] = [
      {
        id: 'test-sh',
        collection: collection.name,
      },
      {
        id: 'test-jw',
        collection: collection.name,
      },
      {
        id: 'test-id',
        collection: collection.name,
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
    ]);
  });
});
