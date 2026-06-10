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
                                ? { [K in Key]: ApplyProjectionNull<ExprType<RawExpr, Tables, Aliases, S>, RawExpr, Tables, Aliases, S, Nullable> }
                                : Record<string, unknown>
                            : Record<string, unknown>
                : Alias extends string
                        ? { [K in Alias]: ApplyProjectionNull<ExprType<RawExpr, Tables, Aliases, S>, RawExpr, Tables, Aliases, S, Nullable> }
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

// Projection-level nullability dispatcher. Plain column refs go through
// `ApplyJoinNull` (qualifier-in-nullable-set check). A `coalesce(...)` projection
// (optionally wrapped in an outer cast like `coalesce(...)::text`) hides its column
// refs from `RefQualifier`, so `ApplyJoinNull` can never see them — we handle it
// here instead. SQL: `coalesce(a, b, c)` is NULL only when EVERY argument is NULL,
// so the projection gains `| null` only when all args are nullable (an outer-join
// nullable qualifier OR an already-nullable base type). A non-null literal
// (`coalesce(o.x, '')`) keeps the result non-null. `T` is the already-computed
// projection type (for the cast case, the cast's target type); we only add `| null`.
export type ApplyProjectionNull<
    T,
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string
> =
    CleanExpr<StripOuterCast<E>> extends `coalesce(${infer Args})`
        ? CoalesceAllArgsNullable<SplitTopLevel<Args>, Tables, Aliases, S, Nullable> extends true
            ? T | null
            : T
        : ApplyJoinNull<T, E, Nullable>;

// True only when every coalesce argument is nullable. An empty/exhausted list is
// vacuously `true`, but the wrapper above only reaches this for a real coalesce call
// (at least one arg). Recursion is depth-capped like the other arg walkers.
export type CoalesceAllArgsNullable<
    Args extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string,
    Steps extends any[] = []
> = Steps["length"] extends 30
    ? true
    : Args extends [infer H extends string, ...infer Rest extends string[]]
        ? CoalesceArgNullable<H, Tables, Aliases, S, Nullable> extends true
            ? CoalesceAllArgsNullable<Rest, Tables, Aliases, S, Nullable, [any, ...Steps]>
            : false
        : true;

// A single coalesce argument is nullable when its qualifier is in the outer-join
// nullable set (`ri.sku` under `left join ... ri`), or — failing that — when its
// base type already admits `null` (a base-nullable column, or an unresolved
// `unknown` arg). A non-null literal resolves to a non-null base type -> `false`.
export type CoalesceArgNullable<
    Arg extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string
> =
    RefQualifier<Arg> extends infer Q extends string
        ? [Q] extends [never]
            ? null extends ExprType<Arg, Tables, Aliases, S>
                ? true
                : false
            : Q extends Nullable
                ? true
                : null extends ExprType<Arg, Tables, Aliases, S>
                    ? true
                    : false
        : null extends ExprType<Arg, Tables, Aliases, S>
            ? true
            : false;

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
        // Pre-gate: `HasTopLevelCompare`'s only `true` branch requires a
        // `<`/`>`/`=`/`!` char; if `CE` contains none, the answer is `false` without
        // the char-walk. Cheap template test short-circuits the common no-comparison
        // projection (a bare column / function call). Must list all four chars the
        // walk's true branch matches.
        : CE extends `${string}${"<" | ">" | "=" | "!"}${string}`
            ? HasTopLevelCompare<CE>
            : false;

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

// Strip a redundant fully-wrapping paren pair, repeatedly: `((expr))` and
// `((case ...)::text)` -> the inner expression whose parens wrap the WHOLE
// thing. Without this an outer operator hidden by a redundant wrap (e.g. the
// `::text` in `((case ...)::text)`) is not seen as top-level, so the cast is
// missed and the expression misparses (empty-function) to `unknown`.
//   - A subquery `(select ...)` KEEPS its parens — its detection relies on them.
//   - A trailing operator after the matching close (`(a)::int`, `(a) + b`) means
//     the parens do NOT wrap the whole expression (`rest != ""`), so it is left
//     as-is and the real outer operator is handled normally.
type UnwrapRedundantParens<E extends string, Steps extends any[] = []> =
    Steps["length"] extends 12
        ? E
        : E extends `(select ${string})`
            ? E
            : E extends `(${string}`
                ? SplitBalancedParen<E> extends { inner: infer Inner extends string; rest: "" }
                    ? UnwrapRedundantParens<Trim<Inner>, [any, ...Steps]>
                    : E
                : E;

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
            : UnwrapRedundantParens<CleanExpr<E>> extends infer CE extends string
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
                        // A CASE expression is always `unknown` by design (the
                        // THEN/ELSE branch type is not inferred). Short-circuit here
                        // BEFORE the function/operator cascade so a large
                        // `(case when count(distinct <big expr>) ... end)` is not
                        // fully resolved (incl. its aggregate args) just to arrive at
                        // `unknown` — that resolution is pure cost that starves the
                        // per-query instantiation budget on wide SELECTs. A CASE with
                        // an OUTER cast (`(case ...)::text`) does NOT match here (it
                        // ends in the type name, not `)`), so it still takes its cast
                        // type via the branch below.
                        : IsCaseExpr<CE> extends true
                            ? unknown
                        : [OuterCastName<CE>] extends [never]
                            // No TOP-LEVEL `::` cast: any `::` present is nested
                            // inside a function/paren arg (e.g. `f(a::int)`, or the
                            // inner casts of `sum(g(x::numeric))::float8`), so the
                            // cast is not the outer operator — fall through to the
                            // cast(...)/function/operator cascade below.
                            ? CE extends `cast(${infer Inner} as ${infer CastTypeName})`
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
                                            : CE extends `${number}`
                                                ? number
                                                : CE extends "true"
                                                    ? boolean
                                                    : CE extends "false"
                                                        ? boolean
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
                            // A genuine TOP-LEVEL `::T` cast. As with the JSON-text
                            // operators, a `->>` / `#>>` to the right of the cast type
                            // name means the cast is NOT the outermost operator — the
                            // JSON text extraction is, yielding `string`.
                            : OuterCastName<CE> extends `${string}->>${string}`
                                ? string
                                : OuterCastName<CE> extends `${string}#>>${string}`
                                    ? string
                                    // The `extends never` guard exists only to surface a
                                    // BARE invalid column (`not_a_col::text` -> never).
                                    // Run it only when the cast's inner is a simple ref;
                                    // for a COMPOUND inner (`sum(...)::float8`,
                                    // `(bool_and(...) ...)::boolean`) take the cast type
                                    // directly — fully type-resolving such inners just to
                                    // check `never` is a large, needless instantiation
                                    // cost (it starves the per-query budget so later
                                    // projections in a wide SELECT bail to `never`), and
                                    // hidden bad refs are caught by the SELECT-list
                                    // validator, not here.
                                    : CastInnerIsSimpleRef<OuterCastInner<CE>> extends true
                                        ? ExprType<OuterCastInner<CE>, Tables, Aliases, S, [any, ...Steps]> extends never
                                            ? never
                                            : SqlTypeToTs<OuterCastName<CE>>
                                        : SqlTypeToTs<OuterCastName<CE>>
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

// The TS type implied by an expression's OUTER cast (`expr::int`,
// `cast(expr as int)`), if any. Mirrors `ExprType`'s cast detection but is
// self-contained — used where the full `ExprType` context isn't available
// (e.g. typing an outer projection over a derived subquery, whose column refs
// resolve against the subquery row, not the schema). Returns `unknown` when
// there is no outer cast or the cast target doesn't map to a known scalar, so
// callers that fall back to `unknown` are never made worse.
export type OuterCastTs<E extends string> =
    CleanExpr<E> extends `${string}::${infer CastName}`
        ? SqlTypeToTs<CastName>
        : CleanExpr<E> extends `cast(${string} as ${infer CastName})`
            ? SqlTypeToTs<CastName>
            : CleanExpr<E> extends `cast (${string} as ${infer CastName})`
                ? SqlTypeToTs<CastName>
                : unknown;

// --- Top-level (outer) `::` cast detection --------------------------------
// A `::T` cast is the OUTER operator of an expression only when it sits at paren
// depth 0. Splitting at the LEFTMOST `::` (the naive `${infer Inner}::${infer T}`)
// is wrong for casts nested in call args: `sum(g(x::numeric))::float8` would split
// at `::numeric`, leaving the unbalanced `sum(g(x` as the inner expr (which types
// to `never`) and poisoning the whole projection. Cheap top-level signal: scanning
// `::` left-to-right, the type-name part of a TOP-LEVEL cast contains no `)` — a
// `)` after the `::` means an unclosed `(` precedes it, so that `::` is nested.
//
// `OuterCastName<E>` -> the outer cast's type-name (possibly chained, e.g.
// `int::text`, which `SqlTypeToTs` resolves last-wins), or `never` when there is
// no top-level cast. `OuterCastInner<E>` -> `E` with that outer cast stripped, with
// any inner casts preserved.
//
// A `::` is NESTED (not the outer operator) when the text to its right has an
// UNMATCHED closing paren — a `)` with no `(` before it (the `)` closes a `(` that
// opened to the LEFT of the `::`). A parameterized type name such as
// `numeric(10,2)` has its `(` BEFORE the `)`, so it is NOT flagged and the cast
// stays top-level.
type CastAfterIsNested<After extends string> =
    After extends `${infer P})${string}`
        ? P extends `${string}(${string}`
            ? false
            : true
        : false;

export type OuterCastName<E extends string> =
    E extends `${string}::${infer After}`
        ? CastAfterIsNested<After> extends true
            ? OuterCastName<After>
            : After
        : never;

export type OuterCastInner<E extends string, Acc extends string = ""> =
    E extends `${infer A}::${infer After}`
        ? CastAfterIsNested<After> extends true
            ? OuterCastInner<After, `${Acc}${A}::`>
            : `${Acc}${A}`
        : E;

// A cast's inner expression is a "simple ref" — a bare (optionally qualified /
// quoted) column or identifier — when, after trimming, it contains no `(` (no
// call / paren group) and no space (no operator / compound expression). Only then
// is the invalid-bare-column `extends never` guard meaningful (and cheap); a
// compound inner takes its cast type directly.
export type CastInnerIsSimpleRef<I extends string> =
    Trim<I> extends `${string}(${string}`
        ? false
        : Trim<I> extends `${string} ${string}`
            ? false
            : true;

// A top-level CASE expression — `case ...`, optionally wrapped in balanced parens
// (`(case ... end)`). Used to short-circuit CASE typing to `unknown` (its design
// result) without resolving the branches/aggregate args.
export type IsCaseExpr<E extends string> =
    Trim<E> extends `case ${string}`
        ? true
        : Trim<E> extends `(${infer Inner})`
            ? IsCaseExpr<Inner>
            : false;
