/**
 * hasura-trigger plain-SQL fixtures — copied verbatim from
 * commerce app, area: hasura-trigger.
 * Setup-only: assertions encode the INTENDED row type; failures => engine fix-list.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";

type Main = ReportingV2Schema;
type Catalogue = ReportingV2CatalogueSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// handlers/networkRakutenInvoiceSettlement.ts:13-17 — distinct orderId
// ---------------------------------------------------------------------------
type Q_RakutenSettlementOrderIds = `
    select distinct pi."orderId"
    from "Network_Payment_Invoice_Item_Rakuten" pi
    where pi."invoiceId" = $1
`;
type _V_RakutenSettlementOrderIds = Expect<
    Equal<ValidateSQL<Q_RakutenSettlementOrderIds, Main>, true>
>;
type _R_RakutenSettlementOrderIds = Expect<
    Equal<GetReturnType<Q_RakutenSettlementOrderIds, Main>, { orderId: string }>
>;

// ---------------------------------------------------------------------------
// handlers/networkRakutenInvoiceSettlement.ts:23-30 — distinct item id via join
// ---------------------------------------------------------------------------
type Q_RakutenSettlementItemIds = `
    select distinct i."id"
    from "Network_Order_Rakuten_Item" i
    join "Network_Payment_Invoice_Item_Rakuten" pi
        on pi."orderId" = i."rawOrderId"
        and pi."matchingSku" = i."sku"
    where pi."invoiceId" = $1
`;
type _V_RakutenSettlementItemIds = Expect<
    Equal<ValidateSQL<Q_RakutenSettlementItemIds, Main>, true>
>;
type _R_RakutenSettlementItemIds = Expect<
    Equal<GetReturnType<Q_RakutenSettlementItemIds, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// handlers/networkPaymentRakuten.ts:13-19 — distinct orderId via invoice join
// ---------------------------------------------------------------------------
type Q_RakutenPaymentOrderIds = `
    select distinct i."orderId"
    from "Network_Payment_Invoice_Item_Rakuten" i
    join "Network_Payment_Invoice_Rakuten" nip
        on nip."invoiceId" = i."invoiceId"
    where nip."paymentId" = $1
`;
type _V_RakutenPaymentOrderIds = Expect<
    Equal<ValidateSQL<Q_RakutenPaymentOrderIds, Main>, true>
>;
type _R_RakutenPaymentOrderIds = Expect<
    Equal<GetReturnType<Q_RakutenPaymentOrderIds, Main>, { orderId: string }>
>;

// ---------------------------------------------------------------------------
// handlers/networkPaymentRakuten.ts:26-35 — distinct item id via double join
// ---------------------------------------------------------------------------
type Q_RakutenPaymentItemIds = `
    select distinct i."id"
    from "Network_Order_Rakuten_Item" i
    join "Network_Payment_Invoice_Item_Rakuten" pi
        on pi."orderId" = i."rawOrderId"
        and pi."matchingSku" = i."sku"
    join "Network_Payment_Invoice_Rakuten" nip
        on nip."invoiceId" = pi."invoiceId"
    where nip."paymentId" = $1
`;
type _V_RakutenPaymentItemIds = Expect<
    Equal<ValidateSQL<Q_RakutenPaymentItemIds, Main>, true>
>;
type _R_RakutenPaymentItemIds = Expect<
    Equal<GetReturnType<Q_RakutenPaymentItemIds, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// handlers/userApprovedPayment.ts:79-111 — insert ... select with VAT case
// (materialized: ${itemIdField[networkId]} -> "cjItemId", ${itemTables[networkId]}
//  -> "Network_Order_CJ_Item")
// ---------------------------------------------------------------------------
type Q_CreateApprovedPaymentItems = `
    insert into "User_ApprovedPayment_Item"
        ("userApprovedPaymentId", "cjItemId", "anyItemId", "amount", "vat", "currency")
    select
        $1,
        i."id",
        i."id",
        i."pseBalance",
        (i."pseBalance" * (
            case
                when tps."teamId" is not null then
                    case when tps."vatEnabled" is true
                        and tps."vatCountry" = 'GB'
                        then 0.2 else 0 end
                else
                    case when ups."vatEnabled" is true
                        and ups."vatCountry" = 'GB'
                        then 0.2 else 0 end
            end
        )) as "vat",
        o.currency
    from "Network_Order_CJ_Item" i
    join "Network_Order" o on o."orderId" = i."orderId"
    join "LogProductClick" lpc on lpc."sid" = o."clickId"
    left join "User_PaymentSettings" ups on ups."userId" = lpc."shopperId"
    left join "Team_PaymentSettings" tps on tps."teamId" = lpc."teamId"
    where i."orderId" = $2
`;
type _V_CreateApprovedPaymentItems = Expect<
    Equal<ValidateSQL<Q_CreateApprovedPaymentItems, Main>, true>
>;
// DML without RETURNING -> ValidateSQL only.

// ---------------------------------------------------------------------------
// handlers/networkOrderPartnerizeItem.ts:83-87 — update order rollups
// ---------------------------------------------------------------------------
type Q_UpdateNetworkOrderRollups = `
    update "Network_Order"
    set "saleAmount" = $1, "commissionAmount" = $2
    where "orderId" = $3
`;
type _V_UpdateNetworkOrderRollups = Expect<
    Equal<ValidateSQL<Q_UpdateNetworkOrderRollups, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/revolutCounterparty.ts:27-37 — upsert User_Analytics
// ---------------------------------------------------------------------------
type Q_UpsertUserAnalyticsBankDetails = `
    insert into "User_Analytics"
    ("userId", "bankDetailsFirstAddedAt", "bankDetailsAddedNum")
    values
    ($1, now(), 1)
    on conflict("userId") do update set
        "bankDetailsFirstAddedAt" = coalesce("User_Analytics"."bankDetailsFirstAddedAt",
                                                excluded."bankDetailsFirstAddedAt"),
        "bankDetailsAddedNum" = "User_Analytics"."bankDetailsAddedNum" +
                                    excluded."bankDetailsAddedNum"
`;
// SCHEMA-GAP: User_Analytics.bankDetailsAddedNum (column absent from fixture)
type _V_UpsertUserAnalyticsBankDetails = Expect<
    Equal<ValidateSQL<Q_UpsertUserAnalyticsBankDetails, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/revolutPaymentInvoice.ts:10-13 — credit note exists count
// ---------------------------------------------------------------------------
type Q_CreditNoteExistsCount = `
    select count(*) as cnt from "Revolut_PaymentCreditNote"
    where "invoiceId" = $1
`;
// SCHEMA-GAP: Revolut_PaymentCreditNote
type _V_CreditNoteExistsCount = Expect<
    Equal<ValidateSQL<Q_CreditNoteExistsCount, Main>, true>
>;
type _R_CreditNoteExistsCount = Expect<
    Equal<GetReturnType<Q_CreditNoteExistsCount, Main>, { cnt: number }>
>;

// ---------------------------------------------------------------------------
// handlers/revolutPaymentInvoice.ts:38-42 — prepareInsert credit note
// (materialized: db.main.prepareInsert("Revolut_PaymentCreditNote", {...}))
// ---------------------------------------------------------------------------
type Q_InsertCreditNote = `
    insert into "Revolut_PaymentCreditNote"
    ("id", "invoiceId", "amount", "vat", "currency", "data", "paymentId", "userId", "createdAt")
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;
// SCHEMA-GAP: Revolut_PaymentCreditNote
type _V_InsertCreditNote = Expect<
    Equal<ValidateSQL<Q_InsertCreditNote, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/invitation.ts:58-62 — accepted invitation count
// ---------------------------------------------------------------------------
type Q_InvitationCount = `
    select count(*) as cnt
    from "Invitation"
    where "createdBy" = $1 and accepted = true and id != $2
`;
// SCHEMA-GAP: Invitation
type _V_InvitationCount = Expect<
    Equal<ValidateSQL<Q_InvitationCount, Main>, true>
>;
type _R_InvitationCount = Expect<
    Equal<GetReturnType<Q_InvitationCount, Main>, { cnt: number }>
>;

// ---------------------------------------------------------------------------
// handlers/product.ts:12 — look friId lookup
// ---------------------------------------------------------------------------
type Q_LookFriId = `select "friId" from "Look" where id = $1`;
type _V_LookFriId = Expect<Equal<ValidateSQL<Q_LookFriId, Main>, true>>;
type _R_LookFriId = Expect<
    Equal<GetReturnType<Q_LookFriId, Main>, { friId: string | null }>
>;

// ---------------------------------------------------------------------------
// handlers/networkPaymentCJ.ts:23-27 — CJ payment order ids
// ---------------------------------------------------------------------------
type Q_CJPaymentOrderIds = `
    select "orderId"
    from "Network_Payment_CJ_Order"
    where "paymentId" = $1
`;
type _V_CJPaymentOrderIds = Expect<
    Equal<ValidateSQL<Q_CJPaymentOrderIds, Main>, true>
>;
type _R_CJPaymentOrderIds = Expect<
    Equal<GetReturnType<Q_CJPaymentOrderIds, Main>, { orderId: string }>
>;

// ---------------------------------------------------------------------------
// handlers/revolutPaymentDraft.ts:15-19 — networkOrderId from UAP (via .run)
// ---------------------------------------------------------------------------
type Q_DraftNetworkOrderIds = `
    select "networkOrderId"
    from "User_ApprovedPayment"
    where "revolutDraftId" = $1
`;
type _V_DraftNetworkOrderIds = Expect<
    Equal<ValidateSQL<Q_DraftNetworkOrderIds, Main>, true>
>;
type _R_DraftNetworkOrderIds = Expect<
    Equal<
        GetReturnType<Q_DraftNetworkOrderIds, Main>,
        { networkOrderId: string | null }
    >
>;

// ---------------------------------------------------------------------------
// handlers/revolutPaymentDraft.ts:93-95 — distinct userId from UAP
// ---------------------------------------------------------------------------
type Q_DraftDistinctUserIds = `
    select distinct "userId" from "User_ApprovedPayment"
    where "revolutDraftId" = $1`;
type _V_DraftDistinctUserIds = Expect<
    Equal<ValidateSQL<Q_DraftDistinctUserIds, Main>, true>
>;
type _R_DraftDistinctUserIds = Expect<
    Equal<
        GetReturnType<Q_DraftDistinctUserIds, Main>,
        { userId: string | null }
    >
>;

// ---------------------------------------------------------------------------
// handlers/revolutPaymentDraft.ts:116-120 — invalidate invoices
// ---------------------------------------------------------------------------
type Q_InvalidateInvoices = `
    update "Revolut_PaymentInvoice"
    set "status" = 'cancelled'
    where "paymentId" = $1
`;
type _V_InvalidateInvoices = Expect<
    Equal<ValidateSQL<Q_InvalidateInvoices, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/revolutPaymentDraft.ts:127-131 — delete invoices
// ---------------------------------------------------------------------------
type Q_DeleteInvoices = `
    delete from "Revolut_PaymentInvoice"
    where "paymentId" = $1
`;
type _V_DeleteInvoices = Expect<
    Equal<ValidateSQL<Q_DeleteInvoices, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/revolutPaymentDraft.ts:137-141 — make invoice active
// ---------------------------------------------------------------------------
type Q_MakeInvoiceActive = `
    update "Revolut_PaymentInvoice"
    set "status" = 'active'
    where "paymentId" = $1 and "status" = 'pending'
`;
type _V_MakeInvoiceActive = Expect<
    Equal<ValidateSQL<Q_MakeInvoiceActive, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/networkOrderRakutenItem.ts:89-92 — order id by orderId
// (materialized: '${orderId}' -> 'ord-1')
// ---------------------------------------------------------------------------
type Q_RakutenOrderIdByOrderId = `
    select "id" from "Network_Order"
    where "orderId" = 'ord-1';
`;
type _V_RakutenOrderIdByOrderId = Expect<
    Equal<ValidateSQL<Q_RakutenOrderIdByOrderId, Main>, true>
>;
type _R_RakutenOrderIdByOrderId = Expect<
    Equal<GetReturnType<Q_RakutenOrderIdByOrderId, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// handlers/networkOrderRakutenItemSnapshot.ts:18-23 — update rakuten item
// ---------------------------------------------------------------------------
type Q_UpdateRakutenItemSnapshot = `
    update "Network_Order_Rakuten_Item" set
    "processDate" = $1,
    "details" = $2
    where id = $3
`;
type _V_UpdateRakutenItemSnapshot = Expect<
    Equal<ValidateSQL<Q_UpdateRakutenItemSnapshot, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/networkOrder.ts:339-345 — insert partnerize item
// ---------------------------------------------------------------------------
type Q_InsertPartnerizeItem = `
    insert into "Network_Order_Partnerize_Item"
        ("orderId", "conversionItemId", "name", "brand", "itemValue",
        "itemCommission", "currency", "sku", "quantity", "status",
        "lastUpdatedAt", "details", "payable", "selfBillId")
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
`;
type _V_InsertPartnerizeItem = Expect<
    Equal<ValidateSQL<Q_InsertPartnerizeItem, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/networkOrder.ts:444 — delete approved payment
// ---------------------------------------------------------------------------
type Q_DeleteApprovedPayment =
    `delete from "User_ApprovedPayment" where id = $1`;
type _V_DeleteApprovedPayment = Expect<
    Equal<ValidateSQL<Q_DeleteApprovedPayment, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/networkOrder.ts:473-488 — update partnerize item
// ---------------------------------------------------------------------------
type Q_UpdatePartnerizeItem = `
    update "Network_Order_Partnerize_Item"
    set
    "name" = $1,
    "brand" = $2,
    "sku" = $3,
    "itemValue" = $4,
    "itemCommission" = $5,
    "quantity" = $6,
    "status" = $7,
    "lastUpdatedAt" = $8,
    "details" = $9,
    "payable" = $10,
    "selfBillId" = $11
    where "orderId" = $12 and "conversionItemId" = $13
`;
type _V_UpdatePartnerizeItem = Expect<
    Equal<ValidateSQL<Q_UpdatePartnerizeItem, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/userExpoPushToken.ts:110-115 — upsert pushEnabledTimes
// ---------------------------------------------------------------------------
type Q_UpsertPushEnabledTimes = `
    insert into "User_Analytics" ("userId", "pushEnabledTimes")
    values ($1, 1)
    on conflict("userId") do update
        set "pushEnabledTimes" = "User_Analytics"."pushEnabledTimes" + excluded."pushEnabledTimes"
`;
// SCHEMA-GAP: User_Analytics.pushEnabledTimes (column absent from fixture)
type _V_UpsertPushEnabledTimes = Expect<
    Equal<ValidateSQL<Q_UpsertPushEnabledTimes, Main>, true>
>;

// ---------------------------------------------------------------------------
// handlers/catalogueProductReference.ts:23 — product retailer (CATALOGUE)
// ---------------------------------------------------------------------------
type Q_CatalogueProductRetailer = `select retailer from product where id = $1`;
type _V_CatalogueProductRetailer = Expect<
    Equal<ValidateSQL<Q_CatalogueProductRetailer, Catalogue>, true>
>;
type _R_CatalogueProductRetailer = Expect<
    Equal<
        GetReturnType<Q_CatalogueProductRetailer, Catalogue>,
        { retailer: string }
    >
>;

// ---------------------------------------------------------------------------
// handlers/catalogueProductReference.ts:35-38 — file id by group/region (CATALOGUE)
// ---------------------------------------------------------------------------
type Q_CatalogueFileId = `
    select id from file
    where file_group_id = $1 and region = $2
`;
type _V_CatalogueFileId = Expect<
    Equal<ValidateSQL<Q_CatalogueFileId, Catalogue>, true>
>;
type _R_CatalogueFileId = Expect<
    Equal<GetReturnType<Q_CatalogueFileId, Catalogue>, { id: string }>
>;

// ---------------------------------------------------------------------------
// handlers/catalogueProductReference.ts:47-51 — mark product_metadata used (CATALOGUE)
// ---------------------------------------------------------------------------
type Q_MarkProductMetadataUsed = `
    update product_metadata
    set used = true
    where product_id = $1 and file_id = $2
`;
type _V_MarkProductMetadataUsed = Expect<
    Equal<ValidateSQL<Q_MarkProductMetadataUsed, Catalogue>, true>
>;
