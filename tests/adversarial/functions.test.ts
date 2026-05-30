/**
 * SCALAR / aggregate function return types (CONSERVATIVE CONTRACT).
 *
 * Design choice: only a small set of aggregates with an unambiguous return type
 * are inferred — count/sum/avg -> number, min/max/coalesce -> argument type. Any
 * other function (scalar string/number/date builtins, window functions, JSON
 * builders, etc.) is intentionally left as `unknown`; the query author adds a
 * `::cast` when a concrete type is required. The alias/key always survives — it
 * is only the VALUE type that is `unknown`.
 */

import type { QueryResult } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema } from "./schemas.js";

// round(numeric, int) -> unknown (cast for a concrete type)
type F1 = QueryResult<"SELECT round(price, 2) AS p FROM products", DeepSchema>;
type _F1 = RequireTrue<AssertEqual<F1, { p: unknown }>>;

// length(text) -> unknown
type F2 = QueryResult<"SELECT length(name) AS n FROM products", DeepSchema>;
type _F2 = RequireTrue<AssertEqual<F2, { n: unknown }>>;

// substring(text, ...) -> unknown
type F3 = QueryResult<"SELECT substring(name, 1, 3) AS s FROM products", DeepSchema>;
type _F3 = RequireTrue<AssertEqual<F3, { s: unknown }>>;

// abs(numeric) -> unknown
type F4 = QueryResult<"SELECT abs(discount) AS a FROM products", DeepSchema>;
type _F4 = RequireTrue<AssertEqual<F4, { a: unknown }>>;

// ceil/floor -> unknown
type F5 = QueryResult<"SELECT ceil(price) AS c FROM products", DeepSchema>;
type _F5 = RequireTrue<AssertEqual<F5, { c: unknown }>>;

// now() -> unknown
type F6 = QueryResult<"SELECT now() AS ts FROM products", DeepSchema>;
type _F6 = RequireTrue<AssertEqual<F6, { ts: unknown }>>;

// date_trunc(...) -> unknown
type F7 = QueryResult<"SELECT date_trunc('day', created_at) AS d FROM products", DeepSchema>;
type _F7 = RequireTrue<AssertEqual<F7, { d: unknown }>>;

// extract(...) -> unknown
type F8 = QueryResult<"SELECT extract(year FROM created_at) AS y FROM products", DeepSchema>;
type _F8 = RequireTrue<AssertEqual<F8, { y: unknown }>>;

// to_char(...) -> unknown
type F9 = QueryResult<"SELECT to_char(price, '999.99') AS t FROM products", DeepSchema>;
type _F9 = RequireTrue<AssertEqual<F9, { t: unknown }>>;

// nullif(a, b) -> unknown
type F10 = QueryResult<"SELECT nullif(quantity, 0) AS q FROM products", DeepSchema>;
type _F10 = RequireTrue<AssertEqual<F10, { q: unknown }>>;

// greatest(...) -> unknown
type F11 = QueryResult<"SELECT greatest(price, discount) AS g FROM products", DeepSchema>;
type _F11 = RequireTrue<AssertEqual<F11, { g: unknown }>>;

// least(...) -> unknown
type F12 = QueryResult<"SELECT least(price, discount) AS l FROM products", DeepSchema>;
type _F12 = RequireTrue<AssertEqual<F12, { l: unknown }>>;

// string_agg(...) -> unknown
type F13 = QueryResult<"SELECT string_agg(name, ',') AS names FROM products", DeepSchema>;
type _F13 = RequireTrue<AssertEqual<F13, { names: unknown }>>;

// array_agg(...) -> unknown
type F14 = QueryResult<"SELECT array_agg(id) AS ids FROM products", DeepSchema>;
type _F14 = RequireTrue<AssertEqual<F14, { ids: unknown }>>;

// json_build_object(...) -> unknown
type F15 = QueryResult<"SELECT json_build_object('k', name) AS obj FROM products", DeepSchema>;
type _F15 = RequireTrue<AssertEqual<F15, { obj: unknown }>>;

// row_number() over (...) -> unknown
type F16 = QueryResult<"SELECT row_number() OVER (ORDER BY price) AS rn FROM products", DeepSchema>;
type _F16 = RequireTrue<AssertEqual<F16, { rn: unknown }>>;

// rank() over (...) -> unknown
type F17 = QueryResult<"SELECT rank() OVER (ORDER BY price) AS rk FROM products", DeepSchema>;
type _F17 = RequireTrue<AssertEqual<F17, { rk: unknown }>>;

// coalesce should preserve the union including a literal type, not widen to string
type F18 = QueryResult<"SELECT coalesce(status, 'active') AS st FROM products", DeepSchema>;
type _F18 = RequireTrue<AssertEqual<F18, { st: "active" | "discontinued" | "draft" }>>;

// trim(text) -> unknown
type F19 = QueryResult<"SELECT trim(name) AS t FROM products", DeepSchema>;
type _F19 = RequireTrue<AssertEqual<F19, { t: unknown }>>;

// position(...) -> unknown
type F20 = QueryResult<"SELECT position('a' IN name) AS pos FROM products", DeepSchema>;
type _F20 = RequireTrue<AssertEqual<F20, { pos: unknown }>>;

export type FunctionAdversarialLoaded = true;
