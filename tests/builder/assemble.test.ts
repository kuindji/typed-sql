// tests/builder/assemble.test.ts
import { describe, it, expect } from "bun:test";
import { assembleSelectSQL } from "../../src/builder/assemble.js";
import { EMPTY_RUNTIME_STATE } from "../../src/builder/state.js";

const base = EMPTY_RUNTIME_STATE;

describe("assembleSelectSQL", () => {
    it("defaults to SELECT * with no select fragments", () => {
        expect(assembleSelectSQL({ ...base, fromSql: "users" })).toBe(
            "SELECT * FROM users",
        );
    });

    it("emits clauses in canonical order", () => {
        const sql = assembleSelectSQL({
            ...base,
            selects: [{ id: "select_0", value: ["u.id", "u.name"] }],
            fromSql: "users u",
            joins: [{ id: "join_0", value: "JOIN orders o ON o.user_id = u.id" }],
            wheres: [
                { id: "where_0", value: "u.active = true" },
                { id: "where_1", value: "o.total > 0" },
            ],
            groupBys: [{ id: "group_0", value: "u.id" }],
            havings: [{ id: "having_0", value: "count(*) > 1" }],
            orderBys: [{ id: "order_0", value: "u.name" }],
            limit: 10,
            offset: 5,
        });
        expect(sql).toBe(
            "SELECT u.id, u.name FROM users u " +
            "JOIN orders o ON o.user_id = u.id " +
            "WHERE u.active = true AND o.total > 0 " +
            "GROUP BY u.id HAVING count(*) > 1 ORDER BY u.name LIMIT 10 OFFSET 5",
        );
    });

    it("emits SELECT DISTINCT when distinct is set", () => {
        expect(
            assembleSelectSQL({
                ...base,
                selects: [{ id: "select_0", value: ["id"] }],
                fromSql: "users",
                distinct: true,
            }),
        ).toBe("SELECT DISTINCT id FROM users");
    });

    it("emits SELECT DISTINCT ON (...) when distinctOn is set", () => {
        expect(
            assembleSelectSQL({
                ...base,
                selects: [{ id: "select_0", value: ["id", "name"] }],
                fromSql: "users",
                distinctOn: "tenant_id",
            }),
        ).toBe("SELECT DISTINCT ON (tenant_id) id, name FROM users");
    });

    it("substitutes named params to $n", () => {
        expect(
            assembleSelectSQL({
                ...base,
                fromSql: "users",
                wheres: [{ id: "where_0", value: "id = :id" }],
                namedParams: { id: 7 },
            }),
        ).toBe("SELECT * FROM users WHERE id = $1");
    });

    it("normalizes duplicate ids in caller-constructed state", () => {
        expect(assembleSelectSQL({
            ...base,
            selects: [
                { id: "slot", value: ["id"] },
                { id: "slot", value: ["name"] },
            ],
            wheres: [
                { id: "predicate", value: "id = 1" },
                { id: "predicate", value: "id = 2" },
            ],
        })).toBe("SELECT name WHERE id = 2");
    });
});
