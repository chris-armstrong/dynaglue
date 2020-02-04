import { createUpdateActionForKey } from './update_by_id';
import { InvalidUpdatesException } from '../base/exceptions';

describe('createUpdateActionForKey', () => {
  const indexLayout = {
    indexName: 'index1',
    partitionKey: 'pk1',
    sortKey: 'sk1',
  };

  const collectionName = 'addresses';

  const partitionKPs = [
    ['userType'],
    ['profile', 'phoneNumber']
  ];

  const sortKPs = [
    ['location', 'department'],
    ['location', 'floor'],
    ['userType'],
  ];

  it('should throw an InvalidUpdatesException for a partition key that is missing updates to all its key paths', () => {
    const updates = { 'profile': { name: 'Chris Armstrong', phoneNumber: '123456' } };
    expect(() => createUpdateActionForKey(collectionName, 'partition', partitionKPs, indexLayout, updates))
      .toThrowError(InvalidUpdatesException);
  });

  it('should return undefined when there is no updates to the partition key in the set of updates', () => {
    const updates = { staffCount: 5 };
    expect(createUpdateActionForKey(collectionName, 'partition', partitionKPs, indexLayout, updates))
      .toBeUndefined();
  });

  it('should return undefined when there is no updates to the sort key in the set of updates', () => {
    const updates = { staffCount: 5 };
    expect(createUpdateActionForKey(collectionName, 'sort', sortKPs, indexLayout, updates))
      .toBeUndefined();
  });

  it('should correctly calculate the update action for a scalar key', () => {
    const updates = { 'profile': { name: 'Chris Armstrong', phoneNumber: '123456' }, type: 'A' };
    const keyPaths = [['profile', 'phoneNumber']];
    expect(createUpdateActionForKey(collectionName, 'partition', keyPaths, indexLayout, updates))
      .toEqual({
        attributeName: 'pk1',
        value: `${collectionName}|-|123456`,
      });
  });

  it('should correctly calculate the update action for an empty key', () => {
    const updates = { 'profile': { name: 'Chris Armstrong', phoneNumber: '123456' }, type: 'A' };
    const keyPaths = [];
    expect(createUpdateActionForKey(collectionName, 'partition', keyPaths, indexLayout, updates))
      .toBeUndefined();
  });

  it('should correctly calculate the update action for a nested-value composite key', () => {
    const updates = { 'profile': { name: 'Chris Armstrong', phoneNumber: '123456' }, userType: 'AAA' };
    expect(createUpdateActionForKey(collectionName, 'partition', partitionKPs, indexLayout, updates))
      .toEqual({
        attributeName: 'pk1',
        value: `${collectionName}|-|AAA|-|123456`,
      });
  });

  it('should correctly calculate the update action for a directly updated composite key', () => {
    const updates = { 'profile.name': 'Chris Armstrong', 'profile.phoneNumber': '123456', userType: 'AAA' };
    expect(createUpdateActionForKey(collectionName, 'partition', partitionKPs, indexLayout, updates))
      .toEqual({
        attributeName: 'pk1',
        value: `${collectionName}|-|AAA|-|123456`,
      });
  });
});


xdescribe('updateById', () => {
 xit('should handle basic set updates', async () => {

 });

});
