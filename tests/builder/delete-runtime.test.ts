// tests/builder/delete-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createDeleteQuery } from "../../src/builder/delete.js";
import type { WriteSchema } from "./fixtures/write-schema.js";
import { asOrderId, asProductId } from "./fixtures/write-schema.js";

describe("createDeleteQuery", () => {
    it("assembles where and expands params", () => {
        const q = createDeleteQuery<WriteSchema>()
            .from("orders")
            .where("id = :id")
            .returning("*")
            .withParams({ id: asOrderId("o1") });
        expect(q.toString()).toBe("delete from orders where id = $1 returning *");
        expect([...q.getParams()]).toEqual(["o1"]);
    });

    it("supports USING and conditional where", () => {
        const q = createDeleteQuery<WriteSchema>()
            .from("orders")
            .using("payments p")
            .where("id = :id")
            .whereIf(false, "paid = :paid")
            .withParams({ id: asOrderId("o1") });
        expect(q.toString()).toBe("delete from orders using payments p where id = $1");
    });

    it("expands an IN-list array", () => {
        const q = createDeleteQuery<WriteSchema>()
            .from("products")
            .where("id in (:ids)")
            .withParams({ ids: [asProductId("a"), asProductId("b"), asProductId("c")] });
        expect(q.toString()).toBe("delete from products where id in ($1, $2, $3)");
        expect([...q.getParams()]).toEqual(["a", "b", "c"]);
    });
});
