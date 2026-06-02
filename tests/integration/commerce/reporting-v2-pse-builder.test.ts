/**
 * Commerce reporting-v2 (pse + order controllers) — builder runtime mirrors.
 * Setup-only; failures => engine fix-list. Builder-inexpressible queries use the
 * typed createSql raw path and are tagged TODO(builder-api).
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
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;
const sql = createSql<S>();

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pses.ts action()
// query materialized non-empty so the ilike whereIf branch is present.
// ---------------------------------------------------------------------------
const pseQuery = "%ann%";
const qPseSearch = createSelectQuery<S>()
    .withParams({ query: pseQuery })
    .from(`"User"`)
    .select(`"id"`)
    .select(`"email"`)
    .select(`"givenName"`)
    .select(`"familyName"`)
    .where(`("groups" like '%GPS%' or "groups" like '%FRI%')`)
    .whereIf(
        !!pseQuery,
        `("givenName" ilike :query or "familyName" ilike :query or "email" ilike :query)`,
    )
    .limit(20)
    .offset(0);

describe("pses controller PSE search", () => {
    it("assembles the GPS/FRI search with the ilike branch", () => {
        const expected =
            `SELECT "id", "email", "givenName", "familyName" ` +
            `FROM "User" ` +
            `WHERE ("groups" like '%GPS%' or "groups" like '%FRI%') ` +
            `AND ("givenName" ilike $1 or "familyName" ilike $1 or "email" ilike $1) ` +
            `LIMIT 20 OFFSET 0`;
        expect(normalizeWhitespace(qPseSearch.toString())).toBe(normalizeWhitespace(expected));
    });
    it("collects the single repeated param once", () => {
        expect([...qPseSearch.getParams()]).toEqual(["%ann%"]);
    });
});

type PseSearchRow = SelectBuilderResult<typeof qPseSearch>;
type _PseSearchRow = RequireTrue<
    AssertEqual<
        PseSearchRow,
        { id: string; email: string; givenName: string | null; familyName: string | null }
    >
>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/add-payment.ts handler()
// ---------------------------------------------------------------------------
describe("add-payment INSERT", () => {
    it("inserts a manual (type=3) approved payment", () => {
        const q = createInsertQuery<S>()
            .into(`"User_ApprovedPayment"`)
            .value(`"userId"`, ":pseId")
            .value("amount", ":amount")
            .value("vat", ":vat")
            .value("comment", ":comment")
            .value("currency", ":currency")
            .value("type", "3")
            .withParams({
                pseId: "u1",
                amount: 100,
                vat: 20,
                comment: "manual top-up",
                currency: "GBP",
            });
        expect(q.toString()).toBe(
            `insert into "User_ApprovedPayment" ("userId", amount, vat, comment, currency, type) ` +
                `values ($1, $2, $3, $4, $5, 3)`,
        );
        expect([...q.getParams()]).toEqual(["u1", 100, 20, "manual top-up", "GBP"]);
    });
});

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/approve-commission.ts
// ---------------------------------------------------------------------------
const qCheckPending = createSelectQuery<S>()
    .withParams({ userId: "u1", orderId: "o1" })
    .from(`"User_ApprovedPayment"`)
    .select("id")
    .where(`"userId" = :userId`)
    .where(`"networkOrderId" = :orderId`)
    .where(`"status" != 'paid'`)
    .where(`"status" != 'failed'`)
    .limit(1);

describe("approve-commission checkPendingPaymentExists", () => {
    it("looks up an unpaid approved payment, limit 1", () => {
        const expected =
            `SELECT id FROM "User_ApprovedPayment" ` +
            `WHERE "userId" = $1 AND "networkOrderId" = $2 ` +
            `AND "status" != 'paid' AND "status" != 'failed' LIMIT 1`;
        expect(normalizeWhitespace(qCheckPending.toString())).toBe(normalizeWhitespace(expected));
        expect([...qCheckPending.getParams()]).toEqual(["u1", "o1"]);
    });
});

type CheckPendingRow = SelectBuilderResult<typeof qCheckPending>;
type _CheckPendingRow = RequireTrue<AssertEqual<CheckPendingRow, { id: string }>>;

describe("approve-commission main INSERT", () => {
    it("inserts the approved (status='approved', type=1) payment", () => {
        const q = createInsertQuery<S>()
            .into(`"User_ApprovedPayment"`)
            .value(`"id"`, ":id")
            .value(`"userId"`, ":userId")
            .value(`"networkOrderId"`, ":orderId")
            .value("amount", ":amount")
            .value("vat", ":vat")
            .value("currency", ":currency")
            .value("status", "'approved'")
            .value("type", "1")
            .withParams({
                id: "ap1",
                userId: "u1",
                orderId: "o1",
                amount: 50,
                vat: 10,
                currency: "GBP",
            });
        expect(q.toString()).toBe(
            `insert into "User_ApprovedPayment" ` +
                `("id", "userId", "networkOrderId", amount, vat, currency, status, type) ` +
                `values ($1, $2, $3, $4, $5, $6, 'approved', 1)`,
        );
        expect([...q.getParams()]).toEqual(["ap1", "u1", "o1", 50, 10, "GBP"]);
    });
});

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/assign-previous.ts
// ---------------------------------------------------------------------------
describe("assign-previous re-attribution UPDATEs", () => {
    it("assignClicks — re-attributes null-team clicks", () => {
        const q = createUpdateQuery<S>()
            .table(`"LogProductClick"`)
            .set(`"teamId" = :teamId`)
            .where(`"shopperId" = :pseId`)
            .where(`"teamId" is null`)
            .withParams({ teamId: "t1", pseId: "u1" });
        expect(q.toString()).toBe(
            `update "LogProductClick" set "teamId" = $1 where "shopperId" = $2 and "teamId" is null`,
        );
        expect([...q.getParams()]).toEqual(["t1", "u1"]);
    });

    it("assignConsultations", () => {
        const q = createUpdateQuery<S>()
            .table(`"Consultation"`)
            .set(`"teamId" = :teamId`)
            .where(`"friId" = :pseId`)
            .where(`"teamId" is null`)
            .withParams({ teamId: "t1", pseId: "u1" });
        expect(q.toString()).toBe(
            `update "Consultation" set "teamId" = $1 where "friId" = $2 and "teamId" is null`,
        );
    });

    it("assignLooks", () => {
        const q = createUpdateQuery<S>()
            .table(`"Look"`)
            .set(`"teamId" = :teamId`)
            .where(`"friId" = :pseId`)
            .where(`"teamId" is null`)
            .withParams({ teamId: "t1", pseId: "u1" });
        expect(q.toString()).toBe(
            `update "Look" set "teamId" = $1 where "friId" = $2 and "teamId" is null`,
        );
    });

    it("assignMoodboards", () => {
        const q = createUpdateQuery<S>()
            .table(`"Moodboard"`)
            .set(`"teamId" = :teamId`)
            .where(`"friId" = :pseId`)
            .where(`"teamId" is null`)
            .withParams({ teamId: "t1", pseId: "u1" });
        expect(q.toString()).toBe(
            `update "Moodboard" set "teamId" = $1 where "friId" = $2 and "teamId" is null`,
        );
    });
});

const qValidateMembership = createSelectQuery<S>()
    .withParams({ pseId: "u1", teamId: "t1" })
    .from(`"Team_Member"`)
    .select("id")
    .where(`"userId" = :pseId`)
    .where(`"teamId" = :teamId`);

describe("assign-previous validateMembership", () => {
    it("confirms the PSE belongs to the team", () => {
        expect(normalizeWhitespace(qValidateMembership.toString())).toBe(
            normalizeWhitespace(
                `SELECT id FROM "Team_Member" WHERE "userId" = $1 AND "teamId" = $2`,
            ),
        );
        expect([...qValidateMembership.getParams()]).toEqual(["u1", "t1"]);
    });
});

type ValidateMembershipRow = SelectBuilderResult<typeof qValidateMembership>;
type _ValidateMembershipRow = RequireTrue<AssertEqual<ValidateMembershipRow, { id: string }>>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/awaiting-by-team.ts action()
// TODO(builder-api): multi-aggregate roll-up with coalesce GROUP BY, custom
// convert_currency()/current_date, ::casts, and an aggregate ORDER BY — the
// fluent builder cannot model this; use the typed raw path.
// teamFilter materialized to the single-team `= $1` branch.
// ---------------------------------------------------------------------------
describe("awaiting-by-team aggregate (raw)", () => {
    it("expands the single team filter param", () => {
        const q = sql(
            `select
            coalesce(uap."teamId", click."teamId") as "teamId",
            t."name" as "teamName",
            count(distinct uap."userId")::int as "pseCount",
            count(uap.id)::int as "uapCount",
            sum(convert_currency(uap."amount"::numeric, uap."currency", 'GBP'::text, current_date))::float8 as "amount",
            sum(convert_currency(uap."vat"::numeric, uap."currency", 'GBP'::text, current_date))::float8 as "vat",
            sum(convert_currency((uap."amount" + uap."vat")::numeric, uap."currency", 'GBP'::text, current_date))::float8 as "total",
            'GBP' as "currency",
            count(distinct uap."currency")::int as "currencyCount"
        from "User_ApprovedPayment" uap
        left join "Network_Order" o on o.id = uap."networkOrderId"
        left join "LogProductClick" click on click.sid = o."clickId"
        join "Team" t on t."id" = coalesce(uap."teamId", click."teamId")
        where uap."paid" = false
          and uap."status" in ('approved','re-approved')
          and uap."revolutDraftId" is null
          and coalesce(uap."teamId", click."teamId") is not null
          and coalesce(uap."teamId", click."teamId") = :teamId
        group by coalesce(uap."teamId", click."teamId"), t."name"
        order by sum(convert_currency(uap."amount"::numeric, uap."currency", 'GBP'::text, current_date)) desc`,
        ).withParams({ teamId: "t1" });
        expect(q.toString()).toContain(`= $1`);
        expect([...q.getParams()]).toEqual(["t1"]);
    });
});

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/payment-status.ts
// (overlaps the existing reporting-v2-builder file; covered for completeness)
// ---------------------------------------------------------------------------
describe("payment-status setPaid / cancel", () => {
    it("setPaid marks the payment paid", () => {
        const q = createUpdateQuery<S>()
            .table(`"User_ApprovedPayment"`)
            .set(`"paid" = true`)
            .set(`"status" = 'paid'`)
            .where("id = :id")
            .withParams({ id: "ap1" });
        expect(q.toString()).toBe(
            `update "User_ApprovedPayment" set "paid" = true, "status" = 'paid' where id = $1`,
        );
        expect([...q.getParams()]).toEqual(["ap1"]);
    });

    it("cancel deletes an approved payment", () => {
        const q = createDeleteQuery<S>()
            .from(`"User_ApprovedPayment"`)
            .where("id = :id")
            .withParams({ id: "ap1" });
        expect(q.toString()).toBe(`delete from "User_ApprovedPayment" where id = $1`);
        expect([...q.getParams()]).toEqual(["ap1"]);
    });
});

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/order/recalc.ts getOrder()
// ---------------------------------------------------------------------------
const qRecalcGetOrder = createSelectQuery<S>()
    .withParams({ id: "o1" })
    .from(`"Network_Order"`)
    .select("*")
    .where("id = :id");

describe("recalc getOrder", () => {
    it("star-selects a single order", () => {
        expect(normalizeWhitespace(qRecalcGetOrder.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "Network_Order" WHERE id = $1`),
        );
        expect([...qRecalcGetOrder.getParams()]).toEqual(["o1"]);
    });
});

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/order/set-pse.ts
// ---------------------------------------------------------------------------
const qCommissionHistory = createSelectQuery<S>()
    .withParams({ advertiser: "Revolut", orderDate: "2024-01-01" })
    .from(`"Retailer_Commission_History"`)
    .select("*")
    .where(`"advertiserName" = :advertiser`)
    .where(`"startedAt" <= :orderDate`)
    .where(`"endedAt" >= :orderDate`);

describe("set-pse getCommissionRate", () => {
    it("history lookup — bounds the date window", () => {
        const expected =
            `SELECT * FROM "Retailer_Commission_History" ` +
            `WHERE "advertiserName" = $1 AND "startedAt" <= $2 AND "endedAt" >= $2`;
        expect(normalizeWhitespace(qCommissionHistory.toString())).toBe(
            normalizeWhitespace(expected),
        );
        expect([...qCommissionHistory.getParams()]).toEqual(["Revolut", "2024-01-01"]);
    });

    it("current-rates fallback", () => {
        const q = createSelectQuery<S>()
            .withParams({ advertiser: "Revolut" })
            .from(`"Retailer_Commission"`)
            .select("*")
            .where(`"advertiserName" = :advertiser`);
        expect(normalizeWhitespace(q.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "Retailer_Commission" WHERE "advertiserName" = $1`),
        );
    });
});

describe("set-pse handler mutations", () => {
    it("attach existing click — sets shopperId + referenceUserId", () => {
        const q = createUpdateQuery<S>()
            .table(`"LogProductClick"`)
            .set(`"shopperId" = :pseId`)
            .set(`"referenceUserId" = :pseId`)
            .where(`"sid" = :sid`)
            .withParams({ pseId: "u1", sid: "s1" });
        expect(q.toString()).toBe(
            `update "LogProductClick" set "shopperId" = $1, "referenceUserId" = $1 where "sid" = $2`,
        );
        expect([...q.getParams()]).toEqual(["u1", "s1"]);
    });

    it("synthesise click — inserts an attributed click row", () => {
        const q = createInsertQuery<S>()
            .into(`"LogProductClick"`)
            .value(`"createdAt"`, ":orderDate")
            .value(`"sid"`, ":sid")
            .value(`"shopperId"`, ":pseId")
            .value(`"referenceUserId"`, ":pseId")
            .withParams({ orderDate: "2024-01-01", sid: "s1", pseId: "u1" });
        expect(q.toString()).toBe(
            `insert into "LogProductClick" ("createdAt", "sid", "shopperId", "referenceUserId") ` +
                `values ($1, $2, $3, $3)`,
        );
        expect([...q.getParams()]).toEqual(["2024-01-01", "s1", "u1"]);
    });

    it("point order at the new click", () => {
        const q = createUpdateQuery<S>()
            .table(`"Network_Order"`)
            .set(`"clickId" = :sid`)
            .where(`"id" = :orderId`)
            .withParams({ sid: "s1", orderId: "o1" });
        expect(q.toString()).toBe(
            `update "Network_Order" set "clickId" = $1 where "id" = $2`,
        );
        expect([...q.getParams()]).toEqual(["s1", "o1"]);
    });

    it("persist order- and click-side commission rates", () => {
        const q = createUpdateQuery<S>()
            .table(`"Network_Order"`)
            .set(`"pseCommissionRate" = :orderRate`)
            .set(`"pseCommissionRateClick" = :clickRate`)
            .where(`"id" = :orderId`)
            .withParams({ orderRate: 0.8, clickRate: 0.8, orderId: "o1" });
        expect(q.toString()).toBe(
            `update "Network_Order" set "pseCommissionRate" = $1, "pseCommissionRateClick" = $2 where "id" = $3`,
        );
        expect([...q.getParams()]).toEqual([0.8, 0.8, "o1"]);
    });
});

const qClickCreatedAt = createSelectQuery<S>()
    .withParams({ sid: "s1" })
    .from(`"LogProductClick"`)
    .select(`"createdAt"`)
    .where(`"sid" = :sid`);

describe("set-pse read click createdAt", () => {
    it("selects the click's createdAt", () => {
        expect(normalizeWhitespace(qClickCreatedAt.toString())).toBe(
            normalizeWhitespace(`SELECT "createdAt" FROM "LogProductClick" WHERE "sid" = $1`),
        );
    });
});

type ClickCreatedAtRow = SelectBuilderResult<typeof qClickCreatedAt>;
type _ClickCreatedAtRow = RequireTrue<AssertEqual<ClickCreatedAtRow, { createdAt: string }>>;

export type CommerceReportingV2PseBuilderTestsPass = true;
