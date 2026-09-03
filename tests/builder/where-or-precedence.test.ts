// Multiple where()/having() fragments are AND-ed; a fragment that contains an OR
// must be parenthesized or its precedence changes. OR-free fragments and
// already-parenthesized groups are emitted verbatim (see assemble.ts joinConditions).
import { describe, expect, it } from "bun:test";
import { createSelectQuery, createUpdateQuery, createDeleteQuery } from "../../src/index.js";
type S = { defaultSchema: "public"; schemas: { public: { users: { id: number; name: string | null; deleted: boolean } } } };

describe("multi-fragment WHERE/HAVING keep each fragment's own precedence", () => {
    it("select: two where() fragments, first has a top-level OR", () => {
        const sql = createSelectQuery<S>().from("users u")
            .where("u.id = 1 or u.id = 2")
            .where("u.deleted = false")
            .toString();
        // Currently emits: WHERE u.id = 1 or u.id = 2 AND u.deleted = false
        // which Postgres parses as  u.id = 1 OR (u.id = 2 AND u.deleted = false)
        // and returns deleted rows with id = 1.
        expect(sql).toBe("SELECT * FROM users u WHERE (u.id = 1 or u.id = 2) AND u.deleted = false");
    });
    it("select: having() has the same hazard", () => {
        const sql = createSelectQuery<S>().from("users u").select("u.id").groupBy("u.id")
            .having("count(*) > 1 or count(*) = 0").having("max(u.id) > 5").toString();
        expect(sql).toBe("SELECT u.id FROM users u GROUP BY u.id HAVING (count(*) > 1 or count(*) = 0) AND max(u.id) > 5");
    });
    it("update/delete builders: same joining rule", () => {
        expect(createUpdateQuery<S>().table("users").set("name = 'x'").where("id = 1 or id = 2").where("deleted = false").toString())
            .toBe("update users set name = 'x' where (id = 1 or id = 2) and deleted = false");
        expect(createDeleteQuery<S>().from("users").where("id = 1 or id = 2").where("deleted = false").toString())
            .toBe("delete from users where (id = 1 or id = 2) and deleted = false");
    });
    it("an already-parenthesized OR group and OR-free fragments are left verbatim", () => {
        const sql = createSelectQuery<S>().from("users u")
            .where("(u.id = 1 or u.id = 2)")
            .where("u.deleted = false")
            .where("u.name = 'a or b'")
            .toString();
        expect(sql).toBe("SELECT * FROM users u WHERE (u.id = 1 or u.id = 2) AND u.deleted = false AND (u.name = 'a or b')");
    });
});
