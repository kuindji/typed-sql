// src/builder/write-assemble.ts
import type { RuntimeInsertState, RuntimeUpdateState, RuntimeDeleteState } from "./write-state.js";

export function assembleInsertSQL(s: RuntimeInsertState): string {
    // INSERT...SELECT form: emit `insert into T (cols) <select body>` instead of a
    // VALUES list. Any `:params` in the SELECT body are scanned positionally by the
    // shared scanner just like the rest of the statement.
    if (s.fromSelect) {
        let sql = `insert into ${s.table} (${s.columns}) ${s.fromSelect}`;
        if (s.conflict) sql += ` on conflict ${s.conflict}`;
        if (s.returning) sql += ` returning ${s.returning}`;
        return sql;
    }
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
    // Build a leading `with ...` clause when CTEs were supplied. It precedes the
    // UPDATE so any `:params` in the CTE bodies are scanned first and get the
    // lowest `$n` positions.
    let prefix = "";
    if (s.ctes?.length) {
        prefix = "with " + s.ctes.map(c =>
            `${c.name} as ${c.materialized ? "materialized " : ""}(${c.body})`).join(", ") + " ";
    }
    // Prepend the alias to the table name when one was supplied.
    const head = s.alias ? `${s.table} ${s.alias}` : s.table;
    let sql = `${prefix}update ${head} set ${s.sets.join(", ")}`;
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
