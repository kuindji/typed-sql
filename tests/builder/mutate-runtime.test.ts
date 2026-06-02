// tests/builder/mutate-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createMutateFn } from "../../src/builder/mutate.js";
import { createInsertQuery } from "../../src/builder/insert.js";
import type { WriteSchema } from "./fixtures/write-schema.js";
import { asUserId, asOrderId } from "./fixtures/write-schema.js";

describe("createMutateFn", () => {
    it("executes a builder query and returns the driver's row array", async () => {
        const calls: { sql: string; params: unknown[] }[] = [];
        const mutate = createMutateFn<WriteSchema>(async (sql, params) => {
            calls.push({ sql, params });
            return [{ id: "o1" }];
        });
        const q = createInsertQuery<WriteSchema>()
            .into("orders").value("userId", ":uid").value("amount", ":amt").returning("id")
            .withParams({ uid: asUserId("u1"), amt: 5 });
        const rows = await mutate(q);
        // rows is typed { id: Order_id }[]; brand the expected literal to match.
        expect(rows).toEqual([{ id: asOrderId("o1") }]);
        expect(calls[0].sql).toBe(
            "insert into orders (userId, amount) values ($1, $2) returning id");
        expect(calls[0].params).toEqual(["u1", 5]);
    });

    it("raw overload expands named params to $n and runs the live-check", async () => {
        const calls: { sql: string; params: unknown[] }[] = [];
        const mutate = createMutateFn<WriteSchema>(async (sql, params) => {
            calls.push({ sql, params });
            return [];
        });
        await mutate("insert into orders (userId) values (:uid) returning id", { uid: asUserId("u1") });
        expect(calls[0].sql).toBe("insert into orders (userId) values ($1) returning id");
        expect(calls[0].params).toEqual(["u1"]);
    });

    it("raw overload throws on a missing live placeholder", async () => {
        const mutate = createMutateFn<WriteSchema>(async () => []);
        await expect(
            mutate("delete from orders where id = :id and paid = :paid", { id: "o1" } as any),
        ).rejects.toThrow('Missing value for query parameter ":paid"');
    });
});
