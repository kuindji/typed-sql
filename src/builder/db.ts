// src/builder/db.ts
import type { DatabaseSchema } from "../schema.js";
import type { GetReturnType, ValidateSQL } from "../index.js";
import type {
    ValidateFromPart,
    ValidateJoinPart,
} from "../index.js";
import type {
    ValidateClausePartScoped,
    ValidateSelectIdentifiersScoped,
} from "../partial.js";
import type { SelectQueryBuilder } from "./select.js";
import type { BuilderReturnType, BuilderSQL } from "./return-type.js";
import type { Frag, SelFrag, SqlTag } from "./sql-tag.js";
import type { NormalizeQuery } from "../parsing.js";
import type { TablesInQuery, AliasesInQuery } from "../tables.js";

type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** String-query validity (core). */
export type ValidQuery<Q extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Q, Schema> extends infer V
        ? V extends true ? Q : `[SQL Error] ${V & string}`
        : never;

// --- per-fragment validation over LITERAL fragments only ---
// A fragment whose text is non-literal `string` is skipped (→ never error).
// The partial validators return `true` (valid OR out-of-scope/skipped) or a
// boolean `false` (a reference resolvable WITHIN the fragment that does not
// exist). Treat any non-`true` verdict as an error: a `string` verdict is used
// as-is (future-proofing for descriptive messages), and a `false` verdict
// becomes a labeled "invalid <clause> fragment" error carrying the text.
type FragErr<Verdict, Label extends string, Text extends string> =
    Verdict extends true ? never
    : Verdict extends string ? Verdict
    : `invalid ${Label} fragment: ${Text}`;

// Join all literal select-fragment texts into one comma list; bail to `string`
// if any fragment text is non-literal (the dispatch already allow-unknowns that).
type SelectListText<List extends readonly SelFrag[], Acc extends string = ""> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? string extends H["text"]
            ? string
            : SelectListText<R, Acc extends "" ? H["text"] : `${Acc}, ${H["text"]}`>
        : Acc;

type SelectErrors<List extends readonly SelFrag[], Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    SelectListText<List> extends infer Txt extends string
        ? string extends Txt
            ? never
            : FragErr<ValidateSelectIdentifiersScoped<Txt, Tables, Aliases, S>, "SELECT", Txt>
        : never;

type FromError<From extends string | null, S extends DatabaseSchema> =
    From extends null ? never
    : string extends (From & string) ? never
    : FragErr<ValidateFromPart<From & string, S>, "FROM", From & string>;

type JoinErrors<List extends readonly Frag[], S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateJoinPart<H["text"], S>, "JOIN", H["text"]>)
            | JoinErrors<R, S>
        : never;

type WhereErrors<List extends readonly Frag[], Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateClausePartScoped<H["text"], Tables, Aliases, S>, "WHERE", H["text"]>)
            | WhereErrors<R, Tables, Aliases, S>
        : never;

type GroupErrors<List extends readonly Frag[], Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateClausePartScoped<H["text"], Tables, Aliases, S>, "GROUP BY", H["text"]>)
            | GroupErrors<R, Tables, Aliases, S>
        : never;

type HavingErrors<List extends readonly Frag[], Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateClausePartScoped<H["text"], Tables, Aliases, S>, "HAVING", H["text"]>)
            | HavingErrors<R, Tables, Aliases, S>
        : never;

type OrderErrors<List extends readonly Frag[], Tables extends string, Aliases extends string, S extends DatabaseSchema> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? (string extends H["text"] ? never : FragErr<ValidateClausePartScoped<H["text"], Tables, Aliases, S>, "ORDER BY", H["text"]>)
            | OrderErrors<R, Tables, Aliases, S>
        : never;

// Concatenate the join fragment texts into one string. Each fragment is
// prefixed with a ` join ` keyword so the whole-query table/alias collectors
// recognise it as a JOIN source. Builder join texts MAY omit the leading keyword
// (e.g. "Other o2 on o2.id = o.id") — without the prefix the collector reads the
// join table as a stray token and never records its alias. When the text ALREADY
// carries a keyword (e.g. "left join Other o2 on ..."), the extra ` join ` is a
// harmless structural sentinel: the spurious `join left`/`join join` cycle
// resolves no real table (→ no-op) and the genuine keyword still collects the
// table/alias correctly.
type JoinSourceText<List extends readonly Frag[]> =
    List extends readonly [infer H extends Frag, ...infer R extends readonly Frag[]]
        ? ` join ${H["text"]}${JoinSourceText<R>}`
        : "";

// Build a from-clause-shaped string from the FROM text + all JOIN texts, so the
// existing whole-query collectors can read the full table scope. `null` FROM
// (or a non-literal `string` FROM) yields "" → empty scope (everything skipped).
type ScopeSourceText<Sql extends SqlTag> =
    Sql["from"] extends null
        ? ""
        : string extends (Sql["from"] & string)
            ? ""
            : `from ${Sql["from"] & string}${JoinSourceText<Sql["joins"]>}`;

// Table keys in scope (union of `schema.table`), via the depth-safe collector.
export type ScopeTables<Sql extends SqlTag, S extends DatabaseSchema> =
    ScopeSourceText<Sql> extends infer N extends string
        ? N extends "" ? never : TablesInQuery<NormalizeQuery<N>, S>
        : never;

// Alias→key entries in scope, via the depth-safe collector.
export type ScopeAliases<Sql extends SqlTag, S extends DatabaseSchema> =
    ScopeSourceText<Sql> extends infer N extends string
        ? N extends "" ? never : AliasesInQuery<NormalizeQuery<N>, S>
        : never;

// One-time budget tuple of length N (a constant; instantiated once per N).
type MkBudget<N extends number, Acc extends any[] = []> =
    Acc["length"] extends N ? Acc : MkBudget<N, [any, ...Acc]>;

// Char-length threshold below which the precise whole-query ValidateSQL is safe
// to run. Tunable: raise toward where the whole-query pass starts blowing,
// lower if a query under it still blows.
type SqlSizeThreshold = MkBudget<600>;

// Walk S against the budget. As soon as chars remain with the budget exhausted,
// the query is "large" (false). Cost is bounded by the threshold (early-exit),
// not by the query length.
type LenWithin<S extends string, Budget extends any[]> =
    S extends `${infer _C}${infer Tail}`
        ? Budget extends [any, ...infer Rest extends any[]]
            ? LenWithin<Tail, Rest>
            : false
        : true;

// True = small enough for the precise whole-query pass.
export type BuilderSqlSmall<SQL extends string> =
    string extends SQL ? false : LenWithin<SQL, SqlSizeThreshold>;

/** Per-fragment errors over the literal fragments of B's Sql tag. */
export type FragmentErrors<B, Schema extends DatabaseSchema> =
    B extends SelectQueryBuilder<Schema, infer Sql extends SqlTag>
        ? ScopeTables<Sql, Schema> extends infer Tbls extends string
            ? ScopeAliases<Sql, Schema> extends infer Als extends string
                ? (
                    | SelectErrors<Sql["selects"], Tbls, Als, Schema>
                    | FromError<Sql["from"], Schema>
                    | JoinErrors<Sql["joins"], Schema>
                    | WhereErrors<Sql["wheres"], Tbls, Als, Schema>
                    | GroupErrors<Sql["groupBys"], Tbls, Als, Schema>
                    | HavingErrors<Sql["havings"], Tbls, Als, Schema>
                    | OrderErrors<Sql["orderBys"], Tbls, Als, Schema>
                ) extends infer E
                    ? [E] extends [never] ? [] : (E & string)[]
                    : []
                : []
            : []
        : [];

/**
 * Builder validity: per-fragment literal errors first; else whole-query check
 * with allow-unknown when the assembled SQL is non-literal `string`.
 */
export type ValidQueryBuilder<Schema extends DatabaseSchema, B extends SelectQueryBuilder<Schema, any>> =
    FragmentErrors<B, Schema> extends []
        ? BuilderSQL<B> extends infer SQL extends string
            ? string extends SQL
                ? B // some fragment text non-literal → allow, untyped
                : BuilderSqlSmall<SQL> extends true
                    ? ValidateSQL<SQL, Schema> extends true
                        ? B
                        : `[SQL Error] ${Extract<ValidateSQL<SQL, Schema>, string>}`
                    : B // large query: rely on scope-aware FragmentErrors (depth-safe)
            : B
        : `[SQL Error] ${FragmentErrors<B, Schema>[number]}`;

export type SelectResult<SQL extends string, Schema extends DatabaseSchema> =
    Prettify<GetReturnType<SQL, Schema>>;
export type SelectResultArray<SQL extends string, Schema extends DatabaseSchema> =
    Prettify<GetReturnType<SQL, Schema>>[];

type InvalidOverrideKeys<Result, Overrides> = Exclude<keyof Overrides, keyof Result>;

export type MergeOverrides<Result, Overrides> = keyof Overrides extends never
    ? Result
    : InvalidOverrideKeys<Result, Overrides> extends never
        ? Prettify<Omit<Result, keyof Overrides> & Overrides>
        : {
            __error: true;
            message: `Override contains keys not in result type: ${InvalidOverrideKeys<Result, Overrides> & string}`;
        };

export type SelectBuilderResult<B extends SelectQueryBuilder<any, any>> =
    Prettify<BuilderReturnType<B>>;
export type SelectBuilderResultArray<B extends SelectQueryBuilder<any, any>> =
    SelectBuilderResult<B>[];

export type QueryHandler = (query: string, params?: unknown[]) => unknown;

export type IsValidSelect<SQL extends string, Schema extends DatabaseSchema> =
    ValidateSQL<SQL, Schema> extends true ? true : false;

export function createSelectFn<
    Schema extends DatabaseSchema,
    Overrides extends Record<string, unknown> = {},
>(handler: QueryHandler) {
    // String query overload
    function select<Q extends string>(
        query: ValidQuery<Q, Schema>,
        params?: unknown[],
    ): Promise<MergeOverrides<SelectResultArray<Q, Schema>[number], Overrides>[]>;

    // Typed builder overload
    function select<B extends SelectQueryBuilder<Schema, any>>(
        query: ValidQueryBuilder<Schema, B>,
        params?: unknown[],
    ): Promise<MergeOverrides<SelectBuilderResult<B>, Overrides>[]>;

    function select(
        query: ValidQuery<string, Schema> | SelectQueryBuilder<Schema, any>,
        params?: unknown[],
    ) {
        if (typeof query === "string") {
            return handler(query, params) as Promise<any>;
        }
        const sql = query.toString();
        const finalParams = params ?? [...query.getParams()];
        return handler(sql, finalParams) as Promise<any>;
    }

    return select;
}
