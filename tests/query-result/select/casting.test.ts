/**
 * Type Casting Tests
 *
 * Tests for PostgreSQL type casting syntax.
 * If this file compiles without errors, all tests pass.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, AssertExtends, RequireTrue } from "../../fixtures/helpers.js";
import type { TestSchema } from "../../fixtures/query-result-schemas.js";

// ============================================================================
// Type Casting Tests
// ============================================================================

// Test: Type cast to text
type M_CastText = QueryResult<
    "SELECT id::text AS id_str FROM users",
    TestSchema
>;
type _M31 = RequireTrue<AssertExtends<M_CastText, { id_str: string; }>>;

// Test: Type cast to int
type M_CastInt = QueryResult<
    "SELECT views::int AS view_count FROM posts",
    TestSchema
>;
type _M32 = RequireTrue<AssertExtends<M_CastInt, { view_count: number; }>>;

// Test: Type cast to boolean
type M_CastBool = QueryResult<
    "SELECT is_active::bool AS active FROM users",
    TestSchema
>;
type _M33 = RequireTrue<AssertExtends<M_CastBool, { active: boolean; }>>;

// Test: :: cast syntax returns the casted type
type M_ColonCast = QueryResult<
    "SELECT id::text AS id_text FROM users",
    TestSchema
>;
type _F38 = RequireTrue<AssertEqual<M_ColonCast, { id_text: string; }>>;

// Test: CAST() function returns the casted type
type M_CastFunc = QueryResult<
    "SELECT CAST ( id AS text ) AS id_text FROM users",
    TestSchema
>;
type _F38a = RequireTrue<AssertEqual<M_CastFunc, { id_text: string; }>>;

// Test: CAST() without alias uses expression name
type M_CastNoAlias = QueryResult<
    "SELECT CAST ( id AS varchar ) FROM users",
    TestSchema
>;
type _F38b = RequireTrue<AssertEqual<M_CastNoAlias, { id: string; }>>;

// Test: CAST() with different type conversion
type M_CastToInt = QueryResult<
    "SELECT CAST ( name AS int ) AS name_num FROM users",
    TestSchema
>;
type _F38c = RequireTrue<AssertEqual<M_CastToInt, { name_num: number; }>>;

// Test: CAST() with different type conversion
type M_DynamicCast = QueryResult<
    "SELECT id::int AS int_result FROM users",
    TestSchema
>;
type _F39 = RequireTrue<AssertEqual<M_DynamicCast, { int_result: number; }>>;

// ============================================================================
// Export for verification
// ============================================================================

export type CastingTestsPass = true;
