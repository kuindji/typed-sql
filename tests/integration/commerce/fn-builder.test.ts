/**
 * Commerce fn — builder runtime mirrors. Setup-only; failures => engine fix-list.
 *
 * Mirrors of raw SQL in the commerce `fn` lambda area. SELECTs use
 * createSelectQuery; INSERT/UPDATE use the write builders; constructs the fluent
 * builders can't model yet (ON CONFLICT, INSERT...SELECT, NOT EXISTS subqueries,
 * count(*), wildcard+join mixes) fall back to createSql and are tagged
 * TODO(builder-api).
 *
 * Builder columns in these fixtures are plain `string` (NOT branded), so plain
 * strings in withParams are fine.
 */
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createInsertQuery,
    createUpdateQuery,
    createSql,
} from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type {
    ReportingV2Schema,
} from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;

// ===========================================================================
// create-pse-invoice/src/index.ts
// ===========================================================================

// --- mirror of create-pse-invoice index.ts:16-25  checkInvoiceExists() ---
const qCheckInvoiceExists = createSelectQuery<S>()
    .from(`"Revolut_PaymentInvoice"`)
    .select(`id`)
    .where(`"paymentId" = :paymentId and "status" = 'active'`)
    .withParams({ paymentId: "p1" });

// --- mirror of create-pse-invoice index.ts:27-38  getPSEVatInfo() ---
const qGetPSEVatInfo = createSelectQuery<S>()
    .from(`"User_PaymentSettings"`)
    .select(`*`)
    .where(`"userId" = :userId`)
    .withParams({ userId: "u1" });

// --- mirror of create-pse-invoice index.ts:40-52  getPSEInfo() ---
const qGetPSEInfo = createSelectQuery<S>()
    .from(`"User"`)
    .select([`"givenName"`, `"familyName"`])
    .where(`"id" = :id`)
    .withParams({ id: "u1" });

// --- mirror of create-pse-invoice index.ts:56-67  getTeamCounterpartyId() ---
const qGetTeamCounterpartyId = createSelectQuery<S>()
    .from(`"Team_Revolut_Counterparty"`)
    .select(`"counterpartyId"`)
    .where(`"teamId" = :teamId`)
    .withParams({ teamId: "t1" });

// --- mirror of create-pse-invoice index.ts:72-83  getUserCounterpartyId() ---
const qGetUserCounterpartyId = createSelectQuery<S>()
    .from(`"Revolut_Counterparty"`)
    .select(`"counterpartyId"`)
    .where(`"userId" = :userId`)
    .withParams({ userId: "u1" });

// --- mirror of create-pse-invoice index.ts:89-100  getTeamName() ---
const qGetTeamName = createSelectQuery<S>()
    .from(`"Team"`)
    .select(`"name"`)
    .where(`"id" = :id`)
    .withParams({ id: "t1" });

// --- mirror of create-pse-invoice index.ts:104-115  getTeamPaymentSettings() ---
const qGetTeamPaymentSettings = createSelectQuery<S>()
    .from(`"Team_PaymentSettings"`)
    .select(`*`)
    .where(`"teamId" = :teamId`)
    .withParams({ teamId: "t1" });

// --- mirror of create-pse-invoice index.ts:117-128  getPayment() ---
const qGetPayment = createSelectQuery<S>()
    .from(`"Revolut_PaymentDraft"`)
    .select(`*`)
    .where(`"id" = :id`)
    .withParams({ id: "p1" });

// --- mirror of create-pse-invoice index.ts:132-164  getUserApprovedPayments() ---
// materialized from dynamic source: positional $2/$3 -> named :currency/:date.
const qGetUserApprovedPayments = createSelectQuery<S>()
    .from(`"User_ApprovedPayment" uap`)
    .join(`left join "User" u on u."id" = uap."userId"`)
    .join(`left join "Network_Order" no on no."id" = uap."networkOrderId"`)
    .select([
        `uap.id`,
        `uap."userId"`,
        `uap."networkOrderId"`,
        `uap.type`,
        `convert_currency(uap.amount::numeric, uap.currency, :currency, :onDate::date)::float8 as "amount"`,
        `convert_currency(uap.vat::numeric, uap.currency, :currency, :onDate::date)::float8 as "vat"`,
        `:currency as "currency"`,
        `uap.comment`,
        `uap."createdAt"`,
        `uap.paid`,
        `uap."paymentMonth"`,
        `uap."revolutDraftId"`,
        `uap."revolutReference"`,
        `uap.status`,
        `no."orderId"`,
        `no."orderDate"`,
        `no."advertiser" as "retailer"`,
        `(u."givenName" || ' ' || u."familyName")::text as "pseName"`,
    ])
    .where(`uap."revolutDraftId" = :draftId`)
    .withParams({ currency: "GBP", onDate: "2024-01-01", draftId: "d1" });

// ===========================================================================
// create-pse-invoice/src/generateInvoiceId.ts
// ===========================================================================

// --- mirror of generateInvoiceId.ts:31-38  generateInvoiceId() draft lookup ---
const qGenInvoiceDraft = createSelectQuery<S>()
    .from(`"Revolut_PaymentDraft"`)
    .select(`*`)
    .where(`"id" = :id`)
    .withParams({ id: "p1" });

// ===========================================================================
// process-cj-report/src/index.ts
// ===========================================================================

// --- mirror of process-cj-report index.ts:169-175  getPaymentRecord() ---
const qGetPaymentRecord = createSelectQuery<S>()
    .from(`"Network_Payment_CJ"`)
    .select(`*`)
    .where(`id = :id`)
    .withParams({ id: "cj1" });

// --- mirror of process-cj-report index.ts:180-183  createGroup() lookup ---
const qGetCJGroup = createSelectQuery<S>()
    .from(`"Network_Payment_CJ_Group"`)
    .select(`*`)
    .where(`id = :id`)
    .withParams({ id: "g1" });

// --- mirror of process-cj-report index.ts:197-205  getLocalOrderId() ---
const qGetLocalOrderId = createSelectQuery<S>()
    .from(`"Network_Order" no`)
    .select(`"id"`)
    .where(`no."networkId" = 'cj' and no."orderId" = :orderId`)
    .withParams({ orderId: "o1" });

// --- mirror of process-cj-report index.ts:225-234  processOrderRecord() paymentId ---
const qGetCJOrderPaymentId = createSelectQuery<S>()
    .from(`"Network_Payment_CJ_Order" npo`)
    .select(`"paymentId"`)
    .where(`npo."orderId" = :orderId`)
    .withParams({ orderId: "o1" });

// --- mirror of process-cj-report index.ts:248-255  processOrderRecord() by details ---
const qGetCJByDetails = createSelectQuery<S>()
    .from(`"Network_Payment_CJ" np`)
    .select(`*`)
    .where(`details->>'order_id' = :orderId`)
    .withParams({ orderId: "o1" });

// ===========================================================================
// actions/src/handlers/user/syncPosthog.ts
// ===========================================================================

// --- mirror of syncPosthog.ts:7-22  getAnalytics() ---
const qGetAnalytics = createSelectQuery<S>()
    .from(`"User_Analytics" ua`)
    .join(`join "User" u on u.id = ua."userId"`)
    .join(`left join "PSEApplication" pa on pa."userId" = ua."userId"`)
    .select([
        `u.email`,
        `u.phone`,
        `u."givenName"`,
        `u."familyName"`,
        `u."createdAt"`,
        `u."firstLoggedIn"`,
        `u."lastLoggedIn"`,
        `pa.id as "pseApplicationId"`,
        `ua.*`,
    ])
    .where(`ua."userId" = :userId`)
    .withParams({ userId: "u1" });

// ===========================================================================
// Write-builder mirrors (UPDATE)
// ===========================================================================

// --- mirror of generate-pse-invoice index.ts:56-63  UPDATE invoice s3key ---
// FIXTURE-GAP: Revolut_PaymentInvoice."s3key" — fixture has "s3Key" (case-insensitive).
const qUpdateInvoiceS3Key = createUpdateQuery<S>()
    .table(`"Revolut_PaymentInvoice"`)
    .set(`"s3key" = :key`)
    .where(`"id" = :id`)
    .withParams({ key: "env/pse/i1.pdf", id: "i1" });

// --- mirror of generate-pse-invoice index.ts:78-85  UPDATE credit note s3key ---
// FIXTURE-GAP: Revolut_PaymentCreditNote.s3key not in fixture (table exists, no s3key col).
const qUpdateCreditNoteS3Key = createUpdateQuery<S>()
    .table(`"Revolut_PaymentCreditNote"`)
    .set(`"s3key" = :key`)
    .where(`"id" = :id`)
    .withParams({ key: "env/pse/c1.pdf", id: "c1" });

// --- mirror of process-cj-report index.ts:238-245 / 258-265  UPDATE groupId ---
const qUpdateCJGroupId = createUpdateQuery<S>()
    .table(`"Network_Payment_CJ"`)
    .set(`"groupId" = :groupId`)
    .where(`id = :id`)
    .withParams({ groupId: "g1", id: "cj1" });

describe("commerce fn builder mirrors", () => {
    it("qCheckInvoiceExists assembles", () => {
        expect(normalizeWhitespace(qCheckInvoiceExists.toString())).toBe(
            normalizeWhitespace(
                `SELECT id FROM "Revolut_PaymentInvoice" WHERE "paymentId" = $1 and "status" = 'active'`,
            ),
        );
    });

    it("qGetPSEVatInfo assembles", () => {
        expect(normalizeWhitespace(qGetPSEVatInfo.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "User_PaymentSettings" WHERE "userId" = $1`,
            ),
        );
    });

    it("qGetPSEInfo assembles", () => {
        expect(normalizeWhitespace(qGetPSEInfo.toString())).toBe(
            normalizeWhitespace(
                `SELECT "givenName", "familyName" FROM "User" WHERE "id" = $1`,
            ),
        );
    });

    it("qGetTeamCounterpartyId assembles", () => {
        expect(normalizeWhitespace(qGetTeamCounterpartyId.toString())).toBe(
            normalizeWhitespace(
                `SELECT "counterpartyId" FROM "Team_Revolut_Counterparty" WHERE "teamId" = $1`,
            ),
        );
    });

    it("qGetUserCounterpartyId assembles", () => {
        expect(normalizeWhitespace(qGetUserCounterpartyId.toString())).toBe(
            normalizeWhitespace(
                `SELECT "counterpartyId" FROM "Revolut_Counterparty" WHERE "userId" = $1`,
            ),
        );
    });

    it("qGetTeamName assembles", () => {
        expect(normalizeWhitespace(qGetTeamName.toString())).toBe(
            normalizeWhitespace(`SELECT "name" FROM "Team" WHERE "id" = $1`),
        );
    });

    it("qGetTeamPaymentSettings assembles", () => {
        expect(normalizeWhitespace(qGetTeamPaymentSettings.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Team_PaymentSettings" WHERE "teamId" = $1`,
            ),
        );
    });

    it("qGetPayment assembles", () => {
        expect(normalizeWhitespace(qGetPayment.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentDraft" WHERE "id" = $1`,
            ),
        );
    });

    it("qGetUserApprovedPayments assembles", () => {
        expect(normalizeWhitespace(qGetUserApprovedPayments.toString())).toBe(
            normalizeWhitespace(
                `SELECT uap.id, uap."userId", uap."networkOrderId", uap.type, ` +
                    `convert_currency(uap.amount::numeric, uap.currency, $1, $2::date)::float8 as "amount", ` +
                    `convert_currency(uap.vat::numeric, uap.currency, $1, $2::date)::float8 as "vat", ` +
                    `$1 as "currency", ` +
                    `uap.comment, uap."createdAt", uap.paid, uap."paymentMonth", ` +
                    `uap."revolutDraftId", uap."revolutReference", uap.status, ` +
                    `no."orderId", no."orderDate", no."advertiser" as "retailer", ` +
                    `(u."givenName" || ' ' || u."familyName")::text as "pseName" ` +
                    `FROM "User_ApprovedPayment" uap ` +
                    `left join "User" u on u."id" = uap."userId" ` +
                    `left join "Network_Order" no on no."id" = uap."networkOrderId" ` +
                    `WHERE uap."revolutDraftId" = $3`,
            ),
        );
    });

    it("qGenInvoiceDraft assembles", () => {
        expect(normalizeWhitespace(qGenInvoiceDraft.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentDraft" WHERE "id" = $1`,
            ),
        );
    });

    it("qGetPaymentRecord assembles", () => {
        expect(normalizeWhitespace(qGetPaymentRecord.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "Network_Payment_CJ" WHERE id = $1`),
        );
    });

    it("qGetCJGroup assembles", () => {
        expect(normalizeWhitespace(qGetCJGroup.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Payment_CJ_Group" WHERE id = $1`,
            ),
        );
    });

    it("qGetLocalOrderId assembles", () => {
        expect(normalizeWhitespace(qGetLocalOrderId.toString())).toBe(
            normalizeWhitespace(
                `SELECT "id" FROM "Network_Order" no WHERE no."networkId" = 'cj' and no."orderId" = $1`,
            ),
        );
    });

    it("qGetCJOrderPaymentId assembles", () => {
        expect(normalizeWhitespace(qGetCJOrderPaymentId.toString())).toBe(
            normalizeWhitespace(
                `SELECT "paymentId" FROM "Network_Payment_CJ_Order" npo WHERE npo."orderId" = $1`,
            ),
        );
    });

    it("qGetCJByDetails assembles", () => {
        expect(normalizeWhitespace(qGetCJByDetails.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Payment_CJ" np WHERE details->>'order_id' = $1`,
            ),
        );
    });

    it("qGetAnalytics assembles", () => {
        expect(normalizeWhitespace(qGetAnalytics.toString())).toBe(
            normalizeWhitespace(
                `SELECT u.email, u.phone, u."givenName", u."familyName", u."createdAt", ` +
                    `u."firstLoggedIn", u."lastLoggedIn", pa.id as "pseApplicationId", ua.* ` +
                    `FROM "User_Analytics" ua ` +
                    `join "User" u on u.id = ua."userId" ` +
                    `left join "PSEApplication" pa on pa."userId" = ua."userId" ` +
                    `WHERE ua."userId" = $1`,
            ),
        );
    });

    it("qUpdateInvoiceS3Key assembles", () => {
        expect(qUpdateInvoiceS3Key.toString()).toBe(
            `update "Revolut_PaymentInvoice" set "s3key" = $1 where "id" = $2`,
        );
        expect([...qUpdateInvoiceS3Key.getParams()]).toEqual([
            "env/pse/i1.pdf",
            "i1",
        ]);
    });

    it("qUpdateCreditNoteS3Key assembles", () => {
        expect(qUpdateCreditNoteS3Key.toString()).toBe(
            `update "Revolut_PaymentCreditNote" set "s3key" = $1 where "id" = $2`,
        );
        expect([...qUpdateCreditNoteS3Key.getParams()]).toEqual([
            "env/pse/c1.pdf",
            "c1",
        ]);
    });

    it("qUpdateCJGroupId assembles", () => {
        expect(qUpdateCJGroupId.toString()).toBe(
            `update "Network_Payment_CJ" set "groupId" = $1 where id = $2`,
        );
        expect([...qUpdateCJGroupId.getParams()]).toEqual(["g1", "cj1"]);
    });
});

// ===========================================================================
// createSql fallbacks — builder-inexpressible constructs
// ===========================================================================

const sql = createSql<S>();

describe("commerce fn createSql fallbacks", () => {
    // TODO(builder-api): count(*) projection — fluent builder can't model aggregates yet.
    it("getInvoiceNumber count(*) — generateInvoiceId.ts:10-25", () => {
        const q = sql(
            `select count(*) as cnt from "Revolut_PaymentInvoice" where date("createdAt") = :date`,
        ).withParams({ date: "2024-01-01" });
        expect(q.toString()).toBe(
            `select count(*) as cnt from "Revolut_PaymentInvoice" where date("createdAt") = $1`,
        );
        expect([...q.getParams()]).toEqual(["2024-01-01"]);
    });

    // TODO(builder-api): INSERT + ON CONFLICT DO NOTHING — createInsertQuery onConflict
    // exists but materialized via raw for fidelity with the source upsert text.
    it("createGroup INSERT — process-cj-report index.ts:187-191", () => {
        const q = sql(
            `insert into "Network_Payment_CJ_Group" (id, "datePaid") values (:id, :datePaid) on conflict (id) do nothing`,
        ).withParams({ id: "g1", datePaid: "2024-01-01" });
        expect(q.toString()).toBe(
            `insert into "Network_Payment_CJ_Group" (id, "datePaid") values ($1, $2) on conflict (id) do nothing`,
        );
        expect([...q.getParams()]).toEqual(["g1", "2024-01-01"]);
    });

    // TODO(builder-api): INSERT ... ON CONFLICT DO UPDATE (multi-column upsert) — fluent
    // builder can't model the excluded.* update list yet.
    it("processTransactionRecord upsert — process-cj-report index.ts:306-318", () => {
        const q = sql(
            `insert into "Network_Payment_CJ" ` +
                `(id, advertiser_name, payment_date, sale_amount, publisher_commission, details, "groupId") ` +
                `values (:id, :adv, :pdate, :sale, :pub, :details, :groupId) ` +
                `on conflict (id) do update set ` +
                `advertiser_name = excluded.advertiser_name, ` +
                `payment_date = excluded.payment_date, ` +
                `sale_amount = excluded.sale_amount, ` +
                `publisher_commission = excluded.publisher_commission, ` +
                `details = excluded.details, ` +
                `"groupId" = coalesce("Network_Payment_CJ"."groupId", excluded."groupId")`,
        ).withParams({
            id: "cj1",
            adv: "Vendor",
            pdate: "2024-01-01",
            sale: "10",
            pub: "1",
            details: "{}",
            groupId: "g1",
        });
        expect([...q.getParams()]).toEqual([
            "cj1",
            "Vendor",
            "2024-01-01",
            "10",
            "1",
            "{}",
            "g1",
        ]);
    });

    // TODO(builder-api): INSERT ... SELECT with join + ON CONFLICT — fluent builder
    // can't model INSERT-from-SELECT yet.
    it("assignSingleOrders INSERT...SELECT — process-cj-report index.ts:333-351", () => {
        const q = sql(
            `insert into "Network_Payment_CJ_Order" ("orderId", "paymentId", "paymentDate") ` +
                `( select o."id", p.id as "paymentId", p.payment_date as "paymentDate" ` +
                `from "Network_Order" o ` +
                `join "Network_Payment_CJ" p on p.sale_amount > 0.1 ` +
                `and p.advertiser_name = o.advertiser ` +
                `and abs(p.sale_amount - coalesce(o."correctedSaleAmount", o."saleAmount")) < 0.1 ` +
                `where o."networkId" = 'cj' and o."status" = 'closed' ) ` +
                `on conflict ("orderId", "paymentId") do update set "manuallyAssigned" = false`,
        ).withParams({});
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): SELECT with NOT EXISTS correlated subquery — builder can't
    // model subqueries in WHERE yet.
    it("assignMultipleOrders unassigned payments — process-cj-report index.ts:357-364", () => {
        const q = sql(
            `select * from "Network_Payment_CJ" npc ` +
                `where sale_amount > 0 and not exists ( ` +
                `select 1 from "Network_Payment_CJ_Order" npco ` +
                `where npco."paymentId" = npc.id )`,
        ).withParams({});
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): SELECT with coalesce filters + NOT EXISTS subquery.
    it("assignMultipleOrders candidate orders — process-cj-report index.ts:385-398", () => {
        const q = sql(
            `select * from "Network_Order" no ` +
                `where no."networkId" = 'cj' and no."advertiser" = :adv ` +
                `and no."status" = 'closed' ` +
                `and coalesce(no."correctedSaleAmount", no."saleAmount") < :sale ` +
                `and coalesce(no."correctedSaleAmount", no."saleAmount") > 0.1 ` +
                `and no."orderDate" < :pdate ` +
                `and not exists ( select 1 from "Network_Payment_CJ_Order" npco ` +
                `where npco."orderId" = no."id" )`,
        ).withParams({ adv: "Vendor", sale: "10", pdate: "2024-01-01" });
        expect([...q.getParams()]).toEqual(["Vendor", "10", "2024-01-01"]);
    });

    // TODO(builder-api): INSERT values + ON CONFLICT DO NOTHING.
    it("assignMultipleOrders INSERT — process-cj-report index.ts:465-470", () => {
        const q = sql(
            `insert into "Network_Payment_CJ_Order" ("orderId", "paymentId", "paymentDate") ` +
                `values (:orderId, :paymentId, :paymentDate) ` +
                `on conflict ("orderId", "paymentId") do nothing`,
        ).withParams({ orderId: "o1", paymentId: "p1", paymentDate: "2024-01-01" });
        expect([...q.getParams()]).toEqual(["o1", "p1", "2024-01-01"]);
    });

    // TODO(builder-api): INSERT ... ON CONFLICT DO UPDATE with self-referencing increment.
    // materialized from dynamic source: `${fieldName}` -> "bankDetailsAddedNum".
    it("incrementField upsert — updateAnalytics.ts:102-109", () => {
        const q = sql(
            `insert into "User_Analytics" ("userId", "bankDetailsAddedNum") values (:userId, 1) ` +
                `on conflict("userId") do update set ` +
                `"bankDetailsAddedNum" = "User_Analytics"."bankDetailsAddedNum" + excluded."bankDetailsAddedNum"`,
        ).withParams({ userId: "u1" });
        expect([...q.getParams()]).toEqual(["u1"]);
    });

    // TODO(builder-api): dynamic prepareInsert column list — modeled as a static
    // representative INSERT. FIXTURE-GAP: Revolut_PaymentInvoice.teamId not in fixture.
    it("action INSERT invoice — create-pse-invoice index.ts:503-510", () => {
        const q = sql(
            `insert into "Revolut_PaymentInvoice" ` +
                `(id, "paymentId", data, "userId", "teamId", status, "createdAt", amount, vat, currency) ` +
                `values (:id, :paymentId, :data, :userId, :teamId, :status, :createdAt, :amount, :vat, :currency)`,
        ).withParams({
            id: "i1",
            paymentId: "p1",
            data: "{}",
            userId: "u1",
            teamId: null,
            status: "pending",
            createdAt: "2024-01-01",
            amount: 10,
            vat: 1,
            currency: "GBP",
        });
        expect([...q.getParams()]).toEqual([
            "i1",
            "p1",
            "{}",
            "u1",
            null,
            "pending",
            "2024-01-01",
            10,
            1,
            "GBP",
        ]);
    });
});

// ===========================================================================
// type-level row assertions (SELECT mirrors)
// ===========================================================================

type _Row_CheckInvoiceExists = RequireTrue<
    AssertEqual<SelectBuilderResult<typeof qCheckInvoiceExists>, { id: string }>
>;

type _Row_GetPSEVatInfo = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetPSEVatInfo>,
        S["schemas"]["public"]["User_PaymentSettings"]
    >
>;

type _Row_GetPSEInfo = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetPSEInfo>,
        { givenName: string | null; familyName: string | null }
    >
>;

type _Row_GetTeamCounterpartyId = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetTeamCounterpartyId>,
        { counterpartyId: string }
    >
>;

type _Row_GetUserCounterpartyId = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetUserCounterpartyId>,
        { counterpartyId: string }
    >
>;

type _Row_GetTeamName = RequireTrue<
    AssertEqual<SelectBuilderResult<typeof qGetTeamName>, { name: string }>
>;

type _Row_GetTeamPaymentSettings = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetTeamPaymentSettings>,
        S["schemas"]["public"]["Team_PaymentSettings"]
    >
>;

type _Row_GetPayment = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetPayment>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type _Row_GenInvoiceDraft = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGenInvoiceDraft>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type _Row_GetPaymentRecord = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetPaymentRecord>,
        S["schemas"]["public"]["Network_Payment_CJ"]
    >
>;

type _Row_GetCJGroup = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetCJGroup>,
        S["schemas"]["public"]["Network_Payment_CJ_Group"]
    >
>;

type _Row_GetLocalOrderId = RequireTrue<
    AssertEqual<SelectBuilderResult<typeof qGetLocalOrderId>, { id: string }>
>;

type _Row_GetCJOrderPaymentId = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetCJOrderPaymentId>,
        { paymentId: string }
    >
>;

type _Row_GetCJByDetails = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qGetCJByDetails>,
        S["schemas"]["public"]["Network_Payment_CJ"]
    >
>;

export type CommerceFnBuilderTestsPass = true;
