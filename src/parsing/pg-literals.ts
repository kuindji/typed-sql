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

// A genuine dollar-quote needs the SAME **valid** `$tag$` delimiter twice (tag
// may be empty → `$$`; otherwise identifier-shaped, no leading digit). The tag
// MUST be validated here in the gate, not just in the worker: with repeated
// positional-param text like `… between $1 and $2 … between $1 and $2 …` the
// naive `` `$${infer Tag}$` `` match infers Tag = `"1 and "` and finds it again
// later, firing the gate on a query with NO dollar-quote at all — which sent
// every such report-scale query through the per-char neutralize walk (two huge
// string mints per char). Scan `$`-by-`$` instead: each step consumes the
// leftmost `$` and re-checks, so depth = number of `$` chars (param count),
// not string length. Inferred in two steps because a back-reference within one
// template pattern (`…$${infer T}$…$${T}$…`) is not legal — `Tag` is only
// usable once resolved in the true branch, where the nested check re-matches
// it as a known literal. On a pathological >64-`$` query the cap returns
// `true` — the walk runs for nothing (old behavior, slow but correct) rather
// than risk skipping a real `$$…$$` span sitting past the cap.
type HasPairedDollar<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 64
        ? true
        : S extends `${infer _Pre}$${infer Tag}$${infer Rest}`
            ? IsValidDollarTag<Tag> extends true
                ? Rest extends `${string}$${Tag}$${string}`
                    ? true
                    : HasPairedDollar<`${Tag}$${Rest}`, [any, ...Steps]>
                : HasPairedDollar<`${Tag}$${Rest}`, [any, ...Steps]>
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
// A call keyword preceded by one of these is the TAIL of a longer identifier
// (`date_extract(`, `ltrim(`), not the call itself. Normalized text is lowercase
// outside quotes.
type IdentTailChar =
    | "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m"
    | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z"
    | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "_" | "$" | "\"";

// The call is matched WITHOUT a leading-space anchor so a nested
// `avg(extract(epoch from ts))` / `(extract(year from ts))` is rewritten too — the
// space-anchored form left the inner ` from ` in place and the table collector
// then read `ts))` as a FROM source (a false reject).
export type RewriteExtractCall<S extends string> =
    S extends `${string}extract(${string}`
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

// Tail-recursive accumulator walk + chunked driver. Template matching is
// LEFTMOST, so `Pre` can never contain another ` extract(` — it is appended to
// `Acc` verbatim and only `Rest` is recursed. (The previous version recursed
// into BOTH `Pre` and `Rest` building a nested template, so its step cap had to
// stay tiny — 24 — and a 50-projection report query with 25+ EXTRACTs bailed
// half-rewritten: the surviving inner ` from ` tokens then fed the tables
// collector bogus sources like `min(ua.col`, flipping ValidateSQL to a false
// rejection.) The driver re-invokes the worker with a fresh step counter every
// 64 rewrites, so any realistic number of EXTRACTs completes losslessly.
export type RewriteExtractWalk<S extends string> =
    RewExDrive<RewExWorker<S>>;

type RewExDrive<R> =
    [R] extends [never]
        ? never
        : R extends { __c: [infer S extends string, infer Acc extends string] }
            ? RewExDrive<RewExWorker<S, Acc, []>>
            : R;

type RewExWorker<
    S extends string,
    Acc extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 64
    ? { __c: [S, Acc] }
    : S extends `${infer Pre}extract(${infer AfterOpen}`
        ? Pre extends `${string}${IdentTailChar}`
            // `date_extract(` etc. — not the function; copy and continue after it.
            ? RewExWorker<AfterOpen, `${Acc}${Pre}extract(`, [any, ...Steps]>
            : SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string; rest: infer Rest extends string }
                ? Inner extends `${infer _Field} from ${infer Source}`
                    ? RewExWorker<Rest, `${Acc}${Pre}extract(${Trim<Source>})`, [any, ...Steps]>
                    : RewExWorker<Rest, `${Acc}${Pre}extract(${Inner})`, [any, ...Steps]>
                : `${Acc}${S}`
        : `${Acc}${S}`;

// As `RewriteExtractWalk`, but an ` extract(` whose prefix has an odd number of
// single quotes sits INSIDE a string literal and is left verbatim (the literal's
// text must survive into the result-row value type — round-12 E1). The prefix is
// still recursed so a genuine EXTRACT earlier in the query is rewritten.
export type RewriteExtractWalkQuoteAware<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 12
        ? S
        : S extends `${infer Pre}extract(${infer AfterOpen}`
            ? Pre extends `${string}${IdentTailChar}`
                // `date_extract(` etc. — not the function.
                ? `${Pre}extract(${RewriteExtractWalkQuoteAware<AfterOpen, [any, ...Steps]>}`
                : Pre extends `${string}'${string}`
                    ? OddSingleQuotes<Pre> extends true
                        ? AfterOpen extends `${infer Lit}'${infer Tail}`
                            ? `${RewriteExtractWalkQuoteAware<Pre, [any, ...Steps]>}extract(${Lit}'${RewriteExtractWalkQuoteAware<Tail, [any, ...Steps]>}`
                            : S
                        : RewriteExtractRewriteOne<Pre, AfterOpen, Steps>
                    : RewriteExtractRewriteOne<Pre, AfterOpen, Steps>
            : S;

export type RewriteExtractRewriteOne<Pre extends string, AfterOpen extends string, Steps extends any[]> =
    SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string; rest: infer Rest extends string }
        ? Inner extends `${infer _Field} from ${infer Source}`
            ? `${RewriteExtractWalkQuoteAware<Pre, [any, ...Steps]>}extract(${Trim<Source>})${RewriteExtractWalkQuoteAware<Rest, [any, ...Steps]>}`
            : `${RewriteExtractWalkQuoteAware<Pre, [any, ...Steps]>}extract(${Inner})${RewriteExtractWalkQuoteAware<Rest, [any, ...Steps]>}`
        : `${Pre}extract(${AfterOpen}`;

// `SUBSTRING(x FROM a [FOR b])`, `TRIM([LEADING|TRAILING|BOTH] [chars] FROM x)`
// and `OVERLAY(x PLACING y FROM a [FOR b])` use the same keyword-argument grammar
// as EXTRACT: their inner ` from ` is function-local, not a FROM clause, but the
// word-level table collector armed on it and collected the next word (`1`) as a
// relation — rejecting every such query. Rewrite each call to its comma form
// (`substring(x, a, b)`, `trim(x)`, `overlay(x, y, a, b)`), which the typer and
// validator already handle. One chunked pass per function, each gated on a cheap
// presence check so queries without the call pay nothing.
export type RewriteKwFromCalls<S extends string> =
    RewriteOneKwCall<RewriteOneKwCall<RewriteOneKwCall<S, "substring">, "trim">, "overlay">;

type RewriteOneKwCall<S extends string, Fn extends string> =
    S extends `${string}${Fn}(${string}` ? RewKwDrive<RewKwWorker<S, Fn>> : S;

type RewKwDrive<R> =
    [R] extends [never]
        ? never
        : R extends { __c: [infer S extends string, infer Fn extends string, infer Acc extends string] }
            ? RewKwDrive<RewKwWorker<S, Fn, Acc, []>>
            : R;

type RewKwWorker<
    S extends string,
    Fn extends string,
    Acc extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 64
    ? { __c: [S, Fn, Acc] }
    : S extends `${infer Pre}${Fn}(${infer AfterOpen}`
        ? Pre extends `${string}${IdentTailChar}`
            // `ltrim(` / `btrim(` — a different function; copy and move on.
            ? RewKwWorker<AfterOpen, Fn, `${Acc}${Pre}${Fn}(`, [any, ...Steps]>
            : SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string; rest: infer Rest extends string }
                ? RewKwWorker<Rest, Fn, `${Acc}${Pre}${Fn}(${RewriteKwInner<Fn, Inner>})`, [any, ...Steps]>
                : `${Acc}${S}`
        : `${Acc}${S}`;

type RewriteKwInner<Fn extends string, Inner extends string> =
    Fn extends "substring"
        ? Inner extends `${infer X} from ${infer A} for ${infer B}` ? `${X}, ${A}, ${B}`
        : Inner extends `${infer X} from ${infer A}` ? `${X}, ${A}`
        : Inner extends `${infer X} for ${infer B}` ? `${X}, ${B}`
        : Inner
    : Fn extends "trim"
        // `trim(leading '0' from x)` / `trim(both from x)` / `trim(' ' from x)` → `trim(x)`
        ? Inner extends `${string} from ${infer X}` ? Trim<X>
        : Inner extends `${"leading" | "trailing" | "both"} ${infer X}` ? Trim<X>
        : Inner
    : Fn extends "overlay"
        ? Inner extends `${infer X} placing ${infer Y} from ${infer A} for ${infer B}` ? `${X}, ${Y}, ${A}, ${B}`
        : Inner extends `${infer X} placing ${infer Y} from ${infer A}` ? `${X}, ${Y}, ${A}`
        : Inner
    : Inner;

// True when `S` contains an odd number of single quotes — i.e. its end is inside
// an unterminated single-quoted string literal. Marker-jump: each step hops to the
// next `'` (the `${infer _Pre}` skips a whole run of non-quote chars at once) and
// flips the parity, so the depth is the NUMBER OF QUOTES — a handful — not the
// string length. `${infer _Pre}'${infer R}` matches the LEFTMOST `'`, so quotes are
// counted in order, exactly as the old per-char toggle did. Bounded against a
// pathological quote-dense string; on bail returns the best-effort parity so far.
export type OddSingleQuotes<S extends string, Flag extends boolean = false, Steps extends any[] = []> =
    string extends S
        ? false
        : Steps["length"] extends 400
            ? Flag
            : S extends `${infer _Pre}'${infer R}`
                ? OddSingleQuotes<R, Flag extends true ? false : true, [any, ...Steps]>
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
// PostgreSQL block comments nest; `BlockCommentTail` below skips to the matching
// outer close in marker-sized steps rather than walking every body character.
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
                    ? StripCommentsWalk<BlockCommentTail<AfterOpen>, false, `${Acc} `, [any, ...Steps], false>
                    : S extends `--${infer AfterDash}`
                        ? StripCommentsWalk<LineCommentTail<AfterDash>, false, `${Acc} `, [any, ...Steps], false>
                        : S extends `${infer C}${infer Rest}`
                            ? StripCommentsWalk<Rest, C extends "'" ? true : false, `${Acc}${C}`, [any, ...Steps], C extends `"` ? true : false>
                            : Acc;

// Tail after the close matching an already-consumed `/*`. The first `*/` is
// paired with any earlier nested `/*` markers before returning the outer tail.
// Recursion is proportional to comment markers, not comment-body length. A
// pathological marker run degrades by dropping the remaining comment/query,
// matching the parser's false-negative bias without risking TS2589.
export type BlockCommentTail<
    S extends string,
    Depth extends any[] = [any],
    Steps extends any[] = []
> = Steps["length"] extends 64
    ? ""
    : S extends `${infer BeforeClose}*/${infer AfterClose}`
        ? BeforeClose extends `${infer _BeforeOpen}/*${infer AfterOpen}`
            ? BlockCommentTail<
                `${AfterOpen}*/${AfterClose}`,
                [any, ...Depth],
                [any, ...Steps]
            >
            : Depth extends [any, ...infer Rest extends any[]]
                ? Rest extends []
                    ? AfterClose
                    : BlockCommentTail<AfterClose, Rest, [any, ...Steps]>
                : AfterClose
        : "";

// Skip a line comment body, returning the tail starting at the first newline
// (which is kept so words on either side of the comment can't merge). A comment
// that runs to the end of the string yields `""`.
//
// Marker-jump: locate the first `\n`/`\r` with template matching instead of a
// per-char walk. `${infer Pre}\n${infer After}` finds the LEFTMOST `\n`; if its
// prefix `Pre` itself holds a `\r`, that `\r` is the earlier newline, so the tail
// starts there (`\r${PreB}\n${After}`). With no `\n`, fall back to the leftmost
// `\r`; with neither, the comment runs to EOF → `""`. No recursion (and so no step
// cap): a 1000-char single-line comment is now ~2 template instantiations.
export type LineCommentTail<S extends string> =
    S extends `${infer Pre}\n${infer After}`
        ? Pre extends `${infer _PreA}\r${infer PreB}`
            ? `\r${PreB}\n${After}`
            : `\n${After}`
        : S extends `${infer _P}\r${infer After}`
            ? `\r${After}`
            : "";
