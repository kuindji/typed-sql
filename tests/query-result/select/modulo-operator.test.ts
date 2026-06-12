/**
 * Modulo (%) operator TYPING pins — spaceless and join-nullability.
 *
 * The top-level arithmetic scan (SplitTopLevelOp) splits on the bare `%`
 * character, but a projection only REACHES the arithmetic arm if the
 * expression-detectors (HasSpecial) classify it as an expression — and `%`
 * is missing there, so the SPACELESS pins (_R1, _R4) are RED until `%` is
 * added to HasSpecial (_R4 additionally depends on the arith-nullability pass
 * firing, which already works for spaced `%` as shown by _R3). The spaced
 * pins (_R2, _R3) pass today and guard against regressions while the
 * validation-side fix lands.
 *
 * If this file compiles without errors, all tests pass.
 */

import type { QueryResult } from "../../../src/index.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { DeepSchema, WideSchema } from "../../fixtures/parser-schemas.js";

// spaceless modulo types number (both operands number)
type R1 = QueryResult<"SELECT quantity%2 AS parity FROM products", DeepSchema>;
type _R1 = RequireTrue<AssertEqual<R1, { parity: number }>>;

// spaced modulo -> number (both operands number; existing behavior, regression guard)
type R2 = QueryResult<"SELECT quantity % 2 AS parity FROM products", DeepSchema>;
type _R2 = RequireTrue<AssertEqual<R2, { parity: number }>>;

// modulo on the nullable side of a LEFT JOIN -> number | null
type R3 = QueryResult<
    "SELECT o.total % 2 AS parity FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _R3 = RequireTrue<AssertEqual<R3, { parity: number | null }>>;

// spaceless variant under the LEFT JOIN -> number | null
type R4 = QueryResult<
    "SELECT o.total%2 AS parity FROM users u LEFT JOIN orders o ON o.user_id = u.id",
    WideSchema
>;
type _R4 = RequireTrue<AssertEqual<R4, { parity: number | null }>>;

export type ModuloOperatorTypingTestsPass = true;
