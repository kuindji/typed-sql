// tests/builder/db-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createSelectFn } from "../../src/builder/db.js";
import { createSelectQuery } from "../../src/builder/select.js";
import type { EcommerceSchema } from "../fixtures/ecommerce-schema.js";

describe("createSelectFn runtime", () => {
    it("passes string query + params straight to the handler", async () => {
        let seen: [string, unknown[] | undefined] | null = null;
        const select = createSelectFn<EcommerceSchema>((sql, params) => {
            seen = [sql, params];
            return Promise.resolve([]);
        });
        await select("SELECT id FROM Network_Order", [1]);
        expect(seen![0]).toBe("SELECT id FROM Network_Order");
        expect(seen![1]).toEqual([1]);
    });

    it("assembles a builder and derives params when none passed", async () => {
        let seen: [string, unknown[] | undefined] | null = null;
        const select = createSelectFn<EcommerceSchema>((sql, params) => {
            seen = [sql, params];
            return Promise.resolve([]);
        });
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .where("id = :id")
            .withParams({ id: "abc" });
        // `b` is a valid literal builder → `select(b)` type-checks without a cast.
        await select(b);
        expect(seen![0]).toBe("SELECT * FROM Network_Order WHERE id = $1");
        expect(seen![1]).toEqual(["abc"]);
    });
});
