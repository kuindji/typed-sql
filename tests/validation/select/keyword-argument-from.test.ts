/**
 * Lexing regressions: keyword-argument FROM inside substring/trim/overlay,
 * nested extract, `t(a, b)` column-alias lists, the comma-join length budget,
 * an implicit alias after an inner cast.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = { defaultSchema: "public"; schemas: { public: {
    users: { id: number; email: string; created_at: Date };
    orders: { id: number; user_id: number; total: number; note: string | null; status: "open" | "paid" };
} } };

// L1 — keyword-argument FROM inside a function call is not a FROM clause.
type L1a = ValidateSQL<"select substring(email from 1 for 3) as s from users", S>;
type _L1a = RequireTrue<AssertEqual<L1a, true>>;
type L1b = ValidateSQL<"select trim(leading '0' from email) as e from users", S>;
type _L1b = RequireTrue<AssertEqual<L1b, true>>;
type L1c = ValidateSQL<"select overlay(email placing 'x' from 2 for 1) as o from users", S>;
type _L1c = RequireTrue<AssertEqual<L1c, true>>;

// L2 — extract(... from ...) nested inside another call (only the outermost form is rewritten today).
type L2a = ValidateSQL<"select avg(extract(epoch from u.created_at)) as y from users u", S>;
type _L2a = RequireTrue<AssertEqual<L2a, true>>;
type L2b = ValidateSQL<"select (extract(year from u.created_at)) as y from users u", S>;
type _L2b = RequireTrue<AssertEqual<L2b, true>>;

// L3 — `t(a, b)` column-alias list over a body that projects alias-qualified columns.
type L3a = GetReturnType<"with recent(a, b) as (select o.id, o.total from orders o) select recent.a, recent.b from recent", S>;
type _L3a = RequireTrue<AssertEqual<L3a, { a: number; b: number }>>;
type L3b = GetReturnType<"select d.a, d.b from (select o.id, o.total from orders o) as d(a, b)", S>;
type _L3b = RequireTrue<AssertEqual<L3b, { a: number; b: number }>>;

// L4 — a comma join (`from users u, orders o`) drops the second relation's
// columns once the query exceeds the 500-char length budget (no error, no widening).
type Pad = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 100 chars
type L4 = GetReturnType<`select u.id, u.email, o.total, o.status from users u, orders o where o.user_id = u.id and u.email <> '${Pad}${Pad}${Pad}${Pad}${Pad}' and o.note is null`, S>;
type _L4 = RequireTrue<AssertEqual<L4, { id: number; email: string; total: number; status: "open" | "paid" }>>;

// L5 — a bare implicit alias after an expression containing `cast(... as ...)`.
type L5 = GetReturnType<"select coalesce(o.note, cast(o.id as text)) note from orders o", S>;
type _L5 = RequireTrue<AssertEqual<L5, { note: string }>>;
