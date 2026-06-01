/**
 * SQL Type Parser - Type Tests
 *
 * This module exports all type test results. If this file compiles
 * without errors, all type tests pass.
 *
 * Run tests with: npm run test (or tsc --noEmit)
 */

// SELECT query tests
export type {
    MatcherTestsPass,
    SelectTestsPass,
    ValidatorTestsPass,
} from "./select/index.js";

// INSERT query tests
export type { InsertValidatorTestsPass } from "./insert/index.js";

// UPDATE query tests
export type { UpdateValidatorTestsPass } from "./update/index.js";

// DELETE query tests
export type { DeleteValidatorTestsPass } from "./delete/index.js";

// External project fixtures
export type { VigilocityQueryTestsPass } from "./vigilocity-queries.test.js";

/**
 * Master test result - true if all tests pass
 */
export type AllTestsPass = true;
