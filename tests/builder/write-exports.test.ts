// tests/builder/write-exports.test.ts
import { describe, it, expect } from "bun:test";
import {
    createInsertQuery, createUpdateQuery, createDeleteQuery, createSql, createMutateFn,
} from "../../src/index.js";

describe("write builder exports", () => {
    it("are reachable from the package root", () => {
        expect(typeof createInsertQuery).toBe("function");
        expect(typeof createUpdateQuery).toBe("function");
        expect(typeof createDeleteQuery).toBe("function");
        expect(typeof createSql).toBe("function");
        expect(typeof createMutateFn).toBe("function");
    });
});
