/**
 * ADVERSARIAL round 13: real PostgreSQL operators and DML RETURNING literals.
 *
 * These cases target ordinary SQL that currently falls through shallow string
 * extractors. They are intentionally small: no report-scale strings, no deep
 * nesting, and no artificial TypeScript-depth pressure.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema, WideSchema } from "../../fixtures/parser-schemas.js";

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
    AssertEqual<ReturningLiteralAfterClauseResult, { marker: string; id: number }>
>;

// RED: dollar-quoted strings before the real RETURNING clause are assignment
// values, not RETURNING markers.
type ReturningInsideDollarQuotedSetValid = ValidateSQL<
    "UPDATE products SET title = $$ returning bogus_col$$ WHERE id = 1 RETURNING id",
    WideSchema
>;
type _ReturningInsideDollarQuotedSetValid = RequireTrue<AssertEqual<ReturningInsideDollarQuotedSetValid, true>>;

type ReturningInsideDollarQuotedSetResult = QueryResult<
    "UPDATE products SET title = $$ returning bogus_col$$ WHERE id = 1 RETURNING id",
    WideSchema
>;
type _ReturningInsideDollarQuotedSetResult = RequireTrue<
    AssertEqual<ReturningInsideDollarQuotedSetResult, { id: number }>
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

// ---------------------------------------------------------------------------
// RED: JSON text extraction in a RETURNING expression has the same result type
// as in SELECT projection: `->>` / `#>>` yields text. This is common when DML
// returns denormalized payload fields for event/outbox processing.
// ---------------------------------------------------------------------------

type ReturningJsonTextExtraction = QueryResult<
    "UPDATE products SET title = 'x' RETURNING attributes::jsonb->>'brand' AS brand",
    DeepSchema
>;
type _ReturningJsonTextExtraction = RequireTrue<
    AssertEqual<ReturningJsonTextExtraction, { brand: string }>
>;

export type ReturningDistinctFromRound13Loaded = true;
