/**
 * Partial Query Validation Tests
 *
 * Tests for ValidateSQL with partial query fragments.
 * If this file compiles without errors, all tests pass.
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/validation-schemas.js";

// ============================================================================
// Partial Fragment Validation Tests
// ============================================================================

// Test: Partial select list validates columns
type V_PartialSelectList = ValidateSQL<
    "id, name",
    TestSchema
>;
type _P1 = RequireTrue<AssertEqual<V_PartialSelectList, true>>;

// Test: Partial select list with invalid column fails
type V_PartialSelectListInvalid = ValidateSQL<
    "id, bad_column",
    TestSchema
>;
type _P2 = RequireTrue<AssertEqual<V_PartialSelectListInvalid, false>>;

// Test: Partial WHERE clause validates columns
type V_PartialWhere = ValidateSQL<
    "where is_active = true",
    TestSchema
>;
type _P3 = RequireTrue<AssertEqual<V_PartialWhere, true>>;

// Test: Partial WHERE clause with invalid column fails
type V_PartialWhereInvalid = ValidateSQL<
    "where bad_column = 1",
    TestSchema
>;
type _P4 = RequireTrue<AssertEqual<V_PartialWhereInvalid, false>>;

// Test: Partial JOIN ON clause validates qualified columns
type V_PartialJoinOn = ValidateSQL<
    "on users.id = posts.author_id",
    TestSchema
>;
type _P5 = RequireTrue<AssertEqual<V_PartialJoinOn, true>>;

// Test: Partial JOIN ON clause with invalid column fails
type V_PartialJoinOnInvalid = ValidateSQL<
    "on users.bad_column = posts.author_id",
    TestSchema
>;
type _P6 = RequireTrue<AssertEqual<V_PartialJoinOnInvalid, false>>;

// Test: Partial expression validates columns
type V_PartialExpr = ValidateSQL<
    "name || email",
    TestSchema
>;
type _P7 = RequireTrue<AssertEqual<V_PartialExpr, true>>;

// Test: Partial expression with invalid column fails
type V_PartialExprInvalid = ValidateSQL<
    "name || invalid_col",
    TestSchema
>;
type _P8 = RequireTrue<AssertEqual<V_PartialExprInvalid, false>>;

// ============================================================================
// Export for verification
// ============================================================================

export type PartialValidatorTestsPass = true;
