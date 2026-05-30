/**
 * ADVERSARIAL: scalar / aggregate function return types.
 *
 * `FunctionReturn` only knows count|sum|avg|min|max|upper|lower|concat|coalesce.
 * Every other function returns `unknown`. The assertions below encode the
 * correct Postgres/MySQL return types, so each should be RED.
 */

import type { QueryResult } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema } from "./schemas.js";

// round(numeric, int) -> number
type F1 = QueryResult<"SELECT round(price, 2) AS p FROM products", DeepSchema>;
type _F1 = RequireTrue<AssertEqual<F1, { p: number }>>;

// length(text) -> number
type F2 = QueryResult<"SELECT length(name) AS n FROM products", DeepSchema>;
type _F2 = RequireTrue<AssertEqual<F2, { n: number }>>;

// substring(text, ...) -> string
type F3 = QueryResult<"SELECT substring(name, 1, 3) AS s FROM products", DeepSchema>;
type _F3 = RequireTrue<AssertEqual<F3, { s: string }>>;

// abs(numeric) -> number
type F4 = QueryResult<"SELECT abs(discount) AS a FROM products", DeepSchema>;
type _F4 = RequireTrue<AssertEqual<F4, { a: number }>>;

// ceil/floor -> number
type F5 = QueryResult<"SELECT ceil(price) AS c FROM products", DeepSchema>;
type _F5 = RequireTrue<AssertEqual<F5, { c: number }>>;

// now() -> string (timestamp)
type F6 = QueryResult<"SELECT now() AS ts FROM products", DeepSchema>;
type _F6 = RequireTrue<AssertEqual<F6, { ts: string }>>;

// date_trunc(...) -> string
type F7 = QueryResult<"SELECT date_trunc('day', created_at) AS d FROM products", DeepSchema>;
type _F7 = RequireTrue<AssertEqual<F7, { d: string }>>;

// extract(...) -> number
type F8 = QueryResult<"SELECT extract(year FROM created_at) AS y FROM products", DeepSchema>;
type _F8 = RequireTrue<AssertEqual<F8, { y: number }>>;

// to_char(...) -> string
type F9 = QueryResult<"SELECT to_char(price, '999.99') AS t FROM products", DeepSchema>;
type _F9 = RequireTrue<AssertEqual<F9, { t: string }>>;

// nullif(a, b) -> type of a (number | null)
type F10 = QueryResult<"SELECT nullif(quantity, 0) AS q FROM products", DeepSchema>;
type _F10 = RequireTrue<AssertEqual<F10, { q: number | null }>>;

// greatest(...) -> number
type F11 = QueryResult<"SELECT greatest(price, discount) AS g FROM products", DeepSchema>;
type _F11 = RequireTrue<AssertEqual<F11, { g: number }>>;

// least(...) -> number
type F12 = QueryResult<"SELECT least(price, discount) AS l FROM products", DeepSchema>;
type _F12 = RequireTrue<AssertEqual<F12, { l: number }>>;

// string_agg(...) -> string
type F13 = QueryResult<"SELECT string_agg(name, ',') AS names FROM products", DeepSchema>;
type _F13 = RequireTrue<AssertEqual<F13, { names: string }>>;

// array_agg(...) -> array
type F14 = QueryResult<"SELECT array_agg(id) AS ids FROM products", DeepSchema>;
type _F14 = RequireTrue<AssertEqual<F14, { ids: number[] }>>;

// json_build_object(...) -> object/json (unknown is too lossy; should be a record)
type F15 = QueryResult<"SELECT json_build_object('k', name) AS obj FROM products", DeepSchema>;
type _F15 = RequireTrue<AssertEqual<F15, { obj: Record<string, unknown> }>>;

// row_number() over (...) -> number
type F16 = QueryResult<"SELECT row_number() OVER (ORDER BY price) AS rn FROM products", DeepSchema>;
type _F16 = RequireTrue<AssertEqual<F16, { rn: number }>>;

// rank() over (...) -> number
type F17 = QueryResult<"SELECT rank() OVER (ORDER BY price) AS rk FROM products", DeepSchema>;
type _F17 = RequireTrue<AssertEqual<F17, { rk: number }>>;

// coalesce should preserve the union including a literal type, not widen to string
type F18 = QueryResult<"SELECT coalesce(status, 'active') AS st FROM products", DeepSchema>;
type _F18 = RequireTrue<AssertEqual<F18, { st: "active" | "discontinued" | "draft" }>>;

// trim(text) -> string
type F19 = QueryResult<"SELECT trim(name) AS t FROM products", DeepSchema>;
type _F19 = RequireTrue<AssertEqual<F19, { t: string }>>;

// position(...) -> number
type F20 = QueryResult<"SELECT position('a' IN name) AS pos FROM products", DeepSchema>;
type _F20 = RequireTrue<AssertEqual<F20, { pos: number }>>;

export type FunctionAdversarialLoaded = true;
