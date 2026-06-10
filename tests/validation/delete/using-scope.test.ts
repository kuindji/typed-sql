/**
 * DELETE ... USING scope resolution type tests.
 *
 * Covers the join-scope surface of DELETE: a USING table (optionally aliased)
 * whose columns become referenceable in WHERE, plus RETURNING from the deleted
 * table. If this file compiles, the assertions hold.
 */
import type {
  ValidateDeleteSQL,
  GetReturnType,
} from "../../../src/index.js"
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js"

type TestSchema = {
  defaultSchema: "public"
  schemas: {
    public: {
      orders: {
        id: number
        customer_id: number
        total: number
      }
      customers: {
        id: number
        region: string
        active: boolean
      }
    }
  }
}

// Valid: unaliased USING, qualified cross-table predicate.
type V_UsingPlain = ValidateDeleteSQL<
  "DELETE FROM orders USING customers WHERE orders.customer_id = customers.id",
  TestSchema
>
type _V1 = RequireTrue<AssertEqual<V_UsingPlain, true>>

// Valid: aliased target + aliased USING, alias-qualified predicate.
type V_UsingAliased = ValidateDeleteSQL<
  "DELETE FROM orders o USING customers c WHERE o.customer_id = c.id AND c.active = TRUE",
  TestSchema
>
type _V2 = RequireTrue<AssertEqual<V_UsingAliased, true>>

// Valid: USING-scoped column used in the predicate.
type V_UsingScopedCol = ValidateDeleteSQL<
  "DELETE FROM orders USING customers WHERE orders.customer_id = customers.id AND customers.region = 'EU'",
  TestSchema
>
type _V3 = RequireTrue<AssertEqual<V_UsingScopedCol, true>>

// Invalid: the USING table does not exist.
type V_BadUsingTable = ValidateDeleteSQL<
  "DELETE FROM orders USING nonexistent WHERE orders.customer_id = nonexistent.id",
  TestSchema
>
type _V4 = RequireTrue<AssertEqual<V_BadUsingTable, false>>

// RETURNING shape: columns drawn from the deleted (target) table.
type R_Returning = GetReturnType<
  "DELETE FROM orders USING customers WHERE orders.customer_id = customers.id RETURNING orders.id, orders.total",
  TestSchema
>
type _R1 = RequireTrue<AssertEqual<R_Returning, { id: number; total: number }>>

export type DeleteUsingScopeTestsPass = true
