// Tokenization, sentinels, operators, and SQL keyword sets.
import type { CollapseSpaces, FilterEmpty, MapClean, MapCleanLoose, ReplaceAll, Split } from "./string-utils.js";
import type { ExceedsLengthBudget, HasLineBreaks } from "./normalize.js";
// Tokenization & parsing helpers

export type Tokenize<N extends string> = FilterEmpty<MapClean<Split<N, " ">>>;

// Sentinel token standing in for a TOP-LEVEL comma. It survives `MapClean`
// (no stripped punctuation, non-empty identifier) whereas a bare `,` does not,
// so it cleanly distinguishes a FROM-source separator from a comma nested in
// parens / a string literal — which must still be dropped as before.
export type CommaSep = "__tsqlcomma__";

// Replace only TOP-LEVEL commas (paren depth 0, outside single OR double quotes)
// with the `CommaSep` sentinel (space-padded so it tokenizes on its own). Commas
// nested inside parens (`count(a, b)`, FROM subqueries, `insert (x, y)`, value
// tuples), string literals, or quoted identifiers (`users as "u,1"`) are left
// verbatim and get stripped by `MapClean` as today. The `InDString` arm tracks
// double-quoted identifiers so a comma inside a quoted table/column alias is not
// mistaken for a FROM-source separator. Char-walk mirrors `SplitTopLevel` /
// `StripComments`; step-bounded.
export type MarkTopLevelCommas<
    S extends string,
    Depth extends any[] = [],
    InString extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = [],
    InDString extends boolean = false
> = string extends S
    ? S
    : Steps["length"] extends 1500
        ? `${Acc}${S}`
        : S extends `${infer C}${infer Rest}`
            ? InDString extends true
                ? MarkTopLevelCommas<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], C extends `"` ? false : true>
                : C extends "'"
                    ? MarkTopLevelCommas<Rest, Depth, InString extends true ? false : true, `${Acc}${C}`, [any, ...Steps], InDString>
                    : InString extends true
                        ? MarkTopLevelCommas<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], InDString>
                        : C extends `"`
                            ? MarkTopLevelCommas<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], true>
                            : C extends "("
                                ? MarkTopLevelCommas<Rest, [any, ...Depth], InString, `${Acc}${C}`, [any, ...Steps], InDString>
                                : C extends ")"
                                    ? MarkTopLevelCommas<Rest, Depth extends [any, ...infer D] ? D : [], InString, `${Acc}${C}`, [any, ...Steps], InDString>
                                    : C extends ","
                                        ? Depth["length"] extends 0
                                            ? MarkTopLevelCommas<Rest, Depth, InString, `${Acc} ${CommaSep} `, [any, ...Steps], InDString>
                                            : MarkTopLevelCommas<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], InDString>
                                        : MarkTopLevelCommas<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], InDString>
            : Acc;

// Token stream for the table/alias collectors: identical to `Tokenize` except
// top-level commas survive as `CommaSep` tokens (so `from a, b` exposes its
// source boundary). Used ONLY by `TablesInQuery` / `AliasesInQuery`.
//
// Report-scale queries (multi-line, or very long) skip the comma-marking
// char-walk and fall back to plain `Tokenize` — the same big-query light path
// `ValidateSQLNormalizedLightSelect` already takes. A comma cross-join in such a
// query is negligibly rare, and avoiding the extra instantiation depth keeps the
// largest analytics queries under the TS recursion limit.
export type TokenizeTables<N extends string> =
    HasLineBreaks<N> extends true
        ? Tokenize<N>
        : ExceedsLengthBudget<N> extends true
            ? Tokenize<N>
            : FilterEmpty<MapClean<RestoreDQuotedSpaces<Split<MaybeMarkDQuotedSpaces<MarkTopLevelCommas<N>>, " ">>>>;

export type TokenizeLoose<N extends string> =
    FilterEmpty<MapCleanLoose<RestoreDQuotedSpaces<
        Split<CollapseSpaces<RestoreWildcards<PadOperators<ProtectWildcards<MaybeMarkDQuotedSpaces<MaybeStripDQuotedPunct<N>>>>>>, " ">
    >>> extends infer Toks extends string[]
        ? N extends `${string}distinct ${string}`
            ? DropDistinctFrom<Toks>
            : Toks
        : [];

// `IS [NOT] DISTINCT FROM` is a comparison operator: its `from` is operator text,
// NOT a FROM clause / table-source boundary. The column ref-scanner skips a token
// whose `Prev` is `from` (treating it as a table source), so the RHS expression of
// the operator (`price IS DISTINCT FROM bogus_col`) escapes validation entirely
// (round-13 D1/D2). Drop the operator `from` — the one directly preceded by
// `distinct` — from the token list so the RHS's `Prev` becomes `distinct`, which
// `CanPrecedeColumn` already blesses, and the column is validated like any other.
// `distinct` is immediately followed by the bare token `from` ONLY in this
// operator, so the rewrite is unambiguous. The real FROM-clause `from` is untouched.
export type DropDistinctFrom<
    Tokens extends string[],
    Acc extends string[] = [],
    Prev extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 400
    ? [...Acc, ...Tokens]
    : Tokens extends [infer H extends string, ...infer R extends string[]]
        ? H extends "from"
            ? Prev extends "distinct"
                ? DropDistinctFrom<R, Acc, "from", [any, ...Steps]>
                : DropDistinctFrom<R, [...Acc, H], H, [any, ...Steps]>
            : DropDistinctFrom<R, [...Acc, H], H, [any, ...Steps]>
        : Acc;

// Operator/comma characters that `PadOperators` would split on. Inside a
// double-quoted identifier (`"u,1"`) these are part of the identifier, not
// structure, so splitting on them leaks bogus tokens (`u`, `1`) into the column
// ref-scan and falsely rejects an otherwise valid query. We drop them from inside
// double-quoted spans before padding so the identifier stays a single token.
export type DQuotedPunct =
    "(" | ")" | "," | "=" | "<" | ">" | "+" | "-" | "*" | "/" | "|" | "&" | "!" | "?";

// Only pay for the char-walk when there is actually a double quote to handle —
// the overwhelmingly common no-quote query short-circuits to identity.
export type MaybeStripDQuotedPunct<S extends string> =
    S extends `${string}"${string}` ? StripDQuotedPunct<S> : S;

// Quote-aware walk that removes `DQuotedPunct` characters located INSIDE a
// double-quoted span while leaving the quote characters and everything outside
// the quotes untouched. `"u,1"` -> `"u1"`; `"u1".id` (no inner punctuation) is
// unchanged. Step-bounded against runaway.
export type StripDQuotedPunct<
    S extends string,
    InDQ extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? S
    : Steps["length"] extends 1500
        ? `${Acc}${S}`
        : S extends `${infer C}${infer Rest}`
            ? C extends `"`
                ? StripDQuotedPunct<Rest, InDQ extends true ? false : true, `${Acc}${C}`, [any, ...Steps]>
                : InDQ extends true
                    ? C extends DQuotedPunct
                        ? StripDQuotedPunct<Rest, InDQ, Acc, [any, ...Steps]>
                        : StripDQuotedPunct<Rest, InDQ, `${Acc}${C}`, [any, ...Steps]>
                    : StripDQuotedPunct<Rest, InDQ, `${Acc}${C}`, [any, ...Steps]>
            : Acc;

// Sentinel standing in for a SPACE located INSIDE a double-quoted identifier.
// `Split<_, " ">` would otherwise break a quoted identifier that contains spaces
// (`"Order ID"`, `"user alias"`) into several tokens, so a quoted ORDER BY alias
// fails to resolve and a quoted table alias is mistaken for multiple table-source
// tokens. Marking the inner spaces keeps the identifier a single token through
// the space-split; `RestoreDQuotedSpaces` turns each sentinel back into a real
// space per-token before `CleanIdent`/`MapClean` runs. Mirrors `StripDQuotedPunct`.
export type DQuoteSpaceSentinel = "__tsqldqsp__";

// Only pay for the char-walk when there is actually a double quote present — the
// overwhelmingly common no-quote query short-circuits to identity.
export type MaybeMarkDQuotedSpaces<S extends string> =
    S extends `${string}"${string}` ? MarkDQuotedSpaces<S> : S;

export type MarkDQuotedSpaces<
    S extends string,
    InDQ extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? S
    : Steps["length"] extends 1500
        ? `${Acc}${S}`
        : S extends `${infer C}${infer Rest}`
            ? C extends `"`
                ? MarkDQuotedSpaces<Rest, InDQ extends true ? false : true, `${Acc}${C}`, [any, ...Steps]>
                : InDQ extends true
                    ? C extends " "
                        ? MarkDQuotedSpaces<Rest, InDQ, `${Acc}${DQuoteSpaceSentinel}`, [any, ...Steps]>
                        : MarkDQuotedSpaces<Rest, InDQ, `${Acc}${C}`, [any, ...Steps]>
                    : MarkDQuotedSpaces<Rest, InDQ, `${Acc}${C}`, [any, ...Steps]>
            : Acc;

// Restore the space sentinel to a real space in each token of a token list, so a
// quoted identifier that survived the space-split as one token (`"Order ID"`,
// `"user alias".id`) is cleaned to its true value (`order id`, `"user alias".id`).
export type RestoreDQuotedSpaces<Tokens extends string[], Acc extends string[] = []> =
    Tokens extends [infer H extends string, ...infer R extends string[]]
        ? RestoreDQuotedSpaces<R, [...Acc, ReplaceAll<H, DQuoteSpaceSentinel, " ">]>
        : Acc;

// A validation-only view of a query: blank the CONTENTS of every single-quoted
// string literal (`'anything'` -> `''`) and mask the interior spaces of every
// double-quoted identifier. Used SOLELY on the ValidateSQL path and computed once
// at the top (before dispatch), so the char-walk completes to a concrete string
// and never compounds with validation's own instantiation depth. The result path
// is untouched, so literal value types still infer from the original text (E1).
//
// String literal contents are never column/table references, yet their interior
// words survive tokenization as bare tokens once `PadOperators` splits on the
// `(`/`)`/`,` they may contain (`' over (bogus_col)'` -> ... `bogus_col` ...),
// and the raw space-anchored clause-marker scans (` over (` / ` filter (` /
// ` within group (` / ` distinct on (` / ` using (`) likewise match inside them.
// Blanking the literal removes both problems at once (round-12 S1–S5). Masking
// double-quoted spaces stops the same markers matching inside a quoted output
// alias (round-12 A1) while leaving the identifier intact for ref validation
// (`TokenizeLoose` restores the sentinel). The caller gates this behind a quote
// and within-budget pre-check so report-scale queries never run the walk.
export type ValidationScanView<S extends string> =
    S extends `${string}'${string}`
        ? MaybeMarkDQuotedSpaces<BlankSingleQuotedLiterals<S>>
        : MaybeMarkDQuotedSpaces<S>;

export type BlankSingleQuotedLiterals<
    S extends string,
    InString extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? S
    : Steps["length"] extends 600
        ? `${Acc}${S}`
        : InString extends true
            ? S extends `${infer C}${infer R}`
                ? C extends "'"
                    ? BlankSingleQuotedLiterals<R, false, `${Acc}'`, [any, ...Steps]>
                    : BlankSingleQuotedLiterals<R, true, Acc, [any, ...Steps]>
                : `${Acc}'`
            : S extends `${infer C}${infer R}`
                ? C extends "'"
                    ? BlankSingleQuotedLiterals<R, true, `${Acc}'`, [any, ...Steps]>
                    : BlankSingleQuotedLiterals<R, false, `${Acc}${C}`, [any, ...Steps]>
                : Acc;

export type OperatorToken =
    | "(" | ")" | "," | "=" | "<" | ">" | "+" | "-" | "*" | "/" | "|" | "&" | "!" | "?"
    // `~` / `!~` are PostgreSQL regex-match operators; `[` / `]` delimit array
    // literals/subscripts. Treating them as operators makes `CanPrecedeColumn`
    // bless the RHS expression so a column ref there is validated (e.g.
    // `title ~ bogus_col`, `tags @> array[bogus_col]`), and keeps the operator
    // tokens themselves from being mistaken for columns.
    | "~" | "[" | "]";

export type PadOperator<S extends string, Op extends string> =
    ReplaceAll<S, Op, ` ${Op} `>;

export type ProtectWildcards<S extends string> =
    ReplaceAll<S, ".*", ".__wildcard__">;

export type RestoreWildcards<S extends string> =
    ReplaceAll<S, ".__wildcard__", ".*">;

export type PadOperators<S extends string> =
    PadOperator<
        PadOperator<
            PadOperator<
                PadOperator<
                    PadOperator<
                        PadOperator<
                            PadOperator<
                                PadOperator<
                                    PadOperator<
                                        PadOperator<
                                            PadOperator<
                                                PadOperator<
                                                    PadOperator<
                                                        PadOperator<
                                                            PadOperator<
                                                                PadOperator<S, "(">,
                                                            ")">,
                                                        ",">,
                                                    "=">,
                                                "<">,
                                            ">">,
                                        "+">,
                                    "-">,
                                "*">,
                            "/">,
                        "|">,
                    "&">,
                "!">,
            // Split array literal/subscript brackets so the contents
            // (`array[bogus_col]`) tokenize and inner column refs are validated.
            "[">,
        "]">,
    "?">;

// SQL keywords (minimal)

export type SqlKeyword =
    | "as" | "on" | "where" | "join" | "left" | "right" | "inner" | "outer" | "full" | "cross"
    | "group" | "order" | "by" | "having" | "limit" | "offset" | "union" | "select" | "from"
    | "update" | "insert" | "into" | "values" | "set" | "delete" | "returning" | "distinct";

export type SqlReserved =
    | SqlKeyword
    | "and" | "or" | "not" | "is" | "null" | "true" | "false"
    | "like" | "ilike" | "in" | "between" | "exists"
    // Pattern-matching keywords: `SIMILAR TO <pattern>` and `LIKE ... ESCAPE
    // <char>`. The keywords themselves are never column references.
    | "similar" | "to" | "escape"
    | "case" | "when" | "then" | "else" | "end"
    // `ARRAY` in an array literal (`ARRAY[1, 2]`) is a constructor keyword, never
    // a column reference, so it must not be flagged as an invalid column.
    | "array"
    | "asc" | "desc" | "all"
    | "interval" | "nulls" | "first" | "last"
    // Window / frame clause keywords (inside OVER(...) / FILTER(...)): these are
    // never column references, so they must not be flagged as invalid columns.
    | "over" | "filter" | "partition" | "window" | "within"
    | "range" | "rows" | "groups" | "preceding" | "following" | "unbounded";

export type SqlConstant =
    | "current_date"
    | "current_time"
    | "current_timestamp"
    | "localtime"
    | "localtimestamp"
    | "current_user"
    | "session_user"
    | "current_schema";

export type CanPrecedeColumn<Token extends string> =
    Token extends "" ? true :
    Token extends OperatorToken ? (Token extends ")" ? false : true) :
    Token extends "select" | "where" | "on" | "and" | "or" | "by" | "having" | "set" | "values"
        | "returning" | "distinct" | "case" | "when" | "then" | "else" | "not" | "is" | "in"
        | "between" | "like" | "ilike"
        // RHS of `SIMILAR TO <pattern>` (the `to`) and `... ESCAPE <char>`
        // (the `escape`) are column-bearing expression positions, so an unknown
        // bareword there must be validated like any other RHS column.
        | "to" | "escape"
        ? true
        : false;
