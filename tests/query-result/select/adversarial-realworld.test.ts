/**
 * ADVERSARIAL — real-world SQL the inferrer formerly got WRONG (round 24).
 *
 * Every assertion below encodes the CORRECT PostgreSQL result type. They are
 * GREEN as of round 24 (all five findings fixed); the file is kept as a
 * permanent regression pin. Each block still records the pre-fix (wrong)
 * inferred type for the record. Probed 2026-06-18 against main (HEAD cb83398).
 *
 * Round 23's findings (coalesce null-rescue, nullif/greatest/least/concat_ws,
 * window RANKING fns) are DONE + committed (b8d920e) and pinned permanently in
 * sql-functions / window-functions / window-group-aggregates tests.
 *
 * Findings (all DONE in round 24):
 *   A. Window VALUE functions (lag/lead/first_value/last_value/nth_value) return
 *      the FIRST argument's type. lag/lead default to NULL at the frame boundary
 *      and nth_value is NULL when the frame is shorter than N, so those three are
 *      always nullable; first_value/last_value carry the argument's own
 *      nullability. (Same `${string}) over${string}` window branch as round 23's
 *      ranking-fn fix, in FunctionReturn.)
 *   B. Boolean-producing PREDICATES projected into the SELECT list type
 *      `boolean`: `x IS [NOT] NULL`, `x BETWEEN a AND b`, `x LIKE p`,
 *      `EXISTS(...)`, `NOT b`, `x IN (...)`. `IS NULL`/`IS NOT NULL`/`EXISTS` are
 *      NEVER null; the rest gain `| null` when an operand is nullable (SQL NULL
 *      propagation). Implemented as a FALLBACK (`BoolPredicateType`) that fires
 *      only when the normal cascade types the expression `unknown`, so a
 *      well-typed function call is never misread as a predicate.
 *   C. Array-introspection fns: `array_length(arr, dim)` is `number | null`
 *      (empty/NULL array -> NULL), `cardinality(arr)` is `number` (propagates
 *      argument nullability).
 *   D. Array SUBSCRIPT `arr[i]` is the element type, nullable (out-of-range ->
 *      NULL). Was a `never` defect. Handled in the no-top-level-cast branch so an
 *      array-type cast (`prices::int[]`, which also ends in `]`) stays a cast.
 *   E. `position(sub IN str)` returns integer (`number`), `| null` when an
 *      operand is nullable. The SQL-standard `IN`-separated arg form is split on
 *      the top-level ` in ` so both operands are typed.
 *
 * Design-question (NOT asserted here, flagged for review): temporal function
 * returns `now()` / `date_trunc(...)` / `age(...)` infer `unknown`, yet the cast
 * map already types `created_at::date` as `Date`. Decision (user, round 24):
 * model them through the EXISTING defaults/overrides mechanism, not a hardcoded
 * TS type. Map each fn to its Postgres return-type NAME and feed it through
 * `SqlScalarToTs<N>` (see scalar-overrides.test.ts / `PgTypeOverrides`):
 *   now()/current_timestamp -> "timestamptz", date_trunc(...) -> "timestamp"
 *   (or "timestamptz" for the tz overload), age(...) -> "interval".
 * Default `timestamp`/`timestamptz` already resolve to `Date`; consumer
 * overrides then apply uniformly. STILL DEFERRED — not part of round 24.
 *
 * Status: DONE — all 17 assertions below are green and pinned.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema } from "../../fixtures/parser-schemas.js";

// ── A. window VALUE functions ──────────────────────────────────────────────

// CURRENT: { v: unknown }   EXPECTED: { v: number | null }
// lag defaults to NULL for the first row of the partition.
type A1 = QueryResult<"SELECT lag(price) OVER (ORDER BY id) AS v FROM products", DeepSchema>;
type _A1 = RequireTrue<AssertEqual<A1, { v: number | null }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number | null }
type A2 = QueryResult<"SELECT lead(price, 1) OVER (ORDER BY id) AS v FROM products", DeepSchema>;
type _A2 = RequireTrue<AssertEqual<A2, { v: number | null }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number }
// first_value of a non-null column over a non-empty frame is non-null.
type A3 = QueryResult<"SELECT first_value(price) OVER (ORDER BY id) AS v FROM products", DeepSchema>;
type _A3 = RequireTrue<AssertEqual<A3, { v: number }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: string }
type A4 = QueryResult<"SELECT last_value(name) OVER (ORDER BY id) AS v FROM products", DeepSchema>;
type _A4 = RequireTrue<AssertEqual<A4, { v: string }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number | null }
// nth_value is NULL when the frame has fewer than N rows.
type A5 = QueryResult<"SELECT nth_value(price, 2) OVER (ORDER BY id) AS v FROM products", DeepSchema>;
type _A5 = RequireTrue<AssertEqual<A5, { v: number | null }>>;

// ── B. boolean-producing predicates ────────────────────────────────────────

// CURRENT: { flag: unknown }   EXPECTED: { flag: boolean }  (IS NULL never null)
type B1 = QueryResult<"SELECT discount IS NULL AS flag FROM products", DeepSchema>;
type _B1 = RequireTrue<AssertEqual<B1, { flag: boolean }>>;

// CURRENT: { flag: unknown }   EXPECTED: { flag: boolean }
type B2 = QueryResult<"SELECT discount IS NOT NULL AS flag FROM products", DeepSchema>;
type _B2 = RequireTrue<AssertEqual<B2, { flag: boolean }>>;

// CURRENT: { flag: unknown }   EXPECTED: { flag: boolean }  (operands non-null)
type B3 = QueryResult<"SELECT price BETWEEN 1 AND 10 AS flag FROM products", DeepSchema>;
type _B3 = RequireTrue<AssertEqual<B3, { flag: boolean }>>;

// CURRENT: { flag: unknown }   EXPECTED: { flag: boolean | null }
// discount is nullable, so NULL BETWEEN ... is NULL -> boolean | null.
type B4 = QueryResult<"SELECT discount BETWEEN 1 AND 10 AS flag FROM products", DeepSchema>;
type _B4 = RequireTrue<AssertEqual<B4, { flag: boolean | null }>>;

// CURRENT: { flag: unknown }   EXPECTED: { flag: boolean }
type B5 = QueryResult<"SELECT name LIKE 'a%' AS flag FROM products", DeepSchema>;
type _B5 = RequireTrue<AssertEqual<B5, { flag: boolean }>>;

// CURRENT: { flag: unknown }   EXPECTED: { flag: boolean }  (EXISTS never null)
type B6 = QueryResult<"SELECT EXISTS(SELECT 1 FROM users) AS flag FROM products", DeepSchema>;
type _B6 = RequireTrue<AssertEqual<B6, { flag: boolean }>>;

// CURRENT: { flag: unknown }   EXPECTED: { flag: boolean }
type B7 = QueryResult<"SELECT NOT is_active AS flag FROM users", DeepSchema>;
type _B7 = RequireTrue<AssertEqual<B7, { flag: boolean }>>;

// CURRENT: { flag: unknown }   EXPECTED: { flag: boolean }
type B8 = QueryResult<"SELECT status IN ('active', 'draft') AS flag FROM products", DeepSchema>;
type _B8 = RequireTrue<AssertEqual<B8, { flag: boolean }>>;

// ── C. array-introspection functions ───────────────────────────────────────

// CURRENT: { v: unknown }   EXPECTED: { v: number | null }  (empty/NULL -> NULL)
type C1 = QueryResult<"SELECT array_length(prices, 1) AS v FROM products", DeepSchema>;
type _C1 = RequireTrue<AssertEqual<C1, { v: number | null }>>;

// CURRENT: { v: unknown }   EXPECTED: { v: number }  (non-null array -> non-null)
type C2 = QueryResult<"SELECT cardinality(prices) AS v FROM products", DeepSchema>;
type _C2 = RequireTrue<AssertEqual<C2, { v: number }>>;

// ── D. array subscript (never-defect) ──────────────────────────────────────

// CURRENT: { v: never }   EXPECTED: { v: number | null }
// `prices` is number[]; PG subscript is the element type, NULL when out of range.
type D1 = QueryResult<"SELECT prices[1] AS v FROM products", DeepSchema>;
type _D1 = RequireTrue<AssertEqual<D1, { v: number | null }>>;

// ── E. position(sub IN str) ────────────────────────────────────────────────

// CURRENT: { v: unknown }   EXPECTED: { v: number }  (non-null args -> non-null int)
type E1 = QueryResult<"SELECT position('x' IN name) AS v FROM products", DeepSchema>;
type _E1 = RequireTrue<AssertEqual<E1, { v: number }>>;
