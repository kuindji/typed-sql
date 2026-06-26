// tests/builder/state.test.ts
import { describe, it, expect } from "bun:test";
import { EMPTY_RUNTIME_STATE } from "../../src/builder/state.js";

describe("EMPTY_RUNTIME_STATE", () => {
    it("starts with empty fragment maps and no clauses", () => {
        expect(EMPTY_RUNTIME_STATE.selectSql).toEqual({});
        expect(EMPTY_RUNTIME_STATE.joins).toEqual([]);
        expect(EMPTY_RUNTIME_STATE.fromSql).toBeUndefined();
        expect(EMPTY_RUNTIME_STATE.distinct).toBe(false);
        expect(EMPTY_RUNTIME_STATE.namedParams).toEqual({});
        expect(EMPTY_RUNTIME_STATE.namedParamsBound).toBe(false);
    });
});
