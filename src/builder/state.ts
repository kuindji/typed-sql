// src/builder/state.ts
import type { QueryParamInput, QueryParamValue } from "./params.js";

/** One keyed runtime fragment. Arrays of these preserve insertion order. */
export interface RuntimeFragment<T> {
    readonly id: string;
    readonly value: T;
}

/**
 * Immutable runtime state for the SELECT builder. Keyed clauses are stored as
 * ordered fragment arrays, so replacement-by-id and insertion order are one
 * piece of state rather than parallel maps/order metadata.
 */
export interface RuntimeSelectState {
    readonly selects: ReadonlyArray<RuntimeFragment<string[]>>;
    readonly fromSql?: string;
    readonly joins: ReadonlyArray<RuntimeFragment<string>>;
    readonly wheres: ReadonlyArray<RuntimeFragment<string>>;
    readonly groupBys: ReadonlyArray<RuntimeFragment<string>>;
    readonly havings: ReadonlyArray<RuntimeFragment<string>>;
    readonly orderBys: ReadonlyArray<RuntimeFragment<string>>;
    /** SELECT DISTINCT when true (ignored if `distinctOn` is set). */
    readonly distinct: boolean;
    /** SELECT DISTINCT ON (...) expression list, if set (already joined). */
    readonly distinctOn?: string;
    readonly limit?: number;
    readonly offset?: number;
    /** Legacy positional params (kept for getParams() fallback). */
    readonly params: ReadonlyArray<QueryParamValue>;
    /** Named params; :name placeholders resolve from here. */
    readonly namedParams: Record<string, QueryParamInput>;
    /** True after `.withParams(...)`, even when the object is empty. */
    readonly namedParamsBound: boolean;
}

export const EMPTY_RUNTIME_STATE: RuntimeSelectState = {
    selects: [],
    fromSql: undefined,
    joins: [],
    wheres: [],
    groupBys: [],
    havings: [],
    orderBys: [],
    distinct: false,
    distinctOn: undefined,
    limit: undefined,
    offset: undefined,
    params: [],
    namedParams: {},
    namedParamsBound: false,
};

/** Append a new id or replace its value without moving its position. */
export function upsertFragment<T>(
    fragments: ReadonlyArray<RuntimeFragment<T>>,
    id: string,
    value: T,
): RuntimeFragment<T>[] {
    const index = fragments.findIndex(fragment => fragment.id === id);
    if (index === -1) return [ ...fragments, { id, value } ];
    return fragments.map((fragment, i) =>
        i === index ? { id, value } : fragment);
}

/** Remove every occurrence of an id (defensive for caller-constructed state). */
export function removeFragment<T>(
    fragments: ReadonlyArray<RuntimeFragment<T>>,
    id: string,
): RuntimeFragment<T>[] {
    return fragments.filter(fragment => fragment.id !== id);
}

export function hasFragment<T>(
    fragments: ReadonlyArray<RuntimeFragment<T>>,
    id: string,
): boolean {
    return fragments.some(fragment => fragment.id === id);
}

/**
 * Values in first-id insertion order, with a duplicate id's last value winning.
 * Builders keep ids unique; normalization makes the public assembler deterministic
 * for arbitrary caller-constructed RuntimeSelectState values too.
 */
export function fragmentValues<T>(
    fragments: ReadonlyArray<RuntimeFragment<T>>,
): T[] {
    const values: T[] = [];
    const positions = new Map<string, number>();
    for (const fragment of fragments) {
        const position = positions.get(fragment.id);
        if (position === undefined) {
            positions.set(fragment.id, values.length);
            values.push(fragment.value);
        }
        else {
            values[position] = fragment.value;
        }
    }
    return values;
}
