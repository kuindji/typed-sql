// src/builder/index.ts

// Values
export { createSelectQuery, type SelectQueryBuilder } from "./select.js";
export { createSelectFn } from "./db.js";
export { createConditionTree, ConditionTreeBuilder } from "./condition-tree.js";
export {
    createConditionalQuery,
    withConditions,
    conditionalSQL,
    processConditionalSQL,
    processParams,
} from "./conditional-sql.js";
export { assembleSelectSQL } from "./assemble.js";
export { createInsertQuery, type InsertQueryBuilder } from "./insert.js";
export { createUpdateQuery, type UpdateQueryBuilder } from "./update.js";
export { createDeleteQuery, type DeleteQueryBuilder } from "./delete.js";
export { createSql } from "./sql.js";
export { createMutateFn, type MutationHandler, type MutationReturnType } from "./mutate.js";
export {
    scanPlaceholders, expandScanned, collectScanned, assertAllProvided, prepareScanned,
} from "./scanner.js";

// Types — only those needed to use the runtime API (spec scope).
export type { QueryParamValue, QueryParamInput } from "./params.js";
export type { RuntimeFragment, RuntimeSelectState } from "./state.js";
export type { AnySqlTag, SqlTag } from "./sql-tag.js";
export type {
    BuilderSQL,
    BuilderReturnType,
    BuilderResultBrand,
} from "./return-type.js";
export type {
    ValidQuery,
    ValidQueryBuilder,
    FragmentErrors,
    SelectResult,
    SelectResultArray,
    SelectBuilderResult,
    SelectBuilderResultArray,
    MergeOverrides,
    IsValidSelect,
    QueryHandler,
} from "./db.js";
export type {
    ConditionalQueryResult,
    ProcessedSQL,
    ValidateConditionalSQL,
    ConditionalSQLOutput,
    ConditionalSQLOptions,
    TypedConditionalSQLOutput,
} from "./conditional-sql.js";
export type { DriverParamValue, PlaceholderOccurrence } from "./scanner.js";
export type { ExtractParams, ExtractReturning } from "./extract-params.js";
export type { TypedSql, BoundSql } from "./sql.js";
export type { BoundWrite } from "./insert.js";
export type { WriteParamsFor, WriteReturnFor } from "./write-tag.js";
