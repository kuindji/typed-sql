// tests/builder/createsql-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createSql } from "../../src/builder/sql.js";
import type { WriteSchema } from "./fixtures/write-schema.js";
import { asOrderId, asProductId } from "./fixtures/write-schema.js";

const sql = createSql<WriteSchema>();

describe("createSql", () => {
    it("expands named params and collects values", () => {
        // Branded params are compile-time only; the runtime value is the raw string.
        const q = sql("delete from orders where id = :id").withParams({ id: asOrderId("o1") });
        expect(q.toString()).toBe("delete from orders where id = $1");
        expect([...q.getParams()]).toEqual(["o1"]);
    });

    it("runs the live-placeholder check", () => {
        const q = sql("delete from orders where id = :id and paid = :paid")
            .withParams({ id: "o1" } as any);
        expect(() => q.getParams()).toThrow('Missing value for query parameter ":paid"');
    });

    it("expands IN-list arrays", () => {
        const q = sql("delete from products where id in (:ids)")
            .withParams({ ids: [asProductId("a"), asProductId("b")] });
        expect(q.toString()).toBe("delete from products where id in ($1, $2)");
        expect([...q.getParams()]).toEqual(["a", "b"]);
    });
});
