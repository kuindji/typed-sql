import type { AnyTrue, Simplify, UnionToIntersection } from "./utils.js";

export type DatabaseSchema = {
    defaultSchema: string;
    schemas: Record<string, Record<string, Record<string, any>>>;
    // Optional map of SQL function return types, keyed by unqualified function
    // name (case-insensitive). Absent ⇒ no functions known ⇒ identical behavior
    // to before this field existed (fully backward compatible).
    functions?: Record<string, FunctionSignature>;
};

// A declared function signature. `returns` is the TS type the call yields
// (e.g. `number | null` for a nullable numeric function). `params` is RESERVED
// for future argument-type validation and is NOT consumed anywhere yet.
export type FunctionSignature = {
    returns: any;
    params?: readonly any[];
};

export type StringKeys<T> = Extract<keyof T, string>;

export type MatchKeyCaseInsensitive<Obj, Name extends string> =
    string extends Name
        ? never
        : StringKeys<Obj> extends infer K extends string
            ? K extends any
                ? Lowercase<K> extends Lowercase<Name>
                    ? K
                    : never
                : never
            : never;

export type ResolveSchemaName<S extends DatabaseSchema, Schema extends string> =
    MatchKeyCaseInsensitive<S["schemas"], Schema>;

export type ResolveTableName<
    S extends DatabaseSchema,
    Schema extends string,
    Table extends string
> =
    Schema extends keyof S["schemas"]
        ? MatchKeyCaseInsensitive<S["schemas"][Schema], Table>
        : never;

export type NormalizeTableKey<TableKey extends string, S extends DatabaseSchema> =
    TableKey extends `${infer Schema}.${infer Table}`
        ? ResolveSchemaName<S, Schema> extends infer RS extends string
            ? ResolveTableName<S, RS, Table> extends infer RT extends string
                ? `${RS}.${RT}`
                : never
            : never
        : never;

export type RowTypeFromNormalizedTableKey<
    TableKey extends string,
    S extends DatabaseSchema
> =
    TableKey extends `${infer Schema}.${infer Table}`
        ? Schema extends keyof S["schemas"]
            ? Table extends keyof S["schemas"][Schema]
                ? S["schemas"][Schema][Table]
                : never
            : never
        : never;

export type RowTypeForResolvedTableKey<TableKey extends string, S extends DatabaseSchema> =
    NormalizeTableKey<TableKey, S> extends infer Normalized extends string
        ? RowTypeFromNormalizedTableKey<Normalized, S>
        : never;

export type ResolveColumnName<
    TableKey extends string,
    Column extends string,
    S extends DatabaseSchema
> =
    RowTypeForResolvedTableKey<TableKey, S> extends infer Row extends Record<string, any>
        ? MatchKeyCaseInsensitive<Row, Column>
        : never;

export type TableExists<S extends DatabaseSchema, Schema extends string, Table extends string> =
    NormalizeTableKey<`${Schema}.${Table}`, S> extends never ? false : true;

export type ColumnExists<TableKey extends string, Column extends string, S extends DatabaseSchema> =
    ColumnTypeFromTableKey<TableKey, Column, S> extends never ? false : true;

export type ColumnTypeFromTableKey<TableKey extends string, Column extends string, S extends DatabaseSchema> =
    ResolveColumnName<TableKey, Column, S> extends infer ResolvedColumn extends string
        ? RowTypeForResolvedTableKey<TableKey, S> extends infer Row extends Record<string, any>
            ? ResolvedColumn extends keyof Row
                ? Row[ResolvedColumn]
                : never
            : never
        : never;

export type ColumnTypeFromSchemaTable<
    Schema extends string,
    Table extends string,
    Column extends string,
    S extends DatabaseSchema
> =
    ColumnTypeFromTableKey<`${Schema}.${Table}`, Column, S>;

export type RowTypeForTables<Tables extends string, S extends DatabaseSchema> =
    MergeRowUnion<
        Tables extends string
            ? RowTypeForResolvedTableKey<Tables, S>
            : never
    >;

// Merge a union of row types into one row. Unlike UnionToIntersection, a column
// present in several joined tables keeps the UNION of its types (not their
// intersection, which collapses differing same-named columns to `never`).
export type MergeRowUnion<Rows> =
    [Rows] extends [never]
        ? {}
        : Simplify<{
            [K in (Rows extends any ? keyof Rows : never) & PropertyKey]:
                Rows extends any ? (K extends keyof Rows ? Rows[K] : never) : never;
        }>;

export type RowTypeForTable<TableKey extends string, S extends DatabaseSchema> =
    RowTypeForResolvedTableKey<TableKey, S>;

export type AllTableKeys<S extends DatabaseSchema> =
    keyof S["schemas"] extends infer Schema
        ? Schema extends string
            ? keyof S["schemas"][Schema] extends infer Table
                ? Table extends string
                    ? `${Schema}.${Table}`
                    : never
                : never
            : never
        : never;

export type ColumnExistsInAnyTable<Column extends string, S extends DatabaseSchema> =
    AnyTrue<ColumnExistsInTableUnion<AllTableKeys<S>, Column, S>>;

export type ColumnExistsInTableUnion<
    Tables extends string,
    Column extends string,
    S extends DatabaseSchema
> = Tables extends any ? ColumnExists<Tables, Column, S> : false;

// Resolve a declared function signature from the schema's `functions` map by
// unqualified name, case-insensitively (mirrors table/column matching). `never`
// when the schema declares no `functions` map or the name is not present — so
// callers fall through to their existing behavior (backward compatible).
export type SchemaFunctionSig<Func extends string, S extends DatabaseSchema> =
    S extends { functions: infer F extends Record<string, any> }
        ? MatchKeyCaseInsensitive<F, Func> extends infer K extends string
            ? [K] extends [never]
                ? never
                : F[K]
            : never
        : never;

// The declared return type of a schema function (`never` when undeclared).
// The `[Sig] extends [never]` guard short-circuits the undeclared case: without
// it, `never extends { returns }` DISTRIBUTES over the empty union and yields
// `never`, which is the intended result here but is unsafe in the boolean
// variant below — so both guard explicitly for symmetry/clarity.
export type SchemaFunctionReturn<Func extends string, S extends DatabaseSchema> =
    SchemaFunctionSig<Func, S> extends infer Sig
        ? [Sig] extends [never]
            ? never
            : Sig extends { returns: infer R } ? R : never
        : never;

// True when a schema function is declared AND its return type includes `null`.
// Used by the cast branch to decide whether `fn(...)::T` keeps `| null`.
// CRITICAL: the `[Sig] extends [never]` guard is load-bearing — when the
// function is undeclared, `Sig` is `never`, and `never extends { returns }`
// would distribute to `never` (NOT `false`); `never extends true` is then
// vacuously true at the call site, spuriously adding `| null` to EVERY compound
// cast. Guarding to `false` keeps undeclared/functions-less schemas unchanged.
export type SchemaFunctionReturnIsNullable<Func extends string, S extends DatabaseSchema> =
    SchemaFunctionSig<Func, S> extends infer Sig
        ? [Sig] extends [never]
            ? false
            : Sig extends { returns: infer R }
                ? null extends R
                    ? true
                    : false
                : false
        : false;
