/**
 * ADVERSARIAL round 12: quote-aware structural scans and typed literals.
 *
 * These cases target raw substring extractors that look for SQL structure
 * markers (`OVER`, `FILTER`, `WITHIN GROUP`, `DISTINCT ON`, `USING`,
 * `RETURNING`, `EXTRACT`) without first proving the marker is outside a string
 * literal or quoted identifier. They also cover PostgreSQL typed string
 * literals, whose leading type names should not be treated as column refs.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// ---------------------------------------------------------------------------
// RED: clause-marker extractors must ignore marker text inside string literals.
// These are plain string projections; no column named `bogus_col` is referenced.
// ---------------------------------------------------------------------------

type StringOverMarker = ValidateSQL<"SELECT ' over (bogus_col)' AS marker FROM products", WideSchema>;
type _StringOverMarker = RequireTrue<AssertEqual<StringOverMarker, true>>;

type StringFilterMarker = ValidateSQL<"SELECT ' filter (where bogus_col > 0)' AS marker FROM products", WideSchema>;
type _StringFilterMarker = RequireTrue<AssertEqual<StringFilterMarker, true>>;

type StringWithinGroupMarker = ValidateSQL<"SELECT ' within group (order by bogus_col)' AS marker FROM products", WideSchema>;
type _StringWithinGroupMarker = RequireTrue<AssertEqual<StringWithinGroupMarker, true>>;

type StringDistinctOnMarker = ValidateSQL<"SELECT ' distinct on (bogus_col)' AS marker FROM products", WideSchema>;
type _StringDistinctOnMarker = RequireTrue<AssertEqual<StringDistinctOnMarker, true>>;

type StringUsingMarker = ValidateSQL<"SELECT ' using (bogus_col)' AS marker FROM products", WideSchema>;
type _StringUsingMarker = RequireTrue<AssertEqual<StringUsingMarker, true>>;

// RED: PostgreSQL dollar-quoted literals are also string literals. Clause-looking
// text inside them must not be scanned as SQL structure or column refs.
type DollarQuotedOverMarker = ValidateSQL<"SELECT $$ over (bogus_col)$$ AS marker FROM products", WideSchema>;
type _DollarQuotedOverMarker = RequireTrue<AssertEqual<DollarQuotedOverMarker, true>>;

type TaggedDollarQuotedUsingMarker = ValidateSQL<"SELECT $tag$ using (bogus_col)$tag$ AS marker FROM products", WideSchema>;
type _TaggedDollarQuotedUsingMarker = RequireTrue<AssertEqual<TaggedDollarQuotedUsingMarker, true>>;

// RED: the same structural markers inside quoted output aliases are identifier
// text, not clauses that should surface column refs.
type QuotedAliasOverMarker = ValidateSQL<'SELECT id AS "window over (bogus_col)" FROM products', WideSchema>;
type _QuotedAliasOverMarker = RequireTrue<AssertEqual<QuotedAliasOverMarker, true>>;

// Control: a real OVER clause with the same invalid column should still fail.
type RealOverBadColumn = ValidateSQL<"SELECT row_number() OVER (PARTITION BY bogus_col) AS rn FROM products", WideSchema>;
type _RealOverBadColumn = RequireTrue<AssertEqual<RealOverBadColumn, false>>;

// ---------------------------------------------------------------------------
// RED: RETURNING extraction should start at the actual DML RETURNING clause,
// not at text inside a string literal assigned earlier in the statement.
// ---------------------------------------------------------------------------

type ReturningInsideStringLiteral = ValidateSQL<
    "UPDATE products SET title = ' returning bogus_col' WHERE id = 1 RETURNING id",
    WideSchema
>;
type _ReturningInsideStringLiteral = RequireTrue<AssertEqual<ReturningInsideStringLiteral, true>>;

type ReturningInsideStringResult = QueryResult<
    "UPDATE products SET title = ' returning bogus_col' WHERE id = 1 RETURNING id",
    WideSchema
>;
type _ReturningInsideStringResult = RequireTrue<AssertEqual<ReturningInsideStringResult, { id: number }>>;

// Control: a real bogus RETURNING column remains invalid.
type RealReturningBadColumn = ValidateSQL<"UPDATE products SET title = 'x' WHERE id = 1 RETURNING bogus_col", WideSchema>;
type _RealReturningBadColumn = RequireTrue<AssertEqual<RealReturningBadColumn, false>>;

// ---------------------------------------------------------------------------
// RED: the EXTRACT rewrite must not rewrite string literal contents. The literal
// is treated as a single opaque value (type widens to string), NOT split into a
// fake EXTRACT call.
// ---------------------------------------------------------------------------

type ExtractTextLiteralResult = QueryResult<"SELECT ' extract(year from created_at)' AS marker FROM products", WideSchema>;
type _ExtractTextLiteralResult = RequireTrue<
    AssertEqual<ExtractTextLiteralResult, { marker: string }>
>;

// Control: real EXTRACT syntax is still valid.
type RealExtractGoodColumn = ValidateSQL<"SELECT extract(year FROM created_at) AS y FROM products", WideSchema>;
type _RealExtractGoodColumn = RequireTrue<AssertEqual<RealExtractGoodColumn, true>>;

// RED: MULTIPLE real EXTRACT calls in a query that ALSO contains a string
// literal (so it takes the quote-aware rewrite path). The quote-aware rewrite
// previously emitted the suffix after the first rewritten extract verbatim, so
// the SECOND extract kept its inner ` from <col> ` — the table collector then
// mistook that source for a real FROM clause and the query was rejected.
type MultiExtractWithLiteral = ValidateSQL<
    "SELECT extract(year FROM created_at) AS y, extract(month FROM created_at) AS m, 'tag' AS marker FROM products",
    WideSchema
>;
type _MultiExtractWithLiteral = RequireTrue<AssertEqual<MultiExtractWithLiteral, true>>;

// ---------------------------------------------------------------------------
// RED: PostgreSQL typed string literals should be accepted as literals, not
// treated as references to columns named `date` or `timestamp`.
// ---------------------------------------------------------------------------

type DateTypedLiteral = ValidateSQL<"SELECT DATE '2026-05-31' AS d FROM products", WideSchema>;
type _DateTypedLiteral = RequireTrue<AssertEqual<DateTypedLiteral, true>>;

type TimestampTypedLiteral = ValidateSQL<"SELECT TIMESTAMP '2026-05-31 12:34:56' AS ts FROM products", WideSchema>;
type _TimestampTypedLiteral = RequireTrue<AssertEqual<TimestampTypedLiteral, true>>;

export type QuoteAwareStructuralRound12Loaded = true;
