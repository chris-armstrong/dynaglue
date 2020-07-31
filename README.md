# Dynaglue

[![Join the chat at https://gitter.im/dynaglue/community](https://badges.gitter.im/dynaglue/community.svg)](https://gitter.im/dynaglue/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

*dynaglue* is an opinionated JavaScript library that makes single-table designs in DynamoDB easier
to query and update.

```sh
npm install dynaglue
```

## Rationale

Querying and storing data in single-table DynamoDB designs **is hard**. Keeping indexes up-to-date and
constructing DynamoDB queries and update expressions is time-consuming and error-prone.

*dynaglue* takes the hassle out of managing your data with a straightforward way to declare its mapping 
onto your table's indexes, and wraps it all up with simple and foolproof Mongo-like API.

See [Motivation](#Motivation) (below) for a more detailed explanation.

## Getting Started

A comprehensive [Getting Started Guide](https://www.chrisarmstrong.dev/posts/dynaglue-getting-started-guide) is
available explaining how to install and use dynaglue in a new project as well as all its current features.

See the [examples directory](https://github.com/chris-armstrong/dynaglue/tree/master/examples) for a more
concise overview of its features in action.

[Reference Documentation](https://chris-armstrong.github.io/dynaglue/), generated from the source code,
also contains useful information about the operations and types you need to use dynaglue.

## Status

This project is currently in progress (alpha). **Its API may change during this period**, so take care and keep an eye on updates for now.

It's quite feature complete, barring some specific items (like batch read/write, transacions, projection expressions, capacity numbers).

Please try it out, report bugs, suggest improvements or submit a PR.

## Usage Example

```typescript
// Declare the layout of your table (its primary and secondary indexes and their key names)
const layout = {
  tableName: 'my-table',
  primaryKey: { partitionKey: 'id', sortKey: 'collection' },
  findKeys: [
    // 2 GSIs => up to 2 extra access patterns per collection
    { indexName: 'gs2', partitionKey: 'gs2p', sortKey: 'gs2s' },
    { indexName: 'gs3', partitionKey: 'gs3p', sortKey: 'gs3s' },
  ],
};

// Declare a collection for each data type (like a Mongo collection)
const usersCollection = {
  name: 'users',
  layout,
  // access patterns that are mapped to indexes in the table layout
  accessPatterns: [
    // 1. Find users by their email address on GSI2
    { indexName: 'gs2', partitionKeys: [], sortKeys: [['email']] },
    // 2. Find users by their team (and optionally, employee code)
    { indexName: 'gs3', partitionKeys: [['team', 'id']], sortKeys: [['team', 'employeeCode']] },
  ],
};
const ddb = new AWS.DynamoDB();
const ctx = createContext(ddb, [usersCollection]);

// Insert users into collection (auto-generated IDs)
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

// Find a user by ID (uses primary index)
const foundUser = await findById(ctx, 'users', user2._id);
// => { _id: '...', name: 'Ruairidh Hughes', ... }

// Find a user by email (access pattern 1)
const userByEmail = await find(ctx, 'users', { email: 'anayahd@example.com' });
// => [{ _id: '...', name: 'Anayah Dyer', ... }]

// Find all users in a team (access pattern 2)
const usersInTeam2 = await find(ctx, 'users', { 'team.id': 'team-code-2' });
// => [{ _id: '...', name: 'Giles Major', ... }, { _id: '...', name: 'Lance Alles', ... }]

// Find user by teamId and employeeCode (access pattern 2)
const specificUser = await find(ctx, 'users', { 'team.id': 'team-code-1', employeeCode: 'AC-2' });
// => [{ _id: '...', name: 'Ruairidh Hughes', ... }]

// Update an item
const updatedItem = await updateById(ctx, 'users', user4._id, {
  'team.employeeCode': 'GT-10',
  'name': 'James Alles',
});
```

## Prerequisite Knowledge

This library assumes you have a good understanding of DynamoDB partition and sort keys, primary and secondary indexes,
and assumes you understand how single-table designs work in theory.

If you're unsure what any of this means, first learn how to build applications using DynamoDB:

* [DynamoDB Guide](https://www.dynamodbguide.com/)
* [Getting Started with DynamoDB - AWS Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html)

more advanced DynamoDB modelling:

* [The DynamoDB Book](https://www.dynamodbbook.com/) **HIGHLY RECOMMENDED**
* [Advanced Design Patterns for DynamoDB - AWS ReInvent 2018 - Rick Houlihan](https://www.youtube.com/watch?v=HaEPXoXVf2k)
* [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
* [How to switch from RDBMS to DynamoDB in 20 easy steps… - Jeremy Daly](https://www.jeremydaly.com/how-to-switch-from-rdbms-to-dynamodb-in-20-easy-steps/)
* [From relational DB to single DynamoDB table: a step-by-step exploration](https://www.trek10.com/blog/dynamodb-single-table-relational-modeling/)

and on the merits of single table vs multi table design (this library is mostly agnostic):

* [Comparing multi and single table approaches to designing a DynamoDB data model - Paul Swail](https://winterwindsoftware.com/dynamodb-modelling-single-vs-multi-table/)
* [Using (and Ignoring) DynamoDB Best Practices with Serverless | Alex DeBrie](https://acloud.guru/series/serverlessconf-nyc-2019/view/dynamodb-best-practices)

## Debugging

You can see what it is doing to DynamoDB by running your code with the environment variable:

```bash
export DEBUG=dynaglue:*
```

which will print out the queries it executes.

## Motivation

I've learnt that in order to leverage DynamoDB properly, you must first:

* purge yourself of any sensible knowledge of database design such as normalisation
* know exactly how your application will access its data for now and all time (in
  other words, it helps to be psychic)
* pack multiple values into the same field in order to implement fast composite-key and
  hierarchical data lookups
* mix multiple data structures together in the same table, distinguished only by
  prefixes and values

Once you've accepted all that is horrible as best practice, only then you may then build highly
performant and scalable web applications.

The next stumbling block is DynamoDB's API: it does not make this easy. Combining multiple
records from different data types sharing indexes in the same logical table requires
discipline and attention to detail.

Most DynamoDB applications will attempt to avoid this by using separate tables
for each type of data, using secondary indexes liberally and by naming their keys
intuitively based on the data being modelled. **This is actually fine**: it makes working
with the API less painful but it makes it harder to optimise for cost and performance.

This library is an attempt at a compromise - it presents a Mongo-like
API for looking up data, but still relies on you to identify and declare your access
patterns up front.

You can query your data as if your storage engine knows how to work out
what index to use, but it will fail hard if it can't find that index, which is
(counterintuitively) what you want with DynamoDB.

You can use it for single or multi-table designs (in reality, there is no such thing
as single-table designs, because there will be at least one access pattern that is
so different from your others that it would affect the performance of them if they
shared an index or table).

## Limitations

This is a list of current limitations:

* *It is highly opinionated about how data is stored.* Using this for existing
  applications is going to require a data migration at the very least (there
  are plans to add some flexibility around separators and important attribute
  names)
* *It is not possible to use projected attributes on GSIs with the current data layout*
  *to control index storage and return value size.* 
* *Only string types for values used to build indexes.* Obviously numbers
  and dates are useful for sort key expressions, but they require more
  sophisticated handling than the library currently supports
* *Basic adjacency list support*
  see the new APIs: 
    * [`ChildCollection` type](https://chris-armstrong.github.io/dynaglue/interfaces/childcollection.html)
    * [`findChildren`](https://chris-armstrong.github.io/dynaglue/globals.html#findchildren) 
    * [`findChildById`](https://chris-armstrong.github.io/dynaglue/globals.html#findchildbyid) 
    * [`findByIdWithChildren`](https://chris-armstrong.github.io/dynaglue/globals.html#findbyidwithchildren) 
    * [`updateChildById`](https://chris-armstrong.github.io/dynaglue/globals.html#updatechildbyid) 
  and examples:
    * [`basic_children.ts` example](https://github.com/chris-armstrong/dynaglue/blob/master/examples/basic_children.ts)
    * [`adjacency_list.ts` example](https://github.com/chris-armstrong/dynaglue/blob/master/examples/adjacency_list.ts)
* *Batch Read/Write and Transaction Support is still to be done*
* *No write sharding support for low-variance partition keys.* (NOTE: This isn't important for most use cases)
  If you have hot partition keys with a small set of values e.g. `status=(starting, started, stopping, stopped deleted)`
  and you query them on one of those values relentlessly, you will get a
  hot partition. The normal solution is to add a suffix spread between a given
  set of values (e.g. 0-19) so that when it is queried on status the query can
  be split over 20 partitions instead of one.
* *This library may not reflect "best practice"* 

## Contributing

Open an Issue (**especially before you write any code**) and share your
thoughts / plans / ideas before you do anything substantial.

Abuse, harrassment, and anything else that is becoming unproductive will be closed
without further engagement.

## License

Copyright 2019-2020 Christopher Armstrong

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
