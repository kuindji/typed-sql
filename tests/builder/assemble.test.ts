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
            selectSql: { select_0: ["u.id", "u.name"] },
            fromSql: "users u",
            joinSql: { join_0: "JOIN orders o ON o.user_id = u.id" },
            joins: [{ id: "join_0" }],
            whereSql: { where_0: "u.active = true", where_1: "o.total > 0" },
            groupBySql: { group_0: "u.id" },
            havingSql: { having_0: "count(*) > 1" },
            orderBySql: { order_0: "u.name" },
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
                selectSql: { select_0: ["id"] },
                fromSql: "users",
                distinct: true,
            }),
        ).toBe("SELECT DISTINCT id FROM users");
    });

    it("emits SELECT DISTINCT ON (...) when distinctOn is set", () => {
        expect(
            assembleSelectSQL({
                ...base,
                selectSql: { select_0: ["id", "name"] },
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
                whereSql: { where_0: "id = :id" },
                namedParams: { id: 7 },
            }),
        ).toBe("SELECT * FROM users WHERE id = $1");
    });

});
