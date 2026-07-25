// tests/builder/scanner-runtime.test.ts
import { describe, it, expect } from "bun:test";
import {
    scanPlaceholders,
    expandScanned,
    collectScanned,
    assertAllProvided,
} from "../../src/builder/scanner.js";

describe("expandScanned", () => {
    it("replaces :name with $n in first-appearance order, reusing repeats", () => {
        expect(expandScanned("a = :x and b = :y or c = :x", { x: 1, y: 2 }))
            .toBe("a = $1 and b = $2 or c = $1");
    });

    it("expands an IN-list array to consecutive placeholders", () => {
        expect(expandScanned("id in (:ids)", { ids: [10, 20, 30] }))
            .toBe("id in ($1, $2, $3)");
    });

    it("passes an array-VALUED column as a single placeholder (not expanded)", () => {
        // Not in IN-context → single slot even though the value is an array.
        expect(expandScanned("tags = :tags where id = :id", { tags: ["a", "b"], id: "p1" }))
            .toBe("tags = $1 where id = $2");
    });

    it("does not expand the ::cast second colon", () => {
        expect(expandScanned("id = :id::uuid", { id: "x" })).toBe("id = $1::uuid");
    });

    it("throws on mixed IN / non-IN reuse of one name", () => {
        expect(() => expandScanned("id in (:ids) and x = :ids", { ids: [1] }))
            .toThrow(/mixed IN and non-IN/i);
    });
});

describe("collectScanned", () => {
    it("flattens only IN-list arrays, in placeholder order", () => {
        expect(collectScanned("a = :x and id in (:ids) and b = :x", { x: 5, ids: [1, 2] }))
            .toEqual([5, 1, 2]);
    });

    it("passes an array-VALUED column through as a single value", () => {
        expect(collectScanned("tags = :tags", { tags: ["a", "b"] }))
            .toEqual([["a", "b"]]);
    });
});

describe("IN (subquery) is not an expansion context", () => {
    // `in (select ...)` opens a SUBQUERY, not a value list: placeholders inside
    // it are ordinary scalar params. Treating them as list members fanned an
    // array out into `= $1, $2` (malformed SQL) and made an empty array look
    // like the invalid `in ()` case.
    it("binds an array inside an IN subquery as ONE parameter", () => {
        const sql = "id in (select user_id from orders where tags = :tags)";
        expect(scanPlaceholders(sql)[0]!.inExpansion).toBe(false);
        expect(expandScanned(sql, { tags: ["a", "b"] }))
            .toBe("id in (select user_id from orders where tags = $1)");
        expect(collectScanned(sql, { tags: ["a", "b"] })).toEqual([["a", "b"]]);
    });

    it("does not reject an empty array inside an IN subquery", () => {
        const sql = "id in (select user_id from orders where tags = :tags)";
        expect(() => expandScanned(sql, { tags: [] })).not.toThrow();
        expect(collectScanned(sql, { tags: [] })).toEqual([[]]);
    });

    it("still expands a real IN value list", () => {
        expect(expandScanned("id in (:ids)", { ids: [1, 2] })).toBe("id in ($1, $2)");
    });

    it("treats `in (values ...)` / `in (with ...)` as subqueries too", () => {
        expect(scanPlaceholders("id in (values (:a))")[0]!.inExpansion).toBe(false);
    });
});

describe("empty IN-list arrays", () => {
    // `in ()` is a PostgreSQL syntax error, and there is no safe silent rewrite
    // (`in (null)` is NULL rather than false, and it inverts `not in`), so the
    // caller has to decide. Rejecting here names the parameter; letting it
    // through only fails at the driver, with no hint which one caused it.
    it("throws instead of emitting `in ()`", () => {
        expect(() => expandScanned("id in (:ids)", { ids: [] }))
            .toThrow('Query parameter ":ids" is an empty array inside an IN (...) list');
        expect(() => collectScanned("id in (:ids)", { ids: [] }))
            .toThrow('Query parameter ":ids" is an empty array inside an IN (...) list');
    });

    it("leaves an empty array OUTSIDE an IN list alone (one array param)", () => {
        // `= any(:ids)` binds the array itself — an empty array is legal there.
        expect(expandScanned("id = any(:ids)", { ids: [] })).toBe("id = any($1)");
        expect(collectScanned("id = any(:ids)", { ids: [] })).toEqual([[]]);
    });

    it("does not fire for a name that is not supplied", () => {
        expect(expandScanned("id in (:ids)", {})).toBe("id in (:ids)");
    });
});

describe("assertAllProvided", () => {
    it("throws for a live placeholder with no supplied key", () => {
        expect(() => assertAllProvided("a = :x and b = :y", { x: 1 }))
            .toThrow('Missing value for query parameter ":y"');
    });

    it("does not accept inherited Object prototype keys as supplied params", () => {
        expect(() => assertAllProvided("a = :toString", {}))
            .toThrow('Missing value for query parameter ":toString"');
        expect(expandScanned("a = :toString", {})).toBe("a = :toString");
        expect(collectScanned("a = :toString", {})).toEqual([]);

        const inherited = Object.create({ id: 42 }) as Record<string, unknown>;
        expect(() => assertAllProvided("a = :id", inherited))
            .toThrow('Missing value for query parameter ":id"');
    });

    it("does not throw when every live placeholder has a key", () => {
        expect(() => assertAllProvided("a = :x", { x: 1 })).not.toThrow();
    });

    it("ignores placeholders inside string literals / comments", () => {
        expect(() => assertAllProvided("a = :x -- :nope", { x: 1 })).not.toThrow();
    });
});
