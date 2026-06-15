/**
 * Schema-declared function return types (bucket 06).
 * A function NOT known as a builtin resolves its return type from the schema's
 * `functions` map; builtins still win; absent map ⇒ unchanged.
 */
import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { FnSchema, WideSchema } from "../../fixtures/parser-schemas.js";

// Bare nullable schema function → mapped return.
type T1 = QueryResult<`SELECT convert_currency(id) AS "x" FROM users`, FnSchema>;
type _T1 = RequireTrue<AssertEqual<T1, { x: number | null }>>;

// Bare non-null schema function → mapped return, no null.
type T2 = QueryResult<`SELECT some_nonnull_fn(id) AS "y" FROM users`, FnSchema>;
type _T2 = RequireTrue<AssertEqual<T2, { y: number }>>;

// Unknown function on a functions-LESS schema stays unknown (backward compat).
type T3 = QueryResult<`SELECT convert_currency(id) AS "x" FROM users`, WideSchema>;
type _T3 = RequireTrue<AssertEqual<T3, { x: unknown }>>;

// CORE: nullable schema function under an outer cast keeps `| null`.
type T4 = QueryResult<`SELECT convert_currency(id)::float8 AS "x" FROM users`, FnSchema>;
type _T4 = RequireTrue<AssertEqual<T4, { x: number | null }>>;

// Non-null schema function under a cast → no null added.
type T5 = QueryResult<`SELECT some_nonnull_fn(id)::float8 AS "y" FROM users`, FnSchema>;
type _T5 = RequireTrue<AssertEqual<T5, { y: number }>>;

// Backward compat: same cast on a functions-LESS schema → plain number.
type T6 = QueryResult<`SELECT convert_currency(id)::float8 AS "x" FROM users`, WideSchema>;
type _T6 = RequireTrue<AssertEqual<T6, { x: number }>>;

// ADVERSARIAL (load-bearing): T4 must NOT be { x: number }.
type T7 = QueryResult<`SELECT convert_currency(id)::float8 AS "x" FROM users`, FnSchema>;
type _T7 = RequireTrue<AssertEqual<AssertEqual<T7, { x: number }>, false>>;

// Builtin still wins over a colliding schema entry (FnSchema maps `count`→string).
type T8 = QueryResult<`SELECT count(*) AS "c" FROM users`, FnSchema>;
type _T8 = RequireTrue<AssertEqual<T8, { c: number }>>;
