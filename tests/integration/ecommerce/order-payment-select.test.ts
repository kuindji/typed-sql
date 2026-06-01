/**
 * Reporting and data retrieval SELECT queries.
 *
 * Tests SELECT statements used for fetching orders, payments, invoices,
 * item snapshots, and payment matching. Includes simple wildcard selects,
 * JOINs, EXISTS subqueries, and aggregate functions.
 */

import type { ValidateSQL, GetReturnType } from "../../../src/index.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";

type S = EcommerceSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
)
    ? true
    : false;
type Expect<T extends true> = T;

// ============================================================================
// 1. Simple order lookup by ID
// ============================================================================

type Q_OrderById = `select * from "Network_Order" where id = $1`;
type _V1 = Expect<Equal<ValidateSQL<Q_OrderById, S>, true>>;
type _R1 = Expect<Equal<GetReturnType<Q_OrderById, S>, S["schemas"]["public"]["Network_Order"]>>;

// ============================================================================
// 2. Simple approved payment lookup by ID
// ============================================================================

type Q_PaymentById = `select * from "User_ApprovedPayment" where id = $1`;
type _V2 = Expect<Equal<ValidateSQL<Q_PaymentById, S>, true>>;
type _R2 = Expect<Equal<GetReturnType<Q_PaymentById, S>, S["schemas"]["public"]["User_ApprovedPayment"]>>;

// ============================================================================
// 3. Rakuten items with currency conversion functions (static)
//    Uses convert_currency() custom function calls and type casts
// ============================================================================

type Q_RakutenItemsStatic = `
    select
    i.*,
    null as "affiliateStatus",
    convert_currency(
        i."pseBalance"::numeric,
        i."currency",
        'GBP'::text,
        o."orderDate"::date
    )::float8 as "pseBalanceGBP",
    convert_currency(
        i."grossSaleAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date
    )::float8 as "grossSaleAmountGBP",
    convert_currency(
        i."grossCommissionAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date
    )::float8 as "grossCommissionAmountGBP",
    convert_currency(
        i."saleAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date
    )::float8 as "saleAmountGBP",
    convert_currency(
        i."commissionAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date
    )::float8 as "commissionAmountGBP"
    from "Network_Order_Rakuten_Item" i
    join "Network_Order" o on o."orderId" = i."orderId"
    where i."orderId" in ($1, $2)
`;
type _V3 = Expect<Equal<ValidateSQL<Q_RakutenItemsStatic, S>, true>>;

// Dynamic variant with addParams interpolation
type Q_RakutenItemsDyn = `
    select
    i.*,
    null as "affiliateStatus",
    convert_currency(
        i."pseBalance"::numeric,
        i."currency",
        'GBP'::text,
        o."orderDate"::date
    )::float8 as "pseBalanceGBP",
    convert_currency(
        i."grossSaleAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date
    )::float8 as "grossSaleAmountGBP",
    convert_currency(
        i."grossCommissionAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date
    )::float8 as "grossCommissionAmountGBP",
    convert_currency(
        i."saleAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date
    )::float8 as "saleAmountGBP",
    convert_currency(
        i."commissionAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date
    )::float8 as "commissionAmountGBP"
    from "Network_Order_Rakuten_Item" i
    join "Network_Order" o on o."orderId" = i."orderId"
    where i."orderId" in (${string})
`;
type _V3d = Expect<Equal<ValidateSQL<Q_RakutenItemsDyn, S>, true>>;

// ============================================================================
// 4. Rakuten item snapshots lookup
// ============================================================================

type Q_RakutenSnapshots = `
    select *
    from "Network_Order_Rakuten_Item_Snapshot"
    where "rakutenItemId" in ($1)
`;
type _V4 = Expect<Equal<ValidateSQL<Q_RakutenSnapshots, S>, true>>;
type _R4 = Expect<Equal<
    GetReturnType<Q_RakutenSnapshots, S>,
    S["schemas"]["public"]["Network_Order_Rakuten_Item_Snapshot"]
>>;

// ============================================================================
// 5. Rakuten settlements lookup with ORDER BY
// ============================================================================

type Q_RakutenSettlements = `
    select *
    from "Network_Rakuten_Invoice_Settlement"
    where "naInvoiceId" in ($1)
    order by "settlingInvoiceDate" asc, "settlingInvoiceId" asc
`;
type _V5 = Expect<Equal<ValidateSQL<Q_RakutenSettlements, S>, true>>;
type _R5 = Expect<Equal<
    GetReturnType<Q_RakutenSettlements, S>,
    S["schemas"]["public"]["Network_Rakuten_Invoice_Settlement"]
>>;

// ============================================================================
// 6. Rakuten payment invoice items
// ============================================================================

type Q_RakutenPaymentItems = `
    select *
    from "Network_Payment_Invoice_Item_Rakuten"
    where "orderId" in ($1)
`;
type _V6 = Expect<Equal<ValidateSQL<Q_RakutenPaymentItems, S>, true>>;
type _R6 = Expect<Equal<
    GetReturnType<Q_RakutenPaymentItems, S>,
    S["schemas"]["public"]["Network_Payment_Invoice_Item_Rakuten"]
>>;

// ============================================================================
// 7. Rakuten payment invoices
// ============================================================================

type Q_RakutenInvoices = `
    select *
    from "Network_Payment_Invoice_Rakuten"
    where "invoiceId" in ($1)
`;
type _V7 = Expect<Equal<ValidateSQL<Q_RakutenInvoices, S>, true>>;
type _R7 = Expect<Equal<
    GetReturnType<Q_RakutenInvoices, S>,
    S["schemas"]["public"]["Network_Payment_Invoice_Rakuten"]
>>;

// ============================================================================
// 8. Rakuten payments
// ============================================================================

type Q_RakutenPayments = `
    select *
    from "Network_Payment_Rakuten"
    where "paymentId" in ($1)
`;
type _V8 = Expect<Equal<ValidateSQL<Q_RakutenPayments, S>, true>>;
type _R8 = Expect<Equal<
    GetReturnType<Q_RakutenPayments, S>,
    S["schemas"]["public"]["Network_Payment_Rakuten"]
>>;

// ============================================================================
// 9. Revolut payment drafts with invoice JOIN (static)
// ============================================================================

type Q_RevolutDraftsStatic = `
    select rpd.*, rpi."id" as "invoiceId"
    from "Revolut_PaymentDraft" rpd
    left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id"
    where rpd."id" in ($1)
`;
type _V9 = Expect<Equal<ValidateSQL<Q_RevolutDraftsStatic, S>, true>>;

// Dynamic variant
type Q_RevolutDraftsDyn = `
    select rpd.*, rpi."id" as "invoiceId"
    from "Revolut_PaymentDraft" rpd
    left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id"
    where rpd."id" in (${string})
`;
type _V9d = Expect<Equal<ValidateSQL<Q_RevolutDraftsDyn, S>, true>>;

// ============================================================================
// 10. CJ date range - min orderDate for pending orders
// ============================================================================

type Q_CJDateRange = `
    select min("orderDate") as "startDate"
    from "Network_Order" no
    where no."networkId" = 'cj' and
            no."status" in ('new', 'pending', 'locked')
`;
type _V10 = Expect<Equal<ValidateSQL<Q_CJDateRange, S>, true>>;
type _R10 = Expect<Equal<GetReturnType<Q_CJDateRange, S>, { startDate: string }>>;

// ============================================================================
// 11. CJ local order ID lookup
// ============================================================================

type Q_CJLocalOrderId = `
    select "id"
    from "Network_Order" no
    where no."networkId" = 'cj'
    and no."orderId" = $1
`;
type _V11 = Expect<Equal<ValidateSQL<Q_CJLocalOrderId, S>, true>>;
type _R11 = Expect<Equal<GetReturnType<Q_CJLocalOrderId, S>, { id: string }>>;

// ============================================================================
// 12. CJ payment record lookup
// ============================================================================

type Q_CJPayment = `select * from "Network_Payment_CJ" where id = $1`;
type _V12 = Expect<Equal<ValidateSQL<Q_CJPayment, S>, true>>;
type _R12 = Expect<Equal<GetReturnType<Q_CJPayment, S>, S["schemas"]["public"]["Network_Payment_CJ"]>>;

// ============================================================================
// 13. CJ payment group lookup
// ============================================================================

type Q_CJGroup = `select * from "Network_Payment_CJ_Group" where id = $1`;
type _V13 = Expect<Equal<ValidateSQL<Q_CJGroup, S>, true>>;
type _R13 = Expect<Equal<GetReturnType<Q_CJGroup, S>, S["schemas"]["public"]["Network_Payment_CJ_Group"]>>;

// ============================================================================
// 14. CJ payment order assignment lookup
// ============================================================================

type Q_CJPaymentOrder = `
    select "paymentId"
    from "Network_Payment_CJ_Order" npo
    where npo."orderId" = $1
`;
type _V14 = Expect<Equal<ValidateSQL<Q_CJPaymentOrder, S>, true>>;
type _R14 = Expect<Equal<GetReturnType<Q_CJPaymentOrder, S>, { paymentId: string }>>;

// ============================================================================
// 15. CJ payment by JSONB order_id lookup
// ============================================================================

type Q_CJPaymentByDetails = `
    select *
    from "Network_Payment_CJ" np
    where details->>'order_id' = $1
`;
type _V15 = Expect<Equal<ValidateSQL<Q_CJPaymentByDetails, S>, true>>;

// ============================================================================
// 16. CJ unmatched payments with NOT EXISTS subquery
// ============================================================================

type Q_CJUnmatchedPayments = `
    select *
    from "Network_Payment_CJ" npc
    where sale_amount > 0 and not exists (
        select 1 from "Network_Payment_CJ_Order" npco
        where npco."paymentId" = npc.id
    )
`;
type _V16 = Expect<Equal<ValidateSQL<Q_CJUnmatchedPayments, S>, true>>;

// ============================================================================
// 17. CJ orders for payment matching with NOT EXISTS
// ============================================================================

type Q_CJOrdersForMatching = `
    select *
    from "Network_Order" no
    where no."networkId" = 'cj'
    and no."advertiser" = $1
    and no."status" = 'closed'
    and coalesce(no."correctedSaleAmount", no."saleAmount") < $2
    and coalesce(no."correctedSaleAmount", no."saleAmount") > 0.1
    and no."orderDate" < $3
    and not exists (
        select 1 from "Network_Payment_CJ_Order" npco
        where npco."orderId" = no."id"
    )
`;
type _V17 = Expect<Equal<ValidateSQL<Q_CJOrdersForMatching, S>, true>>;

// ============================================================================
// 18. Simple CJ item lookups
// ============================================================================

type Q_CJItems = `select * from "Network_Order_CJ_Item" where "orderId" = $1`;
type _V18 = Expect<Equal<ValidateSQL<Q_CJItems, S>, true>>;

type Q_PartnerizeItems = `select * from "Network_Order_Partnerize_Item" where "orderId" = $1`;
type _V19 = Expect<Equal<ValidateSQL<Q_PartnerizeItems, S>, true>>;

type Q_RakutenItems = `select * from "Network_Order_Rakuten_Item" where "orderId" = $1`;
type _V20 = Expect<Equal<ValidateSQL<Q_RakutenItems, S>, true>>;

// ============================================================================
// 19. Revolut payment draft lookup
// ============================================================================

type Q_RevolutDraft = `select * from "Revolut_PaymentDraft" where "id" = $1`;
type _V21 = Expect<Equal<ValidateSQL<Q_RevolutDraft, S>, true>>;
type _R21 = Expect<Equal<GetReturnType<Q_RevolutDraft, S>, S["schemas"]["public"]["Revolut_PaymentDraft"]>>;

// ============================================================================
// 20. Rakuten items and snapshots without filters (full scan)
// ============================================================================

type Q_AllRakutenItems = `select * from "Network_Order_Rakuten_Item"`;
type _V22 = Expect<Equal<ValidateSQL<Q_AllRakutenItems, S>, true>>;

type Q_AllRakutenSnapshots = `
    select *
    from "Network_Order_Rakuten_Item_Snapshot"
    order by "processDate" asc
`;
type _V23 = Expect<Equal<ValidateSQL<Q_AllRakutenSnapshots, S>, true>>;

type Q_AllRakutenPayments = `select * from "Network_Payment_Rakuten" order by "date" asc`;
type _V24 = Expect<Equal<ValidateSQL<Q_AllRakutenPayments, S>, true>>;

type Q_AllRakutenInvoices = `select * from "Network_Payment_Invoice_Rakuten" order by "invoiceDate" asc`;
type _V25 = Expect<Equal<ValidateSQL<Q_AllRakutenInvoices, S>, true>>;

type Q_AllRakutenInvoiceItems = `
    select * from "Network_Payment_Invoice_Item_Rakuten"
    order by "date" asc, "time" asc
`;
type _V26 = Expect<Equal<ValidateSQL<Q_AllRakutenInvoiceItems, S>, true>>;

// ============================================================================
// 21. Order snapshot details lookup
// ============================================================================

type Q_OrderSnapshot = `
    select "details"
    from "Network_Order_Snapshot"
    where "orderId" = $1
`;
type _V27 = Expect<Equal<ValidateSQL<Q_OrderSnapshot, S>, true>>;
type _R27 = Expect<Equal<GetReturnType<Q_OrderSnapshot, S>, { details: string }>>;

type Q_OrderDetails = `select "details" from "Network_Order" where "orderId" = $1`;
type _V28 = Expect<Equal<ValidateSQL<Q_OrderDetails, S>, true>>;
type _R28 = Expect<Equal<GetReturnType<Q_OrderDetails, S>, { details: string }>>;

// ============================================================================
// 22. User and password reset lookups
// ============================================================================

type Q_AllPasswordResets = `select * from "User_Password_Reset"`;
type _V29 = Expect<Equal<ValidateSQL<Q_AllPasswordResets, S>, true>>;

type Q_UserById = `select "id" from "User" where "email" = $1`;
type _V30 = Expect<Equal<ValidateSQL<Q_UserById, S>, true>>;
type _R30 = Expect<Equal<GetReturnType<Q_UserById, S>, { id: string }>>;
