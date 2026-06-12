// Validation entry point, dispatch, complexity gates, query-kind helpers.
import type { AliasesInQuery, TableKeyValid, TablesInQuery, UpdateTargetTable } from "../tables.js";
import type { AllColumnsValidFor, AllTablesValidFor, ColumnsValidInSelectOrReturningFor, NoAliasShadowedQualifiers, OuterScopeUnqualifiedValid, QualifiedColumnRefsValidFor, UnqualifiedColumnRefsValidFor, ValidateCteShape, ValidateDerivedShape } from "./validate-columns.js";
import type { And, StartsWith } from "../utils.js";
import type { CteNames, NonCteTables, SingleCteMatch } from "./cte.js";
import type { DatabaseSchema } from "../schema.js";
import type { DerivedAliasName, DerivedFirstWord, DerivedTableMatch } from "./return-derived.js";
import type { DistinctOnColsValid, JoinUsingColsValid, WindowFilterColsValid } from "./joins.js";
import type { ExceedsLengthBudget, ExtractBefore, ExtractLastWhere, HasLineBreaks, Trim, ValidationScanView } from "../parsing.js";
import type { RefScanSegment } from "./return-types.js";
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
> = And<
        QualifiedColumnRefsValidFor<W, S, TargetKey, AliasEntry, W>,
        UnqualifiedColumnRefsValidFor<W, S, TargetKey, AliasEntry, W, never>,
        true,
        true,
        true
    >;

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
            ? AllTablesValidFor<NonCteTables<N, S, Tables>, S> extends true
                ? AllColumnsValidFor<N, S, Tables, Aliases, RefScanSegment<N>> extends true
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
        : false;


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

// Quote-free fast-path: a query with no `'` and no `"` has no place for a
// ` returning ` to hide, so every occurrence is top-level — a single pattern test
// is exact and skips the walk (these run on every DML). Only quote-bearing
// queries pay for the walk below. The fast-path pattern matches the step-cap
// fallback this walk already uses, so it is consistent with prior behavior.
export type HasReturningQuoteAware<S extends string> =
    string extends S
        ? false
        : S extends `${string}'${string}`
            ? HasReturningQuoteAwareWalk<S>
            : S extends `${string}"${string}`
                ? HasReturningQuoteAwareWalk<S>
                : S extends `${string} returning ${string}` ? true : false;

// Quote-jump, not per-char (the old walk minted the tail string PER CHARACTER on
// every quote-bearing DML). Find the leftmost ` returning `; if no quote opens
// before it, it is top-level — answer found. Otherwise jump the leftmost quote
// span whole (`'…'` or `"…"`, whichever opens first — a quote of the other kind
// inside the span is data, mirroring the old InString/InDString suppression) and
// re-test the remainder. O(quote spans) instead of O(chars); an unterminated
// quote swallows the rest, exactly like the old walk-to-EOF inside a literal.
type HasReturningQuoteAwareWalk<
    S extends string,
    Steps extends any[] = []
> = string extends S
    ? false
    : Steps["length"] extends 400
        ? S extends `${string} returning ${string}` ? true : false
        : S extends `${infer Before} returning ${string}`
            ? Before extends `${string}'${string}` | `${string}"${string}`
                ? HrqaQuoteJump<S, Steps>
                : true
            : false;

// Leftmost of `'` / `"` (the caller guarantees at least one occurs before the
// first ` returning `): skip its whole span, resume after the closing quote.
type HrqaQuoteJump<S extends string, Steps extends any[]> =
    S extends `${infer P}'${infer R}`
        ? P extends `${string}"${string}`
            ? HrqaDQuoteJump<S, Steps>
            : R extends `${string}'${infer R2}`
                ? HasReturningQuoteAwareWalk<R2, [any, ...Steps]>
                : false
        : HrqaDQuoteJump<S, Steps>;

type HrqaDQuoteJump<S extends string, Steps extends any[]> =
    S extends `${string}"${infer R}`
        ? R extends `${string}"${infer R2}`
            ? HasReturningQuoteAwareWalk<R2, [any, ...Steps]>
            : false
        : false;
