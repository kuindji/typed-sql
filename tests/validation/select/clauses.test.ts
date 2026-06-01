/**
 * Clause Validation Tests
 *
 * Tests for JOIN, WHERE, ORDER BY, GROUP BY, and HAVING clause validation.
 * If this file compiles without errors, all tests pass.
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/validation-schemas.js";

// ============================================================================
// JOIN Validation Tests
// ============================================================================

// Test: Valid INNER JOIN returns true
type V_InnerJoin = ValidateSQL<
    "SELECT u.name, p.title FROM users AS u INNER JOIN posts AS p ON u.id = p.author_id",
    TestSchema
>;
type _V5 = RequireTrue<AssertEqual<V_InnerJoin, true>>;

// Test: Valid LEFT JOIN returns true
type V_LeftJoin = ValidateSQL<
    "SELECT u.name, p.title FROM users AS u LEFT JOIN posts AS p ON u.id = p.author_id",
    TestSchema
>;
type _V6 = RequireTrue<AssertEqual<V_LeftJoin, true>>;

// Test: Valid multiple JOINs returns true
type V_MultiJoin = ValidateSQL<
    `
SELECT u.name, p.title, c.content
FROM users AS u
INNER JOIN posts AS p ON u.id = p.author_id
INNER JOIN comments AS c ON p.id = c.post_id
`,
    TestSchema
>;
type _V7 = RequireTrue<AssertEqual<V_MultiJoin, true>>;

// Test: Invalid JOIN ON column returns error
type V_InvalidJoinOn = ValidateSQL<
    "SELECT u.id FROM users AS u INNER JOIN posts AS p ON u.bad_column = p.author_id",
    TestSchema
>;
type _V8 = RequireTrue<AssertEqual<V_InvalidJoinOn, false>>;

// ============================================================================
// WHERE Clause Validation Tests
// ============================================================================

// Test: Valid WHERE clause returns true
type V_Where = ValidateSQL<
    "SELECT id FROM users WHERE is_active = TRUE",
    TestSchema
>;
type _V9 = RequireTrue<AssertEqual<V_Where, true>>;

// Test: Valid WHERE with table qualifier returns true
type V_WhereQualified = ValidateSQL<
    "SELECT u.id FROM users AS u WHERE u.is_active = TRUE",
    TestSchema
>;
type _V10 = RequireTrue<AssertEqual<V_WhereQualified, true>>;

// Test: Invalid WHERE column returns error
type V_InvalidWhere = ValidateSQL<
    "SELECT id FROM users WHERE bad_column = 1",
    TestSchema
>;
type _V11 = RequireTrue<AssertEqual<V_InvalidWhere, false>>;

// Test: Invalid WHERE column with full validation enabled
type V_InvalidWhereFullValidation = ValidateSQL<
    "SELECT id FROM users WHERE bad_column = 1",
    TestSchema
>;
type _V12 = RequireTrue<AssertEqual<V_InvalidWhereFullValidation, false>>;

// ============================================================================
// ORDER BY Validation Tests
// ============================================================================

// Test: Valid ORDER BY returns true
type V_OrderBy = ValidateSQL<
    "SELECT id FROM users ORDER BY name",
    TestSchema
>;
type _V13 = RequireTrue<AssertEqual<V_OrderBy, true>>;

// Test: Valid ORDER BY with direction returns true
type V_OrderByDesc = ValidateSQL<
    "SELECT id FROM users ORDER BY created_at DESC",
    TestSchema
>;
type _V14 = RequireTrue<AssertEqual<V_OrderByDesc, true>>;

// Test: Invalid ORDER BY column returns error
type V_InvalidOrderBy = ValidateSQL<
    "SELECT id FROM users ORDER BY bad_column",
    TestSchema
>;
type _V15 = RequireTrue<AssertEqual<V_InvalidOrderBy, false>>;

// ============================================================================
// GROUP BY Validation Tests
// ============================================================================

// Test: Valid GROUP BY returns true
type V_GroupBy = ValidateSQL<
    "SELECT role, COUNT ( * ) AS total FROM users GROUP BY role",
    TestSchema
>;
type _V16 = RequireTrue<AssertEqual<V_GroupBy, true>>;

// Test: Invalid GROUP BY column returns error
type V_InvalidGroupBy = ValidateSQL<
    "SELECT id FROM users GROUP BY bad_column",
    TestSchema
>;
type _V17 = RequireTrue<AssertEqual<V_InvalidGroupBy, false>>;

// ============================================================================
// HAVING Validation Tests
// ============================================================================

// Test: Valid HAVING returns true
type V_Having = ValidateSQL<
    "SELECT author_id, COUNT ( * ) AS cnt FROM posts GROUP BY author_id HAVING author_id > 0",
    TestSchema
>;
type _V18 = RequireTrue<AssertEqual<V_Having, true>>;

// Test: Invalid HAVING column returns error
type V_InvalidHaving = ValidateSQL<
    "SELECT author_id FROM posts GROUP BY author_id HAVING bad_column > 0",
    TestSchema
>;
type _V19 = RequireTrue<AssertEqual<V_InvalidHaving, false>>;

// ============================================================================
// Export for verification
// ============================================================================

export type ClausesValidatorTestsPass = true;
