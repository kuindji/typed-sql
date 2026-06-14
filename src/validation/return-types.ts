// SELECT/RETURNING result inference + select-return assembly.
import type { AliasesInQuery, NullableRelations, TablesInQuery } from "../tables.js";
import type { AllTrue, MergeRow, Simplify } from "../utils.js";
import type { CleanIdent, ExtractAlias, ExtractAliasResult, ExtractReturningList, ExtractSelectList, SplitSelectList, StripSubqueries, Trim } from "../parsing.js";
import type { ColumnExists, DatabaseSchema } from "../schema.js";
import type { CteOuterQuery, CteReturn, MultiCteReturn, SingleCteMatch, WithDmlOuter } from "./cte.js";
import type { CteJoinOuterReturn } from "./cte-join.js";
import type { DerivedTableMatch, DerivedTableReturn, JoinedDerivedReturn } from "./return-derived.js";
import type { ExprToObject } from "../expressions.js";
import type { HasReturning, HasReturningQuoteAware, QueryKind } from "./dispatch.js";
export type GetReturnTypeNormalized<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? [WithDmlOuter<N>] extends [never]
                ? HasReturning<N> extends true
                    ? SelectReturnWith<ExtractReturningList<N>, Tables, Aliases, S>
                    : QueryKind<N> extends "select"
                        ? [SingleCteMatch<N>] extends [never]
                            ? [DerivedTableMatch<N>] extends [never]
                                ? OuterSelectReturn<N, Tables, Aliases, S>
                                : DerivedTableReturn<N, S>
                            : CteReturn<N, S>
                        : number
                : WithDmlReturn<N, Tables, Aliases, S>
            : number
        : number;

// Outer-projection row for a plain (non-CTE, non-derived) SELECT. The outer
// SELECT list — `*` included — can only reference outer-scope relations, never a
// table that exists solely inside a `WHERE ... (NOT) EXISTS (SELECT ... FROM
// other)` / scalar subquery. So the relations the projection resolves against are
// collected from a subquery-stripped view: `select * from t where exists (select
// 1 from u)` expands `*` to `t`'s columns only, not `t`'s AND `u`'s.
//
// EXCEPTION: a `WITH ... SELECT` that reaches this branch is the multi-CTE
// fallback (a single CTE is handled by `CteReturn`); that path deliberately
// resolves the projected CTE columns against the relations *inside* the CTE
// bodies, so it must keep the unstripped table set.
export type OuterSelectReturn<
    N extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    N extends `with ${string}`
        ? CteOuterQuery<N> extends infer Outer extends string
            ? Outer extends `${string} join ${string}`
                // CTE outer that JOINs: resolve the OUTER select list in a single
                // pass — each CTE-qualified ref against the CTE body its alias
                // points to (with outer-join nullability), and every other ref
                // (unqualified, or qualified by a base table like `ip` in a
                // CTE↔base join) against the base tables. `CteJoinOuterReturn`
                // reads `ExtractSelectList<Outer>` (the real outer list) — not
                // `<N>`, which would leak the first inner CTE's select list.
                ? Simplify<CteJoinOuterReturn<N, Outer, Tables, Aliases, S, NullableRelations<N, S>>>
                // Outer reads from a single CTE (no join): resolve as a derived
                // table so casts over CTE columns type precisely (via OuterCastTs)
                // instead of poisoning to `never`.
                : MultiCteReturn<Outer>
            : SelectReturnWith<ExtractSelectList<N>, Tables, Aliases, S, NullableRelations<N, S>>
        // A derived subquery JOINed under an alias (`... JOIN [LATERAL] (...) d`)
        // is invisible to the plain table/alias resolution, so its projected
        // `d.col` refs would be dropped. Merge their resolved (nullability-aware)
        // contribution on top of the normal row; `JoinedDerivedReturn` is `{}`
        // (a no-op merge) for any query without such a source.
        : StripSubqueries<N> extends infer Outer extends string
            ? TablesInQuery<Outer, S> extends infer OT extends string
                ? AliasesInQuery<Outer, S> extends infer OA extends string
                    ? WithJoinedDerived<N, S, SelectReturnWith<ExtractSelectList<N>, OT, OA, S, NullableRelations<N, S>>>
                    : WithJoinedDerived<N, S, SelectReturnWith<ExtractSelectList<N>, Tables, Aliases, S, NullableRelations<N, S>>>
                : WithJoinedDerived<N, S, SelectReturnWith<ExtractSelectList<N>, Tables, Aliases, S, NullableRelations<N, S>>>
            : WithJoinedDerived<N, S, SelectReturnWith<ExtractSelectList<N>, Tables, Aliases, S, NullableRelations<N, S>>>;

export type WithJoinedDerived<N extends string, S extends DatabaseSchema, Row> =
    Simplify<MergeRow<Row, JoinedDerivedReturn<N, S, NullableRelations<N, S>>>>;

// Result inference for a `WITH <cte> AS (...) <DML> ... RETURNING ...` statement:
// resolve the inner DML's RETURNING list against the query's tables. Only invoked
// when `WithDmlOuter<N>` is non-`never`, so the inner statement is a real DML.
export type WithDmlReturn<
    N extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    WithDmlOuter<N> extends infer Outer extends string
        ? HasReturningQuoteAware<Outer> extends true
            ? SelectReturnWith<ExtractReturningList<Outer>, Tables, Aliases, S>
            : number
        : number;

// Derived table (subquery in FROM): `SELECT ... FROM (<subquery>) alias`.


// Select / returning return type

export type SelectReturn<SelectList extends string, N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? SelectReturnWith<SelectList, Tables, Aliases, S>
            : unknown
        : unknown;

export type SelectReturnWith<
    SelectList extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string = never
> = BuildSelectReturn<SplitSelectList<SelectList>, Tables, Aliases, S, Nullable>;

export type BuildSelectReturn<
    Exprs extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string = never
> = MergeExprs<Exprs, Tables, Aliases, S, Nullable>;

// Project each expression to its column object INDEPENDENTLY into a tuple, then
// merge with a balanced pairwise reduction. A naive left fold nests one
// `Omit<Acc, …> &` per column, so resolving the final row needs a `keyof Acc`
// chain O(N) deep — on a wide (50+ column) SELECT that alone, plus the structural
// comparison a `RequireTrue<AssertExtends<…>>` test forces, crosses TS's depth-100
// guard (TS2589). The balanced merge keeps the merge tree O(log N) deep.
export type MergeExprs<
    Exprs extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string = never
> = Simplify<MergeAll<ColObjects<Exprs, Tables, Aliases, S, Nullable>>>;

// Per-expression column objects, in source order (capped at 100 columns).
type ColObjects<
    Exprs extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string,
    Acc extends any[] = []
> = Acc["length"] extends 100
    ? Acc
    : Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? ColObjects<Rest, Tables, Aliases, S, Nullable, [...Acc, ExprToObject<H, Tables, Aliases, S, Nullable>]>
        : Acc;

// Merge adjacent pairs, halving the tuple each round, until a single object
// remains. Resolution depth is O(log N), not O(N). The projection path uses an
// INFORMATIVENESS-preferring merge (`MergeRowProj`) for duplicate output
// aliases: when the same alias is projected by more than one SELECT expression
// — e.g. two mutually-exclusive `selectIf` branches both rendered into the
// maximal query — the MORE INFORMATIVE of the two column types is kept (see
// `PreferInformative`) instead of blindly taking the last. PairMerge is
// left-associative, so the merge folds in source order.
type PairMerge<T extends any[]> =
    T extends [infer A, infer B, ...infer Rest extends any[]]
        ? [MergeRowProj<A, B>, ...PairMerge<Rest>]
        : T;

type MergeAll<T extends any[]> =
    T extends []
        ? {}
        : T extends [infer Only]
            ? MergeRowProj<{}, Only>
            : MergeAll<PairMerge<T>>;

// `true` for the `unknown` top type only (a column whose type we couldn't infer).
// `[unknown] extends [T]` holds only when T is `unknown` (or `any`, which never
// reaches here from inference). Guard `never` first so `[never]` doesn't qualify.
type IsUnknown<T> = [T] extends [never] ? false : [unknown] extends [T] ? true : false;

// Of two types for the SAME duplicate output alias, pick the more informative:
//   - drop `unknown` in favour of any concrete type;
//   - otherwise prefer the one whose non-null BASE is strictly narrower
//     (e.g. a branded `User_id` over a plain `string`, ignoring `| null` on
//     either side so a nullable branded column still beats a non-null `string`);
//   - equal bases or incomparable types fall back to LAST-write-wins (`B`),
//     preserving the historical behaviour for genuinely distinct same-named
//     outputs (two different columns aliased identically).
type PreferInformative<A, B> =
    IsUnknown<A> extends true ? B
    : IsUnknown<B> extends true ? A
    : [NonNullable<A>] extends [NonNullable<B>]
        ? ([NonNullable<B>] extends [NonNullable<A>] ? B : A)
        : B;

// Projection-path merge: like `MergeRow` for non-overlapping keys, but a key
// present on BOTH sides is resolved by `PreferInformative` rather than last-wins.
export type MergeRowProj<Acc, Next> =
    [Next] extends [never] ? Acc
    : [Acc] extends [never] ? Next
    : {
        [K in keyof Acc | keyof Next]:
            K extends keyof Acc
                ? K extends keyof Next ? PreferInformative<Acc[K], Next[K]> : Acc[K]
                : K extends keyof Next ? Next[K] : never;
    };

// Select aliases (for ORDER BY / HAVING alias references)

export type SelectAliasesInQuery<N extends string> =
    QueryKind<N> extends "select"
        ? HasReturning<N> extends true
            ? SelectAliases<SplitSelectList<ExtractReturningList<N>>>
            : SelectAliases<SplitSelectList<ExtractSelectList<N>>>
        : never;

export type SelectAliasSet<N extends string> =
    NeedsSelectAliasResolution<N> extends true ? SelectAliasesInQuery<N> : never;

export type NeedsSelectAliasResolution<N extends string> =
    N extends `${string} order by ${infer OrderExpr}`
        ? OrderExpr extends `${string}.${string}`
            ? false
            : true
        : false;

export type RefScanSegment<N extends string> =
    QueryKind<N> extends "select"
        ? N extends `${string} from ${infer Rest}`
            ? `from ${Rest}`
            : N
        : N;

// The ref-scan segment up to (but not including) the LAST top-level ` order by `.
// This is the part where SELECT-list aliases are NOT resolvable.
export type RefScanBeforeOrderBy<N extends string> =
    RefScanSegment<N> extends infer Seg extends string
        ? Seg extends `${infer Before} order by ${string}`
            ? Before
            : Seg
        : N;

// The ` order by ...` slice of the ref-scan segment, where SELECT-list aliases
// ARE resolvable. Empty when there is no ORDER BY.
export type RefScanOrderBy<N extends string> =
    RefScanSegment<N> extends infer Seg extends string
        ? Seg extends `${string} order by ${infer After}`
            ? `order by ${After}`
            : ""
        : "";

export type SelectAliases<
    Exprs extends string[],
    Acc extends string = never,
    Steps extends any[] = []
> = Steps["length"] extends 140
    ? Acc
    : Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? ExtractAlias<H> extends { alias: infer Alias }
            // A non-aliased projection yields `alias: never`. Guard it in tuple
            // position: a NAKED `never extends string ?` arm collapses the whole
            // conditional (and with it the entire recursion) to `never`, silently
            // dropping every alias the list DOES define.
            ? [Alias] extends [never]
                ? SelectAliases<Rest, Acc, [any, ...Steps]>
                : Alias extends string
                    ? SelectAliases<Rest, Acc | Alias, [any, ...Steps]>
                    : SelectAliases<Rest, Acc, [any, ...Steps]>
            : SelectAliases<Rest, Acc, [any, ...Steps]>
        : Acc;

// Column lists

export type ColumnsExistInTable<Cols extends string[], TableKey extends string, S extends DatabaseSchema> =
    AllTrue<Cols[number] extends infer C ? (C extends string ? ColumnExists<TableKey, CleanIdent<C>, S> : true) : true>;

// ----------------------------------------------------------------------------
// Ungrouped-aggregate nullability post-pass
//
// SQL aggregates (except count) return NULL over EMPTY input. With GROUP BY
// every output row's group is non-empty, so argument nullability (handled in
// `FunctionReturn`) is the whole story. WITHOUT group by, the single output
// row is NULL for every aggregate when the source has zero rows — regardless
// of column nullability (`select sum(amount) from payments where user_id = $1`
// is NULL when nothing matches). This post-pass adds `| null` to
// whole-aggregate projections of ungrouped queries at the GetReturnType
// funnel.
//
// Lenient by design (missing `| null` in rare shapes is the accepted trade;
// falsely adding it to a grouped query is not):
// - only plain `select`-headed queries (a `with` query's ExtractSelectList
//   yields the CTE body's list, so CTE outer selects are skipped);
// - a ` group by ` ANYWHERE in the query (even a subquery's) skips the pass;
// - window applications (` over `) and aggregates nested under a non-aggregate
//   call head (`coalesce(sum(x), 0)` — correctly non-null!) don't match.

type AggFnName = "sum" | "avg" | "min" | "max" | "string_agg" | "array_agg" | "bool_and" | "bool_or";

export type ApplyUngroupedAggNull<Row, N extends string> =
    N extends `select ${string}`
        // Containment gate on the bare NAME (not `name(`): the call paren may
        // be space-separated (`array_agg ( name )`). Over-matching substrings
        // (`checksum`) is fine — `AggCallHead` is the precise check.
        ? N extends `${string}${AggFnName}${string}`
            ? N extends `${string} group by ${string}`
                ? Row
                : [Row] extends [object]
                    ? UngroupedAggKeys<SplitSelectList<ExtractSelectList<N>>> extends infer Keys extends string
                        ? [Keys] extends [never]
                            ? Row
                            : { [K in keyof Row]: K extends Keys ? Row[K] | null : Row[K] }
                        : Row
                    : Row
            : Row
        : Row;

type UngroupedAggKeys<Exprs extends string[], Acc extends string = never> =
    Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? UngroupedAggKeys<Rest, Acc | AggProjKey<H>>
        : Acc;

// The result key of a projection whose call head is a known aggregate:
// the alias when present, the function name otherwise (matching
// `FunctionKeyFromExpr` naming for unaliased projections).
type AggProjKey<E extends string> =
    ExtractAliasResult<E> extends { expr: infer X extends string; alias: infer A }
        ? AggCallHead<X> extends infer F extends string
            ? [F] extends [never]
                ? never
                : [A] extends [never]
                    ? F
                    : A extends string
                        ? A
                        : F
            : never
        : never;

// The aggregate name when the projection's call HEAD (the text before the
// FIRST paren) is a known aggregate and the expression is not a window
// application. Deliberately prefix-only — no trailing `)` requirement — so
// outer casts (`sum(...)::float8`) and trailing arithmetic (`sum(a) - sum(b)`,
// where NULL propagates anyway) still qualify; do NOT route through
// `StripOuterCast` here: it matches the LEFTMOST `::`, which an inner-arg cast
// (`sum(convert(p."amount"::numeric, …))::float8`) hijacks, truncating the
// expression. A non-aggregate head (`coalesce(...)`, `(select ...)`,
// `price * sum(b)`) yields never.
type AggCallHead<X extends string> =
    Trim<X> extends `${string} over ${string}`
        ? never
        : Trim<X> extends `${infer F}(${string}`
            ? Trim<F> extends AggFnName
                ? Trim<F>
                : never
            : never;
