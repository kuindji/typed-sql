/**
 * Item-level accounting status UPDATE queries.
 *
 * Tests UPDATE statements that compute per-item statuses for CJ,
 * Partnerize, and Rakuten network order items. Uses CASE expressions,
 * correlated subqueries, and EXISTS checks across payment tables.
 * Each query has a static variant and a dynamic variant (${string}).
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
// 1. updateItemInternalStatus - CJ
//    Falls back to parent order internalStatus via subquery
// ============================================================================

type Q_ItemInternalStatusCJ = `
    update "Network_Order_CJ_Item" i set
    "internalStatus" = (
        case
            when i."manualStatus" is not null then i."manualStatus"
            when i."saleAmount" <= 0 then 'rejected'
            else (
                select "internalStatus"
                from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V1 = Expect<Equal<ValidateSQL<Q_ItemInternalStatusCJ, S>, true>>;

type Q_ItemInternalStatusCJ_Dyn = `
    update "Network_Order_CJ_Item" i set
    "internalStatus" = (
        case
            when ${string}."manualStatus" is not null then ${string}."manualStatus"
            when ${string}."saleAmount" <= 0 then 'rejected'
            else (
                select "internalStatus"
                from "Network_Order" o
                where o."orderId" = ${string}."orderId"
            )
        end
    )
    where i."id" = '${string}'
`;
type _V1d = Expect<Equal<ValidateSQL<Q_ItemInternalStatusCJ_Dyn, S>, true>>;

// ============================================================================
// 2. updateItemInternalStatus - Partnerize
//    Adds commission check and item-level status awareness
// ============================================================================

type Q_ItemInternalStatusPartnerize = `
    update "Network_Order_Partnerize_Item" i set
    "internalStatus" = (
        case
            when i."manualStatus" is not null then i."manualStatus"
            when i."saleAmount" <= 0 and i."commissionAmount" <= 0 then 'rejected'
            when i.status is not null
                and (i.status = 'pending'
                    or i.status = 'rejected'
                    or i.status = 'approved')
                then i.status
            else (
                select o."internalStatus" from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V2 = Expect<Equal<ValidateSQL<Q_ItemInternalStatusPartnerize, S>, true>>;

type Q_ItemInternalStatusPartnerize_Dyn = `
    update "Network_Order_Partnerize_Item" i set
    "internalStatus" = (${string})
    where i."id" = '${string}'
`;
type _V2d = Expect<Equal<ValidateSQL<Q_ItemInternalStatusPartnerize_Dyn, S>, true>>;

// ============================================================================
// 3. updateItemInternalStatus - Rakuten
//    Adds affiliate payment status check for auto-approval
// ============================================================================

type Q_ItemInternalStatusRakuten = `
    update "Network_Order_Rakuten_Item" i set
    "internalStatus" = (
        case
            when i."manualStatus" is not null then i."manualStatus"
            when i."saleAmount" <= 0 then 'rejected'
            when i."affiliatePaymentStatus" = 'paid' then 'approved'
            else (
                select o."internalStatus" from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V3 = Expect<Equal<ValidateSQL<Q_ItemInternalStatusRakuten, S>, true>>;

type Q_ItemInternalStatusRakuten_Dyn = `
    update "Network_Order_Rakuten_Item" i set
    "internalStatus" = (${string})
    where i."id" = '${string}'
`;
type _V3d = Expect<Equal<ValidateSQL<Q_ItemInternalStatusRakuten_Dyn, S>, true>>;

// ============================================================================
// 4. updateItemAffiliatePaymentStatus - CJ
//    Inherits from parent order when no manual override
// ============================================================================

type Q_ItemAffilPaymentCJ = `
    update "Network_Order_CJ_Item" i set
    "affiliatePaymentStatus" = (
        case
            when i."manualAffiliatePaymentStatus" is not null
                then i."manualAffiliatePaymentStatus"
            when i."internalStatus" = 'rejected' then 'na'
            else (
                select "affiliatePaymentStatus"
                from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V4 = Expect<Equal<ValidateSQL<Q_ItemAffilPaymentCJ, S>, true>>;

type Q_ItemAffilPaymentCJ_Dyn = `
    update "Network_Order_CJ_Item" i set
    "affiliatePaymentStatus" = (${string})
    where i."id" = '${string}'
`;
type _V4d = Expect<Equal<ValidateSQL<Q_ItemAffilPaymentCJ_Dyn, S>, true>>;

// ============================================================================
// 5. updateItemAffiliatePaymentStatus - Partnerize
//    Checks self-bill payment status via subquery
// ============================================================================

type Q_ItemAffilPaymentPartnerize = `
    update "Network_Order_Partnerize_Item" i set
    "affiliatePaymentStatus" = (
        case
            when i."manualAffiliatePaymentStatus" is not null
                then i."manualAffiliatePaymentStatus"
            when i."selfBillId" is not null then (
                select
                    case
                        when b."status" = 'paid' then 'paid'
                        else 'pending'
                    end
                from "Network_Partnerize_Selfbill" b
                where b."id" = i."selfBillId"
                limit 1
            )
            when i."internalStatus" = 'rejected' then 'na'
            else (
                select "affiliatePaymentStatus"
                from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V5 = Expect<Equal<ValidateSQL<Q_ItemAffilPaymentPartnerize, S>, true>>;

type Q_ItemAffilPaymentPartnerize_Dyn = `
    update "Network_Order_Partnerize_Item" i set
    "affiliatePaymentStatus" = (${string})
    where i."id" = '${string}'
`;
type _V5d = Expect<Equal<ValidateSQL<Q_ItemAffilPaymentPartnerize_Dyn, S>, true>>;

// ============================================================================
// 6. updateItemAffiliatePaymentStatus - Rakuten
//    Deep nested EXISTS with payment invoice items and settlements
// ============================================================================

type Q_ItemAffilPaymentRakuten = `
    update "Network_Order_Rakuten_Item" i set
    "affiliatePaymentStatus" = (
        case
            when i."manualAffiliatePaymentStatus" is not null
                then i."manualAffiliatePaymentStatus"
            when exists(
                select 1
                from "Network_Payment_Invoice_Item_Rakuten" pi
                join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = pi."invoiceId"
                join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
                where
                    pi."orderId" = i."rawOrderId"
                    and
                    pi."matchingSku" = i."sku"
                    and (
                        (npr."paymentStatus" != 'N/A' and pi."actualCommission" > 0)
                        or exists(
                            select 1
                            from "Network_Rakuten_Invoice_Settlement" s
                            where
                                s."naInvoiceId" = nip."invoiceId"
                                and s."allocatedAmount" > 0
                                and (
                                    i."commissionAmount" > 0
                                    or s."settlementDate" < (
                                        select min(snap."processDate")
                                        from "Network_Order_Rakuten_Item_Snapshot" snap
                                        where snap."orderId" = i."orderId"
                                    )
                                )
                        )
                    )
            ) then 'paid'
            when i."commissionAmount" = 0 and exists(
                select 1
                from "Network_Payment_Invoice_Item_Rakuten" pi
                join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = pi."invoiceId"
                join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
                where
                    pi."orderId" = i."rawOrderId"
                    and pi."matchingSku" = i."sku"
                    and npr."paymentStatus" != 'N/A'
            ) then 'na'
            when i."internalStatus" = 'rejected' then 'na'
            else (
                select "affiliatePaymentStatus"
                from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V6 = Expect<Equal<ValidateSQL<Q_ItemAffilPaymentRakuten, S>, true>>;

type Q_ItemAffilPaymentRakuten_Dyn = `
    update "Network_Order_Rakuten_Item" i set
    "affiliatePaymentStatus" = (${string})
    where i."id" = '${string}'
`;
type _V6d = Expect<Equal<ValidateSQL<Q_ItemAffilPaymentRakuten_Dyn, S>, true>>;

// ============================================================================
// 7. updateItemPsePaymentStatus - CJ variant
//    Checks approved payment items, click tracking, commission threshold
// ============================================================================

type Q_ItemPsePaymentStatusCJ = `
    update "Network_Order_CJ_Item" i set
    "psePaymentStatus" = (
        case
            when i."manualPsePaymentStatus" is not null
                then i."manualPsePaymentStatus"
            when exists (
                select 1
                from "User_ApprovedPayment_Item" uapi
                join "User_ApprovedPayment" uap on uap."id" = uapi."userApprovedPaymentId"
                where uap."status" = 'paid'
                    and uapi."cjItemId" = i."id"
            ) then 'paid'
            when i."internalStatus" = 'rejected' then 'na'
            when i."commissionAmount" <= 0 then 'na'
            when not exists(
                select 1
                from "Network_Order" o
                join "LogProductClick" lpc on lpc.sid = o."clickId"
                where o."orderId" = i."orderId"
                    and (lpc."shopperId" is not null or
                        lpc."referenceUserId" is not null)
            ) then 'na'
            when not exists(
                select 1
                from "Network_Order" o
                where o."orderId" = i."orderId" and
                    (i."commissionAmount"
                        * o."pseCommissionRate") >= 0.1
            ) then 'na'
            else (
                select "psePaymentStatus"
                from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V7 = Expect<Equal<ValidateSQL<Q_ItemPsePaymentStatusCJ, S>, true>>;

type Q_ItemPsePaymentStatusCJ_Dyn = `
    update "Network_Order_CJ_Item" i set
    "psePaymentStatus" = (${string})
    where i."id" = '${string}'
`;
type _V7d = Expect<Equal<ValidateSQL<Q_ItemPsePaymentStatusCJ_Dyn, S>, true>>;

// ============================================================================
// 8. updateItemPsePaymentStatus - Rakuten variant
// ============================================================================

type Q_ItemPsePaymentStatusRakuten = `
    update "Network_Order_Rakuten_Item" i set
    "psePaymentStatus" = (
        case
            when i."manualPsePaymentStatus" is not null
                then i."manualPsePaymentStatus"
            when exists (
                select 1
                from "User_ApprovedPayment_Item" uapi
                join "User_ApprovedPayment" uap on uap."id" = uapi."userApprovedPaymentId"
                where uap."status" = 'paid'
                    and uapi."rakutenItemId" = i."id"
            ) then 'paid'
            when i."internalStatus" = 'rejected' then 'na'
            when i."commissionAmount" <= 0 then 'na'
            when not exists(
                select 1
                from "Network_Order" o
                join "LogProductClick" lpc on lpc.sid = o."clickId"
                where o."orderId" = i."orderId"
                    and (lpc."shopperId" is not null or
                        lpc."referenceUserId" is not null)
            ) then 'na'
            when not exists(
                select 1
                from "Network_Order" o
                where o."orderId" = i."orderId" and
                    (i."commissionAmount"
                        * o."pseCommissionRate") >= 0.1
            ) then 'na'
            else (
                select "psePaymentStatus"
                from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V8 = Expect<Equal<ValidateSQL<Q_ItemPsePaymentStatusRakuten, S>, true>>;

// ============================================================================
// 9. updateItemPsePaymentStatus - Partnerize variant
// ============================================================================

type Q_ItemPsePaymentStatusPartnerize = `
    update "Network_Order_Partnerize_Item" i set
    "psePaymentStatus" = (
        case
            when i."manualPsePaymentStatus" is not null
                then i."manualPsePaymentStatus"
            when exists (
                select 1
                from "User_ApprovedPayment_Item" uapi
                join "User_ApprovedPayment" uap on uap."id" = uapi."userApprovedPaymentId"
                where uap."status" = 'paid'
                    and uapi."partnerizeItemId" = i."id"
            ) then 'paid'
            when i."internalStatus" = 'rejected' then 'na'
            when i."commissionAmount" <= 0 then 'na'
            when not exists(
                select 1
                from "Network_Order" o
                join "LogProductClick" lpc on lpc.sid = o."clickId"
                where o."orderId" = i."orderId"
                    and (lpc."shopperId" is not null or
                        lpc."referenceUserId" is not null)
            ) then 'na'
            when not exists(
                select 1
                from "Network_Order" o
                where o."orderId" = i."orderId" and
                    (i."commissionAmount"
                        * o."pseCommissionRate") >= 0.1
            ) then 'na'
            else (
                select "psePaymentStatus"
                from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )
    where i."id" = '123'
`;
type _V9 = Expect<Equal<ValidateSQL<Q_ItemPsePaymentStatusPartnerize, S>, true>>;

// ============================================================================
// 10. updateItemAffiliateRefundStatus - non-Rakuten (CJ / Partnerize)
//     Simple manual override only
// ============================================================================

type Q_ItemAffilRefundCJ = `
    update "Network_Order_CJ_Item" i set
    "affiliateRefundStatus" = (
        case
            when i."manualAffiliateRefundStatus" is not null
                then i."manualAffiliateRefundStatus"
            else null
        end
    )
    where i."id" = '123'
`;
type _V10 = Expect<Equal<ValidateSQL<Q_ItemAffilRefundCJ, S>, true>>;

type Q_ItemAffilRefundPartnerize = `
    update "Network_Order_Partnerize_Item" i set
    "affiliateRefundStatus" = (
        case
            when i."manualAffiliateRefundStatus" is not null
                then i."manualAffiliateRefundStatus"
            else null
        end
    )
    where i."id" = '123'
`;
type _V11 = Expect<Equal<ValidateSQL<Q_ItemAffilRefundPartnerize, S>, true>>;

// ============================================================================
// 11. updateItemAffiliateRefundStatus - Rakuten
//     Complex payment amount comparison with multiple EXISTS and aggregation
// ============================================================================

type Q_ItemAffilRefundRakuten = `
    update "Network_Order_Rakuten_Item" i set
    "affiliateRefundStatus" = (
        case
            when i."manualAffiliateRefundStatus" is not null
                then i."manualAffiliateRefundStatus"
            when i."grossCommissionAmount" = 0 then null
            when (
                exists(
                    select 1
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = pi."invoiceId"
                    join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
                    where
                        pi."orderId" = i."rawOrderId"
                        and pi."matchingSku" = i."sku"
                        and (
                            npr."paymentStatus" != 'N/A'
                            or exists(
                                select 1
                                from "Network_Rakuten_Invoice_Settlement" s
                                where
                                    s."naInvoiceId" = nip."invoiceId"
                                    and s."allocatedAmount" > 0
                                    and (
                                        i."commissionAmount" > 0
                                        or s."settlementDate" < (
                                            select min(snap."processDate")
                                            from "Network_Order_Rakuten_Item_Snapshot" snap
                                            where snap."orderId" = i."orderId"
                                        )
                                    )
                            )
                        )
                )
                and
                abs(
                    (select sum(pi."actualCommission")
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    where pi."orderId" = i."rawOrderId"
                    and pi."matchingSku" = i."sku")
                    -
                    i."commissionAmount"
                ) > 1
            ) then 'pending'
            when (
                exists(
                    select 1
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = pi."invoiceId"
                    join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
                    where
                        pi."orderId" = i."rawOrderId"
                        and pi."matchingSku" = i."sku"
                        and (
                            npr."paymentStatus" != 'N/A'
                            or exists(
                                select 1
                                from "Network_Rakuten_Invoice_Settlement" s
                                where
                                    s."naInvoiceId" = nip."invoiceId"
                                    and s."allocatedAmount" > 0
                                    and (
                                        i."commissionAmount" > 0
                                        or s."settlementDate" < (
                                            select min(snap."processDate")
                                            from "Network_Order_Rakuten_Item_Snapshot" snap
                                            where snap."orderId" = i."orderId"
                                        )
                                    )
                            )
                        )
                )
                and
                (select count(*)
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    where pi."orderId" = i."rawOrderId"
                    and pi."matchingSku" = i."sku") > 1
                and (
                    select sum(pi."actualCommission")
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    where pi."orderId" = i."rawOrderId"
                    and pi."matchingSku" = i."sku"
                ) = 0
                and i."commissionAmount" = 0
            ) then 'refunded'
            when (
                exists(
                    select 1
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = pi."invoiceId"
                    join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
                    where
                        pi."orderId" = i."rawOrderId"
                        and pi."matchingSku" = i."sku"
                        and (
                            npr."paymentStatus" != 'N/A'
                            or exists(
                                select 1
                                from "Network_Rakuten_Invoice_Settlement" s
                                where
                                    s."naInvoiceId" = nip."invoiceId"
                                    and s."allocatedAmount" > 0
                                    and (
                                        i."commissionAmount" > 0
                                        or s."settlementDate" < (
                                            select min(snap."processDate")
                                            from "Network_Order_Rakuten_Item_Snapshot" snap
                                            where snap."orderId" = i."orderId"
                                        )
                                    )
                            )
                        )
                )
                and
                (select count(*)
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    where pi."orderId" = i."rawOrderId"
                    and pi."matchingSku" = i."sku") > 1
                and (select sum(pi."actualCommission")
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    where pi."orderId" = i."rawOrderId"
                    and pi."matchingSku" = i."sku") > 0
                and exists(select 1
                    from "Network_Payment_Invoice_Item_Rakuten" pi
                    where pi."orderId" = i."rawOrderId"
                    and pi."matchingSku" = i."sku"
                    and pi."actualCommission" < 0
                    limit 1)
            ) then 'partially-refunded'
            else null
        end
    )
    where i."id" = '123'
`;
type _V12 = Expect<Equal<ValidateSQL<Q_ItemAffilRefundRakuten, S>, true>>;

type Q_ItemAffilRefundRakuten_Dyn = `
    update "Network_Order_Rakuten_Item" i set
    "affiliateRefundStatus" = (${string})
    where i."id" = '${string}'
`;
type _V12d = Expect<Equal<ValidateSQL<Q_ItemAffilRefundRakuten_Dyn, S>, true>>;

// ============================================================================
// 12. updateItemBalance - CJ variant
//     Computes per-item PSE balance from order commission rate minus payments
// ============================================================================

type Q_ItemBalanceCJ = `
    update "Network_Order_CJ_Item" i set
    "pseBalance" = (
        case
        when (
            select coalesce("manualAffiliatePaymentStatus", "affiliatePaymentStatus", '')
            from "Network_Order" o
            where o."orderId" = i."orderId") != 'paid'
        then 0
        when i."grossCommissionAmount" = 0
        then 0
        when (
            select "pseCommissionRate"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        when (
            select "grossCommissionAmount"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        else round(
                coalesce(
                (
                    (
                        (
                            select "pseCommissionRate"
                            from "Network_Order" o
                            where o."orderId" = i."orderId"
                        ) *
                        i."commissionAmount"
                    ) -
                    coalesce(
                        (select sum(uapi."amount")
                        from "User_ApprovedPayment_Item" uapi
                        join "User_ApprovedPayment" uap
                            on uap.id = uapi."userApprovedPaymentId"
                        where uapi."anyItemId" = i."id"
                        and uap."status" = 'paid'),
                        0
                    )
                ),
                0
            )::numeric,
            2
        )
        end
    )
    where i."id" = '123'
`;
type _V13 = Expect<Equal<ValidateSQL<Q_ItemBalanceCJ, S>, true>>;

type Q_ItemBalanceCJ_Dyn = `
    update "Network_Order_CJ_Item" i set
    "pseBalance" = (${string})
    where ${string}
`;
type _V13d = Expect<Equal<ValidateSQL<Q_ItemBalanceCJ_Dyn, S>, true>>;

// ============================================================================
// 13. updateItemBalance - Rakuten variant
// ============================================================================

type Q_ItemBalanceRakuten = `
    update "Network_Order_Rakuten_Item" i set
    "pseBalance" = (
        case
        when (
            select coalesce("manualAffiliatePaymentStatus", "affiliatePaymentStatus", '')
            from "Network_Order" o
            where o."orderId" = i."orderId") != 'paid'
        then 0
        when i."grossCommissionAmount" = 0
        then 0
        when (
            select "pseCommissionRate"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        when (
            select "grossCommissionAmount"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        else round(
                coalesce(
                (
                    (
                        (
                            select "pseCommissionRate"
                            from "Network_Order" o
                            where o."orderId" = i."orderId"
                        ) *
                        i."commissionAmount"
                    ) -
                    coalesce(
                        (select sum(uapi."amount")
                        from "User_ApprovedPayment_Item" uapi
                        join "User_ApprovedPayment" uap
                            on uap.id = uapi."userApprovedPaymentId"
                        where uapi."anyItemId" = i."id"
                        and uap."status" = 'paid'),
                        0
                    )
                ),
                0
            )::numeric,
            2
        )
        end
    )
    where i."id" = '123'
`;
type _V14 = Expect<Equal<ValidateSQL<Q_ItemBalanceRakuten, S>, true>>;

// ============================================================================
// 14. updateItemBalance - Partnerize variant
// ============================================================================

type Q_ItemBalancePartnerize = `
    update "Network_Order_Partnerize_Item" i set
    "pseBalance" = (
        case
        when (
            select coalesce("manualAffiliatePaymentStatus", "affiliatePaymentStatus", '')
            from "Network_Order" o
            where o."orderId" = i."orderId") != 'paid'
        then 0
        when i."grossCommissionAmount" = 0
        then 0
        when (
            select "pseCommissionRate"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        when (
            select "grossCommissionAmount"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        else round(
                coalesce(
                (
                    (
                        (
                            select "pseCommissionRate"
                            from "Network_Order" o
                            where o."orderId" = i."orderId"
                        ) *
                        i."commissionAmount"
                    ) -
                    coalesce(
                        (select sum(uapi."amount")
                        from "User_ApprovedPayment_Item" uapi
                        join "User_ApprovedPayment" uap
                            on uap.id = uapi."userApprovedPaymentId"
                        where uapi."anyItemId" = i."id"
                        and uap."status" = 'paid'),
                        0
                    )
                ),
                0
            )::numeric,
            2
        )
        end
    )
    where i."id" = '123'
`;
type _V15 = Expect<Equal<ValidateSQL<Q_ItemBalancePartnerize, S>, true>>;
