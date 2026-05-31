import type { DatabaseSchema, NormalizeTableKey, TableExists } from "./schema.js";
import type { CleanIdent, CommaSep, SplitOnDotClean, SqlKeyword, Tokenize, TokenizeTables } from "./parsing.js";

// Table and alias extraction

export type TablesInQuery<N extends string, S extends DatabaseSchema> =
    CollectTables<TokenizeTables<N>, S, never, false, N extends `delete ${string}` ? true : false>;

export type AliasesInQuery<N extends string, S extends DatabaseSchema> =
    CollectAliases<TokenizeTables<N>, S, never, false, N extends `delete ${string}` ? true : false>;

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

export type InsertTargetTable<N extends string, S extends DatabaseSchema> =
    TableAfter<Tokenize<N>, "into", S>;

export type UpdateTargetTable<N extends string, S extends DatabaseSchema> =
    TableAfter<Tokenize<N>, "update", S>;

export type DeleteTargetTable<N extends string, S extends DatabaseSchema> =
    TableAfter<Tokenize<N>, "from", S>;

// Collect tables by keyword

// `InList` tracks whether we are inside a FROM-source list, so a TOP-LEVEL comma
// (preserved as a `,` token by `TokenizeTables`) introduces ANOTHER table source
// — the ANSI comma cross-join `from a, b`. The flag is turned on after a
// `from`/`join`/`into`/`update` source and off at the next clause keyword, so
// commas in the SELECT list / GROUP BY / ORDER BY / value tuples are ignored.
//
// `InDelete` marks that we are inside a DELETE statement, where `USING` is a
// table-source clause (`DELETE FROM a USING b, c`) — collected like FROM/JOIN.
// `USING` in a SELECT (the JOIN ... USING (cols) join condition) is NOT a table
// source, so the branch is gated: outside a DELETE, `using` is skipped as before.
export type CollectTables<
    Tokens extends string[],
    S extends DatabaseSchema,
    Acc extends string = never,
    InList extends boolean = false,
    InDelete extends boolean = false
> =
    Tokens extends [infer T extends string, infer Next extends string, ...infer Rest extends string[]]
        ? T extends "from" | "join" | "into"
            ? CollectTables<Rest, S, Acc | TableKeyFromToken<Next, S>, true, InDelete>
            : T extends "update"
                ? Next extends "set"
                    ? CollectTables<Rest, S, Acc, false, InDelete>
                    : CollectTables<Rest, S, Acc | TableKeyFromToken<Next, S>, true, InDelete>
                : T extends "delete"
                    ? Next extends "from"
                        ? Rest extends [infer DelTable extends string, ...infer Rest2 extends string[]]
                            ? CollectTables<Rest2, S, Acc | TableKeyFromToken<DelTable, S>, false, true>
                            : Acc
                        : CollectTables<[Next, ...Rest], S, Acc, false, true>
                    : T extends "using"
                        ? InDelete extends true
                            ? CollectTables<Rest, S, Acc | TableKeyFromToken<Next, S>, true, InDelete>
                            : CollectTables<[Next, ...Rest], S, Acc, InList, InDelete>
                        : T extends CommaSep
                            ? InList extends true
                                ? CollectTables<Rest, S, Acc | TableKeyFromToken<Next, S>, true, InDelete>
                                : CollectTables<[Next, ...Rest], S, Acc, false, InDelete>
                            : T extends "as"
                                ? CollectTables<[Next, ...Rest], S, Acc, InList, InDelete>
                                // `IS [NOT] DISTINCT FROM` is a comparison
                                // operator, not a FROM clause: the `from` after
                                // `distinct` must NOT be collected as a table
                                // source. Drop the operator `from` (process
                                // `Rest`) so its RHS isn't mistaken for a table.
                                : T extends "distinct"
                                    ? Next extends "from"
                                        ? CollectTables<Rest, S, Acc, false, InDelete>
                                        : CollectTables<[Next, ...Rest], S, Acc, false, InDelete>
                                    : T extends SqlKeyword
                                        ? CollectTables<[Next, ...Rest], S, Acc, false, InDelete>
                                        : CollectTables<[Next, ...Rest], S, Acc, InList, InDelete>
        : Acc;

// Collect aliases for tables in FROM/JOIN/UPDATE

// `InList` mirrors `CollectTables`: after a `from`/`join`/`update` source, a
// top-level `,` introduces another aliased source (`from users u, orders o`).
// `InDelete` likewise mirrors `CollectTables`: inside a DELETE, `USING` opens an
// aliased table source (`DELETE FROM a USING users u`); outside one it is left
// alone (the JOIN ... USING (cols) join condition is not a source).
export type CollectAliases<
    Tokens extends string[],
    S extends DatabaseSchema,
    Acc extends string = never,
    InList extends boolean = false,
    InDelete extends boolean = false
> =
    Tokens extends [infer T extends string, infer Next extends string, ...infer Rest extends string[]]
        ? T extends "from" | "join" | "update"
            ? ParseAliasSource<Next, Rest, S, Acc, InDelete>
            : T extends "using"
                ? InDelete extends true
                    ? ParseAliasSource<Next, Rest, S, Acc, InDelete>
                    : CollectAliases<[Next, ...Rest], S, Acc, InList, InDelete>
                : T extends CommaSep
                    ? InList extends true
                        ? ParseAliasSource<Next, Rest, S, Acc, InDelete>
                        : CollectAliases<[Next, ...Rest], S, Acc, false, InDelete>
                    : T extends "as"
                        ? CollectAliases<[Next, ...Rest], S, Acc, InList, InDelete>
                        // `IS [NOT] DISTINCT FROM`: the operator `from` is not a
                        // table source, so it must not open an aliased source.
                        : T extends "distinct"
                            ? Next extends "from"
                                ? CollectAliases<Rest, S, Acc, false, InDelete>
                                : CollectAliases<[Next, ...Rest], S, Acc, false, InDelete>
                            : T extends SqlKeyword
                                ? CollectAliases<[Next, ...Rest], S, Acc, false, InDelete>
                                : CollectAliases<[Next, ...Rest], S, Acc, InList, InDelete>
        : Acc;

// Parse a single table source (`Next`) plus its optional alias from the tokens
// that follow it (`Rest`), record the alias, then continue collecting with
// `InList=true` so a subsequent top-level comma is recognized as another source.
// An immediate `,` after the table (no alias) is handed back to `CollectAliases`
// rather than mistaken for an alias.
export type ParseAliasSource<
    Next extends string,
    Rest extends string[],
    S extends DatabaseSchema,
    Acc extends string,
    InDelete extends boolean = false
> =
    TableKeyFromToken<Next, S> extends infer TableKey extends string
        ? Rest extends [infer MaybeAlias extends string, ...infer Rest2 extends string[]]
            ? MaybeAlias extends "as"
                ? Rest2 extends [infer Alias extends string, ...infer Rest3 extends string[]]
                    ? CollectAliases<Rest3, S, Acc | AliasEntry<Alias, TableKey>, true, InDelete>
                    : Acc
                : MaybeAlias extends CommaSep
                    ? CollectAliases<Rest, S, Acc, true, InDelete>
                    // Inside a DELETE, a following `using` is not this source's
                    // alias — it opens the next table source. Hand it back so
                    // `CollectAliases` processes the USING clause.
                    : InDelete extends true
                        ? MaybeAlias extends "using"
                            ? CollectAliases<Rest, S, Acc, true, InDelete>
                            : IsAliasCandidate<MaybeAlias> extends true
                                ? CollectAliases<Rest2, S, Acc | AliasEntry<MaybeAlias, TableKey>, true, InDelete>
                                : CollectAliases<Rest, S, Acc, true, InDelete>
                        : IsAliasCandidate<MaybeAlias> extends true
                            ? CollectAliases<Rest2, S, Acc | AliasEntry<MaybeAlias, TableKey>, true, InDelete>
                            : CollectAliases<Rest, S, Acc, true, InDelete>
            : Acc
        : CollectAliases<Rest, S, Acc, true, InDelete>;

// Table lookup after a keyword

export type TableAfter<Tokens extends string[], Keyword extends string, S extends DatabaseSchema> =
    Tokens extends [infer T extends string, infer Next extends string, ...infer Rest extends string[]]
        ? T extends Keyword
            ? TableKeyFromToken<Next, S>
            : TableAfter<[Next, ...Rest], Keyword, S>
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
