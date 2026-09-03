/**
 * Outer-join nullability through strict function calls / aggregates, a cast
 * INSIDE coalesce, JSON text extraction, and the CURRENT ROW frame bound.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = { defaultSchema: "public"; schemas: { public: {
    users: { id: number; email: string };
    orders: { id: number; user_id: number; total: number; note: string | null; status: "open" | "paid"; created_at: Date; meta: Record<string, unknown> };
} } };

// E1 — a function/aggregate call over the nullable side of an outer join is NULL
// for non-matching rows (and for an all-NULL group), so it must carry `| null`.
type E1 = GetReturnType<"select u.id, sum(o.total) as revenue, min(o.created_at) as first_order, upper(o.status) as st from users u left join orders o on o.user_id = u.id group by u.id, o.status", S>;
type _E1 = RequireTrue<AssertEqual<E1, { id: number; revenue: number | null; first_order: Date | null; st: string | null }>>;

// E2 — a cast INSIDE coalesce must not hide join nullability (`coalesce(o.note, o.status)` already types `string | null`).
type E2 = GetReturnType<"select coalesce(o.note::text, o.status) as v from users u left join orders o on o.user_id = u.id", S>;
type _E2 = RequireTrue<AssertEqual<E2, { v: string | null }>>;

// E3 — `->>` / `#>>` return NULL for a missing key or JSON null.
type E3 = GetReturnType<"select o.meta->>'sku' as sku, o.meta#>>'{a,b}' as v from orders o", S>;
type _E3 = RequireTrue<AssertEqual<E3, { sku: string | null; v: string | null }>>;

// E4 — the canonical running-total frame clause is valid PostgreSQL.
type E4 = ValidateSQL<"select o.id, sum(o.total) over (partition by o.user_id order by o.created_at rows between unbounded preceding and current row) as running from orders o", S>;
type _E4 = RequireTrue<AssertEqual<E4, true>>;
type E4b = ValidateSQL<"select sum(o.total) over (order by o.id range between unbounded preceding and current row) as r from orders o", S>;
type _E4b = RequireTrue<AssertEqual<E4b, true>>;
