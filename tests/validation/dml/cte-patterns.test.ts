/**
 * ADVERSARIAL round 14: CTE validation, WITH-prefixed DML, and pattern operators.
 *
 * Kept intentionally small. These are ordinary PostgreSQL forms that affect
 * application queries directly; none relies on report-scale strings, deep
 * recursion, or TypeScript limit pressure.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// ---------------------------------------------------------------------------
// RED: a valid CTE SELECT should validate. Result inference already has CTE
// support, but validation still treats the CTE name as a missing base table.
// ---------------------------------------------------------------------------

type CteSelectValid = ValidateSQL<"WITH t AS (SELECT id FROM products) SELECT id FROM t", WideSchema>;
type _CteSelectValid = RequireTrue<AssertEqual<CteSelectValid, true>>;

// Control: an invalid column inside the CTE body should still be rejected.
type CteBodyInvalidColumn = ValidateSQL<"WITH t AS (SELECT bogus_col FROM products) SELECT id FROM t", WideSchema>;
type _CteBodyInvalidColumn = RequireTrue<AssertEqual<CteBodyInvalidColumn, false>>;

// ---------------------------------------------------------------------------
// RED: WITH can prefix data-modifying statements. Return inference should use
// the top-level UPDATE ... RETURNING list, not the CTE body's SELECT list.
// ---------------------------------------------------------------------------

type WithUpdateValid = ValidateSQL<
    "WITH changed AS (SELECT id FROM products WHERE status = 'inactive') UPDATE products SET status = 'active' WHERE id = 1 RETURNING id, status",
    WideSchema
>;
type _WithUpdateValid = RequireTrue<AssertEqual<WithUpdateValid, true>>;

type WithUpdateResult = QueryResult<
    "WITH changed AS (SELECT id FROM products WHERE status = 'inactive') UPDATE products SET status = 'active' WHERE id = 1 RETURNING id, status",
    WideSchema
>;
type _WithUpdateResult = RequireTrue<AssertEqual<WithUpdateResult, { id: number; status: "active" | "inactive" }>>;

// ---------------------------------------------------------------------------
// RED: ILIKE is a pattern-matching operator. Its RHS is an expression, so a
// column there must be validated just like the RHS of LIKE.
// ---------------------------------------------------------------------------

type IlikeLiteralPatternValid = ValidateSQL<"SELECT id FROM products WHERE title ILIKE 'shoe%'", WideSchema>;
type _IlikeLiteralPatternValid = RequireTrue<AssertEqual<IlikeLiteralPatternValid, true>>;

type IlikeInvalidRhs = ValidateSQL<"SELECT id FROM products WHERE title ILIKE bogus_col", WideSchema>;
type _IlikeInvalidRhs = RequireTrue<AssertEqual<IlikeInvalidRhs, false>>;

export type CteDmlPatternRound14Loaded = true;
