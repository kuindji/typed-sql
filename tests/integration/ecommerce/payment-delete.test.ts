/**
 * Payment DELETE queries.
 *
 * Tests DELETE statements used for cancelling approved payments.
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";

type S = EcommerceSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
)
    ? true
    : false;
type Expect<T extends true> = T;

// ============================================================================
// 1. Cancel approved payment by ID
// ============================================================================

type Q_DeletePayment = `
    delete from "User_ApprovedPayment"
    where id = $1
`;
type _V1 = Expect<Equal<ValidateSQL<Q_DeletePayment, S>, true>>;
