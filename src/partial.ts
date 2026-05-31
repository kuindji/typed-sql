// Partial (fragment) query validation for the query builder. Each clause of a
// query gets its own validation entry point so the builder can validate a
// fragment in isolation. A fragment usually cannot be fully validated — a
// reference whose table/alias is defined in some other (out-of-scope) part is
// SKIPPED, never failed. Only references resolvable within the fragment itself
// (its own tables/aliases, or a real schema-qualified table) are validated.

import type { DatabaseSchema, ColumnExists, TableExists } from "./schema.js";
import type {
    CleanExpr,
    CleanIdent,
    NormalizeQuery,
    SplitOnDotClean,
    TokenizeLoose
} from "./parsing.js";
import type {
    QualifiedColumnRefs,
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

// Validate every qualified column ref in a token list, partial-mode.
export type QualifiedColumnRefsValidPartialFor<
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    LooseTokens extends string[]
> = QualifiedColumnRefs<LooseTokens, S, Tables, Aliases> extends infer Cols
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
                ? TokenizeLoose<N> extends infer Toks extends string[]
                    ? QualifiedColumnRefsValidPartialFor<S, Tables, Aliases, Toks>
                    : true
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
