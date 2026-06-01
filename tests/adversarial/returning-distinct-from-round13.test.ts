/**
 * ADVERSARIAL round 13: real PostgreSQL operators and DML RETURNING literals.
 *
 * These cases target ordinary SQL that currently falls through shallow string
 * extractors. They are intentionally small: no report-scale strings, no deep
 * nesting, and no artificial TypeScript-depth pressure.
 */

import type { QueryResult, ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { WideSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// RED: `RETURNING` result inference must use the real DML RETURNING clause, not
// a later ` returning ` substring inside one of the returned string literals.
// Validation already accepts this query; the row shape is what is wrong.
// ---------------------------------------------------------------------------

type ReturningLiteralAfterClauseValid = ValidateSQL<
    "UPDATE products SET title = 'x' WHERE id = 1 RETURNING ' returning bogus_col' AS marker, id",
    WideSchema
>;
type _ReturningLiteralAfterClauseValid = RequireTrue<AssertEqual<ReturningLiteralAfterClauseValid, true>>;

type ReturningLiteralAfterClauseResult = QueryResult<
    "UPDATE products SET title = 'x' WHERE id = 1 RETURNING ' returning bogus_col' AS marker, id",
    WideSchema
>;
type _ReturningLiteralAfterClauseResult = RequireTrue<
    AssertEqual<ReturningLiteralAfterClauseResult, { marker: " returning bogus_col"; id: number }>
>;

// Control: a genuinely invalid RETURNING column should still fail.
type RealReturningBadColumn = ValidateSQL<"UPDATE products SET title = 'x' WHERE id = 1 RETURNING bogus_col", WideSchema>;
type _RealReturningBadColumn = RequireTrue<AssertEqual<RealReturningBadColumn, false>>;

// ---------------------------------------------------------------------------
// RED: `IS [NOT] DISTINCT FROM` is a comparison operator. The RHS after its
// `FROM` keyword is an expression and must be scanned for invalid columns.
// ---------------------------------------------------------------------------

type IsDistinctFromValid = ValidateSQL<"SELECT id FROM products WHERE price IS DISTINCT FROM price", WideSchema>;
type _IsDistinctFromValid = RequireTrue<AssertEqual<IsDistinctFromValid, true>>;

type IsDistinctFromInvalidRhs = ValidateSQL<"SELECT id FROM products WHERE price IS DISTINCT FROM bogus_col", WideSchema>;
type _IsDistinctFromInvalidRhs = RequireTrue<AssertEqual<IsDistinctFromInvalidRhs, false>>;

type IsNotDistinctFromInvalidRhs = ValidateSQL<"SELECT id FROM products WHERE price IS NOT DISTINCT FROM bogus_col", WideSchema>;
type _IsNotDistinctFromInvalidRhs = RequireTrue<AssertEqual<IsNotDistinctFromInvalidRhs, false>>;

export type ReturningDistinctFromRound13Loaded = true;
