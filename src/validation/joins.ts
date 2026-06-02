// JOIN USING / window-filter / DISTINCT ON column validation.
import type { AllTrue, And, IsUnion } from "../utils.js";
import type { CleanIdent, ExtractCallParenBodies, SplitCommaSimple, TokenizeLoose, Trim } from "../parsing.js";
import type { ColumnExists, DatabaseSchema } from "../schema.js";
import type { QualifiedColumnRefsValidFor, UnqualifiedColumnRefsValidFor } from "./validate-columns.js";
import type { QueryKind } from "./dispatch.js";
import type { TableKeyFromToken, TableKeyValid } from "../tables.js";
import type { TablesWithColumn } from "../columns.js";
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

