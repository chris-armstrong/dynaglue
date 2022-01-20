import { Converter } from 'aws-sdk/clients/dynamodb';
import { SEPARATOR, toWrapped } from '../base/util';
import { Collection } from '../base/collection';
import { CollectionLayout } from '../base/layout';
import { createContext } from '../context';
import { createDynamoMock } from '../../testutil/dynamo_mock';
import { findByIdWithChildren } from './find_by_id_with_children';
import { CollectionNotFoundException } from '../base/exceptions';
import { CollectionDefinition } from '../base/collection_definition';

describe('findByIdWithChildren', () => {
  const layout: CollectionLayout = {
    tableName: 'global',
    primaryKey: {
      partitionKey: 'pk',
      sortKey: 'sk',
    },
  };

  const rootCollection = {
    name: 'users',
    layout,
  };

  const addressesCollection = {
    name: 'addresses',
    parentCollectionName: 'users',
    layout,
    type: 'child',
    foreignKeyPath: ['userId'],
  };
  const profilesCollection = {
    name: 'profiles',
    parentCollectionName: 'users',
    layout,
    type: 'child',
    foreignKeyPath: ['userId'],
  };

  const teamsCollection = {
    name: 'teams',
    layout,
  };

  const allCollections: Collection[] = [
    rootCollection,
    addressesCollection,
    profilesCollection,
    teamsCollection,
  ];

  it('should fail if one of the specified child collections does not have the root as its parent', async () => {
    const dc = createDynamoMock('query', {});
    const ctx = createContext(dc, allCollections);
    await expect(
      findByIdWithChildren(ctx, 'users', 'testid', ['addresses', 'teams'])
    ).rejects.toThrowError(CollectionNotFoundException);
  });

  it('should limit itself to just the specified child collections', async () => {
    const dc = createDynamoMock('query', {});
    const ctx = createContext(dc, allCollections);
    await findByIdWithChildren(
      ctx,
      'users',
      'testid',
      ['profiles'],
      undefined,
      { scanForward: false }
    );
    expect(dc.query).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: {
          ':value0': { S: `users${SEPARATOR}testid` },
          ':value1': { S: `profiles${SEPARATOR}` },
          ':value2': { S: `users${SEPARATOR}\uFFFF` },
          ':value3': { S: `profiles` },
          ':value4': { S: 'users' },
        },
      })
    );
  });

  it('should search against all the known child collections if none are specified', async () => {
    const dc = createDynamoMock('query', {});
    const ctx = createContext(dc, allCollections);
    await findByIdWithChildren(ctx, 'users', 'testid');
    expect(dc.query).toHaveBeenCalledWith(
      expect.objectContaining({
        KeyConditionExpression:
          'pk = :value0 AND sk BETWEEN :value1 AND :value2',
        ExpressionAttributeValues: expect.objectContaining({
          ':value0': { S: `users${SEPARATOR}testid` },
          ':value1': { S: `addresses${SEPARATOR}` },
          ':value2': { S: `users${SEPARATOR}\uFFFF` },
          ':value3': { S: 'addresses' },
          ':value4': { S: 'profiles' },
          ':value5': { S: 'users' },
        }),
        FilterExpression: '#attr0 IN (:value3,:value4,:value5)',
        ExpressionAttributeNames: expect.objectContaining({
          '#attr0': 'type',
        }),
      })
    );
  });

  it('should return an empty root object if not found in the results', async () => {
    const address1 = { _id: 'testaddress1', userId: 'userId1' };
    const dc = createDynamoMock('query', {
      Items: [
        Converter.marshall(
          toWrapped(
            {
              ...addressesCollection,
              wrapperExtractKeys: [],
            } as CollectionDefinition,
            address1
          )
        ),
      ],
    });
    const ctx = createContext(dc, allCollections);
    const result = await findByIdWithChildren(ctx, 'users', 'testid');

    expect(result.root).toBeUndefined();
    expect(result.children.addresses).toEqual([address1]);
    expect(result.children.profiles).toEqual([]);
  });

  it('should fill out the root if found in the results', async () => {
    const address1 = { _id: 'testaddress1', userId: 'userId1' };
    const root1 = { _id: 'root1' };
    const rootDefinition = {
      ...rootCollection,
      wrapperExtractKeys: [],
    } as CollectionDefinition;
    const addressesDefinition = {
      ...addressesCollection,
      wrapperExtractKeys: [],
    } as CollectionDefinition;
    const dc = createDynamoMock('query', {
      Items: [
        Converter.marshall(toWrapped(addressesDefinition, address1)),
        Converter.marshall(toWrapped(rootDefinition, root1)),
      ],
    });
    const ctx = createContext(dc, allCollections);
    const result = await findByIdWithChildren(ctx, 'users', 'testid');

    expect(result.root).toEqual(root1);
    expect(result.children.addresses).toEqual([address1]);
    expect(result.children.profiles).toEqual([]);
  });
});
