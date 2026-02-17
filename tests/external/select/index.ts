/**
 * SELECT Tests Index
 *
 * Exports all test results for SELECT query functionality.
 * If this file compiles without errors, all tests pass.
 */

export type { MatcherTestsPass } from "./matcher/index.js";
export type { ValidatorTestsPass } from "./validator/index.js";

/**
 * All SELECT tests pass if this type is true
 */
export type SelectTestsPass = true;
