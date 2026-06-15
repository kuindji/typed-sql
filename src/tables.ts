import type { DatabaseSchema, NormalizeTableKey, TableExists } from "./schema.js";
import type { CleanIdent, CollectorScanView, CollectorToken, CommaSep, SplitOnDotClean, SqlKeyword } from "./parsing.js";

// Table and alias extraction
//
// The collectors walk the `CollectorScanView` STRING directly, word by word —
// replacing the old `SplitCollectorTokens` token-array build plus array-walking
// state machines (round-10): every array build/destructure step minted a
// unique-content tuple and its apparent-`Array` types, while a word-jump string
// walk interns its substrings and `[any, ...Steps]` counter tuples. The old
// walkers branched on the token at the current position plus 1–3 tokens of
// lookahead; here the lookahead is a `Mode` register — a keyword arms a mode and
// the decision fires when the NEXT kept token materializes (the round-9
// deferred-decision pattern). A word whose `CollectorToken` is `""` never
// occupied an array position, so it updates NO register (it does consume the
// step cap, exactly like the old split's per-word budget).
//
// Each walker is CHUNKED (the chunked-driver pattern): the worker walks 100
// words per evaluation and yields `{ __c: [state...] }`, and the driver
// re-invokes it with a fresh step counter — a whole-query walk in one tail
// evaluation exceeds TypeScript's conditional-evaluation budget on report-scale
// queries (TS2589). 20 chunks × 100 words = the old split's 2000-word cap: on
// the final chunk boundary the remainder is blobbed into ONE trailing token and
// dispatched in whatever state the walk had reached (the `*Final` arms), exactly
// like the old capped split + collector tail.

export type TablesInQuery<N extends string, S extends DatabaseSchema> =
    CtDrive<CtWalk<CollectorScanView<N>, S, never, false, N extends `delete ${string}` ? true : false>, S>;

export type AliasesInQuery<N extends string, S extends DatabaseSchema> =
    CaDrive<CaWalk<CollectorScanView<N>, S, never, false, N extends `delete ${string}` ? true : false>, S>;

export type TableKeyValid<Key extends string, S extends DatabaseSchema> =
    Key extends `${infer Schema}.${infer Table}`
        ? TableExists<S, Schema, Table>
        : false;

export type PreferNormalizedTableKey<Raw extends string, Normalized> =
    [Normalized] extends [never] ? Raw : Extract<Normalized, string>;

export type TableKeyFromToken<Token extends string, S extends DatabaseSchema> =
    ParseTableToken<Token, S> extends infer Parsed
        ? Parsed extends { schema: infer Schema extends string; table: infer Table extends string }
            ? PreferNormalizedTableKey<`${Schema}.${Table}`, NormalizeTableKey<`${Schema}.${Table}`, S>>
            : never
        : never;

export type ParseTableToken<Token extends string, S extends DatabaseSchema> =
    SplitOnDotClean<Token> extends [infer A extends string, infer B extends string]
        ? { schema: A; table: B }
        : SplitOnDotClean<Token> extends [infer A extends string]
            ? { schema: S["defaultSchema"]; table: A }
            : never;

// Insert/update/delete target table

// The target scan walks the RAW normalized query (never comma-marked — same as
// the old `SplitCollectorTokens<N>` path) and STOPS at the token after the
// keyword: `insert into orders ...` resolves in two words instead of first
// splitting the whole query into a token array.
export type InsertTargetTable<N extends string, S extends DatabaseSchema> =
    TableAfterScan<N, "into", S>;

export type UpdateTargetTable<N extends string, S extends DatabaseSchema> =
    TableAfterScan<N, "update", S>;

export type DeleteTargetTable<N extends string, S extends DatabaseSchema> =
    TableAfterScan<N, "from", S>;

// Collect tables by keyword

// State registers (mirroring the old array walker exactly):
// - `InList` tracks whether we are inside a FROM-source list, so a TOP-LEVEL
//   comma (preserved as a `CommaSep` token by `CollectorScanView`) introduces
//   ANOTHER table source — the ANSI comma cross-join `from a, b`. The flag is
//   turned on after a `from`/`join`/`into`/`update` source and off at the next
//   clause keyword, so commas in the SELECT list / GROUP BY / ORDER BY / value
//   tuples are ignored.
// - `InDelete` marks that we are inside a DELETE statement, where `USING` is a
//   table-source clause (`DELETE FROM a USING b, c`) — collected like FROM/JOIN.
//   `USING` in a SELECT (the JOIN ... USING (cols) join condition) is NOT a
//   table source, so the branch is gated: outside a DELETE, `using` is skipped.
// - `Mode` is the armed-keyword state: "src" = saw from|join|into (next token is
//   the source), "usingsrc" = saw DELETE-using (next token collected with NO
//   keyword/lateral skip — the old branch collected unconditionally), "upd" =
//   saw update, "del"/"delfrom" = DELETE prefix, "comma" = top-level comma in a
//   source list (next token is the candidate), "commaeq" = comma candidate seen
//   (held in `Pend`; an `=` after it marks an UPDATE SET-list separator, not a
//   source — `UPDATE t SET a = (select ... from x), b = ...`), "dist" = saw
//   `distinct` (a following `from` is the `IS [NOT] DISTINCT FROM` operator
//   tail, not a FROM clause).
// The never-guard matters: a completed walk returns `never` for a query with no
// sources, and `[never]` matches ANY wrapped pattern — without the guard the
// `__c` infers fall back to their `string` constraints and the driver re-walks a
// wide string, returning `string` (which poisons every downstream qualifier
// match).
type CtDrive<R, S extends DatabaseSchema, C extends any[] = []> =
    [R] extends [never]
        ? never
        : [R] extends [{ __c: [infer V extends string, infer Acc extends string, infer IL extends boolean, infer ID extends boolean, infer Mode extends string, infer Pend extends string] }]
        ? C["length"] extends 19
            ? CtFinal<V, S, Acc, Mode, Pend>
            : CtDrive<CtWalk<V, S, Acc, IL, ID, Mode, Pend>, S, [any, ...C]>
        : R;

type CtWalk<
    V extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InList extends boolean,
    InDelete extends boolean,
    Mode extends string = "",
    Pend extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 100
    ? { __c: [V, Acc, InList, InDelete, Mode, Pend] }
    : V extends `${infer H} ${infer R}`
        ? CollectorToken<H> extends infer M extends string
            ? M extends ""
                ? CtWalk<R, S, Acc, InList, InDelete, Mode, Pend, [any, ...Steps]>
                : CtTok<M, R, S, Acc, InList, InDelete, Mode, Pend, Steps>
            : never
        : CtFinal<V, S, Acc, Mode, Pend>;

type CtTok<
    M extends string,
    R extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InList extends boolean,
    InDelete extends boolean,
    Mode extends string,
    Pend extends string,
    Steps extends any[]
> = Mode extends ""
    ? CtNorm<M, R, S, Acc, InList, InDelete, Steps>
    : Mode extends "src"
        // `JOIN LATERAL (subquery|func(...)) alias` — `LATERAL` is a source
        // modifier, not a relation. A parenthesised FROM/JOIN source — a
        // subquery (`from (select ...)`) or VALUES list — has its `(` stripped
        // by tokenization, leaving a leading SQL keyword as the source token;
        // collecting it would fabricate a bogus `public.select`/`public.values`
        // key. A real (unquoted) table is never a SQL keyword, so both skip.
        ? M extends "lateral" | SqlKeyword
            ? CtWalk<R, S, Acc, true, InDelete, "", "", [any, ...Steps]>
            : CtWalk<R, S, Acc | TableKeyFromToken<M, S>, true, InDelete, "", "", [any, ...Steps]>
        : Mode extends "usingsrc"
            ? CtWalk<R, S, Acc | TableKeyFromToken<M, S>, true, InDelete, "", "", [any, ...Steps]>
            : Mode extends "upd"
                ? M extends "set"
                    ? CtWalk<R, S, Acc, false, InDelete, "", "", [any, ...Steps]>
                    : CtWalk<R, S, Acc | TableKeyFromToken<M, S>, true, InDelete, "", "", [any, ...Steps]>
                : Mode extends "del"
                    ? M extends "from"
                        ? CtWalk<R, S, Acc, false, true, "delfrom", "", [any, ...Steps]>
                        : CtNorm<M, R, S, Acc, false, true, Steps>
                    : Mode extends "delfrom"
                        ? CtWalk<R, S, Acc | TableKeyFromToken<M, S>, false, true, "", "", [any, ...Steps]>
                        : Mode extends "comma"
                            ? CtWalk<R, S, Acc, InList, InDelete, "commaeq", M, [any, ...Steps]>
                            : Mode extends "commaeq"
                                // A FROM-source name is never followed by `=`, so a
                                // comma whose candidate is followed by `=` is a
                                // SET-list separator: drop it and leave source-list
                                // mode. Otherwise collect the candidate and
                                // re-dispatch the current token in normal mode.
                                ? M extends "="
                                    ? CtWalk<R, S, Acc, false, InDelete, "", "", [any, ...Steps]>
                                    : CtNorm<M, R, S, Acc | TableKeyFromToken<Pend, S>, true, InDelete, Steps>
                                : // "dist": `IS [NOT] DISTINCT FROM` — the `from`
                                  // after `distinct` is operator text; drop it so
                                  // its RHS isn't mistaken for a table.
                                  M extends "from"
                                    ? CtWalk<R, S, Acc, false, InDelete, "", "", [any, ...Steps]>
                                    : CtNorm<M, R, S, Acc, false, InDelete, Steps>;

type CtNorm<
    M extends string,
    R extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InList extends boolean,
    InDelete extends boolean,
    Steps extends any[]
> = M extends "from" | "join" | "into"
    ? CtWalk<R, S, Acc, InList, InDelete, "src", "", [any, ...Steps]>
    : M extends "update"
        ? CtWalk<R, S, Acc, InList, InDelete, "upd", "", [any, ...Steps]>
        : M extends "delete"
            ? CtWalk<R, S, Acc, false, true, "del", "", [any, ...Steps]>
            : M extends "using"
                ? InDelete extends true
                    ? CtWalk<R, S, Acc, InList, InDelete, "usingsrc", "", [any, ...Steps]>
                    : CtWalk<R, S, Acc, InList, InDelete, "", "", [any, ...Steps]>
                : M extends CommaSep
                    ? InList extends true
                        ? CtWalk<R, S, Acc, InList, InDelete, "comma", "", [any, ...Steps]>
                        : CtWalk<R, S, Acc, false, InDelete, "", "", [any, ...Steps]>
                    : M extends "as"
                        ? CtWalk<R, S, Acc, InList, InDelete, "", "", [any, ...Steps]>
                        : M extends "distinct"
                            ? CtWalk<R, S, Acc, false, InDelete, "dist", "", [any, ...Steps]>
                            : M extends SqlKeyword
                                ? CtWalk<R, S, Acc, false, InDelete, "", "", [any, ...Steps]>
                                : CtWalk<R, S, Acc, InList, InDelete, "", "", [any, ...Steps]>;

// Final word (or capped remainder) as one token. Modes that would consume it as
// their armed lookahead apply their collection effect; everything else has no
// effect at end of stream (a trailing keyword never had a `Next` to act on in
// the old pairwise array match either).
type CtFinal<
    H extends string,
    S extends DatabaseSchema,
    Acc extends string,
    Mode extends string,
    Pend extends string
> = CollectorToken<H> extends infer M extends string
    ? M extends ""
        ? CtEnd<S, Acc, Mode, Pend>
        : Mode extends "src"
            ? M extends "lateral" | SqlKeyword
                ? Acc
                : Acc | TableKeyFromToken<M, S>
            : Mode extends "usingsrc" | "delfrom" | "comma"
                ? Acc | TableKeyFromToken<M, S>
                : Mode extends "upd"
                    ? M extends "set"
                        ? Acc
                        : Acc | TableKeyFromToken<M, S>
                    : Mode extends "commaeq"
                        ? M extends "="
                            ? Acc
                            : Acc | TableKeyFromToken<Pend, S>
                        : Acc
    : never;

// Stream ended on a dropped word: only a pending comma candidate still owes its
// collection (the old `[..., comma, cand]` tail collected `cand`).
type CtEnd<S extends DatabaseSchema, Acc extends string, Mode extends string, Pend extends string> =
    Mode extends "commaeq" ? Acc | TableKeyFromToken<Pend, S> : Acc;

// Collect aliases for tables in FROM/JOIN/UPDATE

// `InList`/`InDelete` mirror the tables walker. Additional registers: `TK` holds
// the table key of the source whose alias position we are in ("alias" mode = the
// old `ParseAliasSource` MaybeAlias position; "aliasname" = after its `as`), and
// `Pend` holds a comma candidate awaiting the `=` SET-list check.
type CaDrive<R, S extends DatabaseSchema, C extends any[] = []> =
    [R] extends [never]
        ? never
        : [R] extends [{ __c: [infer V extends string, infer Acc extends string, infer IL extends boolean, infer ID extends boolean, infer Mode extends string, infer TK extends string, infer Pend extends string] }]
        ? C["length"] extends 19
            ? CaFinal<V, S, Acc, ID, Mode, TK, Pend>
            : CaDrive<CaWalk<V, S, Acc, IL, ID, Mode, TK, Pend>, S, [any, ...C]>
        : R;

type CaWalk<
    V extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InList extends boolean,
    InDelete extends boolean,
    Mode extends string = "",
    TK extends string = never,
    Pend extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 100
    ? { __c: [V, Acc, InList, InDelete, Mode, TK, Pend] }
    : V extends `${infer H} ${infer R}`
        ? CollectorToken<H> extends infer M extends string
            ? M extends ""
                ? CaWalk<R, S, Acc, InList, InDelete, Mode, TK, Pend, [any, ...Steps]>
                : CaTok<M, R, S, Acc, InList, InDelete, Mode, TK, Pend, Steps>
            : never
        : CaFinal<V, S, Acc, InDelete, Mode, TK, Pend>;

type CaTok<
    M extends string,
    R extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InList extends boolean,
    InDelete extends boolean,
    Mode extends string,
    TK extends string,
    Pend extends string,
    Steps extends any[]
> = Mode extends ""
    ? CaNorm<M, R, S, Acc, InList, InDelete, Steps>
    : Mode extends "src"
        // Mirror the tables walker: skip `lateral` and keyword sources (a
        // parenthesised subquery/VALUES source must not register a garbage
        // alias from the keyword + the next token).
        ? M extends "lateral" | SqlKeyword
            ? CaWalk<R, S, Acc, true, InDelete, "", never, "", [any, ...Steps]>
            : CaEnterAlias<M, R, S, Acc, InDelete, Steps>
        : Mode extends "usingsrc"
            ? CaEnterAlias<M, R, S, Acc, InDelete, Steps>
            : Mode extends "alias"
                ? CaAliasTok<M, R, S, Acc, InDelete, TK, Steps>
                : Mode extends "aliasname"
                    ? CaWalk<R, S, Acc | AliasEntry<M, TK>, true, InDelete, "", never, "", [any, ...Steps]>
                    : Mode extends "comma"
                        ? CaWalk<R, S, Acc, InList, InDelete, "commaeq", never, M, [any, ...Steps]>
                        : Mode extends "commaeq"
                            // Mirror the tables walker: a comma whose candidate is
                            // followed by `=` is an UPDATE SET-list separator, not
                            // another aliased FROM source.
                            ? M extends "="
                                ? CaWalk<R, S, Acc, false, InDelete, "", never, "", [any, ...Steps]>
                                : TableKeyFromToken<Pend, S> extends infer TK2 extends string
                                    ? CaAliasTok<M, R, S, Acc, InDelete, TK2, Steps>
                                    : CaNorm<M, R, S, Acc, true, InDelete, Steps>
                            : // "dist": the `IS [NOT] DISTINCT FROM` operator
                              // `from` must not open an aliased source.
                              M extends "from"
                                ? CaWalk<R, S, Acc, false, InDelete, "", never, "", [any, ...Steps]>
                                : CaNorm<M, R, S, Acc, false, InDelete, Steps>;

// Enter the alias position for source token `M` (the old `ParseAliasSource`
// head: resolve the table key, then judge the next token as MaybeAlias).
type CaEnterAlias<
    M extends string,
    R extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InDelete extends boolean,
    Steps extends any[]
> = TableKeyFromToken<M, S> extends infer TK extends string
    ? CaWalk<R, S, Acc, true, InDelete, "alias", TK, "", [any, ...Steps]>
    : CaWalk<R, S, Acc, true, InDelete, "", never, "", [any, ...Steps]>;

// The MaybeAlias judgment (old `ParseAliasSource` body): `as` arms the explicit
// alias name; an immediate comma is the next source (no alias); inside a DELETE
// a following `using` opens the next table source rather than naming this one;
// a bare candidate (non-keyword) is the alias; any other keyword re-dispatches
// in normal mode with `InList` on.
type CaAliasTok<
    M extends string,
    R extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InDelete extends boolean,
    TK extends string,
    Steps extends any[]
> = M extends "as"
    ? CaWalk<R, S, Acc, true, InDelete, "aliasname", TK, "", [any, ...Steps]>
    : M extends CommaSep
        ? CaWalk<R, S, Acc, true, InDelete, "comma", never, "", [any, ...Steps]>
        : InDelete extends true
            ? M extends "using"
                ? CaWalk<R, S, Acc, true, InDelete, "usingsrc", never, "", [any, ...Steps]>
                : IsAliasCandidate<M> extends true
                    ? CaWalk<R, S, Acc | AliasEntry<M, TK>, true, InDelete, "", never, "", [any, ...Steps]>
                    : CaNorm<M, R, S, Acc, true, InDelete, Steps>
            : IsAliasCandidate<M> extends true
                ? CaWalk<R, S, Acc | AliasEntry<M, TK>, true, InDelete, "", never, "", [any, ...Steps]>
                : CaNorm<M, R, S, Acc, true, InDelete, Steps>;

type CaNorm<
    M extends string,
    R extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InList extends boolean,
    InDelete extends boolean,
    Steps extends any[]
> = M extends "from" | "join" | "update"
    ? CaWalk<R, S, Acc, InList, InDelete, "src", never, "", [any, ...Steps]>
    : M extends "using"
        ? InDelete extends true
            ? CaWalk<R, S, Acc, InList, InDelete, "usingsrc", never, "", [any, ...Steps]>
            : CaWalk<R, S, Acc, InList, InDelete, "", never, "", [any, ...Steps]>
        : M extends CommaSep
            ? InList extends true
                ? CaWalk<R, S, Acc, InList, InDelete, "comma", never, "", [any, ...Steps]>
                : CaWalk<R, S, Acc, false, InDelete, "", never, "", [any, ...Steps]>
            : M extends "as"
                ? CaWalk<R, S, Acc, InList, InDelete, "", never, "", [any, ...Steps]>
                : M extends "distinct"
                    ? CaWalk<R, S, Acc, false, InDelete, "dist", never, "", [any, ...Steps]>
                    : M extends SqlKeyword
                        ? CaWalk<R, S, Acc, false, InDelete, "", never, "", [any, ...Steps]>
                        : CaWalk<R, S, Acc, InList, InDelete, "", never, "", [any, ...Steps]>;

// Final word as one token. Only the alias-name positions still owe a recording;
// a bare source at end of stream has no alias to record (old `ParseAliasSource`
// with an empty Rest returned `Acc`).
type CaFinal<
    H extends string,
    S extends DatabaseSchema,
    Acc extends string,
    InDelete extends boolean,
    Mode extends string,
    TK extends string,
    Pend extends string
> = CollectorToken<H> extends infer M extends string
    ? M extends ""
        ? Acc
        : Mode extends "alias"
            ? CaAliasFinal<M, Acc, InDelete, TK>
            : Mode extends "aliasname"
                ? Acc | AliasEntry<M, TK>
                : Mode extends "commaeq"
                    ? M extends "="
                        ? Acc
                        : TableKeyFromToken<Pend, S> extends infer TK2 extends string
                            ? CaAliasFinal<M, Acc, InDelete, TK2>
                            : Acc
                    : Acc
    : never;

type CaAliasFinal<M extends string, Acc extends string, InDelete extends boolean, TK extends string> =
    M extends "as" | CommaSep
        ? Acc
        : InDelete extends true
            ? M extends "using"
                ? Acc
                : IsAliasCandidate<M> extends true
                    ? Acc | AliasEntry<M, TK>
                    : Acc
            : IsAliasCandidate<M> extends true
                ? Acc | AliasEntry<M, TK>
                : Acc;

// Outer-join nullability
//
// A column drawn from a relation on the OUTER side of a join can be NULL even
// when its declared schema type is non-nullable: a LEFT JOIN's right table may
// have no matching row, a RIGHT JOIN's left tables may have none, and a FULL
// JOIN's rows may be missing on either side. `NullableRelations` returns the set
// of *reference qualifiers* (the alias each relation is referenced by, or its
// table name when unaliased) that are nullable for this reason; the projection
// path unions `| null` onto any directly-projected column qualified by one of
// them. Keying by qualifier (not table key) is what lets a self-join
// (`users u ... left join users m`) nullablize only the outer alias `m`, not the
// base `u`. INNER/CROSS joins and the leading FROM source contribute nothing.
// (Limitation: an UNqualified projected column from an outer-joined relation is
// not nullablized, since it carries no qualifier to match.)
export type NullableRelations<N extends string, S extends DatabaseSchema> =
    CnDrive<CnWalk<CollectorScanView<N>, "none", never, never>>;

// `Mod` is the pending join modifier ("left"/"right"/"full"/"none"); `Left` is
// the set of qualifiers accumulated so far (the left side of any later join);
// `Acc` is the nullable-qualifier accumulator. `outer` is noise (keeps `Mod`);
// `inner`/`cross` reset `Mod` to "none". On a `join <table>`: LEFT adds the
// joined relation; RIGHT adds the accumulated left side; FULL adds both.
//
// Modes: "nsrc-f"/"nsrc-j" = saw from|into / join (next token is the relation,
// stored in `Tbl`); "qual-f"/"qual-j" = peeking at the token after the relation
// to pick its qualifier (alias if a candidate follows, else the table name —
// the old `SourceQualifier` lookahead, which did NOT consume those tokens: the
// peeked token is re-dispatched in normal mode after the qualifier applies);
// "qualas-f"/"qualas-j" = the peek saw `as`, the next token is the alias name.
type CnDrive<R, C extends any[] = []> =
    [R] extends [never]
        ? never
        : [R] extends [{ __c: [infer V extends string, infer Mod extends string, infer Left extends string, infer Acc extends string, infer Mode extends string, infer Tbl extends string] }]
        ? C["length"] extends 19
            ? CnFinal<V, Mod, Left, Acc, Mode, Tbl>
            : CnDrive<CnWalk<V, Mod, Left, Acc, Mode, Tbl>, [any, ...C]>
        : R;

type CnWalk<
    V extends string,
    Mod extends string,
    Left extends string,
    Acc extends string,
    Mode extends string = "",
    Tbl extends string = "",
    Steps extends any[] = []
> = Steps["length"] extends 100
    ? { __c: [V, Mod, Left, Acc, Mode, Tbl] }
    : V extends `${infer H} ${infer R}`
        ? CollectorToken<H> extends infer M extends string
            ? M extends ""
                ? CnWalk<R, Mod, Left, Acc, Mode, Tbl, [any, ...Steps]>
                : CnTok<M, R, Mod, Left, Acc, Mode, Tbl, Steps>
            : never
        : CnFinal<V, Mod, Left, Acc, Mode, Tbl>;

type CnTok<
    M extends string,
    R extends string,
    Mod extends string,
    Left extends string,
    Acc extends string,
    Mode extends string,
    Tbl extends string,
    Steps extends any[]
> = Mode extends ""
    ? CnNorm<M, R, Mod, Left, Acc, Steps>
    : Mode extends "nsrc-f"
        ? CnWalk<R, Mod, Left, Acc, "qual-f", M, [any, ...Steps]>
        : Mode extends "nsrc-j"
            ? CnWalk<R, Mod, Left, Acc, "qual-j", M, [any, ...Steps]>
            : Mode extends "qual-f"
                ? M extends "as"
                    ? CnWalk<R, Mod, Left, Acc, "qualas-f", Tbl, [any, ...Steps]>
                    : CnQualPick<M, Tbl> extends infer Q extends string
                        ? CnNorm<M, R, "none", Left | Q, Acc, Steps>
                        : never
                : Mode extends "qual-j"
                    ? M extends "as"
                        ? CnWalk<R, Mod, Left, Acc, "qualas-j", Tbl, [any, ...Steps]>
                        : CnQualPick<M, Tbl> extends infer Q extends string
                            ? CnNorm<M, R, "none", Left | Q, CnJoinAcc<Mod, Left, Acc, Q>, Steps>
                            : never
                    : Mode extends "qualas-f"
                        ? CleanIdent<M> extends infer Q extends string
                            ? CnNorm<M, R, "none", Left | Q, Acc, Steps>
                            : never
                        : // "qualas-j"
                          CleanIdent<M> extends infer Q extends string
                            ? CnNorm<M, R, "none", Left | Q, CnJoinAcc<Mod, Left, Acc, Q>, Steps>
                            : never;

// The qualifier a relation is referenced by in projections: its alias when one
// is present, else the (cleaned) table name. A following keyword (`on`,
// `where`, another `join`, ...) is not an alias.
type CnQualPick<M extends string, Tbl extends string> =
    IsAliasCandidate<M> extends true ? CleanIdent<M> : CleanIdent<Tbl>;

// A real relation qualifier is always a string LITERAL (`CleanIdent` lowercases
// it, so the wide form a hole-degraded token takes is `Lowercase<string>`, NOT
// plain `string`). `DropStr` removes every non-literal wide form while keeping
// each literal alias, distributing over the union (`"click" | Lowercase<string>`
// → `"click"`). Without it, a `${string}` interpolation hole in a projection can
// widen the remaining-query token at a chunk-yield boundary, the driver re-walks
// a wide string, and `CleanIdent<string>` = `Lowercase<string>` enters the
// nullable set. Being a supertype of every alias, it then makes `ApplyJoinNull`
// nullablize EVERY plain column ref — even the non-nullable FROM source. The
// sibling `CtDrive` (TablesInQuery) guards the same poison; see its never-guard.
type DropStr<T extends string> =
    T extends infer U extends string
        ? (string extends U ? never
            : Lowercase<string> extends U ? never
            : Uppercase<string> extends U ? never
            : U)
        : never;

// `Acc | Left` for RIGHT uses the PRE-join `Left` (the joined relation itself
// is not nullablized by its own RIGHT join), exactly like the old arms. Each
// qualifier contribution is `DropStr`-guarded so an interpolation-hole-degraded
// `string` token can never poison the whole nullable set.
type CnJoinAcc<Mod extends string, Left extends string, Acc extends string, Q extends string> =
    Mod extends "left"
        ? Acc | DropStr<Q>
        : Mod extends "right"
            ? Acc | DropStr<Left>
            : Mod extends "full"
                ? Acc | DropStr<Left> | DropStr<Q>
                : Acc;

type CnNorm<
    M extends string,
    R extends string,
    Mod extends string,
    Left extends string,
    Acc extends string,
    Steps extends any[]
> = M extends "left" | "right" | "full"
    ? CnWalk<R, M, Left, Acc, "", "", [any, ...Steps]>
    : M extends "inner" | "cross"
        ? CnWalk<R, "none", Left, Acc, "", "", [any, ...Steps]>
        : M extends "outer"
            ? CnWalk<R, Mod, Left, Acc, "", "", [any, ...Steps]>
            : M extends "from" | "into"
                ? CnWalk<R, Mod, Left, Acc, "nsrc-f", "", [any, ...Steps]>
                : M extends "join"
                    ? CnWalk<R, Mod, Left, Acc, "nsrc-j", "", [any, ...Steps]>
                    : CnWalk<R, Mod, Left, Acc, "", "", [any, ...Steps]>;

// Final word as one token: a join relation (or its qualifier peek) at end of
// stream still applies its nullability effect; from-kind effects only update
// `Left`, which is dead at end of stream.
type CnFinal<
    H extends string,
    Mod extends string,
    Left extends string,
    Acc extends string,
    Mode extends string,
    Tbl extends string
> = CollectorToken<H> extends infer M extends string
    ? M extends ""
        ? CnEnd<Mod, Left, Acc, Mode, Tbl>
        : Mode extends "nsrc-j"
            ? CnJoinAcc<Mod, Left, Acc, CleanIdent<M>>
            : Mode extends "qual-j"
                ? M extends "as"
                    ? CnJoinAcc<Mod, Left, Acc, CleanIdent<Tbl>>
                    : CnJoinAcc<Mod, Left, Acc, CnQualPick<M, Tbl>>
                : Mode extends "qualas-j"
                    ? CnJoinAcc<Mod, Left, Acc, CleanIdent<M>>
                    : Acc
    : never;

type CnEnd<Mod extends string, Left extends string, Acc extends string, Mode extends string, Tbl extends string> =
    Mode extends "qual-j" | "qualas-j"
        ? CnJoinAcc<Mod, Left, Acc, CleanIdent<Tbl>>
        : Acc;

// Table lookup after a keyword

// Early-terminating word scan: resolves the token after the FIRST `Keyword`
// token and stops — it never walks the rest of the query.
type TableAfterScan<V extends string, Keyword extends string, S extends DatabaseSchema> =
    TaDrive<TaWalk<V, Keyword, S>, Keyword, S>;

type TaDrive<R, Keyword extends string, S extends DatabaseSchema, C extends any[] = []> =
    [R] extends [never]
        ? never
        : [R] extends [{ __c: [infer V extends string, infer Found extends boolean] }]
        ? C["length"] extends 19
            ? TaFinal<V, S, Found>
            : TaDrive<TaWalk<V, Keyword, S, Found>, Keyword, S, [any, ...C]>
        : R;

type TaWalk<
    V extends string,
    Keyword extends string,
    S extends DatabaseSchema,
    Found extends boolean = false,
    Steps extends any[] = []
> = Steps["length"] extends 100
    ? { __c: [V, Found] }
    : V extends `${infer H} ${infer R}`
        ? CollectorToken<H> extends infer M extends string
            ? M extends ""
                ? TaWalk<R, Keyword, S, Found, [any, ...Steps]>
                : Found extends true
                    ? TableKeyFromToken<M, S>
                    : M extends Keyword
                        ? TaWalk<R, Keyword, S, true, [any, ...Steps]>
                        : TaWalk<R, Keyword, S, false, [any, ...Steps]>
            : never
        : TaFinal<V, S, Found>;

type TaFinal<H extends string, S extends DatabaseSchema, Found extends boolean> =
    Found extends true
        ? CollectorToken<H> extends infer M extends string
            ? M extends ""
                ? never
                : TableKeyFromToken<M, S>
            : never
        : never;

// Aliases

export type AliasEntry<Alias extends string, TableKey extends string> = `${CleanIdent<Alias>}=>${TableKey}`;

export type IsAliasCandidate<Token extends string> =
    Token extends "" ? false :
    Token extends SqlKeyword ? false :
    true;

export type AliasNames<Aliases extends string> =
    Aliases extends `${infer A}=>${string}` ? A : never;

export type IsAliasName<Token extends string, Aliases extends string> =
    Token extends AliasNames<Aliases> ? true : false;
