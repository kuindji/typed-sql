// Normalization & string utilities

export type NormalizeQuery<S extends string> =
    Trim<RemoveTrailingSemicolon<CollapseSpaces<ReplaceWhitespace<LowercaseOutsideQuotes<S>>>>>;

export type LowercaseOutsideQuotes<
    S extends string,
    InSingleQuote extends boolean = false,
    InDoubleQuote extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = []
> = string extends S
    ? string
    : Steps["length"] extends 120
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
    Steps extends any[] = []
> = Steps["length"] extends 1500
    ? [...Acc, ...Split<`${Cur}${S}`, ",">]
    : string extends CleanIdent<S>
        ? [...Acc, `${Cur}string`]
        : S extends `${infer C}${infer Rest}`
        ? C extends "("
            ? SplitTopLevel<Rest, [any, ...Depth], Acc, `${Cur}${C}`, [any, ...Steps]>
            : C extends ")"
                ? SplitTopLevel<Rest, Depth extends [any, ...infer D] ? D : [], Acc, `${Cur}${C}`, [any, ...Steps]>
                : C extends ","
                    ? Depth["length"] extends 0
                        ? SplitTopLevel<Rest, Depth, [...Acc, Cur], "", [any, ...Steps]>
                        : SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps]>
                    : SplitTopLevel<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps]>
        : [...Acc, Cur];

// Extract select list before top-level FROM (paren- and quote-aware).

export type ExtractBeforeFromTopLevel<
    S extends string,
    Depth extends any[] = [],
    InString extends boolean = false,
    Acc extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 350
    ? `${Acc}${ExtractBefore<S, " from ">}`
    : Depth["length"] extends 0
        ? InString extends false
            ? S extends ` from ${string}`
                ? Acc
                : S extends `${infer C}${infer Rest}`
                    ? C extends "'"
                        ? ExtractBeforeFromTopLevel<Rest, Depth, true, `${Acc}${C}`, [any, ...Steps]>
                        : C extends "("
                            ? ExtractBeforeFromTopLevel<Rest, [any, ...Depth], InString, `${Acc}${C}`, [any, ...Steps]>
                            : C extends ")"
                                ? ExtractBeforeFromTopLevel<Rest, Depth extends [any, ...infer D] ? D : [], InString, `${Acc}${C}`, [any, ...Steps]>
                                : ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps]>
                    : Acc
            : S extends `${infer C}${infer Rest}`
                ? C extends "'"
                    ? ExtractBeforeFromTopLevel<Rest, Depth, false, `${Acc}${C}`, [any, ...Steps]>
                    : C extends "("
                        ? ExtractBeforeFromTopLevel<Rest, [any, ...Depth], InString, `${Acc}${C}`, [any, ...Steps]>
                        : C extends ")"
                            ? ExtractBeforeFromTopLevel<Rest, Depth extends [any, ...infer D] ? D : [], InString, `${Acc}${C}`, [any, ...Steps]>
                            : ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps]>
                : Acc
        : S extends `${infer C}${infer Rest}`
            ? C extends "'"
                ? ExtractBeforeFromTopLevel<Rest, Depth, InString extends true ? false : true, `${Acc}${C}`, [any, ...Steps]>
                : C extends "("
                    ? ExtractBeforeFromTopLevel<Rest, [any, ...Depth], InString, `${Acc}${C}`, [any, ...Steps]>
                    : C extends ")"
                        ? ExtractBeforeFromTopLevel<Rest, Depth extends [any, ...infer D] ? D : [], InString, `${Acc}${C}`, [any, ...Steps]>
                        : ExtractBeforeFromTopLevel<Rest, Depth, InString, `${Acc}${C}`, [any, ...Steps]>
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

export type ExtractAlias<E extends string> =
    SplitLast<Trim<E>, " as "> extends [infer Expr extends string, infer Alias extends string]
        ? Alias extends ""
            ? { expr: Trim<E>; alias: never }
            : Alias extends `${string})${string}`
                ? { expr: Trim<E>; alias: never }
                : { expr: Trim<Expr>; alias: CleanIdent<Alias> }
        : { expr: Trim<E>; alias: never };

export type AliasResultKey<S extends string> =
    Trim<S> extends `"${infer Q}"` ? Q : CleanIdent<S>;

export type ExtractAliasResult<E extends string> =
    SplitLast<Trim<E>, " as "> extends [infer Expr extends string, infer Alias extends string]
        ? Alias extends ""
            ? { expr: Trim<E>; alias: never }
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
    Split<S, ","> extends infer Parts extends string[]
        ? MapLeftSide<Parts>
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

export type TokenizeLoose<N extends string> =
    FilterEmpty<MapCleanLoose<
        Split<CollapseSpaces<RestoreWildcards<PadOperators<ProtectWildcards<N>>>>, " ">
    >>;

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
    | "interval" | "nulls" | "first" | "last";

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
