/**
 * Scope-resolution regressions found in the 2026-09 review: CTE range aliases,
 * multi-CTE names, output aliases in GROUP BY / ORDER BY, joined derived
 * sources in the projection, `returning *`. Type-level: this file compiling is
 * the test.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = { defaultSchema: "public"; schemas: { public: {
    users: { id: number; name: string | null; email: string; created_at: Date };
    orders: { id: number; user_id: number; total: number; note: string | null; status: "open" | "paid" };
} } };

// F1 — a CTE used through a range alias (`from recent r`) is rejected and typed {}.
type F1_Valid = ValidateSQL<"with recent as (select id, email from users) select r.id, r.email from recent r", S>;
type _F1a = RequireTrue<AssertEqual<F1_Valid, true>>;
type F1_Row = GetReturnType<"with recent as (select id, email from users) select r.id, r.email from recent r", S>;
type _F1b = RequireTrue<AssertEqual<F1_Row, { id: number; email: string }>>;
type F1_Star = GetReturnType<"with recent as (select id, email from users) select r.* from recent r", S>;
type _F1c = RequireTrue<AssertEqual<F1_Star, { id: number; email: string }>>;
type F1_Join = ValidateSQL<"with tot as (select user_id, sum(total) as amount from orders group by user_id) select u.email, t.amount from users u join tot t on t.user_id = u.id", S>;
type _F1d = RequireTrue<AssertEqual<F1_Join, true>>;

// F2 — two CTEs: the second CTE's NAME is scanned as a column of the outer query.
type F2 = ValidateSQL<"with a as (select id from users), b as (select id from orders) select a.id from a", S>;
type _F2 = RequireTrue<AssertEqual<F2, true>>;

// F3 — ORDER BY output alias alongside a qualified ref.
type F3 = ValidateSQL<"select o.user_id, sum(o.total) as revenue from orders o group by o.user_id order by revenue desc, o.user_id", S>;
type _F3 = RequireTrue<AssertEqual<F3, true>>;

// F4 — GROUP BY an output alias (legal in PostgreSQL).
type F4 = ValidateSQL<"select o.status as st, count(*) as c from orders o group by st", S>;
type _F4 = RequireTrue<AssertEqual<F4, true>>;

// F5 — projecting a column of a JOINed derived table / LATERAL subquery.
type F5a = ValidateSQL<"select u.id, r.total from users u join (select o.user_id, o.total from orders o) r on r.user_id = u.id", S>;
type _F5a = RequireTrue<AssertEqual<F5a, true>>;
type F5b = ValidateSQL<"select u.id, r.total from users u left join lateral (select o.total from orders o where o.user_id = u.id order by o.id desc limit 1) r on true", S>;
type _F5b = RequireTrue<AssertEqual<F5b, true>>;

// F6 — RETURNING * must expand the TARGET table only, not FROM/USING/source relations.
type OrdersRow = { id: number; user_id: number; total: number; note: string | null; status: "open" | "paid" };
type F6a = GetReturnType<"update orders o set total = 0 from users u where u.id = o.user_id returning *", S>;
type _F6a = RequireTrue<AssertEqual<F6a, OrdersRow>>;
type F6b = GetReturnType<"delete from orders o using users u where u.id = o.user_id returning *", S>;
type _F6b = RequireTrue<AssertEqual<F6b, OrdersRow>>;
type F6c = GetReturnType<"insert into orders (user_id, total) select u.id, 1 from users u returning *", S>;
type _F6c = RequireTrue<AssertEqual<F6c, OrdersRow>>;

// KNOWN LIMITATION (pinned): a UNION row is typed from its FIRST branch only. The
// runtime value is NULL whenever a later branch supplies a NULL (`note` here), so
// the precise type is `string | null`; the second branch is not inspected yet.
type F7 = GetReturnType<"select email from users union all select note from orders", S>;
type _F7 = RequireTrue<AssertEqual<F7, { email: string }>>;
