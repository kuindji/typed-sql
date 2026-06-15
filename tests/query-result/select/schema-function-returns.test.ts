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
