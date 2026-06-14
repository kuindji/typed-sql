// Multi-CTE outer that JOINs CTEs: `WITH a AS (...), b AS (...) SELECT ...
// FROM a x JOIN b y ...`. The outer reads from MORE THAN ONE CTE via a join.
// Each outer projection ref (`x.col`) is resolved against the CTE body its
// alias points to, with outer-join nullability. Mirrors the joined-derived
// machinery (return-derived.ts) but the join sources are NAMED CTE relations,
// not inline subqueries — so instead of slicing a subquery body out of the
// FROM/JOIN text, we look the body up by name in the WITH list.
import type { CteName, StripRecursiveKw } from "./cte.js";
import type { DatabaseSchema } from "../schema.js";
import type { DerivedExprToObject, DerivedSubRow, JoinModNullable } from "./return-derived.js";
import type { ExprToObject, RefQualifier } from "../expressions.js";
import type { CleanIdent, ExtractAliasResult, ExtractFromClause, ExtractSelectList, SplitBalancedParen, SplitSelectList, Trim } from "../parsing.js";
import type { MergeRow, Simplify } from "../utils.js";

// The CTE body (the whole `AS (...)` inner text) for a given CTE name, walking
// the WITH list. `DerivedSubRow` later extracts its first SELECT term — which is
// the correct row even for a `UNION ALL` recursive body (anchor term).
export type CteBodyByName<N extends string, Name extends string> =
    StripRecursiveKw<N> extends `with ${infer AfterWith}`
        ? FindCteBody<Trim<AfterWith>, Name>
        : never;

export type FindCteBody<S extends string, Name extends string, Steps extends any[] = []> =
    Steps["length"] extends 30
        ? never
        : S extends `${infer Head} as ${infer Tail}`
            ? Trim<Tail> extends `(${string}`
                ? SplitBalancedParen<Trim<Tail>> extends { inner: infer Body extends string; rest: infer Rest extends string }
                    ? CteName<Trim<Head>> extends Name
                        ? Trim<Body>
                        : Trim<Rest> extends `, ${infer More}`
                            ? FindCteBody<Trim<More>, Name, [any, ...Steps]>
                            : never
                    : never
                : never
            : never;

// Keywords that can immediately follow a FROM/JOIN relation token. When the word
// after `<rel>` is one of these there is NO alias — the relation name is its own
// qualifier (`FROM a JOIN b ON ...` → `a` and `b` are both aliases).
type SourceKeyword =
    "on" | "using" | "left" | "right" | "full" | "inner" | "cross" | "outer"
    | "join" | "where" | "group" | "order" | "limit" | "having" | "natural";

// First whitespace-delimited word of a token run.
type FirstWord<S extends string> = S extends `${infer W} ${string}` ? W : S;

// Last whitespace-delimited word of a token run (the trailing join modifier of a
// source: `a x left` → `left`). Step-capped for safety on long sources.
type LastWord<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 40
        ? Trim<S>
        : Trim<S> extends `${string} ${infer R}`
            ? LastWord<R, [any, ...Steps]>
            : Trim<S>;

// Resolve a single FROM/JOIN source token run to its relation name + alias.
//   `a`            → { rel: a; alias: a }
//   `a x`          → { rel: a; alias: x }
//   `a as x`       → { rel: a; alias: x }
//   `b on a.id...` → { rel: b; alias: b }  (next word is a keyword → no alias)
type SourceRelAlias<Src extends string> =
    Trim<Src> extends `${infer Rel} ${infer After}`
        ? Trim<After> extends `as ${infer A2}`
            ? { rel: CleanIdent<Rel>; alias: CleanIdent<FirstWord<Trim<A2>>> }
            : Lowercase<FirstWord<Trim<After>>> extends SourceKeyword
                ? { rel: CleanIdent<Rel>; alias: CleanIdent<Rel> }
                : { rel: CleanIdent<Rel>; alias: CleanIdent<FirstWord<Trim<After>>> }
        : { rel: CleanIdent<Trim<Src>>; alias: CleanIdent<Trim<Src>> };

// Map an outer qualifier `Q` to the CTE relation name it refers to, by scanning
// the outer FROM + JOIN sources (split on ` join `).
export type CteAliasToName<Outer extends string, Q extends string> =
    ScanCteSources<Trim<ExtractFromClause<Outer>>, Q>;

export type ScanCteSources<F extends string, Q extends string, Steps extends any[] = []> =
    Steps["length"] extends 30
        ? never
        : F extends `${infer Src} join ${infer Rest}`
            ? SourceRelAlias<Src> extends { rel: infer Rel extends string; alias: infer A extends string }
                ? A extends Q ? Rel : ScanCteSources<Rest, Q, [any, ...Steps]>
                : ScanCteSources<Rest, Q, [any, ...Steps]>
            : SourceRelAlias<F> extends { rel: infer Rel extends string; alias: infer A extends string }
                ? A extends Q ? Rel : never
                : never;

// Whether the join that introduces qualifier `Q`'s source is a LEFT/FULL join
// (so the CTE's columns gain `| null`). `PrevMod` is the trailing modifier word
// of the PREVIOUS source — the keyword sitting before this source's ` join `
// (`a x left join b y` splits to `a x left` + `b y`, so `b`'s modifier is
// `left`). The leading FROM source has `PrevMod = ""` → never nullable.
export type CteAliasNullable<Outer extends string, Q extends string> =
    ScanCteNullable<Trim<ExtractFromClause<Outer>>, Q, "">;

export type ScanCteNullable<F extends string, Q extends string, PrevMod extends string, Steps extends any[] = []> =
    Steps["length"] extends 30
        ? never
        : F extends `${infer Src} join ${infer Rest}`
            ? SourceRelAlias<Src> extends { alias: infer A extends string }
                ? A extends Q
                    ? JoinModNullable<PrevMod> extends true ? Q : never
                    : ScanCteNullable<Rest, Q, LastWord<Src>, [any, ...Steps]>
                : ScanCteNullable<Rest, Q, LastWord<Src>, [any, ...Steps]>
            : SourceRelAlias<F> extends { alias: infer A extends string }
                ? A extends Q
                    ? JoinModNullable<PrevMod> extends true ? Q : never
                    : never
                : never;

// Result row for a multi-CTE outer that JOINs CTEs (or a CTE↔base join).
// `Outer` is the pre-stripped outer query (`CteOuterQuery<N>`); `N` is the full
// statement (for CTE-body lookup); `Tables`/`Aliases`/`Nullable` are the
// query's resolved base relations + join-nullability, used to resolve the
// non-CTE projections (unqualified refs and base-table-qualified refs).
//
// SINGLE PASS: each outer projection is resolved exactly once — a CTE-qualified
// ref against its CTE body (`DerivedExprToObject`), everything else against the
// base tables (`ExprToObject`, the same path the plain SELECT row uses). The
// earlier design resolved the WHOLE list twice (a base `SelectReturnWith` plus
// this overlay) and merged; the base pass was pure waste for CTE refs, since the
// overlay always won. Folding the base path in here drops that redundancy.
export type CteJoinOuterReturn<
    N extends string,
    Outer extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string = never
> = BuildCteJoinReturn<SplitSelectList<ExtractSelectList<Outer>>, N, Outer, Tables, Aliases, S, Nullable>;

// Resolve a single non-CTE projection against the base tables. Used for an
// unqualified ref (`count(*)`, a literal), and for a qualifier that names a base
// table rather than a CTE (the `ip` side of a CTE↔base join).
type CteJoinBaseProj<
    H extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string,
    Acc
> = MergeRow<Acc, ExprToObject<H, Tables, Aliases, S, Nullable>>;

export type BuildCteJoinReturn<
    Exprs extends string[],
    N extends string,
    Outer extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string,
    Acc = {},
    Steps extends any[] = []
> = Steps["length"] extends 50
    ? Simplify<Acc>
    : Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? ExtractAliasResult<H> extends { expr: infer RawExpr extends string; alias: infer _OutAlias }
            ? RefQualifier<RawExpr> extends infer Q extends string
                ? [Q] extends [never]
                    // Unqualified ref / literal / function — base-resolve.
                    ? BuildCteJoinReturn<Rest, N, Outer, Tables, Aliases, S, Nullable, CteJoinBaseProj<H, Tables, Aliases, S, Nullable, Acc>, [any, ...Steps]>
                    : CteAliasToName<Outer, Q> extends infer Name extends string
                        ? [Name] extends [never]
                            // Qualifier matches no outer source — base-resolve (lenient).
                            ? BuildCteJoinReturn<Rest, N, Outer, Tables, Aliases, S, Nullable, CteJoinBaseProj<H, Tables, Aliases, S, Nullable, Acc>, [any, ...Steps]>
                            : CteBodyByName<N, Name> extends infer Body extends string
                                ? [Body] extends [never]
                                    // Qualifier names a base-table source, not a CTE — base-resolve.
                                    ? BuildCteJoinReturn<Rest, N, Outer, Tables, Aliases, S, Nullable, CteJoinBaseProj<H, Tables, Aliases, S, Nullable, Acc>, [any, ...Steps]>
                                    // Qualifier names a CTE — resolve the ref against the CTE body.
                                    : BuildCteJoinReturn<Rest, N, Outer, Tables, Aliases, S, Nullable, MergeRow<Acc, DerivedExprToObject<H, Q, DerivedSubRow<Body, S>, CteAliasNullable<Outer, Q>>>, [any, ...Steps]>
                                : BuildCteJoinReturn<Rest, N, Outer, Tables, Aliases, S, Nullable, Acc, [any, ...Steps]>
                        : BuildCteJoinReturn<Rest, N, Outer, Tables, Aliases, S, Nullable, Acc, [any, ...Steps]>
                : BuildCteJoinReturn<Rest, N, Outer, Tables, Aliases, S, Nullable, Acc, [any, ...Steps]>
            : BuildCteJoinReturn<Rest, N, Outer, Tables, Aliases, S, Nullable, Acc, [any, ...Steps]>
        : Simplify<Acc>;
