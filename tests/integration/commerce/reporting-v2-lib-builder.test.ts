/**
 * Commerce reporting-v2 lib — builder runtime mirrors. Setup-only; failures => engine fix-list.
 *
 * Mirrors the raw SQL in the reporting-v2 lib layer. SELECTs that the fluent
 * builder can model use createSelectQuery; CTE/lateral/scalar-subquery/EXISTS/
 * aggregate queries fall back to the typed-raw createSql path (each tagged with
 * a TODO(builder-api) reason). Builder columns in these fixtures are plain
 * `string`, so plain strings in withParams are fine.
 */
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createSql,
} from "../../../src/builder/index.js";
import { normalizeWhitespace } from "../../../src/builder/testing/normalizeWhitespace.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type {
    ReportingV2Schema,
} from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;
const sql = createSql<S>();

// ===========================================================================
// exchangeRates.ts — fluent SELECT
// ===========================================================================

// mirror of commerce reporting-v2 lib/exchangeRates.ts getExchangeRates()
const qExchangeRates = createSelectQuery<S>()
    .from(`"ExchangeRate"`)
    .select([`"from"`, `"to"`, `"rate"`]);

// ===========================================================================
// user.ts — fluent SELECTs
// ===========================================================================

// mirror of commerce reporting-v2 lib/user.ts getUserTeamId()
const qUserTeamId = createSelectQuery<S>()
    .from(`"Team_Member"`)
    .select(`*`)
    .where(`"userId" = :userId`)
    .withParams({ userId: "u1" })
    .limit(1);

// mirror of commerce reporting-v2 lib/user.ts getUserTeamAccessRole()
const qUserTeamAccessRole = createSelectQuery<S>()
    .from(`"Team_Member"`)
    .select(`"role"`)
    .where(`"userId" = :userId and "teamId" = :teamId`)
    .withParams({ userId: "u1", teamId: "t1" })
    .limit(1);

// ===========================================================================
// pseAgg.ts — fluent count SELECTs
// ===========================================================================

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfApplications()
const qPseAggApplications = createSelectQuery<S>()
    .from(`"PSEApplication"`)
    .select(`count(*) as cnt`);

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfAcceptedApplications()
const qPseAggAccepted = createSelectQuery<S>()
    .from(`"PSEApplication"`)
    .select(`count(*) as cnt`)
    .where(`"accepted" = true`);

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfActive()
const qPseAggActive = createSelectQuery<S>()
    .from(`"User_Analytics"`)
    .select(`count(*) as cnt`)
    .where(`"isPSE" = true and "isPSEActive" = true`);

// ===========================================================================
// links.ts — fluent SELECT (multi-join)
// ===========================================================================

// mirror of commerce reporting-v2 lib/links.ts fetchLinks()
const qLinks = createSelectQuery<S>()
    .from(`"Link" l`)
    .join(`inner join "User" pse on pse."id" = l."referenceUserId"`)
    .join(`left join "Retailer" r on r."id" = l."retailer"`)
    .select([
        `l.id`,
        `l."createdAt"`,
        `l."referenceUserId" as "pseId"`,
        `l."teamId"`,
        `l."retailer" as "retailerId"`,
        `r."name" as "retailerName"`,
        `l."catalogueProductId"`,
        `l."hash"`,
        `l."sku"`,
        `l."name"`,
        `l."targetUrl"`,
        `l."brand"`,
        `pse."givenName" as "pseGivenName"`,
        `pse."familyName" as "pseFamilyName"`,
        `pse."email" as "pseEmail"`,
    ])
    .orderBy(`l."createdAt" desc`);

// mirror of commerce reporting-v2 lib/links.ts fetchLinkClickSum() (groupBy=linkId)
const qLinkClickSum = createSelectQuery<S>()
    .from(`"Link" l`)
    .join(`inner join "LogProductClick" lpc on lpc."linkId" = l."id"`)
    .select([
        `count(*) as "clickCount"`,
        `null as "groupLabel"`,
        `l."id" as "group"`,
    ])
    .groupBy(`l."id"`);

// ===========================================================================
// orders.ts — fluent SELECT (fetchOrderIds)
// ===========================================================================

// mirror of commerce reporting-v2 lib/orders.ts fetchOrderIds()
const qOrderIds = createSelectQuery<S>()
    .from(`"Network_Order" ordr`)
    .select([`ordr.id`, `ordr."orderId"`, `ordr."networkId"`])
    .orderBy(`ordr."orderDate" desc`)
    .limit(100);

// ===========================================================================
// network/cj.ts — fluent SELECT (fetchAffiliatePayments — joins, no subqueries)
// ===========================================================================

// mirror of commerce reporting-v2 lib/network/cj.ts fetchAffiliatePayments()
const qCjAffiliatePayments = createSelectQuery<S>()
    .from(`"Network_Payment_CJ_Order" po`)
    .join(`join "Network_Payment_CJ" p on p."id" = po."paymentId"`)
    .join(`join "Network_Payment_CJ_Group" pg on pg."id" = p."groupId"`)
    .select([
        `p.*`,
        `pg."datePaid"`,
        `po."orderId"`,
        `po."manuallyAssigned"`,
    ])
    .where(`po."orderId" in (:orderIds)`)
    .withParams({ orderIds: ["o1", "o2"] });

describe("reporting-v2 lib builder duplicates (fluent SELECT)", () => {
    it("qExchangeRates assembles", () => {
        expect(normalizeWhitespace(qExchangeRates.toString())).toBe(
            normalizeWhitespace(`SELECT "from", "to", "rate" FROM "ExchangeRate"`),
        );
    });

    it("qUserTeamId assembles", () => {
        expect(normalizeWhitespace(qUserTeamId.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Team_Member" WHERE "userId" = $1 LIMIT 1`,
            ),
        );
    });

    it("qUserTeamAccessRole assembles", () => {
        expect(normalizeWhitespace(qUserTeamAccessRole.toString())).toBe(
            normalizeWhitespace(
                `SELECT "role" FROM "Team_Member" ` +
                    `WHERE "userId" = $1 and "teamId" = $2 LIMIT 1`,
            ),
        );
    });

    it("qPseAggApplications assembles", () => {
        expect(normalizeWhitespace(qPseAggApplications.toString())).toBe(
            normalizeWhitespace(`SELECT count(*) as cnt FROM "PSEApplication"`),
        );
    });

    it("qPseAggAccepted assembles", () => {
        expect(normalizeWhitespace(qPseAggAccepted.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*) as cnt FROM "PSEApplication" WHERE "accepted" = true`,
            ),
        );
    });

    it("qPseAggActive assembles", () => {
        expect(normalizeWhitespace(qPseAggActive.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*) as cnt FROM "User_Analytics" ` +
                    `WHERE "isPSE" = true and "isPSEActive" = true`,
            ),
        );
    });

    it("qLinks assembles", () => {
        expect(normalizeWhitespace(qLinks.toString())).toBe(
            normalizeWhitespace(
                `SELECT l.id, l."createdAt", l."referenceUserId" as "pseId", ` +
                    `l."teamId", l."retailer" as "retailerId", r."name" as "retailerName", ` +
                    `l."catalogueProductId", l."hash", l."sku", l."name", l."targetUrl", l."brand", ` +
                    `pse."givenName" as "pseGivenName", pse."familyName" as "pseFamilyName", ` +
                    `pse."email" as "pseEmail" ` +
                    `FROM "Link" l ` +
                    `inner join "User" pse on pse."id" = l."referenceUserId" ` +
                    `left join "Retailer" r on r."id" = l."retailer" ` +
                    `ORDER BY l."createdAt" desc`,
            ),
        );
    });

    it("qLinkClickSum assembles", () => {
        expect(normalizeWhitespace(qLinkClickSum.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*) as "clickCount", null as "groupLabel", l."id" as "group" ` +
                    `FROM "Link" l ` +
                    `inner join "LogProductClick" lpc on lpc."linkId" = l."id" ` +
                    `GROUP BY l."id"`,
            ),
        );
    });

    it("qOrderIds assembles", () => {
        expect(normalizeWhitespace(qOrderIds.toString())).toBe(
            normalizeWhitespace(
                `SELECT ordr.id, ordr."orderId", ordr."networkId" ` +
                    `FROM "Network_Order" ordr ORDER BY ordr."orderDate" desc LIMIT 100`,
            ),
        );
    });

    it("qCjAffiliatePayments assembles", () => {
        expect(normalizeWhitespace(qCjAffiliatePayments.toString())).toBe(
            normalizeWhitespace(
                `SELECT p.*, pg."datePaid", po."orderId", po."manuallyAssigned" ` +
                    `FROM "Network_Payment_CJ_Order" po ` +
                    `join "Network_Payment_CJ" p on p."id" = po."paymentId" ` +
                    `join "Network_Payment_CJ_Group" pg on pg."id" = p."groupId" ` +
                    `WHERE po."orderId" in ($1, $2)`,
            ),
        );
        expect([...qCjAffiliatePayments.getParams()]).toEqual(["o1", "o2"]);
    });
});

// --- type-level row assertions for fluent SELECTs ---

type Row_ExchangeRates = SelectBuilderResult<typeof qExchangeRates>;
type _Row_ExchangeRates = RequireTrue<
    AssertEqual<Row_ExchangeRates, { from: string; to: string; rate: number }>
>;

type Row_UserTeamId = SelectBuilderResult<typeof qUserTeamId>;
type _Row_UserTeamId = RequireTrue<
    AssertEqual<Row_UserTeamId, S["schemas"]["public"]["Team_Member"]>
>;

type Row_UserTeamAccessRole = SelectBuilderResult<typeof qUserTeamAccessRole>;
type _Row_UserTeamAccessRole = RequireTrue<
    AssertEqual<Row_UserTeamAccessRole, { role: string }>
>;

type Row_PseAggApplications = SelectBuilderResult<typeof qPseAggApplications>;
type _Row_PseAggApplications = RequireTrue<
    AssertEqual<Row_PseAggApplications, { cnt: number }>
>;

type Row_OrderIds = SelectBuilderResult<typeof qOrderIds>;
type _Row_OrderIds = RequireTrue<
    AssertEqual<
        Row_OrderIds,
        { id: string; orderId: string; networkId: string }
    >
>;

// ===========================================================================
// createSql fallbacks — queries the fluent builder cannot model yet.
// ===========================================================================

describe("reporting-v2 lib builder duplicates (createSql fallback)", () => {
    it("getUserDashboardType — json arrow projection", () => {
        // TODO(builder-api): json (::json)->>key projection — fluent builder can't model this yet
        const q = sql(
            `select ("details"::json)->>'dashboardType' as "dashboardType" ` +
                `from "User" where id = :id`,
        ).withParams({ id: "u1" });
        expect(q.toString()).toBe(
            `select ("details"::json)->>'dashboardType' as "dashboardType" ` +
                `from "User" where id = $1`,
        );
        expect([...q.getParams()]).toEqual(["u1"]);
    });

    it("fetchPseRawStats — scalar/array correlated subqueries", () => {
        // TODO(builder-api): correlated scalar + array() subquery projections — fluent builder can't model this yet
        const q = sql(
            `select u.id, ` +
                `(select count(*) from "Look" look where look."friId" = u.id and look."publishedAt" is not null) as "looks", ` +
                `(select count(*) from "Link" link where link."referenceUserId" = u.id) as "links" ` +
                `from "User" u where ("groups" like :grp)`,
        ).withParams({ grp: "%FRI%" });
        expect(q.toString()).toBe(
            `select u.id, ` +
                `(select count(*) from "Look" look where look."friId" = u.id and look."publishedAt" is not null) as "looks", ` +
                `(select count(*) from "Link" link where link."referenceUserId" = u.id) as "links" ` +
                `from "User" u where ("groups" like $1)`,
        );
        expect([...q.getParams()]).toEqual(["%FRI%"]);
    });

    it("fetchPsePayments — lateral subqueries", () => {
        // TODO(builder-api): LEFT JOIN LATERAL aggregate subqueries — fluent builder can't model this yet
        const q = sql(
            `select uap.*, (uap."amount" + uap."vat")::float8 as "total" ` +
                `from "User_ApprovedPayment" uap ` +
                `left join lateral (select count(*)::int as "teamMemberCount" ` +
                `from "Team_Member" tm2 where tm2."userId" = uap."userId" and tm2."disabled" = false) utm on true ` +
                `where uap."userId" = :pseId order by uap."createdAt" desc`,
        ).withParams({ pseId: "u1" });
        expect(q.toString()).toBe(
            `select uap.*, (uap."amount" + uap."vat")::float8 as "total" ` +
                `from "User_ApprovedPayment" uap ` +
                `left join lateral (select count(*)::int as "teamMemberCount" ` +
                `from "Team_Member" tm2 where tm2."userId" = uap."userId" and tm2."disabled" = false) utm on true ` +
                `where uap."userId" = $1 order by uap."createdAt" desc`,
        );
        expect([...q.getParams()]).toEqual(["u1"]);
    });

    it("fetchPsePaymentsSummary — aggregate rollup (bool_and/count distinct)", () => {
        // TODO(builder-api): bool_and / count(distinct) / array_agg aggregate rollup — fluent builder can't model this yet
        const q = sql(
            `select uap."userId" as "pseId", ` +
                `(array_agg(uap."id"))::text[] as "approvedPaymentIds", ` +
                `sum(uap."amount")::float8 as "amount" ` +
                `from "User_ApprovedPayment" uap ` +
                `where uap."userId" is not null group by uap."userId"`,
        ).withParams({});
        expect(q.toString()).toBe(
            `select uap."userId" as "pseId", ` +
                `(array_agg(uap."id"))::text[] as "approvedPaymentIds", ` +
                `sum(uap."amount")::float8 as "amount" ` +
                `from "User_ApprovedPayment" uap ` +
                `where uap."userId" is not null group by uap."userId"`,
        );
        expect([...q.getParams()]).toEqual([]);
    });

    it("fetchRevolutPayments — string-concat + multi left join", () => {
        // TODO(builder-api): mirrors revolutPayments.fetchRevolutPayments; static IN form here — uses createSql for parity with other fallbacks
        const q = sql(
            `select rpd.*, rpd."amount" + rpd."vat" as "total", ` +
                `pse."givenName" || ' ' || pse."familyName" as "pseName", ` +
                `rpi."id" as "invoiceId" ` +
                `from "Revolut_PaymentDraft" rpd ` +
                `left join "User" pse on pse.id = rpd."userId" ` +
                `left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id" ` +
                `where rpd."status" = :status order by rpd."createdAt" desc`,
        ).withParams({ status: "draft" });
        expect(q.toString()).toBe(
            `select rpd.*, rpd."amount" + rpd."vat" as "total", ` +
                `pse."givenName" || ' ' || pse."familyName" as "pseName", ` +
                `rpi."id" as "invoiceId" ` +
                `from "Revolut_PaymentDraft" rpd ` +
                `left join "User" pse on pse.id = rpd."userId" ` +
                `left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id" ` +
                `where rpd."status" = $1 order by rpd."createdAt" desc`,
        );
        expect([...q.getParams()]).toEqual(["draft"]);
    });

    it("fetchCjOrderCorrections — IN-list expansion", () => {
        // TODO(builder-api): select *, null as alias + IN-list — fluent builder select(*) + extra literal col not modeled; createSql here
        const q = sql(
            `select *, null as "affiliateStatus" ` +
                `from "Network_Order_Correction" where "orderId" in (:orderIds)`,
        ).withParams({ orderIds: ["o1", "o2"] });
        expect(q.toString()).toBe(
            `select *, null as "affiliateStatus" ` +
                `from "Network_Order_Correction" where "orderId" in ($1, $2)`,
        );
        expect([...q.getParams()]).toEqual(["o1", "o2"]);
    });

    it("fetchCjItems — convert_currency casts + EXISTS lateReturn", () => {
        // TODO(builder-api): EXISTS subquery in projection + ::numeric/::float8 casts — fluent builder can't model this yet
        const q = sql(
            `select i.*, null as "affiliateStatus", ` +
                `(i."pseBalance" < -0.1 or exists (` +
                `select 1 from "User_ApprovedPayment_Item" uapi ` +
                `where uapi."anyItemId" = i."id" and uapi."amount" < 0)) as "lateReturn", ` +
                `convert_currency(i."itemValue"::numeric, i."currency", 'GBP'::text, o."orderDate"::date)::float8 as "itemValueGBP" ` +
                `from "Network_Order_CJ_Item" i ` +
                `join "Network_Order" o on o."orderId" = i."orderId" ` +
                `where i."orderId" in (:orderIds)`,
        ).withParams({ orderIds: ["o1", "o2"] });
        expect(q.toString()).toBe(
            `select i.*, null as "affiliateStatus", ` +
                `(i."pseBalance" < -0.1 or exists (` +
                `select 1 from "User_ApprovedPayment_Item" uapi ` +
                `where uapi."anyItemId" = i."id" and uapi."amount" < 0)) as "lateReturn", ` +
                `convert_currency(i."itemValue"::numeric, i."currency", 'GBP'::text, o."orderDate"::date)::float8 as "itemValueGBP" ` +
                `from "Network_Order_CJ_Item" i ` +
                `join "Network_Order" o on o."orderId" = i."orderId" ` +
                `where i."orderId" in ($1, $2)`,
        );
        expect([...q.getParams()]).toEqual(["o1", "o2"]);
    });

    it("fetchPartnerizeItemSnapshots — simple IN (FIXTURE-GAP table)", () => {
        // TODO(builder-api): select * + IN-list with literal-typed schema gap — createSql parity
        // FIXTURE-GAP: Network_Order_Partnerize_Item_Snapshot not in fixture
        const q = sql(
            `select * from "Network_Order_Partnerize_Item_Snapshot" ` +
                `where "conversionItemId" in (:ids)`,
        ).withParams({ ids: ["a", "b"] });
        expect(q.toString()).toBe(
            `select * from "Network_Order_Partnerize_Item_Snapshot" ` +
                `where "conversionItemId" in ($1, $2)`,
        );
        expect([...q.getParams()]).toEqual(["a", "b"]);
    });

    it("fetchRakutenSettlements — ordered IN-list", () => {
        // TODO(builder-api): mirrors rakuten.fetchRakutenSettlements; createSql for IN-list + multi-key order parity
        const q = sql(
            `select * from "Network_Rakuten_Invoice_Settlement" ` +
                `where "naInvoiceId" in (:ids) ` +
                `order by "settlingInvoiceDate" asc, "settlingInvoiceId" asc`,
        ).withParams({ ids: ["i1", "i2"] });
        expect(q.toString()).toBe(
            `select * from "Network_Rakuten_Invoice_Settlement" ` +
                `where "naInvoiceId" in ($1, $2) ` +
                `order by "settlingInvoiceDate" asc, "settlingInvoiceId" asc`,
        );
        expect([...q.getParams()]).toEqual(["i1", "i2"]);
    });

    it("orderSelect rakutenPaymentId filter — nested EXISTS join chain", () => {
        // TODO(builder-api): correlated EXISTS with internal joins — fluent builder can't model this yet
        const q = sql(
            `select ordr.id from "Network_Order" ordr ` +
                `where exists (select 1 ` +
                `from "Network_Payment_Invoice_Item_Rakuten" nipi ` +
                `join "Network_Payment_Invoice_Rakuten" nipr on nipr."invoiceId" = nipi."invoiceId" ` +
                `join "Network_Payment_Rakuten" npr on npr."paymentId" = nipr."paymentId" ` +
                `where npr."id" = :pid and nipi."orderId" = ordr."rawOrderId")`,
        ).withParams({ pid: "p1" });
        expect(q.toString()).toBe(
            `select ordr.id from "Network_Order" ordr ` +
                `where exists (select 1 ` +
                `from "Network_Payment_Invoice_Item_Rakuten" nipi ` +
                `join "Network_Payment_Invoice_Rakuten" nipr on nipr."invoiceId" = nipi."invoiceId" ` +
                `join "Network_Payment_Rakuten" npr on npr."paymentId" = nipr."paymentId" ` +
                `where npr."id" = $1 and nipi."orderId" = ordr."rawOrderId")`,
        );
        expect([...q.getParams()]).toEqual(["p1"]);
    });
});

export type CommerceReportingV2LibBuilderTestsPass = true;
