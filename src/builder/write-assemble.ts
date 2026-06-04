// src/builder/write-assemble.ts
import type { RuntimeInsertState, RuntimeUpdateState, RuntimeDeleteState } from "./write-state.js";

export function assembleInsertSQL(s: RuntimeInsertState): string {
    if (s.values.length === 0) {
        throw new Error("INSERT has no columns — all value fragments were conditional and excluded");
    }
    const cols = s.values.map(v => v.col).join(", ");
    const vals = s.values.map(v => v.text).join(", ");
    let sql = `insert into ${s.table} (${cols}) values (${vals})`;
    if (s.conflict) sql += ` on conflict ${s.conflict}`;
    if (s.returning) sql += ` returning ${s.returning}`;
    return sql;
}

export function assembleUpdateSQL(s: RuntimeUpdateState): string {
    if (s.sets.length === 0) {
        throw new Error("UPDATE has no assignments — all SET fragments were conditional and excluded");
    }
    // Prepend the alias to the table name when one was supplied.
    const head = s.alias ? `${s.table} ${s.alias}` : s.table;
    let sql = `update ${head} set ${s.sets.join(", ")}`;
    if (s.froms.length) sql += ` from ${s.froms.join(", ")}`;
    if (s.wheres.length) sql += ` where ${s.wheres.join(" and ")}`;
    if (s.returning) sql += ` returning ${s.returning}`;
    return sql;
}

export function assembleDeleteSQL(s: RuntimeDeleteState): string {
    let sql = `delete from ${s.table}`;
    if (s.usings.length) sql += ` using ${s.usings.join(", ")}`;
    if (s.wheres.length) sql += ` where ${s.wheres.join(" and ")}`;
    if (s.returning) sql += ` returning ${s.returning}`;
    return sql;
}
