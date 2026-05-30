/**
 * ADVERSARIAL: CASE expression typing.
 *
 * There is no CASE handling in `ExprType`. A `CASE ... END` expression has no
 * surrounding parens and is not a known function, so it resolves to `unknown`.
 * Correct typing is the union of the branch result types.
 */

import type { QueryResult } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema } from "./schemas.js";

// Searched CASE returning string literals -> union of literals
type C1 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN 'expensive' ELSE 'cheap' END AS tier FROM products",
    DeepSchema
>;
type _C1 = RequireTrue<AssertEqual<C1, { tier: "expensive" | "cheap" }>>;

// Simple CASE returning numbers -> number
type C2 = QueryResult<
    "SELECT CASE status WHEN 'active' THEN 1 ELSE 0 END AS flag FROM products",
    DeepSchema
>;
type _C2 = RequireTrue<AssertEqual<C2, { flag: 1 | 0 }>>;

// CASE returning columns -> union of column types
type C3 = QueryResult<
    "SELECT CASE WHEN discount IS NULL THEN price ELSE discount END AS effective FROM products",
    DeepSchema
>;
type _C3 = RequireTrue<AssertEqual<C3, { effective: number }>>;

// CASE without ELSE -> branch type | null
type C4 = QueryResult<
    "SELECT CASE WHEN price > 0 THEN name END AS maybe_name FROM products",
    DeepSchema
>;
type _C4 = RequireTrue<AssertEqual<C4, { maybe_name: string | null }>>;

// Nested CASE -> union of inner/outer branch types
type C5 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN CASE WHEN quantity > 0 THEN 'a' ELSE 'b' END ELSE 'c' END AS x FROM products",
    DeepSchema
>;
type _C5 = RequireTrue<AssertEqual<C5, { x: "a" | "b" | "c" }>>;

// CASE inside an aggregate -> number
type C6 = QueryResult<
    "SELECT sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count FROM products",
    DeepSchema
>;
type _C6 = RequireTrue<AssertEqual<C6, { active_count: number }>>;

export type CaseAdversarialLoaded = true;
