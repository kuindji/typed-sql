/**
 * hasura-trigger builder duplicates (SELECT only) — static mirrors of the raw
 * SELECTs in /Users/kuindji/Projects/TheFloorr/monorepo/serverless/api/hasura-trigger.
 * INSERT/UPDATE/DELETE are skipped (builder is SELECT-only). Setup-only: row-type
 * assertions encode the INTENDED shape; failures => engine fix-list.
 *
 * Skipped (non-SELECT) raw SQL:
 *   - userApprovedPayment.ts:79  insert into "User_ApprovedPayment_Item" ... select
 *   - networkOrderPartnerizeItem.ts:83  update "Network_Order"
 *   - revolutCounterparty.ts:27  insert into "User_Analytics" ... on conflict
 *   - revolutPaymentInvoice.ts:38  insert into "Revolut_PaymentCreditNote"
 *   - revolutPaymentDraft.ts:116/127/137  update/delete "Revolut_PaymentInvoice"
 *   - networkOrderRakutenItemSnapshot.ts:18  update "Network_Order_Rakuten_Item"
 *   - networkOrder.ts:339  insert into "Network_Order_Partnerize_Item"
 *   - networkOrder.ts:444  delete from "User_ApprovedPayment"
 *   - networkOrder.ts:473  update "Network_Order_Partnerize_Item"
 *   - userExpoPushToken.ts:110  insert into "User_Analytics" ... on conflict
 *   - catalogueProductReference.ts:47  update product_metadata
 */
import { describe, it, expect } from "bun:test";
import { createSelectQuery, normalizeWhitespace } from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

// --- networkRakutenInvoiceSettlement.ts:13-17 ---
const qRakutenSettlementOrderIds = createSelectQuery<ReportingV2Schema>()
    .withParams({ invoiceId: "inv1" })
    .from(`"Network_Payment_Invoice_Item_Rakuten" pi`)
    .where(`pi."invoiceId" = :invoiceId`)
    .select(`distinct pi."orderId"`);

// --- networkRakutenInvoiceSettlement.ts:23-30 ---
const qRakutenSettlementItemIds = createSelectQuery<ReportingV2Schema>()
    .withParams({ invoiceId: "inv1" })
    .from(`"Network_Order_Rakuten_Item" i`)
    .join(
        `join "Network_Payment_Invoice_Item_Rakuten" pi on pi."orderId" = i."rawOrderId" and pi."matchingSku" = i."sku"`,
    )
    .where(`pi."invoiceId" = :invoiceId`)
    .select(`distinct i."id"`);

// --- networkPaymentRakuten.ts:13-19 ---
const qRakutenPaymentOrderIds = createSelectQuery<ReportingV2Schema>()
    .withParams({ paymentId: "pay1" })
    .from(`"Network_Payment_Invoice_Item_Rakuten" i`)
    .join(
        `join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = i."invoiceId"`,
    )
    .where(`nip."paymentId" = :paymentId`)
    .select(`distinct i."orderId"`);

// --- networkPaymentRakuten.ts:26-35 ---
const qRakutenPaymentItemIds = createSelectQuery<ReportingV2Schema>()
    .withParams({ paymentId: "pay1" })
    .from(`"Network_Order_Rakuten_Item" i`)
    .join(
        `join "Network_Payment_Invoice_Item_Rakuten" pi on pi."orderId" = i."rawOrderId" and pi."matchingSku" = i."sku"`,
    )
    .join(
        `join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = pi."invoiceId"`,
    )
    .where(`nip."paymentId" = :paymentId`)
    .select(`distinct i."id"`);

// --- revolutPaymentInvoice.ts:10-13 --- (SCHEMA-GAP: Revolut_PaymentCreditNote)
const qCreditNoteExistsCount = createSelectQuery<ReportingV2Schema>()
    .withParams({ invoiceId: "inv1" })
    .from(`"Revolut_PaymentCreditNote"`)
    .where(`"invoiceId" = :invoiceId`)
    .select(`count(*) as cnt`);

// --- invitation.ts:58-62 --- (SCHEMA-GAP: Invitation)
const qInvitationCount = createSelectQuery<ReportingV2Schema>()
    .withParams({ createdBy: "u1", invitationId: "i1" })
    .from(`"Invitation"`)
    .where(`"createdBy" = :createdBy`)
    .where(`accepted = true`)
    .where(`id != :invitationId`)
    .select(`count(*) as cnt`);

// --- product.ts:12 ---
const qLookFriId = createSelectQuery<ReportingV2Schema>()
    .withParams({ lookId: "l1" })
    .from(`"Look"`)
    .where(`id = :lookId`)
    .select(`"friId"`);

// --- networkPaymentCJ.ts:23-27 ---
const qCJPaymentOrderIds = createSelectQuery<ReportingV2Schema>()
    .withParams({ paymentId: "pay1" })
    .from(`"Network_Payment_CJ_Order"`)
    .where(`"paymentId" = :paymentId`)
    .select(`"orderId"`);

// --- revolutPaymentDraft.ts:15-19 ---
const qDraftNetworkOrderIds = createSelectQuery<ReportingV2Schema>()
    .withParams({ revolutDraftId: "d1" })
    .from(`"User_ApprovedPayment"`)
    .where(`"revolutDraftId" = :revolutDraftId`)
    .select(`"networkOrderId"`);

// --- revolutPaymentDraft.ts:93-95 ---
const qDraftDistinctUserIds = createSelectQuery<ReportingV2Schema>()
    .withParams({ revolutDraftId: "d1" })
    .from(`"User_ApprovedPayment"`)
    .where(`"revolutDraftId" = :revolutDraftId`)
    .select(`distinct "userId"`);

// --- networkOrderRakutenItem.ts:89-92 --- (materialized: 'ord-1')
const qRakutenOrderIdByOrderId = createSelectQuery<ReportingV2Schema>()
    .from(`"Network_Order"`)
    .where(`"orderId" = 'ord-1'`)
    .select(`"id"`);

// --- catalogueProductReference.ts:23 --- (CATALOGUE)
const qCatalogueProductRetailer = createSelectQuery<ReportingV2CatalogueSchema>()
    .withParams({ id: "p1" })
    .from(`product`)
    .where(`id = :id`)
    .select(`retailer`);

// --- catalogueProductReference.ts:35-38 --- (CATALOGUE)
const qCatalogueFileId = createSelectQuery<ReportingV2CatalogueSchema>()
    .withParams({ fileGroupId: "g1", region: "GB" })
    .from(`file`)
    .where(`file_group_id = :fileGroupId`)
    .where(`region = :region`)
    .select(`id`);

describe("hasura-trigger builder duplicates", () => {
    it("qRakutenSettlementOrderIds assembles", () => {
        expect(normalizeWhitespace(qRakutenSettlementOrderIds.toString())).toBe(
            normalizeWhitespace(
                `SELECT distinct pi."orderId" FROM "Network_Payment_Invoice_Item_Rakuten" pi WHERE pi."invoiceId" = $1`,
            ),
        );
    });

    it("qRakutenSettlementItemIds assembles", () => {
        expect(normalizeWhitespace(qRakutenSettlementItemIds.toString())).toBe(
            normalizeWhitespace(
                `SELECT distinct i."id" FROM "Network_Order_Rakuten_Item" i ` +
                    `join "Network_Payment_Invoice_Item_Rakuten" pi on pi."orderId" = i."rawOrderId" and pi."matchingSku" = i."sku" ` +
                    `WHERE pi."invoiceId" = $1`,
            ),
        );
    });

    it("qRakutenPaymentOrderIds assembles", () => {
        expect(normalizeWhitespace(qRakutenPaymentOrderIds.toString())).toBe(
            normalizeWhitespace(
                `SELECT distinct i."orderId" FROM "Network_Payment_Invoice_Item_Rakuten" i ` +
                    `join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = i."invoiceId" ` +
                    `WHERE nip."paymentId" = $1`,
            ),
        );
    });

    it("qRakutenPaymentItemIds assembles", () => {
        expect(normalizeWhitespace(qRakutenPaymentItemIds.toString())).toBe(
            normalizeWhitespace(
                `SELECT distinct i."id" FROM "Network_Order_Rakuten_Item" i ` +
                    `join "Network_Payment_Invoice_Item_Rakuten" pi on pi."orderId" = i."rawOrderId" and pi."matchingSku" = i."sku" ` +
                    `join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = pi."invoiceId" ` +
                    `WHERE nip."paymentId" = $1`,
            ),
        );
    });

    it("qCreditNoteExistsCount assembles", () => {
        expect(normalizeWhitespace(qCreditNoteExistsCount.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*) as cnt FROM "Revolut_PaymentCreditNote" WHERE "invoiceId" = $1`,
            ),
        );
    });

    it("qInvitationCount assembles", () => {
        expect(normalizeWhitespace(qInvitationCount.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*) as cnt FROM "Invitation" WHERE "createdBy" = $1 AND accepted = true AND id != $2`,
            ),
        );
    });

    it("qLookFriId assembles", () => {
        expect(normalizeWhitespace(qLookFriId.toString())).toBe(
            normalizeWhitespace(`SELECT "friId" FROM "Look" WHERE id = $1`),
        );
    });

    it("qCJPaymentOrderIds assembles", () => {
        expect(normalizeWhitespace(qCJPaymentOrderIds.toString())).toBe(
            normalizeWhitespace(
                `SELECT "orderId" FROM "Network_Payment_CJ_Order" WHERE "paymentId" = $1`,
            ),
        );
    });

    it("qDraftNetworkOrderIds assembles", () => {
        expect(normalizeWhitespace(qDraftNetworkOrderIds.toString())).toBe(
            normalizeWhitespace(
                `SELECT "networkOrderId" FROM "User_ApprovedPayment" WHERE "revolutDraftId" = $1`,
            ),
        );
    });

    it("qDraftDistinctUserIds assembles", () => {
        expect(normalizeWhitespace(qDraftDistinctUserIds.toString())).toBe(
            normalizeWhitespace(
                `SELECT distinct "userId" FROM "User_ApprovedPayment" WHERE "revolutDraftId" = $1`,
            ),
        );
    });

    it("qRakutenOrderIdByOrderId assembles", () => {
        expect(normalizeWhitespace(qRakutenOrderIdByOrderId.toString())).toBe(
            normalizeWhitespace(
                `SELECT "id" FROM "Network_Order" WHERE "orderId" = 'ord-1'`,
            ),
        );
    });

    it("qCatalogueProductRetailer assembles", () => {
        expect(normalizeWhitespace(qCatalogueProductRetailer.toString())).toBe(
            normalizeWhitespace(`SELECT retailer FROM product WHERE id = $1`),
        );
    });

    it("qCatalogueFileId assembles", () => {
        expect(normalizeWhitespace(qCatalogueFileId.toString())).toBe(
            normalizeWhitespace(
                `SELECT id FROM file WHERE file_group_id = $1 AND region = $2`,
            ),
        );
    });
});

// Type-level row assertions (INTENDED shapes).
type Row_RakutenSettlementOrderIds = SelectBuilderResult<typeof qRakutenSettlementOrderIds>;
type _Row_RakutenSettlementOrderIds = RequireTrue<
    AssertEqual<Row_RakutenSettlementOrderIds, { orderId: string }>
>;

type Row_RakutenSettlementItemIds = SelectBuilderResult<typeof qRakutenSettlementItemIds>;
type _Row_RakutenSettlementItemIds = RequireTrue<
    AssertEqual<Row_RakutenSettlementItemIds, { id: string }>
>;

type Row_RakutenPaymentOrderIds = SelectBuilderResult<typeof qRakutenPaymentOrderIds>;
type _Row_RakutenPaymentOrderIds = RequireTrue<
    AssertEqual<Row_RakutenPaymentOrderIds, { orderId: string }>
>;

type Row_RakutenPaymentItemIds = SelectBuilderResult<typeof qRakutenPaymentItemIds>;
type _Row_RakutenPaymentItemIds = RequireTrue<
    AssertEqual<Row_RakutenPaymentItemIds, { id: string }>
>;

// SCHEMA-GAP: Revolut_PaymentCreditNote
type Row_CreditNoteExistsCount = SelectBuilderResult<typeof qCreditNoteExistsCount>;
type _Row_CreditNoteExistsCount = RequireTrue<
    AssertEqual<Row_CreditNoteExistsCount, { cnt: number }>
>;

// SCHEMA-GAP: Invitation
type Row_InvitationCount = SelectBuilderResult<typeof qInvitationCount>;
type _Row_InvitationCount = RequireTrue<
    AssertEqual<Row_InvitationCount, { cnt: number }>
>;

type Row_LookFriId = SelectBuilderResult<typeof qLookFriId>;
type _Row_LookFriId = RequireTrue<
    AssertEqual<Row_LookFriId, { friId: string | null }>
>;

type Row_CJPaymentOrderIds = SelectBuilderResult<typeof qCJPaymentOrderIds>;
type _Row_CJPaymentOrderIds = RequireTrue<
    AssertEqual<Row_CJPaymentOrderIds, { orderId: string }>
>;

type Row_DraftNetworkOrderIds = SelectBuilderResult<typeof qDraftNetworkOrderIds>;
type _Row_DraftNetworkOrderIds = RequireTrue<
    AssertEqual<Row_DraftNetworkOrderIds, { networkOrderId: string | null }>
>;

type Row_DraftDistinctUserIds = SelectBuilderResult<typeof qDraftDistinctUserIds>;
type _Row_DraftDistinctUserIds = RequireTrue<
    AssertEqual<Row_DraftDistinctUserIds, { userId: string | null }>
>;

type Row_RakutenOrderIdByOrderId = SelectBuilderResult<typeof qRakutenOrderIdByOrderId>;
type _Row_RakutenOrderIdByOrderId = RequireTrue<
    AssertEqual<Row_RakutenOrderIdByOrderId, { id: string }>
>;

type Row_CatalogueProductRetailer = SelectBuilderResult<typeof qCatalogueProductRetailer>;
type _Row_CatalogueProductRetailer = RequireTrue<
    AssertEqual<Row_CatalogueProductRetailer, { retailer: string }>
>;

type Row_CatalogueFileId = SelectBuilderResult<typeof qCatalogueFileId>;
type _Row_CatalogueFileId = RequireTrue<
    AssertEqual<Row_CatalogueFileId, { id: string }>
>;
