/**
 * Basic Column Type Inference Tests (Adapted)
 *
 * Tests for basic column selection, SELECT *, aliases, union types, and nullable columns.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// ============================================================================
// Basic Column Type Inference Tests
// ============================================================================

// Test: Single column returns correct type
 type M_SingleCol = QueryResult<"SELECT id FROM users", TestSchema>;
 type _M1 = RequireTrue<AssertEqual<M_SingleCol, { id: number; }>>;

// Test: Multiple columns return correct types
 type M_MultiCol = QueryResult<"SELECT id, name, email FROM users", TestSchema>;
 type _M2 = RequireTrue<
     AssertEqual<M_MultiCol, { id: number; name: string; email: string; }>
 >;

// Test: String column
 type M_StringCol = QueryResult<"SELECT name FROM users", TestSchema>;
 type _M3 = RequireTrue<AssertEqual<M_StringCol, { name: string; }>>;

// Test: Boolean column
 type M_BoolCol = QueryResult<"SELECT is_active FROM users", TestSchema>;
 type _M4 = RequireTrue<AssertEqual<M_BoolCol, { is_active: boolean; }>>;

// ============================================================================
// SELECT * Tests
// ============================================================================

// Test: SELECT * returns all columns
 type M_Star = QueryResult<"SELECT * FROM users", TestSchema>;
 type _M5 = RequireTrue<
     AssertExtends<
         M_Star,
         {
             id: number;
             name: string;
             email: string;
             role: "admin" | "user" | "guest";
             is_active: boolean;
             created_at: string;
             deleted_at: string | null;
         }
     >
 >;

// ============================================================================
// Column Alias Tests
// ============================================================================

// Test: AS alias changes key name
 type M_Alias = QueryResult<"SELECT id AS user_id FROM users", TestSchema>;
 type _M6 = RequireTrue<AssertEqual<M_Alias, { user_id: number; }>>;

// Test: Multiple aliases
 type M_MultiAlias = QueryResult<
     "SELECT id AS uid, name AS display_name FROM users",
     TestSchema
 >;
 type _M7 = RequireTrue<
     AssertEqual<M_MultiAlias, { uid: number; display_name: string; }>
 >;

// ============================================================================
// Union Type Tests
// ============================================================================

// Test: Union type is preserved
 type M_Union = QueryResult<"SELECT role FROM users", TestSchema>;
 type _M9 = RequireTrue<
     AssertEqual<M_Union, { role: "admin" | "user" | "guest"; }>
 >;

// Test: Another union type
 type M_UnionStatus = QueryResult<"SELECT status FROM posts", TestSchema>;
 type _M10 = RequireTrue<
     AssertEqual<M_UnionStatus, { status: "draft" | "published"; }>
 >;

// ============================================================================
// Nullable Type Tests
// ============================================================================

// Test: Nullable column type is preserved
 type M_Nullable = QueryResult<"SELECT deleted_at FROM users", TestSchema>;
 type _M11 = RequireTrue<
     AssertEqual<M_Nullable, { deleted_at: string | null; }>
 >;

// Test: Mixed nullable and non-nullable
 type M_MixedNull = QueryResult<
     "SELECT name, deleted_at FROM users",
     TestSchema
 >;
 type _M13 = RequireTrue<
     AssertEqual<M_MixedNull, { name: string; deleted_at: string | null; }>
 >;

// ============================================================================
// Export for verification
// ============================================================================

export type BasicTestsPass = true;
