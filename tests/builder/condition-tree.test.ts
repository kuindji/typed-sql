// tests/builder/condition-tree.test.ts
import { describe, it, expect } from "bun:test";
import { createConditionTree } from "../../src/builder/condition-tree.js";
import { createSelectQuery } from "../../src/builder/select.js";
import type { AssertEqual, RequireTrue } from "../fixtures/helpers.js";

describe("createConditionTree", () => {
    it("keeps an OR operand inside every AND filter", () => {
        const tree = createConditionTree("and")
            .add("id = 1 or id = 2")
            .add("deleted = false");
        const expected = "((id = 1 or id = 2) AND deleted = false)";
        expect(tree.toString()).toBe(expected);
        expect(createSelectQuery().from("users").where(tree).toString())
            .toBe(`SELECT * FROM users WHERE ${expected}`);
        type _Rendered = RequireTrue<AssertEqual<ReturnType<typeof tree.toString>, typeof expected>>;
    });

    it("groups compact and commented OR operands on either side of AND", () => {
        const tree = createConditionTree("and")
            .add("tenant_id = 7")
            .add("(id = 1)OR(id = 2)")
            .add("active = true/**/or/**/admin = true");
        const expected = "(tenant_id = 7 AND ((id = 1)OR(id = 2)) AND (active = true/**/or/**/admin = true))";
        expect(tree.toString()).toBe(expected);
        type _Rendered = RequireTrue<AssertEqual<ReturnType<typeof tree.toString>, typeof expected>>;
    });

    it("preserves grouping through nested trees, replacement, and removal", () => {
        const child = createConditionTree("and").add("a or b").add("c");
        const tree = createConditionTree("and").add(child).add("d", "filter");
        expect(tree.toString()).toBe("(((a or b) AND c) AND d)");
        expect(tree.add("e OR f", "filter").toString()).toBe("(((a or b) AND c) AND (e OR f))");
        expect(tree.remove("filter").toString()).toBe("(((a or b) AND c))");
    });

    it("tracks trimmed and skipped string operands in the literal type", () => {
        const tree = createConditionTree("and").add("  id = 1  ").add(" \n ").add(" active = true ");
        const expected = "(id = 1 AND active = true)";
        expect(tree.toString()).toBe(expected);
        type _Rendered = RequireTrue<AssertEqual<ReturnType<typeof tree.toString>, typeof expected>>;
    });

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
