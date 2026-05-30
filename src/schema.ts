import type { AnyTrue, Simplify, UnionToIntersection } from "./utils.js";

export type DatabaseSchema = {
    defaultSchema: string;
    schemas: Record<string, Record<string, Record<string, any>>>;
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
