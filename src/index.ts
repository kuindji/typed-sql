// Pure type-level SQL validation and result inference.
// The parser is intentionally shallow and uses safe fallbacks to avoid TS depth limits.

export type { DatabaseSchema } from "./schema.js";

import type { DatabaseSchema } from "./schema.js";
import type { NormalizeQuery } from "./parsing.js";
import type { DeleteTargetTable, InsertTargetTable, UpdateTargetTable } from "./tables.js";
import type { ValidateSQLNormalized, GetReturnTypeNormalized, QueryKind } from "./validation.js";
import type { RowTypeForTable } from "./schema.js";

// -----------------------------
// Public API
// -----------------------------

export type ValidateSQL<Query extends string, Schema extends DatabaseSchema> =
    string extends Query
        ? false
        : Query extends any
            // Distribute over a union of query strings (e.g. a column drawn from
            // a literal union) so each branch is validated independently; the
            // result is the union of per-branch booleans.
            ? NormalizeQuery<Query> extends infer N extends string
                ? ValidateSQLNormalized<N, Schema>
                : false
            : false;

export type GetReturnType<Query extends string, Schema extends DatabaseSchema> =
    string extends Query
        ? {}
        : NormalizeQuery<Query> extends infer N extends string
            ? QueryKind<N> extends "unknown"
                ? {}
                : GetReturnTypeNormalized<N, Schema>
            : {};

// Compatibility aliases for adapted external tests
export type QueryResult<Query extends string, Schema extends DatabaseSchema> =
    GetReturnType<Query, Schema>;
export type ValidateSelectSQL<Query extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Query, Schema>;
export type ValidateInsertSQL<Query extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Query, Schema>;
export type ValidateUpdateSQL<Query extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Query, Schema>;
export type ValidateDeleteSQL<Query extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Query, Schema>;

export type IsValidInsert<Query extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Query, Schema>;
export type IsValidUpdate<Query extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Query, Schema>;
export type IsValidDelete<Query extends string, Schema extends DatabaseSchema> =
    ValidateSQL<Query, Schema>;

export type GetInsertTableColumns<Query extends string, Schema extends DatabaseSchema> =
    InsertTargetTable<NormalizeQuery<Query>, Schema> extends infer TableKey extends string
        ? RowTypeForTable<TableKey, Schema>
        : never;
export type GetUpdateTableColumns<Query extends string, Schema extends DatabaseSchema> =
    UpdateTargetTable<NormalizeQuery<Query>, Schema> extends infer TableKey extends string
        ? RowTypeForTable<TableKey, Schema>
        : never;
export type GetDeleteTableColumns<Query extends string, Schema extends DatabaseSchema> =
    DeleteTargetTable<NormalizeQuery<Query>, Schema> extends infer TableKey extends string
        ? RowTypeForTable<TableKey, Schema>
        : never;

// Partial (fragment) validation entry points — for the query builder.
export type {
    ValidateFromPart,
    ValidateJoinPart,
    ValidateSelectPart,
    ValidateWherePart,
    ValidateHavingPart,
    ValidateGroupByPart,
    ValidateOrderByPart
} from "./partial.js";
