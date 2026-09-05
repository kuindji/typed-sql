// src/builder/assemble.ts
import { createScannedQuery } from "./scanner.js";
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

    // Fragments are AND-ed. A fragment that carries an OR (`a = 1 or a = 2`) is
    // parenthesized when it is combined with others, so it keeps its own
    // precedence: `WHERE (a = 1 or a = 2) AND deleted = false` — otherwise
    // Postgres reads `a = 1 OR (a = 2 AND deleted = false)`. Everything else is
    // emitted verbatim. Mirrored by `CondClause` in sql-tag.ts.
    const whereParts = fragmentValues(state.wheres).filter(Boolean);
    if (whereParts.length > 0) {
        parts.push(`WHERE ${joinConditions(whereParts)}`);
    }

    const groupParts = fragmentValues(state.groupBys).filter(Boolean);
    if (groupParts.length > 0) {
        parts.push(`GROUP BY ${groupParts.join(", ")}`);
    }

    const havingParts = fragmentValues(state.havings).filter(Boolean);
    if (havingParts.length > 0) {
        parts.push(`HAVING ${joinConditions(havingParts)}`);
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

/**
 * AND-join condition fragments. When there are several, a fragment containing
 * ` or ` (any case) is wrapped in parens unless it already is one parenthesized
 * group — a deliberately shallow, string-level test so the type-level mirror
 * (`CondClause` in sql-tag.ts / `WhereClause` in write-tag.ts) produces the
 * identical text. A single fragment is never touched.
 */
export function joinConditions(conds: readonly string[], and = " AND "): string {
    if (conds.length <= 1) return conds[0] ?? "";
    return conds.map(c => needsParens(c) ? `(${c})` : c).join(and);
}

function needsParens(frag: string): boolean {
    const lower = frag.toLowerCase();
    if (!/\sor\s/.test(lower)) return false;
    // Already a single `( ... )` group: `(a or b)`, `(a or (b and c))`. A `)`
    // followed later by `(` inside the outer parens means two groups: `(a) or (b)`.
    if (frag.startsWith("(") && frag.endsWith(")")) {
        const inner = frag.slice(1, -1);
        if (!/\)[\s\S]*\(/.test(inner)) return false;
    }
    return true;
}

export function assembleSelectSQL(state: RuntimeSelectState): string {
    const sql = assembleSelectSQLRaw(state);
    const namedParams = state.namedParams;
    if (state.namedParamsBound || Object.keys(namedParams).length > 0) {
        // IN-list-gated expansion (spec §6.5), shared with the write builders:
        // an array value only fans out to multiple `$n` slots inside `IN (...)`;
        // anywhere else (e.g. `= ANY(:ids)`) it binds as a single array param.
        return createScannedQuery(sql).expand(namedParams);
    }
    return sql;
}
