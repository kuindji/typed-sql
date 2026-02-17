/**
 * Expression Validation Tests
 *
 * Tests for type casting, SQL constants, INTERVAL, and ORDER BY NULLS.
 * If this file compiles without errors, all tests pass.
 */

import type { ValidateSQL } from "../../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../helpers.js";
import type { TestSchema } from "./schemas.js";

// ============================================================================
// Type Casting Validation Tests
// ============================================================================

// Test: Valid type cast returns true
type V_TypeCast = ValidateSQL<
    "SELECT id::text AS id_str FROM users",
    TestSchema
>;
type _V48 = RequireTrue<AssertEqual<V_TypeCast, true>>;

// ============================================================================
// SQL Constants Validation Tests
// ============================================================================

// Test: CURRENT_DATE validates successfully
type V_CurrentDate = ValidateSQL<
    "SELECT CURRENT_DATE AS dt FROM users",
    TestSchema
>;
type _V49 = RequireTrue<AssertEqual<V_CurrentDate, true>>;

// Test: CURRENT_TIMESTAMP validates successfully
type V_CurrentTimestamp = ValidateSQL<
    "SELECT CURRENT_TIMESTAMP AS ts FROM users",
    TestSchema
>;
type _V50 = RequireTrue<AssertEqual<V_CurrentTimestamp, true>>;

// Test: Multiple SQL constants validate successfully
type V_MultiConstants = ValidateSQL<
    "SELECT CURRENT_DATE AS dt, CURRENT_TIME AS tm, CURRENT_TIMESTAMP AS ts FROM users",
    TestSchema
>;
type _V51 = RequireTrue<AssertEqual<V_MultiConstants, true>>;

// Test: SQL constants mixed with columns validate successfully
type V_MixedConstants = ValidateSQL<
    "SELECT id, name, CURRENT_DATE AS dt FROM users",
    TestSchema
>;
type _V52 = RequireTrue<AssertEqual<V_MixedConstants, true>>;

// Test: SQL constants in INSERT (via SELECT) validate successfully
type V_ConstantWithJoin = ValidateSQL<
    "SELECT u.id, CURRENT_USER AS cu FROM users u",
    TestSchema
>;
type _V53 = RequireTrue<AssertEqual<V_ConstantWithJoin, true>>;

// ============================================================================
// INTERVAL Validation Tests
// ============================================================================

// Test: INTERVAL in SELECT validates successfully
type V_IntervalSelect = ValidateSQL<
    "SELECT INTERVAL '1 day' AS duration FROM users",
    TestSchema
>;
type _V61 = RequireTrue<AssertEqual<V_IntervalSelect, true>>;

// Test: INTERVAL with unit validates successfully
type V_IntervalUnit = ValidateSQL<
    "SELECT INTERVAL '1' DAY AS one_day FROM users",
    TestSchema
>;
type _V62 = RequireTrue<AssertEqual<V_IntervalUnit, true>>;

// Test: INTERVAL in WHERE clause validates successfully
type V_IntervalWhere = ValidateSQL<
    "SELECT id, name FROM users WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'",
    TestSchema
>;
type _V63 = RequireTrue<AssertEqual<V_IntervalWhere, true>>;

// Test: INTERVAL in WHERE clause validates successfully
type V_IntervalWhere_1 = ValidateSQL<
    `SELECT *
    FROM users
    WHERE
    id > 10 and
    role = 'admin' and
    (
      created_at is null or
      now() - created_at > interval '17 days'
    )`,
    TestSchema
>;
type _V63_1 = RequireTrue<AssertEqual<V_IntervalWhere_1, true>>;

// Test: INTERVAL mixed with columns validates successfully
type V_IntervalMixed = ValidateSQL<
    "SELECT id, name, INTERVAL '30 days' AS month FROM users",
    TestSchema
>;
type _V64 = RequireTrue<AssertEqual<V_IntervalMixed, true>>;

// Test: Multiple INTERVALs validate successfully
type V_MultiInterval = ValidateSQL<
    "SELECT INTERVAL '1 day' AS day, INTERVAL '1 hour' AS hour FROM users",
    TestSchema
>;
type _V65 = RequireTrue<AssertEqual<V_MultiInterval, true>>;

// Test: INTERVAL with complex duration validates successfully
type V_IntervalComplex = ValidateSQL<
    "SELECT INTERVAL '1 year 2 months 3 days' AS period FROM users",
    TestSchema
>;
type _V66 = RequireTrue<AssertEqual<V_IntervalComplex, true>>;

// ============================================================================
// ORDER BY NULLS FIRST/LAST Validation Tests
// ============================================================================

// Test: ORDER BY NULLS FIRST validates successfully
type V_NullsFirst = ValidateSQL<
    "SELECT id, name FROM users ORDER BY deleted_at NULLS FIRST",
    TestSchema
>;
type _V67 = RequireTrue<AssertEqual<V_NullsFirst, true>>;

// Test: ORDER BY NULLS LAST validates successfully
type V_NullsLast = ValidateSQL<
    "SELECT id, name FROM users ORDER BY deleted_at NULLS LAST",
    TestSchema
>;
type _V68 = RequireTrue<AssertEqual<V_NullsLast, true>>;

// Test: ORDER BY DESC NULLS FIRST validates successfully
type V_DescNullsFirst = ValidateSQL<
    "SELECT id, name FROM users ORDER BY deleted_at DESC NULLS FIRST",
    TestSchema
>;
type _V69 = RequireTrue<AssertEqual<V_DescNullsFirst, true>>;

// Test: ORDER BY ASC NULLS LAST validates successfully
type V_AscNullsLast = ValidateSQL<
    "SELECT id, name FROM users ORDER BY deleted_at ASC NULLS LAST",
    TestSchema
>;
type _V70 = RequireTrue<AssertEqual<V_AscNullsLast, true>>;

// Test: Multiple ORDER BY with NULLS validates successfully
type V_MultiNulls = ValidateSQL<
    "SELECT id, name FROM users ORDER BY deleted_at DESC NULLS FIRST, created_at ASC NULLS LAST",
    TestSchema
>;
type _V71 = RequireTrue<AssertEqual<V_MultiNulls, true>>;

// ============================================================================
// Export for verification
// ============================================================================

export type ExpressionsValidatorTestsPass = true;
