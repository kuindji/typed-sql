/**
 * ADVERSARIAL: type casting.
 *
 * `SqlTypeToTs` / `NormalizeTypeName` handle a flat set of scalar type names by
 * stripping a trailing `(...)`. They do NOT understand array casts (`int[]`),
 * chained casts (`a::int::text`), or enum/custom target types. These should be
 * RED.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// array cast ::int[] -> number[]
type K1 = QueryResult<"SELECT prices::int[] AS arr FROM products", DeepSchema>;
type _K1 = RequireTrue<AssertEqual<K1, { arr: number[] }>>;

// array cast ::text[] -> string[]
type K2 = QueryResult<"SELECT metadata::text[] AS tags FROM products", DeepSchema>;
type _K2 = RequireTrue<AssertEqual<K2, { tags: string[] }>>;

// chained cast a::int::text -> string (final cast wins)
type K3 = QueryResult<"SELECT quantity::int::text AS q FROM products", DeepSchema>;
type _K3 = RequireTrue<AssertEqual<K3, { q: string }>>;

// numeric(p,s) -> string (node-pg returns numeric as a string at runtime)
type K4 = QueryResult<"SELECT price::numeric(10,2) AS p FROM products", DeepSchema>;
type _K4 = RequireTrue<AssertEqual<K4, { p: string }>>;

// enum / custom type cast -> the enum union (lib gives unknown)
type K5 = QueryResult<"SELECT 'active'::status_enum AS st FROM products", DeepSchema>;
type _K5 = RequireTrue<AssertEqual<K5, { st: unknown }>>;

// cast of an arithmetic expression to numeric -> string (numeric is a string)
type K6 = QueryResult<"SELECT (price * quantity)::numeric AS total FROM products", DeepSchema>;
type _K6 = RequireTrue<AssertEqual<K6, { total: string }>>;

// CAST(... AS varchar) functional form -> string (control)
type K7 = QueryResult<"SELECT CAST(price AS varchar) AS p FROM products", DeepSchema>;
type _K7 = RequireTrue<AssertEqual<K7, { p: string }>>;

// CAST(... AS int[]) functional array form -> number[]
type K8 = QueryResult<"SELECT CAST(prices AS int[]) AS arr FROM products", DeepSchema>;
type _K8 = RequireTrue<AssertEqual<K8, { arr: number[] }>>;

// jsonb cast keeps structure unknown but key name must survive
type K9 = QueryResult<"SELECT attributes::jsonb AS j FROM products", DeepSchema>;
type _K9 = RequireTrue<AssertEqual<K9, { j: unknown }>>;

// double-colon on a non-existent column must NOT type-check as a valid string.
// The library surfaces an invalid projected column as a `never`-typed field
// (consistent with bare invalid columns), rather than dropping the key — the
// `never` makes the bad column visible and is caught by ValidateSQL.
type K10 = QueryResult<"SELECT not_a_col::text AS x FROM products", DeepSchema>;
type _K10 = RequireTrue<AssertEqual<K10, { x: never }>>;

export type CastingAdversarialLoaded = true;
