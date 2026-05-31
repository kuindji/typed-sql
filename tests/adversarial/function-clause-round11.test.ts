/**
 * ADVERSARIAL round 11: function-local clause blind spots and quoted aliases
 * with operator punctuation.
 *
 * These cases target valid PostgreSQL syntax that hides column references
 * inside SELECT-list constructs the shallow scanner currently treats as opaque:
 * keyword-style function arguments, aggregate ORDER BY modifiers, ordered-set
 * aggregate WITHIN GROUP clauses, and quoted table aliases containing operator
 * punctuation.
 */

import type { QueryResult, ValidateSQL } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { WideSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// RED: EXTRACT uses keyword syntax (`field FROM source`) inside the function
// argument list. A real source column should be accepted; rejecting it means the
// parser is treating the date-part token / keyword syntax as ordinary column
// refs rather than function-local grammar.
// ---------------------------------------------------------------------------

type ExtractGoodColumn = ValidateSQL<"SELECT extract(year FROM created_at) AS y FROM products", WideSchema>;
type _ExtractGoodColumn = RequireTrue<AssertEqual<ExtractGoodColumn, true>>;

// Control: a bogus EXTRACT source column is currently rejected.
type ExtractBadColumn = ValidateSQL<"SELECT extract(year FROM bogus_col) AS y FROM products", WideSchema>;
type _ExtractBadColumn = RequireTrue<AssertEqual<ExtractBadColumn, false>>;

// RED: ordinary comma-style function arguments should reject invalid bare
// columns in the SELECT list.
type CommaFuncBadColumn = ValidateSQL<"SELECT date_trunc('day', bogus_col) AS d FROM products", WideSchema>;
type _CommaFuncBadColumn = RequireTrue<AssertEqual<CommaFuncBadColumn, false>>;

// ---------------------------------------------------------------------------
// RED: aggregate-local ORDER BY is part of the aggregate argument list, not a
// top-level ORDER BY. Its column refs still need validation.
// ---------------------------------------------------------------------------

type AggregateOrderBadArg = ValidateSQL<"SELECT array_agg(bogus_col ORDER BY created_at) AS ids FROM products", WideSchema>;
type _AggregateOrderBadArg = RequireTrue<AssertEqual<AggregateOrderBadArg, false>>;

type AggregateOrderBadSort = ValidateSQL<"SELECT array_agg(id ORDER BY bogus_col) AS ids FROM products", WideSchema>;
type _AggregateOrderBadSort = RequireTrue<AssertEqual<AggregateOrderBadSort, false>>;

// Control: aggregate-local ORDER BY with real columns should pass.
type AggregateOrderGood = ValidateSQL<"SELECT array_agg(id ORDER BY created_at) AS ids FROM products", WideSchema>;
type _AggregateOrderGood = RequireTrue<AssertEqual<AggregateOrderGood, true>>;

// ---------------------------------------------------------------------------
// RED: ordered-set aggregates validate the expression in WITHIN GROUP
// (ORDER BY ...). The current window/filter surfacing does not include this
// clause, so invalid ORDER BY columns can hide before the top-level FROM.
// ---------------------------------------------------------------------------

type WithinGroupBadColumn = ValidateSQL<"SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY bogus_col) AS p FROM products", WideSchema>;
type _WithinGroupBadColumn = RequireTrue<AssertEqual<WithinGroupBadColumn, false>>;

// Control: the same ordered-set aggregate with a real column should pass.
type WithinGroupGood = ValidateSQL<"SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS p FROM products", WideSchema>;
type _WithinGroupGood = RequireTrue<AssertEqual<WithinGroupGood, true>>;

// ---------------------------------------------------------------------------
// RED: quoted table aliases may contain operator punctuation. The validation
// path may accept them loosely, but result inference should still resolve the
// qualified column to the underlying table instead of degrading to unknown.
// ---------------------------------------------------------------------------

type QuotedPunctAliasResult = QueryResult<'SELECT "u-1".id FROM users AS "u-1"', WideSchema>;
type _QuotedPunctAliasResult = RequireTrue<AssertEqual<QuotedPunctAliasResult, { id: number }>>;

// Control: a simple quoted alias still resolves.
type QuotedSimpleAliasResult = QueryResult<'SELECT "u1".id FROM users AS "u1"', WideSchema>;
type _QuotedSimpleAliasResult = RequireTrue<AssertEqual<QuotedSimpleAliasResult, { id: number }>>;

export type FunctionClauseRound11Loaded = true;
