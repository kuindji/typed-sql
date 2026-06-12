/**
 * QueryResult SELECT Tests Index
 *
 * Re-exports SELECT return-shape tests.
 * If this file compiles without errors, all tests pass.
 */

export type {
    CamelCaseTestSchema,
    JsonFieldSchema,
    TestSchema,
} from "../../fixtures/query-result-schemas.js";

export type { BasicTestsPass } from "./basic.test.js";
export type { CastingTestsPass } from "./casting.test.js";
export type { ExpressionsTestsPass } from "./expressions.test.js";
export type { FunctionsTestsPass } from "./functions.test.js";
export type { FunctionTypingBreadthTestsPass } from "./function-typing-breadth.test.js";
export type { AnalyticsQueryResultTestsPass } from "./analytics.test.js";
export type { ModuloOperatorTypingTestsPass } from "./modulo-operator.test.js";

// ============================================================================
// Export for verification
// ============================================================================

export type QueryResultSelectTestsPass = true;
