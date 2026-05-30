import type { DatabaseSchema, NormalizeTableKey, TableExists } from "./schema.js";
import type { CleanIdent, SplitOnDotClean, SqlKeyword, Tokenize } from "./parsing.js";

// Table and alias extraction

export type TablesInQuery<N extends string, S extends DatabaseSchema> =
    CollectTables<Tokenize<N>, S>;

export type AliasesInQuery<N extends string, S extends DatabaseSchema> =
    CollectAliases<Tokenize<N>, S>;

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

export type CollectTables<Tokens extends string[], S extends DatabaseSchema, Acc extends string = never> =
    Tokens extends [infer T extends string, infer Next extends string, ...infer Rest extends string[]]
        ? T extends "from" | "join" | "update" | "into"
            ? T extends "update"
                ? Next extends "set"
                    ? CollectTables<Rest, S, Acc>
                    : CollectTables<Rest, S, Acc | TableKeyFromToken<Next, S>>
                : CollectTables<Rest, S, Acc | TableKeyFromToken<Next, S>>
            : T extends "delete"
                ? Next extends "from"
                    ? Rest extends [infer DelTable extends string, ...infer Rest2 extends string[]]
                        ? CollectTables<Rest2, S, Acc | TableKeyFromToken<DelTable, S>>
                        : Acc
                    : CollectTables<[Next, ...Rest], S, Acc>
                : CollectTables<[Next, ...Rest], S, Acc>
        : Acc;

// Collect aliases for tables in FROM/JOIN/UPDATE

export type CollectAliases<Tokens extends string[], S extends DatabaseSchema, Acc extends string = never> =
    Tokens extends [infer T extends string, infer Next extends string, ...infer Rest extends string[]]
        ? T extends "from" | "join" | "update"
            ? TableKeyFromToken<Next, S> extends infer TableKey extends string
                ? Rest extends [infer MaybeAlias extends string, ...infer Rest2 extends string[]]
                    ? MaybeAlias extends "as"
                        ? Rest2 extends [infer Alias extends string, ...infer Rest3 extends string[]]
                            ? CollectAliases<Rest3, S, Acc | AliasEntry<Alias, TableKey>>
                            : Acc
                        : IsAliasCandidate<MaybeAlias> extends true
                            ? CollectAliases<Rest2, S, Acc | AliasEntry<MaybeAlias, TableKey>>
                            : CollectAliases<Rest, S, Acc>
                    : Acc
                : CollectAliases<Rest, S, Acc>
            : CollectAliases<[Next, ...Rest], S, Acc>
        : Acc;

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
