import { describe, expect, it } from "bun:test";
import { prepareScanned } from "../../src/builder/scanner.js";

const comments = ["/* filter */", "/* outer /* nested */ comment */", "-- filter\n", "-- filter\r\n", "/* first */ -- second\n"];

describe("comments around IN parentheses preserve binding semantics", () => {
    for (const comment of comments) {
        it(`expands a value list across ${JSON.stringify(comment)}`, () => {
            const sql = `select id from users where id not in ${comment} (:ids) and active = :active`;
            expect(prepareScanned(sql, { ids: [1, 2], active: true })).toEqual({
                sql: sql.replace(":ids", "$1, $2").replace(":active", "$3"),
                values: [1, 2, true],
            });
            expect(() => prepareScanned(sql, { ids: [], active: true })).toThrow("empty array");
        });

        it(`keeps subquery arrays scalar across ${JSON.stringify(comment)}`, () => {
            const sql = `select id from users where id in ${comment} (${comment} select user_id from orders where tags = :tags)`;
            for (const tags of [[1, 2], []]) {
                expect(prepareScanned(sql, { tags })).toEqual({ sql: sql.replace(":tags", "$1"), values: [tags] });
            }
        });
    }

    it("recognizes every supported subquery head after comments", () => {
        for (const head of ["select :tags", "with t as (select 1) select :tags", "values (:tags)", "table t where tags = :tags"]) {
            const sql = `select id from users where id in (/* query */ ${head})`;
            expect(prepareScanned(sql, { tags: [] })).toEqual({ sql: sql.replace(":tags", "$1"), values: [[]] });
        }
    });

    it("does not carry IN context past a different token or into nested expressions", () => {
        const sql = "select 'in', coalesce(/* in */ :a), (\"in\"), id in (coalesce(:b, null)) from users";
        expect(prepareScanned(sql, { a: [1], b: [2] })).toEqual({
            sql: sql.replace(":a", "$1").replace(":b", "$2"), values: [[1], [2]],
        });
    });
});
