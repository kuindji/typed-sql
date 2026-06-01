// src/builder/assemble.ts
import { expandNamedParams } from "./params.js";
import type { RuntimeSelectState } from "./state.js";

/**
 * Assemble a SQL string from runtime builder state.
 *
 * - Uses user-provided fragments as-is (no parsing/normalization).
 * - Inserts SQL keywords in uppercase.
 * - Skips empty clauses; defaults to SELECT * when no select fragments.
 * - Expands :name params to $n (first-appearance order; arrays expand).
 *
 * Ported from the predecessor package; byte-identical output.
 */
export function assembleSelectSQL(state: RuntimeSelectState): string {
    const parts: string[] = [];

    const cteIds = Object.keys(state.cteSql);
    if (cteIds.length > 0) {
        const withParts = cteIds.map(id => state.cteSql[id]).join(", ");
        parts.push(`WITH ${withParts}`);
    }

    const selectIds = Object.keys(state.selectSql);
    if (selectIds.length === 0) {
        parts.push("SELECT *");
    }
    else {
        const selectFragments: string[] = [];
        for (const id of selectIds) {
            const cols = state.selectSql[id];
            if (cols && cols.length > 0) {
                selectFragments.push(cols.join(", "));
            }
        }
        const selectSql = selectFragments.length > 0
            ? selectFragments.join(", ")
            : "*";
        parts.push(
            state.distinct ? `SELECT DISTINCT ${selectSql}` : `SELECT ${selectSql}`,
        );
    }

    if (state.fromSql) {
        parts.push(`FROM ${state.fromSql}`);
    }

    for (const join of state.joins) {
        const sql = state.joinSql[join.id];
        if (sql) {
            parts.push(sql);
        }
    }

    const whereParts = Object.keys(state.whereSql)
        .map(id => state.whereSql[id])
        .filter(Boolean);
    if (whereParts.length > 0) {
        parts.push(`WHERE ${whereParts.join(" AND ")}`);
    }

    const groupParts = Object.keys(state.groupBySql)
        .map(id => state.groupBySql[id])
        .filter(Boolean);
    if (groupParts.length > 0) {
        parts.push(`GROUP BY ${groupParts.join(", ")}`);
    }

    const havingParts = Object.keys(state.havingSql)
        .map(id => state.havingSql[id])
        .filter(Boolean);
    if (havingParts.length > 0) {
        parts.push(`HAVING ${havingParts.join(" AND ")}`);
    }

    const orderParts = Object.keys(state.orderBySql)
        .map(id => state.orderBySql[id])
        .filter(Boolean);
    if (orderParts.length > 0) {
        parts.push(`ORDER BY ${orderParts.join(", ")}`);
    }

    if (typeof state.limit === "number") {
        parts.push(`LIMIT ${state.limit}`);
    }
    if (typeof state.offset === "number") {
        parts.push(`OFFSET ${state.offset}`);
    }

    if (state.unionSql) {
        parts.push(state.unionSql);
    }

    const sql = parts.join(" ");
    const namedParams = state.namedParams;
    if (namedParams && Object.keys(namedParams).length > 0) {
        return expandNamedParams(sql, namedParams);
    }
    return sql;
}
