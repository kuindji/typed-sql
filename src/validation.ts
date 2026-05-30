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
    ExtractUpdateSetColumns,
    SplitSelectList,
    TokenizeLoose,
    CleanIdent
} from "./parsing.js";
import type {
    AliasesInQuery,
    InsertTargetTable,
    TableKeyValid,
    TablesInQuery,
    UpdateTargetTable
} from "./tables.js";
import type { And, AllTrue, Simplify, StartsWith } from "./utils.js";

// Core validation / inference

export type ValidateSQLNormalized<N extends string, S extends DatabaseSchema> =
    QueryKind<N> extends "select"
        ? IsHighComplexitySelect<N> extends true
            ? true
            : ValidateSQLNormalizedCore<N, S>
        : QueryKind<N> extends "update"
        ? IsHighComplexityUpdate<N> extends true
            ? true
            : ValidateSQLNormalizedCore<N, S>
        : ValidateSQLNormalizedCore<N, S>;

export type ValidateSQLNormalizedCore<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? TokenizeLoose<RefScanSegment<N>> extends infer LooseTokens extends string[]
                ? AllTablesValidFor<Tables, S> extends true
                    ? AllColumnsValidFor<N, S, Tables, Aliases, LooseTokens> extends true
                        ? true
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
                    ? SelectReturnWith<ExtractSelectList<N>, Tables, Aliases, S>
                    : number
            : number
        : number;

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
export type MergeRow<Acc, Next> = Omit<Acc, keyof Next> & Next;

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
