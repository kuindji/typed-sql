// NormalizeQuery pipeline + quote-aware lowercasing.
import type { CollapseSpaces, Trim } from "./string-utils.js";
import type { NeutralizePgLiterals, RewriteExtractCall, RewriteKwFromCalls, StripComments } from "./pg-literals.js";

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
// The lowercaser preserves every character except case — it never introduces
// `\n\t\r` or extra spaces — so once the INNER `CollapseSpaces<ReplaceWhitespace>`
// has normalized whitespace, an OUTER pass is a no-op: `ReplaceWhitespace` sees no
// line breaks (cheap `HasLineBreaks` guard returns `S` without walking) and
// `CollapseSpaces` would re-walk an already single-spaced string. The outer
// `CollapseSpaces` is an 800-step char-walk that ran on every query for nothing, so
// it's dropped. The chunked `LowercaseOutsideQuotes` already handles arbitrary
// length, so the "collapse first to fit the lowercaser under its cap" rationale no
// longer requires a second collapse afterwards.
export type NormalizeQuery<S extends string> =
    RewriteKwFromCalls<RewriteExtractCall<Trim<RemoveTrailingSemicolon<CollapseDotSpaces<LowercaseOutsideQuotes<CollapseSpaces<ReplaceWhitespace<StripComments<NeutralizePgLiterals<S>>>>>>>>>>;

// Collapse whitespace around the `.` qualifier separator: `X .Y` / `X. Y` /
// `X . Y` -> `X.Y`. PostgreSQL allows whitespace around the qualifier dot
// (`tbl . col` === `tbl.col`); the normalizer's ReplaceWhitespace+CollapseSpaces
// turns a multi-line qualified ref (`tbl\n  .col`) into `tbl .col`, which would
// otherwise tokenize as the orphan `.col` plus a bare `tbl` that the
// unqualified-column check then rejects as a (non-existent) column. Rejoining the
// dot lets `tbl.col` resolve normally.
//
// CHEAP PRE-GATE: the overwhelmingly common query has no spaced dot, so a single
// `" ."` / `". "` membership test short-circuits to identity in ~1 instantiation.
export type CollapseDotSpaces<S extends string> =
    S extends `${string} .${string}`
        ? MaybeCollapseDotSpaces<S>
        : S extends `${string}. ${string}`
            ? MaybeCollapseDotSpaces<S>
            : S;

// Single-quoted literals are already blanked to '' by NeutralizePgLiterals, so
// only a double-quoted identifier could host a spaced dot (`"a . b"`). With no
// `"` present the quote-unaware ladder is provably safe; otherwise defer to a
// quote-aware walk that collapses dots only OUTSIDE double-quoted spans.
type MaybeCollapseDotSpaces<S extends string> =
    S extends `${string}"${string}`
        ? CollapseDotSpacesQuoteAware<S, false, "", []>
        : CollapseDotSpacesWalk<S>;

// O(spaced dots), not O(chars): `${infer A}` jumps a whole non-matching run per
// step, so a string with no further spaced dot exits in one instantiation. Step
// cap is a runaway backstop, far under TS's recursion ceiling.
type CollapseDotSpacesWalk<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 400
        ? S
        : S extends `${infer A} . ${infer B}`
            ? CollapseDotSpacesWalk<`${A}.${B}`, [any, ...Steps]>
            : S extends `${infer A} .${infer B}`
                ? CollapseDotSpacesWalk<`${A}.${B}`, [any, ...Steps]>
                : S extends `${infer A}. ${infer B}`
                    ? CollapseDotSpacesWalk<`${A}.${B}`, [any, ...Steps]>
                    : S;

// Quote-aware tier: copy `"..."` identifier spans verbatim, collapse spaced dots
// only in the runs OUTSIDE them, so a column literally named `"a . b"` is never
// corrupted. Depth is O(double-quote boundaries).
type CollapseDotSpacesQuoteAware<
    S extends string,
    InDQ extends boolean,
    Acc extends string,
    Steps extends any[]
> = Steps["length"] extends 400
    ? `${Acc}${S}`
    : InDQ extends true
        ? S extends `${infer P}"${infer R}`
            ? CollapseDotSpacesQuoteAware<R, false, `${Acc}${P}"`, [any, ...Steps]>
            : `${Acc}${S}`
        : S extends `${infer P}"${infer R}`
            ? CollapseDotSpacesQuoteAware<R, true, `${Acc}${CollapseDotSpacesWalk<P>}"`, [any, ...Steps]>
            : `${Acc}${CollapseDotSpacesWalk<S>}`;

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
        : S extends `${string}${"'" | `"`}${string}`
            ? LowercaseOutsideQuotesDrive<LowercaseOutsideQuotesWorker<S, false, false, "", []>>
            : Lowercase<S>;

type LowercaseOutsideQuotesDrive<R> =
    R extends { __c: [infer S extends string, infer Q1 extends boolean, infer Q2 extends boolean, infer Acc extends string] }
        ? LowercaseOutsideQuotesDrive<LowercaseOutsideQuotesWorker<S, Q1, Q2, Acc, []>>
        : R;

// Segment-jump, not per-char. Each step advances a whole quote-bounded run:
// outside quotes it jumps to the LEFTMOST of `'`/`"`, lowercasing the run before
// it in a single `Lowercase<…>` intrinsic; inside a quote it copies verbatim to
// the matching close-quote. Cost is O(quote boundaries), not O(chars) — the old
// per-char walk emitted one instantiation per character on every NormalizeQuery.
// The `Steps` cap now counts JUMPS (a handful even for report-scale queries), so
// 450 is far past any real query yet still yields `{ __c }` for the driver before
// TS's recursion ceiling on a pathologically quote-dense input.
//
// Exact-equivalent to the walk it replaces: `''` escapes toggle single-quote
// state twice (exit on the first `'`, the second is re-seen outside with an empty
// prefix and re-enters); an unterminated quote at EOF copies the rest verbatim
// (`${Acc}${S}`); a `"` inside a single-quoted run never flips state (the
// in-single branch only scans for `'`, and vice-versa).
type LowercaseOutsideQuotesWorker<
    S extends string,
    InSingleQuote extends boolean,
    InDoubleQuote extends boolean,
    Acc extends string,
    Steps extends any[]
> = Steps["length"] extends 450
    ? { __c: [S, InSingleQuote, InDoubleQuote, Acc] }
    : InSingleQuote extends true
        ? S extends `${infer P}'${infer R}`
            ? LowercaseOutsideQuotesWorker<R, false, InDoubleQuote, `${Acc}${P}'`, [any, ...Steps]>
            : `${Acc}${S}`
        : InDoubleQuote extends true
            ? S extends `${infer P}"${infer R}`
                ? LowercaseOutsideQuotesWorker<R, InSingleQuote, false, `${Acc}${P}"`, [any, ...Steps]>
                : `${Acc}${S}`
            : S extends `${infer P}'${infer R}`
                ? P extends `${string}"${string}`
                    // a `"` precedes the first `'` → the double quote is leftmost
                    ? S extends `${infer P2}"${infer R2}`
                        ? LowercaseOutsideQuotesWorker<R2, InSingleQuote, true, `${Acc}${Lowercase<P2>}"`, [any, ...Steps]>
                        : `${Acc}${Lowercase<S>}`
                    // `'` is the leftmost quote
                    : LowercaseOutsideQuotesWorker<R, true, InDoubleQuote, `${Acc}${Lowercase<P>}'`, [any, ...Steps]>
                // no `'` remains → only a `"` could open a verbatim run
                : S extends `${infer P2}"${infer R2}`
                    ? LowercaseOutsideQuotesWorker<R2, InSingleQuote, true, `${Acc}${Lowercase<P2>}"`, [any, ...Steps]>
                    : `${Acc}${Lowercase<S>}`;

// ---------------------------------------------------------------------------
// Param-name-preserving lowercaser (write/raw builder path only).
//
// Identical to LowercaseOutsideQuotes, but the identifier of a `:name` named
// parameter keeps its EXACT case. Named params become object keys in the
// builder's `withParams({ … })`, so folding `:teamId`→`:teamid` produced keys
// the caller could not write (F1). Quoted literals/identifiers are preserved as
// before; a `::cast` operator is consumed as a unit so the type name after it
// still lowercases and the second colon is never mistaken for a param start.
// The quote-aware char-walk below (`LcKeepDrive`→`LcKeepWorker`) exists only to
// preserve the case of `:name` params — its single consumer, `ExtractParams`, emits
// those as `withParams` keys. Everything else the walk preserves (quoted
// literals/identifiers) is INVISIBLE to the param→type result: literals are
// stripped/widened, quoted column refs are lowercased by `CleanIdent` anyway, and an
// aliased qualifier and its uses fold consistently. So when NO `:name` param
// identifier carries an uppercase letter, every param name is already lowercase and
// the `Lowercase<S>` intrinsic yields a byte-identical `ExtractParams` result —
// replacing the only un-truncated O(length) char-walk on the builder param-extraction
// hot path with a single depth-1 native operation. That trims this chain's
// instantiation COUNT and DEPTH (both TS2589 drivers), buying recursion-limit headroom
// at the cost of a little more compiler memory (the intrinsic interns the full
// lowercased literal) — a trade we take deliberately to make large builder queries
// less likely to hit the depth ceiling.
//
// `ParamsHaveUpper` is the gate. It jumps colon-to-colon (leftmost template match), so
// its depth is the NUMBER OF COLONS — a handful — not the query length, staying far
// cheaper than the walk it guards. `::cast` skips both colons (cast type names always
// lowercase safely). `Lowercase<Nm> extends Nm` is false exactly when the param name
// `Nm` carries an uppercase letter. It is conservative: a colon-dense overrun, or ANY
// uppercase param, falls back to the exact-fidelity walk — false positives only cost
// speed, never correctness.
type ParamsHaveUpper<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 64
        ? true
        : S extends `${infer _Pre}:${infer Rest}`
            ? Rest extends `:${infer R2}`
                ? ParamsHaveUpper<R2, [any, ...Steps]>
                : ReadParamIdent<Rest> extends { name: infer Nm extends string; rest: infer Rr extends string }
                    ? Lowercase<Nm> extends Nm
                        ? ParamsHaveUpper<Rr, [any, ...Steps]>
                        : true
                    : ParamsHaveUpper<Rest, [any, ...Steps]>
            : false;

export type LowercaseOutsideQuotesKeepParams<S extends string> =
    string extends S
        ? string
        : ParamsHaveUpper<S> extends true
            ? LcKeepDrive<LcKeepWorker<S, false, false, "", []>>
            : Lowercase<S>;

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

// Segment-jump sibling of `LowercaseOutsideQuotesWorker`, with the extra
// outside-quote rule that a lone `:` opens a case-PRESERVED `:name` param and
// `::` is a cast unit. Outside quotes it is therefore a leftmost-of-THREE jump
// (`'` / `"` / `:`): split on the first `:`; if a quote occurs in the run BEFORE
// it, the quote is leftmost so defer to `LcKeepQuoteJump` (the same leftmost-of-2
// quote logic as the plain worker); otherwise the colon is leftmost — lowercase
// the run, then consume `::` or read the verbatim param ident, exactly as the old
// per-char branch did. In/out-of-quote verbatim copies and the `''`/unterminated
// edges match `LowercaseOutsideQuotesWorker`.
type LcKeepWorker<
    S extends string,
    InSingleQuote extends boolean,
    InDoubleQuote extends boolean,
    Acc extends string,
    Steps extends any[]
> = Steps["length"] extends 450
    ? { __c: [S, InSingleQuote, InDoubleQuote, Acc] }
    : InSingleQuote extends true
        ? S extends `${infer P}'${infer R}`
            ? LcKeepWorker<R, false, InDoubleQuote, `${Acc}${P}'`, [any, ...Steps]>
            : `${Acc}${S}`
        : InDoubleQuote extends true
            ? S extends `${infer P}"${infer R}`
                ? LcKeepWorker<R, InSingleQuote, false, `${Acc}${P}"`, [any, ...Steps]>
                : `${Acc}${S}`
            : S extends `${infer Pc}:${infer Rc}`
                // a quote before the first `:` → the quote is leftmost
                ? Pc extends `${string}'${string}`
                    ? LcKeepQuoteJump<S, InSingleQuote, InDoubleQuote, Acc, Steps>
                    : Pc extends `${string}"${string}`
                        ? LcKeepQuoteJump<S, InSingleQuote, InDoubleQuote, Acc, Steps>
                        // colon is leftmost: `::` cast unit, else verbatim `:name`
                        : Rc extends `:${infer R2}`
                            ? LcKeepWorker<R2, InSingleQuote, InDoubleQuote, `${Acc}${Lowercase<Pc>}::`, [any, ...Steps]>
                            : ReadParamIdent<Rc> extends { name: infer Nm extends string; rest: infer Rr extends string }
                                ? LcKeepWorker<Rr, InSingleQuote, InDoubleQuote, `${Acc}${Lowercase<Pc>}:${Nm}`, [any, ...Steps]>
                                : LcKeepWorker<Rc, InSingleQuote, InDoubleQuote, `${Acc}${Lowercase<Pc>}:`, [any, ...Steps]>
                // no `:` remains → only quotes (or nothing) left
                : LcKeepQuoteJump<S, InSingleQuote, InDoubleQuote, Acc, Steps>;

// Leftmost-of-2 quote jump (identical shape to the plain worker's outside-quote
// branch) that hands the continuation back to `LcKeepWorker`.
type LcKeepQuoteJump<
    S extends string,
    InSingleQuote extends boolean,
    InDoubleQuote extends boolean,
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}'${infer R}`
    ? P extends `${string}"${string}`
        ? S extends `${infer P2}"${infer R2}`
            ? LcKeepWorker<R2, InSingleQuote, true, `${Acc}${Lowercase<P2>}"`, [any, ...Steps]>
            : `${Acc}${Lowercase<S>}`
        : LcKeepWorker<R, true, InDoubleQuote, `${Acc}${Lowercase<P>}'`, [any, ...Steps]>
    : S extends `${infer P2}"${infer R2}`
        ? LcKeepWorker<R2, InSingleQuote, true, `${Acc}${Lowercase<P2>}"`, [any, ...Steps]>
        : `${Acc}${Lowercase<S>}`;

// NormalizeQuery variant that preserves `:name` param case — used by the
// write/raw builder param extraction (ExtractParams) only.
export type NormalizeQueryKeepParams<S extends string> =
    RewriteKwFromCalls<RewriteExtractCall<Trim<RemoveTrailingSemicolon<CollapseDotSpaces<LowercaseOutsideQuotesKeepParams<CollapseSpaces<ReplaceWhitespace<StripComments<NeutralizePgLiterals<S>>>>>>>>>>;

// Convert every `\n` / `\t` / `\r` to a space. OCCURRENCE-based (like
// `CollapseSpaces`): each step splits at the FIRST remaining line break, so the
// `${infer A}` skips a whole run of non-whitespace and the cost is O(line breaks),
// NOT O(chars). The old per-char form (`ReplaceWhitespaceLimited`) capped at ~900
// CHARS, so a report-scale multi-line query left the TAIL of its SELECT list
// un-normalized — trailing projections kept raw newlines and degraded to
// `unknown`/dropped. The occurrence form covers the whole query under a step cap
// that stays far from TS's tail-recursion limit. (`HasLineBreaks` keeps the common
// single-line query a true no-op.)
export type ReplaceWhitespace<S extends string> =
    HasLineBreaks<S> extends true
        ? ReplaceWhitespaceRuns<S>
        : S;

// Acc-carrying worker: the finished prefix moves into `Acc` and is NEVER
// rescanned or reminted (the old form rebuilt the FULL string once per line
// break and re-matched it from the start). Because consumed segments leave the
// scan, the worker must take the LEFTMOST of `\n`/`\t`/`\r` each step — the
// old rebuild-and-rescan form got that for free by always re-matching `\n`
// first over the whole string. Same pairwise-narrowing cascade as
// `MtcStructJump`. The step cap counts whitespace RUNS (each consumed whole by
// `ConsumeWsRun`), so it covers at least as much input as the old
// per-occurrence cap; on cap the remainder is left as-is, as before.
type ReplaceWhitespaceRuns<S extends string, Acc extends string = "", Steps extends any[] = []> =
    string extends S
        ? S
        : Steps["length"] extends 1500
            ? `${Acc}${S}`
            : S extends `${infer A}\n${infer B}`
                ? A extends `${string}\t${string}` | `${string}\r${string}`
                    ? RwrTabCr<S, Acc, Steps>
                    : ReplaceWhitespaceRuns<ConsumeWsRun<B>, `${Acc}${A} `, [any, ...Steps]>
                : RwrTabCr<S, Acc, Steps>;

// Leftmost of `\t` / `\r` (caller ruled out an earlier `\n`).
type RwrTabCr<S extends string, Acc extends string, Steps extends any[]> =
    S extends `${infer A}\t${infer B}`
        ? A extends `${string}\r${string}`
            ? S extends `${infer A2}\r${infer B2}`
                ? ReplaceWhitespaceRuns<ConsumeWsRun<B2>, `${Acc}${A2} `, [any, ...Steps]>
                : `${Acc}${S}`
            : ReplaceWhitespaceRuns<ConsumeWsRun<B>, `${Acc}${A} `, [any, ...Steps]>
        : S extends `${infer A2}\r${infer B2}`
            ? ReplaceWhitespaceRuns<ConsumeWsRun<B2>, `${Acc}${A2} `, [any, ...Steps]>
            : `${Acc}${S}`;

// Eat the whole whitespace run FOLLOWING a consumed line break before the full
// string is rebuilt. A formatted query's `\n␣␣␣␣` indentation otherwise survives
// as a multi-space run that costs `ReplaceWhitespaceRuns` extra full-string
// remints (one per `\n` of a blank line) plus one more full remint per run in
// `CollapseSpaces`. Peeling here works on the TAIL only — far cheaper mints —
// and leaves `CollapseSpaces` a no-op for these runs. Equivalence: both forms
// reduce every whitespace run that touches a line break to a single space, and
// runs NOT touching a line break are still collapsed by the unchanged
// `CollapseSpaces` pass. A capped-out leftover (`\t`/`\n`/`\r` beyond the
// budget) is still caught by the outer loop's own branches.
type ConsumeWsRun<S extends string, Steps extends any[] = []> =
    Steps["length"] extends 64
        ? S
        : S extends `                ${infer R}`   // 16 spaces
            ? ConsumeWsRun<R, [any, ...Steps]>
            : S extends `    ${infer R}`           // 4 spaces
                ? ConsumeWsRun<R, [any, ...Steps]>
                : S extends ` ${infer R}`
                    ? ConsumeWsRun<R, [any, ...Steps]>
                    : S extends `\t${infer R}`
                        ? ConsumeWsRun<R, [any, ...Steps]>
                        : S extends `\n${infer R}`
                            ? ConsumeWsRun<R, [any, ...Steps]>
                            : S extends `\r${infer R}`
                                ? ConsumeWsRun<R, [any, ...Steps]>
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

export type RemoveTrailingSemicolon<S extends string> =
    Trim<S> extends `${infer R};` ? Trim<R> : Trim<S>;
