import { describe, expect, it } from "bun:test";
import { createInsertQuery, createSelectQuery, createSql, createUpdateQuery, createDeleteQuery } from "../../src/index.js";
import { createScannedQuery, prepareScanned } from "../../src/builder/scanner.js";

type Schema = {
    defaultSchema: "public";
    schemas: { public: { users: { id: number; name: string } } };
};

describe("reusable query preparation", () => {
    it("reuses syntax while reading current values, array lengths, and missing keys", () => {
        const plan = createScannedQuery("select id from users where id in (:ids) and name = :name or id in (:ids)");
        const params: Record<string, unknown> = { ids: [1, 2], name: "first" };
        expect(plan.prepare(params)).toEqual({
            sql: "select id from users where id in ($1, $2) and name = $3 or id in ($1, $2)",
            values: [1, 2, "first"],
        });
        params.ids = [3];
        params.name = "second";
        expect(plan.expand(params)).toBe("select id from users where id in ($1) and name = $2 or id in ($1)");
        expect(plan.collect(params)).toEqual([3, "second"]);
        params.ids = [];
        expect(() => plan.expand(params)).toThrow("empty array");
        params.ids = [4];
        params.name = undefined;
        expect(() => plan.collect(params)).toThrow("undefined");
        delete params.name;
        expect(() => plan.expand(params)).toThrow('Missing value for query parameter ":name"');
    });

    it("prepares repeated names, skipped literals, and arrays in one consistent order", () => {
        expect(prepareScanned("select ':fake', :name where id in (:ids) or owner in (:ids)", { ids: [4, 5], name: "a" }))
            .toEqual({ sql: "select ':fake', $1 where id in ($2, $3) or owner in ($2, $3)", values: ["a", 4, 5] });
    });

    it("refreshes raw-SQL bindings after earlier rendering and returns fresh value lists", () => {
        const params = { id: 1 };
        const q = createSql<Schema>()("delete from users where id = :id").withParams(params);
        expect(q.toString()).toBe("delete from users where id = $1");
        expect(q.getParams()).toEqual([1]);
        params.id = 2;
        expect(q.getParams()).toEqual([2]);
        const values = q.getParams() as unknown[];
        values[0] = 99;
        expect(q.getParams()).toEqual([2]);
    });

    it("refreshes select array expansion and keeps derived builders independent", () => {
        const ids = [1];
        const q = createSelectQuery<Schema>().from("users").select("id").where("id in (:ids)").withParams({ ids });
        expect(q.toString()).toBe("SELECT id FROM users WHERE id in ($1)");
        ids.push(2);
        expect(String(q.toBrandedString())).toBe("SELECT id FROM users WHERE id in ($1, $2)");
        expect(q.getParams()).toEqual([1, 2]);
        const filtered = q.where("name = :name").withParams({ name: "a" });
        expect(filtered.toString()).toBe("SELECT id FROM users WHERE id in ($1, $2) AND name = $3");
        expect(filtered.getParams()).toEqual([1, 2, "a"]);
        expect(q.getParams()).toEqual([1, 2]);
    });

    it("keeps write-builder branches independent after rendering", () => {
        const update = createUpdateQuery<Schema>().table("users").set("name = 'a'");
        expect(update.toString()).toBe("update users set name = 'a'");
        const limited = update.where("id = :id").withParams({ id: 1 });
        expect(limited.toString()).toBe("update users set name = 'a' where id = $1");
        expect(limited.getParams()).toEqual([1]);
        expect(update.toString()).toBe("update users set name = 'a'");

        const del = createDeleteQuery<Schema>().from("users");
        expect(del.toString()).toBe("delete from users");
        const targeted = del.where("id = :id").withParams({ id: 2 });
        expect(targeted.toString()).toBe("delete from users where id = $1");
        expect(targeted.getParams()).toEqual([2]);
    });

    it("snapshots row structure and scalar cells when rows are supplied", () => {
        let reads = 0;
        const rows = [{ get id() { reads++; return 7; }, name: "original" }];
        const q = createInsertQuery<Schema>().into("users").rows(rows).withParams({});
        expect(reads).toBe(1);
        rows[0].name = "changed";
        rows.push({ id: 8, name: "later" });
        expect(q.toString()).toBe("insert into users (id, name) values ($1, $2)");
        expect(q.getParams()).toEqual([7, "original"]);
        expect(q.toString()).toBe("insert into users (id, name) values ($1, $2)");
        expect(reads).toBe(1);
    });
});
