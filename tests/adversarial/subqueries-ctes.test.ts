/**
 * ADVERSARIAL: subqueries, derived tables, CTEs, set operations.
 *
 * `ExtractSelectList` handles at most one leading `with ... select` and finds
 * the first top-level `from`. Scalar subqueries in the select list, derived
 * tables in FROM, multiple/nested/recursive CTEs, and the second branch of a
 * UNION are not modeled.
 */

import type { QueryResult, ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { WideSchema } from "./schemas.js";

// Scalar subquery in the select list -> the subquery's scalar type.
type S1 = QueryResult<
    "SELECT o.id, (SELECT count(*) FROM payments p WHERE p.order_id = o.id) AS pay_count FROM orders o",
    WideSchema
>;
type _S1 = RequireTrue<AssertEqual<S1, { id: number; pay_count: number }>>;

// Derived table (subquery in FROM) with alias; outer columns come from it.
type S2 = QueryResult<
    "SELECT t.cnt FROM (SELECT count(*) AS cnt FROM orders) t",
    WideSchema
>;
type _S2 = RequireTrue<AssertEqual<S2, { cnt: number }>>;

// Single CTE consumed by the main query.
type S3 = QueryResult<
    "WITH recent AS (SELECT id, total FROM orders) SELECT id, total FROM recent",
    WideSchema
>;
type _S3 = RequireTrue<AssertEqual<S3, { id: number; total: number }>>;

// Multiple CTEs.
type S4 = QueryResult<
    "WITH a AS (SELECT id FROM orders), b AS (SELECT id FROM users) SELECT a.id FROM a JOIN b ON a.id = b.id",
    WideSchema
>;
type _S4 = RequireTrue<AssertEqual<S4, { id: number }>>;

// Recursive CTE.
type S5 = QueryResult<
    "WITH RECURSIVE tree AS (SELECT id, parent_id FROM categories WHERE parent_id IS NULL UNION ALL SELECT c.id, c.parent_id FROM categories c JOIN tree t ON c.parent_id = t.id) SELECT id, parent_id FROM tree",
    WideSchema
>;
type _S5 = RequireTrue<AssertEqual<S5, { id: number; parent_id: number | null }>>;

// UNION: both branches share a shape; result is that shape.
type S6 = QueryResult<
    "SELECT id, total FROM orders UNION SELECT id, total FROM orders",
    WideSchema
>;
type _S6 = RequireTrue<AssertEqual<S6, { id: number; total: number }>>;

// UNION where the SECOND branch references an invalid column must be invalid.
type S7 = ValidateSQL<
    "SELECT id FROM orders UNION SELECT not_a_column FROM users",
    WideSchema
>;
type _S7 = RequireTrue<AssertEqual<S7, false>>;

// Subquery in WHERE referencing an invalid column must be invalid.
type S8 = ValidateSQL<
    "SELECT id FROM orders WHERE id IN (SELECT bogus FROM payments)",
    WideSchema
>;
type _S8 = RequireTrue<AssertEqual<S8, false>>;

export type SubqueryAdversarialLoaded = true;
