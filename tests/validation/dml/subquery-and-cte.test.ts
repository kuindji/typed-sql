/**
 * DML subquery + CTE scope type tests.
 *
 * Covers two previously-untested DML surfaces:
 *   - a subquery in a DML WHERE clause, and
 *   - a leading WITH (CTE) feeding an UPDATE / DELETE / INSERT.
 * If this file compiles, the assertions hold.
 */
import type {
  ValidateUpdateSQL,
  ValidateDeleteSQL,
  ValidateInsertSQL,
} from "../../../src/index.js"
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js"

type TestSchema = {
  defaultSchema: "public"
  schemas: {
    public: {
      users: {
        id: number
        email: string
        active: boolean
      }
      orders: {
        id: number
        user_id: number
        total: number
      }
      archived_users: {
        id: number
        email: string
      }
    }
  }
}

// Subquery in UPDATE WHERE — IN (SELECT ...) over a real table.
type V_UpdateSubquery = ValidateUpdateSQL<
  "UPDATE users SET active = FALSE WHERE id IN (SELECT user_id FROM orders WHERE total = 0)",
  TestSchema
>
type _V1 = RequireTrue<AssertEqual<V_UpdateSubquery, true>>

// Subquery in DELETE WHERE.
type V_DeleteSubquery = ValidateDeleteSQL<
  "DELETE FROM users WHERE id IN (SELECT user_id FROM orders WHERE total = 0)",
  TestSchema
>
type _V2 = RequireTrue<AssertEqual<V_DeleteSubquery, true>>

// Subquery referencing a nonexistent table is rejected.
type V_BadSubqueryTable = ValidateDeleteSQL<
  "DELETE FROM users WHERE id IN (SELECT user_id FROM nonexistent)",
  TestSchema
>
type _V3 = RequireTrue<AssertEqual<V_BadSubqueryTable, false>>

// Leading CTE feeding a DELETE.
type V_CteDelete = ValidateDeleteSQL<
  "WITH stale AS (SELECT id FROM orders WHERE total = 0) DELETE FROM users WHERE id IN (SELECT id FROM stale)",
  TestSchema
>
type _V4 = RequireTrue<AssertEqual<V_CteDelete, true>>

// Leading CTE feeding an INSERT ... SELECT.
type V_CteInsert = ValidateInsertSQL<
  "WITH src AS (SELECT id, email FROM users WHERE active = TRUE) INSERT INTO archived_users (id, email) SELECT id, email FROM src",
  TestSchema
>
type _V5 = RequireTrue<AssertEqual<V_CteInsert, true>>

export type DmlSubqueryCteTestsPass = true
