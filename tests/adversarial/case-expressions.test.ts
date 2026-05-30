/**
 * CASE expression typing (CONSERVATIVE CONTRACT).
 *
 * Design choice: a `CASE ... END` expression is a complex multi-branch
 * expression whose result type is intentionally left `unknown` — the author
 * casts the whole expression when a concrete type is needed. The alias/key is
 * always preserved. The one typed case is a CASE wrapped in a known aggregate
 * (e.g. `sum(CASE ... END)`), where the aggregate fixes the result to `number`
 * (see C6).
 */

import type { QueryResult } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema } from "./schemas.js";

// Searched CASE -> unknown (cast the whole expression for a concrete type)
type C1 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN 'expensive' ELSE 'cheap' END AS tier FROM products",
    DeepSchema
>;
type _C1 = RequireTrue<AssertEqual<C1, { tier: unknown }>>;

// Simple CASE -> unknown
type C2 = QueryResult<
    "SELECT CASE status WHEN 'active' THEN 1 ELSE 0 END AS flag FROM products",
    DeepSchema
>;
type _C2 = RequireTrue<AssertEqual<C2, { flag: unknown }>>;

// CASE returning columns -> unknown
type C3 = QueryResult<
    "SELECT CASE WHEN discount IS NULL THEN price ELSE discount END AS effective FROM products",
    DeepSchema
>;
type _C3 = RequireTrue<AssertEqual<C3, { effective: unknown }>>;

// CASE without ELSE -> unknown
type C4 = QueryResult<
    "SELECT CASE WHEN price > 0 THEN name END AS maybe_name FROM products",
    DeepSchema
>;
type _C4 = RequireTrue<AssertEqual<C4, { maybe_name: unknown }>>;

// Nested CASE -> unknown
type C5 = QueryResult<
    "SELECT CASE WHEN price > 100 THEN CASE WHEN quantity > 0 THEN 'a' ELSE 'b' END ELSE 'c' END AS x FROM products",
    DeepSchema
>;
type _C5 = RequireTrue<AssertEqual<C5, { x: unknown }>>;

// CASE inside an aggregate -> number
type C6 = QueryResult<
    "SELECT sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count FROM products",
    DeepSchema
>;
type _C6 = RequireTrue<AssertEqual<C6, { active_count: number }>>;

export type CaseAdversarialLoaded = true;
