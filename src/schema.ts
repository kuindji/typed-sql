import type { AnyTrue, Simplify, UnionToIntersection } from "./utils.js";

export type DatabaseSchema = {
    defaultSchema: string;
    schemas: Record<string, Record<string, Record<string, any>>>;
};

export type TableExists<S extends DatabaseSchema, Schema extends string, Table extends string> =
    Schema extends keyof S["schemas"]
        ? Table extends keyof S["schemas"][Schema]
            ? true
            : false
        : false;

export type ColumnExists<TableKey extends string, Column extends string, S extends DatabaseSchema> =
    ColumnTypeFromTableKey<TableKey, Column, S> extends never ? false : true;

export type ColumnTypeFromTableKey<TableKey extends string, Column extends string, S extends DatabaseSchema> =
    TableKey extends `${infer Schema}.${infer Table}`
        ? ColumnTypeFromSchemaTable<Schema, Table, Column, S>
        : never;

export type ColumnTypeFromSchemaTable<
    Schema extends string,
    Table extends string,
    Column extends string,
    S extends DatabaseSchema
> =
    Schema extends keyof S["schemas"]
        ? Table extends keyof S["schemas"][Schema]
            ? Column extends keyof S["schemas"][Schema][Table]
                ? S["schemas"][Schema][Table][Column]
                : never
            : never
        : never;

export type RowTypeForTables<Tables extends string, S extends DatabaseSchema> =
    Simplify<UnionToIntersection<
        Tables extends `${infer Schema}.${infer Table}`
            ? S["schemas"][Schema][Table]
            : unknown
    >>;

export type RowTypeForTable<TableKey extends string, S extends DatabaseSchema> =
    TableKey extends `${infer Schema}.${infer Table}`
        ? S["schemas"][Schema][Table]
        : unknown;

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
    AnyTrue<
        AllTableKeys<S> extends infer TableKey extends string
            ? ColumnExists<TableKey, Column, S>
            : false
    >;
