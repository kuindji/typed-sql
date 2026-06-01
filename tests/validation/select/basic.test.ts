/**
 * Basic Validation Tests
 *
 * Tests for simple SELECT queries with basic features.
 * If this file compiles without errors, all tests pass.
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/validation-schemas.js";

// ============================================================================
// Basic Validation Tests
// ============================================================================

// Test: Valid simple query returns true
type V_Simple = ValidateSQL<"SELECT id, name FROM users", TestSchema>;
type _V1 = RequireTrue<AssertEqual<V_Simple, true>>;

// Test: Valid SELECT * returns true
type V_Star = ValidateSQL<"SELECT * FROM users", TestSchema>;
type _V2 = RequireTrue<AssertEqual<V_Star, true>>;

// Test: Valid query with alias returns true
type V_Alias = ValidateSQL<
    "SELECT id AS user_id, name AS display_name FROM users",
    TestSchema
>;
type _V3 = RequireTrue<AssertEqual<V_Alias, true>>;

// Test: Valid query with table alias returns true
type V_TableAlias = ValidateSQL<
    "SELECT u.id, u.name FROM users AS u",
    TestSchema
>;
type _V4 = RequireTrue<AssertEqual<V_TableAlias, true>>;

// ============================================================================
// Export for verification
// ============================================================================

export type BasicValidatorTestsPass = true;
