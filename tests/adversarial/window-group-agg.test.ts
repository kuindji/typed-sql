/**
 * ADVERSARIAL: window functions, GROUP BY/HAVING, DISTINCT ON, FILTER.
 *
 * Window functions are unknown functions. `DISTINCT ON (cols)` is only partly
 * stripped (`StripDistinct` removes the leading `distinct ` and leaves
 * `on (cols) ...` in the projection). Aggregate FILTER clauses are unmodeled.
 */

import type { QueryResult, ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { WideSchema } from "./schemas.js";

// Window: sum() OVER (...) -> number.
type W1 = QueryResult<
    "SELECT sum(total) OVER (PARTITION BY user_id) AS running FROM orders",
    WideSchema
>;
type _W1 = RequireTrue<AssertEqual<W1, { running: number }>>;

// Window: row_number() OVER (...) -> unknown (window fns untyped), plain column kept.
type W2 = QueryResult<
    "SELECT id, row_number() OVER (ORDER BY total DESC) AS rn FROM orders",
    WideSchema
>;
type _W2 = RequireTrue<AssertEqual<W2, { id: number; rn: unknown }>>;

// GROUP BY with aggregate + grouping column.
type W3 = QueryResult<
    "SELECT user_id, count(*) AS n FROM orders GROUP BY user_id",
    WideSchema
>;
type _W3 = RequireTrue<AssertEqual<W3, { user_id: number; n: number }>>;

// HAVING referencing aggregate; projection unaffected.
type W4 = QueryResult<
    "SELECT user_id, sum(total) AS spend FROM orders GROUP BY user_id HAVING sum(total) > 100",
    WideSchema
>;
type _W4 = RequireTrue<AssertEqual<W4, { user_id: number; spend: number }>>;

// DISTINCT ON (cols): the ON-list must NOT leak into the projection.
type W5 = QueryResult<
    "SELECT DISTINCT ON (user_id) user_id, total FROM orders ORDER BY user_id",
    WideSchema
>;
type _W5 = RequireTrue<AssertEqual<W5, { user_id: number; total: number }>>;

// Aggregate FILTER (WHERE ...) -> number.
type W6 = QueryResult<
    "SELECT count(*) FILTER (WHERE status = 'paid') AS paid_count FROM orders",
    WideSchema
>;
type _W6 = RequireTrue<AssertEqual<W6, { paid_count: number }>>;

// GROUP BY referencing an invalid column must be invalid.
type W7 = ValidateSQL<
    "SELECT user_id, count(*) FROM orders GROUP BY not_a_column",
    WideSchema
>;
type _W7 = RequireTrue<AssertEqual<W7, false>>;

export type WindowGroupAggAdversarialLoaded = true;
