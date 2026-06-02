/**
 * Commerce reporting-v2 team controllers — builder runtime mirrors.
 * Setup-only / stress-test pass: assertions encode the INTENDED SQL + row type;
 * failures => engine fix-list. Do not weaken intended assertions.
 *
 * DML / builder-inexpressible queries from this area routed via the typed-raw
 * createSql path and tagged TODO(builder-api):
 *   - controller/team/add-payment.ts            (INSERT — uses createInsertQuery)
 *   - controller/team/upcoming-invoice.ts        (8-way LEFT JOIN + nested coalesce)
 */
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createInsertQuery,
    createSql,
    normalizeWhitespace,
} from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;

// ===========================================================================
// controller/team/invoices.ts  action()  (SELECT)
// ===========================================================================
// materialized from dynamic source: period=false, start+end both present so the
// applyIf(period) branch is dropped and both whereIf(start)/whereIf(end) kept.
const qInvoices = createSelectQuery<S>()
    .withParams({ teamId: "t1", start: "2024-01-01", end: "2024-12-31" })
    .from(`"Revolut_PaymentInvoice" i`)
    .select([
        `i.id`,
        `i.amount`,
        `i.vat`,
        `i.currency`,
        `i."createdAt"`,
    ])
    .where(`i."status" = 'active'`)
    .where(`i."teamId" = :teamId`)
    .orderBy(`i."createdAt" desc`)
    .limit(20)
    .offset(0)
    .whereIf(true, `i."createdAt" >= :start`)
    .whereIf(true, `i."createdAt" <= :end`);

// ===========================================================================
// controller/team/payments-summary.ts  action()  (SELECT, aggregates)
// ===========================================================================
// materialized from dynamic source: convertToCurrency='GBP' (literal-currency
// selectIf-true branch kept, p.currency branch dropped); date range => BETWEEN.
const qPaymentsSummary = createSelectQuery<S>()
    .withParams({ teamId: "t1", start: "2024-01-01", end: "2024-12-31" })
    .from(`"Revolut_PaymentDraft" p`)
    .select(`array_agg(p."id")::text[] as "paymentIds"`)
    .select(
        `sum( convert_currency( p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date ) + convert_currency( p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date ) )::float8 as "total"`,
    )
    .select(
        `sum( convert_currency( p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date ) )::float8 as "amount"`,
    )
    .select(
        `sum( convert_currency( p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date ) )::float8 as "vat"`,
    )
    .selectIf(true, `'GBP'::text as "currency"`)
    .selectIf(false, `p.currency`)
    .where(`p."teamId" = :teamId`)
    .where(`p."status" = 'COMPLETED'`)
    .whereIf(true, `p."createdAt" between :start and :end`);

// ===========================================================================
// controller/team/pse-overview.ts  fetchPseInfo()  (SELECT, multi-join)
// ===========================================================================
const qPseOverview = createSelectQuery<S>()
    .withParams({ currency: "GBP", teamId: "t1" })
    .from(`"Team_Member" tm`)
    .join(`join "User" pse on pse."id" = tm."userId"`)
    .join(
        `left join "Team_Member_SalesTarget" tms on tms."teamId" = tm."teamId" and tms."pseId" = pse."id"`,
    )
    .join(`left join "Team_Role" tr on tr."id" = tm."teamRoleId"`)
    .select([
        `pse."id" as "pseId"`,
        `(pse."givenName" || ' ' || pse."familyName")::text as "pseName"`,
        `pse."givenName" as "pseGivenName"`,
        `pse."familyName" as "pseFamilyName"`,
        `pse.avatar`,
        `tm."teamRoleId" as "teamRoleId"`,
        `tr."name" as "teamRole"`,
        `convert_currency( tms."annualSalesTarget"::numeric, tms."currency"::text, :currency::text, current_date )::float8 as "annualSalesTarget"`,
        `convert_currency( tms."monthlySalesTarget"::numeric, tms."currency"::text, :currency::text, current_date )::float8 as "monthlySalesTarget"`,
        `tms."currency" as "targetCurrency"`,
    ])
    .where(`tm."teamId" = :teamId`);

// ===========================================================================
// controller/team/stats.ts  (4 count() SELECTs)
// ===========================================================================
// materialized from dynamic source: pseId provided so whereIf(pseId) kept.
const qStatsLinks = createSelectQuery<S>()
    .withParams({ teamId: "t1", pseId: "u1" })
    .from(`"Link" l`)
    .join(`join "Team_Member" tm on tm."userId" = l."referenceUserId"`)
    .where(`tm."teamId" = :teamId`)
    .whereIf(true, `l."referenceUserId" = :pseId`)
    .select(`count(*)::int as "cnt"`);

const qStatsConsultations = createSelectQuery<S>()
    .withParams({ teamId: "t1", pseId: "u1" })
    .from(`"Consultation" c`)
    .join(`join "Team_Member" tm on tm."userId" = c."friId"`)
    .where(`tm."teamId" = :teamId`)
    .whereIf(true, `c."friId" = :pseId`)
    .select(`count(*)::int as "cnt"`);

const qStatsMoodboards = createSelectQuery<S>()
    .withParams({ teamId: "t1", pseId: "u1" })
    .from(`"Moodboard" m`)
    .join(`join "Team_Member" tm on tm."userId" = m."friId"`)
    .where(`tm."teamId" = :teamId`)
    .whereIf(true, `m."friId" = :pseId`)
    .select(`count(*)::int as "cnt"`);

const qStatsLooks = createSelectQuery<S>()
    .withParams({ teamId: "t1", pseId: "u1" })
    .from(`"Look" l`)
    .join(`join "Team_Member" tm on tm."userId" = l."friId"`)
    .where(`tm."teamId" = :teamId`)
    .whereIf(true, `l."friId" = :pseId`)
    .select(`count(*)::int as "cnt"`);

// ===========================================================================
// controller/team/target.ts  main()  pseId branch  (SELECT)
// ===========================================================================
// materialized from dynamic source: convertToCurrency provided (selectIf-true
// converted columns kept). Team_SalesTarget (no-pseId) branch is FIXTURE-GAP and
// is covered in the plain file only.
const qTargetPse = createSelectQuery<S>()
    .withParams({ teamId: "t1", pseId: "u1", convertToCurrency: "GBP" })
    .from(`"Team_Member_SalesTarget"`)
    .select(`"teamId"`)
    .select(`"pseId"`)
    .selectIf(
        true,
        `convert_currency( "annualSalesTarget"::numeric, "currency", :convertToCurrency, current_date )::float8 as "annualSalesTarget"`,
    )
    .selectIf(
        true,
        `convert_currency( "monthlySalesTarget"::numeric, "currency", :convertToCurrency, current_date )::float8 as "monthlySalesTarget"`,
    )
    .selectIf(true, `:convertToCurrency as "currency"`)
    .selectIf(false, `"annualSalesTarget"::float8`)
    .selectIf(false, `"monthlySalesTarget"::float8`)
    .selectIf(false, `"currency"`)
    .select(`"updatedAt"`)
    .where(`"teamId" = :teamId`)
    .where(`"pseId" = :pseId`);

// ===========================================================================
// controller/team/add-payment.ts  handler()  (INSERT)
// ===========================================================================
const qAddPayment = createInsertQuery<S>()
    .into(`"User_ApprovedPayment"`)
    .value(`"userId"`, `null`)
    .value(`"teamId"`, `:teamId`)
    .value(`amount`, `:amount`)
    .value(`vat`, `:vat`)
    .value(`comment`, `:comment`)
    .value(`currency`, `:currency`)
    .value(`type`, `3`)
    .withParams({
        teamId: "t1",
        amount: 10,
        vat: 2,
        comment: "extra",
        currency: "GBP",
    });

// ===========================================================================
// controller/team/upcoming-invoice.ts  action()  (raw multi-join SELECT)
// ===========================================================================
// TODO(builder-api): 8-way LEFT JOIN + nested coalesce/nullif/trim projection +
// IN-list status filter — fluent builder can't model this comfortably yet.
// materialized from dynamic source: userFilter present (userId => :userId).
const sql = createSql<S>();
const qUpcomingInvoice = sql(
    `select
        coalesce(uapi.id, uap.id) as "id",
        coalesce(uapi.amount, uap.amount) as "amount",
        coalesce(uapi.vat, uap.vat) as "vat",
        coalesce(uapi.currency, uap.currency) as "currency",
        uap."createdAt",
        coalesce(ri.sku, ci.sku, pi.sku)::text as "sku",
        coalesce(ri.product, pi.name, uap.comment)::text as "name",
        coalesce(o."advertiser", '')::text as "retailer",
        o."orderId",
        o."orderDate",
        coalesce( nullif(trim(u."givenName" || ' ' || u."familyName"), ''), 'Team Payment' )::text as "pseName"
    from "User_ApprovedPayment" uap
    left join "User_ApprovedPayment_Item" uapi on uapi."userApprovedPaymentId" = uap."id"
    left join "Network_Order" o on o."id" = uap."networkOrderId"
    left join "LogProductClick" click on click.sid = o."clickId"
    left join "Network_Order_Rakuten_Item" ri on ri."id" = uapi."rakutenItemId"
    left join "Network_Order_CJ_Item" ci on ci."id" = uapi."cjItemId"
    left join "Network_Order_Partnerize_Item" pi on pi."id" = uapi."partnerizeItemId"
    left join "User" u on u."id" = uap."userId"
    where uap."paid" = false
      and uap."status" in ('approved', 're-approved', 'created', 'pending')
      and uap."revolutDraftId" is null
      and coalesce(uap."teamId", click."teamId") = :teamId
      and uap."userId" = :userId
    order by "pseName", uap."createdAt" desc`,
).withParams({ teamId: "t1", userId: "u1" });

describe("reporting-v2 team builder mirrors", () => {
    it("qInvoices assembles", () => {
        expect(normalizeWhitespace(qInvoices.toString())).toBe(
            normalizeWhitespace(
                `SELECT i.id, i.amount, i.vat, i.currency, i."createdAt" ` +
                    `FROM "Revolut_PaymentInvoice" i ` +
                    `WHERE i."status" = 'active' AND i."teamId" = $1 ` +
                    `AND i."createdAt" >= $2 AND i."createdAt" <= $3 ` +
                    `ORDER BY i."createdAt" desc LIMIT 20 OFFSET 0`,
            ),
        );
    });

    it("qPaymentsSummary assembles", () => {
        expect(normalizeWhitespace(qPaymentsSummary.toString())).toBe(
            normalizeWhitespace(
                `SELECT array_agg(p."id")::text[] as "paymentIds", ` +
                    `sum( convert_currency( p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date ) + convert_currency( p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date ) )::float8 as "total", ` +
                    `sum( convert_currency( p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date ) )::float8 as "amount", ` +
                    `sum( convert_currency( p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date ) )::float8 as "vat", ` +
                    `'GBP'::text as "currency" ` +
                    `FROM "Revolut_PaymentDraft" p ` +
                    `WHERE p."teamId" = $1 AND p."status" = 'COMPLETED' ` +
                    `AND p."createdAt" between $2 and $3`,
            ),
        );
    });

    it("qPseOverview assembles", () => {
        expect(normalizeWhitespace(qPseOverview.toString())).toBe(
            normalizeWhitespace(
                `SELECT pse."id" as "pseId", ` +
                    `(pse."givenName" || ' ' || pse."familyName")::text as "pseName", ` +
                    `pse."givenName" as "pseGivenName", ` +
                    `pse."familyName" as "pseFamilyName", ` +
                    `pse.avatar, ` +
                    `tm."teamRoleId" as "teamRoleId", ` +
                    `tr."name" as "teamRole", ` +
                    `convert_currency( tms."annualSalesTarget"::numeric, tms."currency"::text, $1::text, current_date )::float8 as "annualSalesTarget", ` +
                    `convert_currency( tms."monthlySalesTarget"::numeric, tms."currency"::text, $1::text, current_date )::float8 as "monthlySalesTarget", ` +
                    `tms."currency" as "targetCurrency" ` +
                    `FROM "Team_Member" tm ` +
                    `join "User" pse on pse."id" = tm."userId" ` +
                    `left join "Team_Member_SalesTarget" tms on tms."teamId" = tm."teamId" and tms."pseId" = pse."id" ` +
                    `left join "Team_Role" tr on tr."id" = tm."teamRoleId" ` +
                    `WHERE tm."teamId" = $2`,
            ),
        );
    });

    it("qStatsLinks assembles", () => {
        expect(normalizeWhitespace(qStatsLinks.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*)::int as "cnt" FROM "Link" l ` +
                    `join "Team_Member" tm on tm."userId" = l."referenceUserId" ` +
                    `WHERE tm."teamId" = $1 AND l."referenceUserId" = $2`,
            ),
        );
    });

    it("qStatsConsultations assembles", () => {
        expect(normalizeWhitespace(qStatsConsultations.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*)::int as "cnt" FROM "Consultation" c ` +
                    `join "Team_Member" tm on tm."userId" = c."friId" ` +
                    `WHERE tm."teamId" = $1 AND c."friId" = $2`,
            ),
        );
    });

    it("qStatsMoodboards assembles", () => {
        expect(normalizeWhitespace(qStatsMoodboards.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*)::int as "cnt" FROM "Moodboard" m ` +
                    `join "Team_Member" tm on tm."userId" = m."friId" ` +
                    `WHERE tm."teamId" = $1 AND m."friId" = $2`,
            ),
        );
    });

    it("qStatsLooks assembles", () => {
        expect(normalizeWhitespace(qStatsLooks.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*)::int as "cnt" FROM "Look" l ` +
                    `join "Team_Member" tm on tm."userId" = l."friId" ` +
                    `WHERE tm."teamId" = $1 AND l."friId" = $2`,
            ),
        );
    });

    it("qTargetPse assembles", () => {
        expect(normalizeWhitespace(qTargetPse.toString())).toBe(
            normalizeWhitespace(
                `SELECT "teamId", "pseId", ` +
                    `convert_currency( "annualSalesTarget"::numeric, "currency", $1, current_date )::float8 as "annualSalesTarget", ` +
                    `convert_currency( "monthlySalesTarget"::numeric, "currency", $1, current_date )::float8 as "monthlySalesTarget", ` +
                    `$1 as "currency", ` +
                    `"updatedAt" ` +
                    `FROM "Team_Member_SalesTarget" ` +
                    `WHERE "teamId" = $2 AND "pseId" = $3`,
            ),
        );
    });

    it("qAddPayment assembles", () => {
        expect(qAddPayment.toString()).toBe(
            `insert into "User_ApprovedPayment" ("userId", "teamId", amount, vat, comment, currency, type) ` +
                `values (null, $1, $2, $3, $4, $5, 3)`,
        );
        expect([...qAddPayment.getParams()]).toEqual([
            "t1",
            10,
            2,
            "extra",
            "GBP",
        ]);
    });

    it("qUpcomingInvoice (createSql) collects params", () => {
        expect([...qUpcomingInvoice.getParams()]).toEqual(["t1", "u1"]);
    });
});

// ===========================================================================
// type-level row assertions
// ===========================================================================

type Row_Invoices = SelectBuilderResult<typeof qInvoices>;
type _Row_Invoices = RequireTrue<
    AssertEqual<
        Row_Invoices,
        { id: string; amount: number; vat: number; currency: string; createdAt: string }
    >
>;

type Row_PaymentsSummary = SelectBuilderResult<typeof qPaymentsSummary>;
// `currency` is projected via selectIf(true, …) → optional per the *If contract.
type _Row_PaymentsSummary = RequireTrue<
    AssertEqual<
        Row_PaymentsSummary,
        {
            paymentIds: string[];
            total: number;
            amount: number;
            vat: number;
            currency?: string;
        }
    >
>;

type Row_PseOverview = SelectBuilderResult<typeof qPseOverview>;
type _Row_PseOverview = RequireTrue<
    AssertEqual<
        Row_PseOverview,
        {
            pseId: string;
            pseName: string;
            pseGivenName: string | null;
            pseFamilyName: string | null;
            avatar: string | null;
            teamRoleId: string | null;
            teamRole: string | null;
            annualSalesTarget: number;
            monthlySalesTarget: number;
            targetCurrency: string | null;
        }
    >
>;

type Row_StatsLinks = SelectBuilderResult<typeof qStatsLinks>;
type _Row_StatsLinks = RequireTrue<
    AssertEqual<Row_StatsLinks, { cnt: number }>
>;

type Row_StatsConsultations = SelectBuilderResult<typeof qStatsConsultations>;
type _Row_StatsConsultations = RequireTrue<
    AssertEqual<Row_StatsConsultations, { cnt: number }>
>;

type Row_StatsMoodboards = SelectBuilderResult<typeof qStatsMoodboards>;
type _Row_StatsMoodboards = RequireTrue<
    AssertEqual<Row_StatsMoodboards, { cnt: number }>
>;

type Row_StatsLooks = SelectBuilderResult<typeof qStatsLooks>;
type _Row_StatsLooks = RequireTrue<
    AssertEqual<Row_StatsLooks, { cnt: number }>
>;

type Row_TargetPse = SelectBuilderResult<typeof qTargetPse>;
// annualSalesTarget / monthlySalesTarget / currency are all projected via
// selectIf(true, …) → optional per the *If contract. `currency` is the
// projected :convertToCurrency param (string), not unknown.
type _Row_TargetPse = RequireTrue<
    AssertEqual<
        Row_TargetPse,
        {
            teamId: string;
            pseId: string;
            annualSalesTarget?: number;
            monthlySalesTarget?: number;
            currency?: string;
            updatedAt: string;
        }
    >
>;

export type CommerceReportingV2TeamBuilderTestsPass = true;
