// Low-level string primitives, predicates, and token cleaners.
import type { SqlConstant, OperatorToken } from "./tokenize.js";

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

// Collapse runs of consecutive spaces to a single space. A ladder of multi-space
// patterns removes up to 15 spaces per recursion step, so a deeply-indented
// report-scale query collapses in O(runs) rather than O(spaces) steps — keeping the
// downstream `Split<N, " ">` token walk well under TypeScript's tail-recursion
// limit. (A query whose normalized form carried 1000+ spaces previously overflowed
// `Split` with TS2589.) Tail-recursive; cap high enough for multi-thousand-space
// analytics queries.
export type CollapseSpaces<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 800
        ? S
        : S extends `${infer A}                ${infer B}`   // 16 spaces -> 1
            ? CollapseSpaces<`${A} ${B}`, [any, ...Steps]>
            : S extends `${infer A}    ${infer B}`           // 4 spaces -> 1
                ? CollapseSpaces<`${A} ${B}`, [any, ...Steps]>
                : S extends `${infer A}  ${infer B}`         // 2 spaces -> 1
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

// Direct template-match split of a (≤3-part) dotted ref into cleaned segments.
// Replaces the old recursive `SplitOnDot` array build (its `[S]` base case and
// `[A, ...rest]` prepend minted tuples per qualified ref, and the 1/2/3-arm
// dispatch re-matched the built array three times). `${infer A}.${infer R}`
// binds the LEFTMOST dot, so A is the first segment exactly as before; a 4th
// segment (a dot remaining after the third split) yields `[]`, matching the old
// "no arm matches a 4+-tuple" fall-through.
export type SplitOnDotClean<S extends string> =
    S extends `${infer A}.${infer R}`
        ? R extends `${infer B}.${infer R2}`
            ? R2 extends `${string}.${string}`
                ? []
                : [CleanIdent<A>, CleanIdent<B>, CleanIdent<R2>]
            : [CleanIdent<A>, CleanIdent<R>]
        : [CleanIdent<S>];

export type MapClean<Tokens extends string[], Acc extends string[] = []> =
    Tokens extends [infer H extends string, ...infer R extends string[]]
        ? MapClean<R, [...Acc, CleanIdent<H> extends "" ? "" : TrimPunctuation<Trim<H>>]>
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
