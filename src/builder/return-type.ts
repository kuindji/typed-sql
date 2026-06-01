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

// Merge a "required" row and a "max" row into the partition:
//   keys in ReqRow are required; keys only in Row are optional.
type Partition<Row, ReqRow> =
    & { [K in keyof Row as K extends keyof ReqRow ? K : never]: Row[K] }
    & { [K in keyof Row as K extends keyof ReqRow ? never : K]?: Row[K] };

/**
 * Required/optional partition over GetReturnType of MaxSQL / ReqSQL / ScopeSQL.
 * - hasUncond: Row = GetReturnType<MaxSQL>; ReqRow = GetReturnType<ReqSQL>;
 *   partition keys: required iff in ReqRow.
 * - else (no unconditional select → all-false runtime path is SELECT *):
 *   Partial<GetReturnType<MaxSQL> & GetReturnType<ScopeSQL>>.
 */
export type BuilderReturnTypeFor<Schema extends DatabaseSchema, Sql extends SqlTag> =
    HasUncond<Sql["selects"]> extends true
        ? GetReturnType<BuildSQL<Sql, "max">, Schema> extends infer Row
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
