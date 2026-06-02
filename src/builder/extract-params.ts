// src/builder/extract-params.ts
import type { DatabaseSchema } from "../schema.js";
import type { ColumnTypeFromTableKey, RowTypeForTable } from "../schema.js";
import type { NormalizeQuery } from "../parsing.js";
import type {
    ExtractInsertColumns, ExtractReturningList, ExtractLastWhere,
    ExtractBefore, SplitCommaSimple, SplitTopLevel, Trim, CleanIdent,
} from "../parsing.js";
import type {
    InsertTargetTable, UpdateTargetTable, DeleteTargetTable,
} from "../tables.js";
import type { Simplify } from "../utils.js";
import type { GetReturnType } from "../index.js";
import type { DriverParamValue } from "./scanner.js";

// ---- :name detection ----
export type ParamName<Token extends string> =
    Trim<Token> extends `:${infer Name}` ? CleanParamIdent<Name> : never;

type CleanParamIdent<S extends string> =
    S extends `${infer Head}::${string}` ? CleanParamIdent<Head>
    : S extends `${infer Head}${")" | "," | " "}${string}` ? Head
    : S;

type ColOf<S extends string> =
    FirstToken<Trim<S>> extends infer T extends string
        ? T extends `${infer _A}.${infer C}` ? C : T : never;
type FirstToken<S extends string> = S extends `${infer A} ${infer _}` ? A : S;

// ---- INSERT ----
export type ExtractInsertValues<N extends string> =
    N extends `${string} values (${infer V})${string}` ? SplitCommaSimple<V>
    : N extends `${string} values(${infer V2})${string}` ? SplitCommaSimple<V2>
    : [];

type ZipInsert<
    Cols extends readonly string[], Vals extends readonly string[],
    Table extends string, S extends DatabaseSchema, Acc = {},
> = Cols extends readonly [infer C extends string, ...infer CR extends string[]]
    ? Vals extends readonly [infer V extends string, ...infer VR extends string[]]
        ? ParamName<V> extends infer P
            ? [P] extends [never] ? ZipInsert<CR, VR, Table, S, Acc>
            : P extends string
                ? ZipInsert<CR, VR, Table, S, Acc & { [K in P]: ColumnTypeFromTableKey<Table, CleanIdent<C>, S> }>
                : ZipInsert<CR, VR, Table, S, Acc>
            : Acc
        : Acc
    : Acc;

type ConflictSetBlock<N extends string> =
    N extends `${string} do update set ${infer Rest}`
        ? ExtractBefore<ExtractBefore<Rest, " where ">, " returning "> : "";

type InsertParams<N extends string, S extends DatabaseSchema> =
    InsertTargetTable<N, S> extends infer Table extends string
        ? ZipInsert<ExtractInsertColumns<N>, ExtractInsertValues<N>, Table, S>
            & SetParams<SplitTopLevel<ConflictSetBlock<N>>, Table, S>
            & WhereParamsFor<N, Table, S>
        : {};

// ---- UPDATE SET ----
type ExtractSetBlock<N extends string> =
    N extends `${string} set ${infer Rest}`
        ? ExtractBefore<ExtractBefore<Rest, " where ">, " returning "> : "";

type SetParams<
    Pairs extends readonly string[], Table extends string,
    S extends DatabaseSchema, Acc = {},
> = Pairs extends readonly [infer P extends string, ...infer R extends string[]]
    ? P extends `${infer Left}=${infer Right}`
        ? ParamName<Right> extends infer Name
            ? [Name] extends [never] ? SetParams<R, Table, S, Acc>
            : Name extends string
                ? SetParams<R, Table, S, Acc & { [K in Name]: ColumnTypeFromTableKey<Table, CleanIdent<Left>, S> }>
                : SetParams<R, Table, S, Acc>
            : Acc
        : SetParams<R, Table, S, Acc>
    : Acc;

// ---- WHERE / USING ----
type WhereBlock<N extends string> =
    N extends `${string} where ${string}` ? ExtractLastWhere<N> : "";

type SplitConds<S extends string> =
    SplitOn<S, " and "> extends infer A extends string[] ? FlatSplit<A, " or "> : [];
type SplitOn<S extends string, D extends string> =
    S extends `${infer H}${D}${infer T}` ? [H, ...SplitOn<T, D>] : [S];
type FlatSplit<Parts extends readonly string[], D extends string, Acc extends string[] = []> =
    Parts extends readonly [infer H extends string, ...infer R extends string[]]
        ? FlatSplit<R, D, [...Acc, ...SplitOn<H, D>]> : Acc;

type WhereParam<Cond extends string, Table extends string, S extends DatabaseSchema> =
    Trim<Cond> extends `${infer Lhs} in (${infer Inner})`
        ? ParamName<Inner> extends infer P
            ? [P] extends [never] ? {}
            : P extends string ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S>[] } : {}
            : {}
        : Trim<Cond> extends `${infer Lhs}:${infer Tail}`
            ? CleanParamIdent<Tail> extends infer P
                ? [P] extends [never] ? {}
                : P extends "" ? {}
                : P extends string ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> } : {}
                : {}
            : {};

type WhereParams<
    Conds extends readonly string[], Table extends string,
    S extends DatabaseSchema, Acc = {},
> = Conds extends readonly [infer C extends string, ...infer R extends string[]]
    ? WhereParams<R, Table, S, Acc & WhereParam<C, Table, S>> : Acc;

type WhereParamsFor<N extends string, Table extends string, S extends DatabaseSchema> =
    WhereParams<SplitConds<WhereBlock<N>>, Table, S>;

// ---- dispatch ----
type ParamsForKind<N extends string, S extends DatabaseSchema> =
    N extends `insert into ${string}` ? InsertParams<N, S>
    : N extends `update ${string}`
        ? UpdateTargetTable<N, S> extends infer T extends string
            ? SetParams<SplitTopLevel<ExtractSetBlock<N>>, T, S> & WhereParamsFor<N, T, S> : {}
    : N extends `delete from ${string}`
        ? DeleteTargetTable<N, S> extends infer T extends string ? WhereParamsFor<N, T, S> : {}
    : N extends `${"select" | "with"} ${string}`
        ? DeleteTargetTable<N, S> extends infer T extends string ? WhereParamsFor<N, T, S> : {}
    : {};

export type ExtractParams<Query extends string, S extends DatabaseSchema> =
    NormalizeQuery<Query> extends infer N extends string ? Simplify<ParamsForKind<N, S>> : {};

// ---- RETURNING ----
type TargetForReturning<N extends string, S extends DatabaseSchema> =
    N extends `insert into ${string}` ? InsertTargetTable<N, S>
    : N extends `update ${string}` ? UpdateTargetTable<N, S>
    : N extends `delete from ${string}` ? DeleteTargetTable<N, S>
    : never;

// Reuse the existing GetReturnType inferrer (aliases, `as`, casts, functions,
// expressions, `*`) by synthesizing `select <returning-list> from <target>` and
// running the full machinery over it (spec §6/§7 — "reuse GetReturnType for
// aliases/expressions where applicable"). A bare `*` short-circuits to the full
// row. `T` is the normalized target key (e.g. "public.orders"), which the
// validator resolves as a schema-qualified FROM source.
export type ExtractReturning<Query extends string, S extends DatabaseSchema> =
    NormalizeQuery<Query> extends infer N extends string
        ? ExtractReturningList<N> extends infer L extends string
            ? L extends "" ? {}
            : TargetForReturning<N, S> extends infer T extends string
                ? Trim<L> extends "*"
                    ? RowTypeForTable<T, S>
                    : Simplify<GetReturnType<`select ${L} from ${T}`, S>>
                : {}
            : {}
        : {};

// Referenced here so the import is retained until Task 4 wires the loose
// fallback; removing it before then is fine if unused.
export type __DriverParamValue = DriverParamValue;
