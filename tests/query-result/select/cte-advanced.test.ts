/**
 * ADVERSARIAL: CTE final-projection (root cause B/A, round 2).
 *
 * `ExtractSelectList` greedily matches `with ${string} select ${After}`, so the
 * INNER CTE select list leaks out as the query result instead of the OUTER
 * `SELECT ... FROM cte` projection. Output aliases and `WITH t(a,b)` column
 * lists are dropped too.
 *
 * Each assertion asserts the CORRECT result. Lines marked BUG demonstrate the
 * inner-list leak.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// --- BUG: outer projection ignored; inner CTE list leaks ---
type T1 = QueryResult<"WITH t AS (SELECT id, name FROM users) SELECT id FROM t", WideSchema>;
type _T1 = RequireTrue<AssertEqual<T1, { id: number }>>;

// --- BUG: outer output alias dropped ---
type T2 = QueryResult<"WITH t AS (SELECT id FROM users) SELECT id AS uid FROM t", WideSchema>;
type _T2 = RequireTrue<AssertEqual<T2, { uid: number }>>;

// --- BUG: WITH t(a, b) column-alias list dropped ---
type T3 = QueryResult<"WITH t(a, b) AS (SELECT id, name FROM users) SELECT a, b FROM t", WideSchema>;
type _T3 = RequireTrue<AssertEqual<T3, { a: number; b: string }>>;

// --- BUG: outer reorders/renames columns ---
type T4 = QueryResult<"WITH t AS (SELECT id, name FROM users) SELECT name AS label FROM t", WideSchema>;
type _T4 = RequireTrue<AssertEqual<T4, { label: string }>>;

// ===========================================================================
// CONTROLS
// ===========================================================================

// `SELECT * FROM cte` returns the inner row (correct here by coincidence).
type C1 = QueryResult<"WITH t AS (SELECT id, name FROM users) SELECT * FROM t", WideSchema>;
type _C1 = RequireTrue<AssertEqual<C1, { id: number; name: string }>>;

// Invalid column in the CTE BODY is rejected.
type C2 = ValidateSQL<"WITH t AS (SELECT bogus FROM users) SELECT id FROM t", WideSchema>;
type _C2 = RequireTrue<AssertEqual<C2, false>>;

export type CteAdvancedAdversarialLoaded = true;
