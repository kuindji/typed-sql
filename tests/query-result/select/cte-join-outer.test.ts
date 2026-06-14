/**
 * Multi-CTE outer that JOINs CTEs (bucket 04 / Tier 2).
 *
 * `WITH a AS (...), b AS (...) SELECT ... FROM a x JOIN b y ...` — the outer
 * reads from MORE THAN ONE CTE via a join. Today this hits the lenient fallback
 * (`return-types.ts` OuterSelectReturn join branch) which leaks the first inner
 * CTE's select list. These assert the CORRECT row: each outer ref resolves
 * against the CTE it is aliased from, with outer-join nullability.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// J1 — INNER join, bare qualified refs resolve against their own CTE body.
type J1 = QueryResult<
    "with a as (select id, name from users), b as (select id, total from orders) select x.name, y.total from a x join b y on y.id = x.id",
    WideSchema
>;
type _J1 = RequireTrue<AssertEqual<J1, { name: string; total: number }>>;

// J2 — LEFT join: the right-hand CTE's columns gain `| null`.
type J2 = QueryResult<
    "with a as (select id, name from users), b as (select id, total from orders) select x.name, y.total from a x left join b y on y.id = x.id",
    WideSchema
>;
type _J2 = RequireTrue<AssertEqual<J2, { name: string; total: number | null }>>;

// J3 — WITH RECURSIVE keyword + output-alias rename on a left-joined CTE col.
type J3 = QueryResult<
    "with recursive a as (select id, name from users), b as (select id, total from orders) select x.name as nm, y.total as tot from a x left join b y on y.id = x.id",
    WideSchema
>;
type _J3 = RequireTrue<AssertEqual<J3, { nm: string; tot: number | null }>>;

// J4 — CTE↔base join: `x.name` resolves against the CTE body, `o.total` against
// the base `orders` table (the motivating mixed case from the engine comment).
type J4 = QueryResult<
    "with a as (select id, name from users) select x.name, o.total from a x join orders o on o.user_id = x.id",
    WideSchema
>;
type _J4 = RequireTrue<AssertEqual<J4, { name: string; total: number }>>;

// J5 — CTE↔base LEFT join, base table on the nullable side: `o.total` gains
// `| null` via the base join-nullability path; the CTE ref `x.name` stays non-null.
type J5 = QueryResult<
    "with a as (select id, name from users) select x.name, o.total from a x left join orders o on o.user_id = x.id",
    WideSchema
>;
type _J5 = RequireTrue<AssertEqual<J5, { name: string; total: number | null }>>;

// J6 — three-way CTE join: exercises `ScanCteNullable` past the first source. The
// final CTE `z` is LEFT-joined → `z.carrier` is `| null`; `x`/`y` stay non-null.
type J6 = QueryResult<
    "with a as (select id, name from users), b as (select id, total from orders), c as (select id, carrier from shipments) select x.name, y.total, z.carrier from a x join b y on y.id = x.id left join c z on z.id = x.id",
    WideSchema
>;
type _J6 = RequireTrue<AssertEqual<J6, { name: string; total: number; carrier: string | null }>>;

export type CteJoinOuterLoaded = true;
