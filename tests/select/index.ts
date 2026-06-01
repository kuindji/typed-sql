/**
 * SELECT Tests Index
 *
 * Exports all test results for SELECT query functionality.
 * If this file compiles without errors, all tests pass.
 */

export type { QueryResultSelectTestsPass } from "../query-result/select/index.js";
export type { ValidatorTestsPass } from "../validation/select/index.js";

/**
 * All SELECT tests pass if this type is true
 */
export type SelectTestsPass = true;
