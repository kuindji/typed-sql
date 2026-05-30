import type { DatabaseSchema, ColumnExists } from "./schema.js";
import type {
    ColumnRefValidLooseWith,
    QualifiedColumnRefs,
    UnqualifiedColumnRefs,
    UnqualifiedColumnValid
} from "./columns.js";
import type { ExprToObject, ExprsValidList } from "./expressions.js";
import type {
    ExtractAlias,
    ExtractConflictColumns,
    ExtractConflictUpdateSetColumns,
    ExtractInsertColumns,
    ExtractReturningList,
    ExtractSelectList,
    ExtractFromClause,
    ExtractLastWhere,
    ExtractAliasResult,
    ExtractBefore,
    ExtractCallParenBodies,
    ExceedsLengthBudget,
    HasLineBreaks,
    SplitBalancedParen,
    SplitCommaSimple,
    ExtractUpdateSetColumns,
    SplitSelectList,
    TokenizeLoose,
    CleanIdent,
    Trim
} from "./parsing.js";
import type {
    AliasesInQuery,
    InsertTargetTable,
    TableKeyValid,
    TablesInQuery,
    UpdateTargetTable
} from "./tables.js";
import type { And, AllTrue, Simplify, StartsWith, UnionToIntersection } from "./utils.js";

// Core validation / inference

export type ValidateSQLNormalized<N extends string, S extends DatabaseSchema> =
    QueryKind<N> extends "select"
        ? IsHighComplexitySelect<N> extends true
            ? ValidateSQLNormalizedLightSelect<N, S>
            : ValidateSQLNormalizedCore<N, S>
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

export type WhereHasSubquery<W extends string> =
    W extends `${string}(${string}` ? true :
    W extends `${string}select ${string}` ? true :
    W extends `${string} exists ${string}` ? true :
    false;

// The update statement's own table alias as a `${alias}=>${tableKey}` entry, or
// `never` when the update has no alias. Parsed only from the `update <table>
// [alias] set` head, so it stays cheap on huge statements.
export type UpdateAliasEntry<N extends string, TargetKey extends string> =
    N extends `update ${infer Rest}`
        ? Trim<ExtractBefore<Rest, " set ">> extends `${infer _Tbl} ${infer AliasPart}`
            ? CleanIdent<DerivedFirstWord<Trim<AliasPart>>> extends infer A extends string
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
    HasLineBreaks<N> extends true
        ? LightSelectTablesAndList<N, S>
        : ExceedsLengthBudget<N> extends true
            ? LightSelectTablesAndList<N, S>
            : ValidateSQLNormalizedCore<N, S>;

export type LightSelectTablesAndList<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? AllTablesValidFor<Tables, S> extends true
                ? ColumnsValidInSelectOrReturningFor<N, S, Tables, Aliases> extends true
                    ? true
                    : false
                : false
            : false
        : false;

export type ValidateSQLNormalizedCore<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? TokenizeLoose<RefScanSegment<N>> extends infer LooseTokens extends string[]
                ? AllTablesValidFor<Tables, S> extends true
                    ? AllColumnsValidFor<N, S, Tables, Aliases, LooseTokens> extends true
                        ? WindowFilterColsValid<N, S, Tables, Aliases> extends true
                            ? true
                            : false
                        : false
                    : false
                : false
            : false
        : false;

// Columns inside `over (...)` / `filter (...)` clauses live in the SELECT list
// (before the top-level FROM), so the from-FROM-onward loose ref-scan never sees
// them and the select-list treats `fn() over (...)` as a plain function call. We
// surface those clause bodies explicitly and validate their column refs the same
// way as the rest of the query. A no-op (`true`) for queries without windows.
export type WindowFilterColsValid<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string
> =
    `${ExtractCallParenBodies<N, " over (">} ${ExtractCallParenBodies<N, " filter (">}` extends infer Seg extends string
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
        ? N extends `${string} offset ${string}`
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
            ? HasReturning<N> extends true
                ? SelectReturnWith<ExtractReturningList<N>, Tables, Aliases, S>
                : QueryKind<N> extends "select"
                    ? [SingleCteMatch<N>] extends [never]
                        ? [DerivedTableMatch<N>] extends [never]
                            ? SelectReturnWith<ExtractSelectList<N>, Tables, Aliases, S>
                            : DerivedTableReturn<N, S>
                        : CteReturn<N, S>
                    : number
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

export type DerivedExprToObject<E extends string, DAlias extends string, SubRow> =
    ExtractAliasResult<E> extends { expr: infer RawExpr extends string; alias: infer OutAlias }
        ? [OutAlias] extends [never]
            ? CleanIdent<RawExpr> extends "*"
                ? SubRow
                : CleanIdent<RawExpr> extends `${DAlias}.*`
                    ? SubRow
                    : DerivedColKey<RawExpr, DAlias> extends infer K extends string
                        ? { [P in K]: DerivedColType<K, SubRow> }
                        : Record<string, unknown>
            : OutAlias extends string
                ? { [P in OutAlias]: DerivedColType<DerivedColKey<RawExpr, DAlias>, SubRow> }
                : Record<string, unknown>
        : Record<string, unknown>;

export type DerivedColKey<RawExpr extends string, DAlias extends string> =
    CleanIdent<RawExpr> extends `${DAlias}.${infer Col}` ? Col : CleanIdent<RawExpr>;

export type DerivedColType<Col extends string, SubRow> =
    Col extends keyof SubRow ? SubRow[Col] : unknown;

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

// Query kind helpers

export type QueryKind<N extends string> =
    StartsWith<N, "select "> extends true ? "select" :
    StartsWith<N, "with "> extends true ? "select" :
    StartsWith<N, "insert "> extends true ? "insert" :
    StartsWith<N, "update "> extends true ? "update" :
    StartsWith<N, "delete "> extends true ? "delete" :
    "unknown";

export type HasReturning<N extends string> = N extends `${string} returning ${string}` ? true : false;

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
        ? And<
            ColumnsValidInSelectOrReturningFor<N, S, Tables, Aliases>,
            ColumnsValidInInsert<N, S>,
            ColumnsValidInUpdate<N, S>,
            true,
            true
        >
        : And<
            ColumnsValidInSelectOrReturningFor<N, S, Tables, Aliases>,
            ColumnsValidInInsert<N, S>,
            ColumnsValidInUpdate<N, S>,
            QualifiedColumnRefsValidFor<N, S, Tables, Aliases, LooseTokens>,
            UnqualifiedColumnRefsValidFor<N, S, Tables, Aliases, LooseTokens, SelectAliases>
        >
    : false;

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
            : ExprsValidList<SplitSelectList<ExtractReturningList<N>>, Tables, Aliases, S>
        : QueryKind<N> extends "select"
            ? [Tables] extends [never]
                ? true
                : ExprsValidList<SplitSelectList<ExtractSelectList<N>>, Tables, Aliases, S>
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
                    true,
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
    S extends DatabaseSchema
> = BuildSelectReturn<SplitSelectList<SelectList>, Tables, Aliases, S>;

export type BuildSelectReturn<
    Exprs extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = MergeExprs<Exprs, Tables, Aliases, S>;

export type MergeExprs<
    Exprs extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Acc = {},
    Steps extends any[] = []
> = Steps["length"] extends 100
    ? Simplify<Acc>
    : Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? MergeExprs<Rest, Tables, Aliases, S, MergeRow<Acc, ExprToObject<H, Tables, Aliases, S>>, [any, ...Steps]>
        : Simplify<Acc>;

// Merge the next projected column object into the accumulator, last write wins:
// a duplicate output alias keeps the later column's type instead of
// intersecting (which would collapse two differing same-named outputs to never).
export type MergeRow<Acc, Next> = [Next] extends [never] ? Acc : Omit<Acc, keyof Next> & Next;

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
