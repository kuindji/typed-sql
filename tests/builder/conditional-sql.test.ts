// tests/builder/conditional-sql.test.ts
import { describe, it, expect } from "bun:test";
import {
    processConditionalSQL,
    processParams,
    conditionalSQL,
    normalizeWhitespace,
    createConditionalQuery,
} from "../../src/builder/conditional-sql.js";
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
});

describe("processParams", () => {
    it("maps :name to $n in order and returns values", () => {
        const out = processParams("a = :x AND b = :y AND c = :x", { x: 1, y: 2 });
        expect(out.sql).toBe("a = $1 AND b = $2 AND c = $1");
        expect(out.params).toEqual([1, 2]);
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
