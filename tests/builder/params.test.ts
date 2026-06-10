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

    it("does not treat the type of a ::cast as a placeholder", () => {
        const out = expandNamedParams("u.id::text = :y", { text: 1, y: 2 });
        // `::text` is a cast, never a placeholder — only `:y` is expanded.
        expect(out).toBe("u.id::text = $1");
    });

    it("ignores :names with no provided value", () => {
        const out = expandNamedParams("a = :x AND b = :missing", { x: 1 });
        expect(out).toBe("a = $1 AND b = :missing");
    });

    it("does not rewrite a :name inside a single-quoted string literal", () => {
        const out = expandNamedParams("note = ':x is literal' AND id = :id", { x: 1, id: 2 });
        expect(out).toBe("note = ':x is literal' AND id = $1");
    });

    it("does not rewrite a :name inside a line comment", () => {
        const out = expandNamedParams("id = :id -- skip :x here\n", { id: 1, x: 2 });
        expect(out).toBe("id = $1 -- skip :x here\n");
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

    it("does not collect a :name that only appears inside a string literal", () => {
        const vals = collectParamValues("note = ':x literal' AND id = :id", { x: 9, id: 2 });
        expect(vals).toEqual([2]);
    });
});
