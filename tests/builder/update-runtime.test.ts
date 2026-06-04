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
});
