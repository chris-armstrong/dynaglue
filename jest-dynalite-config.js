module.exports = {
  tables: [
    {
      TableName: 'general',
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'gpk1', AttributeType: 'S' },
        { AttributeName: 'gsk1', AttributeType: 'S' },
        { AttributeName: 'gpk2', AttributeType: 'S' },
        { AttributeName: 'gsk2', AttributeType: 'S' },
        { AttributeName: 'gpk3', AttributeType: 'S' },
        { AttributeName: 'gsk3', AttributeType: 'S' },
        { AttributeName: 'gpk4', AttributeType: 'S' },
        { AttributeName: 'gsk4', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'gsi1',
          KeySchema: [
            { AttributeName: 'gpk1', KeyType: 'HASH' },
            { AttributeName: 'gsk1', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'gsi2',
          KeySchema: [
            { AttributeName: 'gpk2', KeyType: 'HASH' },
            { AttributeName: 'gsk2', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'gsi3',
          KeySchema: [
            { AttributeName: 'gpk3', KeyType: 'HASH' },
            { AttributeName: 'gsk3', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'gsi4',
          KeySchema: [
            { AttributeName: 'gpk4', KeyType: 'HASH' },
            { AttributeName: 'gsk4', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  ],
};

