/**
 * PostgreSQL Function Tests
 *
 * Tests for various PostgreSQL functions and their return types.
 * Functions resolve to `unknown` by default, unless type-casted.
 * If this file compiles without errors, all tests pass.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// ============================================================================
// String Functions
// ============================================================================

// Test: length() is modeled — number, non-null argument → non-null
type M_LengthFunc = QueryResult<
    "SELECT length ( name ) AS name_len FROM users",
    TestSchema
>;
type _F1 = RequireTrue<AssertEqual<M_LengthFunc, { name_len: number; }>>;

// Test: length() with type cast returns the casted type
type M_LengthFuncCast = QueryResult<
    "SELECT length ( name )::int AS name_len FROM users",
    TestSchema
>;
type _F2 = RequireTrue<AssertEqual<M_LengthFuncCast, { name_len: number; }>>;

// Test: concat() function returns unknown by default
type M_ConcatFunc = QueryResult<
    "SELECT concat ( name, ' ', email ) AS full_info FROM users",
    TestSchema
>;
type _F3 = RequireTrue<AssertEqual<M_ConcatFunc, { full_info: string; }>>;

// Test: concat() with type cast returns string
type M_ConcatFuncCast = QueryResult<
    "SELECT concat ( name, email )::text AS full_info FROM users",
    TestSchema
>;
type _F4 = RequireTrue<AssertEqual<M_ConcatFuncCast, { full_info: string; }>>;

// Test: split_part() is modeled — string, non-null arguments → non-null
type M_SplitPartFunc = QueryResult<
    "SELECT split_part ( email, '@', 1 ) AS username FROM users",
    TestSchema
>;
type _F5 = RequireTrue<AssertEqual<M_SplitPartFunc, { username: string; }>>;

// Test: split_part() with type cast
type M_SplitPartFuncCast = QueryResult<
    "SELECT split_part ( email, '@', 1 )::varchar AS username FROM users",
    TestSchema
>;
type _F6 = RequireTrue<AssertEqual<M_SplitPartFuncCast, { username: string; }>>;

// Test: upper() function returns unknown
type M_UpperFunc = QueryResult<
    "SELECT upper ( name ) AS upper_name FROM users",
    TestSchema
>;
type _F9 = RequireTrue<AssertEqual<M_UpperFunc, { upper_name: string; }>>;

// Test: upper() with type cast
type M_UpperFuncCast = QueryResult<
    "SELECT upper ( name )::text AS upper_name FROM users",
    TestSchema
>;
type _F10 = RequireTrue<AssertEqual<M_UpperFuncCast, { upper_name: string; }>>;

// Test: lower() function returns unknown
type M_LowerFunc = QueryResult<
    "SELECT lower ( email ) AS lower_email FROM users",
    TestSchema
>;
type _F11 = RequireTrue<AssertEqual<M_LowerFunc, { lower_email: string; }>>;

// Test: substring() keyword form — the `x from 1 for 5` argument list is not
// comma-separated so the argument types `unknown` → conservative `string | null`
type M_SubstringFunc = QueryResult<
    "SELECT substring ( name from 1 for 5 ) AS short_name FROM users",
    TestSchema
>;
type _F12 = RequireTrue<AssertEqual<M_SubstringFunc, { short_name: string | null; }>>;

// Test: substring() with type cast
type M_SubstringFuncCast = QueryResult<
    "SELECT substring ( name from 1 for 5 )::text AS short_name FROM users",
    TestSchema
>;
type _F13 = RequireTrue<
    AssertEqual<M_SubstringFuncCast, { short_name: string; }>
>;

// Test: trim() is modeled — string, non-null argument → non-null
type M_TrimFunc = QueryResult<
    "SELECT trim ( name ) AS trimmed_name FROM users",
    TestSchema
>;
type _F18 = RequireTrue<AssertEqual<M_TrimFunc, { trimmed_name: string; }>>;

// Test: replace() is modeled — string, non-null arguments → non-null
type M_ReplaceFunc = QueryResult<
    "SELECT replace ( email, '@', '_at_' ) AS safe_email FROM users",
    TestSchema
>;
type _F19 = RequireTrue<AssertEqual<M_ReplaceFunc, { safe_email: string; }>>;

// Test: regexp_replace() function returns unknown
type M_RegexpReplaceFunc = QueryResult<
    "SELECT regexp_replace ( email, '@.*', '' ) AS user_part FROM users",
    TestSchema
>;
type _F20 = RequireTrue<
    AssertEqual<M_RegexpReplaceFunc, { user_part: unknown; }>
>;

// Test (PIN): a strict scalar function whose args mix a RESOLVABLE non-null arg
// with an OPAQUE one (`regexp_replace(...)` → `unknown`) must STILL be nullable.
// Strict scalar fns are NULL iff any arg is NULL, and an unmodeled arg types
// `unknown` (may be NULL) → conservative `| null` (CONTRIBUTING.md contract).
// Guards against the coalesce opaque-arg drop leaking into the scalar-fn null
// check: the drop must live in `CoalesceArgUnion`, not the shared
// `UnionArgTypes` the scalar-fn `null extends …` checks use.
type M_ScalarOpaqueArgNullable = QueryResult<
    "SELECT replace ( name, regexp_replace ( name, 'a', 'b' ), 'x' ) AS r FROM users",
    TestSchema
>;
type _F20b = RequireTrue<
    AssertEqual<M_ScalarOpaqueArgNullable, { r: string | null; }>
>;

// Test: left() function returns unknown
type M_LeftFunc = QueryResult<
    "SELECT left ( name, 3 ) AS initials FROM users",
    TestSchema
>;
type _F21 = RequireTrue<AssertEqual<M_LeftFunc, { initials: unknown; }>>;

// Test: left() with type cast
type M_LeftFuncCast = QueryResult<
    "SELECT left ( name, 3 )::char AS initials FROM users",
    TestSchema
>;
type _F22 = RequireTrue<AssertEqual<M_LeftFuncCast, { initials: string; }>>;

// Test: right() function returns unknown
type M_RightFunc = QueryResult<
    "SELECT right ( name, 3 ) AS suffix FROM users",
    TestSchema
>;
type _F23 = RequireTrue<AssertEqual<M_RightFunc, { suffix: unknown; }>>;

// ============================================================================
// Null Handling Functions
// ============================================================================

// Test: coalesce() over a nullable + a NON-null arg is non-null. `deleted_at`
// is `string | null` but `created_at` is non-null, so PG coalesce is non-null
// (NULL only when EVERY arg is NULL).
type M_CoalesceFunc = QueryResult<
    "SELECT coalesce ( deleted_at, created_at ) AS date FROM users",
    TestSchema
>;
type _F7 = RequireTrue<AssertEqual<M_CoalesceFunc, { date: string; }>>;

// Test: coalesce() with type cast
type M_CoalesceFuncCast = QueryResult<
    "SELECT coalesce ( deleted_at, created_at )::timestamp AS date FROM users",
    TestSchema
>;
type _F8 = RequireTrue<AssertEqual<M_CoalesceFuncCast, { date: Date; }>>;

// Test: coalesce() with one OPAQUE arg (an untypable function such as
// `regexp_replace(...)` → `unknown`) keeps the type of the RESOLVABLE args
// instead of letting the opaque arm widen the whole result to `unknown`.
// Postgres requires all coalesce args to share a common type, so this is sound.
type M_CoalesceDropUnknown = QueryResult<
    "SELECT coalesce ( deleted_at, regexp_replace ( email, '@.*', '' ) ) AS retailer FROM users",
    TestSchema
>;
type _F7b = RequireTrue<
    AssertEqual<M_CoalesceDropUnknown, { retailer: string | null; }>
>;

// Test: a non-null arg before the opaque arm keeps the result NON-null —
// the dropped `unknown` arm must not re-introduce nullability.
type M_CoalesceDropUnknownNonNull = QueryResult<
    "SELECT coalesce ( name, regexp_replace ( name, 'a', 'b' ) ) AS label FROM users",
    TestSchema
>;
type _F7c = RequireTrue<
    AssertEqual<M_CoalesceDropUnknownNonNull, { label: string; }>
>;

// Test: when EVERY arg is opaque there is nothing typeable to keep, so the
// result falls back to `unknown` (unchanged from the historical behavior).
type M_CoalesceAllUnknown = QueryResult<
    "SELECT coalesce ( regexp_replace ( email, '@.*', '' ), regexp_replace ( name, 'a', 'b' ) ) AS x FROM users",
    TestSchema
>;
type _F7d = RequireTrue<AssertEqual<M_CoalesceAllUnknown, { x: unknown; }>>;

// ============================================================================
// Date/Time Functions
// ============================================================================

// Test: now() function (no arguments) returns unknown
type M_NowFunc = QueryResult<
    "SELECT now ( ) AS current_time FROM users",
    TestSchema
>;
type _F14 = RequireTrue<AssertEqual<M_NowFunc, { current_time: unknown; }>>;

// Test: now() with type cast
type M_NowFuncCast = QueryResult<
    "SELECT now ( )::timestamp AS current_time FROM users",
    TestSchema
>;
type _F15 = RequireTrue<AssertEqual<M_NowFuncCast, { current_time: Date; }>>;

// Test: date_part() function returns unknown
type M_DatePartFunc = QueryResult<
    "SELECT date_part ( 'year', created_at ) AS year FROM users",
    TestSchema
>;
type _F16 = RequireTrue<AssertEqual<M_DatePartFunc, { year: unknown; }>>;

// Test: date_part() with type cast returns number
type M_DatePartFuncCast = QueryResult<
    "SELECT date_part ( 'year', created_at )::int AS year FROM users",
    TestSchema
>;
type _F17 = RequireTrue<AssertEqual<M_DatePartFuncCast, { year: number; }>>;

// Test: to_char() is modeled — string, non-null arguments → non-null
type M_ToCharFunc = QueryResult<
    "SELECT to_char ( created_at, 'YYYY-MM-DD' ) AS date_str FROM users",
    TestSchema
>;
type _F39 = RequireTrue<AssertEqual<M_ToCharFunc, { date_str: string; }>>;

// Test: to_char() with type cast
type M_ToCharFuncCast = QueryResult<
    "SELECT to_char ( created_at, 'YYYY-MM-DD' )::text AS date_str FROM users",
    TestSchema
>;
type _F40 = RequireTrue<AssertEqual<M_ToCharFuncCast, { date_str: string; }>>;

// ============================================================================
// Aggregate Functions (non-standard)
// ============================================================================

// Test: array_agg() is modeled — element-type array, nullable (zero rows → NULL)
type M_ArrayAggFunc = QueryResult<
    "SELECT array_agg ( name ) AS names FROM users",
    TestSchema
>;
type _F24 = RequireTrue<AssertEqual<M_ArrayAggFunc, { names: string[] | null; }>>;

// Test: string_agg() is modeled — string, nullable (zero rows → NULL)
type M_StringAggFunc = QueryResult<
    "SELECT string_agg ( name, ', ' ) AS all_names FROM users",
    TestSchema
>;
type _F25 = RequireTrue<AssertEqual<M_StringAggFunc, { all_names: string | null; }>>;

// Test: string_agg() with type cast
type M_StringAggFuncCast = QueryResult<
    "SELECT string_agg ( name, ', ' )::text AS all_names FROM users",
    TestSchema
>;
// (the cast does not rescue the ungrouped empty-input NULL)
type _F26 = RequireTrue<
    AssertEqual<M_StringAggFuncCast, { all_names: string | null; }>
>;

// ============================================================================
// Math Functions
// ============================================================================

// Test: abs() is modeled — number, non-null argument → non-null
type M_AbsFunc = QueryResult<
    "SELECT abs ( views ) AS abs_views FROM posts",
    TestSchema
>;
type _F27 = RequireTrue<AssertEqual<M_AbsFunc, { abs_views: number; }>>;

// Test: abs() with type cast returns number
type M_AbsFuncCast = QueryResult<
    "SELECT abs ( views )::int AS abs_views FROM posts",
    TestSchema
>;
type _F28 = RequireTrue<AssertEqual<M_AbsFuncCast, { abs_views: number; }>>;

// Test: round() is modeled — arithmetic first argument resolves to number
type M_RoundFunc = QueryResult<
    "SELECT round ( views / 10.0, 2 ) AS rounded_views FROM posts",
    TestSchema
>;
type _F29 = RequireTrue<AssertEqual<M_RoundFunc, { rounded_views: number; }>>;

// Test: round() with type cast
type M_RoundFuncCast = QueryResult<
    "SELECT round ( views / 10.0, 2 )::numeric AS rounded_views FROM posts",
    TestSchema
>;
type _F30 = RequireTrue<
    AssertEqual<M_RoundFuncCast, { rounded_views: string; }>
>;

// ============================================================================
// Mixed and Nested Functions
// ============================================================================

// Test: Mixed: function with regular columns
type M_MixedFuncAndCols = QueryResult<
    "SELECT id, name, length ( name )::int AS name_len FROM users",
    TestSchema
>;
type _F31 = RequireTrue<
    AssertEqual<
        M_MixedFuncAndCols,
        { id: number; name: string; name_len: number; }
    >
>;

// Test: Nested functions return unknown
type M_NestedFuncs = QueryResult<
    "SELECT upper ( trim ( name ) ) AS cleaned_name FROM users",
    TestSchema
>;
type _F32 = RequireTrue<AssertEqual<M_NestedFuncs, { cleaned_name: string; }>>;

// Test: Nested functions with type cast
type M_NestedFuncsCast = QueryResult<
    "SELECT upper ( trim ( name ) )::text AS cleaned_name FROM users",
    TestSchema
>;
type _F33 = RequireTrue<
    AssertEqual<M_NestedFuncsCast, { cleaned_name: string; }>
>;

// Test: Function in expression (e.g., length() > 5)
type M_FuncInExpr = QueryResult<
    "SELECT id FROM users WHERE length ( name ) > 5",
    TestSchema
>;
type _F34 = RequireTrue<AssertEqual<M_FuncInExpr, { id: number; }>>;

// ============================================================================
// Validation Tests
// ============================================================================

// Test: ValidateSQL passes for function calls
type V_FuncValid = ValidateSQL<
    "SELECT length ( name ) AS len FROM users",
    TestSchema
>;
type _F35 = RequireTrue<AssertEqual<V_FuncValid, true>>;

// Test: ValidateSQL passes for function with unknown arg (string literal)
type V_FuncLiteralValid = ValidateSQL<
    "SELECT concat ( 'Hello', name ) AS greeting FROM users",
    TestSchema
>;
type _F36 = RequireTrue<AssertEqual<V_FuncLiteralValid, true>>;

// Test: ValidateSQL fails for function with invalid column
type V_FuncInvalidCol = ValidateSQL<
    "SELECT length ( bad_column ) AS len FROM users",
    TestSchema
>;
type _F37 = RequireTrue<AssertEqual<V_FuncInvalidCol, false>>;

// ============================================================================
// Export for verification
// ============================================================================

export type FunctionsTestsPass = true;
