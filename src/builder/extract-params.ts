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

// Split on top-level " and "/" or ", but keep a `between X and Y` range intact:
// when a part ends with a dangling `between ... ` (no closing operand yet),
// re-glue it with the following part.
type SplitConds<S extends string> =
    Reglue<SplitOn<S, " and ">> extends infer A extends string[]
        ? FlatSplit<A, " or "> : [];
type SplitOn<S extends string, D extends string> =
    S extends `${infer H}${D}${infer T}` ? [H, ...SplitOn<T, D>] : [S];
type FlatSplit<Parts extends readonly string[], D extends string, Acc extends string[] = []> =
    Parts extends readonly [infer H extends string, ...infer R extends string[]]
        ? FlatSplit<R, D, [...Acc, ...SplitOn<H, D>]> : Acc;

type Reglue<Parts extends readonly string[], Acc extends string[] = []> =
    Parts extends readonly [infer H extends string, infer N extends string, ...infer R extends string[]]
        ? EndsWithBetween<H> extends true
            ? Reglue<[`${H} and ${N}`, ...R], Acc>
            : Reglue<[N, ...R], [...Acc, H]>
        : Parts extends readonly [infer L extends string]
            ? [...Acc, L]
            : Acc;

type EndsWithBetween<S extends string> =
    Lowercase<Trim<S>> extends `${string} between ${infer Rest}`
        ? Rest extends `${string} and ${string}` ? false : true
        : false;

// Extract EVERY placeholder name in a fragment and type each DriverParamValue.
// Used as the loose fallback (spec §6.5) — present, not dropped, not column-typed.
type LooseParams<S extends string, Acc = {}> =
    S extends `${infer _Pre}:${infer Tail}`
        ? CleanParamIdent<Tail> extends infer P
            ? [P] extends [never] ? Acc
            : P extends "" ? Acc
            : P extends string ? LooseParams<AfterName<Tail>, Acc & { [K in P]: DriverParamValue }>
            : Acc
            : Acc
        : Acc;
// Advance past the just-consumed name so multiple placeholders are all caught.
type AfterName<S extends string> =
    S extends `${infer Head}${")" | "," | " "}${infer Rest}`
        ? Head extends `${string}:${string}` ? S : Rest
        : "";

type WhereParam<Cond extends string, Table extends string, S extends DatabaseSchema> =
    // col between :lo and :hi  (keywords lowercased post-normalize)
    Trim<Cond> extends `${infer Lhs} between ${infer Lo} and ${infer Hi}`
        ? BetweenParams<Lhs, Lo, Hi, Table, S>
    // col is [not] distinct from :p
    : Trim<Cond> extends `${infer Lhs} is not distinct from ${infer Rhs}`
        ? DistinctParam<Lhs, Rhs, Table, S>
    : Trim<Cond> extends `${infer Lhs} is distinct from ${infer Rhs}`
        ? DistinctParam<Lhs, Rhs, Table, S>
    : Trim<Cond> extends `${infer Lhs} in (${infer Inner})`
        ? ParamName<Inner> extends infer P
            ? [P] extends [never] ? LooseParams<Inner>
            : P extends string
                ? IsBareColumnRef<Lhs> extends true
                    ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Lhs>, S>[] }
                    : LooseParams<Inner>
                : LooseParams<Inner>
            : LooseParams<Inner>
        : Trim<Cond> extends `${infer Lhs}:${infer Tail}`
            ? CleanParamIdent<Tail> extends infer P
                ? [P] extends [never] ? LooseParams<Cond>
                : P extends "" ? LooseParams<Cond>
                : P extends string
                    // Recognized `col <op> :p` ONLY when, after removing the trailing
                    // comparison operator, the left side is a bare (optionally
                    // alias-qualified) identifier — no arithmetic, function call, or
                    // second placeholder. Anything else widens to loose (spec §6.4).
                    ? StripTrailingCmpOp<Lhs> extends infer Col extends string
                        ? IsBareColumnRef<Col> extends true
                            ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Col>, S> }
                            : LooseParams<Cond>
                        : LooseParams<Cond>
                    : LooseParams<Cond>
                : LooseParams<Cond>
            : LooseParams<Cond>;

// Strip a trailing recognized comparison operator (and surrounding spaces) from
// the left side of a `col <op> :p` split. COMPOUND/symbol ops first (so `!=`,
// `<=`, `>=`, `<>` are not mis-split by the `=`/`<`/`>` arms), then the word ops
// `like`/`ilike` (case-insensitive). If nothing recognized trails, returns the
// input unchanged so the bare-ref check below fails → loose.
type StripTrailingCmpOp<S extends string> =
    Trim<S> extends `${infer P}!=` ? Trim<P>
    : Trim<S> extends `${infer P}<>` ? Trim<P>
    : Trim<S> extends `${infer P}<=` ? Trim<P>
    : Trim<S> extends `${infer P}>=` ? Trim<P>
    : Trim<S> extends `${infer P}=` ? Trim<P>
    : Trim<S> extends `${infer P}<` ? Trim<P>
    : Trim<S> extends `${infer P}>` ? Trim<P>
    : Trim<S> extends `${infer P} ${infer Op}`
        ? Lowercase<Op> extends "like" | "ilike" ? Trim<P> : Trim<S>
        : Trim<S>;

// True iff `S` (trimmed) is a single column ref: an identifier, optionally
// alias/schema-qualified with dots, and NOTHING else — no space, arithmetic,
// parenthesis, pipe, percent, or extra colon. This is what makes `amount + `,
// `lower(x)`, and an empty Lhs (reversed `:p = col`) fail recognition → loose.
type IsBareColumnRef<S extends string> =
    Trim<S> extends "" ? false
    : Trim<S> extends `${string}${" " | "+" | "-" | "*" | "/" | "(" | ")" | ":" | "|" | "%"}${string}` ? false
    : true;

type BetweenParams<Lhs extends string, Lo extends string, Hi extends string,
    Table extends string, S extends DatabaseSchema> =
    ColumnTypeFromTableKey<Table, ColOf<Lhs>, S> extends infer CT
        ? IsBareColumnRef<Lhs> extends true
            ? MergeName<ParamName<Lo>, CT> & MergeName<ParamName<Hi>, CT>
                & LooseLeftover<Lo, Hi>
            : LooseParams<`${Lo} ${Hi}`>
        : {};

type DistinctParam<Lhs extends string, Rhs extends string,
    Table extends string, S extends DatabaseSchema> =
    IsBareColumnRef<Lhs> extends true
        ? MergeName<ParamName<Rhs>, ColumnTypeFromTableKey<Table, ColOf<Lhs>, S>>
        : LooseParams<Rhs>;

// { name: T } when name is a real param, else {} (a literal operand contributes none).
type MergeName<P, T> = [P] extends [never] ? {} : P extends string ? { [K in P]: T } : {};
// If an operand is not a placeholder it contributes nothing; this no-op keeps
// the between arm total.
type LooseLeftover<_Lo extends string, _Hi extends string> = {};

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
