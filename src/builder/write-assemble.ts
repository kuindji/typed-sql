// src/builder/write-assemble.ts
import type { RuntimeInsertState, RuntimeUpdateState, RuntimeDeleteState } from "./write-state.js";
import type { DriverParamValue } from "./scanner.js";
import { joinConditions } from "./assemble.js";

// Generate SQL and synthetic params together at .rows() time. Later assembly
// reuses the text instead of traversing the input rows and allocating params again.
export function buildRowsClause(
    rows: ReadonlyArray<Record<string, DriverParamValue>>,
): { colsText: string; valuesText: string; params: Record<string, DriverParamValue> } {
    if (rows.length === 0) {
        throw new Error("INSERT .rows() requires at least one row");
    }
    const cols = Object.keys(rows[0]);
    if (cols.length === 0) {
        throw new Error("INSERT .rows() rows must have at least one column");
    }
    const params: Record<string, DriverParamValue> = {};
    const allowedCols = new Set(cols);
    const tuples = rows.map((row, r) => {
        for (const k of Object.keys(row)) {
            if (!allowedCols.has(k)) {
                throw new Error(
                    `INSERT .rows() row ${r} has column "${k}" not present in the first row`);
            }
        }
        const cells = cols.map((col, c) => {
            if (!Object.hasOwn(row, col)) {
                throw new Error(`INSERT .rows() row ${r} is missing column "${col}"`);
            }
            const name = `__tsqlrow_${r}_${c}`;
            params[name] = row[col];
            return `:${name}`;
        });
        return `(${cells.join(", ")})`;
    });
    return { colsText: cols.join(", "), valuesText: tuples.join(", "), params };
}

export function assembleInsertSQL(s: RuntimeInsertState): string {
    // Multi-row VALUES form: column list and tuple list derived from row objects.
    // Must not be combined with .value()/.valueIf() or .fromSelect().
    if (s.rows) {
        if (s.values.length > 0 || s.fromSelect) {
            throw new Error(
                "INSERT .rows() cannot be combined with .value()/.valueIf() or .fromSelect()");
        }
        const { colsText, valuesText } = s.rows;
        let sql = `insert into ${s.table} (${colsText}) values ${valuesText}`;
        if (s.conflict) sql += ` on conflict ${s.conflict}`;
        if (s.returning) sql += ` returning ${s.returning}`;
        return sql;
    }
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
    // Several WHERE fragments: an OR-bearing one is parenthesized (see assemble.ts joinConditions).
    if (s.wheres.length) sql += ` where ${joinConditions(s.wheres, " and ")}`;
    if (s.returning) sql += ` returning ${s.returning}`;
    return sql;
}

export function assembleDeleteSQL(s: RuntimeDeleteState): string {
    let sql = `delete from ${s.table}`;
    if (s.usings.length) sql += ` using ${s.usings.join(", ")}`;
    if (s.wheres.length) sql += ` where ${joinConditions(s.wheres, " and ")}`;
    if (s.returning) sql += ` returning ${s.returning}`;
    return sql;
}
