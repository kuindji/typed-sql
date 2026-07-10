// tests/builder/conditional-sql.test.ts
import { describe, it, expect } from "bun:test";
import {
    processConditionalSQL,
    processParams,
    conditionalSQL,
    createConditionalQuery,
} from "../../src/builder/conditional-sql.js";
import { normalizeWhitespace } from "../../src/builder/testing/normalizeWhitespace.js";
import type { EcommerceSchema } from "../fixtures/ecommerce-schema.js";

describe("processConditionalSQL", () => {
    it("includes a block when the condition is truthy", () => {
        const out = processConditionalSQL(
            "SELECT id/*if:withName*/, name/*endif*/ FROM t",
            { withName: true },
        );
        expect(out).toBe("SELECT id, name FROM t");
    });
    it("excludes a block when falsy and supports negation + nesting", () => {
        const out = processConditionalSQL(
            "a/*if:x*/ X/*if:y*/ Y/*endif*//*endif*//*if:!z*/ NZ/*endif*/",
            { x: true, y: false, z: false },
        );
        expect(out).toBe("a X NZ");
    });
    it("resolves dotted condition paths", () => {
        const out = processConditionalSQL(
            "a/*if:user.isAdmin*/ ADMIN/*endif*/",
            { user: { isAdmin: true } },
        );
        expect(out).toBe("a ADMIN");
    });
    it("ignores inherited condition keys at every path segment", () => {
        const inheritedRoot = Object.create({ enabled: true }) as Record<string, unknown>;
        expect(processConditionalSQL("a/*if:enabled*/ X/*endif*/", inheritedRoot))
            .toBe("a");

        const inheritedChild = Object.create({ isAdmin: true }) as Record<string, unknown>;
        expect(processConditionalSQL(
            "a/*if:user.isAdmin*/ ADMIN/*endif*/",
            { user: inheritedChild },
        )).toBe("a");
    });
});

describe("processParams", () => {
    it("maps :name to $n in order and returns values", () => {
        const out = processParams("a = :x AND b = :y AND c = :x", { x: 1, y: 2 });
        expect(out.sql).toBe("a = $1 AND b = $2 AND c = $1");
        expect(out.params).toEqual([1, 2]);
    });

    it("throws when a used param value is undefined", () => {
        expect(() => processParams("a = :x", { x: undefined as unknown as number })).toThrow(
            'Query parameter ":x" is used but its value is undefined',
        );
    });

    it("throws when a live placeholder is missing from params", () => {
        expect(() => processParams("a = :x AND b = :y", { x: 1 })).toThrow(
            'Missing value for query parameter ":y"',
        );
    });

    it("does not accept inherited Object prototype keys as supplied params", () => {
        expect(() => processParams("a = :constructor", {})).toThrow(
            'Missing value for query parameter ":constructor"',
        );
        const inherited = Object.create({ id: 42 }) as Record<string, number>;
        expect(() => processParams("a = :id", inherited)).toThrow(
            'Missing value for query parameter ":id"',
        );
    });

    it("does not rewrite a :name inside a string literal", () => {
        const out = processParams("note = ':x literal' AND id = :id", { x: 1, id: 2 });
        expect(out.sql).toBe("note = ':x literal' AND id = $1");
        expect(out.params).toEqual([2]);
    });

    it("does not treat the type of a ::cast as a placeholder", () => {
        const out = processParams("u.id::text = :y", { text: 1, y: 2 });
        expect(out.sql).toBe("u.id::text = $1");
        expect(out.params).toEqual([2]);
    });
});

describe("conditionalSQL + normalizeWhitespace", () => {
    it("composes blocks and params", () => {
        const out = conditionalSQL(
            "SELECT id /*if:e*/, email/*endif*/ FROM t WHERE id = :id",
            { e: true },
            { id: 5 },
        );
        expect(normalizeWhitespace(out.sql)).toBe("SELECT id, email FROM t WHERE id = $1");
        expect(out.params).toEqual([5]);
    });
});

describe("createConditionalQuery", () => {
    it("returns processed sql + params", () => {
        const query = createConditionalQuery<EcommerceSchema>();
        const { sql, params } = query(
            "SELECT id FROM Network_Order WHERE id = :id",
            {},
            { id: "z" },
        );
        expect(sql).toBe("SELECT id FROM Network_Order WHERE id = $1");
        expect(params).toEqual(["z"]);
    });
});
