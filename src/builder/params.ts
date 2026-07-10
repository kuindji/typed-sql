// src/builder/params.ts
import {
    assertAllProvided,
    scanPlaceholders,
    type PlaceholderOccurrence,
} from "./scanner.js";

/** Runtime parameter value type supported by query builders. */
export type QueryParamValue = string | number | boolean | null;

/**
 * Input parameter value type — allows arrays (expanded to multiple
 * placeholders, e.g. :ids with [1,2,3] → "$1, $2, $3") and undefined
 * (throws at runtime only if the param is actually used).
 *
 * Array expansion is BUILDER-ONLY. Conditional SQL keeps a scalar-only
 * signature (see conditional-sql.ts) for parity with the old package.
 */
export type QueryParamInput =
    | QueryParamValue
    | readonly QueryParamValue[]
    | undefined;

// Placeholder detection is delegated to the shared scanner (scanner.ts), so the
// SELECT / conditional-SQL path skips string literals, comments, dollar-quotes,
// and `::cast` types exactly like the write builders — a single source of truth
// for what counts as a real `:name`. Array values still expand UNCONDITIONALLY
// here (any position), which is the builder's long-standing semantics and
// differs from the scanner's IN-list-gated expansion used by createSql/mutate.

/** Param names in order of first appearance that are own keys of `params`. */
function usedParamNames(
    occ: readonly PlaceholderOccurrence[],
    params: Record<string, QueryParamInput>,
): string[] {
    const used: string[] = [];
    for (const o of occ) {
        if (Object.hasOwn(params, o.name) && !used.includes(o.name)) {
            used.push(o.name);
        }
    }
    return used;
}

export function assertAllNamedParamsProvided(
    sql: string,
    params: Record<string, QueryParamInput>,
): void {
    assertAllProvided(sql, params);
}

/**
 * Replace :name placeholders with $n positional placeholders, ordered by
 * first appearance. Array values expand to consecutive placeholders. A `:name`
 * inside a string literal / comment / `::cast` is not a placeholder.
 */
export function expandNamedParams(
    sql: string,
    params: Record<string, QueryParamInput>,
): string {
    const occ = scanPlaceholders(sql);
    const used = usedParamNames(occ, params);
    // First-appearance starting position for each used name; arrays reserve a
    // contiguous block, repeats reuse the same block.
    const startPos = new Map<string, number>();
    let position = 1;
    for (const name of used) {
        startPos.set(name, position);
        const value = params[name];
        position += Array.isArray(value) ? value.length : 1;
    }
    // Rewrite right-to-left so earlier indices stay valid as we splice.
    let out = sql;
    for (let k = occ.length - 1; k >= 0; k--) {
        const o = occ[k];
        const p = startPos.get(o.name);
        if (p === undefined) continue; // not provided → left as literal :name
        const value = params[o.name];
        const replacement = Array.isArray(value)
            ? value.map((_, i) => `$${p + i}`).join(", ")
            : `$${p}`;
        out = out.slice(0, o.start) + replacement + out.slice(o.end);
    }
    return out;
}

/**
 * Flattened param values in placeholder order. Throws if a used param's
 * value is undefined.
 */
export function collectParamValues(
    sql: string,
    params: Record<string, QueryParamInput>,
): QueryParamValue[] {
    const used = usedParamNames(scanPlaceholders(sql), params);
    const result: QueryParamValue[] = [];
    for (const name of used) {
        const value = params[name];
        if (value === undefined) {
            throw new Error(
                `Query parameter ":${name}" is used but its value is undefined`,
            );
        }
        if (Array.isArray(value)) {
            result.push(...value);
        }
        else {
            result.push(value as QueryParamValue);
        }
    }
    return result;
}
