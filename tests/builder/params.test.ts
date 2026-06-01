// tests/builder/params.test.ts
import { describe, it, expect } from "bun:test";
import { expandNamedParams, collectParamValues } from "../../src/builder/params.js";

describe("expandNamedParams", () => {
    it("replaces :name with $n in first-appearance order", () => {
        const out = expandNamedParams("a = :x AND b = :y OR c = :x", { x: 1, y: 2 });
        expect(out).toBe("a = $1 AND b = $2 OR c = $1");
    });

    it("expands array params to consecutive placeholders", () => {
        const out = expandNamedParams("id IN (:ids)", { ids: [10, 20, 30] });
        expect(out).toBe("id IN ($1, $2, $3)");
    });

    it("does not clobber a longer param with a shorter prefix (:te vs :text)", () => {
        const out = expandNamedParams("a = :te AND b = :text", { te: 1, text: 2 });
        expect(out).toBe("a = $1 AND b = $2");
    });

    it("matches the second colon of a ::cast (intentional parity quirk)", () => {
        const out = expandNamedParams("u.id::text = :y", { text: 1, y: 2 });
        // The regex matches `:text` inside `::text` → expands the cast.
        expect(out).toBe("u.id:$1 = $2");
    });

    it("ignores :names with no provided value", () => {
        const out = expandNamedParams("a = :x AND b = :missing", { x: 1 });
        expect(out).toBe("a = $1 AND b = :missing");
    });
});

describe("collectParamValues", () => {
    it("returns values in first-appearance order, flattening arrays", () => {
        const vals = collectParamValues("a = :x AND id IN (:ids) AND b = :x", {
            x: 5,
            ids: [1, 2],
        });
        expect(vals).toEqual([5, 1, 2]);
    });

    it("throws when a used param value is undefined", () => {
        expect(() => collectParamValues("a = :x", { x: undefined })).toThrow(
            'Query parameter ":x" is used but its value is undefined',
        );
    });
});
