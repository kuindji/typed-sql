// Normalization & string utilities

export type NormalizeQuery<S extends string> =
    Trim<RemoveTrailingSemicolon<CollapseSpaces<ReplaceWhitespace<LowercaseOutsideQuotes<StripComments<S>>>>>>;

// Strip `/* ... */` block comments AND `-- ...` line comments before any other
// parsing so a comment between projection items (or anywhere else) doesn't
// survive into an expression and collapse the projected row to `never`. Runs
// FIRST in the pipeline, while line breaks are still present, so a line comment
// can be cut at its terminating newline.
//
// Quote-aware: comment markers inside a single-quoted string literal
// (`'/* not a comment */'`, `'-- nope'`) OR a double-quoted identifier
// (`"kept /* marker */ name"`) are preserved verbatim. The walk is the expensive
// part, so it is gated behind a cheap pre-check: only queries that actually
// contain a `/*` or `--` pay for the char-walk; everything else (the
// overwhelming common case) passes straight through untouched.
export type StripComments<S extends string> =
    string extends S
        ? S
        : S extends `${string}/*${string}`
            ? StripCommentsWalk<S>
            : S extends `${string}--${string}`
                ? StripCommentsWalk<S>
                : S;

// Char-walk implementation. Each block comment is replaced by a single space;
// each line comment is dropped up to (but not including) its newline so the
// surrounding structure is preserved for `ReplaceWhitespace`/`CollapseSpaces`.
// An unterminated `/*` drops everything from the `/*` onward. Bounded at 500
// steps — on bail the remainder is appended as-is, mirroring the truncation
// `LowercaseOutsideQuotes` already accepts for report-scale strings.
// `InString` tracks a single-quoted string literal; `InDString` tracks a
// double-quoted identifier. While inside EITHER, characters (including `/*` and
// `--`) are copied verbatim — only outside both are comment markers honoured.
export type StripCommentsWalk<
    S extends string,
    InString extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = [],
    InDString extends boolean = false
> = string extends S
    ? S
    : Steps["length"] extends 500
        ? `${Acc}${S}`
        : InString extends true
            ? S extends `${infer C}${infer Rest}`
                ? StripCommentsWalk<Rest, C extends "'" ? false : true, `${Acc}${C}`, [any, ...Steps], InDString>
                : Acc
            : InDString extends true
                ? S extends `${infer C}${infer Rest}`
                    ? StripCommentsWalk<Rest, InString, `${Acc}${C}`, [any, ...Steps], C extends `"` ? false : true>
                    : Acc
                : S extends `/*${infer AfterOpen}`
                    ? AfterOpen extends `${infer _Body}*/${infer Tail}`
                        ? StripCommentsWalk<Tail, false, `${Acc} `, [any, ...Steps], false>
                        : `${Acc} `
                    : S extends `--${infer AfterDash}`
                        ? StripCommentsWalk<LineCommentTail<AfterDash>, false, `${Acc} `, [any, ...Steps], false>
                        : S extends `${infer C}${infer Rest}`
                            ? StripCommentsWalk<Rest, C extends "'" ? true : false, `${Acc}${C}`, [any, ...Steps], C extends `"` ? true : false>
                            : Acc;

// Skip a line comment body, returning the tail starting at the first newline
// (which is kept so words on either side of the comment can't merge). A comment
// that runs to the end of the string yields `""`. Bounded against runaway.
export type LineCommentTail<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 1000
        ? S
        : S extends `${infer C}${infer Rest}`
            ? C extends "\n" | "\r"
                ? S
                : LineCommentTail<Rest, [any, ...Steps]>
            : "";

// Quote-aware lowercasing: SQL keywords/identifiers are case-insensitive, but
// single-quoted string literals and double-quoted identifiers keep their exact
// case. The step cap guards against runaway recursion on report-scale strings;
// it is aligned with `ExceedsLengthBudget` (~500 chars) so every query that is
// FULLY validated (i.e. not handed to the high-complexity bypass) is also fully
// normalized — a quoted literal/alias near the end of a long query is no longer
// blanket-lowercased on bail.
export type LowercaseOutsideQuotes<
    S extends string,
    InSingleQuote extends boolean = false,
    InDoubleQuote extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? string
    : Steps["length"] extends 500
        ? `${Acc}${Lowercase<S>}`
        : S extends `${infer C}${infer Rest}`
            ? C extends "'"
                ? InDoubleQuote extends true
                    ? LowercaseOutsideQuotes<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                    : InSingleQuote extends true
                        ? LowercaseOutsideQuotes<Rest, false, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                        : LowercaseOutsideQuotes<Rest, true, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                : C extends `"`
                    ? InSingleQuote extends true
                        ? LowercaseOutsideQuotes<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                        : InDoubleQuote extends true
                            ? LowercaseOutsideQuotes<Rest, InSingleQuote, false, `${Acc}${C}`, [any, ...Steps]>
                            : LowercaseOutsideQuotes<Rest, InSingleQuote, true, `${Acc}${C}`, [any, ...Steps]>
                    : InSingleQuote extends true
                        ? LowercaseOutsideQuotes<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                        : InDoubleQuote extends true
                            ? LowercaseOutsideQuotes<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                            : LowercaseOutsideQuotes<Rest, InSingleQuote, InDoubleQuote, `${Acc}${Lowercase<C>}`, [any, ...Steps]>
            : Acc;

export type ReplaceWhitespace<S extends string> =
    TrimLeft<S> extends `update ${string}`
        ? HasLineBreaks<S> extends true
            ? ReplaceWhitespaceLimited<S, 700>
            : S
        : HasLineBreaks<S> extends true
            ? ReplaceWhitespaceLimited<S, 900>
            : S;

// Cheap "is this string longer than ~500 chars" check: drop 10 chars per step
// for up to 50 steps. If content survives all 50 drops the string exceeds the
// budget. Used to keep the expensive full validator off report-scale queries
// (which the high-complexity bypass protects) while still fully validating
// ordinary small queries. Chunked (10/step) so it stays far cheaper than a
// char-by-char walk.
export type ExceedsLengthBudget<S extends string, Steps extends any[] = []> =
    string extends S
        ? true
        : Steps["length"] extends 50
            ? S extends "" ? false : true
            : S extends ""
                ? false
                : ExceedsLengthBudget<Drop10Chars<S>, [any, ...Steps]>;

export type Drop10Chars<S extends string> =
    S extends `${infer _A}${infer _B}${infer _C}${infer _D}${infer _E}${infer _F}${infer _G}${infer _H}${infer _I}${infer _J}${infer R}`
        ? R
        : "";

export type HasLineBreaks<S extends string> =
    S extends `${string}\n${string}` ? true :
    S extends `${string}\t${string}` ? true :
    S extends `${string}\r${string}` ? true :
    false;

export type ReplaceWhitespaceLimited<
    S extends string,
    MaxSteps extends number,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? string
    : Steps["length"] extends MaxSteps
        ? `${Acc}${S}`
        : S extends `${infer C}${infer Rest}`
            ? C extends "\n" | "\t" | "\r"
                ? ReplaceWhitespaceLimited<Rest, MaxSteps, `${Acc} `, [any, ...Steps]>
                : ReplaceWhitespaceLimited<Rest, MaxSteps, `${Acc}${C}`, [any, ...Steps]>
            : Acc;

export type RemoveTrailingSemicolon<S extends string> =
    Trim<S> extends `${infer R};` ? Trim<R> : Trim<S>;

export type ReplaceAll<S extends string, From extends string, To extends string> =
    From extends ""
        ? S
        : ReplaceAllImpl<S, From, To>;

export type ReplaceAllImpl<
    S extends string,
    From extends string,
    To extends string,
    Steps extends any[] = []
> = Steps["length"] extends 250
    ? S
    : S extends `${infer Head}${From}${infer Tail}`
        ? `${Head}${To}${ReplaceAllImpl<Tail, From, To, [any, ...Steps]>}`
            : S;

export type CollapseSpaces<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 50
        ? S
        : S extends `${infer A}  ${infer B}`
            ? CollapseSpaces<`${A} ${B}`, [any, ...Steps]>
            : S;

export type TrimLeft<S extends string> = S extends `${Whitespace}${infer R}` ? TrimLeft<R> : S;

export type TrimRight<S extends string> = S extends `${infer R}${Whitespace}` ? TrimRight<R> : S;

export type Trim<S extends string> = TrimLeft<TrimRight<S>>;

export type Whitespace = " " | "\n" | "\t" | "\r";

// Clean identifiers

export type CleanIdent<S extends string> = Lowercase<Unquote<TrimPunctuation<Trim<S>>>>;

export type CleanExpr<S extends string> = Trim<S> extends infer T extends string ? T : S;

export type IsIdentifier<S extends string> =
    HasSpecial<S> extends true ? false : true;

export type IsRuntimeStringFragment<S extends string> =
    string extends S
        ? true
        : `${Lowercase<string>}` extends S
            ? true
            : string extends CleanIdent<S>
            ? true
            : false;

export type HasSpecial<S extends string> =
    S extends `${string} ${string}` ? true :
    S extends `${string}(${string}` ? true :
    S extends `${string})${string}` ? true :
    S extends `${string}+${string}` ? true :
    S extends `${string}-${string}` ? true :
    S extends `${string}*${string}` ? true :
    S extends `${string}/${string}` ? true :
    S extends `${string}=${string}` ? true :
    S extends `${string}<${string}` ? true :
    S extends `${string}>${string}` ? true :
    S extends `${string},${string}` ? true :
    S extends `${string}::${string}` ? true :
    S extends `${string}||${string}` ? true :
    false;

export type IsParamPlaceholder<S extends string> =
    S extends `$${string}` ? true :
    S extends `:${string}` ? true :
    S extends "?" ? true :
    false;

export type IsQualifiedRefCandidate<S extends string> =
    S extends `'${string}'` ? false :
    S extends `${number}.${number}` ? false :
    true;

export type IsSqlConstant<S extends string> =
    CleanIdent<S> extends SqlConstant ? true : false;

export type SqlConstantType<S extends string> =
    CleanIdent<S> extends "current_date" ? string :
    CleanIdent<S> extends "current_time" ? string :
    CleanIdent<S> extends "current_timestamp" ? string :
    CleanIdent<S> extends "localtime" ? string :
    CleanIdent<S> extends "localtimestamp" ? string :
    CleanIdent<S> extends "current_user" ? string :
    CleanIdent<S> extends "session_user" ? string :
    CleanIdent<S> extends "current_schema" ? string :
    string;

export type Unquote<S extends string> =
    S extends `"${infer R}"` ? R :
    S extends `\`${infer R}\`` ? R :
    S;

export type TrimPunctuation<S extends string> =
    S extends `${Punct}${infer R}` ? TrimPunctuation<R> :
    S extends `${infer R}${Punct}` ? TrimPunctuation<R> :
    S;

export type Punct = "," | ";" | "(" | ")";

// Split helpers

export type Split<
    S extends string,
    Delim extends string,
    Acc extends string[] = [],
    Steps extends any[] = []
> = Steps["length"] extends 2000
    ? [...Acc, S]
    : S extends `${infer Head}${Delim}${infer Tail}`
        ? Split<Tail, Delim, [...Acc, Head], [any, ...Steps]>
        : [...Acc, S];

export type SplitLast<S extends string, Delim extends string> =
    S extends `${infer Head}${Delim}${infer Tail}`
        ? Tail extends `${string}${Delim}${string}`
            ? SplitLast<Tail, Delim> extends [infer H2 extends string, infer T2 extends string]
                ? [`${Head}${Delim}${H2}`, T2]
                : [Head, Tail]
            : [Head, Tail]
        : [S, ""];

export type SplitOnDot<S extends string> =
    S extends `${infer A}.${infer B}` ? [A, ...SplitOnDot<B>] : [S];

export type SplitOnDotClean<S extends string> =
    SplitOnDot<S> extends [infer A extends string, infer B extends string, infer C extends string]
        ? [CleanIdent<A>, CleanIdent<B>, CleanIdent<C>]
        : SplitOnDot<S> extends [infer A extends string, infer B extends string]
            ? [CleanIdent<A>, CleanIdent<B>]
            : SplitOnDot<S> extends [infer A extends string]
                ? [CleanIdent<A>]
                : [];

export type MapClean<Tokens extends string[], Acc extends string[] = []> =
    Tokens extends [infer H extends string, ...infer R extends string[]]
        ? MapClean<R, [...Acc, CleanIdent<H> extends "" ? "" : TrimPunctuation<Trim<H>>]>
        : Acc;


export type MapCleanLoose<Tokens extends string[], Acc extends string[] = []> =
    Tokens extends [infer H extends string, ...infer R extends string[]]
        ? MapCleanLoose<R, [...Acc, CleanLooseToken<H>]>
        : Acc;

export type CleanLooseToken<S extends string> =
    S extends OperatorToken
        ? S
        : CleanIdent<S> extends ""
            ? ""
            : CleanIdent<S>;

export type FilterEmpty<Tokens extends string[], Acc extends string[] = []> =
    Tokens extends [infer H extends string, ...infer R extends string[]]
        ? H extends "" ? FilterEmpty<R, Acc> : FilterEmpty<R, [...Acc, H]>
        : Acc;

// Split by commas at top level (paren-aware). Safe fallbacks for deep strings.

export type SplitTopLevel<
    S extends string,
    Depth extends any[] = [],
    Acc extends string[] = [],
    Cur extends string = "",
    Steps extends any[] = [],
    InQ extends boolean = false,
    InDQ extends boolean = false
> = Steps["length"] extends 1500
    ? [...Acc, ...Split<`${Cur}${S}`, ",">]
    : string extends CleanIdent<S>
        ? [...Acc, `${Cur}string`]
        : S extends `${infer C}${infer Rest}`
        ? C extends "'"
            // A single quote toggles "inside string literal": commas, parens and
            // path braces inside a '...' literal are kept verbatim, not split.
            // Suppressed while inside a double-quoted identifier.
            ? InDQ extends true
                ? SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
                : SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ extends true ? false : true, InDQ>
            : InQ extends true
                ? SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
            : C extends `"`
                // A double quote toggles "inside quoted identifier": commas and
                // parens inside `"..."` are part of the identifier, kept verbatim.
                ? SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ extends true ? false : true>
            : InDQ extends true
                ? SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
            : C extends "("
                ? SplitTopLevel<Rest, [any, ...Depth], Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
                : C extends ")"
                    ? SplitTopLevel<Rest, Depth extends [any, ...infer D] ? D : [], Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
                    : C extends ","
                        ? Depth["length"] extends 0
                            ? SplitTopLevel<Rest, Depth, [...Acc, Cur], "", [any, ...Steps], InQ, InDQ>
                            : SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
                        : SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
        : [...Acc, Cur];

// Extract select list before top-level FROM (paren- and quote-aware).

// Quote-aware on BOTH single quotes (`'...'` string literals) and double quotes
// (`"..."` quoted identifiers): a ` from ` token sitting inside a double-quoted
// output alias (`id as "came from import"`) is part of the identifier, not the
// SELECT/FROM boundary, so it must not split the list. `InString` tracks single
// quotes; `InDString` tracks double quotes. Parens and the ` from ` boundary are
// only honoured when outside BOTH kinds of quote.
export type ExtractBeforeFromTopLevel<
    S extends string,
    Depth extends any[] = [],
    InString extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = [],
    InDString extends boolean = false
> = Steps["length"] extends 350
    ? `${Acc}${ExtractBefore<S, " from ">}`
    : InString extends true
        ? S extends `${infer C}${infer Rest}`
            ? C extends "'"
                ? ExtractBeforeFromTopLevel<Rest, Depth, false, `${Acc}${C}`, [any, ...Steps], InDString>
                : ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], InDString>
            : Acc
        : InDString extends true
            ? S extends `${infer C}${infer Rest}`
                ? C extends `"`
                    ? ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], false>
                    : ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], true>
                : Acc
            : Depth["length"] extends 0
                ? S extends ` from ${string}`
                    ? Acc
                    : S extends `${infer C}${infer Rest}`
                        ? C extends "'"
                            ? ExtractBeforeFromTopLevel<Rest, Depth, true, `${Acc}${C}`, [any, ...Steps], InDString>
                            : C extends `"`
                                ? ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], true>
                                : C extends "("
                                    ? ExtractBeforeFromTopLevel<Rest, [any, ...Depth], InString, `${Acc}${C}`, [any, ...Steps], InDString>
                                    : C extends ")"
                                        ? ExtractBeforeFromTopLevel<Rest, Depth extends [any, ...infer D] ? D : [], InString, `${Acc}${C}`, [any, ...Steps], InDString>
                                        : ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], InDString>
                        : Acc
                : S extends `${infer C}${infer Rest}`
                    ? C extends "'"
                        ? ExtractBeforeFromTopLevel<Rest, Depth, true, `${Acc}${C}`, [any, ...Steps], InDString>
                        : C extends `"`
                            ? ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], true>
                            : C extends "("
                                ? ExtractBeforeFromTopLevel<Rest, [any, ...Depth], InString, `${Acc}${C}`, [any, ...Steps], InDString>
                                : C extends ")"
                                    ? ExtractBeforeFromTopLevel<Rest, Depth extends [any, ...infer D] ? D : [], InString, `${Acc}${C}`, [any, ...Steps], InDString>
                                    : ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps], InDString>
                    : Acc;

// Simple comma split (no paren awareness)

export type SplitCommaSimple<S extends string> = SplitTopLevel<S>;

// Extract before delimiter if present

export type ExtractBefore<S extends string, Delim extends string> =
    S extends `${infer Head}${Delim}${infer _}` ? Head : S;

// Distinct

export type StripDistinct<S extends string> =
    // `DISTINCT ON (cols)` — drop the whole ON-list so it can't leak into the
    // projection. The list is parenthesised; keep everything after the `)`.
    Trim<S> extends `distinct on (${infer _On})${infer Rest}` ? Trim<Rest> :
    Trim<S> extends `distinct on(${infer _On})${infer Rest}` ? Trim<Rest> :
    Trim<S> extends `distinct ${infer R}` ? R :
    Trim<S> extends `all ${infer R}` ? R :
    Trim<S>;

// Alias

// An implicit output alias written as a trailing double-quoted identifier with
// no `AS` keyword: `id "implicit id"`. Postgres accepts this. We only recognize
// the QUOTED form (a bare `expr alias` is too ambiguous to tell from
// compound/function syntax). The match requires a non-empty expression before
// the ` "..."` and an alias body with no embedded `"`.
export type IsImplicitQuotedAlias<E extends string> =
    E extends `${infer Expr} "${infer Alias}"`
        ? Alias extends `${string}"${string}`
            ? false
            : Trim<Expr> extends ""
                ? false
                : true
        : false;

// A bare implicit output alias written as `expr alias` with NO `AS` keyword and
// NO quotes: `id user_id`, `count(*) total`. Postgres accepts this. It is
// deliberately CONSERVATIVE — only recognized when:
//   - `alias` (the last space-delimited token) is a simple identifier (no dot,
//     quotes, operators, parens) and is NOT a SQL reserved word; AND
//   - the remaining `expr` is EITHER a single simple column reference
//     (unqualified or `a.b` qualified, no spaces/operators) OR a single
//     function-call `fn(...)` with balanced parens and nothing after the `)`.
// Anything compound/ambiguous (operators, multiple tokens, CASE, etc.) is NOT
// treated as an implicit alias.
export type BareImplicitAliasParts<E extends string> =
    Trim<E> extends `${infer Head} ${infer LastTok}`
        ? SplitLast<Trim<E>, " "> extends [infer HExpr extends string, infer HAlias extends string]
            ? { expr: Trim<HExpr>; alias: Trim<HAlias> }
            : { expr: Trim<Head>; alias: Trim<LastTok> }
        : { expr: Trim<E>; alias: "" };

export type IsBareImplicitAlias<E extends string> =
    BareImplicitAliasParts<E> extends { expr: infer Expr extends string; alias: infer Alias extends string }
        ? Alias extends ""
            ? false
            : IsSimpleAliasToken<Alias> extends true
                ? IsImplicitAliasExpr<Expr> extends true
                    ? true
                    : false
                : false
        : false;

// The trailing token is a valid bare alias only when it is a plain identifier
// with no special chars/dots, and is not a SQL reserved word (so `as`, `from`,
// `where`, `order`, etc. never get mistaken for an alias).
export type IsSimpleAliasToken<A extends string> =
    A extends "" ? false :
    A extends `${string}.${string}` ? false :
    A extends `${string}"${string}` ? false :
    A extends `${string}'${string}` ? false :
    A extends `${string}*${string}` ? false :
    HasSpecial<A> extends true ? false :
    CleanIdent<A> extends SqlReserved ? false :
    true;

// The head expression of a bare implicit alias must be a SINGLE simple token:
// either a plain (possibly qualified `a.b`) column reference with no spaces or
// operators, OR a single function call `fn(...)` whose parens are balanced and
// with nothing trailing the closing `)`.
export type IsImplicitAliasExpr<Expr extends string> =
    Trim<Expr> extends ""
        ? false
        : Trim<Expr> extends `${infer Func}(${infer AfterOpen}`
            ? IsSimpleFuncName<Trim<Func>> extends true
                ? SplitBalancedParen<`(${AfterOpen}`> extends { rest: infer Rest extends string }
                    ? Trim<Rest> extends ""
                        ? true
                        : false
                    : false
                : false
            // Not a function call: must be a bare/qualified column ref — a single
            // token with no spaces, operators, parens, or quotes.
            : Trim<Expr> extends `${string} ${string}` ? false
            : Trim<Expr> extends `${string}'${string}` ? false
            : Trim<Expr> extends `${string}"${string}` ? false
            : Trim<Expr> extends `${string}(${string}` ? false
            : Trim<Expr> extends `${string})${string}` ? false
            : Trim<Expr> extends `${string}+${string}` ? false
            : Trim<Expr> extends `${string}-${string}` ? false
            : Trim<Expr> extends `${string}*${string}` ? false
            : Trim<Expr> extends `${string}/${string}` ? false
            : Trim<Expr> extends `${string}=${string}` ? false
            : Trim<Expr> extends `${string}<${string}` ? false
            : Trim<Expr> extends `${string}>${string}` ? false
            : Trim<Expr> extends `${string},${string}` ? false
            : Trim<Expr> extends `${string}::${string}` ? false
            : Trim<Expr> extends `${string}||${string}` ? false
            : CleanIdent<Expr> extends SqlReserved ? false
            : true;

// A function name preceding `(` must be a single simple identifier (`count`,
// `sum`, `coalesce`), not an operator-bearing expression.
export type IsSimpleFuncName<F extends string> =
    F extends "" ? false :
    F extends `${string} ${string}` ? false :
    HasSpecial<F> extends true ? false :
    true;

// A quoted identifier alias `"..."` may legally contain SQL punctuation,
// including `)`, `,`, etc. — those are part of the identifier, not structure.
export type IsQuotedIdentifier<S extends string> =
    Trim<S> extends `"${string}"` ? true : false;

export type ExtractAlias<E extends string> =
    SplitLast<Trim<E>, " as "> extends [infer Expr extends string, infer Alias extends string]
        ? Alias extends ""
            ? IsImplicitQuotedAlias<Trim<E>> extends true
                ? Trim<E> extends `${infer IExpr} "${infer IAlias}"`
                    ? { expr: Trim<IExpr>; alias: CleanIdent<IAlias> }
                    : { expr: Trim<E>; alias: never }
                : IsBareImplicitAlias<Trim<E>> extends true
                    ? BareImplicitAliasParts<Trim<E>> extends { expr: infer BExpr extends string; alias: infer BAlias extends string }
                        ? { expr: BExpr; alias: CleanIdent<BAlias> }
                        : { expr: Trim<E>; alias: never }
                    : { expr: Trim<E>; alias: never }
            : IsQuotedIdentifier<Alias> extends true
                ? { expr: Trim<Expr>; alias: CleanIdent<Alias> }
                : Alias extends `${string})${string}`
                    ? { expr: Trim<E>; alias: never }
                    : { expr: Trim<Expr>; alias: CleanIdent<Alias> }
        : { expr: Trim<E>; alias: never };

export type AliasResultKey<S extends string> =
    Trim<S> extends `"${infer Q}"` ? Q : CleanIdent<S>;

export type ExtractAliasResult<E extends string> =
    SplitLast<Trim<E>, " as "> extends [infer Expr extends string, infer Alias extends string]
        ? Alias extends ""
            ? IsImplicitQuotedAlias<Trim<E>> extends true
                ? Trim<E> extends `${infer IExpr} "${infer IAlias}"`
                    ? { expr: Trim<IExpr>; alias: IAlias }
                    : { expr: Trim<E>; alias: never }
                : IsBareImplicitAlias<Trim<E>> extends true
                    ? BareImplicitAliasParts<Trim<E>> extends { expr: infer BExpr extends string; alias: infer BAlias extends string }
                        ? { expr: BExpr; alias: AliasResultKey<BAlias> }
                        : { expr: Trim<E>; alias: never }
                    : { expr: Trim<E>; alias: never }
            : IsQuotedIdentifier<Alias> extends true
                ? { expr: Trim<Expr>; alias: AliasResultKey<Alias> }
                : Alias extends `${string})${string}`
                    ? { expr: Trim<E>; alias: never }
                    : { expr: Trim<Expr>; alias: AliasResultKey<Alias> }
        : { expr: Trim<E>; alias: never };

// Select / returning list parsing

export type ExtractSelectList<N extends string> =
    N extends `${infer _}select ${infer After}`
        ? StripDistinct<ExtractBeforeFromTopLevel<After>>
        : N extends `${infer _}with ${string} select ${infer After}`
            ? StripDistinct<ExtractBeforeFromTopLevel<After>>
            : "";

export type ExtractReturningList<N extends string> =
    N extends `${string} returning ${infer After}`
        ? After
        : "";

// Given a string whose first non-skipped char is `(`, consume the first
// balanced parenthesised group (quote-aware) and return its inner content plus
// whatever follows the matching `)`. Naive template matching can't do this
// because `${infer Body})` is lazy and stops at the first `)` (e.g. inside
// `count(*)`).
export type SplitBalancedParen<
    S extends string,
    Depth extends any[] = [],
    Acc extends string = "",
    InString extends boolean = false,
    Steps extends any[] = []
> = Steps["length"] extends 400
    ? { inner: Acc; rest: S }
    : S extends `${infer C}${infer Rest}`
        ? C extends "'"
            ? SplitBalancedParen<Rest, Depth, `${Acc}${C}`, InString extends true ? false : true, [any, ...Steps]>
            : InString extends true
                ? SplitBalancedParen<Rest, Depth, `${Acc}${C}`, InString, [any, ...Steps]>
                : C extends "("
                    ? Depth["length"] extends 0
                        ? SplitBalancedParen<Rest, [any], Acc, InString, [any, ...Steps]>
                        : SplitBalancedParen<Rest, [any, ...Depth], `${Acc}${C}`, InString, [any, ...Steps]>
                    : C extends ")"
                        ? Depth extends [any, ...infer D extends any[]]
                            ? D["length"] extends 0
                                ? { inner: Acc; rest: Rest }
                                : SplitBalancedParen<Rest, D, `${Acc}${C}`, InString, [any, ...Steps]>
                            : { inner: Acc; rest: Rest }
                        : SplitBalancedParen<Rest, Depth, `${Acc}${C}`, InString, [any, ...Steps]>
        : { inner: Acc; rest: "" };

// Collect the inner contents of every `<marker>(...)` group (quote/paren-aware),
// space-joined. Used to surface columns sitting inside `over (...)` / `filter
// (...)` clauses, which live in the SELECT list (before the top-level FROM) and
// would otherwise escape column validation entirely. Bounded against runaway.
export type ExtractCallParenBodies<
    S extends string,
    Marker extends string,
    Acc extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 12
    ? Acc
    : S extends `${infer _Head}${Marker}${infer AfterOpen}`
        ? SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string; rest: infer Rest extends string }
            ? ExtractCallParenBodies<Rest, Marker, `${Acc} ${Inner}`, [any, ...Steps]>
            : Acc
        : Acc;

// The predicate after the LAST ` where ` (drop any trailing RETURNING). In an
// UPDATE the giant SET expression — including any subquery WHEREs — comes BEFORE
// the statement's own WHERE, so the text after the last ` where ` is the
// top-level predicate. Implemented by discarding each `${head} where ` prefix
// (no string rebuild, unlike SplitLast — that concatenation is what blew up
// TS2589/memory on the largest correlated updates). Capped so a pathological
// number of nested WHEREs can't run away; on bail the caller's subquery guard
// handles the (paren-bearing) remainder.
export type ExtractLastWhere<N extends string> =
    ExtractBefore<Trim<LastWhereTail<N>>, " returning ">;

type LastWhereTail<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 16
        ? S
        : S extends `${infer _Head} where ${infer Rest}`
            ? LastWhereTail<Rest, [any, ...Steps]>
            : S;

// Everything after the top-level FROM (paren/quote-aware): the FROM clause and
// any trailing WHERE/GROUP/ORDER/etc. Used to detect derived tables.
export type ExtractFromClause<N extends string> =
    N extends `${infer _}select ${infer After}`
        ? ExtractBeforeFromTopLevel<After> extends infer SL extends string
            ? After extends `${SL} from ${infer FromRest}`
                ? FromRest
                : ""
            : ""
        : "";

// Select list helpers

export type SplitSelectList<S extends string> =
    S extends "" ? [] : SplitTopLevel<S>;

// Insert / update parsing

export type ExtractInsertColumns<N extends string> =
    N extends `${infer _}insert into ${infer Rest}`
        ? Rest extends `${infer _Table}(${infer Cols})${infer _}`
            ? SplitCommaSimple<Cols>
            : Rest extends `${infer _Table} (${infer Cols})${infer _}`
                ? SplitCommaSimple<Cols>
                : []
        : [];

export type ExtractConflictColumns<N extends string> =
    N extends `${string} on conflict ${infer Rest}`
        ? Rest extends `(${infer Cols})${string}`
            ? SplitCommaSimple<Cols>
            : Rest extends ` (${infer Cols})${string}`
                ? SplitCommaSimple<Cols>
                : []
        : [];

export type ExtractUpdateSetColumns<N extends string> =
    N extends `${infer _} set ${infer Rest}`
        ? ExtractBefore<Rest, " where "> extends infer Block1 extends string
            ? ExtractBefore<Block1, " returning "> extends infer Block2 extends string
                ? SplitAssignments<Block2>
                : []
            : []
        : [];

export type ExtractConflictUpdateSetColumns<N extends string> =
    N extends `${string} do update set ${infer Rest}`
        ? ExtractBefore<Rest, " where "> extends infer Block1 extends string
            ? ExtractBefore<Block1, " returning "> extends infer Block2 extends string
                ? SplitAssignments<Block2>
                : []
            : []
        : [];

// Update set list parsing

export type SplitAssignments<S extends string> =
    TrimLeft<S> extends `(${string}`
        // Row-assignment form `SET (a, b) = (v1, v2)`: the targets are the
        // parenthesised column list, not a single `left = right` assignment.
        // The naive comma split would break on the commas inside the tuples, so
        // pull the first balanced `(...)` group and split its inner column list.
        ? ExtractRowAssignTargets<TrimLeft<S>>
        : Split<S, ","> extends infer Parts extends string[]
            ? MapLeftSide<Parts>
            : [];

export type ExtractRowAssignTargets<S extends string> =
    SplitBalancedParen<S> extends { inner: infer Cols extends string; rest: infer _Rest extends string }
        ? FilterEmpty<MapClean<SplitCommaSimple<Cols>>>
        : [];

export type MapLeftSide<Parts extends string[], Acc extends string[] = []> =
    Parts extends [infer P extends string, ...infer Rest extends string[]]
        ? P extends `${infer Left}=${string}`
            ? Trim<Left> extends infer L extends string
                ? L extends ""
                    ? MapLeftSide<Rest, Acc>
                    : HasSpecial<L> extends true
                        ? MapLeftSide<Rest, Acc>
                        : MapLeftSide<Rest, [...Acc, L]>
                : MapLeftSide<Rest, Acc>
            : MapLeftSide<Rest, Acc>
        : Acc;

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
    >>>;

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

export type OperatorToken =
    | "(" | ")" | "," | "=" | "<" | ">" | "+" | "-" | "*" | "/" | "|" | "&" | "!" | "?";

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
    "?">;

// SQL keywords (minimal)

export type SqlKeyword =
    | "as" | "on" | "where" | "join" | "left" | "right" | "inner" | "outer" | "full" | "cross"
    | "group" | "order" | "by" | "having" | "limit" | "offset" | "union" | "select" | "from"
    | "update" | "insert" | "into" | "values" | "set" | "delete" | "returning" | "distinct";

export type SqlReserved =
    | SqlKeyword
    | "and" | "or" | "not" | "is" | "null" | "true" | "false"
    | "like" | "in" | "between" | "exists"
    | "case" | "when" | "then" | "else" | "end"
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
        | "between" | "like"
        ? true
        : false;
