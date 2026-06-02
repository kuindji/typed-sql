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
