import type { DatabaseSchema, ColumnTypeFromTableKey, RowTypeForTable, RowTypeForTables } from "./schema.js";
import type {
    ColumnRef,
    ColumnRefValidLooseWith,
    ParseColumnRef,
    QualifiedRefScan,
    ResolveTableKey,
    UnqualifiedRefScan,
    UnqualifiedColumnValid
} from "./columns.js";
import type { AliasesInQuery, TablesInQuery } from "./tables.js";
import type {
    CleanExpr,
    CleanIdent,
    ExtractAlias,
    ExtractAliasResult,
    ExtractBefore,
    ExtractBeforeFromTopLevel,
    IsIdentifier,
    IsParamPlaceholder,
    IsRuntimeStringFragment,
    IsSqlConstant,
    SqlConstantType,
    SplitBalancedParen,
    SplitTopLevel,
    Trim
} from "./parsing.js";
import type { AllTrue } from "./utils.js";

// Expression parsing & types

export type IsIgnorableRuntimeExpr<E extends string> =
    IsRuntimeStringFragment<E> extends true
        ? true
        : [E] extends [" "]
            ? true
            : false;

export type ExprToObject<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string = never
> =
    IsIgnorableRuntimeExpr<E> extends true
        ? {}
        : ExtractAliasResult<E> extends { expr: infer RawExpr extends string; alias: infer Alias }
            ? IsIgnorableRuntimeExpr<RawExpr> extends true
            ? [Alias] extends [never]
                ? {}
                : Alias extends string
                    ? { [K in Alias]: unknown }
                    : {}
            : [Alias] extends [never]
                ? CleanIdent<RawExpr> extends "*"
                    ? RowTypeForTables<Tables, S>
                    : CleanIdent<RawExpr> extends `${infer T}.*`
                        ? MaybeNullableRow<RowTypeForTable<ResolveTableKey<CleanIdent<T>, Tables, Aliases, S>, S>, T, Nullable>
                        : ExprKey<E, Tables, Aliases, S> extends infer Key extends string | never
                            ? Key extends string
                                ? { [K in Key]: NeverToUnknown<ApplyProjectionNull<ExprType<RawExpr, Tables, Aliases, S>, RawExpr, Tables, Aliases, S, Nullable>, RawExpr> }
                                : Record<string, unknown>
                            : Record<string, unknown>
                : Alias extends string
                        ? { [K in Alias]: NeverToUnknown<ApplyProjectionNull<ExprType<RawExpr, Tables, Aliases, S>, RawExpr, Tables, Aliases, S, Nullable>, RawExpr> }
                        : Record<string, unknown>
            : Record<string, unknown>;

// A projected QUALIFIED ref that resolves to `never` (e.g. one qualified by a
// CTE name that the core path collected as a bogus base table — `input_ips.x`
// in `WITH input_ips(...) ... SELECT input_ips.x ... JOIN ...`) must surface as
// `unknown` in the ROW type — `never` is validation's reject signal, not a value
// type, and a `never` property poisons every consumer of the row. An UNQUALIFIED
// invalid column keeps its `never` field: that visibility is deliberate and
// pinned by the adversarial cast suite (`not_a_col::text` -> `{ x: never }`).
type NeverToUnknown<T, E extends string> =
    [T] extends [never]
        ? E extends `${string}.${string}`
            ? unknown
            : T
        : T;

// Outer-join nullability for a directly-projected column. `Nullable` is the set
// of reference qualifiers (aliases / table names) that are nullable due to an
// outer join (see `NullableRelations`). When the projected expression is a plain
// column ref (optionally wrapped in a cast) qualified by one of them, union
// `| null` onto its type. Function calls, concatenations, literals, and `*` are
// not plain qualified column refs, so they keep their computed type. The
// `[Nullable] extends [never]` guard makes join-free queries pay zero extra cost.
export type ApplyJoinNull<
    T,
    E extends string,
    Nullable extends string
> =
    [Nullable] extends [never]
        ? T
        : RefQualifier<E> extends infer Q extends string
            ? [Q] extends [never]
                ? T
                : Q extends Nullable
                    ? T | null
                    : T
            : T;

// The qualifier of a plain column ref (`tr."name"` -> `tr`), after stripping an
// outer cast (`tms."currency"::text` -> `tms`). `never` when the expression has
// no qualifier (bare column) or is not a plain column ref.
export type RefQualifier<E extends string> =
    StripOuterCast<E> extends infer Inner extends string
        ? CleanExpr<Inner> extends `${infer Q}.${string}`
            ? CleanIdent<Q>
            : never
        : never;

export type StripOuterCast<E extends string> =
    CleanExpr<E> extends `${infer Inner}::${string}`
        ? Inner
        : CleanExpr<E> extends `cast(${infer Inner} as ${string})`
            ? Inner
            : CleanExpr<E> extends `cast (${infer Inner} as ${string})`
                ? Inner
                : E;

// Projection-level nullability dispatcher. Plain column refs go through
// `ApplyJoinNull` (qualifier-in-nullable-set check). A `coalesce(...)` projection
// (optionally wrapped in an outer cast like `coalesce(...)::text`) hides its column
// refs from `RefQualifier`, so `ApplyJoinNull` can never see them — we handle it
// here instead. SQL: `coalesce(a, b, c)` is NULL only when EVERY argument is NULL,
// so the projection gains `| null` only when all args are nullable (an outer-join
// nullable qualifier OR an already-nullable base type). A non-null literal
// (`coalesce(o.x, '')`) keeps the result non-null. `T` is the already-computed
// projection type (for the cast case, the cast's target type); we only add `| null`.
export type ApplyProjectionNull<
    T,
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string
> =
    CleanExpr<StripOuterCast<E>> extends `coalesce(${infer Args})`
        ? CoalesceAllArgsNullable<SplitTopLevel<Args>, Tables, Aliases, S, Nullable> extends true
            ? T | null
            : T
        : [Nullable] extends [never]
            ? T
            // A CASE projection is nullable when a THEN/ELSE result references
            // the nullable side of an outer join. Checked before the generic
            // ref/arith handling: a CASE body can contain operator chars (e.g.
            // `extract(... a - b ...)`) that would otherwise mis-route it.
            : IsCaseExpr<CleanExpr<E>> extends true
                ? CaseBranchJoinNullable<CleanExpr<E>, Nullable> extends true
                    ? T | null
                    : T
            : [T] extends [never]
                ? ApplyJoinNull<T, E, Nullable>
                : [T] extends [number | null]
                    ? E extends `${string}${"+" | "-" | "*" | "/" | "%"}${string}`
                        ? ArithRefJoinNullable<E, Tables, Aliases, S, Nullable> extends true
                            ? T | null
                            : ApplyJoinNull<T, E, Nullable>
                        : ApplyJoinNull<T, E, Nullable>
                    : ApplyJoinNull<T, E, Nullable>;

// Outer-join nullability for a TOP-LEVEL ARITHMETIC projection (`A op B`).
// SQL NULL arithmetic is NULL, so the result is nullable when ANY operand is
// sourced from the nullable side of an outer join. `RefQualifier` cannot see
// operand refs (an arithmetic expression is not a plain column ref — or worse,
// its leftmost dot fakes one: `u.id + o.total` "qualifies" as `u`), so this
// walks the operands the same way the arithmetic TYPING did: split at the
// top-level operator and recurse each side. Only consulted when the projection
// already typed `number`/`number | null` (the arithmetic result types), under
// a non-empty `Nullable` set, with an operator char present — join-free
// queries and plain projections pay nothing. A `false` verdict falls back to
// `ApplyJoinNull`, so a non-arithmetic expression that slips past the op-char
// gate (e.g. a quoted-punct ref like `"u-1".id`) keeps its plain-ref handling.
type ArithRefJoinNullable<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string,
    Steps extends any[] = []
> =
    Steps["length"] extends 8
        ? false
        : UnwrapRedundantParens<Trim<E>> extends infer SC extends string
            ? SC extends `${string}${"+" | "-" | "*" | "/" | "%"}${string}`
                ? SplitTopLevelOp<SC> extends infer SR
                    ? [SR] extends [never]
                        ? ArithOperandJoinNullable<SC, Tables, Aliases, S, Nullable>
                        : SR extends { __op: [infer L extends string, infer Op extends string, infer R extends string] }
                            ? Op extends "||"
                                ? false
                                : ArithRefJoinNullable<Trim<L>, Tables, Aliases, S, Nullable, [any, ...Steps]> extends true
                                    ? true
                                    : ArithRefJoinNullable<Trim<R>, Tables, Aliases, S, Nullable, [any, ...Steps]>
                            : ArithOperandJoinNullable<SC, Tables, Aliases, S, Nullable>
                    : false
                : ArithOperandJoinNullable<SC, Tables, Aliases, S, Nullable>
            : false;

// A LEAF arithmetic operand (no top-level operator left). A whole-operand
// `coalesce(...)` keeps its all-args-nullable semantics (`coalesce(o.x, 0)`
// stays non-null even on the nullable side). A function-call operand
// (`sum(o.total)`) is conservatively nullable when any nullable-side
// qualified ref appears inside it — an all-NULL group aggregates to NULL.
// A plain ref consults its qualifier; literals and params stay non-null.
type ArithOperandJoinNullable<
    SC extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string
> =
    CleanExpr<StripOuterCast<SC>> extends `coalesce(${infer Args})`
        ? CoalesceAllArgsNullable<SplitTopLevel<Args>, Tables, Aliases, S, Nullable>
        : SC extends `${string}(${string}`
            ? NullableQualRefIn<SC, Nullable>
            : RefQualifier<SC> extends infer Q extends string
                ? [Q] extends [never]
                    ? false
                    : Q extends Nullable
                        ? true
                        : false
                : false;

// True when a `<Q>.`-qualified ref appears in `E` for any nullable qualifier
// `Q` — at the start, or after a boundary char that cannot be part of an
// identifier (so alias-suffix lookalikes like `po.x` never match `o`).
type NullableQualRefIn<E extends string, Nullable extends string> =
    true extends (Nullable extends string ? QualRefIn<E, Nullable> : never)
        ? true
        : false;

type QualRefIn<E extends string, Q extends string> =
    E extends `${Q}.${string}`
        ? true
        : E extends `${string}${" " | "(" | "," | "+" | "-" | "*" | "/" | "%"}${Q}.${string}`
            ? true
            : false;

// True only when every coalesce argument is nullable. An empty/exhausted list is
// vacuously `true`, but the wrapper above only reaches this for a real coalesce call
// (at least one arg). Recursion is depth-capped like the other arg walkers.
export type CoalesceAllArgsNullable<
    Args extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string,
    Steps extends any[] = []
> = Steps["length"] extends 30
    ? true
    : Args extends [infer H extends string, ...infer Rest extends string[]]
        ? CoalesceArgNullable<H, Tables, Aliases, S, Nullable> extends true
            ? CoalesceAllArgsNullable<Rest, Tables, Aliases, S, Nullable, [any, ...Steps]>
            : false
        : true;

// A single coalesce argument is nullable when its qualifier is in the outer-join
// nullable set (`ri.sku` under `left join ... ri`), or — failing that — when its
// base type already admits `null` (a base-nullable column, or an unresolved
// `unknown` arg). A non-null literal resolves to a non-null base type -> `false`.
export type CoalesceArgNullable<
    Arg extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Nullable extends string
> =
    RefQualifier<Arg> extends infer Q extends string
        ? [Q] extends [never]
            ? null extends ExprType<Arg, Tables, Aliases, S>
                ? true
                : false
            : Q extends Nullable
                ? true
                : null extends ExprType<Arg, Tables, Aliases, S>
                    ? true
                    : false
        : null extends ExprType<Arg, Tables, Aliases, S>
            ? true
            : false;

// Nullablize every column of a `*`-expanded row when its qualifier is nullable.
export type MaybeNullableRow<Row, Qualifier extends string, Nullable extends string> =
    [Nullable] extends [never]
        ? Row
        : CleanIdent<Qualifier> extends Nullable
            ? { [K in keyof Row]: Row[K] | null }
            : Row;

export type ExprKey<E extends string, Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    CleanIdent<E> extends "*" ? never :
    CleanIdent<E> extends `${infer T}.*` ? never :
    CleanExpr<E> extends `${infer Inner}::${string}`
        ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
        : CleanExpr<E> extends `cast(${infer Inner} as ${string})`
            ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
            : CleanExpr<E> extends `cast (${infer Inner} as ${string})`
                ? ColumnKeyFromExpr<Inner, Tables, Aliases, S>
                : [ColumnKeyFromExpr<E, Tables, Aliases, S>] extends [never]
                    ? FunctionKeyFromExpr<E>
                    : ColumnKeyFromExpr<E, Tables, Aliases, S>;

export type ColumnKeyFromExpr<E extends string, Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    ParseColumnRef<CleanExpr<E>, Tables, Aliases, S> extends infer Ref
        ? Ref extends ColumnRef<any, any>
            ? Ref["column"]
            : never
        : never;

export type FunctionKeyFromExpr<E extends string> =
    CleanExpr<E> extends `case ${string}` ? "case" :
    CleanExpr<E> extends `${infer Func}(${string}`
        ? CleanIdent<Func>
        : CleanExpr<E> extends `${infer Func} (${string}`
            ? CleanIdent<Func>
            : never;

// A projected expression whose top-level operator is a comparison
// (`<`, `>`, `<=`, `>=`, `<>`, `!=`, `=`) yields `boolean`. CASE expressions are
// excluded: their `when … > …` comparison sits at top level but the expression's
// type is the THEN/ELSE branch, not boolean. A `case` wrapped in parens (e.g.
// `(case … end)`) is already protected — its inner comparison is below depth 0.
export type IsBoolExpr<CE extends string> =
    CE extends `case ${string}`
        ? false
        // Pre-gate: `HasTopLevelCompare`'s only `true` branch requires a
        // `<`/`>`/`=`/`!` char; if `CE` contains none, the answer is `false` without
        // the char-walk. Cheap template test short-circuits the common no-comparison
        // projection (a bare column / function call). Must list all four chars the
        // walk's true branch matches.
        : CE extends `${string}${"<" | ">" | "=" | "!"}${string}`
            ? HasTopLevelCompare<CE>
            : false;

// Scans for a comparison operator outside parens and outside `'…'`/`"…"` quotes.
// `->>`, `#>>` etc. are consumed as units so their `>` is not mistaken for a
// comparison.
//
// Struct-jump, not per-char (the old walk minted the tail PER CHARACTER over
// every compare-bearing expression, including whole casted subquery bodies).
// Each step advances to the leftmost of `'` `"` `(` `)` (pairwise narrowing);
// the RUN before it — structural-char-free by construction — is tested at
// depth 0 with `HtcRunCheck`: a run containing `=` or `!` is a comparison
// outright (no non-comparison unit contains either), and a run with only
// `<`/`>` is scanned unit-to-unit (`->`, `->>`, `#>`, `#>>`, `@>`, `<@`,
// `<<`, `>>` consumed by 1-char context; the old `::` consume was a no-op —
// `:` never matched the compare set). Quote spans are jumped quote-to-quote
// (the other quote kind inside a span is data, the old InQ/InDQ suppression);
// an unterminated quote swallows the rest (old walk-to-EOF → `false`). The
// cap counts jumps, `false` on overflow as before.
export type HasTopLevelCompare<S extends string> = HtcJump<S, [], []>;

type HtcJump<
    S extends string,
    Depth extends any[],
    Steps extends any[]
> = Steps["length"] extends 400
    ? false
    : S extends `${infer P}'${infer R}`
        ? P extends `${string}"${string}` | `${string}(${string}` | `${string})${string}`
            ? HtcJump2<S, Depth, Steps>
            : HtcRunCheck<P, Depth> extends true
                ? true
                : R extends `${string}'${infer R2}`
                    ? HtcJump<R2, Depth, [any, ...Steps]>
                    : false
        : HtcJump2<S, Depth, Steps>;

type HtcJump2<
    S extends string,
    Depth extends any[],
    Steps extends any[]
> = S extends `${infer P}"${infer R}`
    ? P extends `${string}(${string}` | `${string})${string}`
        ? HtcJump3<S, Depth, Steps>
        : HtcRunCheck<P, Depth> extends true
            ? true
            : R extends `${string}"${infer R2}`
                ? HtcJump<R2, Depth, [any, ...Steps]>
                : false
    : HtcJump3<S, Depth, Steps>;

type HtcJump3<
    S extends string,
    Depth extends any[],
    Steps extends any[]
> = S extends `${infer P}(${infer R}`
    ? P extends `${string})${string}`
        ? HtcJump4<S, Depth, Steps>
        : HtcRunCheck<P, Depth> extends true
            ? true
            : HtcJump<R, [any, ...Depth], [any, ...Steps]>
    : HtcJump4<S, Depth, Steps>;

type HtcJump4<
    S extends string,
    Depth extends any[],
    Steps extends any[]
> = S extends `${infer P})${infer R}`
    ? HtcRunCheck<P, Depth> extends true
        ? true
        : HtcJump<R, Depth extends [any, ...infer D] ? D : [], [any, ...Steps]>
    : HtcRunCheck<S, Depth>;

// A structural-char-free run is only inspected at depth 0. `=`/`!` never occur
// in a non-comparison unit, so their presence alone is a comparison; `<`/`>`
// need the unit scan.
type HtcRunCheck<P extends string, Depth extends any[]> =
    Depth["length"] extends 0
        ? P extends `${string}${"=" | "!"}${string}`
            ? true
            : P extends `${string}${"<" | ">"}${string}`
                ? HtcRunScan<P>
                : false
        : false;

// Unit-to-unit scan of a `<`/`>`-bearing run (no `=`/`!`, no structural chars):
// jump to the leftmost `<` or `>` and judge it by 1-char context — part of
// `<@`/`<<` (next char) or `->`/`->>`/`#>`/`#>>`/`@>`/`>>` (previous/next
// char) is consumed as a unit; anything else is a bare comparison.
type HtcRunScan<R extends string, Steps extends any[] = []> =
    Steps["length"] extends 50
        ? false
        : R extends `${infer A}<${infer B}`
            ? A extends `${string}>${string}`
                ? HtcRunGt<R, Steps>
                : B extends `@${infer B2}`
                    ? HtcRunScan<B2, [any, ...Steps]>
                    : B extends `<${infer B2}`
                        ? HtcRunScan<B2, [any, ...Steps]>
                        : true
            : HtcRunGt<R, Steps>;

type HtcRunGt<R extends string, Steps extends any[]> =
    R extends `${infer A}>${infer B}`
        ? A extends `${string}${"-" | "#" | "@"}`
            ? B extends `>${infer B2}`
                ? HtcRunScan<B2, [any, ...Steps]>
                : HtcRunScan<B, [any, ...Steps]>
            : B extends `>${infer B2}`
                ? HtcRunScan<B2, [any, ...Steps]>
                : true
        : false;

// ---------------------------------------------------------------------------
// Tier-2 arithmetic: top-level operator split.
//
// Finds the LEFTMOST operator in {`||`, `+`, `-`, `*`, `/`, `%`} that sits at
// paren depth 0 outside `'…'`/`"…"` quotes, and splits the expression around
// it: `{ __op: [left, op, right] }`. A top-level UNMODELED operator char
// (single `|` bitwise-or, or the `||/` cube-root prefix) yields the abort
// marker `{ __ab: true }` (consumer: `unknown`); `never` means no top-level
// modeled operator exists. `->` / `->>` JSON arrows are consumed as units so
// their `-` is not mistaken for subtraction.
//
// Structure mirrors `HasTopLevelCompare` (struct-jump to the leftmost of
// `'` `"` `(` `)`, pairwise narrowing) but ACCUMULATES the consumed prefix so
// the split can be returned, and is worker/driver CHUNKED like
// `SplitTopLevel` (split.ts): each jump costs ~4 structural helpers plus a
// ≤6-level run scan at depth 0, so 80 jumps/chunk stays well under TS's
// ~1000 tail-count budget (round-11 lesson: budget chunks in tail counts,
// not jumps). Quote spans are jumped quote-to-quote (`''` escapes alternate
// close/re-open across jumps, so escaped content stays "inside"); an
// unterminated quote means no trustworthy split -> `never`.
type SplitTopLevelOp<S extends string> = StoDrive<StoWorker<S>>;

// `[R] extends [never]` MUST be guarded first — `never` distributes through
// the `extends {…}` test and would otherwise fall into the infer arm
// (round-10 lesson).
type StoDrive<R> =
    [R] extends [never]
        ? never
        : R extends { __c: [infer S2 extends string, infer D extends any[], infer A extends string] }
            ? StoDrive<StoWorker<S2, D, A, []>>
            : R;

type StoWorker<
    S extends string,
    Depth extends any[] = [],
    Acc extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 80
    ? { __c: [S, Depth, Acc] }
    : StoJump1<S, Depth, Acc, Steps>;

// Run-gate: a structural-char-free run is only operator-scanned at depth 0.
// At depth > 0 every char is data (`sum(x | y) + 1` must not abort on the
// nested `|`).
type StoRunGate<P extends string, Depth extends any[], Acc extends string, Tail extends string> =
    Depth["length"] extends 0
        ? StoRunScan<P, Acc, Tail>
        : never;

type StoJump1<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}'${infer R}`
    ? P extends `${string}"${string}` | `${string}(${string}` | `${string})${string}`
        ? StoJump2<S, Depth, Acc, Steps>
        : StoRunGate<P, Depth, Acc, `'${R}`> extends infer RR
            ? [RR] extends [never]
                ? R extends `${infer Span}'${infer R2}`
                    ? StoWorker<R2, Depth, `${Acc}${P}'${Span}'`, [any, ...Steps]>
                    : never
                : RR
            : never
    : StoJump2<S, Depth, Acc, Steps>;

type StoJump2<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}"${infer R}`
    ? P extends `${string}(${string}` | `${string})${string}`
        ? StoJump3<S, Depth, Acc, Steps>
        : StoRunGate<P, Depth, Acc, `"${R}`> extends infer RR
            ? [RR] extends [never]
                ? R extends `${infer Span}"${infer R2}`
                    ? StoWorker<R2, Depth, `${Acc}${P}"${Span}"`, [any, ...Steps]>
                    : never
                : RR
            : never
    : StoJump3<S, Depth, Acc, Steps>;

type StoJump3<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P}(${infer R}`
    ? P extends `${string})${string}`
        ? StoJump4<S, Depth, Acc, Steps>
        : StoRunGate<P, Depth, Acc, `(${R}`> extends infer RR
            ? [RR] extends [never]
                ? StoWorker<R, [any, ...Depth], `${Acc}${P}(`, [any, ...Steps]>
                : RR
            : never
    : StoJump4<S, Depth, Acc, Steps>;

type StoJump4<
    S extends string,
    Depth extends any[],
    Acc extends string,
    Steps extends any[]
> = S extends `${infer P})${infer R}`
    ? StoRunGate<P, Depth, Acc, `)${R}`> extends infer RR
        ? [RR] extends [never]
            // an unmatched `)` at depth 0 stays at depth 0 (pop of empty = empty)
            ? StoWorker<R, Depth extends [any, ...infer D] ? D : [], `${Acc}${P})`, [any, ...Steps]>
            : RR
        : never
    : StoRunGate<S, Depth, Acc, "">;

// Leftmost modeled operator within a structural-free run `P` (no quotes or
// parens by construction). Pairwise narrowing, same invariant as
// `StlStructJump`: each level checks the matched prefix for every LATER
// class, so the level that fires is genuinely the leftmost. `Tail` is the
// untouched remainder of the whole expression after the run; the returned
// `right` re-attaches it.
type StoRunScan<P extends string, Acc extends string, Tail extends string> =
    P extends `${infer A}+${infer B}`
        ? A extends `${string}${"-" | "*" | "/" | "%" | "|"}${string}`
            ? StoRunScan2<P, Acc, Tail>
            : { __op: [`${Acc}${A}`, "+", `${B}${Tail}`] }
        : StoRunScan2<P, Acc, Tail>;

type StoRunScan2<P extends string, Acc extends string, Tail extends string> =
    P extends `${infer A}-${infer B}`
        ? A extends `${string}${"*" | "/" | "%" | "|"}${string}`
            ? StoRunScan3<P, Acc, Tail>
            : B extends `>${infer B2}`
                // `->` / `->>` JSON arrow: a unit, not subtraction — keep
                // scanning the rest of the run (a leading `>` from `->>` is
                // not an operator char and is skipped naturally). Non-tail
                // recursion, but bounded by arrows-per-run (tiny in practice).
                ? StoRunScan<B2, `${Acc}${A}->`, Tail>
                : { __op: [`${Acc}${A}`, "-", `${B}${Tail}`] }
        : StoRunScan3<P, Acc, Tail>;

type StoRunScan3<P extends string, Acc extends string, Tail extends string> =
    P extends `${infer A}*${infer B}`
        ? A extends `${string}${"/" | "%" | "|"}${string}`
            ? StoRunScan4<P, Acc, Tail>
            : { __op: [`${Acc}${A}`, "*", `${B}${Tail}`] }
        : StoRunScan4<P, Acc, Tail>;

type StoRunScan4<P extends string, Acc extends string, Tail extends string> =
    P extends `${infer A}/${infer B}`
        ? A extends `${string}${"%" | "|"}${string}`
            ? StoRunScan5<P, Acc, Tail>
            : { __op: [`${Acc}${A}`, "/", `${B}${Tail}`] }
        : StoRunScan5<P, Acc, Tail>;

type StoRunScan5<P extends string, Acc extends string, Tail extends string> =
    P extends `${infer A}%${infer B}`
        ? A extends `${string}|${string}`
            ? StoRunScan6<P, Acc, Tail>
            : { __op: [`${Acc}${A}`, "%", `${B}${Tail}`] }
        : StoRunScan6<P, Acc, Tail>;

type StoRunScan6<P extends string, Acc extends string, Tail extends string> =
    P extends `${infer A}|${infer B}`
        ? B extends `|${infer B2}`
            ? B2 extends `/${string}`
                // `||/` cube root — numeric prefix operator, NOT concat
                ? { __ab: true }
                : Trim<`${Acc}${A}`> extends ""
                    // leading `||` with no left operand — unmodeled prefix op
                    ? { __ab: true }
                    : { __op: [`${Acc}${A}`, "||", `${B2}${Tail}`] }
            // single `|` (bitwise) at top level — unmodeled, conservative stop
            : { __ab: true }
        : never;

// `A op B` for op in {+, -, *, /, %} types `number` when BOTH operands type
// `number` (`| null` propagating from either side — SQL NULL arithmetic is
// NULL). number op number is numeric in Postgres; the interval/date hazards
// all require a non-number operand, which the schema types as non-number, so
// the both-number case is unambiguous and contract-legal. Any other operand
// type — including `never` — degrades to `unknown`: an operand the core path
// cannot resolve (a ref qualified by a joined-derived alias, a mis-split
// like `1e+5` -> `1e`) must NOT reject, or `ExprValid`'s never-gate would
// flip `ValidateSQL` to `false` on valid SQL; genuinely bogus columns are
// still rejected by the token-scan validators independently.
type ArithCombineType<
    L extends string,
    R extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    Trim<L> extends ""
        ? unknown
        : ArithCombineTypes<ExprType<Trim<L>, Tables, Aliases, S, [any, ...Steps]>, R, Tables, Aliases, S, Steps>;

// Same, with the LEFT operand's type already computed (the Func-branch
// dispatcher gets it from `FunctionReturn` without re-parsing the call).
type ArithCombineTypes<
    LT,
    R extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    Trim<R> extends ""
        ? unknown
        : ArithNumClass<LT> extends infer LN
            ? LN extends false
                ? unknown
                : ArithNumClass<ExprType<Trim<R>, Tables, Aliases, S, [any, ...Steps]>> extends infer RN
                    ? RN extends false
                        ? unknown
                        : "nullable" extends LN | RN
                            ? number | null
                            : number
                    : unknown
            : unknown;

// `never` guarded FIRST — `[never]` matches the later arms too. A bare
// `null` operand classes as nullable (`price + null` -> number | null).
type ArithNumClass<T> =
    [T] extends [never]
        ? false
        : [T] extends [number]
            ? "num"
            : [T] extends [number | null]
                ? "nullable"
                : false;

// Scan-and-combine used where no cheaper dispatch is possible: the
// fallback-slot path and the op-char-in-Func-prefix path. `NoOp` is the
// result when the scan finds no top-level modeled operator (today's
// behavior at the call site); the abort marker is conservative `unknown`.
type ArithViaScan<
    CE extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[],
    NoOp
> =
    SplitTopLevelOp<CE> extends infer SR
        ? [SR] extends [never]
            ? NoOp
            : SR extends { __op: [infer L extends string, infer Op extends string, infer R extends string] }
                ? Op extends "||"
                    ? string
                    : ArithCombineType<L, R, Tables, Aliases, S, Steps>
                : unknown
        : never;

// Final-fallback-slot arithmetic (replaces Tier 1's DivByNumericLiteralType,
// which it subsumes: a numeric-literal divisor is just a `${number}` right
// operand). Sits after the column-ref branch fails, so common paths pay
// nothing; the char pre-gate skips the scan for operator-free expressions.
// `||` is unreachable here (the naive `${string}||${string}` branch runs
// earlier in the cascade), so the gate set is the five arithmetic chars.
type TopLevelArithType<
    CE extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    CE extends `${string}${"+" | "-" | "*" | "/" | "%"}${string}`
        ? ArithViaScan<CE, Tables, Aliases, S, Steps, unknown>
        : unknown;

// Func-branch dispatcher. The greedy `${Func}(${Args})` match anchors on the
// LAST `)`, so `sum(price) / count(id)` lands here with Func="sum",
// Args="price) / count(id" — a function call is only the WHOLE expression
// when its first paren group is also its last. Dispatch:
// - Func clean + no `)` in Args (the overwhelmingly common projection:
//   `count(*)`, `sum(price)`, `upper(name)`, ops hidden inside quoted args)
//   -> FunctionReturn directly, zero new cost.
// - Func clean + `)` in Args -> `SplitBalancedParen` (already-paid chunked
//   primitive) resolves the first call's true extent WITHOUT a scan:
//   rest "" means the call spans the whole expression (nested calls like
//   `coalesce(min(x), 0)`); an operator-leading rest is arithmetic with the
//   call as left operand; anything else (window `over (...)`, `filter`)
//   keeps today's greedy FunctionReturn.
// - Operator char in Func (`price + count(id)`, `name || upper(b)`) -> the
//   operator precedes the first paren; full top-level scan.
type FuncOrArithType<
    CE extends string,
    Func extends string,
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    Func extends `${string}${"+" | "-" | "*" | "/" | "%" | "|"}${string}`
        ? ArithViaScan<CE, Tables, Aliases, S, Steps, FunctionReturn<CleanIdent<Func>, Args, Tables, Aliases, S, [any, ...Steps]>>
        : Args extends `${string})${string}`
            ? CE extends `${string}(${infer AfterOpen}`
                ? SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string; rest: infer Rest extends string }
                    ? Trim<Rest> extends ""
                        ? FunctionReturn<CleanIdent<Func>, Inner, Tables, Aliases, S, [any, ...Steps]>
                        : FuncRestDispatch<Trim<Rest>, Func, Args, Inner, Tables, Aliases, S, Steps>
                    : FunctionReturn<CleanIdent<Func>, Args, Tables, Aliases, S, [any, ...Steps]>
                : FunctionReturn<CleanIdent<Func>, Args, Tables, Aliases, S, [any, ...Steps]>
            : FunctionReturn<CleanIdent<Func>, Args, Tables, Aliases, S, [any, ...Steps]>;

// `RestT` (trimmed) is what follows the first balanced call. An arithmetic
// operator -> the call (typed via FunctionReturn on its TRUE arg list) is
// the left operand. `||` -> string (guarding the `||/` cube root). A `->`
// JSON arrow or any other shape (window clauses, …) -> today's greedy path.
type FuncRestDispatch<
    RestT extends string,
    Func extends string,
    Args extends string,
    Inner extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    RestT extends `||${infer R}`
        ? R extends `/${string}`
            ? unknown
            : string
        : RestT extends `+${infer R}`
            ? ArithCombineTypes<FunctionReturn<CleanIdent<Func>, Inner, Tables, Aliases, S, [any, ...Steps]>, R, Tables, Aliases, S, Steps>
            : RestT extends `-${infer R}`
                ? R extends `>${string}`
                    ? FunctionReturn<CleanIdent<Func>, Args, Tables, Aliases, S, [any, ...Steps]>
                    : ArithCombineTypes<FunctionReturn<CleanIdent<Func>, Inner, Tables, Aliases, S, [any, ...Steps]>, R, Tables, Aliases, S, Steps>
                : RestT extends `*${infer R}`
                    ? ArithCombineTypes<FunctionReturn<CleanIdent<Func>, Inner, Tables, Aliases, S, [any, ...Steps]>, R, Tables, Aliases, S, Steps>
                    : RestT extends `/${infer R}`
                        ? ArithCombineTypes<FunctionReturn<CleanIdent<Func>, Inner, Tables, Aliases, S, [any, ...Steps]>, R, Tables, Aliases, S, Steps>
                        : RestT extends `%${infer R}`
                            ? ArithCombineTypes<FunctionReturn<CleanIdent<Func>, Inner, Tables, Aliases, S, [any, ...Steps]>, R, Tables, Aliases, S, Steps>
                            : FunctionReturn<CleanIdent<Func>, Args, Tables, Aliases, S, [any, ...Steps]>;

// Strip a redundant fully-wrapping paren pair, repeatedly: `((expr))` and
// `((case ...)::text)` -> the inner expression whose parens wrap the WHOLE
// thing. Without this an outer operator hidden by a redundant wrap (e.g. the
// `::text` in `((case ...)::text)`) is not seen as top-level, so the cast is
// missed and the expression misparses (empty-function) to `unknown`.
//   - A subquery `(select ...)` KEEPS its parens — its detection relies on them.
//   - A trailing operator after the matching close (`(a)::int`, `(a) + b`) means
//     the parens do NOT wrap the whole expression (`rest != ""`), so it is left
//     as-is and the real outer operator is handled normally.
type UnwrapRedundantParens<E extends string, Steps extends any[] = []> =
    Steps["length"] extends 12
        ? E
        : E extends `(select ${string})`
            ? E
            : E extends `(${string}`
                ? SplitBalancedParen<E> extends { inner: infer Inner extends string; rest: "" }
                    ? UnwrapRedundantParens<Trim<Inner>, [any, ...Steps]>
                    : E
                : E;

export type ExprType<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> =
    Steps["length"] extends 25
        ? unknown
        : IsIgnorableRuntimeExpr<E> extends true
            ? unknown
            : UnwrapRedundantParens<CleanExpr<E>> extends infer CE extends string
            ? IsRuntimeStringFragment<CE> extends true
                ? unknown
                : CE extends "*"
                    ? RowTypeForTables<Tables, S>
                    : CE extends `${infer T}.*`
                        ? RowTypeForTable<ResolveTableKey<CleanIdent<T>, Tables, Aliases, S>, S>
                        : CE extends `(select ${infer SubBody})`
                            ? ScalarSubqueryType<SubBody, S, [any, ...Steps]>
                        : IsBoolExpr<CE> extends true
                            ? boolean
                        // A CASE expression is typed as the union of its first
                        // THEN branch and its ELSE branch (SQL requires branches
                        // to be union-compatible, so one THEN + ELSE captures the
                        // type); no ELSE adds `| null`. Handled BEFORE the
                        // function/operator cascade so a `(case ...)` body is not
                        // run through the cast/function path. A CASE with an OUTER
                        // cast (`(case ...)::text`) does NOT match here (it ends in
                        // the type name, not `)`), so it still takes its cast type
                        // via the branch below. CaseType degrades to `unknown` when
                        // the branches cannot be cleanly extracted.
                        : IsCaseExpr<CE> extends true
                            ? CaseType<CE, Tables, Aliases, S, [any, ...Steps]>
                        : [OuterCastName<CE>] extends [never]
                            // No TOP-LEVEL `::` cast: any `::` present is nested
                            // inside a function/paren arg (e.g. `f(a::int)`, or the
                            // inner casts of `sum(g(x::numeric))::float8`), so the
                            // cast is not the outer operator — fall through to the
                            // cast(...)/function/operator cascade below.
                            ? CE extends `cast(${infer Inner} as ${infer CastTypeName})`
                                    ? ExprType<Inner, Tables, Aliases, S, [any, ...Steps]> extends never
                                        ? never
                                        : SqlTypeToTs<CastTypeName>
                                : CE extends `cast (${infer Inner} as ${infer CastTypeName})`
                                    ? ExprType<Inner, Tables, Aliases, S, [any, ...Steps]> extends never
                                        ? never
                                        : SqlTypeToTs<CastTypeName>
                                : CE extends `${infer Func}(${infer Args})`
                                    ? FuncOrArithType<CE, Func, Args, Tables, Aliases, S, Steps>
                                : CE extends `${infer Func} (${infer Args})`
                                    ? FuncOrArithType<CE, Func, Args, Tables, Aliases, S, Steps>
                                    : CE extends `${string}||${string}`
                                        ? string
                                    : CE extends `${infer JBase}->>${string}`
                                        ? ExprType<JBase, Tables, Aliases, S, [any, ...Steps]> extends never
                                            ? never
                                            : string
                                    : CE extends `${infer JBase}#>>${string}`
                                        ? ExprType<JBase, Tables, Aliases, S, [any, ...Steps]> extends never
                                            ? never
                                            : string
                                    : CE extends "null"
                                        ? null
                                        : CE extends `'${infer L}'`
                                            ? string
                                            : CE extends `${number}`
                                                ? number
                                                : CE extends "true"
                                                    ? boolean
                                                    : CE extends "false"
                                                        ? boolean
                                                        : IsSqlConstant<CE> extends true
                                                            ? SqlConstantType<CE>
                                                            : IsParamPlaceholder<CE> extends true
                                                                ? unknown
                                                                : [ParseColumnRef<CE, Tables, Aliases, S>] extends [infer Ref]
                                                                    ? [Ref] extends [never]
                                                                        ? IsIdentifier<CE> extends true
                                                                            ? never
                                                                            : TopLevelArithType<CE, Tables, Aliases, S, Steps>
                                                                        : Ref extends ColumnRef<infer TableKey extends string, infer Column extends string>
                                                                            ? ColumnTypeFromTableKey<TableKey, Column, S>
                                                                            : IsIdentifier<CE> extends true
                                                                                ? never
                                                                                : TopLevelArithType<CE, Tables, Aliases, S, Steps>
                                                                    : unknown
                            // A genuine TOP-LEVEL `::T` cast. As with the JSON-text
                            // operators, a `->>` / `#>>` to the right of the cast type
                            // name means the cast is NOT the outermost operator — the
                            // JSON text extraction is, yielding `string`.
                            : OuterCastName<CE> extends `${string}->>${string}`
                                ? string
                                : OuterCastName<CE> extends `${string}#>>${string}`
                                    ? string
                                    // The `extends never` guard exists only to surface a
                                    // BARE invalid column (`not_a_col::text` -> never).
                                    // Run it only when the cast's inner is a simple ref;
                                    // for a COMPOUND inner (`sum(...)::float8`,
                                    // `(bool_and(...) ...)::boolean`) take the cast type
                                    // directly — fully type-resolving such inners just to
                                    // check `never` is a large, needless instantiation
                                    // cost (it starves the per-query budget so later
                                    // projections in a wide SELECT bail to `never`), and
                                    // hidden bad refs are caught by the SELECT-list
                                    // validator, not here.
                                    : CastInnerIsSimpleRef<OuterCastInner<CE>> extends true
                                        ? ExprType<OuterCastInner<CE>, Tables, Aliases, S, [any, ...Steps]> extends never
                                            ? never
                                            : SqlTypeToTs<OuterCastName<CE>>
                                        : SqlTypeToTs<OuterCastName<CE>>
            : unknown;

// Scalar subquery in an expression position -> the type of its single
// projected column. `SubBody` is everything after `(select `, e.g.
// "count(*) from payments p where p.order_id = o.id". We extract the inner
// select list (paren/quote-aware, stopping at the inner top-level FROM), take
// its first projected expression, and type it against the SUBQUERY's own
// tables/aliases so correlated column refs (e.g. max(amount)) resolve. Inner
// column refs against the OUTER query (correlation) fall back to unknown, which
// is acceptable for a scalar result type.
export type ScalarSubqueryType<
    SubBody extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    ExtractBeforeFromTopLevel<SubBody> extends infer SL extends string
        ? SplitTopLevel<SL> extends [infer First extends string, ...infer _Rest]
            ? First extends string
                ? `select ${SubBody}` extends infer SubQuery extends string
                    ? TablesInQuery<SubQuery, S> extends infer SubTables extends string
                        ? AliasesInQuery<SubQuery, S> extends infer SubAliases extends string
                            ? ExtractAliasResult<First> extends { expr: infer RawExpr extends string }
                                ? ExprType<RawExpr, SubTables, SubAliases, S, Steps>
                                : unknown
                            : unknown
                        : unknown
                    : unknown
                : unknown
            : unknown
        : unknown;

// Function returns

export type FunctionReturn<
    Func extends string,
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> =
    Steps["length"] extends 25
        ? unknown
        : ArgsValid<Args, Tables, Aliases, S, Steps> extends false
            ? never
            // Window application via the greedy dispatch path: `Args` is the
            // garbage tail `total) over (partition by …` — NOT a usable arg
            // list, so none of the argument-nullability checks below may run
            // on it (FirstArgType would type it `unknown` → spurious `| null`).
            // Window count/sum/avg keep their historical plain `number`;
            // everything else stays `unknown`.
            : Args extends `${string}) over${string}`
                ? Func extends "count" | "sum" | "avg"
                    ? number
                    : unknown
            : Func extends "count"
                ? number
                // sum/avg ignore NULL inputs, but an all-NULL group yields
                // NULL — possible only when the argument is nullable, so
                // propagate argument nullability. The empty-input case
                // (no GROUP BY, zero rows → NULL regardless of the column)
                // is handled by `ApplyUngroupedAggNull` at the
                // GetReturnType funnel, not here.
                : Func extends "sum" | "avg"
                    ? null extends FirstArgType<Args, Tables, Aliases, S, Steps>
                        ? number | null
                        : number
                    : Func extends "min" | "max"
                        ? FirstArgType<Args, Tables, Aliases, S, Steps>
                        // concat is NOT strict — it skips NULL args and
                        // never returns NULL itself, so no propagation.
                        // (upper/lower ARE strict → StringScalarFn.)
                        : Func extends "concat"
                            ? string
                            : Func extends "coalesce"
                                ? CoalesceArgUnion<Args, Tables, Aliases, S, Steps>
                                // Postgres EXTRACT always returns a numeric
                                // value regardless of field/source, so typing
                                // it is unambiguous; it is NULL iff its source
                                // is NULL, so propagate the argument's
                                // nullability. An unmodeled argument types
                                // `unknown` (which may include null) → the
                                // conservative answer is `number | null`.
                                : Func extends "extract"
                                    ? null extends FirstArgType<Args, Tables, Aliases, S, Steps>
                                        ? number | null
                                        : number
                                    // Strict numeric scalar functions: always
                                    // numeric in Postgres, NULL iff an argument
                                    // is NULL → propagate argument nullability
                                    // (an unmodeled argument types `unknown`,
                                    // which may include null → conservative
                                    // `| null`, same rule as extract).
                                    : Func extends NumericScalarFn
                                        ? null extends UnionArgTypes<Args, Tables, Aliases, S, Steps>
                                            ? number | null
                                            : number
                                        // Strict string scalar functions: same
                                        // nullability rule, string result.
                                        : Func extends StringScalarFn
                                            ? null extends UnionArgTypes<Args, Tables, Aliases, S, Steps>
                                                ? string | null
                                                : string
                                            // Aggregates: same rule as sum/avg —
                                            // an all-NULL group yields NULL, so
                                            // argument nullability propagates;
                                            // the ungrouped empty-input NULL is
                                            // `ApplyUngroupedAggNull`'s job.
                                            : Func extends "string_agg"
                                                ? null extends FirstArgType<Args, Tables, Aliases, S, Steps>
                                                    ? string | null
                                                    : string
                                                : Func extends "bool_and" | "bool_or"
                                                    ? null extends FirstArgType<Args, Tables, Aliases, S, Steps>
                                                        ? boolean | null
                                                        : boolean
                                                    : Func extends "array_agg"
                                                        // An unresolvable argument
                                                        // (e.g. aggregate-local
                                                        // `ORDER BY`) falls back to
                                                        // `unknown`, not `unknown[]`.
                                                        ? unknown extends FirstArgType<Args, Tables, Aliases, S, Steps>
                                                            ? unknown
                                                            : FirstArgType<Args, Tables, Aliases, S, Steps>[]
                                                        : unknown;

// Strict scalar functions with an unambiguous Postgres return type. `left` /
// `right` are deliberately NOT modeled — they double as join keywords and the
// typing win isn't worth the tokenizer interaction risk.
type NumericScalarFn =
    | "length" | "char_length" | "character_length" | "octet_length"
    | "bit_length" | "strpos" | "round" | "floor" | "ceil" | "ceiling"
    | "abs" | "trunc" | "sign" | "mod" | "power" | "sqrt";

type StringScalarFn =
    | "upper" | "lower"
    | "trim" | "btrim" | "ltrim" | "rtrim" | "initcap" | "replace"
    | "repeat" | "reverse" | "lpad" | "rpad" | "translate" | "md5"
    | "split_part" | "substr" | "substring" | "to_char";

// Expression validation

export type ExprsValid<Exprs extends string[], N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? ExprsValidList<Exprs, Tables, Aliases, S>
            : true
        : true;

export type ExprValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    LocalRels extends string = never
> =
    IsIgnorableRuntimeExpr<E> extends true
        ? true
        : ExtractAlias<E> extends { expr: infer RawExpr extends string }
            ? IsIgnorableRuntimeExpr<RawExpr> extends true
            ? true
            // A ref qualified by a query-local relation (CTE name) has no schema
            // surface to resolve against — `ExprType` yields `never` and the
            // token scans reject it. Bless it (lenient contract: the local
            // relation's output shape is validated where it is defined).
            : HasLocalQualifier<RawExpr, LocalRels> extends true
                ? true
            : ExprType<RawExpr, Tables, Aliases, S> extends never
                ? false
                : NeedsTokenRefValidation<RawExpr> extends true
                    ? ExprColumnRefsValid<RawExpr, Tables, Aliases, S>
                    : FuncCompoundArgsValid<RawExpr, Tables, Aliases, S>
            : true;

// `true` when E is a qualified ref whose qualifier names a query-local relation.
// The `[LocalRels] extends [never]` guard keeps the common no-CTE path free.
type HasLocalQualifier<E extends string, LocalRels extends string> =
    [LocalRels] extends [never]
        ? false
        : E extends `${infer Q}.${string}`
            ? CleanIdent<Q> extends LocalRels
                ? true
                : false
            : false;

// A function-call (or cast) projection skips the token ref-scan above
// (`NeedsTokenRefValidation` is false for `${fn}(${args})`), which is why an
// invalid column hidden inside an aggregate/function argument — `sum(price +
// bogus_col)`, `date_trunc('day', bogus_col)`, `array_agg(bogus_col ORDER BY
// created_at)` — escapes validation while the same ref written OUTSIDE a function
// is caught. Recover that case here, in the SELECT-list validation path ONLY (not
// `ExprType`, so the return-type/`QueryResult` path and its instantiation cost are
// untouched).
//
// We extract the call's argument list and run each argument through the same
// loose column-ref scan the rest of the query uses (`ExprColumnRefsValid`), which
// already skips string literals, numbers, params, operators, and SQL keywords —
// so an aggregate-local `ORDER BY` (`array_agg(id ORDER BY created_at)`) and
// keyword-style args resolve their genuine column surfaces while non-columns stay
// lenient. The `EXTRACT(field FROM source)` date-part keyword grammar is handled
// upstream by `RewriteExtractCall` (rewritten to `extract(source)`) so the field
// token is never seen here. The `extends false` guard rejects only on a DEFINITE
// invalid column.
export type FuncCompoundArgsValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    ExtractFuncArgList<CleanExpr<E>> extends infer Args extends string
        ? [Args] extends [never]
            ? true
            : ArgsArithRefsValid<SplitTopLevel<Args>, Tables, Aliases, S>
        : true;

// The inner argument list of the FIRST `(...)` group, or `never` when the
// expression is not a call (e.g. a cast like `x::int`, which must stay lenient).
export type ExtractFuncArgList<E extends string> =
    E extends `${infer _Func}(${infer AfterOpen}`
        ? SplitBalancedParen<`(${AfterOpen}`> extends { inner: infer Inner extends string }
            ? Inner
            : never
        : never;

export type ArgsArithRefsValid<
    Args extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = []
> = Steps["length"] extends 30
    ? true
    : Args extends [infer H extends string, ...infer Rest extends string[]]
        // The loose ref-scan inside `ExprColumnRefsValid` tokenizes (padding
        // operators itself) and only surfaces genuine column candidates, so each
        // argument — bare column, arithmetic, CASE, or aggregate-local `ORDER BY`
        // — is validated while literals/params/keywords stay lenient.
        ? Trim<H> extends infer TH extends string
            ? ExprColumnRefsValid<TH, Tables, Aliases, S> extends false
                ? false
                : ArgsArithRefsValid<Rest, Tables, Aliases, S, [any, ...Steps]>
            : ArgsArithRefsValid<Rest, Tables, Aliases, S, [any, ...Steps]>
        : true;

export type NeedsTokenRefValidation<E extends string> =
    CleanExpr<E> extends `${string}::${string}` ? false :
    CleanExpr<E> extends `cast(${string} as ${string})` ? false :
    CleanExpr<E> extends `cast (${string} as ${string})` ? false :
    CleanExpr<E> extends `${string}(${string}` ? false :
    CleanExpr<E> extends `${string} (${string}` ? false :
    true;

export type ExprColumnRefsValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = ExprQualifiedRefsValid<E, Tables, Aliases, S> extends true
    ? ExprUnqualifiedRefsValid<E, Tables, Aliases, S>
    : false;

export type ExprQualifiedRefsValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = QualifiedRefScan<E> extends infer Cols
    ? AllTrue<Cols extends string ? ColumnRefValidLooseWith<Cols, Tables, Aliases, S> : true>
    : true;

export type ExprUnqualifiedRefsValid<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = UnqualifiedRefScan<E, S, Tables, Aliases> extends infer Cols
    ? AllTrue<Cols extends string ? UnqualifiedColumnValid<Cols, Tables, Aliases, S> : true>
    : true;

export type ExprsValidList<
    Exprs extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[] = [],
    LocalRels extends string = never
> = Steps["length"] extends 100
    ? true
    : Exprs extends [infer H extends string, ...infer Rest extends string[]]
        ? ExprValid<H, Tables, Aliases, S, LocalRels> extends true
            ? ExprsValidList<Rest, Tables, Aliases, S, [any, ...Steps], LocalRels>
            : false
        : true;

// Argument parsing

export type FirstArgType<
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    SplitTopLevel<Args> extends [infer First extends string, ...infer _]
        ? ExprType<First, Tables, Aliases, S, Steps>
        : unknown;

// Plain union of every argument's value type — an opaque/unresolvable arg
// contributes `unknown`, which (per the conservative-typing contract) means the
// strict-scalar-fn callers treat it as possibly-NULL: `null extends unknown` is
// `true`, so an unmodeled arg propagates `| null`. This is the historical
// behavior and the scalar-fn nullability checks (`NumericScalarFn` /
// `StringScalarFn`) depend on it — do NOT drop `unknown` here. The opaque-arg
// drop that `coalesce` needs lives in `CoalesceArgUnion` instead.
export type UnionArgTypes<
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    SplitTopLevel<Args> extends infer Parts extends string[]
        ? Parts[number] extends infer P extends string
            ? ExprType<P, Tables, Aliases, S, Steps>
            : unknown
        : unknown;

// `coalesce`'s VALUE type: the union of the argument value types, DROPPING any
// argument that types as `unknown` (an opaque/unresolvable arg — an untypable
// function such as `array_to_string(regexp_split_to_array(...))`, a jsonb
// column, etc.). Postgres requires every `coalesce` argument to share a common
// type, so the RESOLVABLE args already capture that type; without this drop, a
// single opaque arm would widen the whole `coalesce(...)` to `unknown` and erase
// the type the other args carry (e.g. `coalesce(link."retailer", …,
// array_to_string(…))` would lose `string | null`). If NOTHING resolves, the
// result is the empty union (`never`), which is mapped back to `unknown`.
//
// This is SEPARATE from `UnionArgTypes` on purpose: dropping `unknown` is right
// for coalesce's value, but wrong for the scalar-fn null checks (it would erase
// the conservative `| null` an unmodeled arg must contribute).
export type CoalesceArgUnion<
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    SplitTopLevel<Args> extends infer Parts extends string[]
        ? KnownArgUnion<Parts, Tables, Aliases, S, Steps> extends infer U
            // The empty union (`never`) means NO argument resolved to a concrete
            // type (e.g. every arg is opaque jsonb / an untypable function) —
            // restore the historical `unknown` rather than leak `never`.
            ? [U] extends [never]
                ? unknown
                : U
            : unknown
        : unknown;

type KnownArgUnion<
    Parts extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> = DropUnknownArgs<Parts[number], Tables, Aliases, S, Steps>;

// Distributes over each arg expression individually (`P` is a naked type
// parameter here, so `P extends string` fans out over the union) and drops the
// ones whose type is `unknown`. The per-arg distribution is LOAD-BEARING: a
// single `ExprType<union-of-args>` lets one `unknown` member absorb the whole
// union (`string | unknown` === `unknown`) before it can be filtered, so the
// filtering must happen arg-by-arg here, not on the combined result.
type DropUnknownArgs<
    P extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> = P extends string
    ? DropIfUnknown<ExprType<P, Tables, Aliases, S, Steps>>
    : never;

// An `unknown`/`any` arg type collapses to `never` (and so drops from the
// surrounding union); any concrete type passes through unchanged.
type DropIfUnknown<T> = unknown extends T ? never : T;

export type ArgsValid<
    Args extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    Trim<Args> extends ""
        ? true
        : SplitTopLevel<Args> extends infer Parts extends string[]
            ? AllTrue<Parts[number] extends infer P extends string ? (ExprType<P, Tables, Aliases, S, Steps> extends never ? false : true) : true>
            : true;

// SQL type mapping

// Maps a SQL cast target type name to its TypeScript type.
// Handles, in order: chained casts (`a::int::text` -> last type wins), array
// suffixes (`int[]` -> number[]), and finally a flat scalar mapping.
export type SqlTypeToTs<T extends string> =
    Trim<T> extends `${string}::${infer Rest}`
        ? SqlTypeToTs<Rest>
        : Trim<T> extends `${infer Base}[]`
            ? SqlScalarToTs<NormalizeTypeName<Base>>[]
            : SqlScalarToTs<NormalizeTypeName<T>>;

export type SqlScalarToTs<N extends string> =
    N extends "int" | "integer" | "bigint" | "smallint" | "numeric" | "decimal" | "real" | "double" | "float"
        | "int2" | "int4" | "int8" | "float4" | "float8"
        ? number
        : N extends "bool" | "boolean"
            ? boolean
        : N extends "text" | "varchar" | "char" | "character" | "uuid"
            ? string
            : N extends "date" | "time" | "timestamp" | "timestamptz"
                ? string
                    : N extends "json" | "jsonb"
                        ? unknown
                        : N extends "bytea" | "blob"
                            ? Uint8Array
                            : unknown;

export type NormalizeTypeName<S extends string> =
    CleanIdent<ExtractBefore<Trim<S>, "(">>;

// The TS type implied by an expression's OUTER cast (`expr::int`,
// `cast(expr as int)`), if any. Mirrors `ExprType`'s cast detection but is
// self-contained — used where the full `ExprType` context isn't available
// (e.g. typing an outer projection over a derived subquery, whose column refs
// resolve against the subquery row, not the schema). Returns `unknown` when
// there is no outer cast or the cast target doesn't map to a known scalar, so
// callers that fall back to `unknown` are never made worse.
export type OuterCastTs<E extends string> =
    CleanExpr<E> extends `${string}::${infer CastName}`
        ? SqlTypeToTs<CastName>
        : CleanExpr<E> extends `cast(${string} as ${infer CastName})`
            ? SqlTypeToTs<CastName>
            : CleanExpr<E> extends `cast (${string} as ${infer CastName})`
                ? SqlTypeToTs<CastName>
                : unknown;

// --- Top-level (outer) `::` cast detection --------------------------------
// A `::T` cast is the OUTER operator of an expression only when it sits at paren
// depth 0. Splitting at the LEFTMOST `::` (the naive `${infer Inner}::${infer T}`)
// is wrong for casts nested in call args: `sum(g(x::numeric))::float8` would split
// at `::numeric`, leaving the unbalanced `sum(g(x` as the inner expr (which types
// to `never`) and poisoning the whole projection. Cheap top-level signal: scanning
// `::` left-to-right, the type-name part of a TOP-LEVEL cast contains no `)` — a
// `)` after the `::` means an unclosed `(` precedes it, so that `::` is nested.
//
// `OuterCastName<E>` -> the outer cast's type-name (possibly chained, e.g.
// `int::text`, which `SqlTypeToTs` resolves last-wins), or `never` when there is
// no top-level cast. `OuterCastInner<E>` -> `E` with that outer cast stripped, with
// any inner casts preserved.
//
// A `::` is NESTED (not the outer operator) when the text to its right has an
// UNMATCHED closing paren — a `)` with no `(` before it (the `)` closes a `(` that
// opened to the LEFT of the `::`). A parameterized type name such as
// `numeric(10,2)` has its `(` BEFORE the `)`, so it is NOT flagged and the cast
// stays top-level.
type CastAfterIsNested<After extends string> =
    After extends `${infer P})${string}`
        ? P extends `${string}(${string}`
            ? false
            : true
        : false;

export type OuterCastName<E extends string> =
    E extends `${string}::${infer After}`
        ? CastAfterIsNested<After> extends true
            ? OuterCastName<After>
            : After
        : never;

export type OuterCastInner<E extends string, Acc extends string = ""> =
    E extends `${infer A}::${infer After}`
        ? CastAfterIsNested<After> extends true
            ? OuterCastInner<After, `${Acc}${A}::`>
            : `${Acc}${A}`
        : E;

// A cast's inner expression is a "simple ref" — a bare (optionally qualified /
// quoted) column or identifier — when, after trimming, it contains no `(` (no
// call / paren group) and no space (no operator / compound expression). Only then
// is the invalid-bare-column `extends never` guard meaningful (and cheap); a
// compound inner takes its cast type directly.
export type CastInnerIsSimpleRef<I extends string> =
    Trim<I> extends `${string}(${string}`
        ? false
        : Trim<I> extends `${string} ${string}`
            ? false
            : true;

// A top-level CASE expression — `case ...`, optionally wrapped in balanced parens
// (`(case ... end)`). Used to short-circuit CASE typing to `unknown` (its design
// result) without resolving the branches/aggregate args.
export type IsCaseExpr<E extends string> =
    Trim<E> extends `case ${string}`
        ? true
        : Trim<E> extends `(${infer Inner})`
            ? IsCaseExpr<Inner>
            : false;

// ---- CASE result typing ----
//
// Type a `case … end` expression as the union of its FIRST `then` branch and
// its `else` branch. SQL requires every branch of a CASE to resolve to one
// common type, so typing one THEN plus the ELSE captures the whole expression's
// type without resolving every WHEN branch. With no `else`, unmatched rows
// yield NULL, so `| null` is added. Each branch expr is typed by `ExprType`, so
// a branch that is itself a column / cast / literal / function / nested CASE
// resolves the same way a first-hand SELECT projection would.
//
// Boundary extraction is intentionally shallow: it finds the first top-level
// `then`, handles a single leading nested `case … end` as the THEN result, and
// locates the `else` by a leftmost scan. Conditions and quoted text are not
// fully tokenized, so an exotic shape that cannot be cleanly split degrades to
// `unknown` rather than guessing — the same false-negative bias as the rest of
// the parser.
export type CaseType<
    E extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Steps extends any[]
> =
    Steps["length"] extends 25
        ? unknown
        // The widening type is the union of the FIRST `then` branch and the
        // `else` branch (SQL requires branches to be union-compatible, so one
        // THEN + ELSE captures the type); no ELSE adds `| null`. `CaseParts` is
        // computed ONCE here and the first THEN is reused as a cheap gate for the
        // all-literal narrowing below.
        : CaseParts<E> extends infer P
            ? P extends { then: infer T extends string; else: infer EE extends string }
                ? CasePick<E, T, ExprType<T, Tables, Aliases, S, [any, ...Steps]> | ExprType<EE, Tables, Aliases, S, [any, ...Steps]>, true>
                : P extends { then: infer T extends string }
                    ? CasePick<E, T, ExprType<T, Tables, Aliases, S, [any, ...Steps]> | null, false>
                    : unknown
            : unknown;

// Prefer the preserved all-string-literal union (the "enum mapping" shape) over
// the widened type, but only pay for the full arm-chain walk (`CaseLiteralUnion`)
// when the FIRST THEN is itself a bare single-quoted string literal. A CASE
// headed by anything else (a number, column, function, nested CASE, …) can never
// be all-string-literal, so it stays on the zero-overhead widening path — the
// gate is one template match, not a walk. `Widen` is the already-computed
// widening type; the narrowed union is byte-identical to it everywhere except
// the genuinely all-literal case (a stray literal mixed with a non-literal arm
// collapses to `string` by union absorption either way).
type CasePick<
    E extends string,
    FirstThen extends string,
    Widen,
    HasElse extends boolean
> =
    FirstThen extends `'${string}'`
        ? CaseLiteralUnion<E, HasElse> extends infer U
            ? [U] extends [never]
                ? Widen
                : U
            : Widen
        : Widen;

// ---- All-string-literal CASE -> preserved literal union ----
//
// The widening type in `CaseType` above types string-literal branches as
// `string` (the deliberate projection-literal policy). That loses precision for the
// common "enum mapping" CASE whose every branch is a bare string literal — e.g.
//   case when a is not null then 'moodboard' ... else null end
// which a hand-written union (`'moodboard' | … | null`) then has to restate.
//
// `CaseLiteralUnion<E, HasElse>` returns that literal union ONLY when EVERY arm
// is a bare single-quoted string literal or the `null` keyword; otherwise it is
// `never` and the caller falls back to widening. `HasElse` is threaded in from
// the `CaseParts` the caller already destructured (no second `CaseParts` call).
// The gate is type-level only (no SQL / runtime change). It is a
// false-NEGATIVE-biased walk, matching the rest of the parser: only the searched
// form (`case when …`) is walked, a simple CASE (`case x when …`) and any arm
// the shallow split can't cleanly isolate degrade to `never` -> widening, never
// to a wrong literal.

// Sentinel for "an arm that is not a bare string literal / null". A unique
// symbol can never be a SQL value type, so its presence in the mapped union is
// an unambiguous "not all-literal" signal.
declare const CaseNonLiteral: unique symbol;
type CaseNonLiteral = typeof CaseNonLiteral;

// The literal-union result for a CASE, or `never` when not all-literal. `| null`
// is added only when the CASE has no ELSE (unmatched rows are NULL); an explicit
// `else null` already contributes `null` as an arm.
type CaseLiteralUnion<E extends string, HasElse extends boolean> =
    CaseArmLiterals<CaseArmExprs<E>> extends infer U
        ? [CaseNonLiteral] extends [U]
            ? never
            : HasElse extends true
                ? U
                : U | null
        : never;

// Union of every CASE arm RESULT as a raw expr string, or `never` if the shape
// is not a cleanly-walkable searched CASE. Strips a redundant outer paren and
// the trailing `end`, then walks the `when … then …` chain.
type CaseArmExprs<E extends string> =
    Trim<E> extends `(${infer Inner})`
        ? CaseArmExprs<Trim<Inner>>
        : Trim<E> extends `case ${infer Body}`
            ? ArmsFromBody<Trim<StripTrailingEnd<Trim<Body>>>>
            : never;

// Body begins at a top-level `when`; non-`when` head (a simple CASE's operand)
// -> `never` (fall back to widening).
type ArmsFromBody<B extends string> =
    B extends `when ${infer _Cond} then ${infer Rest}`
        ? ArmsFromThen<Trim<Rest>>
        : never;

// `Rest` starts at a THEN result. It is terminated by the next `when`, by
// `else`, or by end-of-body (last THEN, no ELSE).
type ArmsFromThen<Rest extends string> =
    Rest extends `${infer R} when ${infer After}`
        ? Trim<R> | ArmsFromBody<`when ${After}`>
        : Rest extends `${infer R} else ${infer RE}`
            ? Trim<R> | Trim<RE>
            : Trim<Rest>;

// Map one arm expr string to its preserved literal type, or the non-literal
// sentinel. A fragment that is not a closed `'…'` literal or the `null` keyword
// (including any mis-split fragment) is non-literal -> caller falls back.
type CaseArmLiteral<A extends string> =
    A extends `'${infer L}'`
        ? L
        : A extends "null"
            ? null
            : CaseNonLiteral;

// Distribute `CaseArmLiteral` over the arm-string union. An un-walkable CASE
// (`CaseArmExprs` = `never`) maps to the sentinel so the caller falls back.
type CaseArmLiterals<Arms extends string> =
    [Arms] extends [never]
        ? CaseNonLiteral
        : Arms extends any
            ? CaseArmLiteral<Arms>
            : never;

// Extract the first THEN result and the ELSE result (if any) from a CASE
// expression as raw expr strings. Shared by `CaseType` (which types them) and
// the projection-nullability pass (which scans them for outer-join refs). Only
// the THEN/ELSE *results* are extracted — never the WHEN conditions, so a
// nullable ref in a condition does not nullablize the result. Returns
// `{ then: …; else: … }`, `{ then: … }` (no ELSE), or `unknown` (unparseable).
export type CaseParts<E extends string> =
    Trim<E> extends `(${infer Inner})`
        ? CaseParts<Trim<Inner>>
        : Trim<E> extends `case ${infer AfterCase}`
            ? Trim<AfterCase> extends `${infer _Cond} then ${infer Rest}`
                ? CasePartsFromRest<Trim<Rest>>
                : unknown
            : unknown;

// `Rest` is everything after the first top-level `then`.
type CasePartsFromRest<Rest extends string> =
    // THEN result is a (single-level) nested CASE -> keep it whole; its own
    // `end` closes it, and what follows is the outer ELSE / next WHEN.
    Rest extends `case ${infer Inner} end${infer After}`
        ? MkCaseParts<`case ${Inner} end`, CaseElseHead<Trim<After>>>
    // THEN result terminated by a following WHEN (more branches follow).
    : Rest extends `${infer R} when ${infer After}`
        ? MkCaseParts<StripTrailingEnd<R>, CaseElseInTail<After>>
    // THEN result terminated by ELSE.
    : Rest extends `${infer R} else ${infer E}`
        ? MkCaseParts<StripTrailingEnd<R>, { else: StripTrailingEnd<E> }>
    // Single branch, no ELSE — strip the outer `end`.
    : MkCaseParts<StripTrailingEnd<Rest>, { none: true }>;

type MkCaseParts<ThenE extends string, Else> =
    Else extends { else: infer EE extends string }
        ? { then: ThenE; else: EE }
        : { then: ThenE };

// ELSE detection when the remainder begins right after a nested `case … end`:
// the only top-level clause left is an optional `else …`.
type CaseElseHead<Rem extends string> =
    Rem extends `else ${infer E}` ? { else: StripTrailingEnd<E> } : { none: true };

// ELSE detection when more WHEN branches follow: the outer `else` is the
// leftmost ` else ` in the tail (WHEN branches before it carry no ELSE).
type CaseElseInTail<After extends string> =
    After extends `${infer _} else ${infer E}` ? { else: StripTrailingEnd<E> } : { none: true };

// Drop a single trailing ` end` (the outer CASE close) from a branch result.
type StripTrailingEnd<X extends string> =
    Trim<X> extends `${infer Y} end` ? Trim<Y> : Trim<X>;

// Outer-join nullability for a CASE projection: `| null` when a THEN or ELSE
// *result* references the nullable side of an outer join (its value is NULL on
// a non-matching row). Conditions are excluded by construction (`CaseParts`).
export type CaseBranchJoinNullable<E extends string, Nullable extends string> =
    CaseParts<E> extends infer P
        ? P extends { then: infer T extends string }
            ? NullableQualRefIn<T, Nullable> extends true
                ? true
                : P extends { else: infer EE extends string }
                    ? NullableQualRefIn<EE, Nullable>
                    : false
            : false
        : false;
