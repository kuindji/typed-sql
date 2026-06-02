/**
 * Feature Validation Tests
 *
 * Tests for aggregates, multi-schema, wildcards, and JSON fields.
 * If this file compiles without errors, all tests pass.
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";
import type { JsonFieldSchema, TestSchema } from "../../fixtures/validation-schemas.js";

// ============================================================================
// Aggregate Validation Tests
// ============================================================================

// Test: Valid aggregate returns true
type V_Agg = ValidateSQL<
    "SELECT COUNT ( * ) AS total FROM users",
    TestSchema
>;
type _V29 = RequireTrue<AssertEqual<V_Agg, true>>;

// Test: Valid aggregate with column returns true
type V_AggCol = ValidateSQL<
    "SELECT SUM ( views ) AS total FROM posts",
    TestSchema
>;
type _V30 = RequireTrue<AssertEqual<V_AggCol, true>>;

// ============================================================================
// Multi-Schema Validation Tests
// ============================================================================

// Test: Valid cross-schema query returns true
type V_CrossSchema = ValidateSQL<
    "SELECT u.name, l.action FROM users AS u INNER JOIN audit.logs AS l ON u.id = l.user_id",
    TestSchema
>;
type _V31 = RequireTrue<AssertEqual<V_CrossSchema, true>>;

// Test: Invalid schema returns error
type V_InvalidSchema = ValidateSQL<
    "SELECT * FROM bad_schema.users",
    TestSchema
>;
type _V32 = RequireTrue<AssertEqual<V_InvalidSchema, false>>;

// ============================================================================
// Table Wildcard Validation Tests
// ============================================================================

// Test: Valid table wildcard returns true
type V_TableWildcard = ValidateSQL<
    "SELECT u.* FROM users AS u",
    TestSchema
>;
type _V33 = RequireTrue<AssertEqual<V_TableWildcard, true>>;

// Test: Invalid table wildcard returns error
type V_InvalidTableWildcard = ValidateSQL<
    "SELECT bad.* FROM users AS u",
    TestSchema
>;
type _V34 = RequireTrue<AssertEqual<V_InvalidTableWildcard, false>>;

// ============================================================================
// JSON Field Validation Tests
// ============================================================================

// Test: Valid JSON field query returns true
type V_JsonField = ValidateSQL<
    "SELECT metadata FROM items",
    JsonFieldSchema
>;
type _V35 = RequireTrue<AssertEqual<V_JsonField, true>>;

// Test: Valid deeply nested JSON field returns true
type V_DeepJsonField = ValidateSQL<
    "SELECT config FROM items",
    JsonFieldSchema
>;
type _V36 = RequireTrue<AssertEqual<V_DeepJsonField, true>>;

// Test: Valid JSON accessor in WHERE returns true
type V_JsonWhere = ValidateSQL<
    "SELECT id FROM items WHERE config->>'key' = 'value'",
    JsonFieldSchema
>;
type _V37 = RequireTrue<AssertEqual<V_JsonWhere, true>>;

// ============================================================================
// LATERAL Source Validation Tests
// ============================================================================

// Real PostgreSQL reporting queries often use LATERAL for "latest child row"
// lookups. `LATERAL` is a source modifier, not a table named `lateral`.
type V_LateralDerivedSource = ValidateSQL<
    "SELECT u.id FROM users u LEFT JOIN LATERAL (SELECT amount FROM payments p WHERE p.order_id = u.id ORDER BY p.created_at DESC LIMIT 1) last_payment ON true",
    WideSchema
>;
type _V38 = RequireTrue<AssertEqual<V_LateralDerivedSource, true>>;

// Function sources can also be lateralized. The function name is the source
// expression, not a schema table that should be existence-checked.
type V_LateralFunctionSource = ValidateSQL<
    "SELECT p.id FROM products p CROSS JOIN LATERAL jsonb_array_elements(p.title::jsonb) elem",
    WideSchema
>;
type _V39 = RequireTrue<AssertEqual<V_LateralFunctionSource, true>>;

// ============================================================================
// Export for verification
// ============================================================================

export type FeaturesValidatorTestsPass = true;
