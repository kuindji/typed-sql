/**
 * Validator Type Tests
 *
 * Tests for ValidateSelectSQL with comprehensive validation options.
 * If all test files compile without errors, all tests pass.
 */

export type { TestSchema, JsonFieldSchema } from "../../fixtures/validation-schemas.js";

export type { BasicValidatorTestsPass } from "./basic.test.js";
export type { ClausesValidatorTestsPass } from "./clauses.test.js";
export type { OptionsValidatorTestsPass } from "./options.test.js";
export type { SubqueriesValidatorTestsPass } from "./subqueries.test.js";
export type { FeaturesValidatorTestsPass } from "./features.test.js";
export type { ExpressionsValidatorTestsPass } from "./expressions.test.js";
export type { ComplexValidatorTestsPass } from "./complex.test.js";
export type { AnalyticsValidatorTestsPass } from "./analytics.test.js";
export type { PartialValidatorTestsPass } from "./partial-select.test.js";
export type { ModuloValidatorTestsPass } from "./modulo-operator.test.js";

// All validator tests pass if this file compiles
export type ValidatorTestsPass = true;
