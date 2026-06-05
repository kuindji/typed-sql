// tests/builder/condition-tree.test.ts
import { describe, it, expect } from "bun:test";
import { createConditionTree } from "../../src/builder/condition-tree.js";
import type { AssertEqual, RequireTrue } from "../fixtures/helpers.js";

describe("createConditionTree", () => {
    it("wraps in parens and uppercases the operator", () => {
        const t = createConditionTree("and").add("a = 1").add("b = 2");
        expect(t.toString()).toBe("(a = 1 AND b = 2)");
    });

    it("renders nested trees recursively", () => {
        const inner = createConditionTree("or").add("x = 1").add("y = 2");
        const t = createConditionTree("and").add("a = 1").add(inner);
        expect(t.toString()).toBe("(a = 1 AND (x = 1 OR y = 2))");
    });

    it("remove(id) is a no-op when absent", () => {
        const t = createConditionTree("and").add("a = 1", "p1");
        expect(t.remove("nope").toString()).toBe("(a = 1)");
        expect(t.remove("p1").toString()).toBe("()");
    });

    it("replaces a part with the same id", () => {
        const t = createConditionTree("and").add("a = 1", "p").add("a = 2", "p");
        expect(t.toString()).toBe("(a = 2)");
    });

    it(".when applies the true branch", () => {
        const t = createConditionTree("and")
            .add("a = 1")
            .when(true, b => b.add("b = 2"));
        expect(t.toString()).toBe("(a = 1 AND b = 2)");
    });

    it("isEmpty() reflects whether the tree has any parts", () => {
        expect(createConditionTree("or").isEmpty()).toBe(true);
        expect(createConditionTree("and").add("a = 1").isEmpty()).toBe(false);
        // A tree emptied via remove() is empty again.
        expect(createConditionTree("and").add("a = 1", "p").remove("p").isEmpty()).toBe(true);
    });

    it("skips an empty child tree added to a non-empty parent", () => {
        const empty = createConditionTree("or"); // no parts → contributes nothing
        const t = createConditionTree("and").add("a = 1").add(empty).add("b = 2");
        expect(t.toString()).toBe("(a = 1 AND b = 2)");
    });

    it("a parent containing only an empty child tree is itself empty", () => {
        const empty = createConditionTree("or");
        const t = createConditionTree("and").add(empty);
        // The empty child is skipped on add, so the parent has no real parts.
        expect(t.isEmpty()).toBe(true);
        expect(t.toString()).toBe("()");
    });
});

// Type-level: the rendered literal is tracked in the Expr param.
const litTree = createConditionTree("and").add("a = 1").add("b = 2");
type _Expr = RequireTrue<
    AssertEqual<ReturnType<typeof litTree.toString>, "(a = 1 AND b = 2)">
>;

// Type-level: an empty child tree is skipped in the rendered literal too, so the
// Expr param stays in sync with runtime (no `() AND` phantom in the type).
const emptyChild = createConditionTree("or");
const skipTree = createConditionTree("and").add("a = 1").add(emptyChild).add("b = 2");
type _SkipExpr = RequireTrue<
    AssertEqual<ReturnType<typeof skipTree.toString>, "(a = 1 AND b = 2)">
>;
