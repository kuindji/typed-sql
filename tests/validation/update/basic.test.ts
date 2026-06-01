/**
 * UPDATE Validator Type Tests
 *
 * Tests for ValidateUpdateSQL and related validation functionality.
 * If this file compiles without errors, all tests pass.
 */

import type {
  ValidateUpdateSQL,
  IsValidUpdate,
  GetUpdateTableColumns,
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
// Valid UPDATE Tests
// ============================================================================

// Test: Basic valid UPDATE
type V_Basic = ValidateUpdateSQL<"UPDATE users SET name = 'John'", TestSchema>
type _V1 = RequireTrue<AssertEqual<V_Basic, true>>

// Test: UPDATE with WHERE
type V_Where = ValidateUpdateSQL<
  "UPDATE users SET name = 'John' WHERE id = 1",
  TestSchema
>
type _V2 = RequireTrue<AssertEqual<V_Where, true>>

// Test: UPDATE with multiple SET
type V_MultiSet = ValidateUpdateSQL<
  "UPDATE users SET name = 'John' , email = 'john@example.com' , active = TRUE",
  TestSchema
>
type _V3 = RequireTrue<AssertEqual<V_MultiSet, true>>

// Test: UPDATE with RETURNING
type V_Returning = ValidateUpdateSQL<
  "UPDATE users SET name = 'John' RETURNING id , name",
  TestSchema
>
type _V4 = RequireTrue<AssertEqual<V_Returning, true>>

// Test: UPDATE with RETURNING *
type V_ReturningStar = ValidateUpdateSQL<
  "UPDATE users SET name = 'John' RETURNING *",
  TestSchema
>
type _V5 = RequireTrue<AssertEqual<V_ReturningStar, true>>

// Test: UPDATE with schema.table
type V_SchemaTable = ValidateUpdateSQL<
  "UPDATE admin.settings SET value = 'dark'",
  TestSchema
>
type _V6 = RequireTrue<AssertEqual<V_SchemaTable, true>>

// Test: UPDATE with FROM clause
type V_From = ValidateUpdateSQL<
  "UPDATE users SET email = 'new@example.com' FROM accounts WHERE users.id = accounts.user_id",
  TestSchema
>
type _V7 = RequireTrue<AssertEqual<V_From, true>>

// ============================================================================
// Invalid UPDATE Tests - Table/Schema Errors
// ============================================================================

// Test: Non-existent table
type V_BadTable = ValidateUpdateSQL<"UPDATE nonexistent SET name = 'John'", TestSchema>
type _V8 = RequireTrue<
  AssertEqual<V_BadTable, false>
>

// Test: Non-existent schema
type V_BadSchema = ValidateUpdateSQL<"UPDATE fake.users SET name = 'John'", TestSchema>
type _V9 = RequireTrue<AssertEqual<V_BadSchema, false>>

// ============================================================================
// Invalid UPDATE Tests - Column Errors
// ============================================================================

// Test: Non-existent SET column
type V_BadSetCol = ValidateUpdateSQL<
  "UPDATE users SET nonexistent = 'value'",
  TestSchema
>
type _V10 = RequireTrue<
  AssertEqual<V_BadSetCol, false>
>

// Test: Invalid RETURNING column
type V_BadReturningCol = ValidateUpdateSQL<
  "UPDATE users SET name = 'John' RETURNING badcolumn",
  TestSchema
>
type _V11 = RequireTrue<
  AssertEqual<V_BadReturningCol, false>
>

// ============================================================================
// IsValidUpdate Tests
// ============================================================================

// Test: Valid returns true
type IV_Valid = IsValidUpdate<"UPDATE users SET name = 'John'", TestSchema>
type _IV1 = RequireTrue<IV_Valid>

// Test: Invalid returns false
type IV_Invalid = IsValidUpdate<"UPDATE nonexistent SET name = 'John'", TestSchema>
type _IV2 = RequireFalse<IV_Invalid>

// ============================================================================
// GetUpdateTableColumns Tests
// ============================================================================

// Test: Get columns from users table
type GC_Users = GetUpdateTableColumns<"UPDATE users SET name = 'John'", TestSchema>
type _GC1 = RequireTrue<
  AssertEqual<GC_Users, { id: number; name: string; email: string; active: boolean }>
>

// Test: Get columns from posts table
type GC_Posts = GetUpdateTableColumns<"UPDATE posts SET title = 'Title'", TestSchema>
type _GC2 = RequireTrue<
  AssertEqual<GC_Posts, { id: number; title: string; content: string; author_id: number }>
>

// Test: Get columns from schema.table
type GC_Settings = GetUpdateTableColumns<
  "UPDATE admin.settings SET value = 'dark'",
  TestSchema
>
type _GC3 = RequireTrue<AssertEqual<GC_Settings, { key: string; value: string }>>

// ============================================================================
// Export for verification
// ============================================================================

export type UpdateValidatorTestsPass = true
