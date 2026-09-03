/**
 * Function typing breadth — scalar + aggregate functions with unambiguous
 * Postgres return types.
 *
 * Strict scalar functions (numeric: length/round/abs/…, string:
 * trim/replace/lpad/…) return their base type and are NULL iff an argument
 * is NULL, so argument nullability propagates (an unmodeled argument types
 * `unknown`, which may include null → conservative `| null`).
 *
 * Aggregates (except count) are SQL NULL over an all-NULL group — possible
 * only when the argument is nullable, so argument nullability propagates —
 * AND over empty input, which only happens without GROUP BY: ungrouped
 * whole-aggregate projections gain `| null` via `ApplyUngroupedAggNull`
 * regardless of the argument's nullability.
 *
 * If this file compiles without errors, all tests pass.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// ============================================================================
// Numeric scalar functions
// ============================================================================

// Non-null argument → plain number
type M_Length = QueryResult<
    "SELECT length(name) AS l FROM users",
    TestSchema
>;
type _N1 = RequireTrue<AssertEqual<M_Length, { l: number }>>;

// Nullable argument → number | null
type M_LengthNullable = QueryResult<
    "SELECT length(deleted_at) AS l FROM users",
    TestSchema
>;
type _N2 = RequireTrue<AssertEqual<M_LengthNullable, { l: number | null }>>;

type M_CharLength = QueryResult<
    "SELECT char_length(name) AS cl FROM users",
    TestSchema
>;
type _N3 = RequireTrue<AssertEqual<M_CharLength, { cl: number }>>;

// Numeric-literal second argument stays non-null
type M_Round = QueryResult<
    "SELECT round(views, 2) AS r FROM posts",
    TestSchema
>;
type _N4 = RequireTrue<AssertEqual<M_Round, { r: number }>>;

type M_Abs = QueryResult<"SELECT abs(views) AS a FROM posts", TestSchema>;
type _N5 = RequireTrue<AssertEqual<M_Abs, { a: number }>>;

type M_Mod = QueryResult<"SELECT mod(views, 7) AS m FROM posts", TestSchema>;
type _N6 = RequireTrue<AssertEqual<M_Mod, { m: number }>>;

// Nested modeled call as argument
type M_NestedNumeric = QueryResult<
    "SELECT round(abs(views)) AS ra FROM posts",
    TestSchema
>;
type _N7 = RequireTrue<AssertEqual<M_NestedNumeric, { ra: number }>>;

// Arithmetic sub-expression as argument
type M_FloorArith = QueryResult<
    "SELECT floor(views / 2) AS f FROM posts",
    TestSchema
>;
type _N8 = RequireTrue<AssertEqual<M_FloorArith, { f: number }>>;

// Unaliased → named after the function
type M_UnaliasedLength = QueryResult<
    "SELECT length(name) FROM users",
    TestSchema
>;
type _N9 = RequireTrue<AssertEqual<M_UnaliasedLength, { length: number }>>;

// ============================================================================
// String scalar functions
// ============================================================================

type M_Trim = QueryResult<"SELECT trim(name) AS t FROM users", TestSchema>;
type _S1 = RequireTrue<AssertEqual<M_Trim, { t: string }>>;

type M_TrimNullable = QueryResult<
    "SELECT trim(deleted_at) AS t FROM users",
    TestSchema
>;
type _S2 = RequireTrue<AssertEqual<M_TrimNullable, { t: string | null }>>;

type M_Replace = QueryResult<
    "SELECT replace(email, 'a', 'b') AS r FROM users",
    TestSchema
>;
type _S3 = RequireTrue<AssertEqual<M_Replace, { r: string }>>;

type M_Lpad = QueryResult<
    "SELECT lpad(name, 10, ' ') AS p FROM users",
    TestSchema
>;
type _S4 = RequireTrue<AssertEqual<M_Lpad, { p: string }>>;

type M_Md5 = QueryResult<"SELECT md5(email) AS h FROM users", TestSchema>;
type _S5 = RequireTrue<AssertEqual<M_Md5, { h: string }>>;

type M_SplitPart = QueryResult<
    "SELECT split_part(email, '@', 1) AS u FROM users",
    TestSchema
>;
type _S6 = RequireTrue<AssertEqual<M_SplitPart, { u: string }>>;

type M_ToChar = QueryResult<
    "SELECT to_char(created_at, 'YYYY-MM-DD') AS d FROM users",
    TestSchema
>;
type _S7 = RequireTrue<AssertEqual<M_ToChar, { d: string }>>;

type M_Substr = QueryResult<
    "SELECT substr(name, 1, 5) AS s FROM users",
    TestSchema
>;
type _S8 = RequireTrue<AssertEqual<M_Substr, { s: string }>>;

// `substring(x from 1 for 5)` keyword form: the argument list is not
// comma-separated, so the argument types as `unknown` → conservative
// `string | null` (still better than `unknown`).
type M_SubstringFromForm = QueryResult<
    "SELECT substring(name from 1 for 5) AS s FROM users",
    TestSchema
>;
// The keyword form is rewritten to `substring(name, 1, 5)` during normalization,
// so it now types exactly like the comma form (`name` is non-null → `string`).
type _S9 = RequireTrue<AssertEqual<M_SubstringFromForm, { s: string }>>;

// upper()/lower() are strict — argument nullability propagates
type M_Upper = QueryResult<"SELECT upper(name) AS u FROM users", TestSchema>;
type _S10 = RequireTrue<AssertEqual<M_Upper, { u: string }>>;

type M_LowerNullable = QueryResult<
    "SELECT lower(deleted_at) AS l FROM users",
    TestSchema
>;
type _S11 = RequireTrue<AssertEqual<M_LowerNullable, { l: string | null }>>;

// ============================================================================
// Aggregates — ungrouped (empty input → NULL, regardless of field nullability)
// ============================================================================

// string_agg without GROUP BY: zero rows → NULL
type M_StringAgg = QueryResult<
    "SELECT string_agg(name, ',') AS names FROM users",
    TestSchema
>;
type _A1 = RequireTrue<AssertEqual<M_StringAgg, { names: string | null }>>;

type M_BoolAnd = QueryResult<
    "SELECT bool_and(is_active) AS all_active FROM users",
    TestSchema
>;
type _A2 = RequireTrue<AssertEqual<M_BoolAnd, { all_active: boolean | null }>>;

type M_BoolOr = QueryResult<
    "SELECT bool_or(is_active) AS any_active FROM users",
    TestSchema
>;
type _A3 = RequireTrue<AssertEqual<M_BoolOr, { any_active: boolean | null }>>;

// array_agg(col) → element-type array; aggregate itself nullable (zero rows)
type M_ArrayAgg = QueryResult<
    "SELECT array_agg(id) AS ids FROM users",
    TestSchema
>;
type _A4 = RequireTrue<AssertEqual<M_ArrayAgg, { ids: number[] | null }>>;

// Nullable column → elements keep their nullability
type M_ArrayAggNullable = QueryResult<
    "SELECT array_agg(deleted_at) AS ds FROM users",
    TestSchema
>;
type _A5 = RequireTrue<
    AssertEqual<M_ArrayAggNullable, { ds: (string | null)[] | null }>
>;

// sum/avg/min/max without GROUP BY are nullable even over a NON-NULL column
type M_SumUngrouped = QueryResult<
    "SELECT sum(views) AS v FROM posts",
    TestSchema
>;
type _A6 = RequireTrue<AssertEqual<M_SumUngrouped, { v: number | null }>>;

type M_MaxUngrouped = QueryResult<
    "SELECT max(views) AS m FROM posts",
    TestSchema
>;
type _A7 = RequireTrue<AssertEqual<M_MaxUngrouped, { m: number | null }>>;

// ... including unaliased and outer-cast forms
type M_SumUnaliased = QueryResult<"SELECT sum(views) FROM posts", TestSchema>;
type _A8 = RequireTrue<AssertEqual<M_SumUnaliased, { sum: number | null }>>;

type M_SumCast = QueryResult<
    "SELECT sum(views)::int AS v FROM posts",
    TestSchema
>;
type _A9 = RequireTrue<AssertEqual<M_SumCast, { v: number | null }>>;

// count is NEVER null — zero rows count to 0
type M_CountUngrouped = QueryResult<
    "SELECT count(*) AS c FROM users",
    TestSchema
>;
type _A10 = RequireTrue<AssertEqual<M_CountUngrouped, { c: number }>>;

// coalesce around an ungrouped aggregate rescues the NULL (head is coalesce,
// not an aggregate — and SQL agrees: coalesce(sum(x), 0) of zero rows is 0)
type M_CoalescedSum = QueryResult<
    "SELECT coalesce(sum(views), 0) AS v FROM posts",
    TestSchema
>;
type _A11 = RequireTrue<AssertEqual<M_CoalescedSum, { v: number }>>;

// ============================================================================
// Aggregates — grouped (groups are non-empty: field nullability is the story)
// ============================================================================

// Non-null argument + GROUP BY → non-null aggregate
type M_SumGrouped = QueryResult<
    "SELECT author_id, sum(views) AS v FROM posts GROUP BY author_id",
    TestSchema
>;
type _A12 = RequireTrue<
    AssertEqual<M_SumGrouped, { author_id: number; v: number }>
>;

type M_StringAggGrouped = QueryResult<
    "SELECT role, string_agg(name, ',') AS names FROM users GROUP BY role",
    TestSchema
>;
type _A13 = RequireTrue<
    AssertEqual<
        M_StringAggGrouped,
        { role: "admin" | "user" | "guest"; names: string }
    >
>;

type M_BoolAndGrouped = QueryResult<
    "SELECT role, bool_and(is_active) AS aa FROM users GROUP BY role",
    TestSchema
>;
type _A14 = RequireTrue<
    AssertEqual<M_BoolAndGrouped, { role: "admin" | "user" | "guest"; aa: boolean }>
>;

type M_ArrayAggGrouped = QueryResult<
    "SELECT role, array_agg(id) AS ids FROM users GROUP BY role",
    TestSchema
>;
type _A15 = RequireTrue<
    AssertEqual<M_ArrayAggGrouped, { role: "admin" | "user" | "guest"; ids: number[] }>
>;

// Nullable argument + GROUP BY → still nullable (an all-NULL group sums to NULL)
type M_SumGroupedNullable = QueryResult<
    "SELECT action, sum(user_id) AS s FROM audit.logs GROUP BY action",
    TestSchema
>;
type _A16 = RequireTrue<
    AssertEqual<M_SumGroupedNullable, { action: string; s: number | null }>
>;

export type FunctionTypingBreadthTestsPass = true;
