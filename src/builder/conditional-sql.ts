// src/builder/conditional-sql.ts
//
// Conditional SQL templates with `if:condition` / `endif` comment blocks and
// `:name` parameters. Runtime + type-level processing ported verbatim from the
// predecessor package; the result/validity matcher is rewired onto the new core
// (GetReturnType / ValidateSQL).
import type { DatabaseSchema } from "../schema.js";
import type { GetReturnType, ValidateSQL } from "../index.js";
import { assertAllNamedParamsProvided, collectParamValues, expandNamedParams, type QueryParamValue } from "./params.js";

// ============================================================================
// Runtime (ported from OLD conditional/runtime.ts)
// ============================================================================

export interface ConditionalSQLOptions {
    /** If true, preserves conditional comment markers in output (debugging). */
    preserveMarkers?: boolean;
}

export interface ConditionalSQLOutput {
    /** The processed SQL string with conditions applied. */
    sql: string;
    /** The parameter values in order of appearance. */
    params: QueryParamValue[];
}

/** Get a nested own-property value from an object using dot notation. */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split(".");
    let current: unknown = obj;

    for (const key of keys) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== "object") {
            return undefined;
        }
        if (!Object.hasOwn(current, key)) {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }

    return current;
}

/** Process conditional blocks in a SQL template (innermost-first, iterative). */
export function processConditionalSQL(
    template: string,
    conditions: Record<string, unknown>,
): string {
    // Matches an if-block with no nested if inside its content (innermost first).
    const pattern =
        /\/\*if:(!?[\w.]+)\*\/((?:(?!\/\*if:)[\s\S])*?)\/\*endif\*\//g;

    let result = template;
    let hasMatches = true;

    // Process iteratively to handle nested conditions.
    while (hasMatches) {
        hasMatches = false;

        result = result.replace(
            pattern,
            (_, condition: string, content: string) => {
                hasMatches = true;

                const isNegated = condition.startsWith("!");
                const key = isNegated ? condition.slice(1) : condition;
                const value = getNestedValue(conditions, key);
                const isTruthy = Boolean(value);

                return (isNegated ? !isTruthy : isTruthy) ? content : "";
            },
        );
    }

    return result;
}

/**
 * Convert :name placeholders to positional $n; return processed SQL + values.
 * Delegates to the shared scanner-backed expander (params.ts) so a `:name`
 * inside a string literal, comment, or `::cast` is left alone, and a used param
 * whose value is `undefined` throws instead of silently passing through.
 */
export function processParams(
    sql: string,
    params: Record<string, QueryParamValue>,
): ConditionalSQLOutput {
    assertAllNamedParamsProvided(sql, params);
    return {
        sql: expandNamedParams(sql, params),
        params: collectParamValues(sql, params),
    };
}

/** Process a template with both conditions and parameters. */
export function conditionalSQL(
    template: string,
    conditions: Record<string, unknown>,
    params: Record<string, QueryParamValue> = {},
): ConditionalSQLOutput {
    // Step 1: Process conditional blocks.
    const conditionalProcessed = processConditionalSQL(template, conditions);

    // Step 2: Process parameters.
    return processParams(conditionalProcessed, params);
}

// ============================================================================
// Type-level condition evaluation (ported from OLD conditional/types.ts)
// ============================================================================

/** Get a nested value type using a dot-notation path. */
export type GetPath<T, Path extends string> = Path extends
    `${infer Key}.${infer Rest}`
    ? Key extends keyof T ? GetPath<T[Key], Rest>
    : undefined
    : Path extends keyof T ? T[Path]
    : undefined;

/** Type-level truthiness; resolves to `boolean` for non-literal wide types. */
export type IsTruthy<T> =
    [T] extends [false | 0 | "" | null | undefined] ? false
        : [T] extends [never] ? false
        : [T] extends [boolean]
            ? ([boolean] extends [T] ? boolean : true)
        : [T] extends [string] ? ([string] extends [T] ? boolean : true)
        : [T] extends [number] ? ([number] extends [T] ? boolean : true)
        : true;

/** Evaluate a condition string against a data type (supports `!` negation). */
export type EvalCondition<Cond extends string, Data> = Cond extends
    `!${infer Key}`
    ? IsTruthy<GetPath<Data, Key>> extends true ? false
    : IsTruthy<GetPath<Data, Key>> extends false ? true
    : boolean
    : IsTruthy<GetPath<Data, Cond>>;

/** Check if a string contains a specific pattern. */
type Contains<S extends string, Pattern extends string> = S extends
    `${string}${Pattern}${string}` ? true : false;

/** Check if any condition in the template has an indeterminate (wide) type. */
type HasIndeterminateCondition<
    Template extends string,
    Data extends Record<string, unknown>,
> = Template extends `${string}/*if:${infer Cond}*/${infer Rest}`
    ? EvalCondition<Cond, Data> extends boolean
        ? boolean extends EvalCondition<Cond, Data> ? true
        : HasIndeterminateCondition<Rest, Data>
    : HasIndeterminateCondition<Rest, Data>
    : false;

/** Process the innermost conditional block (inside-out). */
type ProcessInnermost<
    Template extends string,
    Data extends Record<string, unknown>,
> = Template extends
    `${infer Before}/*if:${infer Cond}*/${infer Content}/*endif*/${infer After}`
    ? Contains<Content, "/*if:"> extends true
        ? `${Before}/*if:${Cond}*/${ProcessInnermost<
            `${Content}/*endif*/${After}`,
            Data
        >}`
    : EvalCondition<Cond, Data> extends true ? `${Before}${Content}${After}`
    : EvalCondition<Cond, Data> extends false ? `${Before}${After}`
    : string
    : Template;

/** Recursively process all conditional blocks until none remain. */
export type ProcessConditionalSQL<
    Template extends string,
    Data extends Record<string, unknown>,
    Depth extends number[] = [],
> =
    HasIndeterminateCondition<Template, Data> extends true ? string
        : Depth["length"] extends 20 ? Template
        : Contains<Template, "/*if:"> extends true ? ProcessConditionalSQL<
                ProcessInnermost<Template, Data>,
                Data,
                [...Depth, 0]
            >
        : Template;

/** Force every condition value true (maximal column set). */
export type AllConditionsTrue<Data extends Record<string, unknown>> = {
    [K in keyof Data]: Data[K] extends Record<string, unknown>
        ? AllConditionsTrue<Data[K]>
        : true;
};

/** Force every condition value false (minimal column set). */
export type AllConditionsFalse<Data extends Record<string, unknown>> = {
    [K in keyof Data]: Data[K] extends Record<string, unknown>
        ? AllConditionsFalse<Data[K]>
        : false;
};

/** Marker: columns from conditional SELECT clauses are `T | undefined`. */
export type ConditionalColumn<T> = T | undefined;

/** Marker: columns from conditional LEFT JOINs are `T | null | undefined`. */
export type ConditionalLeftJoinColumn<T> = T | null | undefined;

// ============================================================================
// Rewired matcher + factory (onto the new core)
// ============================================================================

type Flatten<T> = { [K in keyof T]: T[K] } & {};

/**
 * Result type for a conditional SQL query, rewired onto the new core.
 *  1. all conditions TRUE  -> full column set (GetReturnType<FullSQL>)
 *  2. all conditions FALSE -> base column set (GetReturnType<BaseSQL>)
 *  3. columns in full but not base -> `| undefined`
 */
export type ConditionalQueryResult<
    Template extends string,
    Conditions extends Record<string, unknown>,
    Schema extends DatabaseSchema,
> = ProcessConditionalSQL<Template, AllConditionsTrue<Conditions>> extends infer FullSQL extends string
    ? ProcessConditionalSQL<Template, AllConditionsFalse<Conditions>> extends infer BaseSQL extends string
        ? GetReturnType<FullSQL, Schema> extends infer Full
            ? GetReturnType<BaseSQL, Schema> extends infer Base
                ? MergeConditionalResults<Full, Base>
                : Full
            : {}
        : {}
    : {};

export type MergeConditionalResults<Full, Base> = Flatten<
    & { [K in keyof Full as K extends keyof Base ? K : never]: Full[K] }
    & { [K in keyof Full as K extends keyof Base ? never : K]: Full[K] | undefined }
>;

export type ProcessedSQL<
    Template extends string,
    Conditions extends Record<string, unknown>,
> = ProcessConditionalSQL<Template, Conditions>;

export type ValidateConditionalSQL<
    Template extends string,
    Conditions extends Record<string, unknown>,
    Schema extends DatabaseSchema,
> = ProcessConditionalSQL<Template, AllConditionsTrue<Conditions>> extends infer FullSQL extends string
    ? ValidateSQL<FullSQL, Schema>
    : false;

export interface TypedConditionalSQLOutput<Result> extends ConditionalSQLOutput {
    readonly __resultType?: Result;
}

export function createConditionalQuery<Schema extends DatabaseSchema>() {
    function query<
        Template extends string,
        Conditions extends Record<string, unknown>,
        Params extends Record<string, QueryParamValue> = {},
    >(
        template: Template,
        conditions: Conditions,
        params?: Params,
    ): TypedConditionalSQLOutput<ConditionalQueryResult<Template, Conditions, Schema>> {
        const result = conditionalSQL(template, conditions, params ?? {});
        return result as TypedConditionalSQLOutput<
            ConditionalQueryResult<Template, Conditions, Schema>
        >;
    }
    return query;
}

export function withConditions<StaticConditions extends Record<string, unknown>>(
    queryFn: ReturnType<typeof createConditionalQuery>,
) {
    return <Template extends string, Params extends Record<string, QueryParamValue> = {}>(
        template: Template,
        conditions: StaticConditions,
        params?: Params,
    ) => queryFn(template, conditions, params);
}
