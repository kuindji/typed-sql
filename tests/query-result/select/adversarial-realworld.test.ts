/**
 * ADVERSARIAL — real-world SQL the inferrer currently gets WRONG.
 *
 * Every assertion below encodes the CORRECT PostgreSQL result type. They are
 * RED today (the file does not typecheck) and are the make-green backlog for
 * the next session. Each block records the CURRENT (wrong) inferred type so the
 * fix can be verified against it.
 *
 * Findings (verified 2026-06-17 against main):
 *   A. coalesce null-rescue is incomplete — only a STRING literal rescues a
 *      schema-nullable arg; a numeric literal or a non-null column does not.
 *      This contradicts the documented contract ("coalesce is nullable only if
 *      EVERY argument is nullable"). HIGH priority — a real bug, not a gap.
 *   B. nullif() is unmodeled -> `unknown`. It is unambiguous: returns the first
 *      arg's type, always nullable.
 *   C. greatest()/least() are unmodeled -> `unknown`. Unambiguous for numeric
 *      args: the arg type, nullable iff any arg is nullable.
 *   D. concat_ws() is unmodeled -> `unknown`, even though concat() IS modeled
 *      as `string`. concat_ws is always `string` (NULL separator aside).
 *   E. Window RANKING functions (row_number/rank/dense_rank/ntile/percent_rank/
 *      cume_dist) are typed `unknown`. Today that is an INTENTIONAL conservative
 *      pin (window-functions.test.ts:C3). But these are unambiguously numeric in
 *      Postgres regardless of arguments. Making this green requires flipping the
 *      C3 pin — a deliberate design decision, called out here for review.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// ── A. coalesce null-rescue ────────────────────────────────────────────────

// CURRENT: { d: number | null }   EXPECTED: { d: number }
// `discount` is schema-nullable, but `0` is a non-null literal, so PG coalesce
// is non-null. Only the string-literal form (`coalesce(name, '')`) is rescued
// today — the numeric-literal form is not.
type A1 = QueryResult<"SELECT coalesce(discount, 0) AS d FROM products", DeepSchema>;
type _A1 = RequireTrue<AssertEqual<A1, { d: number }>>;

// CURRENT: { d: number | null }   EXPECTED: { d: number }
// Rescued by a non-null COLUMN (`price`), not a literal — also not handled.
type A2 = QueryResult<"SELECT coalesce(discount, price) AS d FROM products", DeepSchema>;
type _A2 = RequireTrue<AssertEqual<A2, { d: number }>>;

// CURRENT: { d: number | null }   EXPECTED: { d: number }
type A3 = QueryResult<"SELECT coalesce(discount, 1.5) AS d FROM products", DeepSchema>;
type _A3 = RequireTrue<AssertEqual<A3, { d: number }>>;

// ── B. nullif() ────────────────────────────────────────────────────────────

// CURRENT: { n: unknown }   EXPECTED: { n: string | null }
// nullif(a, b) returns a's type and is always nullable (returns NULL when a = b).
type B1 = QueryResult<"SELECT nullif(name, '') AS n FROM products", DeepSchema>;
type _B1 = RequireTrue<AssertEqual<B1, { n: string | null }>>;

// CURRENT: { n: unknown }   EXPECTED: { n: number | null }
type B2 = QueryResult<"SELECT nullif(price, 0) AS n FROM products", DeepSchema>;
type _B2 = RequireTrue<AssertEqual<B2, { n: number | null }>>;

// ── C. greatest() / least() ────────────────────────────────────────────────

// CURRENT: { m: unknown }   EXPECTED: { m: number }
// All args non-null numeric -> number, non-null (PG greatest/least skip NULLs
// but are NULL only if ALL args are NULL; with a non-null arg it is non-null).
type C1 = QueryResult<"SELECT greatest(price, quantity) AS m FROM products", DeepSchema>;
type _C1 = RequireTrue<AssertEqual<C1, { m: number }>>;

// CURRENT: { m: unknown }   EXPECTED: { m: number | null }
// All args nullable -> number | null.
type C2 = QueryResult<"SELECT least(discount, discount) AS m FROM products", DeepSchema>;
type _C2 = RequireTrue<AssertEqual<C2, { m: number | null }>>;

// ── D. concat_ws() ─────────────────────────────────────────────────────────

// CURRENT: { n: unknown }   EXPECTED: { n: string }
// concat() is already modeled as string; concat_ws is the same minus the
// separator arg.
type D1 = QueryResult<"SELECT concat_ws(',', name, status) AS n FROM products", DeepSchema>;
type _D1 = RequireTrue<AssertEqual<D1, { n: string }>>;

// ── E. window ranking functions (flips intentional C3 pin) ─────────────────

// CURRENT: { rn: unknown }   EXPECTED: { rn: number }
type E1 = QueryResult<"SELECT row_number() OVER (ORDER BY price) AS rn FROM products", DeepSchema>;
type _E1 = RequireTrue<AssertEqual<E1, { rn: number }>>;

// CURRENT: { rk: unknown }   EXPECTED: { rk: number }
type E2 = QueryResult<"SELECT rank() OVER (PARTITION BY status ORDER BY price) AS rk FROM products", DeepSchema>;
type _E2 = RequireTrue<AssertEqual<E2, { rk: number }>>;

// CURRENT: { dr: unknown }   EXPECTED: { dr: number }
type E3 = QueryResult<"SELECT dense_rank() OVER (ORDER BY price) AS dr FROM products", DeepSchema>;
type _E3 = RequireTrue<AssertEqual<E3, { dr: number }>>;
