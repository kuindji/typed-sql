import type { DatabaseSchema, ColumnExists } from "./schema.js";
import type {
    ColumnRefValidLooseWith,
    IsSimpleRefPart,
    QualifiedColumnRefs,
    ResolveAlias,
    TableKeysByName,
    TablesWithColumn,
    UnqualifiedColumnRefs,
    UnqualifiedColumnValid
} from "./columns.js";
import type { ApplyJoinNull, ExprToObject, ExprsValidList, OuterCastTs, RefQualifier } from "./expressions.js";
import type {
    ExtractAlias,
    ExtractConflictColumns,
    ExtractConflictUpdateExcludedCols,
    ExtractConflictUpdateSetColumns,
    ExtractInsertColumns,
    ExtractReturningList,
    ExtractSelectList,
    ExtractFromClause,
    ExtractLastWhere,
    ExtractAliasResult,
    ExtractBefore,
    ExtractCallParenBodies,
    ValidationScanView,
    DQuoteSpaceSentinel,
    ReplaceAll,
    ExceedsLengthBudget,
    HasLineBreaks,
    ReplaceWhitespace,
    SplitBalancedParen,
    StripSubqueries,
    SplitCommaSimple,
    ExtractUpdateSetColumns,
    SplitSelectList,
    TokenizeLoose,
    CleanIdent,
    Trim,
    TrimLeft
} from "./parsing.js";
import type {
    AliasesInQuery,
    InsertTargetTable,
    NullableRelations,
    TableKeyFromToken,
    TableKeyValid,
    TablesInQuery,
    UpdateTargetTable
} from "./tables.js";
import type { And, AllTrue, IsUnion, Simplify, StartsWith, UnionToIntersection } from "./utils.js";

// Core validation / inference

// Validate against a quote-neutralised view of the query (string literal / quoted
// alias text never carries column refs or real clauses — round-12 S1–S5, A1), but
// ONLY for small quoted queries: the neutralisation char-walk would blow the depth
// budget on report-scale queries, and a no-quote query has nothing to neutralise.
// The neutralised view is computed once here (top level) so it resolves to a
// concrete string before dispatch and never compounds with validation depth. The
// result path is unaffected, so literal value types still infer from the original.
export type ValidateSQLNormalized<N extends string, S extends DatabaseSchema> =
    ShouldNeutralizeForScan<N> extends true
        ? ValidationScanView<N> extends infer V extends string
            ? ValidateSQLNormalizedDispatch<V, S>
            : false
        : ValidateSQLNormalizedDispatch<N, S>;

export type ShouldNeutralizeForScan<N extends string> =
    N extends `${string}'${string}`
        ? NotReportScale<N>
        : N extends `${string}"${string}`
            ? NotReportScale<N>
            : false;

export type NotReportScale<N extends string> =
    HasLineBreaks<N> extends true
        ? false
        : ExceedsLengthBudget<N> extends true
            ? false
            : true;

export type ValidateSQLNormalizedDispatch<N extends string, S extends DatabaseSchema> =
    QueryKind<N> extends "select"
        ? IsHighComplexitySelect<N> extends true
            ? ValidateSQLNormalizedLightSelect<N, S>
        // A single-CTE SELECT and a leading derived-table SELECT expose only their
        // projected output row to the outer query — validate that surface rather
        // than the body's base tables. A derived source followed by a JOIN is left
        // to the core path (it has additional relations in scope).
        : [SingleCteMatch<N>] extends [never]
            ? [DerivedTableMatch<N>] extends [never]
                ? ValidateSQLNormalizedCore<N, S>
                : N extends `${string} join ${string}`
                    ? ValidateSQLNormalizedCore<N, S>
                    : ValidateDerivedShape<N, S>
            : ValidateCteShape<N, S>
        : QueryKind<N> extends "update"
        ? IsHighComplexityUpdate<N> extends true
            ? ValidateHighComplexityUpdate<N, S>
            : ValidateSQLNormalizedCore<N, S>
        : ValidateSQLNormalizedCore<N, S>;

// High-complexity UPDATE (giant CASE/EXISTS/subquery SET) validator. The full
// core validator can't reliably parse the SET expression (its ` where ` / `=`
// /`,` tokens live inside subqueries) and blows TS2589, which is why these were
// blanket-accepted. Instead validate the cheap, reliable signal: the update
// target table exists, and the columns in the REAL top-level WHERE (depth-0,
// skipping subquery WHEREs) resolve against the query's tables/aliases. Catches
// an invalid WHERE column (adversarial N7) while accepting the valid
// correlated-update queries whose top-level WHERE references real columns.
export type ValidateHighComplexityUpdate<N extends string, S extends DatabaseSchema> =
    // Updates large enough to exceed the 700-char normalization cap still carry
    // raw line breaks; even tokenizing them blows TS2589, so preserve the old
    // blanket-accept for those (we cannot safely parse them). Only small, fully
    // normalized updates (like the adversarial N7) are actually validated.
    HasLineBreaks<N> extends true
        ? true
        : UpdateTargetTable<N, S> extends infer TargetKey extends string
            ? TableKeyValid<TargetKey, S> extends true
                ? ExtractLastWhere<N> extends infer W extends string
                    ? Trim<W> extends ""
                        ? true
                        // If the top-level WHERE itself contains a subquery/paren,
                        // the extracted predicate may not be the real top-level one
                        // (or references other tables) — skip rather than risk a
                        // false reject. Only the simple-WHERE case is validated.
                        : WhereHasSubquery<W> extends true
                            ? true
                            // Resolve the WHERE's columns against ONLY the update
                            // target table and its alias — NOT the whole query's
                            // tables/aliases.
                            : WhereColsValidForUpdate<W, TargetKey, UpdateAliasEntry<N, TargetKey>, S>
                    : true
                : false
            : true;

// A top-level WHERE is treated as "has a subquery" (and skipped) ONLY when it
// actually contains a nested SELECT / EXISTS — those reference columns of other
// tables that the target-table-only column check would falsely reject. A bare
// parenthesised group is NOT a subquery: `WHERE bogus_col IN (1, 2)` is a value
// list whose top-level column (`bogus_col`) must still be validated, so we no
// longer bail on every `(` (which silently accepted invalid top-level columns).
export type WhereHasSubquery<W extends string> =
    W extends `${string}select ${string}` ? true :
    W extends `${string}exists ${string}` ? true :
    W extends `exists ${string}` ? true :
    false;

// The update statement's own table alias as a `${alias}=>${tableKey}` entry, or
// `never` when the update has no alias. Parsed only from the `update <table>
// [alias] set` head, so it stays cheap on huge statements.
export type UpdateAliasEntry<N extends string, TargetKey extends string> =
    N extends `update ${infer Rest}`
        ? Trim<ExtractBefore<Rest, " set ">> extends `${infer _Tbl} ${infer AliasPart}`
            // `DerivedAliasName` strips a leading `as ` so the standard
            // `UPDATE products AS p` form yields `p`, not the keyword `as`.
            ? DerivedAliasName<Trim<AliasPart>> extends infer A extends string
                ? A extends ""
                    ? never
                    : `${A}=>${TargetKey}`
                : never
            : never
        : never;

export type WhereColsValidForUpdate<
    W extends string,
    TargetKey extends string,
    AliasEntry extends string,
    S extends DatabaseSchema
> =
    TokenizeLoose<W> extends infer WT extends string[]
        ? And<
            QualifiedColumnRefsValidFor<W, S, TargetKey, AliasEntry, WT>,
            UnqualifiedColumnRefsValidFor<W, S, TargetKey, AliasEntry, WT, never>,
            true,
            true,
            true
        >
        : true;

// "Light" validator for high-complexity SELECTs: validate the cheap, bounded
// parts (every referenced table exists, and the select/returning list resolves)
// while SKIPPING the O(tokens x tables) loose WHERE/GROUP/HAVING/ORDER scan that
// makes the full core validator OOM on report-scale queries. This catches an
// invalid table or an invalid select-list column (the common false-accepts)
// without paying for whole-query token validation. The select-list check only
// tokenizes per-expression, so it stays within the budget that blanket-`true`
// was protecting.
// Small, single-line high-complexity selects can afford full validation — route
// them to the core validator so invalid columns in WHERE / ORDER BY / GROUP BY /
// HAVING (and window/filter clauses) are actually caught. Only genuinely
// report-scale queries — multi-line (line breaks survive normalization) or very
// long single-line — keep the cheap tables-plus-select-list check that the
// blanket bypass was protecting from OOM.
export type ValidateSQLNormalizedLightSelect<N extends string, S extends DatabaseSchema> =
    ExceedsLengthBudget<N> extends true
        ? ReportScaleSelectTables<N, S>
        : HasLineBreaks<N> extends true
            ? LightSelectTablesAndList<N, S>
            : ValidateSQLNormalizedCore<N, S>;

export type ReportScaleSelectTables<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AllTablesValidFor<ReportScaleTablesToValidate<N, S, Tables>, S>
        : false;

export type ReportScaleTablesToValidate<N extends string, S extends DatabaseSchema, Tables extends string> =
    Tables extends `${infer Schema}.${infer Table}`
        ? TableKeyValid<`${Schema}.${Table}`, S> extends true
            ? `${Schema}.${Table}`
        : Table extends ReportScaleLocalRelationNames<N> | "select"
            ? never
            : Table extends `${ReportScalePseudoSource}${string}`
                ? never
                : N extends `with ${string}`
                    ? Table extends Lowercase<Table>
                        ? never
                        : `${Schema}.${Table}`
                : `${Schema}.${Table}`
        : Tables;

export type ReportScaleLocalRelationNames<N extends string> =
    CteNames<N> | ReportScaleDerivedNames<N>;

export type ReportScaleDerivedNames<N extends string> =
    N extends `${infer _Before} from (${infer _Body}) as ${infer After}`
        ? DerivedFirstWord<Trim<After>>
        : N extends `${infer _Before} from (${infer _Body}) ${infer After}`
            ? DerivedFirstWord<Trim<After>>
            : never;

export type ReportScalePseudoSource =
    | "lateral"
    | "max"
    | "min"
    | "avg"
    | "sum"
    | "count"
    | "extract"
    | "json_array_elements"
    | "jsonb_array_elements"
    | "unnest"
    | "generate_series";

export type LightSelectTablesAndList<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? AllTablesValidFor<NonCteTables<N, S, Tables>, S> extends true
                ? ColumnsValidInSelectOrReturningFor<N, S, Tables, Aliases> extends true
                    ? DistinctOnColsValid<N, S, Tables, Aliases> extends true
                        ? true
                        : false
                    : false
                : false
            : false
        : false;

export type ValidateSQLNormalizedCore<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? TokenizeLoose<RefScanSegment<N>> extends infer LooseTokens extends string[]
                ? AllTablesValidFor<NonCteTables<N, S, Tables>, S> extends true
                    ? AllColumnsValidFor<N, S, Tables, Aliases, LooseTokens> extends true
                        ? NoAliasShadowedQualifiers<N, S, Tables, Aliases> extends true
                          ? OuterScopeUnqualifiedValid<N, S> extends true
                            ? WindowFilterColsValid<N, S, Tables, Aliases> extends true
                                ? JoinUsingColsValid<N, S, Tables> extends true
                                    ? DistinctOnColsValid<N, S, Tables, Aliases> extends true
                                        ? true
                                        : false
                                    : false
                                : false
                            : false
                          : false
                        : false
                    : false
                : false
            : false
        : false;

// `JOIN ... USING (col)` requires `col` to exist on BOTH joined tables. The
// loose ref-scan only checks that an unqualified column resolves to SOME table,
// so a column present on just one side (e.g. `users JOIN orders USING (user_id)`
// where only `orders` has `user_id`) is wrongly accepted. Surface every
// ` using (cols)` body (spaced and no-space) and require each listed column to
// exist on at least TWO of the query's tables — a cheap proxy for "both sides of
// the join" that is correct for the common single-USING-join case and never
// false-rejects a column genuinely shared across the join. SELECT-only; a DELETE
// `... USING t` table source has no parenthesised column list so it never
// matches the ` using (` marker. A no-op (`true`) for queries without USING.
export type JoinUsingColsValid<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string
> =
    QueryKind<N> extends "select"
        ? `${ExtractCallParenBodies<N, " using (">} ${ExtractCallParenBodies<N, " using(">}` extends infer Seg extends string
            ? Trim<Seg> extends ""
                ? true
                : And<
                    // Cheap "shared on >=2 tables" proxy (the left side approximation).
                    UsingColsInTwoTables<SplitCommaSimple<Seg>, Tables, S>,
                    // Precise right-side check: each USING column must exist on the
                    // specific table being joined, so an unrelated later table can no
                    // longer mask an invalid USING pair (adversarial round-9 J1).
                    JoinUsingRightSideValid<N, S>,
                    true,
                    true,
                    true
                  >
            : true
        : true;

// Walk the query join-by-join, pairing each ` using (cols)` with the table named
// immediately before it (the join's RIGHT side) and requiring every listed column
// to exist on that table. When a ` join ` head is NOT immediately followed by its
// own ` using (` (the join source itself still contains a later ` join `), the
// USING belongs to a deeper join — skip this head and continue. A right side that
// resolves to something other than a real base table (alias / derived table) is
// left to the cheap shared-column proxy rather than risk a false reject.
export type JoinUsingRightSideValid<
    S extends string,
    Sch extends DatabaseSchema,
    Steps extends any[] = []
> = Steps["length"] extends 40
    ? true
    : S extends `${infer _Head} join ${infer AfterJoin}`
        ? AfterJoin extends `${infer Src} using (${infer Body})${infer Rest}`
            ? Src extends `${string} join ${string}`
                ? JoinUsingRightSideValid<AfterJoin, Sch, [any, ...Steps]>
                : And<
                    UsingColsOnRightTable<SplitCommaSimple<Body>, JoinSrcFirstWord<Src>, Sch>,
                    JoinUsingRightSideValid<Rest, Sch, [any, ...Steps]>,
                    true, true, true
                  >
            : AfterJoin extends `${infer Src2} using(${infer Body2})${infer Rest2}`
                ? Src2 extends `${string} join ${string}`
                    ? JoinUsingRightSideValid<AfterJoin, Sch, [any, ...Steps]>
                    : And<
                        UsingColsOnRightTable<SplitCommaSimple<Body2>, JoinSrcFirstWord<Src2>, Sch>,
                        JoinUsingRightSideValid<Rest2, Sch, [any, ...Steps]>,
                        true, true, true
                      >
                : JoinUsingRightSideValid<AfterJoin, Sch, [any, ...Steps]>
        : true;

// The first whitespace-delimited token of a join source (`users`, `users u`,
// `public.users u` -> `users` / `public.users`). Left un-cleaned so
// `TableKeyFromToken` can parse a schema-qualified `schema.table` token.
export type JoinSrcFirstWord<Src extends string> =
    Trim<Src> extends `${infer W} ${string}` ? W : Trim<Src>;

// Each USING column must exist on the joined (right-side) table. If the source
// token does not resolve to a real base table, defer to the shared-column proxy.
export type UsingColsOnRightTable<
    Cols extends string[],
    SrcWord extends string,
    S extends DatabaseSchema
> = TableKeyFromToken<SrcWord, S> extends infer RK extends string
    ? TableKeyValid<RK, S> extends true
        ? AllTrue<
            Cols[number] extends infer C extends string
                ? CleanIdent<C> extends ""
                    ? true
                    : ColumnExists<RK, CleanIdent<C>, S>
                : true
          >
        : true
    : true;

export type UsingColsInTwoTables<
    Cols extends string[],
    Tables extends string,
    S extends DatabaseSchema
> = AllTrue<
    Cols[number] extends infer C extends string
        ? CleanIdent<C> extends ""
            ? true
            : UsingColOnBothSides<CleanIdent<C>, Tables, S>
        : true
>;

export type UsingColOnBothSides<
    Col extends string,
    Tables extends string,
    S extends DatabaseSchema
> = TablesWithColumn<Tables, Col, S> extends infer Owners
    ? [Owners] extends [never]
        ? false
        : IsUnion<Owners> extends true
            ? true
            : false
    : false;

// Columns inside `over (...)` / `filter (...)` / `within group (...)` clauses
// live in the SELECT list (before the top-level FROM), so the from-FROM-onward
// loose ref-scan never sees them and the select-list treats `fn() over (...)` /
// `fn() within group (...)` as a plain function call. We surface those clause
// bodies explicitly and validate their column refs the same way as the rest of
// the query. `WITHIN GROUP (ORDER BY <expr>)` is the ordered-set aggregate's sort
// body — its columns must be validated like a window's. A no-op (`true`) for
// queries without these clauses.
export type WindowFilterColsValid<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string
> =
    `${ExtractCallParenBodies<N, " over (">} ${ExtractCallParenBodies<N, " over(">} ${ExtractCallParenBodies<N, " filter (">} ${ExtractCallParenBodies<N, " filter(">} ${ExtractCallParenBodies<N, " within group (">} ${ExtractCallParenBodies<N, " within group(">}` extends infer Seg extends string
        ? Trim<Seg> extends ""
            ? true
            : TokenizeLoose<Seg> extends infer Toks extends string[]
                ? And<
                    QualifiedColumnRefsValidFor<N, S, Tables, Aliases, Toks>,
                    UnqualifiedColumnRefsValidFor<N, S, Tables, Aliases, Toks, never>,
                    true,
                    true,
                    true
                  >
                : true
        : true;

// `DISTINCT ON (exprs)` columns are part of the SELECT scope but `StripDistinct`
// removes the whole ON-list before the projection / FROM-onward ref-scan runs, so
// `SELECT DISTINCT ON (bogus_col) id ...` escaped validation entirely. Surface the
// ON-list body explicitly (spaced and no-space variants) and validate its column
// refs against the query's tables/aliases exactly like `WindowFilterColsValid`.
// SELECT-only; a no-op (`true`) for queries without DISTINCT ON.
export type DistinctOnColsValid<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string
> =
    QueryKind<N> extends "select"
        ? `${ExtractCallParenBodies<N, " distinct on (">} ${ExtractCallParenBodies<N, " distinct on(">}` extends infer Seg extends string
            ? Trim<Seg> extends ""
                ? true
                : TokenizeLoose<Seg> extends infer Toks extends string[]
                    ? And<
                        QualifiedColumnRefsValidFor<N, S, Tables, Aliases, Toks>,
                        UnqualifiedColumnRefsValidFor<N, S, Tables, Aliases, Toks, never>,
                        true,
                        true,
                        true
                      >
                    : true
            : true
        : true;

export type IsHighComplexityUpdate<N extends string> =
    QueryKind<N> extends "update"
        ? N extends `${string} case ${string} select ${string}`
            ? true
            : N extends `${string} case ${string} exists (${string}`
                ? true
                : false
        : false;

export type IsHighComplexitySelect<N extends string> =
    QueryKind<N> extends "select"
        ? ExceedsLengthBudget<N> extends true
            ? true
        : N extends `${string} offset ${string}`
            ? true
            : N extends `${string} snapshot_date ${string}`
                ? true
            : N extends `${string} join ${string} join ${string} join ${string} join ${string}`
                ? N extends `${string} order by ${string}`
                    ? true
                    : N extends `${string} group by ${string}`
                        ? true
                        : N extends `${string} limit ${string}`
                            ? true
                            : false
                : false
        : false;

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

// ---------------------------------------------------------------------------
// CTE / derived-table VALIDATION (scope surface).
//
// A CTE or derived table exposes ONLY its projected output row to the outer
// query — never the base tables in its body. Result inference already computes
// that row (`CteRow` / `DerivedSubRow`, including `t(a,b)` renaming); validation
// reuses it. A single-CTE / leading-derived SELECT is valid when:
//   1. the body is itself a valid query, AND
//   2. every outer projection references a column the body actually exposes
//      (qualified by the CTE/derived relation name, or unqualified).
// This both ACCEPTS the projected/renamed reads and REJECTS reads of a column
// the body did not project (or whose name a `t(cols)` list renamed away).
// ---------------------------------------------------------------------------

export type ValidateCteShape<N extends string, S extends DatabaseSchema> =
    SingleCteMatch<N> extends {
        body: infer Body extends string;
        outer: infer Outer extends string;
        name: infer Name extends string;
        cols: infer Cols extends string[];
    }
        ? CteRow<Body, Cols, S> extends infer Row
            ? And<
                ValidateSQLNormalized<Body, S>,
                OuterProjectionInRow<SplitSelectList<ExtractSelectList<Outer>>, Name, Row, S>,
                // Outer WHERE/clause refs also see only the CTE's exposed row.
                OuterWhereRefsInRow<Outer, Name, Row, S>,
                true,
                true
              >
            : true
        : true;

export type ValidateDerivedShape<N extends string, S extends DatabaseSchema> =
    DerivedTableMatch<N> extends { body: infer Body extends string; alias: infer DAlias extends string }
        ? DerivedSubRow<Body, S> extends infer Row
            ? And<
                ValidateSQLNormalized<Body, S>,
                OuterProjectionInRow<SplitSelectList<ExtractSelectList<N>>, DAlias, Row, S>,
                // Outer WHERE refs see only the derived row; the body (and its own
                // WHERE) is stripped first and validated by the recursive body check.
                OuterWhereRefsInRow<N, DAlias, Row, S>,
                true,
                true
              >
            : true
        : true;

// Every projected expression of the outer query must reference a column the
// derived/CTE relation exposes. Functions, literals, `*`, and `<rel>.*` are
// left unchecked (always valid); only plain column reads are constrained.
export type OuterProjectionInRow<Exprs extends string[], Name extends string, Row, S extends DatabaseSchema> =
    AllTrue<
        Exprs[number] extends infer E
            ? E extends string
                ? OuterProjInRow<E, Name, Row, S>
                : true
            : true
    >;

export type OuterProjInRow<E extends string, Name extends string, Row, S extends DatabaseSchema> =
    ExtractAliasResult<E> extends { expr: infer Raw extends string }
        ? ProjRefInRow<Trim<Raw>, Name, Row, S>
        : ProjRefInRow<Trim<E>, Name, Row, S>;

export type ProjRefInRow<Raw extends string, Name extends string, Row, S extends DatabaseSchema> =
    Raw extends "*" ? true :
    Raw extends `${Name}.*` ? true :
    Raw extends `${number}` ? true :
    Raw extends `'${string}` ? true :
    Raw extends `"${string}` ? true :
    // A call / parenthesised expression (`upper(status)`, `upper(dt.status)`):
    // the wrapper must not smuggle in a column the relation never exposed, so
    // validate the refs INSIDE the parens against the exposed row rather than
    // accepting the whole expression as a non-simple ref.
    Raw extends `${string}(${infer Inner})${string}`
        ? SegRefsInRow<Inner, Name, Row, S>
        : Raw extends `${infer Q}.${infer Col}`
            ? IsSimpleRefPart<Q> extends true
                ? IsSimpleRefPart<Col> extends true
                    ? CleanIdent<Q> extends Name
                        ? KeyInRow<CleanIdent<Col>, Row>
                        : false
                    : true
                : true
            : IsSimpleRefPart<Raw> extends true
                ? KeyInRow<CleanIdent<Raw>, Row>
                : true;

export type KeyInRow<K extends string, Row> = [K] extends [keyof Row] ? true : false;

// Validate every column-reference candidate in an arbitrary text segment (an
// outer WHERE predicate, or a function call's argument list) against the
// CTE/derived relation's exposed `Row`. Reuses the same token walkers the core
// validator uses to surface refs, then checks each via `ProjRefInRow` (qualifier
// must equal the relation `Name`, column must be a key of `Row`). `Tables`/
// `Aliases` are `never`: the walkers only consult them to EXCLUDE table/alias
// tokens, and here the relation name is already excluded by its `from`/`join`/`)`
// predecessor and output aliases by the walker's `Prev extends "as"` guard. An
// empty/whitespace segment yields no refs → `true` (no-op).
export type SegRefsInRow<Seg extends string, Name extends string, Row, S extends DatabaseSchema> =
    Trim<Seg> extends ""
        ? true
        : TokenizeLoose<Seg> extends infer Toks extends string[]
            ? And<
                AllTrue<
                    QualifiedColumnRefs<Toks, S, never, never> extends infer R
                        ? R extends string ? ProjRefInRow<R, Name, Row, S> : true
                        : true
                >,
                AllTrue<
                    UnqualifiedColumnRefs<Toks, S, never, never> extends infer R
                        ? R extends string ? ProjRefInRow<R, Name, Row, S> : true
                        : true
                >,
                true,
                true
              >
            : true;

// The outer query's WHERE predicate, scoped to the CTE/derived relation's exposed
// row. Strip subquery bodies FIRST so the derived/CTE body's own WHERE is never
// scanned here (it is validated recursively), then scan ONLY when a real outer
// WHERE survives — `ExtractLastWhere` returns the whole string when there is no
// ` where `, so the explicit guard keeps the no-WHERE case a true no-op.
export type OuterWhereRefsInRow<OuterText extends string, Name extends string, Row, S extends DatabaseSchema> =
    StripSubqueries<OuterText> extends infer Stripped extends string
        ? Stripped extends `${string} where ${string}`
            ? SegRefsInRow<ExtractLastWhere<Stripped>, Name, Row, S>
            : true
        : true;

// Query kind helpers

export type QueryKind<N extends string> =
    StartsWith<N, "select "> extends true ? "select" :
    StartsWith<N, "with "> extends true ? "select" :
    StartsWith<N, "insert "> extends true ? "insert" :
    StartsWith<N, "update "> extends true ? "update" :
    StartsWith<N, "delete "> extends true ? "delete" :
    "unknown";

// RETURNING only belongs to INSERT/UPDATE/DELETE — a SELECT (or `WITH ... SELECT`
// without a data-modifying statement) never has a RETURNING clause, so `returning`
// appearing in a SELECT is data (a string literal / quoted alias), not structure.
// For data-modifying statements the match is quote-aware so ` returning ` inside
// a string literal or quoted identifier is not mistaken for the clause.
export type HasReturning<N extends string> =
    QueryKind<N> extends "select"
        ? false
        : HasReturningQuoteAware<N>;

export type HasReturningQuoteAware<
    S extends string,
    InString extends boolean = false,
    InDString extends boolean = false,
    Steps extends any[] = []
> = string extends S
    ? false
    : Steps["length"] extends 1200
        ? S extends `${string} returning ${string}` ? true : false
        : InString extends true
            ? S extends `${infer C}${infer Rest}`
                ? HasReturningQuoteAware<Rest, C extends "'" ? false : true, InDString, [any, ...Steps]>
                : false
            : InDString extends true
                ? S extends `${infer C}${infer Rest}`
                    ? HasReturningQuoteAware<Rest, InString, C extends `"` ? false : true, [any, ...Steps]>
                    : false
                : S extends ` returning ${string}`
                    ? true
                    : S extends `${infer C}${infer Rest}`
                        ? HasReturningQuoteAware<Rest, C extends "'" ? true : false, C extends `"` ? true : false, [any, ...Steps]>
                        : false;

// Table and alias extraction

export type AllTablesValid<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AllTablesValidFor<Tables, S>
        : true;

export type AllTablesValidFor<Tables extends string, S extends DatabaseSchema> =
    AllTrue<Tables extends string ? TableKeyValid<Tables, S> : true>;

// Column validation

export type AllColumnsValid<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? TokenizeLoose<RefScanSegment<N>> extends infer LooseTokens extends string[]
                ? AllColumnsValidFor<N, S, Tables, Aliases, LooseTokens>
                : false
            : false
        : false;

export type AllColumnsValidFor<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    LooseTokens extends string[]
> = SelectAliasSet<N> extends infer SelectAliases extends string
    ? QueryKind<N> extends "update"
        // A normal (non-high-complexity) UPDATE has no subquery/CASE SET, so its
        // SET-RHS and top-level WHERE column refs are safe to scan the same way a
        // SELECT's are. This catches invalid columns hidden in `SET x = bogus` or
        // `WHERE bogus = 1` that the SET-target-only check (`ColumnsValidInUpdate`)
        // misses. There are no SELECT-list aliases in an UPDATE, so `never`.
        ? And<
            ColumnsValidInUpdate<N, S>,
            ColumnsValidInInsert<N, S>,
            ColumnsValidInSelectOrReturningFor<N, S, Tables, Aliases>,
            QualifiedColumnRefsValidFor<N, S, Tables, Aliases, LooseTokens>,
            UnqualifiedColumnRefsValidFor<N, S, Tables, Aliases, LooseTokens, never>
        >
        : And<
            ColumnsValidInSelectOrReturningFor<N, S, Tables, Aliases>,
            ColumnsValidInInsert<N, S>,
            ColumnsValidInUpdate<N, S>,
            QualifiedColumnRefsValidFor<N, S, Tables, Aliases, LooseTokens>,
            // A SELECT-list alias is only resolvable in ORDER BY — NOT in
            // WHERE/GROUP/HAVING. So the unqualified ref-scan blesses the alias
            // set ONLY for the ORDER BY token slice; the FROM..(pre-order-by)
            // slice (WHERE/GROUP/HAVING/JOIN-ON) is validated against real
            // columns with `never` aliases. When there is no ORDER BY this is
            // equivalent to the old single-pass `never`-alias scan.
            SelectUnqualifiedRefsScoped<N, S, Tables, Aliases, SelectAliases>
        >
    : false;

// Validate the SELECT's unqualified column refs with ORDER-BY-scoped alias
// resolution. The pre-ORDER-BY ref segment (WHERE/GROUP/HAVING/ON) is validated
// against real columns only; the ORDER-BY segment additionally accepts the
// SELECT-list output aliases.
export type SelectUnqualifiedRefsScoped<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    SelectAliases extends string
> =
    [SelectAliases] extends [never]
        ? UnqualifiedColumnRefsValidFor<N, S, Tables, Aliases, TokenizeLoose<RefScanSegment<N>>, never>
        : And<
            UnqualifiedColumnRefsValidFor<N, S, Tables, Aliases, TokenizeLoose<RefScanBeforeOrderBy<N>>, never>,
            UnqualifiedColumnRefsValidFor<N, S, Tables, Aliases, TokenizeLoose<RefScanOrderBy<N>>, SelectAliases>,
            true,
            true,
            true
        >;

export type ColumnsValidInSelectOrReturning<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? ColumnsValidInSelectOrReturningFor<N, S, Tables, Aliases>
            : true
        : true;

export type ColumnsValidInSelectOrReturningFor<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string
> =
    HasReturning<N> extends true
        ? [Tables] extends [never]
            ? true
            : ExprsValidList<SplitSelectList<ReplaceAll<ExtractReturningList<N>, DQuoteSpaceSentinel, " ">>, Tables, Aliases, S>
        : QueryKind<N> extends "select"
            ? [Tables] extends [never]
                ? true
                // The projection list is extracted from the validation scan view,
                // whose double-quoted-identifier spaces are masked with a sentinel.
                // The alias set restores those spaces, so restore them here too or a
                // qualifier through a space-bearing quoted alias (`"user alias".id`)
                // would never match its registered alias (round-12 regression).
                : ExprsValidList<SplitSelectList<ReplaceAll<ExtractSelectList<N>, DQuoteSpaceSentinel, " ">>, Tables, Aliases, S>
            : true;

// insert

export type ColumnsValidInInsert<N extends string, S extends DatabaseSchema> =
    QueryKind<N> extends "insert"
        ? InsertTargetTable<N, S> extends infer TableKey extends string
            ? TableKey extends never
                ? true
                : And<
                    ColumnsExistInTable<ExtractInsertColumns<N>, TableKey, S>,
                    ColumnsExistInTable<ExtractConflictColumns<N>, TableKey, S>,
                    ColumnsExistInTable<ExtractConflictUpdateSetColumns<N>, TableKey, S>,
                    // RHS `excluded.<col>` refs must name a column of the target
                    // table (the `excluded` pseudo-row mirrors it).
                    ColumnsExistInTable<ExtractConflictUpdateExcludedCols<N>, TableKey, S>,
                    true
                >
            : true
        : true;

// update

export type ColumnsValidInUpdate<N extends string, S extends DatabaseSchema> =
    QueryKind<N> extends "update"
        ? UpdateTargetTable<N, S> extends infer TableKey extends string
            ? TableKey extends never
                ? true
                : ColumnsExistInTable<ExtractUpdateSetColumns<N>, TableKey, S>
            : true
        : true;

// qualified refs across query (best-effort)

export type QualifiedColumnRefsValid<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? TokenizeLoose<RefScanSegment<N>> extends infer LooseTokens extends string[]
                ? QualifiedColumnRefsValidFor<N, S, Tables, Aliases, LooseTokens>
                : true
            : true
        : true;

export type QualifiedColumnRefsValidFor<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    LooseTokens extends string[]
> = QualifiedColumnRefs<LooseTokens, S, Tables, Aliases> extends infer Cols
    ? AllTrue<Cols extends string ? ColumnRefValidLooseWith<Cols, Tables, Aliases, S> : true>
    : true;

// Once a table is given a range alias (`FROM products p`), PostgreSQL hides the
// original table name as a correlation name for that query level — `products.id`
// is then invalid; only `p.id` works. The lenient qualified-ref check accepts
// the base-name qualifier (it still resolves to a real column), so reject it
// explicitly: any qualified ref whose qualifier is the BASE NAME of a table that
// carries a range alias (and is not itself an alias) is invalid. Scans the whole
// query (the offending ref can sit in the SELECT list, not just the ref segment).
export type AliasedTableKeys<Aliases extends string> =
    Aliases extends `${string}=>${infer T}` ? T : never;

export type QualifierShadowedByAlias<
    Q extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    [ResolveAlias<CleanIdent<Q>, Aliases>] extends [never]
        ? [Extract<TableKeysByName<CleanIdent<Q>, Tables>, AliasedTableKeys<Aliases>>] extends [never]
            ? false
            : true
        : false;

export type NoAliasShadowedQualifiers<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string
> =
    [AliasedTableKeys<Aliases>] extends [never]
        ? true
        : AllTrue<
            QualifiedColumnRefs<TokenizeLoose<N>, S, Tables, Aliases> extends infer R
                ? R extends `${infer Q}.${string}`
                    ? QualifierShadowedByAlias<Q, Tables, Aliases, S> extends true
                        ? false
                        : true
                    : true
                : true
        >;

// A table introduced INSIDE a subquery is in scope only there — it must not
// satisfy an UNQUALIFIED column reference in the OUTER query. The whole-query
// table scan flattens every relation into one set, so an outer `email` resolves
// against a `users` table that only exists inside an `EXISTS (...)`. Re-validate
// the outer scope in isolation: strip every parenthesised group (excising
// subquery bodies), collect only the depth-0 FROM/JOIN relations, and require
// each outer unqualified ref to resolve against THOSE. Correlated subquery refs
// live inside the stripped parens, so they are never checked against the outer
// tables here (the core whole-query scan still validates them). Gated to plain
// SELECTs whose FROM clause has no derived/subquery source, and skipped for
// report-scale queries to bound the char-walk.
export type OuterScopeUnqualifiedValid<N extends string, S extends DatabaseSchema> =
    StartsWith<N, "select "> extends true
        ? N extends `${string}(${string}`
            ? ExceedsLengthBudget<N> extends true
                ? true
                : StripSubqueries<N> extends infer Stripped extends string
                    ? TablesInQuery<Stripped, S> extends infer OT extends string
                        ? [OT] extends [never]
                            ? true
                            // Only trust the depth-0 view when every relation it
                            // recovers is a real base table — a JOINed derived
                            // source survives stripping as a bare alias token and
                            // would otherwise look like a missing table.
                            : AllTablesValidFor<OT, S> extends true
                                ? AliasesInQuery<Stripped, S> extends infer OA extends string
                                    ? UnqualifiedColumnRefsValidFor<
                                        Stripped,
                                        S,
                                        OT,
                                        OA,
                                        TokenizeLoose<RefScanSegment<Stripped>>,
                                        SelectAliasesInQuery<Stripped>
                                      >
                                    : true
                                : true
                        : true
                    : true
            : true
        : true;

export type UnqualifiedColumnRefsValid<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? TokenizeLoose<RefScanSegment<N>> extends infer LooseTokens extends string[]
                ? SelectAliasesInQuery<N> extends infer SelectAliases extends string
                    ? UnqualifiedColumnRefsValidFor<N, S, Tables, Aliases, LooseTokens, SelectAliases>
                    : true
                : true
            : true
        : true;

export type UnqualifiedColumnRefsValidFor<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    LooseTokens extends string[],
    SelectAliases extends string
> = UnqualifiedColumnRefs<LooseTokens, S, Tables, Aliases> extends infer Cols
    ? AllTrue<
        Cols extends string
            ? CleanIdent<Cols> extends SelectAliases
                ? true
                : UnqualifiedColumnValid<Cols, Tables, Aliases, S>
            : true
    >
    : true;

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
