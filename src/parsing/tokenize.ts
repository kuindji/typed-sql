// Tokenization, sentinels, operators, and SQL keyword sets.
import type { CleanIdent, CleanLooseToken, CollapseSpaces, ReplaceAll, Split, Trim, TrimPunctuation } from "./string-utils.js";
import type { ExceedsLengthBudget, HasLineBreaks } from "./normalize.js";
// Tokenization & parsing helpers

export type Tokenize<N extends string> = CleanFilterTokens<Split<N, " ">>;

// Sentinel token standing in for a TOP-LEVEL comma. It survives `MapClean`
// (no stripped punctuation, non-empty identifier) whereas a bare `,` does not,
// so it cleanly distinguishes a FROM-source separator from a comma nested in
// parens / a string literal — which must still be dropped as before.
// A control char unrepresentable in real SQL: 1 char instead of the old
// 13-char `__tsqlcomma__`, so every marked query string and every token list
// it flows through interns ~14 fewer chars per top-level comma. Neutral to
// the pipeline: not in `Punct`/`Whitespace`/`DQuotedPunct`/`OperatorToken`,
// and `Lowercase`/`CleanIdent` leave it intact.
export type CommaSep = "";

// Replace only TOP-LEVEL commas (paren depth 0, outside single OR double quotes)
// with the `CommaSep` sentinel (space-padded so it tokenizes on its own). Commas
// nested inside parens (`count(a, b)`, FROM subqueries, `insert (x, y)`, value
// tuples), string literals, or quoted identifiers (`users as "u,1"`) are left
// verbatim and get stripped by `MapClean` as today.
//
// Segment-jump, not per-char (the old walk minted one growing-`Acc` string PER
// CHARACTER on every under-budget query). Each step advances to the LEFTMOST of
// the five state chars `,` `'` `"` `(` `)`, copying the whole run before it in a
// single mint; inside a quote it jumps straight to the closing quote, exactly
// like `LowercaseOutsideQuotesWorker` (`''` escapes exit+re-enter across two
// jumps; an unterminated quote at EOF copies the rest verbatim). The `Steps` cap
// counts JUMPS and yields `{ __c: [...] }` to the driver, so arbitrarily
// boundary-dense inputs still complete without a partial-output bail.
export type MarkTopLevelCommas<S extends string> =
    string extends S
        ? S
        : MtcDrive<MtcWorker<S, [], false, false, "", []>>;

type MtcDrive<R> =
    R extends { __c: [infer S extends string, infer D extends any[], infer Q1 extends boolean, infer Q2 extends boolean, infer Acc extends string] }
        ? MtcDrive<MtcWorker<S, D, Q1, Q2, Acc, []>>
        : R;

type MtcHasStruct<S extends string> =
    S extends `${string}'${string}` ? true
    : S extends `${string}"${string}` ? true
    : S extends `${string}(${string}` ? true
    : S extends `${string})${string}` ? true
    : false;

type MtcWorker<
    S extends string,
    Depth extends any[],
    InString extends boolean,
    InDString extends boolean,
    Acc extends string,
    Steps extends any[]
> = Steps["length"] extends 450
    ? { __c: [S, Depth, InString, InDString, Acc] }
    : InString extends true
        ? S extends `${infer P}'${infer R}`
            ? MtcWorker<R, Depth, false, InDString, `${Acc}${P}'`, [any, ...Steps]>
            : `${Acc}${S}`
        : InDString extends true
            ? S extends `${infer P}"${infer R}`
                ? MtcWorker<R, Depth, InString, false, `${Acc}${P}"`, [any, ...Steps]>
                : `${Acc}${S}`
            : S extends `${infer P},${infer R}`
                // a structural char in the run before the first comma → it is
                // leftmost; defer to the struct jump
                ? MtcHasStruct<P> extends true
                    ? MtcStructJump<S, Depth, Acc, Steps>
                    : Depth["length"] extends 0
                        ? MtcWorker<R, Depth, false, false, `${Acc}${P} ${CommaSep} `, [any, ...Steps]>
                        : MtcWorker<R, Depth, false, false, `${Acc}${P},`, [any, ...Steps]>
                : MtcHasStruct<S> extends true
                    ? MtcStructJump<S, Depth, Acc, Steps>
                    : `${Acc}${S}`;

// Leftmost of `'` / `"` / `(` / `)` (the caller guarantees at least one occurs
// before any comma). Pairwise narrowing: split on a candidate; if an
// earlier-class char appears in its prefix, that one is leftmost instead.
type MtcStructJump<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}'${infer R}`
    ? P extends `${string}"${string}` | `${string}(${string}` | `${string})${string}`
        ? MtcStructJump2<S, Depth, Acc, Steps>
        : MtcWorker<R, Depth, true, false, `${Acc}${P}'`, [any, ...Steps]>
    : MtcStructJump2<S, Depth, Acc, Steps>;

type MtcStructJump2<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}"${infer R}`
    ? P extends `${string}(${string}` | `${string})${string}`
        ? MtcStructJump3<S, Depth, Acc, Steps>
        : MtcWorker<R, Depth, false, true, `${Acc}${P}"`, [any, ...Steps]>
    : MtcStructJump3<S, Depth, Acc, Steps>;

type MtcStructJump3<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}(${infer R}`
    ? P extends `${string})${string}`
        ? S extends `${infer P2})${infer R2}`
            ? MtcWorker<R2, Depth extends [any, ...infer D] ? D : [], false, false, `${Acc}${P2})`, [any, ...Steps]>
            : `${Acc}${S}`
        : MtcWorker<R, [any, ...Depth], false, false, `${Acc}${P}(`, [any, ...Steps]>
    : S extends `${infer P2})${infer R2}`
        ? MtcWorker<R2, Depth extends [any, ...infer D] ? D : [], false, false, `${Acc}${P2})`, [any, ...Steps]>
        : `${Acc}${S}`;

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
            : RestoreCleanFilterTokens<Split<MaybeMarkDQuotedSpaces<MarkTopLevelCommas<N>>, " ">>;

export type TokenizeLoose<N extends string> =
    RestoreCleanLooseFilterTokens<
        Split<CollapseSpaces<RestoreWildcards<PadOperators<ProtectWildcards<MaybeMarkDQuotedSpaces<MaybeStripDQuotedPunct<N>>>>>>, " ">
    > extends infer Toks extends string[]
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
// unchanged.
//
// Span-jump, not per-char: nothing outside a double-quoted span changes, so each
// step jumps to the leftmost `"`, copies the whole preceding run in one mint,
// finds the closing `"` and rewrites only the (short) span interior. Like the
// old walk, single quotes are NOT tracked — every `"` toggles. An unterminated
// `"` at EOF keeps stripping to the end (the old InDQ-at-EOF behavior).
export type StripDQuotedPunct<
    S extends string,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? S
    : Steps["length"] extends 300
        ? `${Acc}${S}`
        : S extends `${infer P}"${infer R}`
            ? R extends `${infer Span}"${infer R2}`
                ? StripDQuotedPunct<R2, `${Acc}${P}"${StripPunctChars<Span>}"`, [any, ...Steps]>
                : `${Acc}${P}"${StripPunctChars<R>}`
            : `${Acc}${S}`;

// Per-char strip over a (short) double-quoted span interior only.
type StripPunctChars<S extends string, Acc extends string = "", Steps extends any[] = []> =
    Steps["length"] extends 200
        ? `${Acc}${S}`
        : S extends `${infer C}${infer Rest}`
            ? C extends DQuotedPunct
                ? StripPunctChars<Rest, Acc, [any, ...Steps]>
                : StripPunctChars<Rest, `${Acc}${C}`, [any, ...Steps]>
            : Acc;

// Sentinel standing in for a SPACE located INSIDE a double-quoted identifier.
// `Split<_, " ">` would otherwise break a quoted identifier that contains spaces
// (`"Order ID"`, `"user alias"`) into several tokens, so a quoted ORDER BY alias
// fails to resolve and a quoted table alias is mistaken for multiple table-source
// tokens. Marking the inner spaces keeps the identifier a single token through
// the space-split; `RestoreDQuotedSpaces` turns each sentinel back into a real
// space per-token before `CleanIdent`/`MapClean` runs. Mirrors `StripDQuotedPunct`.
// 1-char control sentinel (was the 12-char `__tsqldqsp__`) — same neutrality
// argument as `CommaSep`.
export type DQuoteSpaceSentinel = "";

// Only pay for the char-walk when there is actually a double quote present — the
// overwhelmingly common no-quote query short-circuits to identity.
export type MaybeMarkDQuotedSpaces<S extends string> =
    S extends `${string}"${string}` ? MarkDQuotedSpaces<S> : S;

// Span-jump sibling of `StripDQuotedPunct`: copy the run before the leftmost
// `"` in one mint, then mark the span interior's spaces via `ReplaceAll`
// (spans are short identifiers). Single quotes are NOT tracked — every `"`
// toggles, exactly like the old per-char walk; an unterminated `"` keeps
// marking to EOF.
export type MarkDQuotedSpaces<
    S extends string,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? S
    : Steps["length"] extends 300
        ? `${Acc}${S}`
        : S extends `${infer P}"${infer R}`
            ? R extends `${infer Span}"${infer R2}`
                ? MarkDQuotedSpaces<R2, `${Acc}${P}"${ReplaceAll<Span, " ", DQuoteSpaceSentinel>}"`, [any, ...Steps]>
                : `${Acc}${P}"${ReplaceAll<R, " ", DQuoteSpaceSentinel>}`
            : `${Acc}${S}`;

// Fused token post-passes: one walk instead of the old
// `FilterEmpty<MapClean<RestoreDQuotedSpaces<…>>>` three-walk chain. Each pass was
// an independent element-wise map/filter, so composing them per token yields the
// identical list (ordering preserved) while building the result spine once.
//
// The DQuote-space sentinel restore (`ReplaceAll<H, DQuoteSpaceSentinel, " ">`) lets
// a quoted identifier that survived the space-split as one token (`"Order ID"`,
// `"user alias".id`) clean to its true value. `CleanFilterTokens` is the no-restore
// variant (plain `Tokenize`, which never marks sentinels).
//
// MapClean maps each token to `CleanIdent<H> extends "" ? "" : TrimPunctuation<Trim<H>>`
// and FilterEmpty drops the `""`s. Since `CleanIdent = Lowercase<Unquote<TrimPunctuation<
// Trim<S>>>>`, a non-empty `CleanIdent<H>` guarantees a non-empty `TrimPunctuation<Trim<H>>`,
// so the kept value is never empty — the empty-token filter collapses to the single
// `CleanIdent<H> extends ""` test. (The loose variant keeps an explicit empty filter
// because `CleanLooseToken` can return `""` for a non-operator empty ident.)
export type CleanFilterTokens<Tokens extends string[], Acc extends string[] = []> =
    Tokens extends [infer H extends string, ...infer R extends string[]]
        ? CleanIdent<H> extends ""
            ? CleanFilterTokens<R, Acc>
            : CleanFilterTokens<R, [...Acc, TrimPunctuation<Trim<H>>]>
        : Acc;

export type RestoreCleanFilterTokens<Tokens extends string[], Acc extends string[] = []> =
    Tokens extends [infer H0 extends string, ...infer R extends string[]]
        ? ReplaceAll<H0, DQuoteSpaceSentinel, " "> extends infer H extends string
            ? CleanIdent<H> extends ""
                ? RestoreCleanFilterTokens<R, Acc>
                : RestoreCleanFilterTokens<R, [...Acc, TrimPunctuation<Trim<H>>]>
            : never
        : Acc;

export type RestoreCleanLooseFilterTokens<Tokens extends string[], Acc extends string[] = []> =
    Tokens extends [infer H0 extends string, ...infer R extends string[]]
        ? CleanLooseToken<ReplaceAll<H0, DQuoteSpaceSentinel, " ">> extends infer M extends string
            ? M extends ""
                ? RestoreCleanLooseFilterTokens<R, Acc>
                : RestoreCleanLooseFilterTokens<R, [...Acc, M]>
            : never
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

// Pairwise marker-jump: hop to the opening `'`, then to its closing `'`, emitting
// the verbatim prefix plus a blanked body `''`, and recurse on the tail. The `''`
// SQL escape pairs LEFTMOST exactly as the old per-char toggle did (`'it''s'` →
// `''''`); an UNTERMINATED opener (no closing `'`) is closed off with an appended
// `'`, matching the old EOF-in-string branch (`${Acc}'`), so `…'xyz` → `…''`. Depth
// is now the NUMBER OF LITERALS (a handful), not the string length (≤600 before).
// Step cap retained purely as a runaway backstop for a pathological quote storm.
export type BlankSingleQuotedLiterals<
    S extends string,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? S
    : Steps["length"] extends 300
        ? `${Acc}${S}`
        : S extends `${infer Pre}'${infer Rest}`
            ? Rest extends `${infer _Lit}'${infer After}`
                ? BlankSingleQuotedLiterals<After, `${Acc}${Pre}''`, [any, ...Steps]>
                : `${Acc}${Pre}''`
            : `${Acc}${S}`;

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

// `.` control sentinel (was `.__wildcard__`) keeps the qualified `.*`
// out of `PadOperators`' `*` padding; `` itself is never padded.
export type ProtectWildcards<S extends string> =
    ReplaceAll<S, ".*", ".">;

export type RestoreWildcards<S extends string> =
    ReplaceAll<S, ".", ".*">;

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
