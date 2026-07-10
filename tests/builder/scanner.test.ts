// tests/builder/scanner.test.ts
import { describe, it, expect } from "bun:test";
import { scanPlaceholders } from "../../src/builder/scanner.js";

const names = (sql: string) => scanPlaceholders(sql).map(o => o.name);

describe("scanPlaceholders", () => {
    it("finds plain placeholders", () => {
        expect(names("a = :x and b = :y")).toEqual(["x", "y"]);
    });

    it("treats ::type as a cast, not a placeholder", () => {
        // The second colon of ::uuid must NOT start a placeholder.
        expect(names("where id = :id::uuid")).toEqual(["id"]);
    });

    it("ignores placeholders inside single-quoted string literals", () => {
        expect(names("note = ':nope' and id = :id")).toEqual(["id"]);
    });

    it("ignores placeholders inside PostgreSQL escape string literals", () => {
        expect(names("note = E'can\\'t :nope' and id = :id")).toEqual(["id"]);
    });

    it("ignores placeholders inside line comments", () => {
        expect(names("id = :id -- :nope\n and b = :b")).toEqual(["id", "b"]);
    });

    it("ignores placeholders inside block comments", () => {
        expect(names("id = :id /* :nope */ and b = :b")).toEqual(["id", "b"]);
    });

    it("ignores placeholders inside nested PostgreSQL block comments", () => {
        expect(names("id = :id /* outer /* inner */ :nope */ and b = :b"))
            .toEqual(["id", "b"]);
    });

    it("ignores placeholders inside dollar-quoted strings", () => {
        expect(names("x = $tag$ :nope $tag$ and id = :id")).toEqual(["id"]);
    });

    it("ignores placeholder-looking text inside double-quoted identifiers", () => {
        expect(names('select "tenant:region" from accounts where id = :id')).toEqual(["id"]);
    });

    it("flags IN-list occurrences as inExpansion", () => {
        const occ = scanPlaceholders("id in (:ids) and x = :y");
        expect(occ.find(o => o.name === "ids")!.inExpansion).toBe(true);
        expect(occ.find(o => o.name === "y")!.inExpansion).toBe(false);
    });

    it("flags NOT IN occurrences as inExpansion", () => {
        const occ = scanPlaceholders("id not in (:ids)");
        expect(occ.find(o => o.name === "ids")!.inExpansion).toBe(true);
    });

    it("does not flag a non-IN parenthesised placeholder as inExpansion", () => {
        const occ = scanPlaceholders("x = (:y)");
        expect(occ.find(o => o.name === "y")!.inExpansion).toBe(false);
    });

    it("does not clobber a longer name sharing a prefix", () => {
        expect(names("a = :te and b = :text")).toEqual(["te", "text"]);
    });
});
