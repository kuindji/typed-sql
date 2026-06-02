// Postgres literal neutralization, EXTRACT rewrite, comment stripping.
import type { Trim } from "./string-utils.js";
import type { ExceedsLengthBudget } from "./normalize.js";
import type { SplitBalancedParen } from "./extract.js";

// PostgreSQL string literals beyond the plain `'...'` form: dollar-quoted
// strings (`$$...$$`, `$tag$...$tag$`) and escape-string constants (`E'...'`).
// Their bodies are opaque string DATA — never SQL structure or column refs — yet
// clause-looking text inside them (`over (bogus_col)`, ` returning x`, `from y`)
// would otherwise be scanned as real SQL. Rewrite each whole span to a canonical
// blank literal `''` BEFORE any case-folding / comment-stripping / structural
// scan runs. Everything downstream already treats `'...'` as an opaque string
// literal (typed `string`, skipped by the column-existence scan), so this single
// rewrite makes BOTH result inference and validation correct in one place.
// Runs innermost so a `--`/`/* */` or keyword inside such a literal is neutered
// before StripComments / the table+column collectors ever see it. Gated behind a
// precise pre-check so only queries that actually contain such a literal pay for
// the walk; ordinary `$n` params and plain `'...'`/`"..."` literals are untouched.
export type NeutralizePgLiterals<S extends string> =
    string extends S
        ? S
        : NeedsPgNeutralize<S> extends true
            ? NeutralizePgDrive<NeutralizePgWorker<S, false, false, false, "", []>>
            : S;

type NeedsPgNeutralize<S extends string> =
    HasPairedDollar<S> extends true
        ? true
        : HasEStringOpener<S>;

// A genuine dollar-quote needs the SAME `$tag$` delimiter twice (tag may be
// empty → `$$`). `$n` params can never form two matching `$tag$` delimiters
// (a param `$1` has no trailing `$`), so this never fires on parameter lists.
// Inferred in two steps because a back-reference within one template pattern
// (`…$${infer T}$…$${T}$…`) is not legal — `Tag` is only usable once resolved
// in the true branch, where the nested check re-matches it as a known literal.
type HasPairedDollar<S extends string> =
    S extends `${string}$${infer Tag}$${infer Rest}`
        ? Rest extends `${string}$${Tag}$${string}`
            ? true
            : false
        : false;

// `E'`/`e'` only opens an escape string at a token boundary (start, or after
// whitespace / `(` / `,`); a trailing `…e'` inside a `'...'` literal is just the
// closing quote, not an opener — restricting the gate keeps the walk off ordinary
// string literals that merely end in `e`/`E` (e.g. `'sale'`, `'ACTIVE'`).
type HasEStringOpener<S extends string> =
    S extends `E'${string}` ? true
    : S extends `e'${string}` ? true
    : S extends `${string} E'${string}` ? true
    : S extends `${string} e'${string}` ? true
    : S extends `${string}(E'${string}` ? true
    : S extends `${string}(e'${string}` ? true
    : S extends `${string},E'${string}` ? true
    : S extends `${string},e'${string}` ? true
    : false;

type NeutralizePgDrive<R> =
    R extends { __c: [infer S extends string, infer A extends boolean, infer B extends boolean, infer C extends boolean, infer Acc extends string] }
        ? NeutralizePgDrive<NeutralizePgWorker<S, A, B, C, Acc, []>>
        : R;

// A dollar-quote tag follows unquoted-identifier rules (letters/digits/`_`, no
// leading digit) or is empty (`$$`). This is what distinguishes a real opener
// from a positional param run: `$2, $3` is NOT `$<tag>$` (the "tag" `2, ` has a
// leading digit, a space and a comma), so the walk must not treat it as a
// dollar-quoted span and eat the query body between two such params.
type DollarTagLower = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z";
type DollarTagStart = DollarTagLower | Uppercase<DollarTagLower> | "_";
type DollarTagChar = DollarTagStart | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type IsValidDollarTag<Tag extends string> =
    Tag extends ""
        ? true
        : Tag extends `${infer F}${infer R}`
            ? F extends DollarTagStart
                ? AllDollarTagChars<R>
                : false
            : false;

type AllDollarTagChars<S extends string, Steps extends any[] = []> =
    S extends ""
        ? true
        : Steps["length"] extends 64
            ? false
            : S extends `${infer F}${infer R}`
                ? F extends DollarTagChar
                    ? AllDollarTagChars<R, [any, ...Steps]>
                    : false
                : false;

// Char-walk with three independent "inside a literal" states. A dollar-quote or
// E-string opener is only honored OUTSIDE a `'...'`/`"..."` literal, so a `$$`
// sitting inside a single-quoted string is copied verbatim. Chunked-driver
// pattern: yields `{ __c: [...] }` at the step cap so the driver re-invokes with
// a fresh counter, keeping arbitrarily long queries under TS2589.
type NeutralizePgWorker<
    S extends string,
    InS extends boolean, // inside '...'
    InD extends boolean, // inside "..."
    InE extends boolean, // inside E'...' (body blanked)
    Acc extends string,
    Steps extends any[]
> = Steps["length"] extends 400
    ? { __c: [S, InS, InD, InE, Acc] }
    : InE extends true
        // escape-string body: blank content; `\x` escapes the next char; `'` closes.
        ? S extends `\\${infer _Esc}${infer R}`
            ? NeutralizePgWorker<R, InS, InD, true, Acc, [any, ...Steps]>
            : S extends `'${infer R}`
                ? NeutralizePgWorker<R, false, false, false, `${Acc}'`, [any, ...Steps]>
                : S extends `${infer _C}${infer R}`
                    ? NeutralizePgWorker<R, InS, InD, true, Acc, [any, ...Steps]>
                    : `${Acc}'` // unterminated → close it off
    : InS extends true
        ? S extends `${infer C}${infer R}`
            ? NeutralizePgWorker<R, C extends "'" ? false : true, InD, false, `${Acc}${C}`, [any, ...Steps]>
            : Acc
    : InD extends true
        ? S extends `${infer C}${infer R}`
            ? NeutralizePgWorker<R, InS, C extends `"` ? false : true, false, `${Acc}${C}`, [any, ...Steps]>
            : Acc
        // outside any literal:
        : S extends `E'${infer R}`
            ? NeutralizePgWorker<R, false, false, true, `${Acc}'`, [any, ...Steps]>
            : S extends `e'${infer R}`
                ? NeutralizePgWorker<R, false, false, true, `${Acc}'`, [any, ...Steps]>
                : S extends `$${infer Tag}$${infer Rest}`
                    ? IsValidDollarTag<Tag> extends true
                        ? Rest extends `${infer _Body}$${Tag}$${infer After}`
                            ? NeutralizePgWorker<After, false, false, false, `${Acc}''`, [any, ...Steps]>
                            // valid tag but no matching close → not a real span; emit one `$`, advance.
                            : S extends `$${infer R2}`
                                ? NeutralizePgWorker<R2, false, false, false, `${Acc}$`, [any, ...Steps]>
                                : Acc
                        // invalid tag (e.g. a `$n` param run): emit one `$`, advance one char.
                        : S extends `$${infer R3}`
                            ? NeutralizePgWorker<R3, false, false, false, `${Acc}$`, [any, ...Steps]>
                            : Acc
                    : S extends `'${infer R}`
                        ? NeutralizePgWorker<R, true, false, false, `${Acc}'`, [any, ...Steps]>
                        : S extends `"${infer R}`
                            ? NeutralizePgWorker<R, false, true, false, `${Acc}"`, [any, ...Steps]>
                            : S extends `${infer C}${infer R}`
                                ? NeutralizePgWorker<R, false, false, false, `${Acc}${C}`, [any, ...Steps]>
                                : Acc;

// `EXTRACT(field FROM source)` uses keyword grammar: the `field` token (year,
// month, day, ...) is a date-part keyword, NOT a column, and the inner ` from `
// is function-local — it is NOT a top-level FROM clause. Left untouched, the
// token-level table collector treats `from source` as a real FROM source (so the
// source column is mistaken for a table) and the function-arg validator would
// flag the date-part `field` as an unknown column. Rewrite each
// `extract(field from source)` to `extract(source)`: this drops the inner ` from `
// (so the table collector / ref-scan never see it) and exempts the date-part
// field, while the source column flows through ordinary function-arg validation.
// Gated behind a cheap pre-check so only queries containing ` extract(` pay for
// the walk. Space-anchored so `date_extract(` and similar are left alone.
export type RewriteExtractCall<S extends string> =
    S extends `${string} extract(${string}`
        // Only small queries that actually contain a single quote risk an
        // ` extract(` sitting inside a string literal (round-12 E1); they take the
        // quote-aware walk. Everything else (no quotes, or report-scale where a
        // parity char-walk would blow the depth budget) uses the plain rewrite.
        ? S extends `${string}'${string}`
            ? ExceedsLengthBudget<S> extends true
                ? RewriteExtractWalk<S>
                : RewriteExtractWalkQuoteAware<S>
            : RewriteExtractWalk<S>
        : S;

export type RewriteExtractWalk<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 24
        ? S
        : S extends `${infer Pre} extract(${infer AfterOpen}`
            ? SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string; rest: infer Rest extends string }
                ? Inner extends `${infer _Field} from ${infer Source}`
                    ? `${RewriteExtractWalk<Pre, [any, ...Steps]>} extract(${Trim<Source>})${RewriteExtractWalk<Rest, [any, ...Steps]>}`
                    : `${RewriteExtractWalk<Pre, [any, ...Steps]>} extract(${Inner})${RewriteExtractWalk<Rest, [any, ...Steps]>}`
                : S
            : S;

// As `RewriteExtractWalk`, but an ` extract(` whose prefix has an odd number of
// single quotes sits INSIDE a string literal and is left verbatim (the literal's
// text must survive into the result-row value type — round-12 E1). The prefix is
// still recursed so a genuine EXTRACT earlier in the query is rewritten.
export type RewriteExtractWalkQuoteAware<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 12
        ? S
        : S extends `${infer Pre} extract(${infer AfterOpen}`
            ? Pre extends `${string}'${string}`
                ? OddSingleQuotes<Pre> extends true
                    ? AfterOpen extends `${infer Lit}'${infer Tail}`
                        ? `${RewriteExtractWalkQuoteAware<Pre, [any, ...Steps]>} extract(${Lit}'${RewriteExtractWalkQuoteAware<Tail, [any, ...Steps]>}`
                        : S
                    : RewriteExtractRewriteOne<Pre, AfterOpen, Steps>
                : RewriteExtractRewriteOne<Pre, AfterOpen, Steps>
            : S;

export type RewriteExtractRewriteOne<Pre extends string, AfterOpen extends string, Steps extends any[]> =
    SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string; rest: infer Rest extends string }
        ? Inner extends `${infer _Field} from ${infer Source}`
            ? `${RewriteExtractWalkQuoteAware<Pre, [any, ...Steps]>} extract(${Trim<Source>})${RewriteExtractWalkQuoteAware<Rest, [any, ...Steps]>}`
            : `${RewriteExtractWalkQuoteAware<Pre, [any, ...Steps]>} extract(${Inner})${RewriteExtractWalkQuoteAware<Rest, [any, ...Steps]>}`
        : `${Pre} extract(${AfterOpen}`;

// True when `S` contains an odd number of single quotes — i.e. its end is inside
// an unterminated single-quoted string literal. Bounded; on bail returns the
// best-effort parity so far.
export type OddSingleQuotes<S extends string, Flag extends boolean = false, Steps extends any[] = []> =
    string extends S
        ? false
        : Steps["length"] extends 400
            ? Flag
            : S extends `${infer C}${infer R}`
                ? OddSingleQuotes<R, C extends "'" ? (Flag extends true ? false : true) : Flag, [any, ...Steps]>
                : Flag;

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

