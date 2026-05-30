/**
 * Simple reporting UPDATE queries.
 *
 * Tests straightforward UPDATE statements used for manual payment
 * status changes and payment group assignment.
 */

import type { ValidateSQL } from "../../../src/index.js";
import type { EcommerceSchema } from "../ecommerce-schema.js";

type S = EcommerceSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
)
    ? true
    : false;
type Expect<T extends true> = T;

// ============================================================================
// 1. Mark approved payment as paid
// ============================================================================

type Q_SetPaymentPaid = `
    update "User_ApprovedPayment"
    set "paid" = true, "status" = 'paid'
    where id = $1
`;
type _V1 = Expect<Equal<ValidateSQL<Q_SetPaymentPaid, S>, true>>;

// ============================================================================
// 2. Assign payment to a group
// ============================================================================

type Q_AssignPaymentGroup = `
    update "Network_Payment_CJ"
    set "groupId" = $1
    where id = $2
`;
type _V2 = Expect<Equal<ValidateSQL<Q_AssignPaymentGroup, S>, true>>;

// ============================================================================
// 3. Update password reset record
// ============================================================================

type Q_UpdatePasswordReset = `
    update "User_Password_Reset"
    set
        "updatedAt" = now(),
        "tempPassword" = $1
    where "userId" = $2
`;
type _V3 = Expect<Equal<ValidateSQL<Q_UpdatePasswordReset, S>, true>>;
