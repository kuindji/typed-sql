import type { AnyTrue, Simplify, UnionToIntersection } from "./utils.js";

export type DatabaseSchema = {
    defaultSchema: string;
    schemas: Record<string, Record<string, Record<string, any>>>;
    // Optional map of SQL function return types, keyed by unqualified function
    // name (case-insensitive). Absent ⇒ no functions known ⇒ identical behavior
    // to before this field existed (fully backward compatible).
    functions?: Record<string, FunctionSignature>;
    // Optional schema-wide cast-target map, keyed by the cast's target type name
    // alone (case-insensitive, unqualified): `citext → string`, `geometry →
    // Geometry`, a domain, an enum union. The per-schema counterpart to the
    // augmentable `PgTypeOverrides`. Only consulted for cast targets the built-in
    // scalar map can't resolve (the uninformative gate — see `CastTypeToTs`), so
    // it names CUSTOM types and never silently redefines a built-in like `::text`.
    // Absent ⇒ identical behavior to before this field existed.
    casts?: Record<string, any>;
};

// A declared function signature. `returns` is the TS type the call yields
// (e.g. `number | null` for a nullable numeric function). `params` is RESERVED
// for future argument-type validation and is NOT consumed anywhere yet. `casts`
// maps a cast target name → the TS type FOR THIS function (`ST_AsGeoJSON(...)::json
// → Point | null`), for targets determinate only in combination with this call.
export type FunctionSignature = {
    returns: any;
    params?: readonly any[];
    casts?: Record<string, any>;
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

// `RowTypeForTables` with outer-join nullability applied PER RELATION: each
// table's row is nullablized before the merge when a qualifier referring to it
// sits on the nullable side of an outer join. This is what makes a bare
// `select *` agree with `select o.*` and `select o.total` on the same query —
// those two already nullablize (`MaybeNullableRow` / `ApplyJoinNull`), while
// the star arm used to expand straight from the schema and hand back
// `total: number` for a row Postgres fills with NULL.
//
// Applied per table key, NOT to the whole merged row: only the outer-joined
// relations gain `| null`, the leading FROM source keeps its declared types.
// The `[Nullable] extends [never]` guard keeps join-free queries on the exact
// previous path (zero extra instantiations).
export type RowTypeForTablesJoinNull<
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string
> =
    [Nullable] extends [never]
        ? RowTypeForTables<Tables, S>
        : MergeRowUnion<
            Tables extends string
                ? TableKeyIsNullable<Tables, Aliases, Nullable> extends true
                    ? NullableRow<RowTypeForResolvedTableKey<Tables, S>>
                    : RowTypeForResolvedTableKey<Tables, S>
                : never
        >;

type NullableRow<Row> = { [K in keyof Row]: Row[K] | null };

// True when `TableKey` is referenced by a nullable qualifier. `Nullable` holds
// reference qualifiers (lowercased aliases, or the bare table name when the
// relation is unaliased — see `NullableRelations`), so:
//   1. alias path — an `alias=>TableKey` entry whose alias is in `Nullable`;
//   2. unaliased path — no such entry, so the qualifier is the table's own
//      (lowercased) name, compared against the schema-qualified key's tail.
//
// A SELF-JOIN with one outer side (`users u left join users m`) nullablizes the
// single shared table key, so a bare `*` reports every one of its columns
// nullable. That is the conservative direction and the only representable one:
// `*` over a self-join projects both instances under the SAME column names, so
// the merged row cannot separate `u.id` from the nullable `m.id`. A qualified
// `u.*` / `m.*` still resolves each side exactly.
export type TableKeyIsNullable<
    TableKey extends string,
    Aliases extends string,
    Nullable extends string
> =
    [Extract<Aliases, `${Nullable}=>${TableKey}`>] extends [never]
        ? TableKey extends `${string}.${infer Name}`
            ? [Lowercase<Name>] extends [Nullable] ? true : false
            : [Lowercase<TableKey>] extends [Nullable] ? true : false
        : true;

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

// Schema-wide cast-target resolver. `Name` is the already-normalized target type
// key (lowercased, qualifier-/array-stripped — see `NormalizeCastKey`). Yields
// the declared TS type, or `never` when the schema declares no `casts` map or the
// key is absent (caller falls through to the built-in). The `S extends { casts }`
// guard makes a schema WITHOUT the field zero-cost — the lookup never
// instantiates. `[K] extends [never]` short-circuits the missing-key case without
// distributing.
export type SchemaCastType<Name extends string, S extends DatabaseSchema> =
    S extends { casts: infer C extends Record<string, any> }
        ? MatchKeyCaseInsensitive<C, Name> extends infer K extends string
            ? [K] extends [never]
                ? never
                : C[K]
            : never
        : never;

// Per-function cast-target resolver. Mirrors `SchemaCastType` but keyed under a
// specific function's `casts` map (`functions[Func].casts[Name]`). Yields `never`
// when the function is undeclared, declares no `casts` map, or the key is absent.
// The most specific of the cast maps — an explicit entry is deliberate intent, so
// the caller lets it win even over a built-in target.
export type FunctionCastType<Func extends string, Name extends string, S extends DatabaseSchema> =
    SchemaFunctionSig<Func, S> extends infer Sig
        ? [Sig] extends [never]
            ? never
            : Sig extends { casts: infer C extends Record<string, any> }
                ? MatchKeyCaseInsensitive<C, Name> extends infer K extends string
                    ? [K] extends [never]
                        ? never
                        : C[K]
                    : never
                : never
        : never;
