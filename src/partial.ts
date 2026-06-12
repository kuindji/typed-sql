// Partial (fragment) query validation for the query builder. Each clause of a
// query gets its own validation entry point. Clause/SELECT validation is now
// scope-aware: the builder derives an alias→table map from the FROM+JOIN
// fragments once and passes it in (Tables/Aliases) so a qualified reference is
// checked against the whole query's scope, not just one fragment in isolation.
// Refs whose alias/table is still out of that scope, or that aren't plain
// `alias.col` identifiers, are SKIPPED rather than failed. FROM/JOIN fragments
// remain self-contained (validated against the schema directly).

import type { DatabaseSchema, ColumnExists, TableExists } from "./schema.js";
import type {
    CleanExpr,
    CleanIdent,
    ExtractBefore,
    HasSpecial,
    NormalizeQuery,
    SplitOnDotClean,
    SplitTopLevel,
    Trim
} from "./parsing.js";
import type {
    QualifiedRefScan,
    ResolveAlias,
    StripDoubleQuotes,
    TableKeysByName
} from "./columns.js";
import type { AliasesInQuery, TableKeyValid, TablesInQuery } from "./tables.js";
import type { AllTrue } from "./utils.js";

// Resolve a qualified-ref prefix to a known table key WITHIN the fragment, or
// `never` when it cannot be resolved (an out-of-scope alias/table -> skip):
//   1. an alias defined in this part
//   2. a table named in this part
//   3. a real table in the default schema with this name
// Unlike the full-query `ResolveTableKey`, there is NO phantom
// `${defaultSchema}.${Name}` fallback for names that are not real tables.
export type PartialResolvePrefix<
    Name extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    [ResolveAlias<CleanIdent<Name>, Aliases>] extends [never]
        ? [TableKeysByName<CleanIdent<Name>, Tables>] extends [never]
            ? TableExists<S, S["defaultSchema"], CleanIdent<Name>> extends true
                ? `${S["defaultSchema"]}.${CleanIdent<Name>}`
                : never
            : TableKeysByName<CleanIdent<Name>, Tables>
        : ResolveAlias<CleanIdent<Name>, Aliases>;

// Validate a single column-ref string in fragment mode:
//   - `prefix.*`        -> skip (no column to validate)
//   - schema.table.col  -> strict if schema.table is real, else skip
//   - prefix.col        -> strict if prefix resolves in-fragment, else skip
//   - bare col          -> skip (may belong to an out-of-fragment table)
export type ColumnRefValidPartialWith<
    ColRef extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    ColRef extends `${string}.*`
        ? true
        : SplitOnDotClean<StripDoubleQuotes<CleanExpr<ColRef>>> extends [infer A extends string, infer B extends string, infer C extends string]
            ? TableExists<S, A, B> extends true
                ? ColumnExists<`${A}.${B}`, C, S>
                : true
            : SplitOnDotClean<StripDoubleQuotes<CleanExpr<ColRef>>> extends [infer A extends string, infer B extends string]
                ? PartialResolvePrefix<A, Tables, Aliases, S> extends infer TK
                    ? [TK] extends [never]
                        ? true
                        : TK extends string
                            ? ColumnExists<TK, B, S>
                            : true
                    : true
                : true;

// Validate every qualified column ref in a fragment, partial-mode.
export type QualifiedColumnRefsValidPartialFor<
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    RefSeg extends string
> = QualifiedRefScan<RefSeg> extends infer Cols
    ? AllTrue<Cols extends string ? ColumnRefValidPartialWith<Cols, Tables, Aliases, S> : true>
    : true;

// Strict table-existence over every table named in the fragment. Vacuously
// `true` when the fragment names no table (`Tables` is `never`).
export type AllPartTablesValid<Tables extends string, S extends DatabaseSchema> =
    AllTrue<Tables extends string ? TableKeyValid<Tables, S> : true>;

// Shared validator for table-source fragments (FROM / JOIN): every named table
// must exist (strict), and every resolvable qualified ref must check out.
export type ValidateTableSourcePart<N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? AllPartTablesValid<Tables, S> extends true
                ? QualifiedColumnRefsValidPartialFor<S, Tables, Aliases, N>
                : false
            : true
        : true;

// A FROM fragment may arrive bare (`users u`) or led (`from users u`). The
// table/alias collectors key off the `from` keyword, so ensure it is present.
export type EnsureFromLed<N extends string> =
    N extends `from ${string}` ? N : `from ${N}`;

export type ValidateFromPart<Part extends string, S extends DatabaseSchema> =
    string extends Part
        ? false
        : NormalizeQuery<Part> extends infer N extends string
            ? ValidateTableSourcePart<EnsureFromLed<N>, S>
            : false;

export type ValidateJoinPart<Part extends string, S extends DatabaseSchema> =
    string extends Part
        ? false
        : NormalizeQuery<Part> extends infer N extends string
            ? ValidateTableSourcePart<N, S>
            : false;

// Clause fragments (SELECT list, WHERE, HAVING, GROUP BY, ORDER BY) carry no
// table source in isolation. Validate only refs resolvable without one
// (`schema.table.col` and real `table.col`); skip alias-qualified and bare cols.
export type ValidateClausePart<Part extends string, S extends DatabaseSchema> =
    string extends Part
        ? false
        : NormalizeQuery<Part> extends infer N extends string
            ? QualifiedColumnRefsValidPartialFor<S, never, never, N>
            : false;

// Scope-aware clause validation: identical to ValidateClausePart, but the
// alias->table map (built from FROM+JOIN by the builder) is threaded in so that
// alias-qualified refs (`u.col`) resolve and typos are caught.
export type ValidateClausePartScoped<
    Part extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    string extends Part
        ? false
        : NormalizeQuery<Part> extends infer N extends string
            ? QualifiedColumnRefsValidPartialFor<S, Tables, Aliases, N>
            : false;

// Expression-detector for a single SELECT-item token. HasSpecial covers space,
// parens, arithmetic/comparison operators, comma, `::`, `||`. We additionally
// reject `[ ] " ' :` so array-indexing, quoted-with-space idents, json arrows,
// and param/cast colons are treated as expressions (skipped, never falsely
// rejected). A token clearing this guard is a plain identifier piece.
type RefHasSpecial<S extends string> =
    HasSpecial<S> extends true ? true :
    S extends `${string}[${string}` ? true :
    S extends `${string}]${string}` ? true :
    S extends `${string}"${string}` ? true :
    S extends `${string}'${string}` ? true :
    S extends `${string}:${string}` ? true :
    false;

// True iff S is a plain two-part `alias.col` ref (no expression syntax).
// `${infer A}.${infer B}` binds A to the shortest pre-first-dot match; a 3-part
// `schema.table.col` leaves a dot in B and is rejected (skipped).
type IsPlainQualifiedRef<S extends string> =
    S extends `${infer A}.${infer B}`
        ? RefHasSpecial<A> extends true
            ? false
            : RefHasSpecial<B> extends true
                ? false
                : B extends `${string}.${string}`
                    ? false
                    : true
        : false;

// The leading token of a SELECT item with any trailing alias dropped
// (`o.id as foo` / `o.id foo` -> `o.id`). ExtractBefore returns the whole string
// when there is no space.
type SelectItemRef<Item extends string> = ExtractBefore<Trim<Item>, " ">;

// Validate ONE select item: resolve only plain `alias.col` refs; skip everything
// else (functions, CASE, casts, literals, `*`, quoted-space idents) -> true.
type SelectItemValid<
    Item extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = SelectItemRef<Item> extends infer Ref extends string
    ? IsPlainQualifiedRef<Ref> extends true
        ? ColumnRefValidPartialWith<Ref, Tables, Aliases, S>
        : true
    : true;

// Validate every top-level SELECT item. Early-exit on first false. Step-capped.
type SelectListValidScoped<
    List extends readonly string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> = Steps["length"] extends 200
    ? true
    : List extends readonly [infer H extends string, ...infer R extends readonly string[]]
        ? SelectItemValid<H, Tables, Aliases, S> extends false
            ? false
            : SelectListValidScoped<R, Tables, Aliases, S, [any, ...Steps]>
        : true;

// Identifiers-only SELECT validation: split the list at top-level commas
// (depth-safe, never normalizes expression bodies) and check only plain refs.
export type ValidateSelectIdentifiersScoped<
    Part extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = string extends Part
    ? false
    : SplitTopLevel<Part> extends infer Items extends readonly string[]
        ? SelectListValidScoped<Items, Tables, Aliases, S>
        : true;

// Distinct public entry points, identical in isolation; they will diverge once
// clause-specific context is threaded in (HAVING aggregates, GROUP BY/ORDER BY
// ordinals, SELECT `*`), so keep them as separate names rather than collapsing.
export type ValidateSelectPart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
export type ValidateWherePart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
export type ValidateHavingPart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
export type ValidateGroupByPart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
export type ValidateOrderByPart<Part extends string, S extends DatabaseSchema> =
    ValidateClausePart<Part, S>;
