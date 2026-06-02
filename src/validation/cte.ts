// CTE name collection, CTE/WITH-DML result inference.
import type { BuildDerivedReturn, DerivedSubRow } from "./return-derived.js";
import type { CleanIdent, ExtractAliasResult, ExtractFromClause, ExtractSelectList, ReplaceWhitespace, SplitBalancedParen, SplitCommaSimple, SplitSelectList, Trim } from "../parsing.js";
import type { DatabaseSchema } from "../schema.js";
import type { QueryKind } from "./dispatch.js";
import type { Simplify, UnionToIntersection } from "../utils.js";
import type { TableKeyFromToken } from "../tables.js";
// outer projection, output aliases and the `t(a,b)` column-alias list. We parse
// the CTE deterministically and resolve the outer projection against the CTE's
// row — treating the CTE name like a derived-table alias. Multi-CTE queries
// (outer doesn't immediately follow the first balanced group) and CTE+join
// outers fall back to the old behavior rather than risk a wrong shape.
export type StripRecursiveKw<N extends string> =
    N extends `with recursive ${infer R}` ? `with ${R}` : N;

export type SingleCteMatch<N extends string> =
    StripRecursiveKw<N> extends `with ${infer AfterWith}`
        ? AfterWith extends `${infer Head} as ${infer Tail}`
            ? Trim<Tail> extends `(${string}`
                ? SplitBalancedParen<Trim<Tail>> extends { inner: infer Body extends string; rest: infer Rest extends string }
                    ? Trim<Rest> extends `select ${string}`
                        ? Trim<Rest> extends `${string} join ${string}`
                            ? never
                            : Trim<Body> extends `select ${string}`
                                ? {
                                    body: Trim<Body>;
                                    outer: Trim<Rest>;
                                    name: CteName<Trim<Head>>;
                                    cols: CteCols<Trim<Head>>;
                                  }
                                : never
                        : never
                    : never
                : never
            : never
        : never;

export type CteName<Head extends string> =
    Head extends `${infer Name}(${string}` ? CleanIdent<Trim<Name>> : CleanIdent<Head>;

// Names declared by a leading `WITH [RECURSIVE] a AS (...), b AS (...) ...`
// clause. These are query-local relation names, not base tables, so the
// table-existence check must not reject them. Body parens are skipped via
// `SplitBalancedParen` so an inner ` as ` (a column alias) is never mistaken for
// a CTE boundary. Non-WITH queries resolve to `never` (a no-op exclude).
export type CteNames<N extends string> =
    StripRecursiveKw<N> extends `with ${infer AfterWith}`
        ? CollectCteNames<Trim<AfterWith>>
        : never;

export type CollectCteNames<S extends string, Acc extends string = never> =
    S extends `${infer Head} as ${infer Tail}`
        ? Trim<Tail> extends `(${string}`
            ? SplitBalancedParen<Trim<Tail>> extends { rest: infer Rest extends string }
                ? Trim<Rest> extends `, ${infer More}`
                    ? CollectCteNames<Trim<More>, Acc | CteName<Trim<Head>>>
                    : Acc | CteName<Trim<Head>>
                : Acc | CteName<Trim<Head>>
            : Acc
        : Acc;

// The OUTER query of a `WITH a AS (...), b AS (...) <outer>` statement: the tail
// that follows the last comma-separated CTE definition. Mirrors `CollectCteNames`'
// balanced-paren walk over the CTE list, but instead of collecting names it
// returns whatever remains after the final CTE body — i.e. the top-level
// `SELECT ... FROM ...`. Used by the multi-CTE result path so the OUTER projection
// is inferred, not the first inner CTE's select list (which a naive
// `${_}select ${After}` match would grab). Falls back to `N` when the query isn't
// a `WITH`, and to `""` when the CTE list can't be parsed.
// `ReplaceWhitespace` (in `NormalizeQuery`) is step-capped, so on a long multi-CTE
// query the OUTER select — which sits past the cap, at the very end — can keep its
// raw `\n`/`\t`. `ExtractSelectList` matches `select ` with a literal space, so we
// re-collapse whitespace on the (short) extracted outer before handing it on.
export type CteOuterQuery<N extends string> =
    StripRecursiveKw<N> extends `with ${infer AfterWith}`
        ? ReplaceWhitespace<CollectCteOuter<Trim<AfterWith>>>
        : N;

export type CollectCteOuter<S extends string> =
    S extends `${infer _Head} as ${infer Tail}`
        ? Trim<Tail> extends `(${string}`
            ? SplitBalancedParen<Trim<Tail>> extends { rest: infer Rest extends string }
                ? Trim<Rest> extends `, ${infer More}`
                    ? CollectCteOuter<Trim<More>>
                    : Trim<Rest>
                : ""
            : ""
        : "";

// The first FROM relation token (alias-less) of a stripped outer query. Used as
// the derived-table qualifier when resolving a multi-CTE outer projection.
export type CteOuterFromName<Outer extends string> =
    Trim<ExtractFromClause<Outer>> extends `${infer Rel} ${string}`
        ? CleanIdent<Rel>
        : CleanIdent<Trim<ExtractFromClause<Outer>>>;

// Result row for a multi-CTE `SELECT` whose OUTER query reads from a single CTE
// (no join into base tables). The CTE's columns aren't modeled as a schema
// relation, so resolving the outer projection with the normal `ExprType` path
// would fail every ref to `never` (and poison casts over them). Instead we treat
// the CTE like a derived table and reuse `BuildDerivedReturn`/`DerivedProjType`:
// a `expr::cast` projection recovers its type from the OUTER cast (`OuterCastTs`),
// and any other ref falls back to `unknown` (conservative default — we don't
// model the CTE row). The empty sub-row means bare CTE-column projections are
// `unknown` rather than their true type; casts (the common rollup shape, e.g.
// `avg(x)::int`) are typed precisely.
export type MultiCteReturn<Outer extends string> =
    BuildDerivedReturn<SplitSelectList<ExtractSelectList<Outer>>, CteOuterFromName<Outer>, {}>;

// The normalized table keys for every declared CTE name, so they can be
// `Exclude`d from the collected FROM tables before the existence check.
export type CteTableKeys<N extends string, S extends DatabaseSchema> =
    [CteNames<N>] extends [never] ? never : TableKeyFromToken<CteNames<N>, S>;

// FROM/JOIN tables with the query-local CTE relation names removed.
export type NonCteTables<N extends string, S extends DatabaseSchema, Tables extends string> =
    Exclude<Tables, CteTableKeys<N, S>>;

// A `WITH <cte> AS (...) <UPDATE|INSERT|DELETE> ...` statement: the inner
// data-modifying statement after a SINGLE leading CTE. Result inference for these
// must follow the top-level DML's RETURNING list, not the CTE body's projection.
// Multi-CTE chains fall back to `never` (handled by the existing select path).
export type WithDmlOuter<N extends string> =
    StripRecursiveKw<N> extends `with ${infer AfterWith}`
        ? AfterWith extends `${infer _Head} as ${infer Tail}`
            ? Trim<Tail> extends `(${string}`
                ? SplitBalancedParen<Trim<Tail>> extends { rest: infer Rest extends string }
                    ? Trim<Rest> extends infer R extends string
                        ? QueryKind<R> extends "update" | "insert" | "delete"
                            ? R
                            : never
                        : never
                    : never
                : never
            : never
        : never;

export type CteCols<Head extends string> =
    Head extends `${string}(${infer Cols})${string}`
        ? FilterCteCols<SplitCommaSimple<Cols>>
        : [];

export type FilterCteCols<Cols extends string[], Acc extends string[] = []> =
    Cols extends [infer C extends string, ...infer Rest extends string[]]
        ? CleanIdent<C> extends ""
            ? FilterCteCols<Rest, Acc>
            : FilterCteCols<Rest, [...Acc, CleanIdent<C>]>
        : Acc;

export type CteReturn<N extends string, S extends DatabaseSchema> =
    SingleCteMatch<N> extends {
        body: infer Body extends string;
        outer: infer Outer extends string;
        name: infer Name extends string;
        cols: infer Cols extends string[];
    }
        ? CteRow<Body, Cols, S> extends infer Row
            ? BuildDerivedReturn<SplitSelectList<ExtractSelectList<Outer>>, Name, Row>
            : {}
        : {};

// The CTE's projected row. Without a column-alias list it's just the body's
// projection; with `t(a, b)` the body columns are positionally renamed.
export type CteRow<Body extends string, Cols extends string[], S extends DatabaseSchema> =
    DerivedSubRow<Body, S> extends infer BaseRow
        ? Cols extends []
            ? BaseRow
            : RenameRow<SplitSelectList<ExtractSelectList<Body>>, Cols, BaseRow>
        : {};

// Positionally pair each `t(a, b)` output column with the body's i-th projected
// expression. Implemented as a single shallow mapped type (no recursive
// intersection accumulation) to keep the CTE col-list path cheap — the recursive
// form tipped TS's cumulative instantiation budget over on the full suite.
export type RenameRow<BodyExprs extends string[], Cols extends string[], BaseRow> =
    Simplify<UnionToIntersection<
        {
            [I in keyof Cols]: Cols[I] extends string
                ? {
                    [P in Cols[I]]: I extends keyof BodyExprs
                        ? BodyExprs[I] extends string
                            ? CteBodyColType<BodyExprs[I], BaseRow>
                            : unknown
                        : unknown
                  }
                : {}
        }[number]
    >>;

export type CteBodyColKey<E extends string> =
    ExtractAliasResult<E> extends { expr: infer Raw extends string; alias: infer A }
        ? [A] extends [never] ? CleanIdent<Raw> : A
        : CleanIdent<E>;

export type CteBodyColType<E extends string, BaseRow> =
    CteBodyColKey<E> extends infer K extends string
        ? K extends keyof BaseRow ? BaseRow[K] : unknown
        : unknown;
