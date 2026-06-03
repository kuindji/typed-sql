// src/builder/return-type.ts
import type { DatabaseSchema } from "../schema.js";
import type { GetReturnType } from "../index.js";
import type { BuildSQL, SqlTag, SelFrag } from "./sql-tag.js";

/** Type-level canonical SQL: the maximal query (all select fragments present). */
export type BuilderSQLFor<Sql extends SqlTag> = BuildSQL<Sql, "max">;

/** True iff some select fragment is unconditional. */
type HasUncond<List extends readonly SelFrag[]> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? H["cond"] extends false ? true : HasUncond<R>
        : false;

/** True iff NO select fragment is conditional (req-list === max-list). */
type AllUncond<List extends readonly SelFrag[]> =
    List extends readonly [infer H extends SelFrag, ...infer R extends readonly SelFrag[]]
        ? H["cond"] extends false ? AllUncond<R> : false
        : true;

// Merge a "required" row and a "max" row into the partition:
//   keys in ReqRow are required; keys only in Row are optional.
type Partition<Row, ReqRow> =
    & { [K in keyof Row as K extends keyof ReqRow ? K : never]: Row[K] }
    & { [K in keyof Row as K extends keyof ReqRow ? never : K]?: Row[K] };

/**
 * Required/optional partition over GetReturnType of MaxSQL / ReqSQL / ScopeSQL.
 * - allUncond: every selected column is unconditional, so the req-list and the
 *   max-list are identical and every key is required. Skip the second parse and
 *   the Partition entirely — both are pure overhead here, and parsing a very
 *   wide SELECT twice can cross TS's instantiation limit (TS2589).
 * - hasUncond (but some conditional): Row = GetReturnType<MaxSQL>;
 *   ReqRow = GetReturnType<ReqSQL>; partition keys: required iff in ReqRow.
 * - else (no unconditional select → all-false runtime path is SELECT *):
 *   Partial<GetReturnType<MaxSQL> & GetReturnType<ScopeSQL>>.
 */
export type BuilderReturnTypeFor<Schema extends DatabaseSchema, Sql extends SqlTag> =
    HasUncond<Sql["selects"]> extends true
        ? AllUncond<Sql["selects"]> extends true
            ? GetReturnType<BuildSQL<Sql, "max">, Schema>
            : GetReturnType<BuildSQL<Sql, "max">, Schema> extends infer Row
                ? GetReturnType<BuildSQL<Sql, "req">, Schema> extends infer ReqRow
                    ? Partition<Row, ReqRow>
                    : Row
                : {}
        : Partial<
            & GetReturnType<BuildSQL<Sql, "max">, Schema>
            & GetReturnType<BuildSQL<Sql, "scope">, Schema>
        >;

/** Brand carried by toBrandedString(); not used at runtime. */
export interface BuilderResultBrand<Schema extends DatabaseSchema, Sql extends SqlTag> {
    readonly __schema?: Schema;
    readonly __sql?: Sql;
}

// --- B-keyed public aliases (extract Schema/Sql from a builder type) ---
import type { SelectQueryBuilder } from "./select.js";

/** Extract the Sql tag from a builder type. */
export type SqlOf<B> = B extends SelectQueryBuilder<any, infer Sql extends SqlTag> ? Sql : never;
type SchemaOf<B> = B extends SelectQueryBuilder<infer S extends DatabaseSchema, any> ? S : never;

export type BuilderSQL<B> = BuilderSQLFor<SqlOf<B>>;
export type BuilderReturnType<B> = BuilderReturnTypeFor<SchemaOf<B>, SqlOf<B>>;
