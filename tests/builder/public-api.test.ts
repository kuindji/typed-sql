// tests/builder/public-api.test.ts
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createSelectFn,
    createConditionTree,
    createConditionalQuery,
    assembleSelectSQL,
    conditionalSQL,
    processConditionalSQL,
    processParams,
    withConditions,
} from "../../src/index.js";

describe("public builder API surface", () => {
    it("exposes all runtime entry points from the package root", () => {
        expect(typeof createSelectQuery).toBe("function");
        expect(typeof createSelectFn).toBe("function");
        expect(typeof createConditionTree).toBe("function");
        expect(typeof createConditionalQuery).toBe("function");
        expect(typeof assembleSelectSQL).toBe("function");
        expect(typeof conditionalSQL).toBe("function");
        expect(typeof processConditionalSQL).toBe("function");
        expect(typeof processParams).toBe("function");
        expect(typeof withConditions).toBe("function");
    });
});
