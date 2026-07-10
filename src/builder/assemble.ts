// src/builder/assemble.ts
import { assertAllProvided, expandScanned } from "./scanner.js";
import { fragmentValues, type RuntimeSelectState } from "./state.js";

/**
 * Assemble a SQL string from runtime builder state.
 *
 * - Uses user-provided fragments as-is (no parsing/normalization).
 * - Inserts SQL keywords in uppercase.
 * - Skips empty clauses; defaults to SELECT * when no select fragments.
 * - Expands :name params to $n (first-appearance order; arrays expand).
 *
 * Ported from the predecessor package, with keyed fragment insertion order
 * preserved independently of the ids' spelling.
 */
export function assembleSelectSQLRaw(state: RuntimeSelectState): string {
    const parts: string[] = [];

    // `SELECT` / `SELECT DISTINCT` / `SELECT DISTINCT ON (...)` prefix, shared
    // by the projected and `*` paths.
    const distinctPrefix = state.distinctOn
        ? `SELECT DISTINCT ON (${state.distinctOn})`
        : state.distinct
        ? "SELECT DISTINCT"
        : "SELECT";

    const selects = fragmentValues(state.selects);
    if (selects.length === 0) {
        parts.push(`${distinctPrefix} *`);
    }
    else {
        const selectFragments: string[] = [];
        for (const cols of selects) {
            if (cols && cols.length > 0) {
                selectFragments.push(cols.join(", "));
            }
        }
        const selectSql = selectFragments.length > 0
            ? selectFragments.join(", ")
            : "*";
        parts.push(`${distinctPrefix} ${selectSql}`);
    }

    if (state.fromSql) {
        parts.push(`FROM ${state.fromSql}`);
    }

    for (const sql of fragmentValues(state.joins)) {
        if (sql) {
            parts.push(sql);
        }
    }

    const whereParts = fragmentValues(state.wheres).filter(Boolean);
    if (whereParts.length > 0) {
        parts.push(`WHERE ${whereParts.join(" AND ")}`);
    }

    const groupParts = fragmentValues(state.groupBys).filter(Boolean);
    if (groupParts.length > 0) {
        parts.push(`GROUP BY ${groupParts.join(", ")}`);
    }

    const havingParts = fragmentValues(state.havings).filter(Boolean);
    if (havingParts.length > 0) {
        parts.push(`HAVING ${havingParts.join(" AND ")}`);
    }

    const orderParts = fragmentValues(state.orderBys).filter(Boolean);
    if (orderParts.length > 0) {
        parts.push(`ORDER BY ${orderParts.join(", ")}`);
    }

    if (typeof state.limit === "number") {
        parts.push(`LIMIT ${state.limit}`);
    }
    if (typeof state.offset === "number") {
        parts.push(`OFFSET ${state.offset}`);
    }

    return parts.join(" ");
}

export function assembleSelectSQL(state: RuntimeSelectState): string {
    const sql = assembleSelectSQLRaw(state);
    const namedParams = state.namedParams;
    if (state.namedParamsBound || Object.keys(namedParams).length > 0) {
        assertAllProvided(sql, namedParams);
        // IN-list-gated expansion (spec §6.5), shared with the write builders:
        // an array value only fans out to multiple `$n` slots inside `IN (...)`;
        // anywhere else (e.g. `= ANY(:ids)`) it binds as a single array param.
        return expandScanned(sql, namedParams);
    }
    return sql;
}
