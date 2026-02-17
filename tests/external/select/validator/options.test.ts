/**
 * ValidateSelectOptions Tests
 *
 * Tests for validation options behavior (e.g., validateAllFields).
 * If this file compiles without errors, all tests pass.
 */

import type { ValidateSQL } from "../../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../helpers.js";
import type { TestSchema } from "./schemas.js";

// ============================================================================
// ValidateSelectOptions Tests
// ============================================================================

// Test: Invalid WHERE fails (partial validation applies to all clauses)
type V_InvalidWhereNoCheck = ValidateSQL<
    "SELECT id FROM users WHERE bad_column = 1",
    TestSchema
>;
type _V20 = RequireTrue<AssertEqual<V_InvalidWhereNoCheck, false>>;

// Test: Invalid ORDER BY fails (partial validation applies to all clauses)
type V_InvalidOrderByNoCheck = ValidateSQL<
    "SELECT id FROM users ORDER BY bad_column",
    TestSchema
>;
type _V21 = RequireTrue<AssertEqual<V_InvalidOrderByNoCheck, false>>;

// Test: Invalid GROUP BY fails (partial validation applies to all clauses)
type V_InvalidGroupByNoCheck = ValidateSQL<
    "SELECT id FROM users GROUP BY bad_column",
    TestSchema
>;
type _V22 = RequireTrue<AssertEqual<V_InvalidGroupByNoCheck, false>>;

// Test: Invalid HAVING fails (partial validation applies to all clauses)
type V_InvalidHavingNoCheck = ValidateSQL<
    "SELECT author_id FROM posts GROUP BY author_id HAVING bad_column > 0",
    TestSchema
>;
type _V23 = RequireTrue<AssertEqual<V_InvalidHavingNoCheck, false>>;

// Test: Invalid JOIN ON fails (qualified columns are validated)
type V_InvalidJoinOnNoCheck = ValidateSQL<
    "SELECT u.id FROM users AS u INNER JOIN posts AS p ON u.bad_column = p.author_id",
    TestSchema
>;
type _V24 = RequireTrue<AssertEqual<V_InvalidJoinOnNoCheck, false>>;

// Test: Invalid SELECT column fails
type V_InvalidSelectNoCheck = ValidateSQL<
    "SELECT bad_column FROM users",
    TestSchema
>;
type _V25 = RequireTrue<AssertEqual<V_InvalidSelectNoCheck, false>>;

// ============================================================================
// Export for verification
// ============================================================================

export type OptionsValidatorTestsPass = true;
