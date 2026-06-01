// tests/builder/select-runtime.test.ts
import { describe, it, expect } from "bun:test";
import { createSelectQuery } from "../../src/builder/select.js";
import type { EcommerceSchema } from "../fixtures/ecommerce-schema.js";

describe("createSelectQuery runtime", () => {
    it("assembles a basic query and is immutable per method", () => {
        const b0 = createSelectQuery<EcommerceSchema>().from("Network_Order o");
        const b1 = b0.select("o.id");
        expect(b0.toString()).toBe("SELECT * FROM Network_Order o");
        expect(b1.toString()).toBe("SELECT o.id FROM Network_Order o");
    });

    it("honors *If conditions at runtime", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id")
            .selectIf(false, "o.status")
            .whereIf(true, "o.id = :id");
        expect(b.toString()).toBe("SELECT o.id FROM Network_Order o WHERE o.id = :id");
    });

    it("expands named params and orders getParams()", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = :id AND o.networkId = :nid")
            .withParams({ id: "x", nid: "y" });
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.id = $1 AND o.networkId = $2",
        );
        expect([...b.getParams()]).toEqual(["x", "y"]);
    });

    it("removeSelect drops the fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id", "sid")
            .select("o.status", "sstatus")
            .removeSelect("sid");
        expect(b.toString()).toBe("SELECT o.status FROM Network_Order o");
    });

    it("embeds a param-free subquery via from(builder)", () => {
        const inner = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .select("id");
        const outer = createSelectQuery<EcommerceSchema>().from(inner);
        expect(outer.toString()).toBe("SELECT * FROM (SELECT id FROM Network_Order)");
    });

    it("throws when from(builder) carries params", () => {
        const inner = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .where("id = :id")
            .withParams({ id: 1 });
        expect(() => createSelectQuery<EcommerceSchema>().from(inner)).toThrow(
            /parameterized subquery/i,
        );
    });

    it("toBrandedString returns the same SQL as toString", () => {
        const b = createSelectQuery<EcommerceSchema>().from("Network_Order").select("id");
        expect(b.toString()).toBe(b.toBrandedString());
    });
});
