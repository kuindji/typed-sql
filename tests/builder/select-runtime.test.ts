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

describe("has*/remove* clause introspection", () => {
    // A builder with one fragment of every clause kind, all under known ids.
    const full = () =>
        createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id", "sid")
            .join("JOIN Network_OrderItem i ON i.orderId = o.id", "ji")
            .where("o.id = :id", "wid")
            .groupBy("o.id", "gid")
            .having("COUNT(*) > 1", "hid")
            .orderBy("o.id DESC", "oid")
            .limit(10)
            .offset(5);

    it("has* keyed predicates: true for present ids, false for absent", () => {
        const b = full();
        expect(b.hasSelect("sid")).toBe(true);
        expect(b.hasSelect("nope")).toBe(false);
        expect(b.hasJoin("ji")).toBe(true);
        expect(b.hasJoin("nope")).toBe(false);
        expect(b.hasWhere("wid")).toBe(true);
        expect(b.hasWhere("nope")).toBe(false);
        expect(b.hasGroupBy("gid")).toBe(true);
        expect(b.hasGroupBy("nope")).toBe(false);
        expect(b.hasHaving("hid")).toBe(true);
        expect(b.hasHaving("nope")).toBe(false);
        expect(b.hasOrderBy("oid")).toBe(true);
        expect(b.hasOrderBy("nope")).toBe(false);
    });

    it("has* scalar predicates: hasFrom/hasLimit/hasOffset", () => {
        const empty = createSelectQuery<EcommerceSchema>();
        expect(empty.hasFrom()).toBe(false);
        expect(empty.hasLimit()).toBe(false);
        expect(empty.hasOffset()).toBe(false);
        const b = full();
        expect(b.hasFrom()).toBe(true);
        expect(b.hasLimit()).toBe(true);
        expect(b.hasOffset()).toBe(true);
    });

    it("has* sees auto-generated ids (runtime counter scheme)", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = :id"); // auto id where_0
        expect(b.hasWhere("where_0")).toBe(true);
        expect(b.hasWhere("where_1")).toBe(false);
    });

    it("removeWhere drops only the targeted fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = 1", "w1")
            .where("o.status = 2", "w2")
            .removeWhere("w1");
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.status = 2",
        );
    });

    it("removeGroupBy drops only the targeted fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .groupBy("o.id", "g1")
            .groupBy("o.status", "g2")
            .removeGroupBy("g1");
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o GROUP BY o.status",
        );
    });

    it("removeHaving drops only the targeted fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .groupBy("o.id", "g1")
            .having("COUNT(*) > 1", "h1")
            .having("SUM(o.total) > 0", "h2")
            .removeHaving("h1");
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o GROUP BY o.id HAVING SUM(o.total) > 0",
        );
    });

    it("removeOrderBy drops only the targeted fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .orderBy("o.id DESC", "o1")
            .orderBy("o.status ASC", "o2")
            .removeOrderBy("o1");
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o ORDER BY o.status ASC",
        );
    });

    it("remove* is a no-op for an absent id", () => {
        const before = full();
        expect(before.removeWhere("nope").toString()).toBe(before.toString());
        expect(before.removeGroupBy("nope").toString()).toBe(before.toString());
        expect(before.removeHaving("nope").toString()).toBe(before.toString());
        expect(before.removeOrderBy("nope").toString()).toBe(before.toString());
    });

    it("remove* immutability: the source builder keeps its fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = 1", "w1");
        b.removeWhere("w1"); // discard result on purpose
        expect(b.hasWhere("w1")).toBe(true);
        expect(b.toString()).toBe("SELECT * FROM Network_Order o WHERE o.id = 1");
    });
});

describe("keyed re-join preserves join position", () => {
    it("re-joining an existing id replaces its SQL in place, keeping order", () => {
        // Three keyed joins a, b, c where c's ON references b's alias — so c MUST
        // render after b for valid SQL.
        const base = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .join("LEFT JOIN A a ON a.orderId = o.id", "a")
            .join("LEFT JOIN B b ON b.orderId = o.id", "b")
            .join("INNER JOIN C c ON c.bId = b.id", "c");

        expect(base.toString()).toBe(
            "SELECT * FROM Network_Order o " +
            "LEFT JOIN A a ON a.orderId = o.id " +
            "LEFT JOIN B b ON b.orderId = o.id " +
            "INNER JOIN C c ON c.bId = b.id",
        );

        // Upgrade b's LEFT JOIN to INNER JOIN by re-keying the same id.
        const upgraded = base.join("INNER JOIN B b ON b.orderId = o.id", "b");

        // The new b SQL stays BETWEEN a and c (not moved to the tail).
        expect(upgraded.toString()).toBe(
            "SELECT * FROM Network_Order o " +
            "LEFT JOIN A a ON a.orderId = o.id " +
            "INNER JOIN B b ON b.orderId = o.id " +
            "INNER JOIN C c ON c.bId = b.id",
        );
    });

    it("re-joining leaves params and other clauses unaffected", () => {
        const base = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .join("LEFT JOIN A a ON a.orderId = o.id", "a")
            .join("LEFT JOIN B b ON b.orderId = o.id", "b")
            .where("o.id = :id", "wid")
            .withParams({ id: 7 });

        const upgraded = base.join("INNER JOIN B b ON b.orderId = o.id", "b");

        expect(upgraded.toString()).toBe(
            "SELECT * FROM Network_Order o " +
            "LEFT JOIN A a ON a.orderId = o.id " +
            "INNER JOIN B b ON b.orderId = o.id " +
            "WHERE o.id = $1",
        );
        expect([...upgraded.getParams()]).toEqual([7]);
    });

    it("no-id auto-key joins still append at the end", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .join("LEFT JOIN A a ON a.orderId = o.id")
            .join("LEFT JOIN B b ON b.orderId = o.id");
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o " +
            "LEFT JOIN A a ON a.orderId = o.id " +
            "LEFT JOIN B b ON b.orderId = o.id",
        );
    });
});

describe("two SQL forms + param regex edges (F4/F4b)", () => {
    it("toString expands :name to $n while BuilderSQL keeps :name", () => {
        const pq = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .where("id = :id")
            .withParams({ id: "x" });
        expect(pq.toString()).toBe("SELECT * FROM Network_Order WHERE id = $1");
    });

    it("does not cross-clobber :te and :text", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .where("a = :te AND b = :text")
            .withParams({ te: 1, text: 2 });
        expect(q.toString()).toBe(
            "SELECT * FROM Network_Order WHERE a = $1 AND b = $2",
        );
        expect([...q.getParams()]).toEqual([1, 2]);
    });

    it("expands the ::cast second colon (intentional parity quirk)", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .select("id::text", "s0")
            .withParams({ text: 9 });
        expect(q.toString()).toBe("SELECT id:$1 FROM Network_Order");
    });
});
