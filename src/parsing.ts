// Normalization & string utilities

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

// Select / returning list parsing

export type ExtractSelectList<N extends string> =
    N extends `${infer _}select ${infer After}`
        ? StripDistinct<ExtractBeforeFromTopLevel<After>>
        : N extends `${infer _}with ${string} select ${infer After}`
            ? StripDistinct<ExtractBeforeFromTopLevel<After>>
            : "";

// The projection list after the REAL ` returning ` clause. A ` returning `
// substring can also appear inside a string literal — either assigned earlier in
// the statement (`SET title = ' returning x'`, round-12 R1) OR returned by the
// clause itself (`RETURNING ' returning bogus_col' AS marker`, round-13 R1). The
// real clause is the FIRST ` returning ` at TOP LEVEL (outside single-quoted
// literals / double-quoted identifiers); a quote-aware char-walk skips any
// ` returning ` sitting inside quotes. Neither "first raw" nor "last raw" is
// correct in general — the literal can sit on either side of the real clause.
// Step-bounded (mirrors `HasReturningQuoteAware`) so it never blows the budget.
export type ExtractReturningList<N extends string> =
    FirstTopLevelReturningTail<N>;

export type FirstTopLevelReturningTail<
    S extends string,
    InString extends boolean = false,
    InDString extends boolean = false,
    Steps extends any[] = []
> = string extends S
    ? ""
    : Steps["length"] extends 1200
        ? S extends `${string} returning ${infer After}` ? After : ""
        : InString extends true
            ? S extends `${infer C}${infer Rest}`
                ? FirstTopLevelReturningTail<Rest, C extends "'" ? false : true, InDString, [any, ...Steps]>
                : ""
            : InDString extends true
                ? S extends `${infer C}${infer Rest}`
                    ? FirstTopLevelReturningTail<Rest, InString, C extends `"` ? false : true, [any, ...Steps]>
                    : ""
                : S extends ` returning ${infer After}`
                    ? After
                    : S extends `${infer C}${infer Rest}`
                        ? FirstTopLevelReturningTail<Rest, C extends "'" ? true : false, C extends `"` ? true : false, [any, ...Steps]>
                        : "";

// Given a string whose first non-skipped char is `(`, consume the first
// balanced parenthesised group (quote-aware) and return its inner content plus
// whatever follows the matching `)`. Naive template matching can't do this
// because `${infer Body})` is lazy and stops at the first `)` (e.g. inside
// `count(*)`).
//
// A single char-walk can only run ~1000 iterations before TS aborts with TS2589;
// a fixed cap (the previous 400) silently truncates long CTE/subquery bodies and
// derails the caller (e.g. multi-CTE OUTER-query extraction reads garbage). So
// the walk is split into a bounded worker that YIELDS its state (`{ __c: [...] }`)
// every CHUNK steps and a driver that re-invokes it with a fresh step counter —
// resetting TS's per-chain tail-recursion count, so arbitrarily long groups split
// losslessly. Mirrors the `SplitTopLevel` worker/driver above.
type SplitBalancedParenWorker<
    S extends string,
    Depth extends any[] = [],
    Acc extends string = "",
    InString extends boolean = false,
    Steps extends any[] = []
> = Steps["length"] extends 350
    ? { __c: [S, Depth, Acc, InString] }
    : S extends `${infer C}${infer Rest}`
        ? C extends "'"
            ? SplitBalancedParenWorker<Rest, Depth, `${Acc}${C}`, InString extends true ? false : true, [any, ...Steps]>
            : InString extends true
                ? SplitBalancedParenWorker<Rest, Depth, `${Acc}${C}`, InString, [any, ...Steps]>
                : C extends "("
                    ? Depth["length"] extends 0
                        ? SplitBalancedParenWorker<Rest, [any], Acc, InString, [any, ...Steps]>
                        : SplitBalancedParenWorker<Rest, [any, ...Depth], `${Acc}${C}`, InString, [any, ...Steps]>
                    : C extends ")"
                        ? Depth extends [any, ...infer D extends any[]]
                            ? D["length"] extends 0
                                ? { inner: Acc; rest: Rest }
                                : SplitBalancedParenWorker<Rest, D, `${Acc}${C}`, InString, [any, ...Steps]>
                            : { inner: Acc; rest: Rest }
                        : SplitBalancedParenWorker<Rest, Depth, `${Acc}${C}`, InString, [any, ...Steps]>
        : { inner: Acc; rest: "" };

export type SplitBalancedParen<S extends string> =
    SplitBalancedParenDrive<SplitBalancedParenWorker<S>>;

type SplitBalancedParenDrive<R> =
    R extends { __c: [infer S extends string, infer Depth extends any[], infer Acc extends string, infer InString extends boolean] }
        ? SplitBalancedParenDrive<SplitBalancedParenWorker<S, Depth, Acc, InString, []>>
        : R;

// Remove every SUBQUERY parenthesised group (a balanced `(...)` whose body is a
// `select ...`) from a query, leaving a single space in its place. Function-call
// and grouping parens (`coalesce(...)`, `sum(...)`, `(a + b)`) are kept verbatim
// so a function name never degrades into a dangling bare identifier. Used by
// scope validation to recover the OUTER relations and refs of a query with its
// subquery bodies excised. Bounded against runaway (≤30 groups); on overflow the
// remainder is appended as-is.
export type StripSubqueries<
    S extends string,
    Acc extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 30
    ? `${Acc}${S}`
    : S extends `${infer Before}(${infer AfterOpen}`
        ? SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string; rest: infer Rest extends string }
            ? Trim<Inner> extends `select ${string}`
                ? StripSubqueries<Rest, `${Acc}${Before} `, [any, ...Steps]>
                : StripSubqueries<Rest, `${Acc}${Before}(${Inner})`, [any, ...Steps]>
            : `${Acc}${S}`
        : `${Acc}${S}`;

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
    | "like" | "ilike" | "in" | "between" | "exists"
    // Pattern-matching keywords: `SIMILAR TO <pattern>` and `LIKE ... ESCAPE
    // <char>`. The keywords themselves are never column references.
    | "similar" | "to" | "escape"
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
        | "between" | "like" | "ilike"
        // RHS of `SIMILAR TO <pattern>` (the `to`) and `... ESCAPE <char>`
        // (the `escape`) are column-bearing expression positions, so an unknown
        // bareword there must be validated like any other RHS column.
        | "to" | "escape"
        ? true
        : false;
