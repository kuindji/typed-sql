/**
 * DELETE Validator Type Tests
 *
 * Tests for ValidateDeleteSQL and related validation functionality.
 * If this file compiles without errors, all tests pass.
 */

import type {
  ValidateDeleteSQL,
  IsValidDelete,
  GetDeleteTableColumns,
} from "../../../src/index.js"
import type { AssertEqual, RequireTrue, RequireFalse } from "../../fixtures/helpers.js"

// ============================================================================
// Test Schema
// ============================================================================

type TestSchema = {
  defaultSchema: "public"
  schemas: {
    public: {
      users: {
        id: number
        name: string
        email: string
        active: boolean
        account_id: number
      }
      posts: {
        id: number
        title: string
        content: string
        author_id: number
      }
      accounts: {
        id: number
        user_id: number
        status: string
      }
    }
    admin: {
      settings: {
        key: string
        value: string
      }
    }
  }
}

// ============================================================================
// Valid DELETE Tests
// ============================================================================

// Test: Basic valid DELETE
type V_Basic = ValidateDeleteSQL<"DELETE FROM users WHERE id = 1", TestSchema>
type _V1 = RequireTrue<AssertEqual<V_Basic, true>>

// Test: DELETE without WHERE
type V_NoWhere = ValidateDeleteSQL<"DELETE FROM users", TestSchema>
type _V2 = RequireTrue<AssertEqual<V_NoWhere, true>>

// Test: DELETE with RETURNING
type V_Returning = ValidateDeleteSQL<
  "DELETE FROM users WHERE id = 1 RETURNING id , name",
  TestSchema
>
type _V3 = RequireTrue<AssertEqual<V_Returning, true>>

// Test: DELETE with RETURNING *
type V_ReturningStar = ValidateDeleteSQL<
  "DELETE FROM users WHERE id = 1 RETURNING *",
  TestSchema
>
type _V4 = RequireTrue<AssertEqual<V_ReturningStar, true>>

// Test: DELETE with USING
type V_Using = ValidateDeleteSQL<
  "DELETE FROM users USING accounts WHERE users.account_id = accounts.id",
  TestSchema
>
type _V5 = RequireTrue<AssertEqual<V_Using, true>>

// Test: DELETE with schema.table
type V_SchemaTable = ValidateDeleteSQL<
  "DELETE FROM admin.settings WHERE key = 'theme'",
  TestSchema
>
type _V6 = RequireTrue<AssertEqual<V_SchemaTable, true>>

// ============================================================================
// Invalid DELETE Tests - Table/Schema Errors
// ============================================================================

// Test: Non-existent table
type V_BadTable = ValidateDeleteSQL<"DELETE FROM nonexistent WHERE id = 1", TestSchema>
type _V7 = RequireTrue<
  AssertEqual<V_BadTable, false>
>

// Test: Non-existent schema
type V_BadSchema = ValidateDeleteSQL<"DELETE FROM fake.users WHERE id = 1", TestSchema>
type _V8 = RequireTrue<AssertEqual<V_BadSchema, false>>

// ============================================================================
// Invalid DELETE Tests - Column Errors
// ============================================================================

// Test: Invalid RETURNING column
type V_BadReturningCol = ValidateDeleteSQL<
  "DELETE FROM users WHERE id = 1 RETURNING badcolumn",
  TestSchema
>
type _V9 = RequireTrue<
  AssertEqual<V_BadReturningCol, false>
>

// ============================================================================
// Invalid DELETE Tests - USING Errors
// ============================================================================

// Test: Invalid USING table
type V_BadUsingTable = ValidateDeleteSQL<
  "DELETE FROM users USING nonexistent WHERE users.id = nonexistent.user_id",
  TestSchema
>
type _V10 = RequireTrue<
  AssertEqual<V_BadUsingTable, false>
>

// ============================================================================
// IsValidDelete Tests
// ============================================================================

// Test: Valid returns true
type IV_Valid = IsValidDelete<"DELETE FROM users WHERE id = 1", TestSchema>
type _IV1 = RequireTrue<IV_Valid>

// Test: Invalid returns false
type IV_Invalid = IsValidDelete<"DELETE FROM nonexistent WHERE id = 1", TestSchema>
type _IV2 = RequireFalse<IV_Invalid>

// ============================================================================
// GetDeleteTableColumns Tests
// ============================================================================

// Test: Get columns from users table
type GC_Users = GetDeleteTableColumns<"DELETE FROM users WHERE id = 1", TestSchema>
type _GC1 = RequireTrue<
  AssertEqual<GC_Users, { id: number; name: string; email: string; active: boolean; account_id: number }>
>

// Test: Get columns from posts table
type GC_Posts = GetDeleteTableColumns<"DELETE FROM posts WHERE id = 1", TestSchema>
type _GC2 = RequireTrue<
  AssertEqual<GC_Posts, { id: number; title: string; content: string; author_id: number }>
>

// Test: Get columns from schema.table
type GC_Settings = GetDeleteTableColumns<
  "DELETE FROM admin.settings WHERE key = 'theme'",
  TestSchema
>
type _GC3 = RequireTrue<AssertEqual<GC_Settings, { key: string; value: string }>>

// ============================================================================
// Export for verification
// ============================================================================

export type DeleteValidatorTestsPass = true
