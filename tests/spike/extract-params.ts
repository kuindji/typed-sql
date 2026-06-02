// Feasibility spike — type-level ExtractParams<Query, Schema> + ExtractReturning.
// Maps each :name placeholder to the column it binds to, resolves that column to
// its (branded) schema type. Built on existing depth-tuned parsers.
// Throwaway — delete after the spike.

import type { DatabaseSchema } from "../../src/schema.js";
import type { ColumnTypeFromTableKey, RowTypeForTable } from "../../src/schema.js";
import type { NormalizeQuery } from "../../src/parsing.js";
import type {
    ExtractInsertColumns,
    ExtractReturningList,
    ExtractLastWhere,
    ExtractBefore,
    SplitCommaSimple,
    SplitTopLevel,
    Trim,
    CleanIdent,
} from "../../src/parsing.js";
import type {
    InsertTargetTable,
    UpdateTargetTable,
    DeleteTargetTable,
} from "../../src/tables.js";
import type { Simplify } from "../../src/utils.js";

// ===========================================================================
// :name detection
// ===========================================================================
export type ParamName<Token extends string> =
    Trim<Token> extends `:${infer Name}`
        ? CleanParamIdent<Name>
        : never;

type CleanParamIdent<S extends string> =
    S extends `${infer Head}::${string}` ? CleanParamIdent<Head>
    : S extends `${infer Head}${")" | "," | " "}${string}` ? Head
    : S;

// First whitespace-delimited token, alias prefix stripped (single-table scope).
type ColOf<S extends string> =
    FirstToken<Trim<S>> extends infer T extends string
        ? T extends `${infer _A}.${infer C}` ? C : T
        : never;
type FirstToken<S extends string> =
    S extends `${infer A} ${infer _}` ? A : S;

// ===========================================================================
// INSERT — positional column ↔ value pairing
// ===========================================================================
export type ExtractInsertValues<N extends string> =
    N extends `${string} values (${infer V})${string}`
        ? SplitCommaSimple<V>
        : N extends `${string} values(${infer V2})${string}`
            ? SplitCommaSimple<V2>
            : [];

type ZipInsert<
    Cols extends readonly string[],
    Vals extends readonly string[],
    Table extends string,
    S extends DatabaseSchema,
    Acc = {},
> =
    Cols extends readonly [infer C extends string, ...infer CR extends string[]]
        ? Vals extends readonly [infer V extends string, ...infer VR extends string[]]
            ? ParamName<V> extends infer P
                ? [P] extends [never]
                    ? ZipInsert<CR, VR, Table, S, Acc>
                    : P extends string
                        ? ZipInsert<CR, VR, Table, S,
                            Acc & { [K in P]: ColumnTypeFromTableKey<Table, CleanIdent<C>, S> }>
                        : ZipInsert<CR, VR, Table, S, Acc>
                : Acc
            : Acc
        : Acc;

// ON CONFLICT ... DO UPDATE SET <pairs> [WHERE ...] — params resolve against
// the (same) target table; `excluded.col` has no `:` so contributes nothing.
type ConflictSetBlock<N extends string> =
    N extends `${string} do update set ${infer Rest}`
        ? ExtractBefore<ExtractBefore<Rest, " where ">, " returning ">
        : "";

type InsertParams<N extends string, S extends DatabaseSchema> =
    InsertTargetTable<N, S> extends infer Table extends string
        ? ZipInsert<ExtractInsertColumns<N>, ExtractInsertValues<N>, Table, S>
            & SetParams<SplitTopLevel<ConflictSetBlock<N>>, Table, S>
            & WhereParamsFor<N, Table, S>
        : {};

// ===========================================================================
// UPDATE — `set col = :p` assignments
// ===========================================================================
type ExtractSetBlock<N extends string> =
    N extends `${string} set ${infer Rest}`
        ? ExtractBefore<ExtractBefore<Rest, " where ">, " returning ">
        : "";

type SetParams<
    Pairs extends readonly string[],
    Table extends string,
    S extends DatabaseSchema,
    Acc = {},
> =
    Pairs extends readonly [infer P extends string, ...infer R extends string[]]
        ? P extends `${infer Left}=${infer Right}`
            ? ParamName<Right> extends infer Name
                ? [Name] extends [never]
                    ? SetParams<R, Table, S, Acc>
                    : Name extends string
                        ? SetParams<R, Table, S,
                            Acc & { [K in Name]: ColumnTypeFromTableKey<Table, CleanIdent<Left>, S> }>
                        : SetParams<R, Table, S, Acc>
                : Acc
            : SetParams<R, Table, S, Acc>
        : Acc;

// ===========================================================================
// WHERE / USING — `col op :p`, `col in (:ps)`
// ===========================================================================
type WhereBlock<N extends string> =
    N extends `${string} where ${string}` ? ExtractLastWhere<N> : "";

// Split on " and " / " or " (two-level).
type SplitConds<S extends string> =
    SplitOn<S, " and "> extends infer A extends string[]
        ? FlatSplit<A, " or ">
        : [];
type SplitOn<S extends string, D extends string> =
    S extends `${infer H}${D}${infer T}` ? [H, ...SplitOn<T, D>] : [S];
type FlatSplit<Parts extends readonly string[], D extends string, Acc extends string[] = []> =
    Parts extends readonly [infer H extends string, ...infer R extends string[]]
        ? FlatSplit<R, D, [...Acc, ...SplitOn<H, D>]>
        : Acc;

type WhereParam<Cond extends string, Table extends string, S extends DatabaseSchema> =
    Trim<Cond> extends `${infer Lhs} in (${infer Inner})`
        ? ParamName<Inner> extends infer P
            ? [P] extends [never] ? {}
            : P extends string
                ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S>[] }
                : {}
            : {}
        : Trim<Cond> extends `${infer Lhs}:${infer Tail}`
            ? CleanParamIdent<Tail> extends infer P
                ? [P] extends [never] ? {}
                : P extends "" ? {}
                : P extends string
                    ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> }
                    : {}
                : {}
            : {};

type WhereParams<
    Conds extends readonly string[],
    Table extends string,
    S extends DatabaseSchema,
    Acc = {},
> =
    Conds extends readonly [infer C extends string, ...infer R extends string[]]
        ? WhereParams<R, Table, S, Acc & WhereParam<C, Table, S>>
        : Acc;

type WhereParamsFor<N extends string, Table extends string, S extends DatabaseSchema> =
    WhereParams<SplitConds<WhereBlock<N>>, Table, S>;

// ===========================================================================
// Dispatch by query kind
// ===========================================================================
type ParamsForKind<N extends string, S extends DatabaseSchema> =
    N extends `insert into ${string}`
        ? InsertParams<N, S>
    : N extends `update ${string}`
        ? UpdateTargetTable<N, S> extends infer T extends string
            ? SetParams<SplitTopLevel<ExtractSetBlock<N>>, T, S> & WhereParamsFor<N, T, S>
            : {}
    : N extends `delete from ${string}`
        ? DeleteTargetTable<N, S> extends infer T extends string
            ? WhereParamsFor<N, T, S>
            : {}
    : N extends `${"select" | "with"} ${string}`
        // SELECT: single-FROM-table scope for the spike (no join/alias maze).
        ? DeleteTargetTable<N, S> extends infer T extends string
            ? WhereParamsFor<N, T, S>
            : {}
    : {};

export type ExtractParams<Query extends string, S extends DatabaseSchema> =
    NormalizeQuery<Query> extends infer N extends string
        ? Simplify<ParamsForKind<N, S>>
        : {};

// ===========================================================================
// RETURNING — result-row typing (orthogonal to params)
// ===========================================================================
type TargetForReturning<N extends string, S extends DatabaseSchema> =
    N extends `insert into ${string}` ? InsertTargetTable<N, S>
    : N extends `update ${string}` ? UpdateTargetTable<N, S>
    : N extends `delete from ${string}` ? DeleteTargetTable<N, S>
    : never;

type ReturningRow<
    Cols extends readonly string[],
    Table extends string,
    S extends DatabaseSchema,
    Acc = {},
> =
    Cols extends readonly [infer C extends string, ...infer R extends string[]]
        ? CleanIdent<C> extends "*"
            ? RowTypeForTable<Table, S>
            : ReturningRow<R, Table, S,
                Acc & { [K in CleanIdent<C>]: ColumnTypeFromTableKey<Table, CleanIdent<C>, S> }>
        : Acc;

export type ExtractReturning<Query extends string, S extends DatabaseSchema> =
    NormalizeQuery<Query> extends infer N extends string
        ? ExtractReturningList<N> extends infer L extends string
            ? L extends "" ? {}
            : TargetForReturning<N, S> extends infer T extends string
                ? Simplify<ReturningRow<SplitTopLevel<L>, T, S>>
                : {}
            : {}
        : {};
