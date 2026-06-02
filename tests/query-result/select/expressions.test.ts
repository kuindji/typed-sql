/**
 * Expression Tests
 *
 * Tests for concatenation operators, literals, parameters, arithmetic, and SQL constants.
 * If this file compiles without errors, all tests pass.
 */

import type { QueryResult, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// ============================================================================
// PostgreSQL Concatenation Operator Tests
// ============================================================================

// Test: Simple string concatenation with || operator returns string
// (|| is unambiguously string concatenation under the conservative contract)
type M_ConcatSimple = QueryResult<
    "SELECT name || email AS combined FROM users",
    TestSchema
>;
type _C1 = RequireTrue<AssertEqual<M_ConcatSimple, { combined: string; }>>;

// Test: Concatenation with type cast returns casted type
type M_ConcatCast = QueryResult<
    "SELECT (name || email)::text AS combined FROM users",
    TestSchema
>;
type _C2 = RequireTrue<AssertEqual<M_ConcatCast, { combined: string; }>>;

// Test: Concatenation with literal strings returns string
type M_ConcatLiteral = QueryResult<
    "SELECT name || ' - ' || email AS display FROM users",
    TestSchema
>;
type _C3 = RequireTrue<AssertEqual<M_ConcatLiteral, { display: string; }>>;

// Test: ValidateSQL returns true for concatenation queries (columns are validated)
type V_ConcatValid = ValidateSQL<"SELECT name || email FROM users", TestSchema>;
type _C4 = RequireTrue<AssertEqual<V_ConcatValid, true>>;

// Test: ValidateSQL catches invalid column in concatenation
type V_ConcatInvalid = ValidateSQL<
    "SELECT name || invalid_col FROM users",
    TestSchema
>;
type _C5 = RequireTrue<AssertEqual<V_ConcatInvalid, false>>;

// ============================================================================
// Literal Value Type Inference Tests
// ============================================================================

// Test: Numeric literal widens to number (literals are not preserved)
type M_NumericLiteral = QueryResult<"SELECT 1 AS num FROM users", TestSchema>;
type _L1 = RequireTrue<AssertEqual<M_NumericLiteral, { num: number; }>>;

// Test: String literal widens to string (literals are not preserved)
type M_StringLiteral = QueryResult<
    "SELECT 'hello' AS greeting FROM users",
    TestSchema
>;
type _L2 = RequireTrue<AssertEqual<M_StringLiteral, { greeting: string; }>>;

// Test: NULL literal returns null type
type M_NullLiteral = QueryResult<
    "SELECT NULL AS nothing FROM users",
    TestSchema
>;
type _L3 = RequireTrue<AssertEqual<M_NullLiteral, { nothing: null; }>>;

type M_NullLiteral_1 = QueryResult<
    "SELECT *, NULL AS nothing FROM users",
    TestSchema
>;
type _L3_1 = RequireTrue<
    AssertExtends<
        M_NullLiteral_1,
        {
            id: number;
            name: string;
            email: string;
            role: "admin" | "user" | "guest";
            is_active: boolean;
            created_at: string;
            deleted_at: string | null;
            nothing: null;
        }
    >
>;

// Test: TRUE literal widens to boolean (literals are not preserved)
type M_TrueLiteral = QueryResult<"SELECT TRUE AS flag FROM users", TestSchema>;
type _L4 = RequireTrue<AssertEqual<M_TrueLiteral, { flag: boolean; }>>;

// Test: FALSE literal widens to boolean (literals are not preserved)
type M_FalseLiteral = QueryResult<
    "SELECT FALSE AS inactive FROM users",
    TestSchema
>;
type _L5 = RequireTrue<AssertEqual<M_FalseLiteral, { inactive: boolean; }>>;

// Test: Mix of literals and columns
type M_MixedLiteralsCols = QueryResult<
    "SELECT id, 1 AS one, name, 'test' AS str FROM users",
    TestSchema
>;
type _L6 = RequireTrue<
    AssertEqual<
        M_MixedLiteralsCols,
        { id: number; one: number; name: string; str: string; }
    >
>;

// Test: Larger numeric literal also widens to number
type M_LargeNumeric = QueryResult<"SELECT 42 AS answer FROM users", TestSchema>;
type _L7 = RequireTrue<AssertEqual<M_LargeNumeric, { answer: number; }>>;

// Test: String literal with spaces widens to string
type M_StringWithSpaces = QueryResult<
    "SELECT 'hello world' AS msg FROM users",
    TestSchema
>;
type _L8 = RequireTrue<
    AssertEqual<M_StringWithSpaces, { msg: string; }>
>;

// Test: ValidateSQL passes for literal values (no column reference to validate)
type V_LiteralValid = ValidateSQL<
    "SELECT 1 AS num, 'test' AS str FROM users",
    TestSchema
>;
type _L9 = RequireTrue<AssertEqual<V_LiteralValid, true>>;

// ============================================================================
// Parameter Placeholder Type Inference Tests
// ============================================================================

// Test: Parameter placeholder returns unknown
type M_ParamPlaceholder = QueryResult<
    "SELECT $1 AS field_name FROM users",
    TestSchema
>;
type _PP1 = RequireTrue<
    AssertEqual<M_ParamPlaceholder, { field_name: unknown; }>
>;

// Test: Named parameter returns unknown
type M_NamedParam = QueryResult<
    "SELECT :user_id AS uid FROM users",
    TestSchema
>;
type _PP2 = RequireTrue<AssertEqual<M_NamedParam, { uid: unknown; }>>;

// Test: Mix of parameters and columns
type M_MixedParams = QueryResult<
    "SELECT id, $1 AS param FROM users",
    TestSchema
>;
type _PP3 = RequireTrue<
    AssertEqual<M_MixedParams, { id: number; param: unknown; }>
>;

// ============================================================================
// Function Call Type Inference Tests
// ============================================================================

// Test: now() returns unknown
type M_FuncNow = QueryResult<
    "SELECT now ( ) AS created_at FROM users",
    TestSchema
>;
type _FN1 = RequireTrue<AssertEqual<M_FuncNow, { created_at: unknown; }>>;

// Test: concat() returns unknown
type M_FuncConcat2 = QueryResult<
    "SELECT concat ( 'a' , 'b' ) AS combined FROM users",
    TestSchema
>;
type _FN2 = RequireTrue<AssertEqual<M_FuncConcat2, { combined: string; }>>;

// Test: Function with column argument validates the column
type M_FuncWithCol = QueryResult<
    "SELECT upper ( name ) AS upper_name FROM users",
    TestSchema
>;
type _FN3 = RequireTrue<AssertEqual<M_FuncWithCol, { upper_name: string; }>>;

// Test: Function with type cast returns cast type
type M_FuncCast = QueryResult<
    "SELECT now ( ) ::text AS ts FROM users",
    TestSchema
>;
type _FN4 = RequireTrue<AssertEqual<M_FuncCast, { ts: string; }>>;

// Test: ValidateSQL catches invalid column in function
type V_FuncInvalidCol2 = ValidateSQL<
    "SELECT upper ( invalid_col ) AS upper_name FROM users",
    TestSchema
>;
type _FN5 = RequireTrue<AssertEqual<V_FuncInvalidCol2, false>>;

// ============================================================================
// Arithmetic Expression Type Inference Tests
// ============================================================================

// Test: Arithmetic with literals returns unknown
type M_ArithLiteral = QueryResult<"SELECT 1 + 1 AS two FROM users", TestSchema>;
type _AR1 = RequireTrue<AssertEqual<M_ArithLiteral, { two: unknown; }>>;

// Test: Arithmetic with columns returns unknown
type M_ArithCols = QueryResult<
    "SELECT views + 1 AS incremented FROM posts",
    TestSchema
>;
type _AR2 = RequireTrue<AssertEqual<M_ArithCols, { incremented: unknown; }>>;

// Test: Arithmetic with type cast returns cast type
type M_ArithCast = QueryResult<
    "SELECT ( views + 1 ) ::int AS incremented FROM posts",
    TestSchema
>;
type _AR3 = RequireTrue<AssertEqual<M_ArithCast, { incremented: number; }>>;

// ============================================================================
// SQL Constants Type Inference Tests
// ============================================================================

// Test: CURRENT_DATE returns string (date type)
type M_CurrentDate = QueryResult<
    "SELECT CURRENT_DATE AS dt FROM users",
    TestSchema
>;
type _SC1 = RequireTrue<AssertEqual<M_CurrentDate, { dt: string; }>>;

// Test: CURRENT_TIMESTAMP returns string (timestamp type)
type M_CurrentTimestamp = QueryResult<
    "SELECT CURRENT_TIMESTAMP AS ts FROM users",
    TestSchema
>;
type _SC2 = RequireTrue<AssertEqual<M_CurrentTimestamp, { ts: string; }>>;

// Test: CURRENT_TIME returns string (time type)
type M_CurrentTime = QueryResult<
    "SELECT CURRENT_TIME AS t FROM users",
    TestSchema
>;
type _SC3 = RequireTrue<AssertEqual<M_CurrentTime, { t: string; }>>;

// Test: LOCALTIME returns string (time type)
type M_LocalTime = QueryResult<"SELECT LOCALTIME AS lt FROM users", TestSchema>;
type _SC4 = RequireTrue<AssertEqual<M_LocalTime, { lt: string; }>>;

// Test: LOCALTIMESTAMP returns string (timestamp type)
type M_LocalTimestamp = QueryResult<
    "SELECT LOCALTIMESTAMP AS lts FROM users",
    TestSchema
>;
type _SC5 = RequireTrue<AssertEqual<M_LocalTimestamp, { lts: string; }>>;

// Test: CURRENT_USER returns string
type M_CurrentUser = QueryResult<
    "SELECT CURRENT_USER AS u FROM users",
    TestSchema
>;
type _SC6 = RequireTrue<AssertEqual<M_CurrentUser, { u: string; }>>;

// Test: SESSION_USER returns string
type M_SessionUser = QueryResult<
    "SELECT SESSION_USER AS su FROM users",
    TestSchema
>;
type _SC7 = RequireTrue<AssertEqual<M_SessionUser, { su: string; }>>;

// Test: CURRENT_SCHEMA returns string
type M_CurrentSchema = QueryResult<
    "SELECT CURRENT_SCHEMA AS schema FROM users",
    TestSchema
>;
type _SC8 = RequireTrue<AssertEqual<M_CurrentSchema, { schema: string; }>>;

// Test: Mix of SQL constants and columns
type M_MixedConstants = QueryResult<
    "SELECT id, CURRENT_DATE AS dt FROM users",
    TestSchema
>;
type _SC9 = RequireTrue<
    AssertEqual<M_MixedConstants, { id: number; dt: string; }>
>;

// Test: SQL constant with alias
type M_ConstantAlias = QueryResult<
    "SELECT CURRENT_DATE AS today FROM users",
    TestSchema
>;
type _SC10 = RequireTrue<AssertEqual<M_ConstantAlias, { today: string; }>>;

// Test: Multiple SQL constants
type M_MultiConstants = QueryResult<
    "SELECT CURRENT_DATE AS dt, CURRENT_TIME AS tm FROM users",
    TestSchema
>;
type _SC11 = RequireTrue<
    AssertEqual<M_MultiConstants, { dt: string; tm: string; }>
>;

// Test: SQL constants in function calls (concat, etc.) - lowercase should work too
type M_ConstantInFunc = QueryResult<
    "SELECT concat ( '1' , '2' , current_date ) AS result FROM users",
    TestSchema
>;
type _SC12 = RequireTrue<AssertEqual<M_ConstantInFunc, { result: string; }>>;

// Test: SQL constants in function calls with uppercase
type M_ConstantInFuncUpper = QueryResult<
    "SELECT concat ( 'test' , CURRENT_TIMESTAMP ) AS result FROM users",
    TestSchema
>;
type _SC13 = RequireTrue<
    AssertEqual<M_ConstantInFuncUpper, { result: string; }>
>;

// ============================================================================
// Export for verification
// ============================================================================

export type ExpressionsTestsPass = true;
