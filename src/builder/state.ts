// src/builder/state.ts
import type { QueryParamInput, QueryParamValue } from "./params.js";

/**
 * Immutable runtime state for the SELECT builder. Standalone — carries only
 * the fields consumed by assembleSelectSQL / getParams. Fragments are keyed
 * by id; join ORDER is preserved by the `joins` array.
 */
export interface RuntimeSelectState {
    /** Raw SELECT fragments by id; each is the array of column strings. */
    readonly selectSql: { readonly [id: string]: string[] };
    /** Raw FROM fragment (if present). */
    readonly fromSql?: string;
    /** Raw JOIN fragments by id. */
    readonly joinSql: { readonly [id: string]: string };
    /** Join ordering — only the id is needed for assembly. */
    readonly joins: ReadonlyArray<{ readonly id: string }>;
    /** Raw WHERE fragments by id (joined with AND). */
    readonly whereSql: { readonly [id: string]: string };
    /** Raw GROUP BY fragments by id (joined with ", "). */
    readonly groupBySql: { readonly [id: string]: string };
    /** Raw HAVING fragments by id (joined with AND). */
    readonly havingSql: { readonly [id: string]: string };
    /** Raw ORDER BY fragments by id (joined with ", "). */
    readonly orderBySql: { readonly [id: string]: string };
    /** Raw CTE fragments by id. */
    readonly cteSql: { readonly [id: string]: string };
    /** Raw UNION fragment (if any). */
    readonly unionSql?: string;
    readonly distinct: boolean;
    readonly limit?: number;
    readonly offset?: number;
    /** Legacy positional params (kept for getParams() fallback). */
    readonly params: ReadonlyArray<QueryParamValue>;
    /** Named params; :name placeholders resolve from here. */
    readonly namedParams: Record<string, QueryParamInput>;
}

export const EMPTY_RUNTIME_STATE: RuntimeSelectState = {
    selectSql: {},
    fromSql: undefined,
    joinSql: {},
    joins: [],
    whereSql: {},
    groupBySql: {},
    havingSql: {},
    orderBySql: {},
    cteSql: {},
    unionSql: undefined,
    distinct: false,
    limit: undefined,
    offset: undefined,
    params: [],
    namedParams: {},
};
