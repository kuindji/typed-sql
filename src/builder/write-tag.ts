// src/builder/write-tag.ts
import type { DatabaseSchema } from "../schema.js";
import type { ExtractParams, ExtractReturning } from "./extract-params.js";

export type WriteMode = "max" | "req";

export interface ValueFrag { readonly col: string; readonly text: string; readonly cond: boolean; }
export interface ClauseFrag { readonly text: string; readonly cond: boolean; }

export interface InsertTag {
    readonly kind: "insert";
    readonly table: string;
    readonly values: readonly ValueFrag[];
    readonly conflict: string | null;
    readonly wheres: readonly ClauseFrag[];     // unused for insert; kept uniform
    readonly using: readonly ClauseFrag[];
    readonly from: readonly ClauseFrag[];
    readonly returning: string | null;
}
export interface UpdateTag {
    readonly kind: "update";
    readonly table: string;
    readonly alias: string;
    readonly sets: readonly ClauseFrag[];
    readonly from: readonly ClauseFrag[];
    readonly wheres: readonly ClauseFrag[];
    readonly returning: string | null;
}
export interface DeleteTag {
    readonly kind: "delete";
    readonly table: string;
    readonly using: readonly ClauseFrag[];
    readonly wheres: readonly ClauseFrag[];
    readonly returning: string | null;
}

// keep only the fragments live for a mode ("req" drops cond=true).
type ForMode<List extends readonly { cond: boolean }[], Mode extends WriteMode> =
    Mode extends "max" ? List : DropCond<List>;
type DropCond<List extends readonly { cond: boolean }[]> =
    List extends readonly [infer H extends { cond: boolean }, ...infer R extends readonly { cond: boolean }[]]
        ? H["cond"] extends true ? DropCond<R> : readonly [H, ...DropCond<R>]
        : readonly [];

type ColList<List extends readonly ValueFrag[], Acc extends string = ""> =
    List extends readonly [infer H extends ValueFrag, ...infer R extends readonly ValueFrag[]]
        ? ColList<R, Acc extends "" ? H["col"] : `${Acc}, ${H["col"]}`> : Acc;
type ValList<List extends readonly ValueFrag[], Acc extends string = ""> =
    List extends readonly [infer H extends ValueFrag, ...infer R extends readonly ValueFrag[]]
        ? ValList<R, Acc extends "" ? H["text"] : `${Acc}, ${H["text"]}`> : Acc;
type JoinText<List extends readonly { text: string }[], Sep extends string, Acc extends string = ""> =
    List extends readonly [infer H extends { text: string }, ...infer R extends readonly { text: string }[]]
        ? JoinText<R, Sep, Acc extends "" ? H["text"] : `${Acc}${Sep}${H["text"]}`> : Acc;

type Conflict<C extends string | null> = C extends string ? ` on conflict ${C}` : "";
type Returning<R extends string | null> = R extends string ? ` returning ${R}` : "";
type FromClause<L extends readonly ClauseFrag[]> = L extends readonly [] ? "" : ` from ${JoinText<L, ", ">}`;
type UsingClause<L extends readonly ClauseFrag[]> = L extends readonly [] ? "" : ` using ${JoinText<L, ", ">}`;
type WhereClause<L extends readonly ClauseFrag[]> = L extends readonly [] ? "" : ` where ${JoinText<L, " and ">}`;

export type BuildInsertSQL<T extends InsertTag, Mode extends WriteMode> =
    ForMode<T["values"], Mode> extends infer V extends readonly ValueFrag[]
        ? `insert into ${T["table"]} (${ColList<V>}) values (${ValList<V>})${Conflict<T["conflict"]>}${Returning<T["returning"]>}`
        : never;

// Head is `table` alone, or `table alias` when an alias was supplied.
type UpdateHead<T extends UpdateTag> = T["alias"] extends "" ? T["table"] : `${T["table"]} ${T["alias"]}`;

export type BuildUpdateSQL<T extends UpdateTag, Mode extends WriteMode> =
    `update ${UpdateHead<T>} set ${JoinText<ForMode<T["sets"], Mode>, ", ">}${FromClause<ForMode<T["from"], Mode>>}${WhereClause<ForMode<T["wheres"], Mode>>}${Returning<T["returning"]>}`;

export type BuildDeleteSQL<T extends DeleteTag, Mode extends WriteMode> =
    `delete from ${T["table"]}${UsingClause<ForMode<T["using"], Mode>>}${WhereClause<ForMode<T["wheres"], Mode>>}${Returning<T["returning"]>}`;

type BuildSQL<T, Mode extends WriteMode> =
    T extends InsertTag ? BuildInsertSQL<T, Mode>
    : T extends UpdateTag ? BuildUpdateSQL<T, Mode>
    : T extends DeleteTag ? BuildDeleteSQL<T, Mode>
    : never;

// Required iff present in the req-mode params; value type taken from max-mode
// (full §6.2 intersection over all occurrences). Mirrors return-type.ts Partition.
type Partition<Max, Req> =
    & { [K in keyof Max as K extends keyof Req ? K : never]: Max[K] }
    & { [K in keyof Max as K extends keyof Req ? never : K]?: Max[K] };

export type WriteParamsFor<T, S extends DatabaseSchema> =
    Partition<ExtractParams<BuildSQL<T, "max">, S>, ExtractParams<BuildSQL<T, "req">, S>> extends infer P
        ? { [K in keyof P]: P[K] } : never;

export type WriteReturnFor<T, S extends DatabaseSchema> =
    ExtractReturning<BuildSQL<T, "max"> & string, S>;
