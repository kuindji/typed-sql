// tests/builder/update-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createUpdateQuery } from "../../src/builder/update.js";
import type { WriteSchema } from "./fixtures/write-schema.js";
import { asOrderId, asUserId } from "./fixtures/write-schema.js";

describe("createUpdateQuery", () => {
    it("assembles set + where and expands params", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders")
            .set("amount = :amt")
            .where("id = :oid")
            .returning("id")
            .withParams({ amt: 5, oid: asOrderId("o1") });
        expect(q.toString()).toBe("update orders set amount = $1 where id = $2 returning id");
        expect([...q.getParams()]).toEqual([5, "o1"]);
    });

    it("omits a conditional set fragment when false", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders")
            .set("amount = :amt")
            .setIf(false, "currency = :cur")
            .where("id = :oid")
            .withParams({ amt: 5, oid: asOrderId("o1") });
        expect(q.toString()).toBe("update orders set amount = $1 where id = $2");
    });

    it("supports UPDATE ... FROM", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders")
            .set("amount = :amt")
            .from("users u")
            .where("id = :oid")
            .withParams({ amt: 1, oid: asOrderId("o1") });
        expect(q.toString()).toBe("update orders set amount = $1 from users u where id = $2");
    });

    it("throws when all SET fragments were conditional and excluded", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders")
            .setIf(false, "amount = :amt")
            .where("id = :oid")
            .withParams({ oid: asOrderId("o1") });
        expect(() => q.toString()).toThrow(/UPDATE has no assignments/);
    });

    it("supports a table alias", () => {
        const q = createUpdateQuery<WriteSchema>()
            .table("orders", "o")
            .set("amount = :amt")
            .where(`o."id" = :oid`)
            .withParams({ amt: 5, oid: asOrderId("o1") });
        expect(q.toString()).toBe(`update orders o set amount = $1 where o."id" = $2`);
    });

    it("resolves aliased :params to branded column types", () => {
        const builder = createUpdateQuery<WriteSchema>().table("orders", "o")
            .set("amount = :amt").where(`o."id" = :oid`);
        // @ts-expect-error wrong value type for branded id proves inference is live
        builder.withParams({ amt: 5, oid: 123 });
        expect(true).toBe(true);
    });

    it("prepends a WITH cte", () => {
        const q = createUpdateQuery<WriteSchema>()
            .with("_lock", "select pg_advisory_xact_lock(:k) as _", true /* materialized */)
            .table("orders", "o")
            .set("amount = :amt")
            .from("_lock")
            .where(`o."id" = :oid`)
            .withParams({ k: 1, amt: 5, oid: asOrderId("o1") });
        expect(q.toString()).toBe(
            `with _lock as materialized (select pg_advisory_xact_lock($1) as _) ` +
            `update orders o set amount = $2 from _lock where o."id" = $3`);
    });

    it("extracts params from the cte body", () => {
        const q = createUpdateQuery<WriteSchema>()
            .with("_lock", "select pg_advisory_xact_lock(:k) as _")
            .table("orders").set("amount = :amt").where(`"id" = :oid`)
            .withParams({ k: 7, amt: 1, oid: asOrderId("o1") });
        expect([...q.getParams()]).toEqual([7, 1, "o1"]);
    });

    // Oracle for packages/common/.../updateItemPsePaymentStatus.ts (Task 3.1):
    // an aliased UPDATE whose SET is a literal `(case ... end)` expression (no
    // `:name` placeholders inside it, so it passes through as literal text) and
    // whose only placeholder is `:id` in the WHERE. Mirrors the migrated query:
    // `update <Item> i set "x" = (case ...) where i."id" = :id`.
    it("aliased UPDATE with a literal case-expression SET; only :id is a param", () => {
        // The SET expression interpolates a multi-line `(case ... end)` literal
        // exactly like getItemPsePaymentStatusExpression(networkId, "i") does.
        const caseExpr = `(case when i."paid" then 'paid' else 'na' end)`;
        const q = createUpdateQuery<WriteSchema>()
            .table("orders", "i")
            .set(`"currency" = ${caseExpr}`)
            .where(`i."id" = :id`)
            .withParams({ id: asOrderId("o1") });
        // The case-expression survives as literal text; `:id` becomes `$1`.
        expect(q.toString()).toBe(
            `update orders i set "currency" = ${caseExpr} where i."id" = $1`,
        );
        // ExtractParams yields exactly one param (`id`), bound to the branded id.
        expect([...q.getParams()]).toEqual([ "o1" ]);
    });

    it("aliased item UPDATE infers :id as the branded id (type oracle)", () => {
        const caseExpr = `(case when i."paid" then 'paid' else 'na' end)`;
        const builder = createUpdateQuery<WriteSchema>()
            .table("orders", "i")
            .set(`"currency" = ${caseExpr}`)
            .where(`i."id" = :id`);
        // @ts-expect-error a plain number is not assignable to the branded Order_id
        builder.withParams({ id: 123 });
        // The branded value is accepted, proving `{ id: Order_id }` is inferred.
        builder.withParams({ id: asOrderId("o1") });
        expect(true).toBe(true);
    });

    // Oracle for packages/common/.../updateItemBalance.ts (Task 3.2): the
    // advisory-lock CTE balance UPDATE. Two columns are written (two `.set`
    // fragments comma-joined), the lock is taken in a MATERIALIZED CTE before
    // the UPDATE, and `from _advisory_lock` joins it. Proves the assembled SQL
    // is semantically identical to the original raw string for BOTH the id-path
    // and the orderId-path, and that a REPEATED `:name` (the same placeholder in
    // both the CTE body and the WHERE) is deduped to a single `$n` with ONE
    // bound value.
    //
    // `caseExpr` stands in for getItemPseBalanceExpression(networkId, "i"): a
    // literal `(case ... end)` with NO `:name` placeholders, so it passes through
    // verbatim and never becomes a param.
    const caseExpr = `(case when i."paid" then 'paid' else 'na' end)`;

    it("balance UPDATE id-path: repeated :id → single $1 reused in lock body + WHERE", () => {
        // id-path: only the item `id` is known. The lock key hashes the orderId
        // looked up from the item row INSIDE the same statement, so `:id` appears
        // both in the CTE body and in the WHERE — it must dedupe to one `$1`.
        const q = createUpdateQuery<WriteSchema>()
            .with(
                "_advisory_lock",
                `select pg_advisory_xact_lock(hashtextextended(coalesce((select i2."userId"::text from "orders" i2 where i2."id" = :id), ''), 0)) as _`,
                true,
            )
            // Quoted table identifier, mirroring the real query's `"<table>"`.
            .table(`"orders"`, "i")
            .set(`"amount" = ${caseExpr}`)
            .set(`"currency" = coalesce(i."note", ${caseExpr})`)
            .from("_advisory_lock")
            .whereIf(true, `i."id" = :id`)
            .whereIf(false, `i."orderId" = :orderId`)
            .withParams({ id: asOrderId("itm1") });

        // (a) CTE prefix is present and MATERIALIZED; (b) repeated `:id` → `$1`
        // in BOTH the lock body and the WHERE.
        expect(q.toString()).toBe(
            `with _advisory_lock as materialized (` +
                `select pg_advisory_xact_lock(hashtextextended(coalesce((select i2."userId"::text from "orders" i2 where i2."id" = $1), ''), 0)) as _) ` +
                `update "orders" i set ` +
                `"amount" = ${caseExpr}, ` +
                `"currency" = coalesce(i."note", ${caseExpr}) ` +
                `from _advisory_lock where i."id" = $1`,
        );
        // (c) exactly ONE value despite `:id` appearing twice.
        expect([...q.getParams()]).toEqual(["itm1"]);
    });

    it("balance UPDATE orderId-path: lock keyed on hash(:uid), single $1", () => {
        // orderId-path: the parent key is known directly, so the lock key hashes
        // it and the WHERE filters every item of the order. The fixture `orders`
        // table has no `orderId` column, so `userId`/`:uid` stands in for the
        // real query's `orderId`/`:orderId` — semantics are identical: a single
        // branded scalar repeated in BOTH the CTE body and the WHERE must dedupe
        // to one `$1` with one bound value.
        const q = createUpdateQuery<WriteSchema>()
            .with(
                "_advisory_lock",
                `select pg_advisory_xact_lock(hashtextextended(:uid::text, 0)) as _`,
                true,
            )
            // Quoted table identifier, mirroring the real query's `"<table>"`.
            .table(`"orders"`, "i")
            .set(`"amount" = ${caseExpr}`)
            .set(`"currency" = coalesce(i."note", ${caseExpr})`)
            .from("_advisory_lock")
            .whereIf(false, `i."id" = :id`)
            .whereIf(true, `i."userId" = :uid`)
            .withParams({ uid: asUserId("ord1") });

        expect(q.toString()).toBe(
            `with _advisory_lock as materialized (` +
                `select pg_advisory_xact_lock(hashtextextended($1::text, 0)) as _) ` +
                `update "orders" i set ` +
                `"amount" = ${caseExpr}, ` +
                `"currency" = coalesce(i."note", ${caseExpr}) ` +
                `from _advisory_lock where i."userId" = $1`,
        );
        expect([...q.getParams()]).toEqual(["ord1"]);
    });
});
