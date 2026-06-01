/**
 * INSERT Validator Type Tests
 *
 * Tests for ValidateInsertSQL and related validation functionality.
 * If this file compiles without errors, all tests pass.
 */

import type {
  ValidateInsertSQL,
  IsValidInsert,
  GetInsertTableColumns,
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
// Valid INSERT Tests
// ============================================================================

// Test: Basic valid INSERT
type V_Basic = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' )",
  TestSchema
>
type _V1 = RequireTrue<AssertEqual<V_Basic, true>>

// Test: INSERT with all columns
type V_AllCols = ValidateInsertSQL<
  "INSERT INTO users ( id , name , email , active ) VALUES ( 1 , 'John' , 'john@example.com' , TRUE )",
  TestSchema
>
type _V2 = RequireTrue<AssertEqual<V_AllCols, true>>

// Test: INSERT with RETURNING
type V_Returning = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' ) RETURNING id , name",
  TestSchema
>
type _V3 = RequireTrue<AssertEqual<V_Returning, true>>

// Test: INSERT with RETURNING *
type V_ReturningStar = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' ) RETURNING *",
  TestSchema
>
type _V4 = RequireTrue<AssertEqual<V_ReturningStar, true>>

// Test: INSERT with ON CONFLICT
type V_Conflict = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' ) ON CONFLICT ( id ) DO NOTHING",
  TestSchema
>
type _V5 = RequireTrue<AssertEqual<V_Conflict, true>>

// Test: INSERT with ON CONFLICT DO UPDATE
type V_ConflictUpdate = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' ) ON CONFLICT ( id ) DO UPDATE SET name = 'Updated'",
  TestSchema
>
type _V6 = RequireTrue<AssertEqual<V_ConflictUpdate, true>>

// Test: INSERT with schema.table
type V_SchemaTable = ValidateInsertSQL<
  "INSERT INTO admin.settings ( key , value ) VALUES ( 'theme' , 'dark' )",
  TestSchema
>
type _V7 = RequireTrue<AssertEqual<V_SchemaTable, true>>

// Test: INSERT with multiple rows
type V_MultiRow = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' ) , ( 2 , 'Jane' )",
  TestSchema
>
type _V8 = RequireTrue<AssertEqual<V_MultiRow, true>>

// ============================================================================
// Invalid INSERT Tests - Table/Schema Errors
// ============================================================================

// Test: Non-existent table
type V_BadTable = ValidateInsertSQL<
  "INSERT INTO nonexistent ( id ) VALUES ( 1 )",
  TestSchema
>
type _V9 = RequireTrue<AssertEqual<V_BadTable, false>>

// Test: Non-existent schema
type V_BadSchema = ValidateInsertSQL<
  "INSERT INTO fake.users ( id ) VALUES ( 1 )",
  TestSchema
>
type _V10 = RequireTrue<AssertEqual<V_BadSchema, false>>

// ============================================================================
// Invalid INSERT Tests - Column Errors
// ============================================================================

// Test: Non-existent column
type V_BadCol = ValidateInsertSQL<
  "INSERT INTO users ( id , nonexistent ) VALUES ( 1 , 'value' )",
  TestSchema
>
type _V11 = RequireTrue<AssertEqual<V_BadCol, false>>

// Test: Invalid RETURNING column
type V_BadReturningCol = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' ) RETURNING badcolumn",
  TestSchema
>
type _V12 = RequireTrue<AssertEqual<V_BadReturningCol, false>>

// Test: Invalid ON CONFLICT column
type V_BadConflictCol = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' ) ON CONFLICT ( badcol ) DO NOTHING",
  TestSchema
>
type _V13 = RequireTrue<AssertEqual<V_BadConflictCol, false>>

// Test: Invalid ON CONFLICT UPDATE column
type V_BadUpdateCol = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' ) ON CONFLICT ( id ) DO UPDATE SET badcol = 'value'",
  TestSchema
>
type _V14 = RequireTrue<AssertEqual<V_BadUpdateCol, false>>

// ============================================================================
// Value Count Validation Tests
// ============================================================================

// Test: Mismatched value count (too few)
type V_TooFewValues = ValidateInsertSQL<
  "INSERT INTO users ( id , name , email ) VALUES ( 1 , 'John' )",
  TestSchema
>
type _V15 = RequireTrue<AssertEqual<V_TooFewValues, true>>

// Test: Mismatched value count (too many)
type V_TooManyValues = ValidateInsertSQL<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' , 'extra' )",
  TestSchema
>
type _V16 = RequireTrue<AssertEqual<V_TooManyValues, true>>

// ============================================================================
// IsValidInsert Tests
// ============================================================================

// Test: Valid returns true
type IV_Valid = IsValidInsert<"INSERT INTO users ( id , name ) VALUES ( 1 , 'John' )", TestSchema>
type _IV1 = RequireTrue<IV_Valid>

// Test: Invalid returns false
type IV_Invalid = IsValidInsert<"INSERT INTO nonexistent ( id ) VALUES ( 1 )", TestSchema>
type _IV2 = RequireFalse<IV_Invalid>

// ============================================================================
// GetInsertTableColumns Tests
// ============================================================================

// Test: Get columns from users table
type GC_Users = GetInsertTableColumns<
  "INSERT INTO users ( id , name ) VALUES ( 1 , 'John' )",
  TestSchema
>
type _GC1 = RequireTrue<
  AssertEqual<GC_Users, { id: number; name: string; email: string; active: boolean }>
>

// Test: Get columns from posts table
type GC_Posts = GetInsertTableColumns<
  "INSERT INTO posts ( id , title ) VALUES ( 1 , 'Title' )",
  TestSchema
>
type _GC2 = RequireTrue<
  AssertEqual<GC_Posts, { id: number; title: string; content: string; author_id: number }>
>

// Test: Get columns from schema.table
type GC_Settings = GetInsertTableColumns<
  "INSERT INTO admin.settings ( key , value ) VALUES ( 'k' , 'v' )",
  TestSchema
>
type _GC3 = RequireTrue<AssertEqual<GC_Settings, { key: string; value: string }>>

// ============================================================================
// Export for verification
// ============================================================================

export type InsertValidatorTestsPass = true
