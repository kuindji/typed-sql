/**
 * UPDATE ... FROM scope resolution type tests.
 *
 * Covers the previously-untested join-scope surface of UPDATE: a FROM table
 * (optionally aliased) whose columns become referenceable in WHERE, and
 * RETURNING shapes drawn from the target table. If this file compiles, the
 * assertions hold.
 */
import type {
  ValidateUpdateSQL,
  GetReturnType,
} from "../../../src/index.js"
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js"

type TestSchema = {
  defaultSchema: "public"
  schemas: {
    public: {
      users: {
        id: number
        email: string
        account_id: number
      }
      accounts: {
        id: number
        owner_email: string
        status: string
      }
    }
  }
}

// Valid: unaliased FROM, qualified cross-table predicate.
type V_FromPlain = ValidateUpdateSQL<
  "UPDATE users SET email = 'x' FROM accounts WHERE users.account_id = accounts.id",
  TestSchema
>
type _V1 = RequireTrue<AssertEqual<V_FromPlain, true>>

// Valid: aliased target + aliased FROM, alias-qualified predicate.
type V_FromAliased = ValidateUpdateSQL<
  "UPDATE users u SET email = a.owner_email FROM accounts a WHERE u.account_id = a.id",
  TestSchema
>
type _V2 = RequireTrue<AssertEqual<V_FromAliased, true>>

// Valid: FROM-scoped column drives the assigned value.
type V_FromValue = ValidateUpdateSQL<
  "UPDATE users SET email = accounts.owner_email FROM accounts WHERE users.account_id = accounts.id",
  TestSchema
>
type _V3 = RequireTrue<AssertEqual<V_FromValue, true>>

// Invalid: the FROM table does not exist.
type V_BadFromTable = ValidateUpdateSQL<
  "UPDATE users SET email = 'x' FROM nonexistent WHERE users.account_id = nonexistent.id",
  TestSchema
>
type _V4 = RequireTrue<AssertEqual<V_BadFromTable, false>>

// RETURNING shape: columns drawn from the updated (target) table.
type R_Returning = GetReturnType<
  "UPDATE users SET email = 'x' FROM accounts WHERE users.account_id = accounts.id RETURNING users.id, users.email",
  TestSchema
>
type _R1 = RequireTrue<AssertEqual<R_Returning, { id: number; email: string }>>

export type UpdateFromScopeTestsPass = true
