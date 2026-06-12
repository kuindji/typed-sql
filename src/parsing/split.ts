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
// Segment-jump, not per-char (the old walk minted one growing-`Cur` string PER
// CHARACTER and the tail at every step). Each step advances to the LEFTMOST of
// the five state chars `,` `'` `"` `(` `)`, copying the whole run before it into
// `Cur` in a single mint; inside a quote it jumps straight to the closing quote
// (the other quote kind inside a span is data, preserving the old InQ/InDQ
// suppression; `''` escapes exit+re-enter across two jumps; an unterminated
// quote at EOF copies the rest verbatim). The `Steps` cap counts JUMPS and
// yields `{ __c: [...] }` to the driver as before. Mirrors `MtcStructJump`
// (tokenize.ts) and `SbpParenJump` (extract.ts).
type SplitTopLevelWorker<
    S extends string,
    Depth extends any[] = [],
    Acc extends string[] = [],
    Cur extends string = "",
    Steps extends any[] = [],
    InQ extends boolean = false,
    InDQ extends boolean = false
// CHUNK = 120 JUMPS, not chars: since the round-7 struct-jump rewrite each
// jump costs ~4 conditional evaluations through the StlStructJump* helper
// chain, so the old 450-jump chunk could burn >1000 tail counts inside ONE
// chunk (TS2589) on a 50-projection select list. 120 jumps ≈ 500 tail counts.
> = Steps["length"] extends 120
    ? { __c: [S, Depth, Acc, Cur, InQ, InDQ] }
    : string extends CleanIdent<S>
        ? [...Acc, `${Cur}string`]
        : InQ extends true
            ? S extends `${infer P}'${infer R}`
                ? SplitTopLevelWorker<R, Depth, Acc, `${Cur}${P}'`, [any, ...Steps], false, InDQ>
                : [...Acc, `${Cur}${S}`]
            : InDQ extends true
                ? S extends `${infer P}"${infer R}`
                    ? SplitTopLevelWorker<R, Depth, Acc, `${Cur}${P}"`, [any, ...Steps], InQ, false>
                    : [...Acc, `${Cur}${S}`]
                : S extends `${infer P},${infer R}`
                    // a structural char in the run before the first comma → it is
                    // leftmost; defer to the struct jump
                    ? StlHasStruct<P> extends true
                        ? StlStructJump<S, Depth, Acc, Cur, Steps>
                        : Depth["length"] extends 0
                            ? SplitTopLevelWorker<R, Depth, [...Acc, `${Cur}${P}`], "", [any, ...Steps], false, false>
                            : SplitTopLevelWorker<R, Depth, Acc, `${Cur}${P},`, [any, ...Steps], false, false>
                    : StlHasStruct<S> extends true
                        ? StlStructJump<S, Depth, Acc, Cur, Steps>
                        : [...Acc, `${Cur}${S}`];

type StlHasStruct<S extends string> =
    S extends `${string}'${string}` ? true
    : S extends `${string}"${string}` ? true
    : S extends `${string}(${string}` ? true
    : S extends `${string})${string}` ? true
    : false;

// Leftmost of `'` / `"` / `(` / `)` (the caller guarantees at least one occurs
// before any comma). Pairwise narrowing: split on a candidate; if an
// earlier-class char appears in its prefix, that one is leftmost instead.
type StlStructJump<
    S extends string,
    Depth extends any[],
    Acc extends string[],
    Cur extends string,
    Steps extends any[]
> = S extends `${infer P}'${infer R}`
    ? P extends `${string}"${string}` | `${string}(${string}` | `${string})${string}`
        ? StlStructJump2<S, Depth, Acc, Cur, Steps>
        : SplitTopLevelWorker<R, Depth, Acc, `${Cur}${P}'`, [any, ...Steps], true, false>
    : StlStructJump2<S, Depth, Acc, Cur, Steps>;

type StlStructJump2<
    S extends string,
    Depth extends any[],
    Acc extends string[],
    Cur extends string,
    Steps extends any[]
> = S extends `${infer P}"${infer R}`
    ? P extends `${string}(${string}` | `${string})${string}`
        ? StlStructJump3<S, Depth, Acc, Cur, Steps>
        : SplitTopLevelWorker<R, Depth, Acc, `${Cur}${P}"`, [any, ...Steps], false, true>
    : StlStructJump3<S, Depth, Acc, Cur, Steps>;

type StlStructJump3<
    S extends string,
    Depth extends any[],
    Acc extends string[],
    Cur extends string,
    Steps extends any[]
> = S extends `${infer P}(${infer R}`
    ? P extends `${string})${string}`
        ? StlCloseJump<S, Depth, Acc, Cur, Steps>
        : SplitTopLevelWorker<R, [any, ...Depth], Acc, `${Cur}${P}(`, [any, ...Steps], false, false>
    : StlCloseJump<S, Depth, Acc, Cur, Steps>;

type StlCloseJump<
    S extends string,
    Depth extends any[],
    Acc extends string[],
    Cur extends string,
    Steps extends any[]
> = S extends `${infer P})${infer R}`
    ? SplitTopLevelWorker<R, Depth extends [any, ...infer D] ? D : [], Acc, `${Cur}${P})`, [any, ...Steps], false, false>
    : [...Acc, `${Cur}${S}`];

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
// SELECT/FROM boundary, so it must not split the list. Parens and the ` from `
// boundary are only honoured when outside BOTH kinds of quote.
// Struct-jump, not per-char (the old walk minted a growing `Acc` PER CHARACTER
// over every subquery select-list). At depth 0 each step advances to the
// LEFTMOST of `'` `"` `(` `)` ` from ` (pairwise narrowing, multi-char keyword
// checked last); at depth > 0 the ` from ` candidate is dropped (a nested FROM
// is not the boundary). Quote spans are jumped quote-to-quote (the other quote
// kind inside a span is data, preserving the old InString/InDString
// suppression; an unterminated quote swallows the rest, as the old
// walk-to-EOF did).
//
// CHUNKED worker/driver (mirrors `SplitTopLevel`): each jump costs ~4-5
// conditional evaluations through the EbftJump* helper chain, so a single
// recursion chain crosses TS's 1000 tail-count budget at ~200+ jumps — a
// 50-projection SELECT list of quoted/parenthesised expressions gets there
// (TS2589). The worker yields its state every 120 jumps and the driver
// re-invokes it with a fresh step counter, so arbitrarily long select lists
// complete losslessly. (The pre-chunking version bailed to a lenient
// `ExtractBefore<S, " from ">` at a 350-jump cap — and blew TS2589 before
// ever reaching it on exactly the queries the cap was meant to protect.)
export type ExtractBeforeFromTopLevel<S extends string> =
    EbftDrive<EbftWorker<S>>;

type EbftDrive<R> =
    [R] extends [never]
        ? never
        : R extends { __c: [infer S extends string, infer Depth extends any[], infer Acc extends string] }
            ? EbftDrive<EbftWorker<S, Depth, Acc, []>>
            : R;

type EbftWorker<
    S extends string,
    Depth extends any[] = [],
    Acc extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 120
    ? { __c: [S, Depth, Acc] }
    : Depth["length"] extends 0
        ? EbftJumpTop<S, Depth, Acc, Steps>
        : EbftJumpNested<S, Depth, Acc, Steps>;

// inside `'…'`: resume after the closing quote (any depth; quotes ignore depth)
type EbftQuoteClose<
    R extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = R extends `${infer Span}'${infer R2}`
    ? EbftWorker<R2, Depth, `${Acc}${Span}'`, [any, ...Steps]>
    : `${Acc}${R}`;

type EbftDQuoteClose<
    R extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = R extends `${infer Span}"${infer R2}`
    ? EbftWorker<R2, Depth, `${Acc}${Span}"`, [any, ...Steps]>
    : `${Acc}${R}`;

type EbftJumpTop<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}'${infer R}`
    ? P extends `${string}"${string}` | `${string}(${string}` | `${string})${string}` | `${string} from ${string}`
        ? EbftJumpTop2<S, Depth, Acc, Steps>
        : EbftQuoteClose<R, Depth, `${Acc}${P}'`, Steps>
    : EbftJumpTop2<S, Depth, Acc, Steps>;

type EbftJumpTop2<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}"${infer R}`
    ? P extends `${string}(${string}` | `${string})${string}` | `${string} from ${string}`
        ? EbftJumpTop3<S, Depth, Acc, Steps>
        : EbftDQuoteClose<R, Depth, `${Acc}${P}"`, Steps>
    : EbftJumpTop3<S, Depth, Acc, Steps>;

type EbftJumpTop3<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}(${infer R}`
    ? P extends `${string})${string}` | `${string} from ${string}`
        ? EbftJumpTop4<S, Depth, Acc, Steps>
        : EbftWorker<R, [any, ...Depth], `${Acc}${P}(`, [any, ...Steps]>
    : EbftJumpTop4<S, Depth, Acc, Steps>;

type EbftJumpTop4<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P})${infer R}`
    ? P extends `${string} from ${string}`
        ? EbftJumpTop5<S, Acc>
        // an unmatched `)` at depth 0 stays at depth 0 (pop of empty = empty)
        : EbftWorker<R, [], `${Acc}${P})`, [any, ...Steps]>
    : EbftJumpTop5<S, Acc>;

type EbftJumpTop5<S extends string, Acc extends string> =
    S extends `${infer P} from ${string}`
        ? `${Acc}${P}`
        : `${Acc}${S}`;

type EbftJumpNested<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}'${infer R}`
    ? P extends `${string}"${string}` | `${string}(${string}` | `${string})${string}`
        ? EbftJumpNested2<S, Depth, Acc, Steps>
        : EbftQuoteClose<R, Depth, `${Acc}${P}'`, Steps>
    : EbftJumpNested2<S, Depth, Acc, Steps>;

type EbftJumpNested2<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}"${infer R}`
    ? P extends `${string}(${string}` | `${string})${string}`
        ? EbftJumpNested3<S, Depth, Acc, Steps>
        : EbftDQuoteClose<R, Depth, `${Acc}${P}"`, Steps>
    : EbftJumpNested3<S, Depth, Acc, Steps>;

type EbftJumpNested3<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}(${infer R}`
    ? P extends `${string})${string}`
        ? EbftJumpNested4<S, Depth, Acc, Steps>
        : EbftWorker<R, [any, ...Depth], `${Acc}${P}(`, [any, ...Steps]>
    : EbftJumpNested4<S, Depth, Acc, Steps>;

type EbftJumpNested4<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P})${infer R}`
    ? EbftWorker<R, Depth extends [any, ...infer D] ? D : [], `${Acc}${P})`, [any, ...Steps]>
    : `${Acc}${S}`;

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

