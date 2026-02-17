/**
 * Matcher Type Tests Index
 *
 * Re-exports all matcher tests.
 * If this file compiles without errors, all tests pass.
 */

export type {
    CamelCaseTestSchema,
    JsonFieldSchema,
    TestSchema,
} from "./schemas.js";

export type { BasicTestsPass } from "./basic.test.js";
export type { CastingTestsPass } from "./casting.test.js";
export type { ExpressionsTestsPass } from "./expressions.test.js";
export type { FunctionsTestsPass } from "./functions.test.js";
export type { ValidationTestsPass } from "./validation.test.js";
export type { AnalyticsMatcherTestsPass } from "./analytics.test.js";

// ============================================================================
// Export for verification
// ============================================================================

export type MatcherTestsPass = true;
