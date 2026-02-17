import type { DatabaseSchema, ColumnTypeFromTableKey, RowTypeForTable, RowTypeForTables } from "./schema.js";
import type {
    ColumnRef,
    ColumnRefValidLooseWith,
    ParseColumnRef,
    QualifiedColumnRefs,
    ResolveTableKey,
    UnqualifiedColumnRefs,
    UnqualifiedColumnValid
} from "./columns.js";
import type { AliasesInQuery, TablesInQuery } from "./tables.js";
import type {
    CleanExpr,
    CleanIdent,
    ExtractAlias,
    ExtractBefore,
    IsIdentifier,
    IsParamPlaceholder,
    IsRuntimeStringFragment,
    IsSqlConstant,
    SqlConstantType,
    SplitTopLevel,
    TokenizeLoose,
    Trim
} from "./parsing.js";
import type { AllTrue } from "./utils.js";

// Expression parsing & types

export type IsIgnorableRuntimeExpr<E extends string> =
    IsRuntimeStringFragment<E> extends true
        ? true
        : [E] extends [" "]
            ? true
            : false;

export type ExprToObject<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    IsIgnorableRuntimeExpr<E> extends true
        ? {}
        : ExtractAlias<E> extends { expr: infer RawExpr extends string; alias: infer Alias }
            ? IsIgnorableRuntimeExpr<RawExpr> extends true
            ? {}
            : [Alias] extends [never]
                ? CleanIdent<RawExpr> extends "*"
                    ? RowTypeForTables<Tables, S>
                    : CleanIdent<RawExpr> extends `${infer T}.*`
                        ? RowTypeForTable<ResolveTableKey<CleanIdent<T>, Tables, Aliases, S>, S>
                        : ExprKey<E, Tables, Aliases, S> extends infer Key extends string | never
                            ? Key extends string
                                ? { [K in Key]: ExprType<RawExpr, Tables, Aliases, S> }
                                : Record<string, unknown>
                            : Record<string, unknown>
                : Alias extends string
                        ? { [K in Alias]: ExprType<RawExpr, Tables, Aliases, S> }
                        : Record<string, unknown>
            : Record<string, unknown>;

export type ExprKey<E extends string, Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    CleanIdent<E> extends "*" ? never :
    CleanIdent<E> extends `${infer T}.*` ? never :
    CleanExpr<E> extends `${infer Inner}::${string}`
        ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
        : CleanExpr<E> extends `cast(${infer Inner} as ${string})`
            ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
            : CleanExpr<E> extends `cast (${infer Inner} as ${string})`
                ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
                : ColumnKeyFromExpr<E, Tables, Aliases, S> extends infer C extends string
                    ? C
                    : FunctionKeyFromExpr<E>;

export type ColumnKeyFromExpr<E extends string, Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    ParseColumnRef<CleanExpr<E>, Tables, Aliases, S> extends infer Ref
        ? Ref extends ColumnRef<any, any>
            ? Ref["column"]
            : never
        : never;

export type FunctionKeyFromExpr<E extends string> =
    CleanExpr<E> extends `${infer Func}(${string}`
        ? CleanIdent<Func>
        : CleanExpr<E> extends `${infer Func} (${string}`
            ? CleanIdent<Func>
            : never;

export type ExprType<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> =
    Steps["length"] extends 25
        ? unknown
        : IsIgnorableRuntimeExpr<E> extends true
            ? unknown
            : CleanExpr<E> extends infer CE extends string
            ? IsRuntimeStringFragment<CE> extends true
                ? unknown
                : CE extends "*"
                    ? RowTypeForTables<Tables, S>
                    : CE extends `${infer T}.*`
                        ? RowTypeForTable<ResolveTableKey<CleanIdent<T>, Tables, Aliases, S>, S>
                        : CE extends `${infer Inner}::${infer CastTypeName}`
                            ? ExprType<Inner, Tables, Aliases, S, [any, ...Steps]> extends never
                                ? never
                                : SqlTypeToTs<CastTypeName>
                                : CE extends `cast(${infer Inner} as ${infer CastTypeName})`
                                    ? ExprType<Inner, Tables, Aliases, S, [any, ...Steps]> extends never
                                        ? never
                                        : SqlTypeToTs<CastTypeName>
                                : CE extends `cast (${infer Inner} as ${infer CastTypeName})`
                                    ? ExprType<Inner, Tables, Aliases, S, [any, ...Steps]> extends never
                                        ? never
                                        : SqlTypeToTs<CastTypeName>
                                : CE extends `${infer Func}(${infer Args})`
                                    ? FunctionReturn<CleanIdent<Func>, Args, Tables, Aliases, S, [any, ...Steps]>
                                : CE extends `${infer Func} (${infer Args})`
                                    ? FunctionReturn<CleanIdent<Func>, Args, Tables, Aliases, S, [any, ...Steps]>
                                    : CE extends "null"
                                        ? null
                                        : CE extends `'${infer L}'`
                                            ? L
                                            : CE extends `${infer N extends number}`
                                                ? N
                                                : CE extends "true"
                                                    ? true
                                                    : CE extends "false"
                                                        ? false
                                                        : IsSqlConstant<CE> extends true
                                                            ? SqlConstantType<CE>
                                                            : IsParamPlaceholder<CE> extends true
                                                                ? unknown
                                                                : [ParseColumnRef<CE, Tables, Aliases, S>] extends [infer Ref]
                                                                    ? [Ref] extends [never]
                                                                        ? IsIdentifier<CE> extends true
                                                                            ? never
                                                                            : unknown
                                                                        : Ref extends ColumnRef<infer TableKey extends string, infer Column extends string>
                                                                            ? ColumnTypeFromTableKey<TableKey, Column, S>
                                                                            : IsIdentifier<CE> extends true
                                                                                ? never
                                                                                : unknown
                                                                    : unknown
            : unknown;

// Function returns

export type FunctionReturn<
    Func extends string,
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> =
    Steps["length"] extends 25
        ? unknown
        : ArgsValid<Args, Tables, Aliases, S, Steps> extends false
            ? never
            : Func extends "count"
                ? number
                : Func extends "sum" | "avg"
                    ? number
                    : Func extends "min" | "max"
                        ? FirstArgType<Args, Tables, Aliases, S, Steps>
                        : Func extends "upper" | "lower" | "concat"
                            ? string
                            : Func extends "coalesce"
                                ? UnionArgTypes<Args, Tables, Aliases, S, Steps>
                                : unknown;

// Expression validation

export type ExprsValid<Exprs extends string[], N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? ExprsValidList<Exprs, Tables, Aliases, S>
            : true
        : true;

export type ExprValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    IsIgnorableRuntimeExpr<E> extends true
        ? true
        : ExtractAlias<E> extends { expr: infer RawExpr extends string }
            ? IsIgnorableRuntimeExpr<RawExpr> extends true
            ? true
            : ExprType<RawExpr, Tables, Aliases, S> extends never
                ? false
                : NeedsTokenRefValidation<RawExpr> extends true
                    ? ExprColumnRefsValid<RawExpr, Tables, Aliases, S>
                    : true
            : true;

export type NeedsTokenRefValidation<E extends string> =
    CleanExpr<E> extends `${string}::${string}` ? false :
    CleanExpr<E> extends `cast(${string} as ${string})` ? false :
    CleanExpr<E> extends `cast (${string} as ${string})` ? false :
    CleanExpr<E> extends `${string}(${string}` ? false :
    CleanExpr<E> extends `${string} (${string}` ? false :
    true;

export type ExprColumnRefsValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = ExprQualifiedRefsValid<E, Tables, Aliases, S> extends true
    ? ExprUnqualifiedRefsValid<E, Tables, Aliases, S>
    : false;

export type ExprQualifiedRefsValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = QualifiedColumnRefs<TokenizeLoose<E>, S, Tables, Aliases> extends infer Cols
    ? AllTrue<Cols extends string ? ColumnRefValidLooseWith<Cols, Tables, Aliases, S> : true>
    : true;

export type ExprUnqualifiedRefsValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = UnqualifiedColumnRefs<TokenizeLoose<E>, S, Tables, Aliases> extends infer Cols
    ? AllTrue<Cols extends string ? UnqualifiedColumnValid<Cols, Tables, Aliases, S> : true>
    : true;

export type ExprsValidList<
    Exprs extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> = Steps["length"] extends 100
    ? true
    : Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? ExprValid<H, Tables, Aliases, S> extends true
            ? ExprsValidList<Rest, Tables, Aliases, S, [any, ...Steps]>
            : false
        : true;

// Argument parsing

export type FirstArgType<
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    SplitTopLevel<Args> extends [infer First extends string, ...infer _]
        ? ExprType<First, Tables, Aliases, S, Steps>
        : unknown;

export type UnionArgTypes<
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    SplitTopLevel<Args> extends infer Parts extends string[]
        ? Parts[number] extends infer P extends string
            ? ExprType<P, Tables, Aliases, S, Steps>
            : unknown
        : unknown;

export type ArgsValid<
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    Trim<Args> extends ""
        ? true
        : SplitTopLevel<Args> extends infer Parts extends string[]
            ? AllTrue<Parts[number] extends infer P extends string ? (ExprType<P, Tables, Aliases, S, Steps> extends never ? false : true) : true>
            : true;

// SQL type mapping

export type SqlTypeToTs<T extends string> =
    NormalizeTypeName<T> extends infer N extends string
        ? N extends "int" | "integer" | "bigint" | "smallint" | "numeric" | "decimal" | "real" | "double" | "float"
            ? number
            : N extends "bool" | "boolean"
                ? boolean
            : N extends "text" | "varchar" | "char" | "character" | "uuid"
                ? string
                : N extends "date" | "time" | "timestamp" | "timestamptz"
                    ? string
                        : N extends "json" | "jsonb"
                            ? unknown
                            : N extends "bytea" | "blob"
                                ? Uint8Array
                                : unknown
        : unknown;

export type NormalizeTypeName<S extends string> =
    CleanIdent<ExtractBefore<Trim<S>, "(">>;
