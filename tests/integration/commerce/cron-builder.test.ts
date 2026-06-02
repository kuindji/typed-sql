/**
 * Commerce cron — builder runtime mirrors of the raw SQL in the commerce cron
 * lambdas. Setup-only; failures => engine fix-list.
 *
 * SELECT queries use createSelectQuery; INSERT/UPDATE/DELETE use the write
 * builders. Builder-inexpressible queries (WITH/CTE, aggregate-only selects
 * the fluent SELECT builder still assembles fine, multi-clause UPDATE...FROM
 * with coalesce) are tagged and routed through createSql.
 */
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createInsertQuery,
    createUpdateQuery,
    createDeleteQuery,
    createSql,
    normalizeWhitespace,
} from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;
type C = ReportingV2CatalogueSchema;

const sqlMain = createSql<S>();
const sqlCatalogue = createSql<C>();

// ===========================================================================
// SELECT builders
// ===========================================================================

// --- mirror of commerce cron cognito-reset-tmp-password/src/index.ts:82 ---
const qCognitoResetSelectAll = createSelectQuery<S>()
    .from(`"User_Password_Reset"`)
    .select(`*`);

// --- mirror of commerce cron cognito-reset-tmp-password/src/index.ts:122 ---
const qCognitoSelectUserId = createSelectQuery<S>()
    .from(`"User"`)
    .select(`"id"`)
    .where(`"email" = :email`)
    .withParams({ email: "a@b.com" });

// --- mirror of commerce cron get-exchange-rates/src/index.ts:85-87 ---
const qExchangeSelectAll = createSelectQuery<S>()
    .from(`"ExchangeRate"`)
    .select(`*`);

// --- mirror of commerce cron remove-recently-deleted/src/index.ts:7-11 ---
// FIXTURE-GAP: User_RecentlyDeleted table not in fixture
const qRecentlyDeletedSelect = createSelectQuery<S>()
    .from(`"User_RecentlyDeleted"`)
    .select(`*`)
    .where(`"deletedAt" < :before or "deletedAt" is null`)
    .withParams({ before: "2024-01-01" })
    .limit(20);

// --- mirror of commerce cron revolut-draft-state/src/index.ts:30-34 ---
const qRevolutSelectDrafts = createSelectQuery<S>()
    .from(`"Revolut_PaymentDraft"`)
    .select(`*`)
    .where(`"status" in ('CREATED', 'PENDING')`)
    .where(`"createdAt" < :before`)
    .withParams({ before: "2024-01-01" });

// --- mirror of commerce cron network-report-download/src/networks/partnerize.ts:308-316 ---
const qPartnerizeGetDateRanges = createSelectQuery<S>()
    .from(`"Network_Order_Partnerize_Item" p`)
    .join(`join "Network_Order" no on no."orderId" = p."orderId"`)
    .select(`min(no."orderDate") as "minDate"`)
    .where(
        `p.status = 'pending' or (p.status = 'approved' and p."selfBillId" is null)`,
    );

// --- mirror of commerce cron network-report-download/src/networks/cj.ts:423-428 ---
const qCjGetDateRanges = createSelectQuery<S>()
    .from(`"Network_Order" no`)
    .select(`min("orderDate") as "startDate"`)
    .where(`no."networkId" = 'cj'`)
    .where(`no."status" in ('new', 'pending', 'locked')`);

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:67-71 ---
const qSelfbillMinDate = createSelectQuery<S>()
    .from(`"Network_Partnerize_Selfbill" p`)
    .select(`min("creationDate") as "minDate"`)
    .where(`p."status" = 'created' or p."status" = 'sent'`);

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:78-81 ---
const qSelfbillCount = createSelectQuery<S>()
    .from(`"Network_Partnerize_Selfbill"`)
    .select(`count(*) as "count"`);

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:103-106 ---
const qSelfbillMaxDate = createSelectQuery<S>()
    .from(`"Network_Partnerize_Selfbill"`)
    .select(`max("creationDate") as "maxDate"`);

// --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:130-132 ---
const qSelfbillSelectById = createSelectQuery<S>()
    .from(`"Network_Partnerize_Selfbill"`)
    .select(`*`)
    .where(`"id" = :id`)
    .withParams({ id: "sb1" });

describe("cron builder SELECT duplicates", () => {
    it("qCognitoResetSelectAll assembles", () => {
        expect(normalizeWhitespace(qCognitoResetSelectAll.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "User_Password_Reset"`),
        );
    });

    it("qCognitoSelectUserId assembles", () => {
        expect(normalizeWhitespace(qCognitoSelectUserId.toString())).toBe(
            normalizeWhitespace(
                `SELECT "id" FROM "User" WHERE "email" = $1`,
            ),
        );
    });

    it("qExchangeSelectAll assembles", () => {
        expect(normalizeWhitespace(qExchangeSelectAll.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "ExchangeRate"`),
        );
    });

    it("qRecentlyDeletedSelect assembles", () => {
        expect(normalizeWhitespace(qRecentlyDeletedSelect.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "User_RecentlyDeleted" ` +
                    `WHERE "deletedAt" < $1 or "deletedAt" is null LIMIT 20`,
            ),
        );
    });

    it("qRevolutSelectDrafts assembles", () => {
        expect(normalizeWhitespace(qRevolutSelectDrafts.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentDraft" ` +
                    `WHERE "status" in ('CREATED', 'PENDING') AND "createdAt" < $1`,
            ),
        );
    });

    it("qPartnerizeGetDateRanges assembles", () => {
        expect(normalizeWhitespace(qPartnerizeGetDateRanges.toString())).toBe(
            normalizeWhitespace(
                `SELECT min(no."orderDate") as "minDate" ` +
                    `FROM "Network_Order_Partnerize_Item" p ` +
                    `join "Network_Order" no on no."orderId" = p."orderId" ` +
                    `WHERE p.status = 'pending' or (p.status = 'approved' and p."selfBillId" is null)`,
            ),
        );
    });

    it("qCjGetDateRanges assembles", () => {
        expect(normalizeWhitespace(qCjGetDateRanges.toString())).toBe(
            normalizeWhitespace(
                `SELECT min("orderDate") as "startDate" FROM "Network_Order" no ` +
                    `WHERE no."networkId" = 'cj' AND no."status" in ('new', 'pending', 'locked')`,
            ),
        );
    });

    it("qSelfbillMinDate assembles", () => {
        expect(normalizeWhitespace(qSelfbillMinDate.toString())).toBe(
            normalizeWhitespace(
                `SELECT min("creationDate") as "minDate" ` +
                    `FROM "Network_Partnerize_Selfbill" p ` +
                    `WHERE p."status" = 'created' or p."status" = 'sent'`,
            ),
        );
    });

    it("qSelfbillCount assembles", () => {
        expect(normalizeWhitespace(qSelfbillCount.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*) as "count" FROM "Network_Partnerize_Selfbill"`,
            ),
        );
    });

    it("qSelfbillMaxDate assembles", () => {
        expect(normalizeWhitespace(qSelfbillMaxDate.toString())).toBe(
            normalizeWhitespace(
                `SELECT max("creationDate") as "maxDate" FROM "Network_Partnerize_Selfbill"`,
            ),
        );
    });

    it("qSelfbillSelectById assembles", () => {
        expect(normalizeWhitespace(qSelfbillSelectById.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Partnerize_Selfbill" WHERE "id" = $1`,
            ),
        );
    });
});

// ===========================================================================
// INSERT builders
// ===========================================================================

describe("cron builder INSERT duplicates", () => {
    // --- mirror of commerce cron cognito-reset-tmp-password/src/index.ts:134-139 ---
    it("qCognitoInsertReset assembles", () => {
        const q = createInsertQuery<S>()
            .into(`"User_Password_Reset"`)
            .value(`"userId"`, ":userId")
            .value(`"tempPassword"`, ":tempPassword")
            .value(`"email"`, ":email")
            .value(`"updatedAt"`, "now()")
            .withParams({ userId: "u1", tempPassword: "p1", email: "a@b.com" });
        expect(q.toString()).toBe(
            `insert into "User_Password_Reset" ("userId", "tempPassword", "email", "updatedAt") ` +
                `values ($1, $2, $3, now())`,
        );
        expect([...q.getParams()]).toEqual(["u1", "p1", "a@b.com"]);
    });

    // --- mirror of commerce cron get-exchange-rates/src/index.ts:60-64  (on conflict do nothing) ---
    it("qExchangeHistoryInsert assembles", () => {
        const q = createInsertQuery<S>()
            .into(`"ExchangeRate_History"`)
            .value(`"from"`, ":from")
            .value(`"to"`, ":to")
            .value(`"rate"`, ":rate")
            .value(`"date"`, ":date")
            .onConflict(`("date", "from", "to") do nothing`)
            .withParams({ from: "USD", to: "GBP", rate: "1.27", date: "2024-01-01" });
        expect(q.toString()).toBe(
            `insert into "ExchangeRate_History" ("from", "to", "rate", "date") ` +
                `values ($1, $2, $3, $4) on conflict ("date", "from", "to") do nothing`,
        );
        expect([...q.getParams()]).toEqual(["USD", "GBP", "1.27", "2024-01-01"]);
    });

    // --- mirror of commerce cron get-exchange-rates/src/index.ts:71-75  (upsert) ---
    it("qExchangeUpsert assembles", () => {
        const q = createInsertQuery<S>()
            .into(`"ExchangeRate"`)
            .value(`"from"`, ":from")
            .value(`"to"`, ":to")
            .value(`"rate"`, ":rate")
            .value(`"updatedAt"`, ":updatedAt")
            .onConflict(
                `("from", "to") do update set "rate" = :rate2, "updatedAt" = :updatedAt2`,
            )
            .withParams({
                from: "USD",
                to: "GBP",
                rate: "1.27",
                updatedAt: "2024-01-01",
                rate2: "1.27",
                updatedAt2: "2024-01-01",
            });
        expect(q.toString()).toBe(
            `insert into "ExchangeRate" ("from", "to", "rate", "updatedAt") ` +
                `values ($1, $2, $3, $4) ` +
                `on conflict ("from", "to") do update set "rate" = $5, "updatedAt" = $6`,
        );
        expect([...q.getParams()]).toEqual([
            "USD",
            "GBP",
            "1.27",
            "2024-01-01",
            "1.27",
            "2024-01-01",
        ]);
    });

    // --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:162-169 ---
    it("qSelfbillInsert assembles", () => {
        const q = createInsertQuery<S>()
            .into(`"Network_Partnerize_Selfbill"`)
            .value(`"id"`, ":id")
            .value(`"creationDate"`, ":creationDate")
            .value(`"paymentDate"`, ":paymentDate")
            .value(`"netValue"`, ":netValue")
            .value(`"totalValue"`, ":totalValue")
            .value(`"status"`, ":status")
            .value(`"details"`, ":details")
            .value(`"currency"`, ":currency")
            .withParams({
                id: "sb1",
                creationDate: "2024-01-01",
                paymentDate: null,
                netValue: 100,
                totalValue: 120,
                status: "created",
                details: "{}",
                currency: "GBP",
            });
        expect(q.toString()).toBe(
            `insert into "Network_Partnerize_Selfbill" ` +
                `("id", "creationDate", "paymentDate", "netValue", "totalValue", "status", "details", "currency") ` +
                `values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        );
        expect([...q.getParams()]).toEqual([
            "sb1",
            "2024-01-01",
            null,
            100,
            120,
            "created",
            "{}",
            "GBP",
        ]);
    });
});

// ===========================================================================
// UPDATE builders
// ===========================================================================

describe("cron builder UPDATE duplicates", () => {
    // --- mirror of commerce cron cognito-reset-tmp-password/src/index.ts:109-114 ---
    it("qCognitoUpdateReset assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"User_Password_Reset"`)
            .set(`"updatedAt" = now()`)
            .set(`"tempPassword" = :tempPassword`)
            .where(`"userId" = :userId`)
            .withParams({ tempPassword: "p1", userId: "u1" });
        expect(q.toString()).toBe(
            `update "User_Password_Reset" set "updatedAt" = now(), "tempPassword" = $1 ` +
                `where "userId" = $2`,
        );
        expect([...q.getParams()]).toEqual(["p1", "u1"]);
    });

    // --- mirror of commerce cron network-partnerize-selfbill-download/src/index.ts:137-147 ---
    it("qSelfbillUpdate assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"Network_Partnerize_Selfbill"`)
            .set(`"creationDate" = :creationDate`)
            .set(`"paymentDate" = :paymentDate`)
            .set(`"netValue" = :netValue`)
            .set(`"totalValue" = :totalValue`)
            .set(`"status" = :status`)
            .set(`"details" = :details`)
            .set(`"currency" = :currency`)
            .where(`"id" = :id`)
            .withParams({
                creationDate: "2024-01-01",
                paymentDate: null,
                netValue: 100,
                totalValue: 120,
                status: "sent",
                details: "{}",
                currency: "GBP",
                id: "sb1",
            });
        expect(q.toString()).toBe(
            `update "Network_Partnerize_Selfbill" set ` +
                `"creationDate" = $1, "paymentDate" = $2, "netValue" = $3, "totalValue" = $4, ` +
                `"status" = $5, "details" = $6, "currency" = $7 where "id" = $8`,
        );
        expect([...q.getParams()]).toEqual([
            "2024-01-01",
            null,
            100,
            120,
            "sent",
            "{}",
            "GBP",
            "sb1",
        ]);
    });

    // --- mirror of commerce cron revolut-draft-state/src/index.ts:62-66  (NOTFOUND) ---
    it("qRevolutUpdateNotFound assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"Revolut_PaymentDraft"`)
            .set(`"status" = 'NOTFOUND'`)
            .where(`"id" = :id`)
            .withParams({ id: "d1" });
        expect(q.toString()).toBe(
            `update "Revolut_PaymentDraft" set "status" = 'NOTFOUND' where "id" = $1`,
        );
        expect([...q.getParams()]).toEqual(["d1"]);
    });

    // --- mirror of commerce cron revolut-draft-state/src/index.ts:96-100  (DECLINED) ---
    it("qRevolutUpdateDeclined assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"Revolut_PaymentDraft"`)
            .set(`"status" = 'DECLINED'`)
            .where(`"id" = :id`)
            .withParams({ id: "d1" });
        expect(q.toString()).toBe(
            `update "Revolut_PaymentDraft" set "status" = 'DECLINED' where "id" = $1`,
        );
        expect([...q.getParams()]).toEqual(["d1"]);
    });

    // --- mirror of commerce cron pse-analytics-update/src/index.ts:5-13  updateUserRoles() ---
    // UPDATE ... FROM with a LIKE-expression SET list; builder supports table/set/from/where.
    // FIXTURE-GAP: User_Analytics.isAdmin / isEC not in fixture.
    it("qPseUpdateUserRoles assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"User_Analytics" ua`)
            .set(`"isPSE" = (u."groups" like '%GPS%' or u."groups" like '%FRI%')`)
            .set(`"isAdmin" = (u."groups" like '%Admin%')`)
            .set(`"isEC" = u."groups" = 'User'`)
            .from(`"User" u`)
            .where(`u."id" = ua."userId"`);
        expect(normalizeWhitespace(q.toString())).toBe(
            normalizeWhitespace(
                `update "User_Analytics" ua set ` +
                    `"isPSE" = (u."groups" like '%GPS%' or u."groups" like '%FRI%'), ` +
                    `"isAdmin" = (u."groups" like '%Admin%'), ` +
                    `"isEC" = u."groups" = 'User' ` +
                    `from "User" u where u."id" = ua."userId"`,
            ),
        );
    });

    // --- mirror of commerce cron pse-analytics-update/src/index.ts:101-108  updateIsProfileCompleted() ---
    // FIXTURE-GAP: User_Analytics.{isProfileCompleted,phoneVerified,...} not in fixture.
    it("qPseUpdateIsProfileCompleted assembles", () => {
        const q = createUpdateQuery<S>()
            .table(`"User_Analytics"`)
            .set(
                `"isProfileCompleted" = (("phoneVerified" = true or "phoneVerifiedAt" is not null) ` +
                    `and ("bankDetailsAdded" = true or "bankDetailsFirstAddedAt" is not null))`,
            )
            .where(`"isProfileCompleted" = false`)
            .where(`"isPSE" = true`);
        expect(normalizeWhitespace(q.toString())).toBe(
            normalizeWhitespace(
                `update "User_Analytics" set "isProfileCompleted" = ` +
                    `(("phoneVerified" = true or "phoneVerifiedAt" is not null) ` +
                    `and ("bankDetailsAdded" = true or "bankDetailsFirstAddedAt" is not null)) ` +
                    `where "isProfileCompleted" = false and "isPSE" = true`,
            ),
        );
    });
});

// ===========================================================================
// DELETE builders
// ===========================================================================

describe("cron builder DELETE duplicates", () => {
    // --- mirror of commerce cron delete-connections/src/index.ts:6-10 ---
    // FIXTURE-GAP: Connection table not in fixture.
    it("qDeleteConnections assembles", () => {
        const q = createDeleteQuery<S>()
            .from(`"Connection"`)
            .where(`"deleted" = true`)
            .where(`"deletedAt" < :before`)
            .withParams({ before: "2024-01-01" });
        expect(q.toString()).toBe(
            `delete from "Connection" where "deleted" = true and "deletedAt" < $1`,
        );
        expect([...q.getParams()]).toEqual(["2024-01-01"]);
    });

    // --- mirror of commerce cron delete-deactivated-users/src/index.ts:7-12 ---
    it("qDeleteDeactivatedUsers assembles", () => {
        const q = createDeleteQuery<S>()
            .from(`"User"`)
            .where(`"enabled" = false`)
            .where(`"deactivatedAt" is not null`)
            .where(`"deactivatedAt" < :before`)
            .withParams({ before: "2024-01-01" });
        expect(q.toString()).toBe(
            `delete from "User" where "enabled" = false and "deactivatedAt" is not null ` +
                `and "deactivatedAt" < $1`,
        );
        expect([...q.getParams()]).toEqual(["2024-01-01"]);
    });

    // --- mirror of commerce cron remove-recently-deleted/src/index.ts:21-24 ---
    it("qDeleteConsultation assembles", () => {
        const q = createDeleteQuery<S>()
            .from(`"Consultation"`)
            .where(`"id" = :id`)
            .withParams({ id: "c1" });
        expect(q.toString()).toBe(`delete from "Consultation" where "id" = $1`);
        expect([...q.getParams()]).toEqual(["c1"]);
    });

    // --- mirror of commerce cron remove-recently-deleted/src/index.ts:29-32 ---
    it("qDeleteLook assembles", () => {
        const q = createDeleteQuery<S>()
            .from(`"Look"`)
            .where(`"id" = :id`)
            .withParams({ id: "l1" });
        expect(q.toString()).toBe(`delete from "Look" where "id" = $1`);
        expect([...q.getParams()]).toEqual(["l1"]);
    });

    // --- mirror of commerce cron remove-recently-deleted/src/index.ts:37-40 ---
    it("qDeleteMoodboard assembles", () => {
        const q = createDeleteQuery<S>()
            .from(`"Moodboard"`)
            .where(`"id" = :id`)
            .withParams({ id: "m1" });
        expect(q.toString()).toBe(`delete from "Moodboard" where "id" = $1`);
        expect([...q.getParams()]).toEqual(["m1"]);
    });

    // --- mirror of commerce cron revolut-draft-state/src/index.ts:18-21 ---
    it("qRevolutDeleteDraft assembles", () => {
        const q = createDeleteQuery<S>()
            .from(`"Revolut_PaymentDraft"`)
            .where(`"id" = :id`)
            .withParams({ id: "d1" });
        expect(q.toString()).toBe(`delete from "Revolut_PaymentDraft" where "id" = $1`);
        expect([...q.getParams()]).toEqual(["d1"]);
    });
});

// ===========================================================================
// createSql fallbacks (builder-inexpressible)
// ===========================================================================

describe("cron createSql fallbacks", () => {
    // TODO(builder-api): WITH/CTE + UPDATE...FROM driven by a CTE chain — the
    // fluent builder cannot model leading common-table-expressions.
    // --- mirror of commerce cron update-retailer-weight/src/index.ts:5-36 ---
    it("qUpdateRetailerWeight (CTE) assembles", () => {
        const q = sqlCatalogue(
            `with rs as (` +
                `select r.id, (select count(*) as r_count from product_search ` +
                `where tags @> array['retailer/'||r.id] and new_in_at >= now() - interval '1 week') ` +
                `from retailer r), ` +
                `total as (select sum(r_count) as total_count from rs), ` +
                `relative as (select rs.id, rs.r_count, rs.r_count / total.total_count as rel_count, ` +
                `((((rs.r_count / total.total_count) - 0) / (1 - 0)) * (1 - 0.5) + 0.5) as interpolated_count ` +
                `from rs join total on true) ` +
                `update retailer set new_in_weight = 1 - relative.interpolated_count ` +
                `from relative where retailer.id = relative.id`,
        ).withParams({});
        expect(q.toString()).toBe(
            `with rs as (` +
                `select r.id, (select count(*) as r_count from product_search ` +
                `where tags @> array['retailer/'||r.id] and new_in_at >= now() - interval '1 week') ` +
                `from retailer r), ` +
                `total as (select sum(r_count) as total_count from rs), ` +
                `relative as (select rs.id, rs.r_count, rs.r_count / total.total_count as rel_count, ` +
                `((((rs.r_count / total.total_count) - 0) / (1 - 0)) * (1 - 0.5) + 0.5) as interpolated_count ` +
                `from rs join total on true) ` +
                `update retailer set new_in_weight = 1 - relative.interpolated_count ` +
                `from relative where retailer.id = relative.id`,
        );
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): large coalesce()/interval SET expression over UPDATE...FROM —
    // kept as raw typed SQL to preserve the exact multi-line predicate.
    // --- mirror of commerce cron pse-analytics-update/src/index.ts:68-97  updateIsActive() ---
    it("qPseUpdateIsActive (coalesce) assembles", () => {
        const text = `update "User_Analytics" ua set "isPSEActive" = coalesce(` +
            `(now() - u."lastLoggedIn") < interval '30 days' and ` +
            `((now() - "saleByECLastAt") < interval '30 days' or (now() - "saleByPSELastAt") < interval '30 days') and ` +
            `((now() - "linkLastCreatedAt") < interval '30 days' or (now() - "consultationLastCreatedAt") < interval '30 days'), ` +
            `false) from "User" u where u."id" = ua."userId" and ua."isPSE" = true`;
        const q = sqlMain(text).withParams({});
        expect(q.toString()).toBe(text);
        expect([...q.getParams()]).toEqual([]);
    });
});

// ===========================================================================
// type-level row assertions (SELECT builders)
// ===========================================================================

type _Row_CognitoResetSelectAll = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qCognitoResetSelectAll>,
        S["schemas"]["public"]["User_Password_Reset"]
    >
>;

type _Row_CognitoSelectUserId = RequireTrue<
    AssertEqual<SelectBuilderResult<typeof qCognitoSelectUserId>, { id: string }>
>;

type _Row_ExchangeSelectAll = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qExchangeSelectAll>,
        S["schemas"]["public"]["ExchangeRate"]
    >
>;

type _Row_RevolutSelectDrafts = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRevolutSelectDrafts>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type _Row_CjGetDateRanges = RequireTrue<
    AssertEqual<SelectBuilderResult<typeof qCjGetDateRanges>, { startDate: unknown }>
>;

type _Row_PartnerizeGetDateRanges = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qPartnerizeGetDateRanges>,
        { minDate: unknown }
    >
>;

type _Row_SelfbillCount = RequireTrue<
    AssertEqual<SelectBuilderResult<typeof qSelfbillCount>, { count: number }>
>;

type _Row_SelfbillSelectById = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qSelfbillSelectById>,
        S["schemas"]["public"]["Network_Partnerize_Selfbill"]
    >
>;

export type CommerceCronBuilderTestsPass = true;
