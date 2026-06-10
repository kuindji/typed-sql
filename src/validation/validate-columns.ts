// Table/column existence + qualified/unqualified ref + scope-shape validation.
import type { AliasesInQuery, InsertTargetTable, TableKeyValid, TablesInQuery, UpdateTargetTable } from "../tables.js";
import type { AllTrue, And, StartsWith } from "../utils.js";
import type { CleanIdent, DQuoteSpaceSentinel, ExceedsLengthBudget, ExtractAliasResult, ExtractBefore, ExtractConflictColumns, ExtractConflictUpdateExcludedCols, ExtractConflictUpdateSetColumns, ExtractInsertColumns, ExtractLastWhere, ExtractReturningList, ExtractSelectList, ExtractUpdateSetColumns, ReplaceAll, SplitSelectList, StripSubqueries, TokenizeLoose, Trim } from "../parsing.js";
import type { ColumnRefValidLooseWith, IsSimpleRefPart, QualifiedColumnRefs, ResolveAlias, TableKeysByName, UnqualifiedColumnRefs, UnqualifiedColumnValid } from "../columns.js";
import type { ColumnsExistInTable, RefScanBeforeOrderBy, RefScanOrderBy, RefScanSegment, SelectAliasesInQuery, SelectAliasSet } from "./return-types.js";
import type { CteNames, CteRow, SingleCteMatch } from "./cte.js";
import type { DatabaseSchema } from "../schema.js";
import type { AliasHasNoSpace, DerivedRenamedRow, DerivedTableMatch } from "./return-derived.js";
import type { ExprsValidList } from "../expressions.js";
import type { HasReturning, QueryKind, ValidateSQLNormalized } from "./dispatch.js";

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
                // Outer WHERE refs also see only the CTE's exposed row.
                OuterWhereRefsInRow<Outer, Name, Row, S>,
                // ORDER BY / GROUP BY / HAVING are outer clauses too.
                OuterTailClauseRefsInRow<Outer, Name, Row, S>,
                true
              >
            : true
        : true;

export type ValidateDerivedShape<N extends string, S extends DatabaseSchema> =
    DerivedTableMatch<N> extends { body: infer Body extends string; alias: infer DAlias extends string; cols: infer Cols extends string[] }
        ? DerivedRenamedRow<Body, Cols, S> extends infer Row
            ? And<
                ValidateSQLNormalized<Body, S>,
                OuterProjectionInRow<SplitSelectList<ExtractSelectList<N>>, DAlias, Row, S>,
                // Outer WHERE refs see only the derived row; the body (and its own
                // WHERE) is stripped first and validated by the recursive body check.
                OuterWhereRefsInRow<N, DAlias, Row, S>,
                // ORDER BY / GROUP BY / HAVING are outer clauses too.
                OuterTailClauseRefsInRow<N, DAlias, Row, S>,
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

// ORDER BY / GROUP BY / HAVING are outer clauses with the same exposed-row scope
// as WHERE: they may read only the columns the CTE/derived relation projected,
// never an unprojected base-table column from its body. Subquery bodies are
// stripped first (a derived body's own trailing clauses live inside its parens),
// then each clause's expression segment is scanned against the exposed `Row`.
// Output aliases from the outer SELECT list are blessed — Postgres permits an
// output column name in GROUP BY / ORDER BY — so referencing one is never a
// false rejection (HAVING is treated leniently the same way).
export type OuterTailClauseRefsInRow<OuterText extends string, Name extends string, Row, S extends DatabaseSchema> =
    StripSubqueries<OuterText> extends infer Stripped extends string
        ? SelectAliasesInQuery<Stripped> extends infer SelAliases extends string
            ? And<
                SegRefsInRowWithAliases<ExtractGroupByExpr<Stripped>, Name, Row, S, SelAliases>,
                SegRefsInRowWithAliases<ExtractHavingExpr<Stripped>, Name, Row, S, SelAliases>,
                SegRefsInRowWithAliases<ExtractOrderByExpr<Stripped>, Name, Row, S, SelAliases>,
                true,
                true
              >
            : true
        : true;

// Trailing-clause expression extractors. Each yields the clause's expression
// text bounded by the clauses that may follow it (clause order is
// GROUP BY → HAVING → ORDER BY → LIMIT/OFFSET/UNION), or "" when absent.
type StopAtLimitTail<S extends string> =
    ExtractBefore<ExtractBefore<ExtractBefore<S, " limit ">, " offset ">, " union ">;

type ExtractGroupByExpr<S extends string> =
    S extends `${string} group by ${infer R}`
        ? StopAtLimitTail<ExtractBefore<ExtractBefore<R, " having ">, " order by ">>
        : "";

type ExtractHavingExpr<S extends string> =
    S extends `${string} having ${infer R}`
        ? StopAtLimitTail<ExtractBefore<R, " order by ">>
        : "";

type ExtractOrderByExpr<S extends string> =
    S extends `${string} order by ${infer R}`
        ? StopAtLimitTail<R>
        : "";

// As `SegRefsInRow`, but additionally blesses a set of outer SELECT-list output
// aliases (an unqualified ref equal to one is accepted without consulting `Row`).
export type SegRefsInRowWithAliases<Seg extends string, Name extends string, Row, S extends DatabaseSchema, SelAliases extends string> =
    Trim<Seg> extends ""
        ? true
        : TokenizeLoose<Seg> extends infer Toks extends string[]
            ? And<
                AllTrue<
                    QualifiedColumnRefs<Toks, S, never, never> extends infer R
                        ? R extends string ? RefInRowOrAlias<R, Name, Row, S, SelAliases> : true
                        : true
                >,
                AllTrue<
                    UnqualifiedColumnRefs<Toks, S, never, never> extends infer R
                        ? R extends string ? RefInRowOrAlias<R, Name, Row, S, SelAliases> : true
                        : true
                >,
                true,
                true
              >
            : true;

export type RefInRowOrAlias<R extends string, Name extends string, Row, S extends DatabaseSchema, SelAliases extends string> =
    [SelAliases] extends [never]
        ? ProjRefInRow<R, Name, Row, S>
        : CleanIdent<R> extends SelAliases
            ? true
            : ProjRefInRow<R, Name, Row, S>;


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
            : ExprsValidList<SplitSelectList<ReplaceAll<ExtractReturningList<N>, DQuoteSpaceSentinel, " ">>, Tables, Aliases, S, [], SelectLocalRels<N>>
        : QueryKind<N> extends "select"
            ? [Tables] extends [never]
                ? true
                // The projection list is extracted from the validation scan view,
                // whose double-quoted-identifier spaces are masked with a sentinel.
                // The alias set restores those spaces, so restore them here too or a
                // qualifier through a space-bearing quoted alias (`"user alias".id`)
                // would never match its registered alias (round-12 regression).
                : ExprsValidList<SplitSelectList<ReplaceAll<ExtractSelectList<N>, DQuoteSpaceSentinel, " ">>, Tables, Aliases, S, [], SelectLocalRels<N>>
            : true;

// Query-local relation names whose qualified refs the projection-list validator
// must bless: a `WITH`-query's CTE names. (A CTE that reaches the core validator
// — e.g. `WITH ... SELECT ... JOIN ...` — is collected into `TablesInQuery` as a
// bogus base table for the ref-resolution, so `cte.col` in the SELECT list would
// otherwise resolve `never` and falsely reject.) Gated on the `with ` prefix so
// CTE-free queries pay nothing.
type SelectLocalRels<N extends string> =
    N extends `with ${string}` ? CteNames<N> : never;

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
> =
    // Common path: with no CTE and no parenthesised FROM source there is no local
    // relation that could qualify a ref, so skip the (per-ref) local-relation
    // blessing entirely — exact prior behavior, zero added cost.
    HasLocalRelations<N> extends true
        ? QualifiedRefsValidWithLocal<N, S, Tables, Aliases, LooseTokens, CteNames<N>>
        : QualifiedColumnRefs<LooseTokens, S, Tables, Aliases> extends infer Cols
            ? AllTrue<Cols extends string ? ColumnRefValidLooseWith<Cols, Tables, Aliases, S> : true>
            : true;

// A "local relation" is a query-local name that is NOT a base table: a CTE name, or
// the alias bound to a derived / VALUES / subquery FROM source (`from (…) [as]
// x[(cols)]`). Its columns are not modeled in the schema, so a ref qualified by it
// must be accepted leniently rather than resolved against a (non-existent) base
// table. Blessing only ever turns a reject into an accept — never the reverse —
// consistent with the lenient-parser contract.
type HasLocalRelations<N extends string> =
    N extends `with ${string}` ? true :
    N extends `${string} from (${string}` ? true :
    N extends `${string} join (${string}` ? true :
    false;

type QualifiedRefsValidWithLocal<
    N extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    LooseTokens extends string[],
    Ctes extends string
> = QualifiedColumnRefs<LooseTokens, S, Tables, Aliases> extends infer Cols
    ? AllTrue<
        Cols extends string
            ? IsLocalRelation<RefQualifierOf<Cols>, Ctes, N> extends true
                ? true
                : ColumnRefValidLooseWith<Cols, Tables, Aliases, S>
            : true
      >
    : true;

// The qualifier (text before the first `.`) of a qualified column ref.
type RefQualifierOf<Col extends string> =
    Col extends `${infer Q}.${string}` ? CleanIdent<Q> : never;

type IsLocalRelation<Q extends string, Ctes extends string, N extends string> =
    [Q] extends [never] ? false :
    Q extends Ctes ? true :
    IsDerivedSourceAlias<Q, N>;

// Detect `… ) [as] q …` / `… ) [as] q( …` — q is the alias bound to a parenthesised
// (derived / VALUES / subquery) FROM source. N is already normalized (lowercase
// outside quotes); q is the cleaned, lowercased qualifier.
type IsDerivedSourceAlias<Q extends string, N extends string> =
    N extends `${string}) as ${Q} ${string}` ? true :
    N extends `${string}) as ${Q}(${string}` ? true :
    N extends `${string}) as ${Q}` ? true :
    N extends `${string}) ${Q} ${string}` ? true :
    N extends `${string}) ${Q}(${string}` ? true :
    N extends `${string}) ${Q}` ? true :
    false;

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
        // A shadowable qualifier is a `qualifier.column` token, which requires a
        // `.`. With no `.` anywhere, `QualifiedColumnRefs` accumulates `never` and
        // `AllTrue<never>` is `true` — so skip the whole-query `TokenizeLoose<N>`
        // re-walk (computed nowhere else) on dot-free queries. Exact-equivalent.
        : N extends `${string}.${string}`
            ? AllTrue<
                QualifiedColumnRefs<TokenizeLoose<N>, S, Tables, Aliases> extends infer R
                    ? R extends `${infer Q}.${string}`
                        ? QualifierShadowedByAlias<Q, Tables, Aliases, S> extends true
                            ? false
                            : true
                        : true
                    : true
            >
            : true;

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
        // Cheap pre-gate: `StripSubqueries` only excises parens that contain a
        // `select`, so unless the query has a `(` followed somewhere by `select`
        // (a parenthesised subquery), the body validates the whole query — already
        // done by the core scan — and is necessarily `true`. Tightening the old
        // "any `(`" gate skips `StripSubqueries` on queries whose only parens are
        // function/grouping. A subquery's `select` is always preceded by its own
        // `(`, so this superset never misses a real scope leak (incl. `( select`).
        ? Lowercase<N> extends `${string}(${string}select${string}`
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
                : UnqualifiedColumnValid<Cols, Tables, Aliases, S> extends true
                    ? true
                    // A derived/VALUES source's column-alias list (`... ) as
                    // src(id, t)`) survives tokenization as bare identifier tokens,
                    // and `t` is not a schema column anywhere — bless names that
                    // belong to such a list. Checked ONLY after normal resolution
                    // fails, so valid queries never pay for the extraction, and
                    // blessing can only turn a reject into an accept (lenient
                    // contract).
                    : CleanIdent<Cols> extends SourceAliasListCols<N>
                        ? true
                        : false
            : true
    >
    : true;

// Every column name bound by a derived-source column-alias list — `) as p(a, b)`
// / `) p(a, b)` — plus CTE column-alias lists (`with c(x, y) as (`). Collected
// across ALL occurrences in the (normalized, single-line) query. The alias word
// itself must be space-free, mirroring `DerivedColsAfterAlias`'s guard, so a
// trailing `WHERE ... IN (...)` paren group is not misread as a column list.
type SourceAliasListCols<N extends string> =
    N extends `with ${infer CteHead}(${infer CteCols}) as (${infer Rest}`
        ? AliasHasNoSpace<Trim<CteHead>> extends true
            ? ColNamesFromList<CteCols> | DerivedAliasListCols<Rest>
            : DerivedAliasListCols<N>
        : DerivedAliasListCols<N>;

type DerivedAliasListCols<N extends string, Steps extends any[] = []> =
    Steps["length"] extends 15
        ? never
        : N extends `${string}) as ${infer Rest}`
            ? Rest extends `${infer Alias}(${infer Cols})${infer Tail}`
                ? AliasHasNoSpace<Trim<Alias>> extends true
                    ? ColNamesFromList<Cols> | DerivedAliasListCols<Tail, [any, ...Steps]>
                    : DerivedAliasListCols<Tail, [any, ...Steps]>
                : never
            : never;

type ColNamesFromList<L extends string> =
    L extends `${infer A},${infer R}`
        ? CleanIdent<A> | ColNamesFromList<R>
        : CleanIdent<L>;
