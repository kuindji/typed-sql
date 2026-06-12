/**
 * SCALAR / aggregate function return types (CONSERVATIVE CONTRACT).
 *
 * Design choice: only functions with an unambiguous return type are
 * inferred — count -> number, sum/avg -> number (argument nullability
 * propagates), min/max/coalesce -> argument type, extract -> number (nullable
 * when its source argument may be NULL), strict numeric scalars
 * (length/round/abs/…) -> number, strict string scalars
 * (trim/replace/to_char/…) -> string (both propagate argument nullability),
 * string_agg/bool_and/bool_or/array_agg -> argument-driven types. On top of
 * that, EVERY whole-aggregate projection except count gains `| null` in a
 * query with no GROUP BY (zero rows -> NULL). Any other
 * function (date builtins, window functions, JSON builders, etc.) is
 * intentionally left as `unknown`; the query author adds a `::cast` when a
 * concrete type is required. The alias/key always survives — it is only the
 * VALUE type that is `unknown`.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// round(numeric, int) -> number (strict numeric scalar)
type F1 = QueryResult<"SELECT round(price, 2) AS p FROM products", DeepSchema>;
type _F1 = RequireTrue<AssertEqual<F1, { p: number }>>;

// length(text) -> number
type F2 = QueryResult<"SELECT length(name) AS n FROM products", DeepSchema>;
type _F2 = RequireTrue<AssertEqual<F2, { n: number }>>;

// substring(text, int, int) comma form -> string
type F3 = QueryResult<"SELECT substring(name, 1, 3) AS s FROM products", DeepSchema>;
type _F3 = RequireTrue<AssertEqual<F3, { s: string }>>;

// abs(nullable numeric) -> number | null (strict: NULL in, NULL out)
type F4 = QueryResult<"SELECT abs(discount) AS a FROM products", DeepSchema>;
type _F4 = RequireTrue<AssertEqual<F4, { a: number | null }>>;

// ceil/floor -> number
type F5 = QueryResult<"SELECT ceil(price) AS c FROM products", DeepSchema>;
type _F5 = RequireTrue<AssertEqual<F5, { c: number }>>;

// now() -> unknown
type F6 = QueryResult<"SELECT now() AS ts FROM products", DeepSchema>;
type _F6 = RequireTrue<AssertEqual<F6, { ts: unknown }>>;

// date_trunc(...) -> unknown
type F7 = QueryResult<"SELECT date_trunc('day', created_at) AS d FROM products", DeepSchema>;
type _F7 = RequireTrue<AssertEqual<F7, { d: unknown }>>;

// extract(...) -> number (Postgres EXTRACT always returns a numeric value
// regardless of field/source, so typing it is unambiguous and contract-legal);
// nullable when the source argument is nullable (EXTRACT of NULL is NULL).
type F8 = QueryResult<"SELECT extract(year FROM created_at) AS y FROM products", DeepSchema>;
type _F8 = RequireTrue<AssertEqual<F8, { y: number }>>;

// extract over a nullable aggregate -> number | null (min/max over a nullable
// column can be NULL; mirrors the reporting cohort `extract(epoch from min(...))`)
type F8b = QueryResult<"SELECT extract(epoch FROM max(discount)) AS e FROM products", DeepSchema>;
type _F8b = RequireTrue<AssertEqual<F8b, { e: number | null }>>;

// to_char(...) -> string (strict string scalar)
type F9 = QueryResult<"SELECT to_char(price, '999.99') AS t FROM products", DeepSchema>;
type _F9 = RequireTrue<AssertEqual<F9, { t: string }>>;

// nullif(a, b) -> unknown
type F10 = QueryResult<"SELECT nullif(quantity, 0) AS q FROM products", DeepSchema>;
type _F10 = RequireTrue<AssertEqual<F10, { q: unknown }>>;

// greatest(...) -> unknown
type F11 = QueryResult<"SELECT greatest(price, discount) AS g FROM products", DeepSchema>;
type _F11 = RequireTrue<AssertEqual<F11, { g: unknown }>>;

// least(...) -> unknown
type F12 = QueryResult<"SELECT least(price, discount) AS l FROM products", DeepSchema>;
type _F12 = RequireTrue<AssertEqual<F12, { l: unknown }>>;

// string_agg(...) -> string | null (aggregate over zero rows is NULL)
type F13 = QueryResult<"SELECT string_agg(name, ',') AS names FROM products", DeepSchema>;
type _F13 = RequireTrue<AssertEqual<F13, { names: string | null }>>;

// array_agg(...) -> element-type array | null
type F14 = QueryResult<"SELECT array_agg(id) AS ids FROM products", DeepSchema>;
type _F14 = RequireTrue<AssertEqual<F14, { ids: number[] | null }>>;

// json_build_object(...) -> unknown
type F15 = QueryResult<"SELECT json_build_object('k', name) AS obj FROM products", DeepSchema>;
type _F15 = RequireTrue<AssertEqual<F15, { obj: unknown }>>;

// row_number() over (...) -> unknown
type F16 = QueryResult<"SELECT row_number() OVER (ORDER BY price) AS rn FROM products", DeepSchema>;
type _F16 = RequireTrue<AssertEqual<F16, { rn: unknown }>>;

// rank() over (...) -> unknown
type F17 = QueryResult<"SELECT rank() OVER (ORDER BY price) AS rk FROM products", DeepSchema>;
type _F17 = RequireTrue<AssertEqual<F17, { rk: unknown }>>;

// coalesce(enum, 'literal'): the string literal arg widens to string, so the
// merged union collapses to string (literals are not preserved).
type F18 = QueryResult<"SELECT coalesce(status, 'active') AS st FROM products", DeepSchema>;
type _F18 = RequireTrue<AssertEqual<F18, { st: string }>>;

// trim(text) -> string
type F19 = QueryResult<"SELECT trim(name) AS t FROM products", DeepSchema>;
type _F19 = RequireTrue<AssertEqual<F19, { t: string }>>;

// position(...) -> unknown
type F20 = QueryResult<"SELECT position('a' IN name) AS pos FROM products", DeepSchema>;
type _F20 = RequireTrue<AssertEqual<F20, { pos: unknown }>>;

export type FunctionAdversarialLoaded = true;
