import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  Collection,
  createContext,
  insert,
  find,
  Context,
} from '../dist';

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
  listAllKey: {
    indexName: 'gs1',
    partitionKey: 'collection',
    sortKey: 'id',
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

const lowercaseNormaliser = (keyPath: string[], value: string) =>
  value.toLowerCase();

const locationsCollection: Collection = {
  name: 'locations',
  layout: globalTableLayout,
  accessPatterns: [
    {
      indexName: 'gs2',
      partitionKeys: [['country']],
      sortKeys: [['state'], ['city'], ['suburb'], ['street']],
      options: { stringNormalizer: lowercaseNormaliser },
    },
    {
      indexName: 'gs3',
      partitionKeys: [],
      sortKeys: [['description', 'name']],
      options: { stringNormalizer: lowercaseNormaliser },
    },
  ],
};

type Location = {
  description: {
    name: string;
  };
  country: string;
  state: string;
  city: string;
  suburb: string;
  street: string;
};

const addLocation = (ctx: Context, location: Location) =>
  insert(ctx, 'locations', location);

const createLocation = (
  country: string,
  state: string,
  city: string,
  suburb: string,
  street: string,
  name: string
) => ({
  country,
  state,
  city,
  suburb,
  street,
  description: {
    name,
  },
});

const populateLocations = (ctx: Context) => {
  addLocation(
    ctx,
    createLocation(
      'AU',
      'NSW',
      'Sydney',
      'Sydney',
      'Bennelong Point',
      'Sydney Opera House'
    )
  );
  addLocation(
    ctx,
    createLocation(
      'AU',
      'NSW',
      'Sydney',
      'Bondi',
      'Campbell Parade',
      'Bondi Beach'
    )
  );
  addLocation(
    ctx,
    createLocation(
      'AU',
      'NSW',
      'Sydney',
      'Sydney',
      'Wheat Road',
      'Darling Harbour'
    )
  );
  addLocation(
    ctx,
    createLocation('AU', 'NSW', 'Sydney', 'Manly', 'The Corso', 'The Corso')
  );
  addLocation(
    ctx,
    createLocation(
      'AU',
      'NSW',
      'Byron Bay',
      'Byron Bay',
      'Cape Byron Walking Track',
      'Smokey Cape Lighthouse'
    )
  );
  addLocation(
    ctx,
    createLocation(
      'AU',
      'NSW',
      'Clifton',
      'Clifton',
      'Lawrence Hargrave Dr',
      'Seacliff Bridge'
    )
  );
  addLocation(
    ctx,
    createLocation(
      'AU',
      'VIC',
      'Melbourne',
      'Melbourne',
      'Queen Street',
      'Queen Victoria Market'
    )
  );
  addLocation(
    ctx,
    createLocation(
      'AU',
      'VIC',
      'Melbourne',
      'Melbourne',
      'Flinders Street',
      'Federation Square'
    )
  );
  addLocation(
    ctx,
    createLocation(
      'AU',
      'VIC',
      'Melbourne',
      'South Yarra',
      'Birdwood Avenue',
      'Royal Botanic Gardens Victoria'
    )
  );
  addLocation(
    ctx,
    createLocation(
      'AU',
      'VIC',
      'Melbourne',
      'Belgrave',
      'Old Monbulk Road',
      'Puffing Billy Railway'
    )
  );
};

async function main() {
  const ddb = new DynamoDBClient({
    endpoint: DYNAMODB_ENDPOINT,
    region: 'us-east-1',
  });
  const ctx = createContext(ddb, [locationsCollection]);

  await populateLocations(ctx);

  const allSydneyLocations = await find(ctx, 'locations', {
    country: 'AU',
    state: 'NSW',
    city: 'SYDNEY',
  });
  console.log('All Sydney locations', allSydneyLocations.items);

  const allVictoriaLocations = await find(ctx, 'locations', {
    country: 'AU',
    state: 'VIC',
  });
  console.log('All Victoria locations', allVictoriaLocations.items);

  const findSLocations = await find(ctx, 'locations', {
    'description.name': 'S',
  });
  console.log("locations beginning with 'S':", findSLocations.items);
}

main();
