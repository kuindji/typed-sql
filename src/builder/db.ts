// src/builder/db.ts
import type { DatabaseSchema } from "../schema.js";
import type { GetReturnType, ValidateSQL } from "../index.js";
import type {
    ValidateFromPart,
    ValidateJoinPart,
    ValidateSelectPart,
    ValidateWherePart,
    ValidateHavingPart,
    ValidateGroupByPart,
    ValidateOrderByPart,
} from "../index.js";
import type { SelectQueryBuilder } from "./select.js";
import type { BuilderReturnType, BuilderSQL } from "./return-type.js";
import type { Frag, SelFrag, SqlTag } from "./sql-tag.js";

type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** String-query validity (core). */
export type ValidQuery<Q extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Q, Schema> extends infer V
        ? V extends true ? Q : `[SQL Error] ${V & string}`
        : never;

// --- per-fragment validation over LITERAL fragments only ---
// A fragment whose text is non-literal `string` is skipped (→ never error).
// The partial validators return `true` (valid OR out-of-scope/skipped) or a
// boolean `false` (a reference resolvable WITHIN the fragment that does not
// exist). Treat any non-`true` verdict as an error: a `string` verdict is used
// as-is (future-proofing for descriptive messages), and a `false` verdict
// becomes a labeled "invalid <clause> fragment" error carrying the text.
type FragErr<Verdict, Label extends string, Text extends string> =
    Verdict extends true ? never
    : Verdict extends string ? Verdict
    : `invalid ${Label} fragment: ${Text}`;

type SelectErrors<List extends readonly SelFrag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateSelectPart<H["text"], S>, "SELECT", H["text"]>)
            | SelectErrors<R, S>
        : never;

type FromError<From extends string | null, S extends DatabaseSchema> =
    From extends null ? never
    : string extends (From & string) ? never
    : FragErr<ValidateFromPart<From & string, S>, "FROM", From & string>;

type JoinErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateJoinPart<H["text"], S>, "JOIN", H["text"]>)
            | JoinErrors<R, S>
        : never;

type WhereErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateWherePart<H["text"], S>, "WHERE", H["text"]>)
            | WhereErrors<R, S>
        : never;

type GroupErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateGroupByPart<H["text"], S>, "GROUP BY", H["text"]>)
            | GroupErrors<R, S>
        : never;

type HavingErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateHavingPart<H["text"], S>, "HAVING", H["text"]>)
            | HavingErrors<R, S>
        : never;

type OrderErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateOrderByPart<H["text"], S>, "ORDER BY", H["text"]>)
            | OrderErrors<R, S>
        : never;

/** Per-fragment errors over the literal fragments of B's Sql tag. */
export type FragmentErrors<B, Schema extends DatabaseSchema> =
    B extends SelectQueryBuilder<Schema, infer Sql extends SqlTag>
        ? (
            | SelectErrors<Sql["selects"], Schema>
            | FromError<Sql["from"], Schema>
            | JoinErrors<Sql["joins"], Schema>
            | WhereErrors<Sql["wheres"], Schema>
            | GroupErrors<Sql["groupBys"], Schema>
            | HavingErrors<Sql["havings"], Schema>
            | OrderErrors<Sql["orderBys"], Schema>
        ) extends infer E
            ? [E] extends [never] ? [] : (E & string)[]
            : []
        : [];

/**
 * Builder validity: per-fragment literal errors first; else whole-query check
 * with allow-unknown when the assembled SQL is non-literal `string`.
 */
export type ValidQueryBuilder<Schema extends DatabaseSchema, B extends SelectQueryBuilder<Schema, any>> =
    FragmentErrors<B, Schema> extends []
        ? BuilderSQL<B> extends infer SQL extends string
            ? string extends SQL
                ? B // some fragment text non-literal → allow, untyped
                : ValidateSQL<SQL, Schema> extends true
                    ? B
                    : `[SQL Error] ${Extract<ValidateSQL<SQL, Schema>, string>}`
            : B
        : `[SQL Error] ${FragmentErrors<B, Schema>[number]}`;

export type SelectResult<SQL extends string, Schema extends DatabaseSchema> =
    Prettify<GetReturnType<SQL, Schema>>;
export type SelectResultArray<SQL extends string, Schema extends DatabaseSchema> =
    Prettify<GetReturnType<SQL, Schema>>[];

type InvalidOverrideKeys<Result, Overrides> = Exclude<keyof Overrides, keyof Result>;

export type MergeOverrides<Result, Overrides> = keyof Overrides extends never
    ? Result
    : InvalidOverrideKeys<Result, Overrides> extends never
        ? Prettify<Omit<Result, keyof Overrides> & Overrides>
        : {
            __error: true;
            message: `Override contains keys not in result type: ${InvalidOverrideKeys<Result, Overrides> & string}`;
        };

export type SelectBuilderResult<B extends SelectQueryBuilder<any, any>> =
    Prettify<BuilderReturnType<B>>;
export type SelectBuilderResultArray<B extends SelectQueryBuilder<any, any>> =
    SelectBuilderResult<B>[];

export type QueryHandler = (query: string, params?: unknown[]) => unknown;

export type IsValidSelect<SQL extends string, Schema extends DatabaseSchema> =
    ValidateSQL<SQL, Schema> extends true ? true : false;

export function createSelectFn<
    Schema extends DatabaseSchema,
    Overrides extends Record<string, unknown> = {},
>(handler: QueryHandler) {
    // String query overload
    function select<Q extends string>(
        query: ValidQuery<Q, Schema>,
        params?: unknown[],
    ): Promise<MergeOverrides<SelectResultArray<Q, Schema>[number], Overrides>[]>;

    // Typed builder overload
    function select<B extends SelectQueryBuilder<Schema, any>>(
        query: ValidQueryBuilder<Schema, B>,
        params?: unknown[],
    ): Promise<MergeOverrides<SelectBuilderResult<B>, Overrides>[]>;

    function select(
        query: ValidQuery<string, Schema> | SelectQueryBuilder<Schema, any>,
        params?: unknown[],
    ) {
        if (typeof query === "string") {
            return handler(query, params) as Promise<any>;
        }
        const sql = query.toString();
        const finalParams = params ?? [...query.getParams()];
        return handler(sql, finalParams) as Promise<any>;
    }

    return select;
}
