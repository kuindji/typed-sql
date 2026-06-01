/**
 * Order-level accounting status UPDATE queries.
 *
 * Tests complex UPDATE statements that compute order statuses using
 * CASE expressions, EXISTS subqueries, and correlated sub-selects.
 * Each query has a static variant (alias resolved) and a dynamic
 * variant (with ${string} placeholders the validator should ignore).
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
// 1. updateOrderInternalStatus
//    Computes internalStatus using coalesce + nested CASE + EXISTS subquery
// ============================================================================

type Q_OrderInternalStatus = `
    update "Network_Order" o set "internalStatus" = (
        coalesce(
            "manualStatus",
            case
                when "saleAmount" <= 0 and "itemsCount" <= 0 then 'rejected'
                else null
            end,
            case
                when "networkId" = 'rakuten'
                    and "affiliatePaymentStatus" = 'paid' then 'approved'
                when "status" = 'declined' then 'rejected'
                when "status" = 'new' then 'pending'
                when "status" = 'locked' then 'approved'
                when "status" = 'closed' then 'approved'
                when "status" = 'mixed' then (
                    case when exists (
                        select 1 from "Network_Order_Partnerize_Item" pi
                        where pi."orderId" = o."orderId"
                            and pi.status = 'pending'
                    ) then 'pending'
                    else 'approved'
                    end
                )
                when "status" = '' then null
                else "status"
            end,
            'pending'
        )
    )
    where "id" = '123'
`;
type _V1 = Expect<Equal<ValidateSQL<Q_OrderInternalStatus, S>, true>>;

type Q_OrderInternalStatus_Dyn = `
    update "Network_Order" o set "internalStatus" = (
        ${string}
    )
    where "id" = '${string}'
`;
type _V1d = Expect<Equal<ValidateSQL<Q_OrderInternalStatus_Dyn, S>, true>>;

// ============================================================================
// 2. updateOrderPsePaymentStatus
//    Determines PSE payment status via EXISTS on approved payments and clicks
// ============================================================================

type Q_OrderPsePaymentStatus = `
    update "Network_Order" o set "psePaymentStatus" =
        (
            case
                when "manualPsePaymentStatus" is not null
                    then "manualPsePaymentStatus"
                when exists (
                    select 1
                    from "User_ApprovedPayment" uap
                    where uap."status" = 'paid'
                        and uap."networkOrderId" = o."id"
                ) then 'paid'
                when "commissionAmount" <= 0 then 'na'
                when ("commissionAmount" * "pseCommissionRate") < 0.1 then 'na'
                when not exists(
                    select 1
                    from "LogProductClick" lpc
                    where lpc."sid" = o."clickId"
                        and (lpc."shopperId" is not null or
                            lpc."referenceUserId" is not null)
                ) then 'na'
                when "internalStatus" = 'pending' then null
                when "internalStatus" = 'rejected' then 'na'
                else 'pending'
            end
        )
    where id = '123'
`;
type _V2 = Expect<Equal<ValidateSQL<Q_OrderPsePaymentStatus, S>, true>>;

type Q_OrderPsePaymentStatus_Dyn = `
    update "Network_Order" o set "psePaymentStatus" =
        (
            case
                when "manualPsePaymentStatus" is not null
                    then "manualPsePaymentStatus"
                when exists (
                    select 1
                    from "User_ApprovedPayment" uap
                    where uap."status" = 'paid'
                        and uap."networkOrderId" = ${string}."id"
                ) then 'paid'
                when "commissionAmount" <= 0 then 'na'
                when ("commissionAmount" * "pseCommissionRate") < 0.1 then 'na'
                when not exists(
                    select 1
                    from "LogProductClick" lpc
                    where lpc."sid" = ${string}."clickId"
                        and (lpc."shopperId" is not null or
                            lpc."referenceUserId" is not null)
                ) then 'na'
                when "internalStatus" = 'pending' then null
                when "internalStatus" = 'rejected' then 'na'
                else 'pending'
            end
        )
    where id = '${string}'
`;
type _V2d = Expect<Equal<ValidateSQL<Q_OrderPsePaymentStatus_Dyn, S>, true>>;

// ============================================================================
// 3. updateOrderRevolutPaymentStatus
//    Computes Revolut payment state via JOINs to payment drafts
// ============================================================================

type Q_OrderRevolutPaymentStatus = `
    update "Network_Order" o
    set "revolutPaymentStatus" = (
        case
            when o."manualRevolutPaymentStatus" is not null
                then o."manualRevolutPaymentStatus"
            when o."psePaymentStatus" = 'na' then 'na'
            when exists(
                select 1
                from "User_ApprovedPayment" uap
                join "Revolut_PaymentDraft" rpd on rpd.id = uap."revolutDraftId"
                where uap."networkOrderId" = o."id"
            ) then (
                select (
                    case
                        when uap."status" = 'approved' then 'approved'
                        when uap."status" = 're-approved' then 'approved'
                        when rpd."status" = 'COMPLETED' then 'completed'
                        when rpd."status" = 'CREATED' then 'created'
                        when rpd."status" = 'PENDING' then 'sent'
                        else 'failed'
                    end
                )
                from "User_ApprovedPayment" uap
                join "Revolut_PaymentDraft" rpd on rpd.id = uap."revolutDraftId"
                where uap."networkOrderId" = o."id"
                limit 1
            )
            when exists(
                select 1
                from "User_ApprovedPayment" uap
                left join "Revolut_PaymentDraft" rpd on rpd.id = uap."revolutDraftId"
                where uap."networkOrderId" = o."id" and rpd.id is null
            ) then 'approved'
            else null
        end
    )
    where "id" = '123'
`;
type _V3 = Expect<Equal<ValidateSQL<Q_OrderRevolutPaymentStatus, S>, true>>;

type Q_OrderRevolutPaymentStatus_Dyn = `
    update "Network_Order" o
    set "revolutPaymentStatus" = (
        ${string}
    )
    where "id" = '${string}'
`;
type _V3d = Expect<Equal<ValidateSQL<Q_OrderRevolutPaymentStatus_Dyn, S>, true>>;

// ============================================================================
// 4. updateOrderBalance
//    Computes PSE balance from commission minus paid amounts
// ============================================================================

type Q_OrderBalance = `
    update "Network_Order" o set
        "pseBalance" = case
        when (
            (
                o."affiliatePaymentStatus" is not null
                and o."affiliatePaymentStatus" = 'paid'
            )
            or (
                o."manualAffiliatePaymentStatus" is not null
                and o."manualAffiliatePaymentStatus" = 'paid'
            )
        )
        then
            round(
                coalesce(
                    (
                        (o."commissionAmount" * o."pseCommissionRate") -
                        coalesce(
                            (
                                select sum(uap.amount)
                                from "User_ApprovedPayment" uap
                                where
                                    uap."networkOrderId" = o.id
                                    and uap."status" = 'paid'
                            ),
                            0
                        )
                    ),
                    0
                )::numeric,
                2
            )
        else round(0::numeric, 2)
        end
    where o."id" = '123'
`;
type _V4 = Expect<Equal<ValidateSQL<Q_OrderBalance, S>, true>>;

type Q_OrderBalance_Dyn = `
    update "Network_Order" o set
        "pseBalance" = ${string}
    where o."id" = '${string}'
`;
type _V4d = Expect<Equal<ValidateSQL<Q_OrderBalance_Dyn, S>, true>>;

// ============================================================================
// 5. updateOrderAffiliatePaymentStatus - CJ variant
//    Checks for CJ payment records via EXISTS
// ============================================================================

type Q_OrderAffilPaymentCJ = `
    update "Network_Order" o set
    "affiliatePaymentStatus" = (
        case
            when o."manualAffiliatePaymentStatus" is not null
                then o."manualAffiliatePaymentStatus"
            when exists(
                select 1
                from "Network_Payment_CJ_Order" npco
                where npco."orderId" = o."id"
            ) then 'paid'
            when o."internalStatus" = 'rejected' then 'na'
            when o."status" = 'closed' and o."commissionAmount" < 0.1 then 'na'
            when o."status" = 'closed' then 'pending'
            when o."status" = 'locked' then 'pending'
            else null
        end
    ),
    "affiliatePaymentDate" = (
        case
            when o."manualAffiliatePaymentStatus" is not null
                then null
            when o."internalStatus" = 'rejected' then null
            when exists(
                select 1
                from "Network_Payment_CJ_Order" npco
                where npco."orderId" = o."id"
            ) then (
                select npcg."datePaid"::timestamptz
                from "Network_Payment_CJ_Order" npco
                join "Network_Payment_CJ" npc on npc.id = npco."paymentId"
                join "Network_Payment_CJ_Group" npcg on npcg.id = npc."groupId"
                where npco."orderId" = o."id"
                limit 1
            )
            else null
        end
    )
    where o."networkId" = 'cj' and o."id" = '123'
`;
type _V5 = Expect<Equal<ValidateSQL<Q_OrderAffilPaymentCJ, S>, true>>;

type Q_OrderAffilPaymentCJ_Dyn = `
    update "Network_Order" o set
    "affiliatePaymentStatus" = (${string}),
    "affiliatePaymentDate" = (${string})
    where o."networkId" = 'cj' and o."id" = '${string}'
`;
type _V5d = Expect<Equal<ValidateSQL<Q_OrderAffilPaymentCJ_Dyn, S>, true>>;

// ============================================================================
// 6. updateOrderAffiliatePaymentStatus - Partnerize variant
//    Uses array_agg + cardinality for self-bill status aggregation
// ============================================================================

type Q_OrderAffilPaymentPartnerize = `
    update "Network_Order" o set
    "affiliatePaymentStatus" = (
        select
            case
                when o."manualAffiliatePaymentStatus" is not null
                    then o."manualAffiliatePaymentStatus"
                when o."internalStatus" = 'rejected' then 'na'
                when "statuses" is null then null
                when cardinality("statuses") = 0 then null
                when "statuses"::text[] @> array['paid'] then 'paid'
                else 'pending'
            end
        from (
            select array_agg(ps.details->>'status') as statuses
            from "Network_Order_Partnerize_Item" i
            join "Network_Partnerize_Selfbill" ps on ps.id = i."selfBillId"
            where i."orderId" = o."orderId" and i."selfBillId" is not null
        )
    ),
    "affiliatePaymentDate" = (
        select min(ps."paymentDate")::timestamptz
        from "Network_Order_Partnerize_Item" i
        join "Network_Partnerize_Selfbill" ps on ps.id = i."selfBillId"
        where i."orderId" = o."orderId" and ps."paymentDate" is not null
    )
    where o."networkId" = 'partnerize'
        and o."id" = '123'
`;
type _V6 = Expect<Equal<ValidateSQL<Q_OrderAffilPaymentPartnerize, S>, true>>;

type Q_OrderAffilPaymentPartnerize_Dyn = `
    update "Network_Order" o set
    "affiliatePaymentStatus" = (${string}),
    "affiliatePaymentDate" = (${string})
    where o."networkId" = 'partnerize'
        and o."id" = '${string}'
`;
type _V6d = Expect<Equal<ValidateSQL<Q_OrderAffilPaymentPartnerize_Dyn, S>, true>>;

// ============================================================================
// 7. updateOrderAffiliatePaymentStatus - Rakuten variant
//    Deep nested EXISTS with invoice settlement logic
// ============================================================================

type Q_OrderAffilPaymentRakuten = `
    update "Network_Order" o set
    "affiliatePaymentStatus" = (
        case
            when exists(
                select 1
                from "Network_Payment_Invoice_Item_Rakuten" i
                join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = i."invoiceId"
                join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
                where
                    i."orderId" = o."rawOrderId"
                    and (
                        npr."paymentStatus" != 'N/A'
                        or exists(
                            select 1
                            from "Network_Rakuten_Invoice_Settlement" s
                            where
                                s."naInvoiceId" = nip."invoiceId"
                                and s."allocatedAmount" > 0
                                and (
                                    o."commissionAmount" > 0
                                    or exists(
                                        select 1
                                        from "Network_Order_Rakuten_Item_Snapshot" snap
                                        where snap."orderId" = o."orderId"
                                            and snap."processDate" > s."settlementDate"
                                    )
                                )
                        )
                    )
            ) then 'paid'
            when o."internalStatus" = 'rejected' then 'na'
            else null
        end
    ),
    "affiliatePaymentDate" = (
        select max(d."paymentDate")::timestamptz
        from (
            select npr."date" as "paymentDate"
            from "Network_Payment_Invoice_Item_Rakuten" i
            join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = i."invoiceId"
            join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
            where i."orderId" = o."rawOrderId" and npr."paymentStatus" != 'N/A'

            union all

            select s."settlingInvoiceDate" as "paymentDate"
            from "Network_Payment_Invoice_Item_Rakuten" i
            join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = i."invoiceId"
            join "Network_Rakuten_Invoice_Settlement" s on s."naInvoiceId" = nip."invoiceId"
            where
                i."orderId" = o."rawOrderId"
                and s."allocatedAmount" > 0
                and s."settlingInvoiceDate" is not null
                and (
                    o."commissionAmount" > 0
                    or exists(
                        select 1
                        from "Network_Order_Rakuten_Item_Snapshot" snap
                        where snap."orderId" = o."orderId"
                            and snap."processDate" > s."settlementDate"
                    )
                )
        ) d
    )
    where "networkId" = 'rakuten' and o."id" = '123'
`;
type _V7 = Expect<Equal<ValidateSQL<Q_OrderAffilPaymentRakuten, S>, true>>;

type Q_OrderAffilPaymentRakuten_Dyn = `
    update "Network_Order" o set
    "affiliatePaymentStatus" = (${string}),
    "affiliatePaymentDate" = (${string})
    where "networkId" = 'rakuten' and o."id" = '${string}'
`;
type _V7d = Expect<Equal<ValidateSQL<Q_OrderAffilPaymentRakuten_Dyn, S>, true>>;

// ============================================================================
// 8. updateOrderAffiliateRefundStatus - non-Rakuten (CJ / Partnerize)
//    Simple manual override only
// ============================================================================

type Q_OrderAffilRefundNonRakuten = `
    update "Network_Order" o set
    "affiliateRefundStatus" = (
        case
            when o."manualAffiliateRefundStatus" is not null
                then o."manualAffiliateRefundStatus"
            else null
        end
    )
    where o."id" = '123'
`;
type _V8 = Expect<Equal<ValidateSQL<Q_OrderAffilRefundNonRakuten, S>, true>>;

type Q_OrderAffilRefundNonRakuten_Dyn = `
    update "Network_Order" o set
    "affiliateRefundStatus" = (${string})
    where o."id" = '${string}'
`;
type _V8d = Expect<Equal<ValidateSQL<Q_OrderAffilRefundNonRakuten_Dyn, S>, true>>;

// ============================================================================
// 9. updateOrderAffiliateRefundStatus - Rakuten variant
//    Aggregates item-level refund statuses with count comparisons
// ============================================================================

type Q_OrderAffilRefundRakuten = `
    update "Network_Order" o set
    "affiliateRefundStatus" = (
        case
            when o."manualAffiliateRefundStatus" is not null
                then o."manualAffiliateRefundStatus"
            when exists(
                select 1 from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
                and i."affiliateRefundStatus" = 'pending'
                limit 1
            ) then 'pending'
            when (
                exists (
                    select 1 from "Network_Order_Rakuten_Item" i
                    where i."orderId" = o."orderId"
                    and i."affiliateRefundStatus" = 'refunded'
                    limit 1
                )
                and
                (select count(*) from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId")
                =
                (select count(*) from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
                and i."affiliateRefundStatus" = 'refunded')
            ) then 'refunded'
            when exists(
                select 1 from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
                and (
                    i."affiliateRefundStatus" = 'partially-refunded'
                    or i."affiliateRefundStatus" = 'refunded'
                )
            ) then 'partially-refunded'
            else null
        end
    )
    where o."id" = '123'
`;
type _V9 = Expect<Equal<ValidateSQL<Q_OrderAffilRefundRakuten, S>, true>>;

type Q_OrderAffilRefundRakuten_Dyn = `
    update "Network_Order" o set
    "affiliateRefundStatus" = (${string})
    where o."id" = '${string}'
`;
type _V9d = Expect<Equal<ValidateSQL<Q_OrderAffilRefundRakuten_Dyn, S>, true>>;

// ============================================================================
// 10. updateApprovedPaymentStatus
//     Computes User_ApprovedPayment status from Revolut draft state
// ============================================================================

type Q_ApprovedPaymentStatus = `
    update "User_ApprovedPayment" uap set
    "status" = (
        case
            when uap."paid" = true then 'paid'
            when uap."revolutDraftId" is not null
                then (
                    select
                        case
                            when uap."status" != 're-approved'
                                and rpd."status" = 'COMPLETED'
                                then 'paid'
                            when uap."status" != 're-approved' and
                                (rpd."status" = 'FAILED'
                                or rpd."status" = 'DECLINED'
                                or rpd."status" = 'REVERTED')
                                then 'failed'
                            when rpd."status" = 'CREATED'
                                then 'created'
                            when rpd."status" = 'PENDING'
                                then 'pending'
                            when uap."status" = 're-approved'
                                then 're-approved'
                            else 'approved'
                        end
                    from "Revolut_PaymentDraft" rpd
                    where "id" = uap."revolutDraftId"
                )
            when uap."status" = 're-approved'
                then 're-approved'
            else 'approved'
        end
    )
    where "id" = '123'
`;
type _V10 = Expect<Equal<ValidateSQL<Q_ApprovedPaymentStatus, S>, true>>;

type Q_ApprovedPaymentStatus_Dyn = `
    update "User_ApprovedPayment" uap set
    "status" = (
        ${string}
    )
    where "id" = '${string}'
`;
type _V10d = Expect<Equal<ValidateSQL<Q_ApprovedPaymentStatus_Dyn, S>, true>>;
