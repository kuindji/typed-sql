// A condition tree whose parts are all blank must count as empty: it would
// otherwise render the invalid SQL `WHERE ()` / `(a AND ())`.
import { describe, expect, it } from "bun:test";
import { createSelectQuery, createConditionTree } from "../../src/index.js";
type S = { defaultSchema: "public"; schemas: { public: { users: { id: number } } } };

describe("condition tree with only blank parts", () => {
    it("is treated as empty and contributes no WHERE", () => {
        // e.g. built from filters that were all switched off: add(active ? "u.id = 1" : "")
        const tree = createConditionTree("or").add("").add("   ");
        expect(tree.isEmpty()).toBe(true);
        expect(createSelectQuery<S>().from("users u").where(tree).toString()).toBe("SELECT * FROM users u");
    });
    it("a blank part nested in an outer tree does not render as ()", () => {
        const inner = createConditionTree("or").add("");
        const outer = createConditionTree("and").add("u.id = 1").add(inner);
        expect(outer.toString()).toBe("(u.id = 1)");
    });
});
