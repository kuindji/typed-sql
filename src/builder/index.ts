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
    normalizeWhitespace,
} from "./conditional-sql.js";
export { assembleSelectSQL } from "./assemble.js";

// Types — only those needed to use the runtime API (spec scope).
export type { QueryParamValue, QueryParamInput } from "./params.js";
export type { RuntimeSelectState } from "./state.js";
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
