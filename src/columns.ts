import type {
    DatabaseSchema,
    ColumnExists,
    ColumnExistsInAnyTable,
    ResolveColumnName,
    TableExists
} from "./schema.js";
import type { AliasesInQuery, AliasNames, IsAliasName, TableKeyFromToken, TableKeyValid, TablesInQuery } from "./tables.js";
import type {
    CanPrecedeColumn,
    CleanExpr,
    CleanIdent,
    CleanLooseToken,
    DQuoteSpaceSentinel,
    HasSpecial,
    IsParamPlaceholder,
    IsQualifiedRefCandidate,
    IsRuntimeStringFragment,
    IsSqlConstant,
    LooseScanView,
    OperatorToken,
    ReplaceAll,
    SqlReserved,
    SplitOnDotClean
} from "./parsing.js";
import type { IsNever } from "./utils.js";

// Column references

export type ColumnRef<TableKey extends string, Column extends string> = {
    tableKey: TableKey;
    column: Column;
};

export type BuildColumnRef<
    TableKey extends string,
    Column extends string,
    S extends DatabaseSchema
> =
    ResolveColumnName<TableKey, Column, S> extends infer Resolved extends string
        ? ColumnRef<TableKey, Resolved>
        : never;

export type StripDoubleQuotes<S extends string> = ReplaceAll<S, `"`, "">;

// Parse column references from expressions
// - supports schema.table.column, table.column, and column

// A qualified ref whose table/alias prefix is a double-quoted identifier
// containing operator punctuation (`"u-1".id`) breaks the generic path: stripping
// the quotes yields `u-1`, which `IsSimpleRefPart`/`HasSpecial` reject as an
// arithmetic-looking token, so the ref collapses to `never` and the projected key
// is lost. A double-quoted identifier is by definition a single opaque name, so
// when the prefix carries punctuation we resolve it directly (alias/table lookup)
// without the special-char gate. The no-punctuation case (`"u1".id`) stays on the
// proven generic path; the column part must be a plain name (no dot/quote/star).
export type ParseColumnRef<
    Expr extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    CleanExpr<Expr> extends `"${infer P}".${infer Col}`
        ? IsQuotedPunctPrefix<P, Col> extends true
            ? ResolveQuotedPrefixRef<CleanIdent<P>, CleanIdent<Col>, Tables, Aliases, S>
            : ParseColumnRefGeneric<Expr, Tables, Aliases, S>
        : ParseColumnRefGeneric<Expr, Tables, Aliases, S>;

export type IsQuotedPunctPrefix<P extends string, Col extends string> =
    Col extends `${string}.${string}` ? false :
    Col extends `${string}"${string}` ? false :
    Col extends `${string}*${string}` ? false :
    HasSpecial<P> extends true ? true :
    false;

export type ResolveQuotedPrefixRef<
    P extends string,
    Col extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    [ResolveTableKey<P, Tables, Aliases, S>] extends [infer TK extends string]
        ? [TK] extends [never]
            ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, Col>] extends [infer TKF extends string]
                ? [TKF] extends [never]
                    ? never
                    : BuildColumnRef<TKF, Col, S>
                : never
            : BuildColumnRef<TK, Col, S>
        : never;

export type ParseColumnRefGeneric<
    Expr extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    ParseColumnRefParts<SplitOnDotClean<StripDoubleQuotes<CleanExpr<Expr>>>, Tables, Aliases, S>;

type ParseColumnRefParts<
    Parts extends string[],
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    Parts extends [infer A extends string, infer B extends string, infer C extends string]
        ? IsSimpleRefPart<A> extends true
            ? IsSimpleRefPart<B> extends true
                ? IsSimpleRefPart<C> extends true
                    ? BuildColumnRef<`${A}.${B}`, C, S>
                    : never
                : never
            : never
        : Parts extends [infer A extends string, infer B extends string]
            ? IsSimpleRefPart<A> extends true
                ? IsSimpleRefPart<B> extends true
                    ? IsRuntimeStringFragment<A> extends true
                        ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, B>] extends [infer TKRuntime extends string]
                            ? [TKRuntime] extends [never]
                                ? never
                                : BuildColumnRef<TKRuntime, B, S>
                            : never
                        : CleanIdent<A> extends "excluded"
                        ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, B>] extends [infer TKExcluded extends string]
                            ? [TKExcluded] extends [never]
                                ? never
                                : BuildColumnRef<TKExcluded, B, S>
                            : never
                        : [ResolveTableKey<A, Tables, Aliases, S>] extends [infer TK extends string]
                            ? [TK] extends [never]
                                ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, B>] extends [infer TKFallback extends string]
                                    ? [TKFallback] extends [never]
                                        ? never
                                        : BuildColumnRef<TKFallback, B, S>
                                    : never
                                : BuildColumnRef<TK, B, S>
                            : never
                    : never
                : never
            : Parts extends [infer A extends string]
                ? IsSimpleRefPart<A> extends true
                    ? [ResolveTableKeyForUnqualified<Tables, Aliases, S, A>] extends [infer TK2 extends string]
                        ? [TK2] extends [never]
                            ? never
                            : BuildColumnRef<TK2, A, S>
                        : never
                    : never
                : never;

export type IsSimpleRefPart<S extends string> =
    S extends "" ? false :
    HasSpecial<S> extends true ? false :
    true;

// Validate a column reference string like a.b or a.b.c

export type ColumnRefValid<ColRef extends string, N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? ColumnRefValidWith<ColRef, Tables, Aliases, S>
            : true
        : true;

export type ColumnRefValidWith<
    ColRef extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    ColRef extends `${infer Prefix}.*`
        ? [ResolveAlias<CleanIdent<Prefix>, Aliases>] extends [infer AliasKey extends string]
            ? [AliasKey] extends [never]
                ? TableKeysByName<CleanIdent<Prefix>, Tables> extends infer TableKey extends string
                    ? [TableKey] extends [never]
                        ? CleanIdent<Prefix> extends `${infer Schema}.${infer Table}`
                            ? TableExists<S, Schema, Table> extends true
                                ? TableKeyValid<`${Schema}.${Table}`, S>
                                : false
                            : false
                        : TableKeyValid<TableKey, S>
                    : false
                : TableKeyValid<AliasKey, S>
            : false
        : ParseColumnRef<ColRef, Tables, Aliases, S> extends infer Ref
            ? [Ref] extends [never]
                ? true
                : [Ref] extends [ColumnRef<infer TableKey extends string, infer Column extends string>]
                    ? ColumnExists<TableKey, Column, S>
                    : true
            : true;

export type ColumnRefValidLoose<ColRef extends string, N extends string, S extends DatabaseSchema> =
    TablesInQuery<N, S> extends infer Tables extends string
        ? AliasesInQuery<N, S> extends infer Aliases extends string
            ? ColumnRefValidLooseWith<ColRef, Tables, Aliases, S>
            : ColumnRefValid<ColRef, N, S>
        : ColumnRefValid<ColRef, N, S>;

export type ColumnRefValidLooseWith<
    ColRef extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = IsNever<Tables> extends true
    ? ColumnRefValidNoTables<ColRef, S>
    : ColumnRefValidWith<ColRef, Tables, Aliases, S>;

export type ColumnRefValidNoTables<ColRef extends string, S extends DatabaseSchema> =
    ColumnRefValidNoTablesParts<SplitOnDotClean<ColRef>, S>;

type ColumnRefValidNoTablesParts<Parts extends string[], S extends DatabaseSchema> =
    Parts extends [infer A extends string, infer B extends string, infer C extends string]
        ? TableExists<S, A, B> extends true
            ? ColumnExists<`${A}.${B}`, C, S>
            : false
        : Parts extends [infer A extends string, infer B extends string]
            ? TableExists<S, S["defaultSchema"], A> extends true
                ? ColumnExists<`${S["defaultSchema"]}.${A}`, B, S>
                : ColumnExistsInAnyTable<B, S>
            : Parts extends [infer A extends string]
                ? ColumnExistsInAnyTable<A, S>
                : false;

// ---- Direct-string column ref-scans ----
//
// Best-effort qualified / unqualified column references across a query segment.
// These walk the padded `LooseScanView` string DIRECTLY, word by word — replacing
// the old `TokenizeLoose` token ARRAY plus two array-walks (round-9): every array
// build/destructure step minted a unique-content tuple and its apparent-`Array`
// types, while a word-jump string walk interns its substrings and `[any, ...Steps]`
// counter tuples. Token semantics are reproduced verbatim:
//   - per word, the kept token is `CleanLooseToken<ReplaceAll<H, DQuoteSpaceSentinel, " ">>`
//     (exactly the old `SrclPush`); a word cleaning to `""` never occupied an array
//     position, so it updates NO register and consumes NO cap budget;
//   - `IS [NOT] DISTINCT FROM` (old `DropDistinctFrom` pre-pass, fused in): a `from`
//     token whose RAW-stream predecessor is `distinct` is operator text, not a
//     FROM-clause boundary — it is dropped, so the filtered-stream `Prev` the next
//     token sees stays `distinct` (which `CanPrecedeColumn` blesses) instead of
//     `from` (which would mark it a table source and skip validation). `PrevRaw`
//     tracks the UNFILTERED stream (a dropped `from` still sets it to `from`),
//     mirroring the old pre-pass's own `Prev` chain exactly. The old pass only ran
//     when the segment contained `distinct ` — per-token it's the same test, and
//     its 400-token cap (remainder unfiltered) is gone: a >400-token `distinct`
//     stream now validates its RHS like any other, never rejecting valid SQL.
//
// Cap parity: `Steps` caps total WORDS at 2000 (the old split cap — on cap the old
// pipeline blobbed the remainder into ONE token and the walkers processed it; the
// `*Last` arms apply the same one-token transform to the remainder). `Kept` caps
// kept TOKENS at 900 (the old ref-walk cap — return `Acc`, rest unscanned).

export type QualifiedRefScan<Seg extends string> =
    LooseScanView<Seg> extends infer V extends string
        ? QrsWalk<V>
        : never;

type QrsWalk<
    V extends string,
    Acc extends string = never,
    Prev extends string = "",
    PrevRaw extends string = "",
    Kept extends any[] = [],
    Steps extends any[] = []
> = Steps["length"] extends 2000
    ? QrsLast<V, Acc, Prev>
    : Kept["length"] extends 900
        ? Acc
        : V extends `${infer H} ${infer R}`
            ? CleanLooseToken<ReplaceAll<H, DQuoteSpaceSentinel, " ">> extends infer M extends string
                ? M extends ""
                    ? QrsWalk<R, Acc, Prev, PrevRaw, Kept, [any, ...Steps]>
                    : M extends "from"
                        ? PrevRaw extends "distinct"
                            ? QrsWalk<R, Acc, Prev, "from", Kept, [any, ...Steps]>
                            : QrsWalk<R, Acc, "from", "from", [any, ...Kept], [any, ...Steps]>
                        : M extends `${string}.${string}`
                            ? Prev extends "from" | "join" | "update" | "into" | "delete"
                                ? QrsWalk<R, Acc, M, M, [any, ...Kept], [any, ...Steps]>
                                : IsQualifiedRefCandidate<M> extends true
                                    ? QrsWalk<R, Acc | M, M, M, [any, ...Kept], [any, ...Steps]>
                                    : QrsWalk<R, Acc, M, M, [any, ...Kept], [any, ...Steps]>
                            : QrsWalk<R, Acc, M, M, [any, ...Kept], [any, ...Steps]>
                : never
            : QrsLast<V, Acc, Prev>;

// Final word (or capped remainder) as one token. A trailing `from` is never a ref
// and there is no subsequent token for its `Prev` effect to matter — `Acc` either way.
type QrsLast<H extends string, Acc extends string, Prev extends string> =
    CleanLooseToken<ReplaceAll<H, DQuoteSpaceSentinel, " ">> extends infer M extends string
        ? M extends `${string}.${string}`
            ? Prev extends "from" | "join" | "update" | "into" | "delete"
                ? Acc
                : IsQualifiedRefCandidate<M> extends true
                    ? Acc | M
                    : Acc
            : Acc
        : never;

export type UnqualifiedRefScan<
    Seg extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string
> = LooseScanView<Seg> extends infer V extends string
    ? UrsWalk<V, S, Tables, Aliases>
    : never;

// Deferred-decision walk: the old array walker judged token T with (Prev, Next) via
// one-token lookahead. Here the PENDING token `Pend` is judged only when the NEXT
// kept token `M` materializes — `IsUnqualifiedColumnCandidate<Pend, PrevPrev, M, …>`
// — then registers shift (`PrevPrev := Pend`, `Pend := M`). At end of stream `Pend`
// is judged with `Next = ""`, exactly the old `[T]` tail arm. `Pend = ""` means "no
// pending yet" — safe sentinel (kept tokens are never empty), and the candidate
// check is `false` for `""`, so the initial shift needs no special arm.
type UrsWalk<
    V extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    Acc extends string = never,
    PrevPrev extends string = "",
    Pend extends string = "",
    PrevRaw extends string = "",
    Kept extends any[] = [],
    Steps extends any[] = []
> = Steps["length"] extends 2000
    ? UrsLast<V, S, Tables, Aliases, Acc, PrevPrev, Pend, PrevRaw>
    : Kept["length"] extends 900
        ? Acc
        : V extends `${infer H} ${infer R}`
            ? CleanLooseToken<ReplaceAll<H, DQuoteSpaceSentinel, " ">> extends infer M extends string
                ? M extends ""
                    ? UrsWalk<R, S, Tables, Aliases, Acc, PrevPrev, Pend, PrevRaw, Kept, [any, ...Steps]>
                    : M extends "from"
                        ? PrevRaw extends "distinct"
                            ? UrsWalk<R, S, Tables, Aliases, Acc, PrevPrev, Pend, "from", Kept, [any, ...Steps]>
                            : UrsShift<R, S, Tables, Aliases, Acc, PrevPrev, Pend, M, Kept, Steps>
                        : UrsShift<R, S, Tables, Aliases, Acc, PrevPrev, Pend, M, Kept, Steps>
                : never
            : UrsLast<V, S, Tables, Aliases, Acc, PrevPrev, Pend, PrevRaw>;

type UrsShift<
    R extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    Acc extends string,
    PrevPrev extends string,
    Pend extends string,
    M extends string,
    Kept extends any[],
    Steps extends any[]
> = IsUnqualifiedColumnCandidate<Pend, PrevPrev, M, Tables, Aliases, S> extends true
    ? UrsWalk<R, S, Tables, Aliases, Acc | Pend, Pend, M, M, [any, ...Kept], [any, ...Steps]>
    : UrsWalk<R, S, Tables, Aliases, Acc, Pend, M, M, [any, ...Kept], [any, ...Steps]>;

// Final word (or capped remainder) as one token: judge `Pend` with the final token
// as `Next`, then the final token itself with `Next = ""`. A final dropped
// `distinct`-`from` ends the stream, so only `Pend` (with `Next = ""`) is judged.
type UrsLast<
    H extends string,
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    Acc extends string,
    PrevPrev extends string,
    Pend extends string,
    PrevRaw extends string
> = CleanLooseToken<ReplaceAll<H, DQuoteSpaceSentinel, " ">> extends infer M extends string
    ? M extends ""
        ? UrsEnd<S, Tables, Aliases, Acc, PrevPrev, Pend>
        : M extends "from"
            ? PrevRaw extends "distinct"
                ? UrsEnd<S, Tables, Aliases, Acc, PrevPrev, Pend>
                : UrsLast2<S, Tables, Aliases, Acc, PrevPrev, Pend, M>
            : UrsLast2<S, Tables, Aliases, Acc, PrevPrev, Pend, M>
    : never;

type UrsLast2<
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    Acc extends string,
    PrevPrev extends string,
    Pend extends string,
    M extends string
> = IsUnqualifiedColumnCandidate<Pend, PrevPrev, M, Tables, Aliases, S> extends true
    ? UrsEnd<S, Tables, Aliases, Acc | Pend, Pend, M>
    : UrsEnd<S, Tables, Aliases, Acc, Pend, M>;

type UrsEnd<
    S extends DatabaseSchema,
    Tables extends string,
    Aliases extends string,
    Acc extends string,
    PrevPrev extends string,
    Pend extends string
> = IsUnqualifiedColumnCandidate<Pend, PrevPrev, "", Tables, Aliases, S> extends true
    ? Acc | Pend
    : Acc;

export type UnqualifiedColumnValid<
    Col extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> = IsNever<Tables> extends true
    ? ColumnExistsInAnyTable<CleanIdent<Col>, S>
    : [ResolveTableKeyForUnqualified<Tables, Aliases, S, CleanIdent<Col>>] extends [never]
        ? false
        : true;

export type IsUnqualifiedColumnCandidate<
    Token extends string,
    Prev extends string,
    Next extends string,
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema
> =
    Token extends "" ? false :
    IsRuntimeStringFragment<Token> extends true ? false :
    Token extends OperatorToken ? false :
    Token extends `${string}.${string}` ? false :
    Token extends `'${string}'` ? false :
    Token extends `${string}'${string}` ? false :
    Token extends `${number}` ? false :
    IsParamPlaceholder<Token> extends true ? false :
    IsSqlConstant<Token> extends true ? false :
    HasSpecial<Token> extends true ? false :
    CleanIdent<Token> extends SqlReserved ? false :
    IsAliasName<Token, Aliases> extends true ? false :
    Prev extends "as" ? false :
    Prev extends "from" | "join" | "update" | "into" | "delete" ? false :
    Next extends "(" ? false :
    // A bareword immediately followed by a string literal is a PostgreSQL typed
    // string literal's type prefix (`DATE '...'`, `TIMESTAMP '...'`), never a
    // column — a real column is never directly adjacent to a quote (round-12 L1/L2).
    Next extends `'${string}` ? false :
    // A table name following a comma is another FROM source in the comma
    // cross-join `from a, b` (the `,` plays the role `join` does), not a column.
    Prev extends "," ? (IsTableName<Token, S> extends true ? false : CanPrecedeColumn<Prev>) :
    IsNever<Tables> extends true
        ? IsTableName<Token, S> extends true
            ? false
            : CanPrecedeColumn<Prev>
        : CanPrecedeColumn<Prev>;

export type IsTableName<Token extends string, S extends DatabaseSchema> =
    TableKeyFromToken<Token, S> extends infer TableKey extends string
        ? TableKeyValid<TableKey, S>
        : false;

// Utilities for table/column resolution

export type ResolveTableKey<Name extends string, Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    ResolveAlias<Name, Aliases> | TableKeysByName<Name, Tables> | `${S["defaultSchema"]}.${Name}`;

export type ResolveTableKeyForUnqualified<
    Tables extends string,
    Aliases extends string,
    S extends DatabaseSchema,
    Column extends string
> = TablesWithColumn<Tables, Column, S> extends infer TK extends string ? TK : never;

export type ResolveAlias<Name extends string, Aliases extends string> =
    Aliases extends `${infer A}=>${infer T}`
        ? A extends Name
            ? T
            : never
        : never;

export type TableKeysByName<Name extends string, Tables extends string> =
    Tables extends `${infer Schema}.${infer Table}`
        ? Table extends Name
            ? `${Schema}.${Table}`
            : never
        : never;

export type TablesWithColumn<Tables extends string, Column extends string, S extends DatabaseSchema> =
    Tables extends `${infer Schema}.${infer Table}`
        ? ColumnExists<`${Schema}.${Table}`, Column, S> extends true
            ? `${Schema}.${Table}`
            : never
        : never;
