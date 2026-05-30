import type {
    DatabaseSchema,
    ColumnExists,
    ColumnExistsInAnyTable,
    ResolveColumnName,
    TableExists
} from "./schema.js";
import type { AliasesInQuery, AliasNames, IsAliasName, TableKeyFromToken, TableKeyValid, TablesInQuery } from "./tables.js";
import type {
    CanPrecedeColumn,
    CleanExpr,
    CleanIdent,
    HasSpecial,
    IsParamPlaceholder,
    IsQualifiedRefCandidate,
    IsRuntimeStringFragment,
    IsSqlConstant,
    OperatorToken,
    ReplaceAll,
    SqlReserved,
    SplitOnDotClean
} from "./parsing.js";
import type { IsNever } from "./utils.js";

// Column references

export type ColumnRef<TableKey extends string, Column extends string> = {
    tableKey: TableKey;
    column: Column;
};

export type BuildColumnRef<
    TableKey extends string,
    Column extends string,
    S extends DatabaseSchema
> =
    ResolveColumnName<TableKey, Column, S> extends infer Resolved extends string
        ? ColumnRef<TableKey, Resolved>
        : never;

export type StripDoubleQuotes<S extends string> = ReplaceAll<S, `"`, "">;

// Parse column references from expressions
// - supports schema.table.column, table.column, and column

export type ParseColumnRef<
    Expr extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    SplitOnDotClean<StripDoubleQuotes<CleanExpr<Expr>>> extends [infer A extends string, infer B extends string, infer C extends string]
        ? IsSimpleRefPart<A> extends true
            ? IsSimpleRefPart<B> extends true
                ? IsSimpleRefPart<C> extends true
                    ? BuildColumnRef<`${A}.${B}`, C, S>
                    : never
                : never
            : never
        : SplitOnDotClean<StripDoubleQuotes<CleanExpr<Expr>>> extends [infer A extends string, infer B extends string]
            ? IsSimpleRefPart<A> extends true
                ? IsSimpleRefPart<B> extends true
                    ? IsRuntimeStringFragment<A> extends true
                        ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, B>] extends [infer TKRuntime extends string]
                            ? [TKRuntime] extends [never]
                                ? never
                                : BuildColumnRef<TKRuntime, B, S>
                            : never
                        : CleanIdent<A> extends "excluded"
                        ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, B>] extends [infer TKExcluded extends string]
                            ? [TKExcluded] extends [never]
                                ? never
                                : BuildColumnRef<TKExcluded, B, S>
                            : never
                        : [ResolveTableKey<A, Tables, Aliases, S>] extends [infer TK extends string]
                            ? [TK] extends [never]
                                ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, B>] extends [infer TKFallback extends string]
                                    ? [TKFallback] extends [never]
                                        ? never
                                        : BuildColumnRef<TKFallback, B, S>
                                    : never
                                : BuildColumnRef<TK, B, S>
                            : never
                    : never
                : never
            : SplitOnDotClean<StripDoubleQuotes<CleanExpr<Expr>>> extends [infer A extends string]
                ? IsSimpleRefPart<A> extends true
                    ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, A>] extends [infer TK2 extends string]
                        ? [TK2] extends [never]
                            ? never
                            : BuildColumnRef<TK2, A, S>
                        : never
                    : never
                : never;

export type IsSimpleRefPart<S extends string> =
    S extends "" ? false :
    HasSpecial<S> extends true ? false :
    true;

// Validate a column reference string like a.b or a.b.c

export type ColumnRefValid<ColRef extends string, N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? ColumnRefValidWith<ColRef, Tables, Aliases, S>
            : true
        : true;

export type ColumnRefValidWith<
    ColRef extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    ColRef extends `${infer Prefix}.*`
        ? [ResolveAlias<CleanIdent<Prefix>, Aliases>] extends [infer AliasKey extends string]
            ? [AliasKey] extends [never]
                ? TableKeysByName<CleanIdent<Prefix>, Tables> extends infer TableKey extends string
                    ? [TableKey] extends [never]
                        ? CleanIdent<Prefix> extends `${infer Schema}.${infer Table}`
                            ? TableExists<S, Schema, Table> extends true
                                ? TableKeyValid<`${Schema}.${Table}`, S>
                                : false
                            : false
                        : TableKeyValid<TableKey, S>
                    : false
                : TableKeyValid<AliasKey, S>
            : false
        : ParseColumnRef<ColRef, Tables, Aliases, S> extends infer Ref
            ? [Ref] extends [never]
                ? true
                : [Ref] extends [ColumnRef<infer TableKey extends string, infer Column extends string>]
                    ? ColumnExists<TableKey, Column, S>
                    : true
            : true;

export type ColumnRefValidLoose<ColRef extends string, N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? ColumnRefValidLooseWith<ColRef, Tables, Aliases, S>
            : ColumnRefValid<ColRef, N, S>
        : ColumnRefValid<ColRef, N, S>;

export type ColumnRefValidLooseWith<
    ColRef extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = IsNever<Tables> extends true
    ? ColumnRefValidNoTables<ColRef, S>
    : ColumnRefValidWith<ColRef, Tables, Aliases, S>;

export type ColumnRefValidNoTables<ColRef extends string, S extends DatabaseSchema> =
    SplitOnDotClean<ColRef> extends [infer A extends string, infer B extends string, infer C extends string]
        ? TableExists<S, A, B> extends true
            ? ColumnExists<`${A}.${B}`, C, S>
            : false
        : SplitOnDotClean<ColRef> extends [infer A extends string, infer B extends string]
            ? TableExists<S, S["defaultSchema"], A> extends true
                ? ColumnExists<`${S["defaultSchema"]}.${A}`, B, S>
                : ColumnExistsInAnyTable<B, S>
            : ColumnExistsInAnyTable<CleanIdent<ColRef>, S>;

// Best-effort qualified column references across the query

export type QualifiedColumnRefs<
    Tokens extends string[],
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    Acc extends string = never,
    Prev extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 900
    ? Acc
    : Tokens extends [infer T extends string, ...infer Rest extends string[]]
    ? T extends `${string}.${string}`
        ? Prev extends "from" | "join" | "update" | "into" | "delete"
            ? QualifiedColumnRefs<Rest, S, Tables, Aliases, Acc, T, [any, ...Steps]>
            : IsQualifiedRefCandidate<T> extends true
                ? QualifiedColumnRefs<Rest, S, Tables, Aliases, Acc | T, T, [any, ...Steps]>
                : QualifiedColumnRefs<Rest, S, Tables, Aliases, Acc, T, [any, ...Steps]>
        : QualifiedColumnRefs<Rest, S, Tables, Aliases, Acc, T, [any, ...Steps]>
    : Acc;

// Best-effort unqualified column references across the query

export type UnqualifiedColumnRefs<
    Tokens extends string[],
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    Acc extends string = never,
    Prev extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 900
    ? Acc
    : Tokens extends [infer T extends string, infer Next extends string, ...infer Rest extends string[]]
    ? IsUnqualifiedColumnCandidate<T, Prev, Next, Tables, Aliases, S> extends true
        ? UnqualifiedColumnRefs<[Next, ...Rest], S, Tables, Aliases, Acc | T, T, [any, ...Steps]>
        : UnqualifiedColumnRefs<[Next, ...Rest], S, Tables, Aliases, Acc, T, [any, ...Steps]>
    : Tokens extends [infer T extends string]
        ? IsUnqualifiedColumnCandidate<T, Prev, "", Tables, Aliases, S> extends true
            ? Acc | T
            : Acc
        : Acc;

export type UnqualifiedColumnValid<
    Col extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = IsNever<Tables> extends true
    ? ColumnExistsInAnyTable<CleanIdent<Col>, S>
    : [ResolveTableKeyForUnqualified<Tables, Aliases, S, CleanIdent<Col>>] extends [never]
        ? false
        : true;

export type IsUnqualifiedColumnCandidate<
    Token extends string,
    Prev extends string,
    Next extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    Token extends "" ? false :
    IsRuntimeStringFragment<Token> extends true ? false :
    Token extends OperatorToken ? false :
    Token extends `${string}.${string}` ? false :
    Token extends `'${string}'` ? false :
    Token extends `${string}'${string}` ? false :
    Token extends `${number}` ? false :
    IsParamPlaceholder<Token> extends true ? false :
    IsSqlConstant<Token> extends true ? false :
    HasSpecial<Token> extends true ? false :
    CleanIdent<Token> extends SqlReserved ? false :
    IsAliasName<Token, Aliases> extends true ? false :
    Prev extends "as" ? false :
    Prev extends "from" | "join" | "update" | "into" | "delete" ? false :
    Next extends "(" ? false :
    IsNever<Tables> extends true
        ? IsTableName<Token, S> extends true
            ? false
            : CanPrecedeColumn<Prev>
        : CanPrecedeColumn<Prev>;

export type IsTableName<Token extends string, S extends DatabaseSchema> =
    TableKeyFromToken<Token, S> extends infer TableKey extends string
        ? TableKeyValid<TableKey, S>
        : false;

// Utilities for table/column resolution

export type ResolveTableKey<Name extends string, Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    ResolveAlias<Name, Aliases> | TableKeysByName<Name, Tables> | `${S["defaultSchema"]}.${Name}`;

export type ResolveTableKeyForUnqualified<
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Column extends string
> = TablesWithColumn<Tables, Column, S> extends infer TK extends string ? TK : never;

export type ResolveAlias<Name extends string, Aliases extends string> =
    Aliases extends `${infer A}=>${infer T}`
        ? A extends Name
            ? T
            : never
        : never;

export type TableKeysByName<Name extends string, Tables extends string> =
    Tables extends `${infer Schema}.${infer Table}`
        ? Table extends Name
            ? `${Schema}.${Table}`
            : never
        : never;

export type TablesWithColumn<Tables extends string, Column extends string, S extends DatabaseSchema> =
    Tables extends `${infer Schema}.${infer Table}`
        ? ColumnExists<`${Schema}.${Table}`, Column, S> extends true
            ? `${Schema}.${Table}`
            : never
        : never;
