// SELECT/RETURNING/clause + column-list extraction.
import type { CleanIdent, FilterEmpty, HasSpecial, MapClean, Split, Trim, TrimLeft } from "./string-utils.js";
import type { ExtractBefore, ExtractBeforeFromTopLevel, SplitCommaSimple, SplitTopLevel, StripDistinct } from "./split.js";
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

// Quote-free fast-path (mirrors `HasReturningQuoteAware`): with no `'` and no `"`
// every ` returning ` is top-level, so the FIRST one's tail is exact via a single
// leftmost template match — skipping the ~1200-step walk on every quote-free DML.
// Only quote-bearing queries take the walk. The fast-path pattern matches the walk's
// own step-cap fallback, so behavior is unchanged.
export type FirstTopLevelReturningTail<S extends string> =
    string extends S
        ? ""
        : S extends `${string}'${string}`
            ? FirstTopLevelReturningTailWalk<S>
            : S extends `${string}"${string}`
                ? FirstTopLevelReturningTailWalk<S>
                : S extends `${string} returning ${infer After}` ? After : "";

type FirstTopLevelReturningTailWalk<
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
                ? FirstTopLevelReturningTailWalk<Rest, C extends "'" ? false : true, InDString, [any, ...Steps]>
                : ""
            : InDString extends true
                ? S extends `${infer C}${infer Rest}`
                    ? FirstTopLevelReturningTailWalk<Rest, InString, C extends `"` ? false : true, [any, ...Steps]>
                    : ""
                : S extends ` returning ${infer After}`
                    ? After
                    : S extends `${infer C}${infer Rest}`
                        ? FirstTopLevelReturningTailWalk<Rest, C extends "'" ? true : false, C extends `"` ? true : false, [any, ...Steps]>
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
//
// Struct-jump, not per-char (the old walk minted one growing-`Acc` string PER
// CHARACTER across entire CTE/subquery bodies). Each step advances to the
// LEFTMOST of the three state chars `'` `(` `)` (double quotes were never
// tracked here — preserved), copying the whole run before it in a single mint;
// inside a `'…'` literal it jumps straight to the closing quote (`''` escapes
// exit+re-enter across two jumps; an unterminated quote at EOF copies the rest
// verbatim). The `Steps` cap counts JUMPS and yields `{ __c: [...] }` to the
// driver, so arbitrarily paren-dense inputs still complete losslessly.
type SplitBalancedParenWorker<
    S extends string,
    Depth extends any[] = [],
    Acc extends string = "",
    InString extends boolean = false,
    Steps extends any[] = []
> = Steps["length"] extends 350
    ? { __c: [S, Depth, Acc, InString] }
    : InString extends true
        ? S extends `${infer P}'${infer R}`
            ? SplitBalancedParenWorker<R, Depth, `${Acc}${P}'`, false, [any, ...Steps]>
            : { inner: `${Acc}${S}`; rest: "" }
        : S extends `${infer P}'${infer R}`
            ? P extends `${string}(${string}` | `${string})${string}`
                ? SbpParenJump<S, Depth, Acc, Steps>
                : SplitBalancedParenWorker<R, Depth, `${Acc}${P}'`, true, [any, ...Steps]>
            : SbpParenJump<S, Depth, Acc, Steps>;

// Leftmost of `(` / `)` (the caller guarantees no `'` occurs before either).
type SbpParenJump<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}(${infer R}`
    ? P extends `${string})${string}`
        ? SbpCloseJump<S, Depth, Acc, Steps>
        : Depth["length"] extends 0
            // the group-opening `(` itself is consumed, not copied into `inner`
            ? SplitBalancedParenWorker<R, [any], `${Acc}${P}`, false, [any, ...Steps]>
            : SplitBalancedParenWorker<R, [any, ...Depth], `${Acc}${P}(`, false, [any, ...Steps]>
    : SbpCloseJump<S, Depth, Acc, Steps>;

type SbpCloseJump<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P})${infer R}`
    ? Depth extends [any, any, ...infer D extends any[]]
        ? SplitBalancedParenWorker<R, [any, ...D], `${Acc}${P})`, false, [any, ...Steps]>
        // depth ≤ 1: this `)` closes the group (or is an unmatched top-level `)`)
        : { inner: `${Acc}${P}`; rest: R }
    : { inner: `${Acc}${S}`; rest: "" };

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

// The RHS of a `DO UPDATE SET col = excluded.<x>` assignment references the
// `excluded` pseudo-row, which mirrors the INSERT target table's columns. Collect
// the referenced `<x>` names from each simple `left = excluded.<x>` assignment so
// they can be existence-checked against the target table. Only the direct
// `excluded.<col>` form is captured — a column wrapped in a larger expression
// (`coalesce(excluded.x, ...)`) is left to the lenient path rather than risk a
// false reject.
export type ExtractConflictUpdateExcludedCols<N extends string> =
    N extends `${string} do update set ${infer Rest}`
        ? ExtractBefore<Rest, " where "> extends infer Block1 extends string
            ? ExtractBefore<Block1, " returning "> extends infer Block2 extends string
                ? MapExcludedRHS<Split<Block2, ",">>
                : []
            : []
        : [];

export type MapExcludedRHS<Parts extends string[], Acc extends string[] = []> =
    Parts extends [infer P extends string, ...infer Rest extends string[]]
        ? P extends `${string}=${infer Right}`
            ? CleanIdent<Right> extends `excluded.${infer Col}`
                ? MapExcludedRHS<Rest, [...Acc, Col]>
                : MapExcludedRHS<Rest, Acc>
            : MapExcludedRHS<Rest, Acc>
        : Acc;

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

