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
    QueryResultSelectTestsPass,
    SelectTestsPass,
    ValidatorTestsPass,
} from "./select/index.js";

// INSERT query tests
export type { InsertValidatorTestsPass } from "./validation/insert/index.js";

// UPDATE query tests
export type { UpdateValidatorTestsPass } from "./validation/update/index.js";

// DELETE query tests
export type { DeleteValidatorTestsPass } from "./validation/delete/index.js";

// Full-schema integration query tests
export type { CommerceQueryTestsPass } from "./integration/commerce/queries.test.js";
export type { NetsecQueryTestsPass } from "./integration/netsec/queries.test.js";

/**
 * Master test result - true if all tests pass
 */
export type AllTestsPass = true;
