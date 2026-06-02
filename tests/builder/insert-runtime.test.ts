// tests/builder/insert-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createInsertQuery } from "../../src/builder/insert.js";
import type { WriteSchema } from "./fixtures/write-schema.js";
import { asUserId, asOrderId } from "./fixtures/write-schema.js";

describe("createInsertQuery", () => {
    it("assembles columns/values and expands params", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("userId", ":uid")
            .value("amount", ":amt")
            .value("createdAt", "now()")
            .returning("id")
            .withParams({ uid: asUserId("u1"), amt: 5 });
        expect(q.toString()).toBe(
            "insert into orders (userId, amount, createdAt) values ($1, $2, now()) returning id");
        expect([...q.getParams()]).toEqual(["u1", 5]);
    });

    it("includes a conditional value only when its flag is true", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("userId", ":uid")
            .valueIf(false, "note", ":note")
            .withParams({ uid: asUserId("u1") });
        expect(q.toString()).toBe("insert into orders (userId) values ($1)");
        expect([...q.getParams()]).toEqual(["u1"]);
    });

    it("appends onConflict params resolved against target table", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .value("id", ":id")
            .value("amount", ":amt")
            .onConflict("(id) do update set amount = :amt2")
            .withParams({ id: asOrderId("o1"), amt: 1, amt2: 2 });
        expect(q.toString()).toBe(
            "insert into orders (id, amount) values ($1, $2) on conflict (id) do update set amount = $3");
        expect([...q.getParams()]).toEqual(["o1", 1, 2]);
    });

    it("throws when all value fragments were conditional and excluded", () => {
        const q = createInsertQuery<WriteSchema>()
            .into("orders")
            .valueIf(false, "userId", ":uid")
            .withParams({});
        expect(() => q.toString()).toThrow(/INSERT has no columns/);
    });
});
