// tests/builder/scanner-runtime.test.ts
import { describe, it, expect } from "bun:test";
import {
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

describe("assertAllProvided", () => {
    it("throws for a live placeholder with no supplied key", () => {
        expect(() => assertAllProvided("a = :x and b = :y", { x: 1 }))
            .toThrow('Missing value for query parameter ":y"');
    });

    it("does not throw when every live placeholder has a key", () => {
        expect(() => assertAllProvided("a = :x", { x: 1 })).not.toThrow();
    });

    it("ignores placeholders inside string literals / comments", () => {
        expect(() => assertAllProvided("a = :x -- :nope", { x: 1 })).not.toThrow();
    });
});
