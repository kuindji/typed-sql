/**
 * Commerce hasura-trigger — DML builder runtime mirrors (INSERT / UPDATE / DELETE).
 *
 * Companion to hasura-trigger-builder.test.ts (which only mirrors SELECTs). This
 * file fills the gap: every raw INSERT/UPDATE/DELETE in commerce app area
 * hasura-trigger, rebuilt with createInsertQuery / createUpdateQuery /
 * createDeleteQuery, plus a createSql fallback for the constructs the fluent
 * builder cannot model yet (INSERT ... SELECT).
 *
 * Setup-only / COLLECTION pass: assertions encode the INTENDED emitted SQL +
 * ordered params; failures => engine fix-list. Reds are acceptable.
 *
 * Source positional placeholders ($1, $2, ...) are mirrored with named params
 * (:p) that the builder re-numbers to $1, $2, ... in call order. Literal SQL
 * fragments (now(), 1, true, 'cancelled', excluded.*) are passed as raw text.
 *
 * Builder columns in these fixtures are plain `string` (not branded), so plain
 * string/number values in withParams are fine.
 */
import { describe, it, expect } from "bun:test";
import {
    createInsertQuery,
    createUpdateQuery,
    createDeleteQuery,
    createSql,
} from "../../../src/builder/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";

type S = ReportingV2Schema;
type C = ReportingV2CatalogueSchema;

const sql = createSql<S>();

// ===========================================================================
// DELETE
// ===========================================================================
describe("hasura-trigger DML builder — DELETE", () => {
    // --- networkOrder.ts:444 — delete approved payment ---
    it("qDeleteApprovedPayment assembles", () => {
        const q = createDeleteQuery<S>()
            .from(`"User_ApprovedPayment"`)
            .where(`id = :id`)
            .withParams({ id: "uap1" });
        expect(q.toString()).toBe(
            `delete from "User_ApprovedPayment" where id = $1`,
        );
        expect([...q.getParams()]).toEqual(["uap1"]);
    });

    // --- revolutPaymentDraft.ts:127-131 — delete invoices ---
    it("qDeleteInvoices assembles", () => {
        const q = createDeleteQuery<S>()
            .from(`"Revolut_PaymentInvoice"`)
            .where(`"paymentId" = :paymentId`)
            .withParams({ paymentId: "pay1" });
        expect(q.toString()).toBe(
            `delete from "Revolut_PaymentInvoice" where "paymentId" = $1`,
        );
        expect([...q.getParams()]).toEqual(["pay1"]);
    });
});

// ===========================================================================
// UPDATE
// ===========================================================================
describe("hasura-trigger DML builder — UPDATE", () => {
    // --- networkOrderPartnerizeItem.ts:83-87 — update order rollups ---
    it("qUpdateNetworkOrderRollups assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"Network_Order"`)
            .set(`"saleAmount" = :saleAmount`)
            .set(`"commissionAmount" = :commissionAmount`)
            .where(`"orderId" = :orderId`)
            .withParams({
                saleAmount: "100.00",
                commissionAmount: "10.00",
                orderId: "ord-1",
            });
        expect(q.toString()).toBe(
            `update "Network_Order" set "saleAmount" = $1, "commissionAmount" = $2 ` +
                `where "orderId" = $3`,
        );
        expect([...q.getParams()]).toEqual(["100.00", "10.00", "ord-1"]);
    });

    // --- networkOrder.ts:473-488 — update partnerize item ---
    it("qUpdatePartnerizeItem assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"Network_Order_Partnerize_Item"`)
            .set(`"name" = :name`)
            .set(`"brand" = :brand`)
            .set(`"sku" = :sku`)
            .set(`"itemValue" = :itemValue`)
            .set(`"itemCommission" = :itemCommission`)
            .set(`"quantity" = :quantity`)
            .set(`"status" = :status`)
            .set(`"lastUpdatedAt" = :lastUpdatedAt`)
            .set(`"details" = :details`)
            .set(`"payable" = :payable`)
            .set(`"selfBillId" = :selfBillId`)
            .where(`"orderId" = :orderId`)
            .where(`"conversionItemId" = :conversionItemId`)
            .withParams({
                name: "prod",
                brand: "brand",
                sku: "sku-1",
                itemValue: "9.99",
                itemCommission: "1.00",
                quantity: "1",
                status: "approved",
                lastUpdatedAt: "2026-01-01T00:00:00.000Z",
                details: "{}",
                payable: "9.99",
                selfBillId: "sb-1",
                orderId: "ord-1",
                conversionItemId: "ci-1",
            });
        expect(q.toString()).toBe(
            `update "Network_Order_Partnerize_Item" set ` +
                `"name" = $1, "brand" = $2, "sku" = $3, "itemValue" = $4, ` +
                `"itemCommission" = $5, "quantity" = $6, "status" = $7, ` +
                `"lastUpdatedAt" = $8, "details" = $9, "payable" = $10, "selfBillId" = $11 ` +
                `where "orderId" = $12 and "conversionItemId" = $13`,
        );
        expect([...q.getParams()]).toEqual([
            "prod",
            "brand",
            "sku-1",
            "9.99",
            "1.00",
            "1",
            "approved",
            "2026-01-01T00:00:00.000Z",
            "{}",
            "9.99",
            "sb-1",
            "ord-1",
            "ci-1",
        ]);
    });

    // --- networkOrderRakutenItemSnapshot.ts:18-23 — update rakuten item ---
    it("qUpdateRakutenItemSnapshot assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"Network_Order_Rakuten_Item"`)
            .set(`"processDate" = :processDate`)
            .set(`"details" = :details`)
            .where(`id = :id`)
            .withParams({
                processDate: "2026-01-01",
                details: "{}",
                id: "ri-1",
            });
        expect(q.toString()).toBe(
            `update "Network_Order_Rakuten_Item" set "processDate" = $1, "details" = $2 ` +
                `where id = $3`,
        );
        expect([...q.getParams()]).toEqual(["2026-01-01", "{}", "ri-1"]);
    });

    // --- revolutPaymentDraft.ts:116-120 — invalidate invoices ---
    it("qInvalidateInvoices assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"Revolut_PaymentInvoice"`)
            .set(`"status" = 'cancelled'`)
            .where(`"paymentId" = :paymentId`)
            .withParams({ paymentId: "pay1" });
        expect(q.toString()).toBe(
            `update "Revolut_PaymentInvoice" set "status" = 'cancelled' where "paymentId" = $1`,
        );
        expect([...q.getParams()]).toEqual(["pay1"]);
    });

    // --- revolutPaymentDraft.ts:137-141 — make invoice active ---
    it("qMakeInvoiceActive assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"Revolut_PaymentInvoice"`)
            .set(`"status" = 'active'`)
            .where(`"paymentId" = :paymentId`)
            .where(`"status" = 'pending'`)
            .withParams({ paymentId: "pay1" });
        expect(q.toString()).toBe(
            `update "Revolut_PaymentInvoice" set "status" = 'active' ` +
                `where "paymentId" = $1 and "status" = 'pending'`,
        );
        expect([...q.getParams()]).toEqual(["pay1"]);
    });

    // --- catalogueProductReference.ts:47-51 — mark product_metadata used (CATALOGUE) ---
    it("qMarkProductMetadataUsed assembles", () => {
        const q = createUpdateQuery<C>()
            .table(`product_metadata`)
            .set(`used = true`)
            .where(`product_id = :productId`)
            .where(`file_id = :fileId`)
            .withParams({ productId: "p1", fileId: "f1" });
        expect(q.toString()).toBe(
            `update product_metadata set used = true where product_id = $1 and file_id = $2`,
        );
        expect([...q.getParams()]).toEqual(["p1", "f1"]);
    });
});

// ===========================================================================
// INSERT (single-row VALUES — builder-expressible)
// ===========================================================================
describe("hasura-trigger DML builder — INSERT", () => {
    // --- networkOrder.ts:339-345 — insert partnerize item (14 cols) ---
    it("qInsertPartnerizeItem assembles", () => {
        const q = createInsertQuery<S>()
            .into(`"Network_Order_Partnerize_Item"`)
            .value(`"orderId"`, ":orderId")
            .value(`"conversionItemId"`, ":conversionItemId")
            .value(`"name"`, ":name")
            .value(`"brand"`, ":brand")
            .value(`"itemValue"`, ":itemValue")
            .value(`"itemCommission"`, ":itemCommission")
            .value(`"currency"`, ":currency")
            .value(`"sku"`, ":sku")
            .value(`"quantity"`, ":quantity")
            .value(`"status"`, ":status")
            .value(`"lastUpdatedAt"`, ":lastUpdatedAt")
            .value(`"details"`, ":details")
            .value(`"payable"`, ":payable")
            .value(`"selfBillId"`, ":selfBillId")
            .withParams({
                orderId: "ord-1",
                conversionItemId: "ci-1",
                name: "prod",
                brand: "brand",
                itemValue: "9.99",
                itemCommission: "1.00",
                currency: "GBP",
                sku: "sku-1",
                quantity: "1",
                status: "approved",
                lastUpdatedAt: "2026-01-01T00:00:00.000Z",
                details: "{}",
                payable: "9.99",
                selfBillId: "sb-1",
            });
        expect(q.toString()).toBe(
            `insert into "Network_Order_Partnerize_Item" ` +
                `("orderId", "conversionItemId", "name", "brand", "itemValue", ` +
                `"itemCommission", "currency", "sku", "quantity", "status", ` +
                `"lastUpdatedAt", "details", "payable", "selfBillId") ` +
                `values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        );
        expect([...q.getParams()]).toEqual([
            "ord-1",
            "ci-1",
            "prod",
            "brand",
            "9.99",
            "1.00",
            "GBP",
            "sku-1",
            "1",
            "approved",
            "2026-01-01T00:00:00.000Z",
            "{}",
            "9.99",
            "sb-1",
        ]);
    });

    // --- revolutPaymentInvoice.ts:38-42 — prepareInsert credit note ---
    // SCHEMA-GAP: Revolut_PaymentCreditNote present in fixture; columns mirror
    // the prepareInsert key order (id, invoiceId, amount, vat, currency, data,
    // paymentId, userId, createdAt).
    it("qInsertCreditNote assembles", () => {
        const q = createInsertQuery<S>()
            .into(`"Revolut_PaymentCreditNote"`)
            .value(`"id"`, ":id")
            .value(`"invoiceId"`, ":invoiceId")
            .value(`"amount"`, ":amount")
            .value(`"vat"`, ":vat")
            .value(`"currency"`, ":currency")
            .value(`"data"`, ":data")
            .value(`"paymentId"`, ":paymentId")
            .value(`"userId"`, ":userId")
            .value(`"createdAt"`, ":createdAt")
            .withParams({
                id: "CRN-1",
                invoiceId: "INV-1",
                amount: -10,
                vat: -2,
                currency: "GBP",
                data: "{}",
                paymentId: "pay1",
                userId: "u1",
                createdAt: "2026-01-01T00:00:00.000Z",
            });
        expect(q.toString()).toBe(
            `insert into "Revolut_PaymentCreditNote" ` +
                `("id", "invoiceId", "amount", "vat", "currency", "data", "paymentId", "userId", "createdAt") ` +
                `values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        );
        expect([...q.getParams()]).toEqual([
            "CRN-1",
            "INV-1",
            -10,
            -2,
            "GBP",
            "{}",
            "pay1",
            "u1",
            "2026-01-01T00:00:00.000Z",
        ]);
    });
});

// ===========================================================================
// INSERT ... ON CONFLICT (upsert — builder-expressible via .onConflict)
// ===========================================================================
describe("hasura-trigger DML builder — upsert (ON CONFLICT)", () => {
    // --- revolutCounterparty.ts:27-37 — upsert User_Analytics bank details ---
    it("qUpsertUserAnalyticsBankDetails assembles", () => {
        const q = createInsertQuery<S>()
            .into(`"User_Analytics"`)
            .value(`"userId"`, ":userId")
            .value(`"bankDetailsFirstAddedAt"`, "now()")
            .value(`"bankDetailsAddedNum"`, "1")
            .onConflict(
                `("userId") do update set ` +
                    `"bankDetailsFirstAddedAt" = coalesce("User_Analytics"."bankDetailsFirstAddedAt", excluded."bankDetailsFirstAddedAt"), ` +
                    `"bankDetailsAddedNum" = "User_Analytics"."bankDetailsAddedNum" + excluded."bankDetailsAddedNum"`,
            )
            .withParams({ userId: "u1" });
        expect(q.toString()).toBe(
            `insert into "User_Analytics" ("userId", "bankDetailsFirstAddedAt", "bankDetailsAddedNum") ` +
                `values ($1, now(), 1) ` +
                `on conflict ("userId") do update set ` +
                `"bankDetailsFirstAddedAt" = coalesce("User_Analytics"."bankDetailsFirstAddedAt", excluded."bankDetailsFirstAddedAt"), ` +
                `"bankDetailsAddedNum" = "User_Analytics"."bankDetailsAddedNum" + excluded."bankDetailsAddedNum"`,
        );
        expect([...q.getParams()]).toEqual(["u1"]);
    });

    // --- userExpoPushToken.ts:110-115 — upsert User_Analytics pushEnabledTimes ---
    it("qUpsertPushEnabledTimes assembles", () => {
        const q = createInsertQuery<S>()
            .into(`"User_Analytics"`)
            .value(`"userId"`, ":userId")
            .value(`"pushEnabledTimes"`, "1")
            .onConflict(
                `("userId") do update set ` +
                    `"pushEnabledTimes" = "User_Analytics"."pushEnabledTimes" + excluded."pushEnabledTimes"`,
            )
            .withParams({ userId: "u1" });
        expect(q.toString()).toBe(
            `insert into "User_Analytics" ("userId", "pushEnabledTimes") ` +
                `values ($1, 1) ` +
                `on conflict ("userId") do update set ` +
                `"pushEnabledTimes" = "User_Analytics"."pushEnabledTimes" + excluded."pushEnabledTimes"`,
        );
        expect([...q.getParams()]).toEqual(["u1"]);
    });
});

// ===========================================================================
// Builder-inexpressible — createSql typed-raw fallback
// ===========================================================================
describe("hasura-trigger DML builder — createSql fallback", () => {
    // --- userApprovedPayment.ts:79-111 — insert ... select with VAT CASE ---
    // TODO(builder-api): INSERT ... SELECT (with joins + CASE) — the fluent
    // INSERT builder only models single-row VALUES, not INSERT-from-SELECT.
    // (materialized: ${itemIdField[networkId]} -> "cjItemId",
    //  ${itemTables[networkId]} -> "Network_Order_CJ_Item")
    it("qCreateApprovedPaymentItems assembles via createSql", () => {
        const q = sql(
            `insert into "User_ApprovedPayment_Item" ` +
                `("userApprovedPaymentId", "cjItemId", "anyItemId", "amount", "vat", "currency") ` +
                `select :uapId, i."id", i."id", i."pseBalance", ` +
                `(i."pseBalance" * (case when tps."teamId" is not null then ` +
                `case when tps."vatEnabled" is true and tps."vatCountry" = 'GB' then 0.2 else 0 end ` +
                `else case when ups."vatEnabled" is true and ups."vatCountry" = 'GB' then 0.2 else 0 end end)) as "vat", ` +
                `o.currency ` +
                `from "Network_Order_CJ_Item" i ` +
                `join "Network_Order" o on o."orderId" = i."orderId" ` +
                `join "LogProductClick" lpc on lpc."sid" = o."clickId" ` +
                `left join "User_PaymentSettings" ups on ups."userId" = lpc."shopperId" ` +
                `left join "Team_PaymentSettings" tps on tps."teamId" = lpc."teamId" ` +
                `where i."orderId" = :orderId`,
        ).withParams({ uapId: "uap1", orderId: "ord-1" });
        expect(q.toString()).toBe(
            `insert into "User_ApprovedPayment_Item" ` +
                `("userApprovedPaymentId", "cjItemId", "anyItemId", "amount", "vat", "currency") ` +
                `select $1, i."id", i."id", i."pseBalance", ` +
                `(i."pseBalance" * (case when tps."teamId" is not null then ` +
                `case when tps."vatEnabled" is true and tps."vatCountry" = 'GB' then 0.2 else 0 end ` +
                `else case when ups."vatEnabled" is true and ups."vatCountry" = 'GB' then 0.2 else 0 end end)) as "vat", ` +
                `o.currency ` +
                `from "Network_Order_CJ_Item" i ` +
                `join "Network_Order" o on o."orderId" = i."orderId" ` +
                `join "LogProductClick" lpc on lpc."sid" = o."clickId" ` +
                `left join "User_PaymentSettings" ups on ups."userId" = lpc."shopperId" ` +
                `left join "Team_PaymentSettings" tps on tps."teamId" = lpc."teamId" ` +
                `where i."orderId" = $2`,
        );
        expect([...q.getParams()]).toEqual(["uap1", "ord-1"]);
    });
});

export type CommerceHasuraTriggerDmlBuilderTestsPass = true;
