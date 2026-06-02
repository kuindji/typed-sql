// NormalizeQuery pipeline + quote-aware lowercasing.
import type { CollapseSpaces, Trim, TrimLeft } from "./string-utils.js";
import type { NeutralizePgLiterals, RewriteExtractCall, StripComments } from "./pg-literals.js";

// The lowercaser walks char-by-char under a step cap (a proxy for TS's
// tail-recursion limit). Report-scale queries carry hundreds of indentation
// chars that exhaust that budget BEFORE the lowercaser reaches the tail of the
// SELECT list, forcing a blanket quote-UNAWARE `Lowercase<S>` bail that
// corrupts the case of single-quoted literals and double-quoted output aliases
// past the cap (e.g. `'GBP'`→`'gbp'`, `"currencyCount"`→key `currencycount`).
// Collapsing whitespace FIRST shrinks the input so the whole query stays under
// the cap (raising the cap instead blows TS2589 near the ~1000 recursion
// limit). The OUTER ReplaceWhitespace still runs on the now-lowercased string,
// so its `update`-clause detection is unchanged. The redundant outer
// ReplaceWhitespace/CollapseSpaces are cheap no-ops once whitespace is already
// normalized.
export type NormalizeQuery<S extends string> =
    RewriteExtractCall<Trim<RemoveTrailingSemicolon<CollapseSpaces<ReplaceWhitespace<LowercaseOutsideQuotes<CollapseSpaces<ReplaceWhitespace<StripComments<NeutralizePgLiterals<S>>>>>>>>>>;

// Quote-aware lowercasing: SQL keywords/identifiers are case-insensitive, but
// single-quoted string literals and double-quoted identifiers keep their exact
// case — case-sensitive QUOTED OUTPUT ALIASES become projected row KEYS that MUST
// keep their case (e.g. `"linkHash"` → key `linkHash`, not `linkhash`).
//
// A single tail-recursive char-walk caps out at TS's ~1000-iteration limit, so it
// cannot lossly process the 1000+-char SELECT lists real reporting queries reach.
// The worker runs a bounded chunk and then YIELDS its state (`{ __c: [...] }`); the
// driver re-invokes it on the remainder with a fresh step counter, resetting TS's
// internal tail-recursion count per chunk. This processes arbitrarily long queries
// WITHOUT the old force-lowercase-the-tail bail that corrupted late aliases.
export type LowercaseOutsideQuotes<S extends string> =
    string extends S
        ? string
        : LowercaseOutsideQuotesDrive<LowercaseOutsideQuotesWorker<S, false, false, "", []>>;

type LowercaseOutsideQuotesDrive<R> =
    R extends { __c: [infer S extends string, infer Q1 extends boolean, infer Q2 extends boolean, infer Acc extends string] }
        ? LowercaseOutsideQuotesDrive<LowercaseOutsideQuotesWorker<S, Q1, Q2, Acc, []>>
        : R;

type LowercaseOutsideQuotesWorker<
    S extends string,
    InSingleQuote extends boolean,
    InDoubleQuote extends boolean,
    Acc extends string,
    Steps extends any[]
> = Steps["length"] extends 450
    ? { __c: [S, InSingleQuote, InDoubleQuote, Acc] }
    : S extends `${infer C}${infer Rest}`
        ? C extends "'"
            ? InDoubleQuote extends true
                ? LowercaseOutsideQuotesWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                : InSingleQuote extends true
                    ? LowercaseOutsideQuotesWorker<Rest, false, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                    : LowercaseOutsideQuotesWorker<Rest, true, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
            : C extends `"`
                ? InSingleQuote extends true
                    ? LowercaseOutsideQuotesWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                    : InDoubleQuote extends true
                        ? LowercaseOutsideQuotesWorker<Rest, InSingleQuote, false, `${Acc}${C}`, [any, ...Steps]>
                        : LowercaseOutsideQuotesWorker<Rest, InSingleQuote, true, `${Acc}${C}`, [any, ...Steps]>
                : InSingleQuote extends true
                    ? LowercaseOutsideQuotesWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                    : InDoubleQuote extends true
                        ? LowercaseOutsideQuotesWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                        : LowercaseOutsideQuotesWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${Lowercase<C>}`, [any, ...Steps]>
        : Acc;

// ---------------------------------------------------------------------------
// Param-name-preserving lowercaser (write/raw builder path only).
//
// Identical to LowercaseOutsideQuotes, but the identifier of a `:name` named
// parameter keeps its EXACT case. Named params become object keys in the
// builder's `withParams({ … })`, so folding `:teamId`→`:teamid` produced keys
// the caller could not write (F1). Quoted literals/identifiers are preserved as
// before; a `::cast` operator is consumed as a unit so the type name after it
// still lowercases and the second colon is never mistaken for a param start.
export type LowercaseOutsideQuotesKeepParams<S extends string> =
    string extends S
        ? string
        : LcKeepDrive<LcKeepWorker<S, false, false, "", []>>;

type LcKeepDrive<R> =
    R extends { __c: [infer S extends string, infer Q1 extends boolean, infer Q2 extends boolean, infer Acc extends string] }
        ? LcKeepDrive<LcKeepWorker<S, Q1, Q2, Acc, []>>
        : R;

// Chars that terminate a `:name` parameter identifier in a SQL fragment.
type ParamNameStop =
    | " " | "\t" | "\n" | "," | ";" | ")" | "(" | "'" | '"' | ":" | "."
    | "=" | "+" | "-" | "*" | "/" | "|" | "%" | ">" | "<" | "!" | "~"
    | "@" | "#" | "&" | "^" | "[" | "]" | "{" | "}";
// Copy a param identifier verbatim (case-preserved) up to the first stop char.
// Capped so a pathological no-stop tail cannot blow the recursion budget.
type ReadParamIdent<S extends string, Acc extends string = "", N extends any[] = []> =
    N["length"] extends 128 ? { name: Acc; rest: S }
    : S extends `${infer C}${infer R}`
        ? C extends ParamNameStop ? { name: Acc; rest: S }
        : ReadParamIdent<R, `${Acc}${C}`, [any, ...N]>
    : { name: Acc; rest: S };

type LcKeepWorker<
    S extends string,
    InSingleQuote extends boolean,
    InDoubleQuote extends boolean,
    Acc extends string,
    Steps extends any[]
> = Steps["length"] extends 450
    ? { __c: [S, InSingleQuote, InDoubleQuote, Acc] }
    : S extends `${infer C}${infer Rest}`
        ? C extends "'"
            ? InDoubleQuote extends true
                ? LcKeepWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                : InSingleQuote extends true
                    ? LcKeepWorker<Rest, false, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                    : LcKeepWorker<Rest, true, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
            : C extends `"`
                ? InSingleQuote extends true
                    ? LcKeepWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                    : InDoubleQuote extends true
                        ? LcKeepWorker<Rest, InSingleQuote, false, `${Acc}${C}`, [any, ...Steps]>
                        : LcKeepWorker<Rest, InSingleQuote, true, `${Acc}${C}`, [any, ...Steps]>
                : InSingleQuote extends true
                    ? LcKeepWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                    : InDoubleQuote extends true
                        ? LcKeepWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${C}`, [any, ...Steps]>
                        // outside quotes: a lone `:` begins a named param (case-
                        // preserved); `::` is a cast operator consumed as a unit.
                        : C extends ":"
                            ? Rest extends `:${infer R2}`
                                ? LcKeepWorker<R2, InSingleQuote, InDoubleQuote, `${Acc}::`, [any, ...Steps]>
                                : ReadParamIdent<Rest> extends { name: infer Nm extends string; rest: infer Rr extends string }
                                    ? LcKeepWorker<Rr, InSingleQuote, InDoubleQuote, `${Acc}:${Nm}`, [any, ...Steps]>
                                    : LcKeepWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}:`, [any, ...Steps]>
                        : LcKeepWorker<Rest, InSingleQuote, InDoubleQuote, `${Acc}${Lowercase<C>}`, [any, ...Steps]>
        : Acc;

// NormalizeQuery variant that preserves `:name` param case — used by the
// write/raw builder param extraction (ExtractParams) only.
export type NormalizeQueryKeepParams<S extends string> =
    RewriteExtractCall<Trim<RemoveTrailingSemicolon<CollapseSpaces<ReplaceWhitespace<LowercaseOutsideQuotesKeepParams<CollapseSpaces<ReplaceWhitespace<StripComments<NeutralizePgLiterals<S>>>>>>>>>>;

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
