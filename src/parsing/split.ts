// Top-level / paren-aware splitting + alias extraction.
import type { CleanIdent, HasSpecial, SplitLast, Trim } from "./string-utils.js";
import type { SplitBalancedParen } from "./extract.js";
import type { SqlReserved } from "./tokenize.js";

// Split by commas at top level (paren-aware). Safe fallbacks for deep strings.

// The per-character worker. A single tail-recursive conditional type can only
// run ~1000 iterations before TS aborts with TS2589 ("excessively deep") — well
// below the string lengths real reporting SELECT lists reach (1000+ chars). So
// instead of one unbounded walk, the worker runs a bounded chunk (CHUNK steps,
// kept under TS's tail-recursion limit) and then YIELDS its full state as a
// `{ __c: [...] }` marker. `SplitTopLevel` (the driver below) re-invokes the
// worker on the remainder with a fresh step counter, which resets TS's internal
// tail-recursion count per chunk — so arbitrarily long lists split losslessly.
type SplitTopLevelWorker<
    S extends string,
    Depth extends any[] = [],
    Acc extends string[] = [],
    Cur extends string = "",
    Steps extends any[] = [],
    InQ extends boolean = false,
    InDQ extends boolean = false
> = Steps["length"] extends 450
    ? { __c: [S, Depth, Acc, Cur, InQ, InDQ] }
    : string extends CleanIdent<S>
        ? [...Acc, `${Cur}string`]
        : S extends `${infer C}${infer Rest}`
        ? C extends "'"
            // A single quote toggles "inside string literal": commas, parens and
            // path braces inside a '...' literal are kept verbatim, not split.
            // Suppressed while inside a double-quoted identifier.
            ? InDQ extends true
                ? SplitTopLevelWorker<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
                : SplitTopLevelWorker<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ extends true ? false : true, InDQ>
            : InQ extends true
                ? SplitTopLevelWorker<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
            : C extends `"`
                // A double quote toggles "inside quoted identifier": commas and
                // parens inside `"..."` are part of the identifier, kept verbatim.
                ? SplitTopLevelWorker<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ extends true ? false : true>
            : InDQ extends true
                ? SplitTopLevelWorker<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
            : C extends "("
                ? SplitTopLevelWorker<Rest, [any, ...Depth], Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
                : C extends ")"
                    ? SplitTopLevelWorker<Rest, Depth extends [any, ...infer D] ? D : [], Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
                    : C extends ","
                        ? Depth["length"] extends 0
                            ? SplitTopLevelWorker<Rest, Depth, [...Acc, Cur], "", [any, ...Steps], InQ, InDQ>
                            : SplitTopLevelWorker<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
                        : SplitTopLevelWorker<Rest, Depth, Acc, `${Cur}${C}`, [any, ...Steps], InQ, InDQ>
        : [...Acc, Cur];

// Driver: run the worker chunk-by-chunk until it returns the finished `string[]`.
// Each `{ __c: state }` yield is fed back with a fresh step counter, so no single
// worker instantiation chain exceeds the per-chunk budget. Driver recursion depth
// is `length / CHUNK` (≈ a handful for realistic queries), itself well under the
// tail-recursion limit.
export type SplitTopLevel<S extends string> =
    SplitTopLevelDrive<SplitTopLevelWorker<S, [], [], "", [], false, false>>;

type SplitTopLevelDrive<R> =
    R extends { __c: [infer S extends string, infer D extends any[], infer A extends string[], infer Cur extends string, infer InQ extends boolean, infer InDQ extends boolean] }
        ? SplitTopLevelDrive<SplitTopLevelWorker<S, D, A, Cur, [], InQ, InDQ>>
        : R;

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

