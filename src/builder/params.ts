// src/builder/params.ts

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

// Ported verbatim from OLD: trailing negative lookahead stops a short param
// (:te) from clobbering a longer one (:text). Matching the second colon of a
// ::cast is intentional parity (pinned by params.test.ts).
const PARAM_REGEX = /:([a-zA-Z_][a-zA-Z0-9_]*)(?![a-zA-Z0-9_])/g;

/** Param names in order of first appearance that are present in `params`. */
function usedParamNames(
    sql: string,
    params: Record<string, QueryParamInput>,
): string[] {
    const used: string[] = [];
    let match: RegExpExecArray | null;
    PARAM_REGEX.lastIndex = 0;
    while ((match = PARAM_REGEX.exec(sql)) !== null) {
        const name = match[1];
        if (name in params && !used.includes(name)) {
            used.push(name);
        }
    }
    return used;
}

/**
 * Replace :name placeholders with $n positional placeholders, ordered by
 * first appearance. Array values expand to consecutive placeholders.
 */
export function expandNamedParams(
    sql: string,
    params: Record<string, QueryParamInput>,
): string {
    const used = usedParamNames(sql, params);
    let out = sql;
    let position = 1;
    for (const name of used) {
        const value = params[name];
        const regex = new RegExp(`:${name}(?![a-zA-Z0-9_])`, "g");
        if (Array.isArray(value)) {
            const placeholders = value
                .map((_, i) => `$${position + i}`)
                .join(", ");
            out = out.replace(regex, placeholders);
            position += value.length;
        }
        else {
            out = out.replace(regex, `$${position}`);
            position++;
        }
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
    const used = usedParamNames(sql, params);
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
