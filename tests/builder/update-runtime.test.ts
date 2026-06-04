// tests/builder/update-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createUpdateQuery } from "../../src/builder/update.js";
import type { WriteSchema } from "./fixtures/write-schema.js";
import { asOrderId } from "./fixtures/write-schema.js";

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
});
