# Dynaglue

An opinionated JavaScript library to make single-table designs in DynamoDB easier
to query and update.

## Installation

```sh
npm install dynaglue
```

## What is it for?

Implementing single-table designs in DynamoDB (where you store multiple distinct
data structures in the same table) is difficult with the DynamoDB API. dynaglue
presents a Mongo-like abstraction over DynamoDB that makes it easier to query your
data, but in a still optimised and best-practice way.

See [Motivation](#Motivation) (below) for a more detailed explanation.

## Usage

The best documentation at the moment is the examples in the `examples/` directory. They
show the basic API.

The API itself is also lightly documented.

A more detailed guide is forthcoming.

## Prerequisites

This library is intended for advanced use cases and at the very least, assumes
strong knowledge of DynamoDB partition and sort keys, primary and secondary indexes,
adjaceny list design, etc.

If you're unsure what any of this means, first learn how to build applications
using DynamoDB:

* [DynamoDB Guide](https://www.dynamodbguide.com/)
* [Getting Started with DynamoDB - AWS Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html)

Then for more advanced modelling in DynamoDB:

* [Advanced Design Patterns for DynamoDB - AWS ReInvent 2018 - Rick Houlihan](https://www.youtube.com/watch?v=HaEPXoXVf2k)
* [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

## Status

This project is currently **experimental**, more proof-of-concept than rock-solid
production-ready modelling library.

**Its API is unstable and will change**, so it should not be used for anything
important (just yet anyway :-).

Please try it out, report bugs, suggest improvements or submit sensible code
changes.

## Motivation

In order to leverage DynamoDB properly, you must first:

* purge yourself of any sensible knowledge of database design such as normalisation
* know exactly how your application will access its data for now and all time (in
  other words, it helps to be psychic)
* pack multiple values into the same field in order to implement fast composite-key and
  hierarchical data lookups
* mix multiple data structures together in the same table, distinguished only by
  prefixes and values

Once you've accepted all that is horrible as best practice, you may then build highly
performant and scalable web applications.

The next stumbling block is an API that does not make this easy. Combining multiple
records from different data types sharing indexes in the same logical table requires
great discipline and attention to detail.

Most DynamoDB applications will attempt to avoid this by using separate tables
for each type of data, using secondary indexes liberally and by naming their keys
intuitively based on the data being modelled. This is actually fine: it makes working
with the API less painful but it makes it harder to optimise for cost and performance
in some cases.

This library is an attempt at a compromise - it presents a Mongo-like
API for looking up data, but relies on you to identify and declare your access patterns
up front.

You can query your data as if your storage engine knows how to work out
what index to use, but it will fail hard if it can't find that index, which is
(counterintuitively) what you want with DynamoDB.

You can use it for single or multi-table designs (in reality, there is no such thing
as single-table designs, because there will be at least one access pattern that is
so different from your others that it would affect the performance of them if they
shared an index or table).

## Limitations

This is what I'm aware of - I'm sure there is much more:

* *It is highly opinionated about how data is stored.* Using this for existing
  applications is going to require a data migration (at least until we work out a way
  to implement a more flexible storage mechanism)
* *The current design makes the use projected attributes on GSIs impossible*
  to control return value size. This could be achieved with a completely different
  storage pattern, which I want to examine in more detail.
* *No support for update expressions or filter expressions.* No reason AFAIK
  that prevents these from being added. They just need a sensible API :-)
* *Only string types for values used to build indexes.* Obviously numbers
  and dates are useful for sort key expressions, but they require more
  sophisticated handling
* *No adjacency lists* - everything is a top-level object. You
  can still create relationships with indexed foreign keys, but this is not the
  same (for starters, it requires an extra GSI instead of overloading the
  primary key).
* *No write sharding support for low-variance partition keys.* If you have hot partition
  keys with a small set of values e.g. `status=(starting, started, stopping, stopped deleted)`
  and you query them on one of those values relentlessly, you will get a
  hot partition. The normal solution is to add a suffix spread between a given
  set of values (e.g. 0-19) so that when it is queried on status the query can
  be split over 20 partitions instead of one.
* *This library may not reflect or enforce best practice.* This library probably does
  some things inefficiently and will let you do bad things too (this is a hammer
  and that might be a nail, so I presume you know what you're doing)

## Contributing

There isn't formal contribution guidelines at this time.

Open an Issue (**especially before you write any code**) and share your
thoughts / plans / ideas before you do anything substantial.

Abuse, harrassment, and anything else that is becoming unproductive will be closed
without further engagement.

## License

Copyright 2019 Christopher Armstrong

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
