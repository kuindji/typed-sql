// src/builder/extract-params.ts
import type { DatabaseSchema } from "../schema.js";
import type { ColumnTypeFromTableKey, RowTypeForTable } from "../schema.js";
import type { NormalizeQuery, NormalizeQueryKeepParams } from "../parsing.js";
import type {
    ExtractInsertColumns, ExtractReturningList, ExtractLastWhere,
    ExtractBefore, SplitCommaSimple, SplitTopLevel, Trim, CleanIdent,
    ExceedsLengthBudget,
} from "../parsing.js";
import type {
    InsertTargetTable, UpdateTargetTable, DeleteTargetTable,
} from "../tables.js";
import type { Simplify } from "../utils.js";
import type { GetReturnType } from "../index.js";
import type { DriverParamValue } from "./scanner.js";

// ---- :name detection ----
export type ParamName<Token extends string> =
    Trim<Token> extends `:${infer Name}` ? CleanParamIdent<Name> : never;

// A `:name` identifier ends at the first terminator char. Use the deterministic
// left-to-right `ReadName` walk (NameStop set) rather than a single template with
// a *union* of separators: `${infer Head}${")" | "," | " "}${string}` infers a
// DIFFERENT Head per union member and yields a *union* result — so a param like
// `:userId` trailed by `\n order by "pseName", …` (an un-stripped ORDER BY leaking
// into the WHERE block) produced `"userId\n" | "userId\n order by \"pseName\""`
// instead of `"userId"`. ReadName stops at the first NameStop (incl. `\n`,`\t`,`:`
// so `::cast` suffixes drop too), so it returns a single clean name.
type CleanParamIdent<S extends string> = ReadName<S>;

// Column name for a (possibly qualified, possibly quoted) ref. Quotes are
// stripped via CleanIdent so the case-insensitive schema lookup matches; a raw
// `"shopperId"` qualifier would otherwise miss the column and bind `never`.
type ColOf<S extends string> =
    FirstToken<Trim<S>> extends infer T extends string
        ? T extends `${infer _A}.${infer C}` ? CleanIdent<C> : CleanIdent<T> : never;
type FirstToken<S extends string> = S extends `${infer A} ${infer _}` ? A : S;

// ---- INSERT ----
export type ExtractInsertValues<N extends string> =
    N extends `${string} values (${infer V})${string}` ? SplitCommaSimple<V>
    : N extends `${string} values(${infer V2})${string}` ? SplitCommaSimple<V2>
    : [];

type ZipInsert<
    Cols extends readonly string[], Vals extends readonly string[],
    Table extends string, S extends DatabaseSchema, Acc = {},
> = Cols extends readonly [infer C extends string, ...infer CR extends string[]]
    ? Vals extends readonly [infer V extends string, ...infer VR extends string[]]
        ? ParamName<V> extends infer P
            // not exactly `:name` → extract any inner placeholders loose (spec §6)
            ? [P] extends [never] ? ZipInsert<CR, VR, Table, S, Acc & LooseParams<V>>
            : P extends string
                ? ZipInsert<CR, VR, Table, S, Acc & { [K in P]: ColumnTypeFromTableKey<Table, CleanIdent<C>, S> }>
                : ZipInsert<CR, VR, Table, S, Acc>
            : Acc
        : Acc
    : Acc;

type ConflictSetBlock<N extends string> =
    N extends `${string} do update set ${infer Rest}`
        ? ExtractBefore<ExtractBefore<Rest, " where ">, " returning "> : "";

// ---- multi-row VALUES detection (spec §3) ----
// Post-VALUES text, handling both ` values (` and the no-space ` values(` form
// (the latter re-prepends the consumed "(" so the collector sees the tuple open).
type AfterValues<N extends string> =
    N extends `${string} values ${infer A}` ? A
    : N extends `${string} values(${infer A}` ? `(${A}`
    : never;

type IsMultiRowInsert<N extends string> =
    [AfterValues<N>] extends [never] ? false
    : AfterValues<N> extends infer A extends string ? HasTopLevelTupleSep<A> : false;

// Walk After: skip single-quoted literals AND dollar-quoted strings; track paren
// depth. When the FIRST top-level tuple closes (depth returns to 0), it is a
// multi-row INSERT iff the next non-whitespace char is a comma (another tuple
// follows). Any other trailing clause — `on conflict (id)`, `returning …` —
// has no top-level `),` so it stays single-row. Step-capped; widens to false on
// overrun. Comments are already stripped by NormalizeQuery, so no comment arm.
type HasTopLevelTupleSep<
    S extends string, Depth extends any[] = [], Steps extends any[] = [],
> = Steps["length"] extends 400 ? false
    // single-quoted literal: `''` escape first, then a whole literal
    : S extends `''${infer R}` ? HasTopLevelTupleSep<R, Depth, [any, ...Steps]>
    : S extends `'${infer _Q}'${infer R}` ? HasTopLevelTupleSep<R, Depth, [any, ...Steps]>
    // dollar-quoted string: `$tag$ … $tag$` (tag may be empty → `$$ … $$`).
    : S extends `$${infer Tag}$${infer Rest}`
        ? Rest extends `${infer _Body}$${Tag}$${infer After}`
            ? HasTopLevelTupleSep<After, Depth, [any, ...Steps]>
            : false                       // unterminated dollar-quote → stop (not multi-row)
    : S extends `(${infer R}` ? HasTopLevelTupleSep<R, [any, ...Depth], [any, ...Steps]>
    : S extends `)${infer R}`
        ? Depth extends [any, ...infer Rest extends any[]]
            // top-level tuple just closed → another tuple iff next non-space is ","
            ? Rest extends [] ? AfterTupleIsComma<R>
            : HasTopLevelTupleSep<R, Rest, [any, ...Steps]>
            : HasTopLevelTupleSep<R, [], [any, ...Steps]>   // unbalanced ")" — ignore
    : S extends `${infer _C}${infer R}` ? HasTopLevelTupleSep<R, Depth, [any, ...Steps]>
    : false;

// True iff the next non-whitespace char begins another VALUES tuple separator.
type AfterTupleIsComma<S extends string> =
    S extends `${" " | "\t" | "\n"}${infer R}` ? AfterTupleIsComma<R>
    : S extends `,${string}` ? true
    : false;

// ---- multi-row VALUES per-tuple param typing ----
type TupleScan = { tuples: readonly string[]; rest: string };

// Collect each top-level `(...)` tuple body from the post-VALUES text. Mirrors
// HasTopLevelTupleSep's quote/dollar-quote/paren arms, but ACCUMULATES the
// current tuple's text (Cur) and the finished bodies (Ts). At depth 0 between
// tuples, chars are skipped (quote arms still append to Cur there — harmless,
// Cur resets when the next tuple opens); a closed tuple followed by anything
// but a comma ends the list cleanly (trailing ON CONFLICT / RETURNING — their
// params are typed by the conflict/WHERE extractors, so `rest` stays "" and is
// NOT loose-swept). On step-cap or tuple-cap overrun the unconsumed text comes
// back in `rest` for a loose sweep — lenient-overrun contract, never an error.
// Steps reset per tuple via AfterTuple (bounded worker, fresh counter), so the
// budget is 400 steps per tuple × max 12 tuples.
type CollectTuples<
    S extends string, Depth extends any[] = [], Cur extends string = "",
    Ts extends readonly string[] = [], Steps extends any[] = [],
> = Steps["length"] extends 400 ? { tuples: Ts; rest: S }
    : Ts["length"] extends 12 ? { tuples: Ts; rest: S }
    // single-quoted literal: `''` escape first, then a whole literal (verbatim into Cur);
    // at depth 0 (between tuples) these still append to Cur, harmlessly — Cur is discarded when the next tuple opens
    : S extends `''${infer R}` ? CollectTuples<R, Depth, `${Cur}''`, Ts, [any, ...Steps]>
    : S extends `'${infer Q}'${infer R}` ? CollectTuples<R, Depth, `${Cur}'${Q}'`, Ts, [any, ...Steps]>
    // dollar-quoted string: `$tag$ … $tag$`; unterminated → stop, rest loose
    : S extends `$${infer Tag}$${infer Rest2}`
        ? Rest2 extends `${infer Body}$${Tag}$${infer After}`
            ? CollectTuples<After, Depth, `${Cur}$${Tag}$${Body}$${Tag}$`, Ts, [any, ...Steps]>
            : { tuples: Ts; rest: S }
    : S extends `(${infer R}`
        ? Depth extends [] ? CollectTuples<R, [any], "", Ts, [any, ...Steps]>
        : CollectTuples<R, [any, ...Depth], `${Cur}(`, Ts, [any, ...Steps]>
    : S extends `)${infer R}`
        ? Depth extends [any] ? AfterTuple<R, [...Ts, Cur]>
        : Depth extends [any, ...infer D extends any[]]
            ? CollectTuples<R, D, `${Cur})`, Ts, [any, ...Steps]>
            : { tuples: Ts; rest: "" }              // stray ")" at depth 0 — stop clean
    : S extends `${infer C}${infer R}`
        ? Depth extends [] ? CollectTuples<R, [], "", Ts, [any, ...Steps]>   // between tuples: skip
        : CollectTuples<R, Depth, `${Cur}${C}`, Ts, [any, ...Steps]>
    : { tuples: Ts; rest: "" };

// After a closed tuple: a comma (after optional whitespace) starts the next
// tuple — with a FRESH step counter; anything else ends the list cleanly.
type AfterTuple<S extends string, Ts extends readonly string[]> =
    S extends `${" " | "\t" | "\n"}${infer R}` ? AfterTuple<R, Ts>
    : S extends `,${infer R}` ? CollectTuples<R, [], "", Ts>
    : { tuples: Ts; rest: "" };

// Intersect ZipInsert over every collected tuple — each tuple's i-th value
// binds to the i-th column, exactly like the single-row path.
type ZipAllTuples<
    Ts extends readonly string[], Cols extends readonly string[],
    Table extends string, S extends DatabaseSchema, Acc = {},
> = Ts extends readonly [infer H extends string, ...infer R extends readonly string[]]
    ? ZipAllTuples<R, Cols, Table, S, Acc & ZipInsert<Cols, SplitCommaSimple<H>, Table, S>>
    : Acc;

type MultiRowValuesParams<N extends string, Table extends string, S extends DatabaseSchema> =
    AfterValues<N> extends infer A extends string
        ? CollectTuples<A> extends infer R extends TupleScan
            ? ZipAllTuples<R["tuples"], ExtractInsertColumns<N>, Table, S>
                & (R["rest"] extends "" ? {} : LooseParamsSkipLit<R["rest"]>)
            : {}
        : {};

type InsertParams<N extends string, S extends DatabaseSchema> =
    InsertTargetTable<N, S> extends infer Table extends string
        ? (IsMultiRowInsert<N> extends true
            ? MultiRowValuesParams<N, Table, S>
            : ZipInsert<ExtractInsertColumns<N>, ExtractInsertValues<N>, Table, S>)
            & SetParams<SplitTopLevel<ConflictSetBlock<N>>, Table, S>
            & WhereParamsFor<N, Table, S>
        : {};

// ---- UPDATE SET ----
type ExtractSetBlock<N extends string> =
    N extends `${string} set ${infer Rest}`
        ? ExtractBefore<ExtractBefore<Rest, " where ">, " returning "> : "";

type SetParams<
    Pairs extends readonly string[], Table extends string,
    S extends DatabaseSchema, Acc = {},
> = Pairs extends readonly [infer P extends string, ...infer R extends string[]]
    ? P extends `${infer Left}=${infer Right}`
        ? ParamName<Right> extends infer Name
            // not exactly `:name` → extract any inner placeholders loose (spec §6)
            ? [Name] extends [never] ? SetParams<R, Table, S, Acc & LooseParams<Right>>
            : Name extends string
                ? SetParams<R, Table, S, Acc & { [K in Name]: ColumnTypeFromTableKey<Table, CleanIdent<Left>, S> }>
                : SetParams<R, Table, S, Acc>
            : Acc
        : SetParams<R, Table, S, Acc>
    : Acc;

// ---- WHERE / USING ----
type WhereBlock<N extends string> =
    N extends `${string} where ${string}` ? ExtractLastWhere<N> : "";

// Split on top-level " and "/" or ", but keep a `between X and Y` range intact:
// when a part ends with a dangling `between ... ` (no closing operand yet),
// re-glue it with the following part.
type SplitConds<S extends string> =
    Reglue<SplitOn<S, " and ">> extends infer A extends string[]
        ? FlatSplit<A, " or "> : [];
type SplitOn<S extends string, D extends string> =
    S extends `${infer H}${D}${infer T}` ? [H, ...SplitOn<T, D>] : [S];
type FlatSplit<Parts extends readonly string[], D extends string, Acc extends string[] = []> =
    Parts extends readonly [infer H extends string, ...infer R extends string[]]
        ? FlatSplit<R, D, [...Acc, ...SplitOn<H, D>]> : Acc;

type Reglue<Parts extends readonly string[], Acc extends string[] = []> =
    Parts extends readonly [infer H extends string, infer N extends string, ...infer R extends string[]]
        ? EndsWithBetween<H> extends true
            ? Reglue<[`${H} and ${N}`, ...R], Acc>
            : Reglue<[N, ...R], [...Acc, H]>
        : Parts extends readonly [infer L extends string]
            ? [...Acc, L]
            : Acc;

type EndsWithBetween<S extends string> =
    Lowercase<Trim<S>> extends `${string} between ${infer Rest}`
        ? Rest extends `${string} and ${string}` ? false : true
        : false;

// Extract EVERY placeholder name in a fragment and type each DriverParamValue.
// Used as the loose fallback (spec §6.5) — present, not dropped, not column-typed.
// Delegates to the colon-jumping `AllLooseParams`: `${infer _Pre}:${infer Rest}`
// matches the LEFTMOST colon (probe-confirmed — the old "greedy → LAST colon"
// rationale for the per-char walk was a misconception), so this scans colon-to-colon
// (O(colons), NOT O(chars)) yet yields the identical param set. Between colons the
// old per-char walk only consumed chars without touching Acc, so jumping straight to
// the next colon is equivalent; `::cast` skip / empty-name skip / colons inside an
// un-stripped single-quoted literal (`'a:b'` → `:b`) all match exactly. The 64
// colon-event cap is lenient and strictly safer than the implicitly TS2589-bounded
// per-char walk it replaces (design contract: widen/lenient on overrun).
type LooseParams<S extends string, Acc = {}> = AllLooseParams<S, Acc>;

// Whole-query placeholder sweep for the select/with path (step-capped). The select
// path types params precisely from the *last* WHERE only, so placeholders elsewhere
// — in the SELECT projection (`:currency::text` inside a function call) or in an
// *earlier* WHERE of a UNION — are otherwise dropped, and withParams then rejects
// those keys. This sweep captures EVERY `:name` as DriverParamValue (= unknown);
// intersecting it with the precise WHERE bindings is a no-op on shared keys
// (`unknown & T = T`), so precise column types still win.
//
// Single-quoted string literals must be skipped, or a literal like `'draft:team:'`
// or `'team:' || …` would have its inner colons misread as `:team` / `:user`. Rather
// than pre-build a literal-stripped copy of the whole (~7.6k-char) query and re-walk
// it — the old `StripSingleQuoted` rebuilt the full string via `\`${Pre} ${After}\``
// once PER literal (~30 big-string interns on the hot SELECTs) — this FUSES the two
// passes: jump to the next quote in one instantiation, colon-scan the quote-free
// prefix (`AllLooseParams<Pre>` — colons there are provably not inside a literal),
// skip the literal body, then recurse on the suffix, never interning the full string.
// Behaviour matches the old strip→scan exactly: an unterminated quote drops its
// dangling tail (lenient), and escaped `''` degrades identically (treated as two
// literal boundaries, never yielding a param).
type LooseParamsSkipLit<S extends string, Acc = {}, Steps extends any[] = []> =
    Steps["length"] extends 64 ? Acc
    : S extends `${infer Pre}'${infer Rest}`
        ? Rest extends `${infer _Lit}'${infer After}`
            ? LooseParamsSkipLit<After, AllLooseParams<Pre, Acc>, [any, ...Steps]>
            : AllLooseParams<Pre, Acc>
        : AllLooseParams<S, Acc>;

// Jumps colon-to-colon via template inference (`${infer _Pre}:${infer Rest}`
// matches up to the LEFTMOST colon in ONE instantiation), so recursion depth is
// the number of colons in the query — a handful — NOT its character length. A
// per-char walk capped near ~1000 instead *causes* TS2589 (design contract), so
// this scans cheaply and the step cap is a small colon count, not a length cap.
// `::cast` is detected by `Rest` starting with a second colon and skipped.
// Caller passes a quote-free segment (see LooseParamsSkipLit), so a colon here is
// never inside a single-quoted string literal.
type AllLooseParams<S extends string, Acc = {}, Steps extends any[] = []> =
    Steps["length"] extends 64 ? Acc
    : S extends `${infer _Pre}:${infer Rest}`
        ? Rest extends `:${infer R2}` ? AllLooseParams<R2, Acc, [any, ...Steps]>
        : ReadName<Rest> extends infer Nm extends string
            ? Nm extends "" ? AllLooseParams<Rest, Acc, [any, ...Steps]>
            : AllLooseParams<DropName<Rest>, Acc & { [K in Nm]: DriverParamValue }, [any, ...Steps]>
            : Acc
    : Acc;

// Chars that terminate a `:name` identifier in a SQL fragment.
type NameStop =
    | " " | "\t" | "\n" | "," | ";" | ")" | "(" | "'" | '"' | ":" | "."
    | "=" | "+" | "-" | "*" | "/" | "|" | "%" | ">" | "<" | "!" | "~"
    | "@" | "#" | "&" | "^" | "[" | "]" | "{" | "}";
type ReadName<S extends string, Acc extends string = ""> =
    S extends `${infer C}${infer R}`
        ? C extends NameStop ? Acc : ReadName<R, `${Acc}${C}`>
        : Acc;
type DropName<S extends string> =
    S extends `${infer C}${infer R}` ? C extends NameStop ? S : DropName<R> : S;

type WhereParam<Cond extends string, Alias extends string, Table extends string, S extends DatabaseSchema> =
    // col between :lo and :hi  (keywords lowercased post-normalize)
    Trim<Cond> extends `${infer Lhs} between ${infer Lo} and ${infer Hi}`
        ? BetweenParams<Lhs, Lo, Hi, Alias, Table, S>
    // col is [not] distinct from :p
    : Trim<Cond> extends `${infer Lhs} is not distinct from ${infer Rhs}`
        ? DistinctParam<Lhs, Rhs, Alias, Table, S>
    : Trim<Cond> extends `${infer Lhs} is distinct from ${infer Rhs}`
        ? DistinctParam<Lhs, Rhs, Alias, Table, S>
    : Trim<Cond> extends `${infer Lhs} in (${infer Inner})`
        ? ParamName<Inner> extends infer P
            ? [P] extends [never] ? LooseParams<Inner>
            : P extends string
                ? IsBareColumnRef<Lhs> extends true
                    ? ScopedBindArray<Lhs, P, Alias, Table, S>
                    : LooseParams<Inner>
                : LooseParams<Inner>
            : LooseParams<Inner>
        : Trim<Cond> extends `${infer Lhs}:${infer Tail}`
            ? CleanParamIdent<Tail> extends infer P
                ? [P] extends [never] ? LooseParams<Cond>
                : P extends "" ? LooseParams<Cond>
                : P extends string
                    // Recognized `col <op> :p` ONLY when, after removing the trailing
                    // comparison operator, the left side is a bare (optionally
                    // alias-qualified) identifier — no arithmetic, function call, or
                    // second placeholder. Anything else widens to loose (spec §6.4).
                    ? StripTrailingCmpOp<Lhs> extends infer Col extends string
                        ? IsBareColumnRef<Col> extends true
                            ? ScopedBind<Col, P, Alias, Table, S>
                            : LooseParams<Cond>
                        : LooseParams<Cond>
                    : LooseParams<Cond>
                : LooseParams<Cond>
            : LooseParams<Cond>;

// Honor a qualified ref only when its qualifier is the target's own alias or
// the target base-table name (spec §6.1); a foreign qualifier (e.g. a FROM-clause
// alias) widens to DriverParamValue. An unqualified ref binds to the target.
type ScopedBind<Col extends string, P extends string, Alias extends string,
    Table extends string, S extends DatabaseSchema> =
    Trim<Col> extends `${infer Qual}.${infer _C}`
        ? Qual extends Alias ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Col>, S> }
        : LowerEq<Qual, BaseName<Table>> extends true ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Col>, S> }
        : { [K in P]: DriverParamValue }
        : { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Col>, S> };

// Same scoping, but the bound type is the column type as an array (IN-list).
type ScopedBindArray<Col extends string, P extends string, Alias extends string,
    Table extends string, S extends DatabaseSchema> =
    Trim<Col> extends `${infer Qual}.${infer _C}`
        ? Qual extends Alias ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Col>, S>[] }
        : LowerEq<Qual, BaseName<Table>> extends true ? { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Col>, S>[] }
        : { [K in P]: DriverParamValue }
        : { [K in P]: ColumnTypeFromTableKey<Table, ColOf<Col>, S>[] };

type BaseName<TableKey extends string> =
    TableKey extends `${string}.${infer T}` ? T : TableKey;
type LowerEq<A extends string, B extends string> =
    Lowercase<A> extends Lowercase<B> ? true : false;

// Target's own alias: the token after the target table in `update <t> <alias>`,
// `delete from <t> <alias>`, or `insert into <t> as <alias>` (spec §6.1).
type TargetAlias<N extends string> =
    N extends `update ${infer Rest}` ? AliasAfterTable<Rest>
    : N extends `delete from ${infer Rest}` ? AliasAfterTable<Rest>
    : N extends `insert into ${infer Rest}`
        ? Rest extends `${infer _T} as ${infer A} ${string}` ? FirstToken<Trim<A>>
        : Rest extends `${infer _T} as ${infer A}` ? FirstToken<Trim<A>> : ""
    : "";
// `<table> <alias> set|from|where|using|...` — alias is the 2nd token unless it
// is itself a clause keyword or a parenthesised list.
type AliasAfterTable<Rest extends string> =
    Rest extends `${infer _Table} ${infer After}`
        ? FirstToken<Trim<After>> extends infer A extends string
            ? A extends "set" | "where" | "from" | "using" | "(" | "as" ? ""
            : A extends `(${string}` ? "" : A
            : ""
        : "";

// Strip a trailing recognized comparison operator (and surrounding spaces) from
// the left side of a `col <op> :p` split. COMPOUND/symbol ops first (so `!=`,
// `<=`, `>=`, `<>` are not mis-split by the `=`/`<`/`>` arms), then the word ops
// `like`/`ilike` (case-insensitive). If nothing recognized trails, returns the
// input unchanged so the bare-ref check below fails → loose.
type StripTrailingCmpOp<S extends string> =
    Trim<S> extends `${infer P}!=` ? Trim<P>
    : Trim<S> extends `${infer P}<>` ? Trim<P>
    : Trim<S> extends `${infer P}<=` ? Trim<P>
    : Trim<S> extends `${infer P}>=` ? Trim<P>
    : Trim<S> extends `${infer P}=` ? Trim<P>
    : Trim<S> extends `${infer P}<` ? Trim<P>
    : Trim<S> extends `${infer P}>` ? Trim<P>
    : Trim<S> extends `${infer P} ${infer Op}`
        ? Lowercase<Op> extends "like" | "ilike" ? Trim<P> : Trim<S>
        : Trim<S>;

// True iff `S` (trimmed) is a single column ref: an identifier, optionally
// alias/schema-qualified with dots, and NOTHING else — no space, arithmetic,
// parenthesis, pipe, percent, or extra colon. This is what makes `amount + `,
// `lower(x)`, and an empty Lhs (reversed `:p = col`) fail recognition → loose.
type IsBareColumnRef<S extends string> =
    Trim<S> extends "" ? false
    : Trim<S> extends `${string}${" " | "+" | "-" | "*" | "/" | "(" | ")" | ":" | "|" | "%"}${string}` ? false
    : true;

type BetweenParams<Lhs extends string, Lo extends string, Hi extends string,
    Alias extends string, Table extends string, S extends DatabaseSchema> =
    ScopedColType<Lhs, Alias, Table, S> extends infer CT
        ? IsBareColumnRef<Lhs> extends true
            ? MergeName<ParamName<Lo>, CT> & MergeName<ParamName<Hi>, CT>
                & LooseLeftover<Lo, Hi>
            : LooseParams<`${Lo} ${Hi}`>
        : {};

type DistinctParam<Lhs extends string, Rhs extends string,
    Alias extends string, Table extends string, S extends DatabaseSchema> =
    IsBareColumnRef<Lhs> extends true
        ? MergeName<ParamName<Rhs>, ScopedColType<Lhs, Alias, Table, S>>
        : LooseParams<Rhs>;

// Column type for a (possibly qualified) bare ref under target-alias scoping:
// the column type when the qualifier is the target alias / base name or absent,
// else DriverParamValue (foreign qualifier).
type ScopedColType<Col extends string, Alias extends string,
    Table extends string, S extends DatabaseSchema> =
    Trim<Col> extends `${infer Qual}.${infer _C}`
        ? Qual extends Alias ? ColumnTypeFromTableKey<Table, ColOf<Col>, S>
        : LowerEq<Qual, BaseName<Table>> extends true ? ColumnTypeFromTableKey<Table, ColOf<Col>, S>
        : DriverParamValue
        : ColumnTypeFromTableKey<Table, ColOf<Col>, S>;

// { name: T } when name is a real param, else {} (a literal operand contributes none).
type MergeName<P, T> = [P] extends [never] ? {} : P extends string ? { [K in P]: T } : {};
// If an operand is not a placeholder it contributes nothing; this no-op keeps
// the between arm total.
type LooseLeftover<_Lo extends string, _Hi extends string> = {};

type WhereParams<
    Conds extends readonly string[], Alias extends string, Table extends string,
    S extends DatabaseSchema, Acc = {},
> = Conds extends readonly [infer C extends string, ...infer R extends string[]]
    ? WhereParams<R, Alias, Table, S, Acc & WhereParam<C, Alias, Table, S>> : Acc;

// Colon pre-gate: a WHERE block with no `:` at all binds no params (every WhereParam
// arm on a colon-free cond falls through to the loose path → {}), so skip the
// SplitConds + WhereParams fold (and TargetAlias) entirely. Behavior-preserving — the
// gated-out case produced {} anyway. Helps the hot param-free outer WHEREs (e.g.
// `("groups" like '%…%' …)` on the big SELECTs). `::casts`/literal colons keep the
// full path (gate passes), exactly as before.
type WhereParamsFor<N extends string, Table extends string, S extends DatabaseSchema> =
    WhereBlock<N> extends infer W extends string
        ? W extends `${string}:${string}`
            ? WhereParams<SplitConds<W>, TargetAlias<N>, Table, S>
            : {}
        : {};

// ---- leading-WITH (CTE) split ----------------------------------------------
// A write builder may prepend `with <name> as [materialized ](<body>) update …`
// (Task 1.2). The normalized string then starts with `with `, so the dispatch
// below would route it down the loose select/with arm and bind the UPDATE's own
// WHERE/SET params imprecisely (`oid: never`, since no real update-target table
// is resolved). To keep precise UPDATE/INSERT/DELETE typing while still capturing
// the CTE body's `:params`, peel a leading `with`-clause off: split at the FIRST
// paren-depth-0 main-statement keyword (`update `/`insert into `/`delete from `).
// The peeled head (CTE bodies) contributes loose `:params`; the tail dispatches
// as the real write statement. SELECT/with-SELECT (no DML keyword at depth 0) is
// left untouched and flows through the existing select arm unchanged.
//
// `SplitLeadingWith<N>` walks char-by-char tracking paren depth; when at depth 0
// it matches a DML keyword boundary, returning `{ head; tail }`. Step-capped; on
// overrun or no match it yields `never` (caller falls back to the plain dispatch).
type WithSplit = { head: string; tail: string };
// Step cap ≈ char cap: this walk consumes one step per char of the FULL
// `with … <dml>` prefix — the entire CTE head PLUS the depth-0 keyword boundary,
// not just a clause tail. So the 600-step cap means leading-CTE text up to ~600
// chars is split precisely; beyond that (or when no depth-0 DML keyword exists,
// e.g. a leading-`with` SELECT) this yields `never` and the caller DEGRADES TO
// LOOSE param typing — a safe fallback, NOT a hard error.
//
// The cap is intentionally NOT raised: large raw `with …` statements (e.g. the
// multi-CTE / `with recursive` fixtures fed to the raw sql tag) push tsc past its
// instantiation-depth limit (TS2589) at 1200. 600 keeps every real builder CTE
// prefix precise while staying within budget for the raw-string passthrough.
type SplitLeadingWith<S extends string, Acc extends string = "", Depth extends any[] = [], Steps extends any[] = []> =
    Steps["length"] extends 600 ? never
    : Depth extends []
        // At top level, a DML keyword starts the real statement — split here.
        ? S extends `update ${infer _R}` ? { head: Acc; tail: S }
        : S extends `insert into ${infer _R}` ? { head: Acc; tail: S }
        : S extends `delete from ${infer _R}` ? { head: Acc; tail: S }
        : S extends `(${infer R}` ? SplitLeadingWith<R, `${Acc}(`, [any, ...Depth], [any, ...Steps]>
        : S extends `${infer C}${infer R}` ? SplitLeadingWith<R, `${Acc}${C}`, Depth, [any, ...Steps]>
        : never
        // Inside parens — only track depth; never split.
        : S extends `(${infer R}` ? SplitLeadingWith<R, `${Acc}(`, [any, ...Depth], [any, ...Steps]>
        : S extends `)${infer R}`
            ? Depth extends [any, ...infer D extends any[]] ? SplitLeadingWith<R, `${Acc})`, D, [any, ...Steps]> : never
        : S extends `${infer C}${infer R}` ? SplitLeadingWith<R, `${Acc}${C}`, Depth, [any, ...Steps]>
        : never;

// ---- dispatch ----
type ParamsForKind<N extends string, S extends DatabaseSchema> =
    N extends `insert into ${string}` ? InsertParams<N, S>
    : N extends `update ${string}`
        ? UpdateTargetTable<N, S> extends infer T extends string
            ? SetParams<SplitTopLevel<ExtractSetBlock<N>>, T, S> & WhereParamsFor<N, T, S> : {}
    : N extends `delete from ${string}`
        ? DeleteTargetTable<N, S> extends infer T extends string ? WhereParamsFor<N, T, S> : {}
    // Leading `with`-clause wrapping a DML statement (builder CTE prefix): peel
    // the CTE head (loose params) and dispatch the inner write statement, so its
    // own params stay precisely typed.
    : N extends `with ${string}`
        // `[never] extends [never]` guards the no-DML-keyword case (with-SELECT):
        // SplitLeadingWith yields `never`, and we keep the loose select/with arm.
        ? [SplitLeadingWith<N>] extends [never]
            ? DeleteTargetTable<N, S> extends infer T extends string
                ? LooseParamsSkipLit<N> & WhereParamsFor<N, T, S>
                : LooseParamsSkipLit<N>
            : SplitLeadingWith<N> extends infer W extends WithSplit
                ? LooseParamsSkipLit<W["head"]> & ParamsForKind<W["tail"], S>
                : LooseParamsSkipLit<N>
    : N extends `select ${string}`
        ? DeleteTargetTable<N, S> extends infer T extends string
            ? LooseParamsSkipLit<N> & WhereParamsFor<N, T, S>
            : LooseParamsSkipLit<N>
    : {};

export type ExtractParams<Query extends string, S extends DatabaseSchema> =
    NormalizeQueryKeepParams<Query> extends infer N extends string ? Simplify<ParamsForKind<N, S>> : {};

// ---- RETURNING ----
type TargetForReturning<N extends string, S extends DatabaseSchema> =
    N extends `insert into ${string}` ? InsertTargetTable<N, S>
    : N extends `update ${string}` ? UpdateTargetTable<N, S>
    : N extends `delete from ${string}` ? DeleteTargetTable<N, S>
    : never;

// Reuse the existing GetReturnType inferrer (aliases, `as`, casts, functions,
// expressions, `*`) by synthesizing `select <returning-list> from <target>` and
// running the full machinery over it (spec §6/§7 — "reuse GetReturnType for
// aliases/expressions where applicable"). A bare `*` short-circuits to the full
// row. `T` is the normalized target key (e.g. "public.orders"), which the
// validator resolves as a schema-qualified FROM source.
//
// Cheap pre-filter: a query with no `returning` keyword at all can have no
// RETURNING row, so skip the (expensive) `NormalizeQuery` char-walk entirely and
// return `{}` after a single `Lowercase` intrinsic. This matters when many
// `BoundSql<Q, S>` types are unioned (e.g. a big `createSql` smoke-test array):
// each element's phantom `__returning` member is resolved during the structural
// union comparison, and running a full normalize per element exhausts TS's
// cumulative instantiation budget (TS2589). The word-only test is safe — a false
// positive (the literal `returning` inside a string/identifier) just falls through
// to the accurate path below, so correctness is unchanged.
export type ExtractReturning<Query extends string, S extends DatabaseSchema> =
    Lowercase<Query> extends `${string}returning${string}`
        // A very long RETURNING query (e.g. a writable-CTE INSERT … RETURNING) runs
        // the full inferrer below, which is a deep chain; when many `BoundSql<Q,S>`
        // are unioned (a big `createSql` smoke-test array) the union comparison
        // resolves each element's phantom `__returning`, and that one deep inner
        // chain tips TS past its instantiation-depth limit (TS2589). Degrade the
        // RETURNING row to `{}` on over-budget queries — the documented "precision
        // traded away on very wide/long queries" path. Ordinary-size RETURNING
        // queries keep precise row inference.
        ? ExceedsLengthBudget<Query> extends true ? {} : ExtractReturningInner<Query, S>
        : {};

type ExtractReturningInner<Query extends string, S extends DatabaseSchema> =
    NormalizeQuery<Query> extends infer N extends string
        ? ExtractReturningList<N> extends infer L extends string
            ? L extends "" ? {}
            : TargetForReturning<N, S> extends infer T extends string
                ? Trim<L> extends "*"
                    ? RowTypeForTable<T, S>
                    : Simplify<GetReturnType<`select ${L} from ${T}`, S>>
                : {}
            : {}
        : {};
