/**
 * ADVERSARIAL: many joins, self-joins, SELECT * across joins.
 *
 * `SELECT *` builds its row via UnionToIntersection of every joined table's
 * row (`RowTypeForTables`), so columns that share a name but differ in type
 * collapse to their intersection -> `never`. Arithmetic over joined columns is
 * `unknown` as elsewhere.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { WideSchema } from "../../fixtures/parser-schemas.js";

// SELECT * across two tables that both have `status` (different unions).
// Correct: a duplicate `status` column typed as one table's union (not never).
type J1 = QueryResult<
    "SELECT * FROM orders JOIN products ON products.id = orders.id",
    WideSchema
>;
type _J1_status = RequireTrue<
    AssertEqual<J1["status"], "active" | "inactive" | "pending" | "paid" | "shipped" | "cancelled">
>;

// SELECT * across joins must still expose non-conflicting columns.
type _J1_total = RequireTrue<AssertEqual<J1["total"], number>>;
type _J1_title = RequireTrue<AssertEqual<J1["title"], string>>;

// Arithmetic over joined columns -> unknown (bare arithmetic is untyped).
type J2 = QueryResult<
    "SELECT oi.quantity * oi.unit_price AS line_total FROM order_items oi JOIN orders o ON oi.order_id = o.id",
    WideSchema
>;
type _J2 = RequireTrue<AssertEqual<J2, { line_total: unknown }>>;

// Deep 6-table qualified projection.
type J3 = QueryResult<
    "SELECT u.name, o.total, p.title, pay.amount, s.carrier, a.city FROM orders o JOIN users u ON o.user_id = u.id JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id JOIN payments pay ON pay.order_id = o.id JOIN shipments s ON s.order_id = o.id JOIN addresses a ON a.id = o.address_id",
    WideSchema
>;
type _J3 = RequireTrue<
    AssertEqual<
        J3,
        { name: string; total: number; title: string; amount: number; carrier: string; city: string }
    >
>;

// Self-join with aliases on the same table.
type J4 = QueryResult<
    "SELECT c1.name AS child, c2.name AS parent FROM categories c1 JOIN categories c2 ON c1.parent_id = c2.id",
    WideSchema
>;
type _J4 = RequireTrue<AssertEqual<J4, { child: string; parent: string }>>;

// Two same-named outputs from different tables collide via intersection.
// Correct SQL keeps both positionally; a typed lib should at least not produce
// never. We assert the second (products) union; intersection yields never.
type J5 = QueryResult<
    "SELECT o.status AS s, p.status AS s FROM orders o JOIN products p ON p.id = o.id",
    WideSchema
>;
type _J5 = RequireTrue<AssertEqual<J5, { s: "active" | "inactive" }>>;

export type ManyJoinsAdversarialLoaded = true;
