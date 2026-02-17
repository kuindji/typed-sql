As a TypeScript and SQL expert create a library that allows developers to:

- check their raw sql queries for errors in terms of correct table and field names
- get return type of a raw sql query

* The library operates on pure types, this is not a runtime library
* The library supports all kinds of queries: select/insert/delete/update/etc
* The library should work with queries of any complexity without triggering TypeScript limitations of depth
* The library does not validate correctness of the sql syntax. Its only concern is correctness of table/field names and returned types.

Example usage of the library:

```typescript
type SomeQuery = "select * from my_table;";
type Schema = {
    defaultSchema: "public";
    schemas: {
        public: {
            my_table: {
                id: number;
                name: string;
            };
        };
    };
};
type IsValid = ValidateSQL<SomeQuery, Schema>; // bool
type ReturnType = GetReturnType<SomeQuery, Schema>; // { id: number; name: string; }
```

Exact function names may vary.

- The query may contain any sql expression
- Complex expression types can be derived from expression itself - functions used, field types used - and from ::cast cast() expressions.
- field names can be quoted and unquoted.

- Target sql standards are postgres and mysql.
- Whatever these databases support, should be acceptable for this library as input.

- For each case create a test
