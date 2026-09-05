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
type BlockCondition<Cond extends string, Data, Assigned extends boolean> =
    Assigned extends false ? EvalCondition<Cond, Data>
    : Cond extends `!${infer Key}`
        ? Key extends keyof Data ? Data[Key] extends true ? false : true : true
        : Cond extends keyof Data ? Data[Cond] : false;

type ProcessInnermost<
    Template extends string,
    Data extends Record<string, unknown>,
    Assigned extends boolean = false,
> = Template extends
    `${infer Before}/*if:${infer Cond}*/${infer Content}/*endif*/${infer After}`
    ? Contains<Content, "/*if:"> extends true
        ? `${Before}/*if:${Cond}*/${ProcessInnermost<
            `${Content}/*endif*/${After}`,
            Data,
            Assigned
        >}`
    : BlockCondition<Cond, Data, Assigned> extends true ? `${Before}${Content}${After}`
    : BlockCondition<Cond, Data, Assigned> extends false ? `${Before}${After}`
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

/** Force every condition data value true. Negated conditions still evaluate false. */
export type AllConditionsTrue<Data extends Record<string, unknown>> = {
    [K in keyof Data]: Data[K] extends Record<string, unknown>
        ? AllConditionsTrue<Data[K]>
        : true;
};

/** Force every condition data value false. Negated conditions still evaluate true. */
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

// Enumerate real assignments instead of concatenating mutually exclusive SQL
// blocks. Paths are flat keys here so `a` and `!a` always share one assignment,
// including dotted paths. Missing data paths remain false, as at runtime.
type DeclaresPath<Data, Path extends string> =
    Path extends `${infer Head}.${infer Rest}`
        ? Head extends keyof NonNullable<Data> ? DeclaresPath<NonNullable<Data>[Head], Rest> : false
        : Path extends keyof NonNullable<Data> ? true : false;

type ConditionPaths<
    Template extends string,
    Data,
    Paths extends string[] = [],
    Steps extends unknown[] = [],
> = Template extends `${string}/*if:${infer Cond}*/${infer Rest}`
    ? Steps["length"] extends 20 ? string[]
        : (Cond extends `!${infer Key}` ? Key : Cond) extends infer Path extends string
            ? DeclaresPath<Data, Path> extends true
                ? Path extends Paths[number] ? ConditionPaths<Rest, Data, Paths, [...Steps, 0]>
                : Paths["length"] extends 4 ? string[]
                : ConditionPaths<Rest, Data, [...Paths, Path], [...Steps, 0]>
            : ConditionPaths<Rest, Data, Paths, [...Steps, 0]>
        : string[]
    : Paths;

type RenderAssignment<
    Template extends string,
    Flags extends Record<string, boolean>,
    Depth extends unknown[] = [],
> = string extends Template ? string
    : Contains<Template, "/*if:"> extends true
        ? Depth["length"] extends 20 ? string
        : RenderAssignment<ProcessInnermost<Template, Flags, true>, Flags, [...Depth, 0]>
        : Template;

type AssignmentSQL<
    Template extends string,
    Paths extends string[],
    Data,
    Flags extends Record<string, boolean> = {},
> = Paths extends [infer Head extends string, ...infer Rest extends string[]]
    ? AssignmentSQL<Template, Rest, Data, Flags & { [K in Head]: true }>
        // A declared non-null object is truthy even when all of its child
        // flags are false. Do not invent an impossible absent-object branch.
        | ([GetPath<Data, Head>] extends [object] ? never
            : AssignmentSQL<Template, Rest, Data, Flags & { [K in Head]: false }>)
    : RenderAssignment<Template, Flags>;

// Four distinct paths permit at most 16 assignments. Larger templates degrade
// to unknown rows / permissive validation instead of risking TS2589 or judging
// a synthetic SQL string that no runtime branch can render.
type ConditionalRenderings<Template extends string, Data> =
    string extends Template ? string
    : ConditionPaths<Template, Data> extends infer Paths extends string[]
        ? number extends Paths["length"] ? string : AssignmentSQL<Template, Paths, Data>
        : string;

type RenderedRows<SQL extends string, Schema extends DatabaseSchema> =
    SQL extends unknown ? GetReturnType<SQL, Schema> : never;
type RowKeys<Rows> = Rows extends unknown ? keyof Rows : never;
type RowValue<Rows, Key extends PropertyKey> =
    Rows extends unknown ? Key extends keyof Rows ? Rows[Key] : undefined : never;
type MergeRenderedRows<Rows> = { [K in RowKeys<Rows>]: RowValue<Rows, K> };

/**
 * Merge rows from real renderings. Common columns retain the union of their
 * branch types; columns missing from any rendering also gain `| undefined`.
 */
export type ConditionalQueryResult<
    Template extends string,
    Conditions extends Record<string, unknown>,
    Schema extends DatabaseSchema,
> = ConditionalRenderings<Template, Conditions> extends infer SQL extends string
    ? string extends SQL ? Record<string, unknown>
        : MergeRenderedRows<RenderedRows<SQL, Schema>>
    : Record<string, unknown>;

export type MergeConditionalResults<Full, Base> = Flatten<MergeRenderedRows<Full | Base>>;

export type ProcessedSQL<
    Template extends string,
    Conditions extends Record<string, unknown>,
> = ProcessConditionalSQL<Template, Conditions>;

export type ValidateConditionalSQL<
    Template extends string,
    Conditions extends Record<string, unknown>,
    Schema extends DatabaseSchema,
> = ConditionalRenderings<Template, Conditions> extends infer SQL extends string
    ? string extends SQL ? true : [ValidateSQL<SQL, Schema>] extends [true] ? true : false
    : true;

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
