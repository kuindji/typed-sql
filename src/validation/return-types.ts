// SELECT/RETURNING result inference + select-return assembly.
import type { AliasesInQuery, NullableRelations, TablesInQuery } from "../tables.js";
import type { AllTrue, Simplify } from "../utils.js";
import type { CleanIdent, ExtractAlias, ExtractReturningList, ExtractSelectList, SplitSelectList, StripSubqueries } from "../parsing.js";
import type { ColumnExists, DatabaseSchema } from "../schema.js";
import type { CteOuterQuery, CteReturn, MultiCteReturn, SingleCteMatch, WithDmlOuter } from "./cte.js";
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
                // CTE outer that JOINs (CTE↔CTE or CTE↔base): outer cols are
                // CTE-qualified (`a.id`) and the CTE rows aren't modeled, so the
                // derived-table path can't resolve them. Keep the prior lenient
                // behavior (resolve the first inner select list against the base
                // table set) — unchanged, to avoid regressing those queries.
                ? SelectReturnWith<ExtractSelectList<N>, Tables, Aliases, S, NullableRelations<N, S>>
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

// Merge adjacent pairs (later wins), halving the tuple each round, until a single
// object remains. Resolution depth is O(log N), not O(N).
type PairMerge<T extends any[]> =
    T extends [infer A, infer B, ...infer Rest extends any[]]
        ? [MergeRow<A, B>, ...PairMerge<Rest>]
        : T;

type MergeAll<T extends any[]> =
    T extends []
        ? {}
        : T extends [infer Only]
            ? MergeRow<{}, Only>
            : MergeAll<PairMerge<T>>;

// Merge a "later" column object into an "earlier" one, last write wins: a
// duplicate output alias keeps the later column's type instead of intersecting
// (which would collapse two differing same-named outputs to never). Either side
// may be `never` (an expression that projects nothing) — guard both.
export type MergeRow<Acc, Next> =
    [Next] extends [never] ? Acc
    : [Acc] extends [never] ? Next
    : Omit<Acc, keyof Next> & Next;

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
            ? Alias extends string
                ? SelectAliases<Rest, Acc | Alias, [any, ...Steps]>
                : SelectAliases<Rest, Acc, [any, ...Steps]>
            : SelectAliases<Rest, Acc, [any, ...Steps]>
        : Acc;

// Column lists

export type ColumnsExistInTable<Cols extends string[], TableKey extends string, S extends DatabaseSchema> =
    AllTrue<Cols[number] extends infer C ? (C extends string ? ColumnExists<TableKey, CleanIdent<C>, S> : true) : true>;
