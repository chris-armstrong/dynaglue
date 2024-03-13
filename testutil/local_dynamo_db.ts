import {
  CreateTableCommand,
  CreateTableInput,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import { debugTests } from './debug_tests';

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
      debugTests(`${showTimeTaken(startBy)} Connected to Local DDB`, '');
      return localDDBClient;
    } catch (error) {
      debugTests('Error connecting to local DDB', error);
      return null;
    }
  },
  createTables: async (
    client: DynamoDBClient,
    tableDefinitions: CreateTableInput[] = []
  ): Promise<void> => {
    const startBy = new Date().getTime();
    try {
      await Promise.all(
        tableDefinitions?.map((tableDefinition) => {
          const createTableCmd = new CreateTableCommand(tableDefinition);
          return client.send(createTableCmd);
        })
      );

      debugTests(`${showTimeTaken(startBy)} tables created in local DDB`, '');
    } catch (error) {
      debugTests('Error creating tables in local DDB', error);
    }
  },
  deleteTables: async (
    client: DynamoDBClient,
    tableNames: string[] = []
  ): Promise<void> => {
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

      debugTests(`${showTimeTaken(startBy)} tables deleted in local DDB`, '');
    } catch (error) {
      debugTests('Error deleting tables in local DDB', error);
    }
  },
  listTables: async (client: DynamoDBClient): Promise<void> => {
    try {
      await client.send(new ListTablesCommand({}));
    } catch (error) {
      debugTests('Error listing tables in local DDB', error);
    }
  },
};

export default LocalDDBTestKit;
