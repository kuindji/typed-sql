// tests/builder/select-runtime.test.ts
import { describe, expect, it } from "bun:test";
import { createConditionTree } from "../../src/builder/condition-tree.js";
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
        expect(b.toString()).toBe(
            "SELECT o.id FROM Network_Order o WHERE o.id = :id",
        );
    });

    it("expands named params and orders getParams()", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = :id AND o.networkId = :nid")
            .withParams({ id: "x", nid: "y" });
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.id = $1 AND o.networkId = $2",
        );
        expect([ ...b.getParams() ]).toEqual([ "x", "y" ]);
    });

    it("throws when a bound params object misses a live placeholder", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = :id AND o.networkId = :nid")
            .withParams({ id: "x" } as any);
        expect(() => b.toString()).toThrow(
            'Missing value for query parameter ":nid"',
        );
        expect(() => b.getParams()).toThrow(
            'Missing value for query parameter ":nid"',
        );
    });

    it("does not expand a :name inside a string literal (quote-aware, matches createSql)", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.note = ':x is text' AND o.id = :id")
            .withParams({ x: "nope", id: "y" });
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.note = ':x is text' AND o.id = $1",
        );
        expect([ ...b.getParams() ]).toEqual([ "y" ]);
    });

    // IN-list-gated array expansion (spec §6.5) — the select builder shares the
    // scanner path with the write builders, so an array fans out ONLY inside
    // `IN (...)`. Anywhere else (`= ANY(:ids)`) the array binds as ONE param.
    it("expands an array param inside IN (...) to consecutive placeholders", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id IN (:ids)")
            .withParams({ ids: [ 1, 2, 3 ] });
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.id IN ($1, $2, $3)",
        );
        expect([ ...b.getParams() ]).toEqual([ 1, 2, 3 ]);
    });

    it("binds an array param to a SINGLE placeholder outside IN (e.g. = ANY)", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = ANY(:ids)")
            .withParams({ ids: [ 1, 2, 3 ] });
        // `= ANY(:ids)` is not an IN-list, so the array is NOT fanned out — it
        // stays a single `$1` and is passed to the driver as one array value
        // (the driver serializes it to a Postgres array). Expanding here would
        // emit `ANY($1, $2, $3)` and bind a scalar, which Postgres rejects.
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.id = ANY($1)",
        );
        // getParams()'s public type is scalar-only (QueryParamValue) for
        // driver-assignability; the runtime value is the array bound as ONE
        // entry, so read it through `unknown[]` to assert the shape.
        expect([ ...b.getParams() ] as unknown[]).toEqual([ [ 1, 2, 3 ] ]);
    });

    it("throws when one param is used in both IN and non-IN positions", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id IN (:ids) OR o.parentId = ANY(:ids)")
            .withParams({ ids: [ 1, 2 ] });
        expect(() => b.toString()).toThrow(/mixed IN and non-IN/);
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
        expect(outer.toString()).toBe(
            "SELECT * FROM (SELECT id FROM Network_Order)",
        );
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
        const b = createSelectQuery<EcommerceSchema>().from("Network_Order")
            .select("id");
        expect(b.toString()).toBe(b.toBrandedString());
    });

    it("treats an empty condition tree passed to where() as a no-op (no WHERE clause)", () => {
        // Legacy parity: an empty OR-tree (e.g. an empty status[] filter) must
        // NOT render `WHERE ()` — it produces no WHERE clause at all.
        const empty = createConditionTree("or");
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where(empty);
        expect(b.toString()).toBe("SELECT * FROM Network_Order o");
        expect([ ...b.getParams() ]).toEqual([]);
    });

    it("treats an empty condition tree passed to having() as a no-op (no HAVING clause)", () => {
        const empty = createConditionTree("or");
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.networkId")
            .groupBy("o.networkId")
            .having(empty);
        expect(b.toString()).toBe(
            "SELECT o.networkId FROM Network_Order o GROUP BY o.networkId",
        );
    });

    it("treats an empty condition tree passed to whereIf(true) as a no-op", () => {
        const empty = createConditionTree("or");
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .whereIf(true, empty);
        expect(b.toString()).toBe("SELECT * FROM Network_Order o");
    });

    it("treats an empty condition tree passed to havingIf(true) as a no-op", () => {
        const empty = createConditionTree("or");
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.networkId")
            .groupBy("o.networkId")
            .havingIf(true, empty);
        expect(b.toString()).toBe(
            "SELECT o.networkId FROM Network_Order o GROUP BY o.networkId",
        );
    });

    it("still renders a non-empty condition tree in where()", () => {
        const tree = createConditionTree("or").add("o.status = 1").add(
            "o.status = 2",
        );
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where(tree);
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE (o.status = 1 OR o.status = 2)",
        );
    });

    it("a where() before an empty-tree where() keeps the first clause", () => {
        const empty = createConditionTree("or");
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = :id")
            .where(empty);
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.id = :id",
        );
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

    it("uses rendered SQL as the implicit fragment id", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = :id");
        expect(b.hasWhere("o.id = :id")).toBe(true);
        expect(b.hasWhere("where_0")).toBe(false);
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
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.id = 1",
        );
    });

    it("implicit SQL ids remain stable after removing an earlier where fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .where("o.id = 1")
            .where("o.status = 'new'")
            .removeWhere("o.id = 1")
            .where("o.networkId = 'n1'");
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o WHERE o.status = 'new' AND o.networkId = 'n1'",
        );
        expect(b.hasWhere("o.status = 'new'")).toBe(true);
        expect(b.hasWhere("o.networkId = 'n1'")).toBe(true);
    });

    it("implicit SQL ids remain stable after removing an earlier select fragment", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id")
            .select("o.status")
            .removeSelect("o.id")
            .select("o.networkId");
        expect(b.toString()).toBe(
            "SELECT o.status, o.networkId FROM Network_Order o",
        );
        expect(b.hasSelect("o.status")).toBe(true);
        expect(b.hasSelect("o.networkId")).toBe(true);
    });

    it("deduplicates identical fragments that use implicit SQL ids", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id")
            .select("o.id")
            .where("o.status = 'new'")
            .where("o.status = 'new'");
        expect(b.toString()).toBe(
            "SELECT o.id FROM Network_Order o WHERE o.status = 'new'",
        );
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
            "SELECT * FROM Network_Order o "
                + "LEFT JOIN A a ON a.orderId = o.id "
                + "LEFT JOIN B b ON b.orderId = o.id "
                + "INNER JOIN C c ON c.bId = b.id",
        );

        // Upgrade b's LEFT JOIN to INNER JOIN by re-keying the same id.
        const upgraded = base.join("INNER JOIN B b ON b.orderId = o.id", "b");

        // The new b SQL stays BETWEEN a and c (not moved to the tail).
        expect(upgraded.toString()).toBe(
            "SELECT * FROM Network_Order o "
                + "LEFT JOIN A a ON a.orderId = o.id "
                + "INNER JOIN B b ON b.orderId = o.id "
                + "INNER JOIN C c ON c.bId = b.id",
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
            "SELECT * FROM Network_Order o "
                + "LEFT JOIN A a ON a.orderId = o.id "
                + "INNER JOIN B b ON b.orderId = o.id "
                + "WHERE o.id = $1",
        );
        expect([ ...upgraded.getParams() ]).toEqual([ 7 ]);
    });

    it("joins with distinct implicit SQL ids append at the end", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .join("LEFT JOIN A a ON a.orderId = o.id")
            .join("LEFT JOIN B b ON b.orderId = o.id");
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o "
                + "LEFT JOIN A a ON a.orderId = o.id "
                + "LEFT JOIN B b ON b.orderId = o.id",
        );
    });

    it("implicit SQL ids remain stable after removing an earlier join", () => {
        const b = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .join("LEFT JOIN A a ON a.orderId = o.id")
            .join("LEFT JOIN B b ON b.orderId = o.id")
            .removeJoin("LEFT JOIN A a ON a.orderId = o.id")
            .join("LEFT JOIN C c ON c.orderId = o.id");
        expect(b.toString()).toBe(
            "SELECT * FROM Network_Order o "
                + "LEFT JOIN B b ON b.orderId = o.id "
                + "LEFT JOIN C c ON c.orderId = o.id",
        );
        expect(b.hasJoin("LEFT JOIN B b ON b.orderId = o.id")).toBe(true);
        expect(b.hasJoin("LEFT JOIN C c ON c.orderId = o.id")).toBe(true);
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
        expect([ ...q.getParams() ]).toEqual([ 1, 2 ]);
    });

    it("does not treat the type of a ::cast as a placeholder", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order")
            .select("id::text", "s0")
            .withParams({ text: 9 });
        // `::text` is a cast, not a `:text` placeholder — the scanner-backed
        // expander matches createSql's behavior (no spurious rewrite).
        expect(q.toString()).toBe("SELECT id::text FROM Network_Order");
    });

    it("distinct() emits SELECT DISTINCT", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.networkId")
            .distinct();
        expect(q.toString()).toBe(
            "SELECT DISTINCT o.networkId FROM Network_Order o",
        );
    });

    it("distinct() with no explicit select emits SELECT DISTINCT *", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .distinct();
        expect(q.toString()).toBe("SELECT DISTINCT * FROM Network_Order o");
    });

    it("distinctOn() emits SELECT DISTINCT ON (col) with a single column", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id")
            .distinctOn("o.networkId")
            .orderBy("o.networkId");
        expect(q.toString()).toBe(
            "SELECT DISTINCT ON (o.networkId) o.id FROM Network_Order o ORDER BY o.networkId",
        );
    });

    it("distinctOn() joins an array of columns", () => {
        const q = createSelectQuery<EcommerceSchema>()
            .from("Network_Order o")
            .select("o.id")
            .distinctOn([ "o.networkId", "o.status" ]);
        expect(q.toString()).toBe(
            "SELECT DISTINCT ON (o.networkId, o.status) o.id FROM Network_Order o",
        );
    });
});
