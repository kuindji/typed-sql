/**
 * `ExtractParams` over refs that belong to ANOTHER relation than the write
 * target (sub-select WHERE, `update … from`, `delete … using`): the binding must
 * degrade to loose (`unknown`), never `never`, and params inside FROM / USING
 * sources and nested VALUES sub-selects must be present. Compiling = passing.
 */
import { createSql, createUpdateQuery, createDeleteQuery } from "../../../src/index.js";
import type { ExtractParams } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = { defaultSchema: "public"; schemas: { public: {
    users: { id: number; name: string | null; email: string };
    orders: { id: number; user_id: number; total: number; note: string | null; status: "open" | "paid" };
} } };
const sql = createSql<S>();

// P1 — an unqualified column of ANOTHER relation (sub-select / FROM / USING)
// is scoped to the target table, misses, and binds `never`: no value is accepted.
sql("update orders set status = :s where user_id in (select id from users where email = :e)")
    .withParams({ s: "paid", e: "a@b.com" });
createUpdateQuery<S>().table("orders").set("status = :s")
    .where("user_id in (select id from users where email = :e)")
    .withParams({ s: "paid", e: "a@b.com" });
createDeleteQuery<S>().from("orders")
    .where("exists (select 1 from users where email = :e)")
    .withParams({ e: "a@b.com" });
sql("update orders o set total = :t from users u where o.user_id = u.id and email = :e")
    .withParams({ t: 1, e: "a@b.com" });
type P1 = ExtractParams<"delete from orders using users u where user_id = u.id and email = :e", S>;
type _P1 = RequireTrue<AssertEqual<P1["e"], unknown>>; // loose (unknown), never `never`

// P2 — params inside UPDATE…FROM / DELETE…USING sources (and a nested VALUES
// sub-select) are absent from the params type, so the object literal is rejected.
sql("update orders o set total = :t from (select id from users where email = :e) u where o.user_id = u.id")
    .withParams({ t: 1, e: "a@b.com" });
sql("delete from orders using (select id from users where email = :e) u where orders.user_id = u.id and orders.total > :min")
    .withParams({ e: "a@b.com", min: 5 });
sql("insert into orders (user_id, total) values ((select id from users where email = :e), :t)")
    .withParams({ e: "a@b.com", t: 1 });
