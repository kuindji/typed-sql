/**
 * ADVERSARIAL ROUND 3: return type of UNALIASED projection expressions.
 *
 * Postgres/MySQL give every output column a name. An unaliased aggregate is
 * named after the function (`count`, `sum`, `avg`, `min`, `max`, `upper`,
 * `lower`, `coalesce`); an unaliased `CASE` is named `case`. The library types
 * these correctly when they carry an explicit alias (`count(*) AS c` ->
 * `{ c: number }`), but for the *unaliased* form it resolves the projection key
 * to `never` — and because the row is built with an intersection
 * (`MergeRow<Acc, Next> = Omit<Acc, keyof Next> & Next`), a single `never`
 * column annihilates the ENTIRE projected row, valid sibling columns included.
 *
 * The same queries are reported VALID by `ValidateSQL` (e.g.
 * `ValidateSQL<"select count(*) from users"> = true`), so the library
 * simultaneously calls a query valid and types its result as `never`.
 *
 * Every actual value below was confirmed by probing the compiler.
 */

import type { GetReturnType, QueryResult } from "../../src/index.js";
import type { AssertEqual, RequireTrue } from "../external/helpers.js";
import type { DeepSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// RED — unaliased aggregate/function columns collapse to `never`
// ---------------------------------------------------------------------------

// `select count(*) from users` -> actual `never`, expected `{ count: number }`
type R1 = QueryResult<"select count(*) from users", DeepSchema>;
type _R1 = RequireTrue<AssertEqual<R1, { count: number }>>;

type R2 = QueryResult<"select sum(price) from products", DeepSchema>;
type _R2 = RequireTrue<AssertEqual<R2, { sum: number }>>;

type R3 = QueryResult<"select avg(price) from products", DeepSchema>;
type _R3 = RequireTrue<AssertEqual<R3, { avg: number }>>;

type R4 = QueryResult<"select min(price) from products", DeepSchema>;
type _R4 = RequireTrue<AssertEqual<R4, { min: number }>>;

type R5 = QueryResult<"select max(price) from products", DeepSchema>;
type _R5 = RequireTrue<AssertEqual<R5, { max: number }>>;

type R6 = QueryResult<"select upper(name) from products", DeepSchema>;
type _R6 = RequireTrue<AssertEqual<R6, { upper: string }>>;

type R7 = QueryResult<"select lower(email) from users", DeepSchema>;
type _R7 = RequireTrue<AssertEqual<R7, { lower: string }>>;

// coalesce takes the union of its argument types: discount is `number | null`,
// the literal 0 is `number` -> `number | null`.
type R8 = QueryResult<"select coalesce(discount, 0) from products", DeepSchema>;
type _R8 = RequireTrue<AssertEqual<R8, { coalesce: number | null }>>;

// An unaliased CASE is named `case`; its value is `unknown` per the contract.
type R9 = QueryResult<"select case when is_active then 1 else 0 end from users", DeepSchema>;
type _R9 = RequireTrue<AssertEqual<R9, { case: unknown }>>;

// ---------------------------------------------------------------------------
// RED — the blast radius: one unaliased expression must NOT delete valid
// sibling columns. These are the strongest soundness statements.
// ---------------------------------------------------------------------------

type B1 = QueryResult<"select id, count(*) from users group by id", DeepSchema>;
type _B1 = RequireTrue<AssertEqual<B1, { id: number; count: number }>>;

type B2 = QueryResult<"select count(*), name from users", DeepSchema>;
type _B2 = RequireTrue<AssertEqual<B2, { count: number; name: string }>>;

type B3 = QueryResult<"select id, max(price) from products", DeepSchema>;
type _B3 = RequireTrue<AssertEqual<B3, { id: number; max: number }>>;

// Arithmetic has no stable column name (postgres `?column?`), so the unnameable
// column may be omitted — but the valid sibling `id` must survive, not vanish
// into `never`.
type B4 = QueryResult<"select id, price + 1 from products", DeepSchema>;
type _B4 = RequireTrue<AssertEqual<B4, { id: number }>>;

// ---------------------------------------------------------------------------
// GREEN controls — the same expressions, ALIASED, already type correctly.
// Proves the defect is the auto-naming + never-collapse, not the value typing.
// ---------------------------------------------------------------------------

type G1 = QueryResult<"select count(*) as c from users", DeepSchema>;
type _G1 = RequireTrue<AssertEqual<G1, { c: number }>>;

type G2 = QueryResult<"select id, count(*) as c from users group by id", DeepSchema>;
type _G2 = RequireTrue<AssertEqual<G2, { id: number; c: number }>>;

type G3 = QueryResult<"select upper(name) as u from products", DeepSchema>;
type _G3 = RequireTrue<AssertEqual<G3, { u: string }>>;

export type ProjectionNamingAdversarialLoaded = true;
