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
    ExtractAliasResult,
    ExtractBefore,
    ExtractBeforeFromTopLevel,
    IsIdentifier,
    IsParamPlaceholder,
    IsRuntimeStringFragment,
    IsSqlConstant,
    SqlConstantType,
    SplitBalancedParen,
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
    S extends DatabaseSchema,
    Nullable extends string = never
> =
    IsIgnorableRuntimeExpr<E> extends true
        ? {}
        : ExtractAliasResult<E> extends { expr: infer RawExpr extends string; alias: infer Alias }
            ? IsIgnorableRuntimeExpr<RawExpr> extends true
            ? [Alias] extends [never]
                ? {}
                : Alias extends string
                    ? { [K in Alias]: unknown }
                    : {}
            : [Alias] extends [never]
                ? CleanIdent<RawExpr> extends "*"
                    ? RowTypeForTables<Tables, S>
                    : CleanIdent<RawExpr> extends `${infer T}.*`
                        ? MaybeNullableRow<RowTypeForTable<ResolveTableKey<CleanIdent<T>, Tables, Aliases, S>, S>, T, Nullable>
                        : ExprKey<E, Tables, Aliases, S> extends infer Key extends string | never
                            ? Key extends string
                                ? { [K in Key]: ApplyJoinNull<ExprType<RawExpr, Tables, Aliases, S>, RawExpr, Nullable> }
                                : Record<string, unknown>
                            : Record<string, unknown>
                : Alias extends string
                        ? { [K in Alias]: ApplyJoinNull<ExprType<RawExpr, Tables, Aliases, S>, RawExpr, Nullable> }
                        : Record<string, unknown>
            : Record<string, unknown>;

// Outer-join nullability for a directly-projected column. `Nullable` is the set
// of reference qualifiers (aliases / table names) that are nullable due to an
// outer join (see `NullableRelations`). When the projected expression is a plain
// column ref (optionally wrapped in a cast) qualified by one of them, union
// `| null` onto its type. Function calls, concatenations, literals, and `*` are
// not plain qualified column refs, so they keep their computed type. The
// `[Nullable] extends [never]` guard makes join-free queries pay zero extra cost.
export type ApplyJoinNull<
    T,
    E extends string,
    Nullable extends string
> =
    [Nullable] extends [never]
        ? T
        : RefQualifier<E> extends infer Q extends string
            ? [Q] extends [never]
                ? T
                : Q extends Nullable
                    ? T | null
                    : T
            : T;

// The qualifier of a plain column ref (`tr."name"` -> `tr`), after stripping an
// outer cast (`tms."currency"::text` -> `tms`). `never` when the expression has
// no qualifier (bare column) or is not a plain column ref.
export type RefQualifier<E extends string> =
    StripOuterCast<E> extends infer Inner extends string
        ? CleanExpr<Inner> extends `${infer Q}.${string}`
            ? CleanIdent<Q>
            : never
        : never;

export type StripOuterCast<E extends string> =
    CleanExpr<E> extends `${infer Inner}::${string}`
        ? Inner
        : CleanExpr<E> extends `cast(${infer Inner} as ${string})`
            ? Inner
            : CleanExpr<E> extends `cast (${infer Inner} as ${string})`
                ? Inner
                : E;

// Nullablize every column of a `*`-expanded row when its qualifier is nullable.
export type MaybeNullableRow<Row, Qualifier extends string, Nullable extends string> =
    [Nullable] extends [never]
        ? Row
        : CleanIdent<Qualifier> extends Nullable
            ? { [K in keyof Row]: Row[K] | null }
            : Row;

export type ExprKey<E extends string, Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    CleanIdent<E> extends "*" ? never :
    CleanIdent<E> extends `${infer T}.*` ? never :
    CleanExpr<E> extends `${infer Inner}::${string}`
        ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
        : CleanExpr<E> extends `cast(${infer Inner} as ${string})`
            ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
            : CleanExpr<E> extends `cast (${infer Inner} as ${string})`
                ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
                : [ColumnKeyFromExpr<E, Tables, Aliases, S>] extends [never]
                    ? FunctionKeyFromExpr<E>
                    : ColumnKeyFromExpr<E, Tables, Aliases, S>;

export type ColumnKeyFromExpr<E extends string, Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    ParseColumnRef<CleanExpr<E>, Tables, Aliases, S> extends infer Ref
        ? Ref extends ColumnRef<any, any>
            ? Ref["column"]
            : never
        : never;

export type FunctionKeyFromExpr<E extends string> =
    CleanExpr<E> extends `case ${string}` ? "case" :
    CleanExpr<E> extends `${infer Func}(${string}`
        ? CleanIdent<Func>
        : CleanExpr<E> extends `${infer Func} (${string}`
            ? CleanIdent<Func>
            : never;

// A projected expression whose top-level operator is a comparison
// (`<`, `>`, `<=`, `>=`, `<>`, `!=`, `=`) yields `boolean`. CASE expressions are
// excluded: their `when … > …` comparison sits at top level but the expression's
// type is the THEN/ELSE branch, not boolean. A `case` wrapped in parens (e.g.
// `(case … end)`) is already protected — its inner comparison is below depth 0.
export type IsBoolExpr<CE extends string> =
    CE extends `case ${string}`
        ? false
        : HasTopLevelCompare<CE>;

// Scans for a comparison operator outside parens and outside `'…'`/`"…"` quotes.
// `->>`, `#>>` and `::` are consumed as units so their `>`/`:` are not mistaken
// for comparisons. Modelled on the char-walker in `SplitTopLevel` (parsing.ts).
export type HasTopLevelCompare<
    S extends string,
    Depth extends any[] = [],
    Steps extends any[] = [],
    InQ extends boolean = false,
    InDQ extends boolean = false
> = Steps["length"] extends 400
    ? false
    : S extends `${infer C}${infer Rest}`
        ? InQ extends true
            ? HasTopLevelCompare<Rest, Depth, [any, ...Steps], C extends "'" ? false : true, InDQ>
        : InDQ extends true
            ? HasTopLevelCompare<Rest, Depth, [any, ...Steps], InQ, C extends `"` ? false : true>
        : C extends "'"
            ? HasTopLevelCompare<Rest, Depth, [any, ...Steps], true, InDQ>
        : C extends `"`
            ? HasTopLevelCompare<Rest, Depth, [any, ...Steps], InQ, true>
        : C extends "("
            ? HasTopLevelCompare<Rest, [any, ...Depth], [any, ...Steps], InQ, InDQ>
        : C extends ")"
            ? HasTopLevelCompare<Rest, Depth extends [any, ...infer D] ? D : [], [any, ...Steps], InQ, InDQ>
        : Depth["length"] extends 0
            // Consume multi-char operators whose `<`/`>`/`:` are NOT comparisons:
            // JSON access (`->`, `->>`, `#>`, `#>>`), containment (`@>`, `<@`),
            // cast (`::`), and bit-shift (`<<`, `>>`). Longer forms first.
            ? S extends `->>${infer R}`
                ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : S extends `->${infer R}`
                    ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : S extends `#>>${infer R}`
                    ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : S extends `#>${infer R}`
                    ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : S extends `@>${infer R}`
                    ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : S extends `<@${infer R}`
                    ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : S extends `::${infer R}`
                    ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : S extends `<<${infer R}`
                    ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : S extends `>>${infer R}`
                    ? HasTopLevelCompare<R, Depth, [any, ...Steps], InQ, InDQ>
                : C extends "<" | ">" | "=" | "!"
                    ? true
                    : HasTopLevelCompare<Rest, Depth, [any, ...Steps], InQ, InDQ>
            : HasTopLevelCompare<Rest, Depth, [any, ...Steps], InQ, InDQ>
        : false;

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
                        : CE extends `(select ${infer SubBody})`
                            ? ScalarSubqueryType<SubBody, S, [any, ...Steps]>
                        : IsBoolExpr<CE> extends true
                            ? boolean
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
                                    : CE extends `${string}||${string}`
                                        ? string
                                    : CE extends `${infer JBase}->>${string}`
                                        ? ExprType<JBase, Tables, Aliases, S, [any, ...Steps]> extends never
                                            ? never
                                            : string
                                    : CE extends `${infer JBase}#>>${string}`
                                        ? ExprType<JBase, Tables, Aliases, S, [any, ...Steps]> extends never
                                            ? never
                                            : string
                                    : CE extends "null"
                                        ? null
                                        : CE extends `'${infer L}'`
                                            ? string
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

// Scalar subquery in an expression position -> the type of its single
// projected column. `SubBody` is everything after `(select `, e.g.
// "count(*) from payments p where p.order_id = o.id". We extract the inner
// select list (paren/quote-aware, stopping at the inner top-level FROM), take
// its first projected expression, and type it against the SUBQUERY's own
// tables/aliases so correlated column refs (e.g. max(amount)) resolve. Inner
// column refs against the OUTER query (correlation) fall back to unknown, which
// is acceptable for a scalar result type.
export type ScalarSubqueryType<
    SubBody extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    ExtractBeforeFromTopLevel<SubBody> extends infer SL extends string
        ? SplitTopLevel<SL> extends [infer First extends string, ...infer _Rest]
            ? First extends string
                ? `select ${SubBody}` extends infer SubQuery extends string
                    ? TablesInQuery<SubQuery, S> extends infer SubTables extends string
                        ? AliasesInQuery<SubQuery, S> extends infer SubAliases extends string
                            ? ExtractAliasResult<First> extends { expr: infer RawExpr extends string }
                                ? ExprType<RawExpr, SubTables, SubAliases, S, Steps>
                                : unknown
                            : unknown
                        : unknown
                    : unknown
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
                    : FuncCompoundArgsValid<RawExpr, Tables, Aliases, S>
            : true;

// A function-call (or cast) projection skips the token ref-scan above
// (`NeedsTokenRefValidation` is false for `${fn}(${args})`), which is why an
// invalid column hidden inside an aggregate/function argument — `sum(price +
// bogus_col)`, `date_trunc('day', bogus_col)`, `array_agg(bogus_col ORDER BY
// created_at)` — escapes validation while the same ref written OUTSIDE a function
// is caught. Recover that case here, in the SELECT-list validation path ONLY (not
// `ExprType`, so the return-type/`QueryResult` path and its instantiation cost are
// untouched).
//
// We extract the call's argument list and run each argument through the same
// loose column-ref scan the rest of the query uses (`ExprColumnRefsValid`), which
// already skips string literals, numbers, params, operators, and SQL keywords —
// so an aggregate-local `ORDER BY` (`array_agg(id ORDER BY created_at)`) and
// keyword-style args resolve their genuine column surfaces while non-columns stay
// lenient. The `EXTRACT(field FROM source)` date-part keyword grammar is handled
// upstream by `RewriteExtractCall` (rewritten to `extract(source)`) so the field
// token is never seen here. The `extends false` guard rejects only on a DEFINITE
// invalid column.
export type FuncCompoundArgsValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    ExtractFuncArgList<CleanExpr<E>> extends infer Args extends string
        ? [Args] extends [never]
            ? true
            : ArgsArithRefsValid<SplitTopLevel<Args>, Tables, Aliases, S>
        : true;

// The inner argument list of the FIRST `(...)` group, or `never` when the
// expression is not a call (e.g. a cast like `x::int`, which must stay lenient).
export type ExtractFuncArgList<E extends string> =
    E extends `${infer _Func}(${infer AfterOpen}`
        ? SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string }
            ? Inner
            : never
        : never;

export type ArgsArithRefsValid<
    Args extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> = Steps["length"] extends 30
    ? true
    : Args extends [infer H extends string, ...infer Rest extends string[]]
        // The loose ref-scan inside `ExprColumnRefsValid` tokenizes (padding
        // operators itself) and only surfaces genuine column candidates, so each
        // argument — bare column, arithmetic, CASE, or aggregate-local `ORDER BY`
        // — is validated while literals/params/keywords stay lenient.
        ? Trim<H> extends infer TH extends string
            ? ExprColumnRefsValid<TH, Tables, Aliases, S> extends false
                ? false
                : ArgsArithRefsValid<Rest, Tables, Aliases, S, [any, ...Steps]>
            : ArgsArithRefsValid<Rest, Tables, Aliases, S, [any, ...Steps]>
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

// Maps a SQL cast target type name to its TypeScript type.
// Handles, in order: chained casts (`a::int::text` -> last type wins), array
// suffixes (`int[]` -> number[]), and finally a flat scalar mapping.
export type SqlTypeToTs<T extends string> =
    Trim<T> extends `${string}::${infer Rest}`
        ? SqlTypeToTs<Rest>
        : Trim<T> extends `${infer Base}[]`
            ? SqlScalarToTs<NormalizeTypeName<Base>>[]
            : SqlScalarToTs<NormalizeTypeName<T>>;

export type SqlScalarToTs<N extends string> =
    N extends "int" | "integer" | "bigint" | "smallint" | "numeric" | "decimal" | "real" | "double" | "float"
        | "int2" | "int4" | "int8" | "float4" | "float8"
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
                            : unknown;

export type NormalizeTypeName<S extends string> =
    CleanIdent<ExtractBefore<Trim<S>, "(">>;
