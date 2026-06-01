/**
 * Affiliate payment processing INSERT queries.
 *
 * Tests INSERT statements with ON CONFLICT (upsert), INSERT from SELECT,
 * and multi-column value lists used in payment reconciliation workflows.
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
// 1. INSERT payment group - ON CONFLICT DO NOTHING
// ============================================================================

type Q_InsertPaymentGroup = `
    insert into "Network_Payment_CJ_Group" (id, "datePaid")
    values ($1, $2)
    on conflict (id) do nothing
`;
type _V1 = Expect<Equal<ValidateSQL<Q_InsertPaymentGroup, S>, true>>;

// ============================================================================
// 2. INSERT/UPSERT payment record - ON CONFLICT DO UPDATE with COALESCE
// ============================================================================

type Q_UpsertPayment = `
    insert into "Network_Payment_CJ"
    (id, advertiser_name, payment_date,
    sale_amount, publisher_commission, details, "groupId")
    values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (id) do update set
        advertiser_name = excluded.advertiser_name,
        payment_date = excluded.payment_date,
        sale_amount = excluded.sale_amount,
        publisher_commission = excluded.publisher_commission,
        details = excluded.details,
        "groupId" = coalesce("Network_Payment_CJ"."groupId", excluded."groupId")
`;
type _V2 = Expect<Equal<ValidateSQL<Q_UpsertPayment, S>, true>>;

// ============================================================================
// 3. INSERT from SELECT - assign orders to payments with conflict update
//    Complex INSERT that joins orders with payments based on amount matching
// ============================================================================

type Q_AssignSingleOrders = `
    insert into "Network_Payment_CJ_Order"
    ("orderId", "paymentId", "paymentDate")
    (
        select
        o."id",
        p.id as "paymentId",
        p.payment_date as "paymentDate"
        from "Network_Order" o
        join "Network_Payment_CJ" p
            on p.sale_amount > 0.1
                and p.advertiser_name = o.advertiser
                and abs(p.sale_amount - coalesce(o."correctedSaleAmount", o."saleAmount")) < 0.1
        where o."networkId" = 'cj'
            and o."status" = 'closed'
    )
    on conflict ("orderId", "paymentId") do update set
        "manuallyAssigned" = false
`;
type _V3 = Expect<Equal<ValidateSQL<Q_AssignSingleOrders, S>, true>>;

// ============================================================================
// 4. INSERT payment-order assignment - ON CONFLICT DO NOTHING
// ============================================================================

type Q_InsertPaymentOrder = `
    insert into "Network_Payment_CJ_Order"
    ("orderId", "paymentId", "paymentDate")
    values ($1, $2, $3)
    on conflict ("orderId", "paymentId") do nothing
`;
type _V4 = Expect<Equal<ValidateSQL<Q_InsertPaymentOrder, S>, true>>;

// ============================================================================
// 5. INSERT password reset record
// ============================================================================

type Q_InsertPasswordReset = `
    insert into "User_Password_Reset"
    ("userId", "tempPassword", "email", "updatedAt")
    values
    ($1, $2, $3, now())
`;
type _V5 = Expect<Equal<ValidateSQL<Q_InsertPasswordReset, S>, true>>;
