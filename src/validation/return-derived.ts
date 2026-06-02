// Derived-table & JOIN LATERAL / joined-derived result inference.
import type { AliasesInQuery, TablesInQuery } from "../tables.js";
import type { ApplyJoinNull, OuterCastTs, RefQualifier } from "../expressions.js";
import type { CleanIdent, ExtractAliasResult, ExtractFromClause, ExtractSelectList, SplitBalancedParen, SplitSelectList, Trim, TrimLeft } from "../parsing.js";
import type { DatabaseSchema } from "../schema.js";
import type { MergeRow, SelectReturnWith } from "./return-types.js";
import type { Simplify } from "../utils.js";
// The outer columns come from the subquery's projection rather than a real
// table, so the normal table/alias machinery yields `never`. Detect a single
// derived-table FROM, compute the subquery's row type, and resolve the outer
// select list against it.

export type DerivedTableMatch<N extends string> =
    Trim<ExtractFromClause<N>> extends `(${string}`
        ? SplitBalancedParen<Trim<ExtractFromClause<N>>> extends { inner: infer Body extends string; rest: infer Rest extends string }
            ? Trim<Body> extends `select ${string}`
                ? { body: Trim<Body>; alias: DerivedAliasName<Trim<Rest>> }
                : never
            : never
        : never;

export type DerivedAliasName<S extends string> =
    Trim<S> extends `as ${infer R}` ? DerivedFirstWord<Trim<R>> : DerivedFirstWord<Trim<S>>;

export type DerivedFirstWord<S extends string> =
    S extends `${infer W} ${string}` ? CleanIdent<W> : CleanIdent<S>;

// The subquery's projected row.
export type DerivedSubRow<Body extends string, S extends DatabaseSchema> =
    TablesInQuery<Body, S> extends infer SubTables extends string
        ? AliasesInQuery<Body, S> extends infer SubAliases extends string
            ? SelectReturnWith<ExtractSelectList<Body>, SubTables, SubAliases, S>
            : {}
        : {};

export type DerivedTableReturn<N extends string, S extends DatabaseSchema> =
    DerivedTableMatch<N> extends { body: infer Body extends string; alias: infer DAlias extends string }
        ? DerivedSubRow<Body, S> extends infer SubRow
            ? BuildDerivedReturn<SplitSelectList<ExtractSelectList<N>>, DAlias, SubRow>
            : {}
        : {};

export type BuildDerivedReturn<
    Exprs extends string[],
    DAlias extends string,
    SubRow,
    Acc = {},
    Steps extends any[] = []
> = Steps["length"] extends 100
    ? Simplify<Acc>
    : Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? BuildDerivedReturn<Rest, DAlias, SubRow, MergeRow<Acc, DerivedExprToObject<H, DAlias, SubRow>>, [any, ...Steps]>
        : Simplify<Acc>;

// `Nullable` carries the outer-join nullable-qualifier set. When the derived
// table is the nullable side of an outer join (`LEFT JOIN LATERAL (...) d`), its
// exposed columns must gain `| null` (Postgres: the whole derived row is NULL when
// the join doesn't match). Defaulted to `never` so the leading-derived callers that
// don't pass it are unaffected.
export type DerivedExprToObject<E extends string, DAlias extends string, SubRow, Nullable extends string = never> =
    ExtractAliasResult<E> extends { expr: infer RawExpr extends string; alias: infer OutAlias }
        ? [OutAlias] extends [never]
            ? CleanIdent<RawExpr> extends "*"
                ? SubRow
                : CleanIdent<RawExpr> extends `${DAlias}.*`
                    ? SubRow
                    : DerivedColKey<RawExpr, DAlias> extends infer K extends string
                        ? { [P in K]: ApplyJoinNull<DerivedProjType<RawExpr, K, SubRow>, RawExpr, Nullable> }
                        : Record<string, unknown>
            : OutAlias extends string
                ? { [P in OutAlias]: ApplyJoinNull<DerivedProjType<RawExpr, DerivedColKey<RawExpr, DAlias>, SubRow>, RawExpr, Nullable> }
                : Record<string, unknown>
        : Record<string, unknown>;

export type DerivedColKey<RawExpr extends string, DAlias extends string> =
    CleanIdent<RawExpr> extends `${DAlias}.${infer Col}` ? Col : CleanIdent<RawExpr>;

// Type of an outer projection over a derived subquery. A plain column ref takes
// its type from the subquery row; any other expression isn't a derived column,
// so we recover its type from an outer cast (`extract(...)::int`) when present,
// otherwise `unknown` (the conservative default for unmodeled expressions).
export type DerivedProjType<RawExpr extends string, Col extends string, SubRow> =
    Col extends keyof SubRow ? SubRow[Col] : OuterCastTs<RawExpr>;

export type DerivedColType<Col extends string, SubRow> =
    Col extends keyof SubRow ? SubRow[Col] : unknown;

// A derived subquery can also appear as a JOIN source — `... JOIN [LATERAL]
// (<subquery>) <alias> ON ...` — not only as a leading `FROM (...)`. In that case
// the normal table/alias machinery never registers `<alias>`, so a projected
// `<alias>.col` resolves to nothing and is dropped from the row. These helpers
// expose such a JOINed derived row under its alias and apply outer-join nullability.

// Drop a leading `LATERAL` modifier so the derived source `(...)` is reachable.
export type StripLeadingLateral<S extends string> =
    TrimLeft<S> extends `lateral ${infer R}` ? R : TrimLeft<S>;

// Find the subquery body of a derived table JOINed under `Alias`, scanning each
// ` join ` head. Returns `never` when no JOINed derived source carries that alias.
export type JoinedDerivedBody<N extends string, Alias extends string, Steps extends any[] = []> =
    Steps["length"] extends 30
        ? never
        : N extends `${infer _Before} join ${infer After}`
            ? StripLeadingLateral<After> extends infer Src extends string
                ? Trim<Src> extends `(${string}`
                    ? SplitBalancedParen<Trim<Src>> extends { inner: infer Body extends string; rest: infer Rest extends string }
                        ? Trim<Body> extends `select ${string}`
                            ? DerivedAliasName<Trim<Rest>> extends Alias
                                ? Trim<Body>
                                : JoinedDerivedBody<After, Alias, [any, ...Steps]>
                            : JoinedDerivedBody<After, Alias, [any, ...Steps]>
                        : JoinedDerivedBody<After, Alias, [any, ...Steps]>
                    : JoinedDerivedBody<After, Alias, [any, ...Steps]>
                : never
            : never;

// Whether the JOIN introducing the derived `Alias` makes its row nullable — i.e.
// the source sits on the nullable side of a LEFT or FULL [OUTER] JOIN. Returns
// `Alias` (the nullable-qualifier set for `ApplyJoinNull`) when so, else `never`.
// The token-based `NullableRelations` can't be used here: in its inlined token
// view the derived alias is separated from its `join` by the whole subquery body,
// so the alias is mis-attributed to the `lateral` modifier.
export type JoinedDerivedNullable<N extends string, Alias extends string, Steps extends any[] = []> =
    Steps["length"] extends 30
        ? never
        : N extends `${infer Before} join ${infer After}`
            ? StripLeadingLateral<After> extends infer Src extends string
                ? Trim<Src> extends `(${string}`
                    ? SplitBalancedParen<Trim<Src>> extends { inner: infer Body extends string; rest: infer Rest extends string }
                        ? Trim<Body> extends `select ${string}`
                            ? DerivedAliasName<Trim<Rest>> extends Alias
                                ? JoinModNullable<Before> extends true ? Alias : never
                                : JoinedDerivedNullable<After, Alias, [any, ...Steps]>
                            : JoinedDerivedNullable<After, Alias, [any, ...Steps]>
                        : JoinedDerivedNullable<After, Alias, [any, ...Steps]>
                    : JoinedDerivedNullable<After, Alias, [any, ...Steps]>
                : never
            : never;

// The join-keyword chain immediately precedes the matched ` join `. A trailing
// `left` / `full` (optionally `... outer`) marks the right-hand source nullable.
export type JoinModNullable<Before extends string> =
    StripTrailingOuter<Lowercase<Trim<Before>>> extends `${string} left` | "left" | `${string} full` | "full"
        ? true
        : false;

export type StripTrailingOuter<S extends string> =
    Trim<S> extends `${infer H} outer` ? Trim<H> : Trim<S>;

// Contribution of select-list exprs that reference a JOINed derived subquery,
// with outer-join nullability applied. Gated on the presence of a `(` after a
// ` join ` so ordinary queries pay nothing.
export type JoinedDerivedReturn<N extends string, S extends DatabaseSchema, _Nullable extends string> =
    N extends `${string} join ${string}(${string}`
        ? BuildJoinedDerivedReturn<SplitSelectList<ExtractSelectList<N>>, N, S>
        : {};

export type BuildJoinedDerivedReturn<
    Exprs extends string[],
    N extends string,
    S extends DatabaseSchema,
    Acc = {},
    Steps extends any[] = []
> = Steps["length"] extends 50
    ? Simplify<Acc>
    : Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? ExtractAliasResult<H> extends { expr: infer RawExpr extends string; alias: infer _OutAlias }
            ? RefQualifier<RawExpr> extends infer Q extends string
                ? [Q] extends [never]
                    ? BuildJoinedDerivedReturn<Rest, N, S, Acc, [any, ...Steps]>
                    : [JoinedDerivedBody<N, Q>] extends [infer Body extends string]
                        ? [Body] extends [never]
                            ? BuildJoinedDerivedReturn<Rest, N, S, Acc, [any, ...Steps]>
                            : BuildJoinedDerivedReturn<Rest, N, S, MergeRow<Acc, DerivedExprToObject<H, Q, DerivedSubRow<Body, S>, JoinedDerivedNullable<N, Q>>>, [any, ...Steps]>
                        : BuildJoinedDerivedReturn<Rest, N, S, Acc, [any, ...Steps]>
                : BuildJoinedDerivedReturn<Rest, N, S, Acc, [any, ...Steps]>
            : BuildJoinedDerivedReturn<Rest, N, S, Acc, [any, ...Steps]>
        : Simplify<Acc>;

// Common-table expression (single CTE): `WITH [RECURSIVE] <name>[(<cols>)] AS
// (<body>) SELECT <outer> FROM <name> ...`. The previous result path leaked the
// INNER CTE select list (greedy `with ${string} select` match), dropping the
