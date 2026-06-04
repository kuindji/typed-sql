// src/builder/write-state.ts
import type { DriverParamValue } from "./scanner.js";

export interface InsertValueEntry { readonly col: string; readonly text: string; }
export interface RuntimeInsertState {
    readonly table: string;
    readonly values: ReadonlyArray<InsertValueEntry>;
    readonly conflict?: string;
    readonly returning?: string;
    readonly namedParams: Record<string, DriverParamValue>;
}
export interface RuntimeUpdateState {
    readonly table: string;
    // Optional table alias, e.g. `update orders o set ...`. Emitted after the
    // table name when present so aliased WHERE/SET references resolve.
    readonly alias?: string;
    // Optional CTEs prepended as a `with ... ` clause before `update`. The body
    // text may contain `:params`; because it precedes the UPDATE in the final
    // SQL, those params get the lowest positional numbers.
    readonly ctes?: ReadonlyArray<{ name: string; body: string; materialized: boolean }>;
    readonly sets: ReadonlyArray<string>;
    readonly froms: ReadonlyArray<string>;
    readonly wheres: ReadonlyArray<string>;
    readonly returning?: string;
    readonly namedParams: Record<string, DriverParamValue>;
}
export interface RuntimeDeleteState {
    readonly table: string;
    readonly usings: ReadonlyArray<string>;
    readonly wheres: ReadonlyArray<string>;
    readonly returning?: string;
    readonly namedParams: Record<string, DriverParamValue>;
}
export const EMPTY_INSERT_STATE: RuntimeInsertState = { table: "", values: [], namedParams: {} };
export const EMPTY_UPDATE_STATE: RuntimeUpdateState = { table: "", sets: [], froms: [], wheres: [], namedParams: {} };
export const EMPTY_DELETE_STATE: RuntimeDeleteState = { table: "", usings: [], wheres: [], namedParams: {} };
