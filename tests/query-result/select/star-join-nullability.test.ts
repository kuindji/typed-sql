/**
 * Outer-join nullability through `*` expansion and through CTE / derived-table
 * bodies.
 *
 * Both used to be holes in the nullability model, and both produced the same
 * lie: a `number` for a column Postgres fills with NULL.
 *
 * 1. A bare `SELECT *` expanded straight from the schema and ignored the
 *    outer-join set, while `o.*` and `o.total` on the SAME query nullablized
 *    correctly. `RowTypeForTablesJoinNull` (src/schema.ts) now applies `| null`
 *    per relation before the star rows are merged.
 * 2. A CTE / derived table published its body's row WITHOUT the body's own
 *    outer-join nullability, so wrapping a left join in `with j as (...)` threw
 *    the `| null` away. `DerivedSubRow` (src/validation/return-derived.ts) now
 *    passes `NullableRelations<Body, S>`.
 *
 * Self-join note (S7): `*` over a self-join with one outer side reports every
 * column of the shared table nullable. `*` projects both instances under the
 * same names, so the merged row cannot separate them — conservative `| null` is
 * the only representable answer, and `u.*` / `m.*` still resolve each side
 * exactly.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

type UsersRow = {
    id: number;
    name: string;
    email: string;
    created_at: string;
};

// ---------------------------------------------------------------------------
// Bare `*` over an outer join
// ---------------------------------------------------------------------------

// S1: `*` across a LEFT JOIN — the joined side's columns are nullable. `id` and
// `created_at` exist in BOTH tables, so the merged column carries the union of
// the firm left-side type and the nullable right-side one.
type S1 = QueryResult<
    "SELECT * FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _S1 = RequireTrue<
    AssertEqual<S1, {
        id: number | null;
        name: string;
        email: string;
        created_at: string | null;
        user_id: number | null;
        address_id: number | null;
        status: "pending" | "paid" | "shipped" | "cancelled" | null;
        total: number | null;
    }>
>;

// S2: control — the qualified star was always correct and must stay so.
type S2 = QueryResult<
    "SELECT o.* FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _S2 = RequireTrue<
    AssertEqual<S2, {
        id: number | null;
        user_id: number | null;
        address_id: number | null;
        status: "pending" | "paid" | "shipped" | "cancelled" | null;
        total: number | null;
        created_at: string | null;
    }>
>;

// S3: control — an INNER JOIN nullablizes nothing, so `*` is the plain merge.
type S3 = QueryResult<
    "SELECT * FROM users u JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _S3 = RequireTrue<
    AssertEqual<S3, {
        id: number;
        name: string;
        email: string;
        created_at: string;
        user_id: number;
        address_id: number;
        status: "pending" | "paid" | "shipped" | "cancelled";
        total: number;
    }>
>;

// S4: RIGHT JOIN flips the nullable side — `users` columns become nullable.
type S4 = QueryResult<
    "SELECT * FROM users u RIGHT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _S4 = RequireTrue<
    AssertEqual<S4, {
        id: number | null;
        name: string | null;
        email: string | null;
        created_at: string | null;
        user_id: number;
        address_id: number;
        status: "pending" | "paid" | "shipped" | "cancelled";
        total: number;
    }>
>;

// S5: a single-table `*` with no join at all pays nothing and is unchanged.
type S5 = QueryResult<"SELECT * FROM users", WideSchema>;
type _S5 = RequireTrue<AssertEqual<S5, UsersRow>>;

// S6: an UNALIASED outer-joined table is matched by its own name, not an alias.
type S6 = QueryResult<
    "SELECT * FROM users LEFT JOIN orders ON orders.user_id = users.id",
    WideSchema
>;
type _S6 = RequireTrue<
    AssertEqual<S6, {
        id: number | null;
        name: string;
        email: string;
        created_at: string | null;
        user_id: number | null;
        address_id: number | null;
        status: "pending" | "paid" | "shipped" | "cancelled" | null;
        total: number | null;
    }>
>;

// S7: self-join — `*` cannot separate the two instances, so the shared table's
// columns are conservatively nullable (see the header note).
type S7 = QueryResult<
    "SELECT u.id, m.id AS mid FROM users u LEFT JOIN users m ON m.id = u.id",
    WideSchema
>;
type _S7 = RequireTrue<AssertEqual<S7, { id: number; mid: number | null }>>;

// ---------------------------------------------------------------------------
// Nullability computed INSIDE a CTE / derived-table body
// ---------------------------------------------------------------------------

// S8: control — the body checked standalone.
type S8 = QueryResult<
    "SELECT u.id, o.total FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _S8 = RequireTrue<AssertEqual<S8, { id: number; total: number | null }>>;

// S9: the same body inside a CTE keeps the `| null` it found.
type S9 = QueryResult<
    "WITH j AS (SELECT u.id, o.total FROM users u LEFT JOIN orders o ON o.user_id = u.id) SELECT id, total FROM j",
    WideSchema
>;
type _S9 = RequireTrue<AssertEqual<S9, { id: number; total: number | null }>>;

// S10: qualified by the CTE name.
type S10 = QueryResult<
    "WITH j AS (SELECT u.id, o.total FROM users u LEFT JOIN orders o ON o.user_id = u.id) SELECT j.id, j.total FROM j",
    WideSchema
>;
type _S10 = RequireTrue<AssertEqual<S10, { id: number; total: number | null }>>;

// S11: `*` through the CTE.
type S11 = QueryResult<
    "WITH j AS (SELECT u.id, o.total FROM users u LEFT JOIN orders o ON o.user_id = u.id) SELECT * FROM j",
    WideSchema
>;
type _S11 = RequireTrue<AssertEqual<S11, { id: number; total: number | null }>>;

// S12: a body-side alias survives the CTE boundary with its nullability.
type S12 = QueryResult<
    "WITH j AS (SELECT u.id, o.total AS t FROM users u LEFT JOIN orders o ON o.user_id = u.id) SELECT t FROM j",
    WideSchema
>;
type _S12 = RequireTrue<AssertEqual<S12, { t: number | null }>>;

// S13: derived table in FROM — same body, same guarantee.
type S13 = QueryResult<
    "SELECT d.total FROM (SELECT u.id, o.total FROM users u LEFT JOIN orders o ON o.user_id = u.id) d",
    WideSchema
>;
type _S13 = RequireTrue<AssertEqual<S13, { total: number | null }>>;

// S14: control — a join-free body is untouched by the change.
type S14 = QueryResult<
    "WITH j AS (SELECT id, total FROM orders) SELECT id, total FROM j",
    WideSchema
>;
type _S14 = RequireTrue<AssertEqual<S14, { id: number; total: number }>>;

// S15: control — a LEFT JOIN applied on the OUTER side of a derived table was
// already correct and stays correct.
type S15 = QueryResult<
    "SELECT u.name, d.total FROM users u LEFT JOIN (SELECT user_id, total FROM orders) d ON d.user_id = u.id",
    WideSchema
>;
type _S15 = RequireTrue<AssertEqual<S15, { name: string; total: number | null }>>;

// S16: a SCHEMA-QUALIFIED unaliased source is referenced as either
// `orders.col` or `public.orders.col`, so `NullableRelations` records both
// spellings (`SourceQualifiers` in src/tables.ts). Before that, the written
// form (`public.orders`) was the only qualifier recorded, so neither the star
// expansion (which matches on the table key's tail) nor a plain `orders.total`
// ref saw the join as nullable.
type S16 = QueryResult<
    "SELECT * FROM users LEFT JOIN public.orders ON orders.user_id = users.id",
    WideSchema
>;
type _S16 = RequireTrue<
    AssertEqual<S16, {
        id: number | null;
        name: string;
        email: string;
        created_at: string | null;
        user_id: number | null;
        address_id: number | null;
        status: "pending" | "paid" | "shipped" | "cancelled" | null;
        total: number | null;
    }>
>;

// S17: the explicit-ref path agrees with the star path on the same source.
type S17 = QueryResult<
    "SELECT orders.total FROM users LEFT JOIN public.orders ON orders.user_id = users.id",
    WideSchema
>;
type _S17 = RequireTrue<AssertEqual<S17, { total: number | null }>>;
