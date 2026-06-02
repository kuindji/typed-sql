/**
 * Commerce reporting-v2 (my + analytics) — builder runtime mirrors.
 * Setup-only / stress-test pass; failures => engine fix-list.
 *
 * Source area: reporting-v2 controllers under controller/my/* and
 * controller/analytics/return-durations.ts.
 *
 * Simple SELECTs are mirrored with createSelectQuery. Builder-inexpressible
 * queries (UNION ALL, WITH/CTE, CROSS JOIN LATERAL, correlated subqueries)
 * use the typed-raw createSql path, tagged // TODO(builder-api).
 */
import { describe, it, expect } from "bun:test";
import { createSelectQuery, createSql, normalizeWhitespace } from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;
const mainSql = createSql<S>();

// ===========================================================================
// Fluent builders — simple SELECTs
// ===========================================================================

// --- mirror of controller/my/credit-notes.ts action() ---
// materialized from dynamic source: $2/$3 limit/offset -> numeric 20/0.
const qCreditNotes = createSelectQuery<S>()
    .from(`"Revolut_PaymentCreditNote" i`)
    .select([`i.id`, `i.amount`, `i.vat`, `i.currency`, `i."createdAt"`])
    .where(`i."userId" = :userId`)
    .withParams({ userId: "u1" })
    .orderBy(`"createdAt" desc`)
    .limit(20)
    .offset(0);

// --- mirror of controller/my/download-credit-note.ts getCreditNote() ---
const qDownloadCreditNote = createSelectQuery<S>()
    .from(`"Revolut_PaymentCreditNote"`)
    .select(`*`)
    .where(`"id" = :id`)
    .withParams({ id: "cn1" });

// --- mirror of controller/my/download-invoice.ts getInvoice() ---
const qDownloadInvoice = createSelectQuery<S>()
    .from(`"Revolut_PaymentInvoice"`)
    .select(`*`)
    .where(`"id" = :id`)
    .withParams({ id: "inv1" });

// --- mirror of controller/my/invoices.ts action() ---
// materialized from dynamic source: !period && start && end branches included;
// .applyIf(period) period-window branch omitted.
const qInvoices = createSelectQuery<S>()
    .from(`"Revolut_PaymentInvoice" i`)
    .select([`i.id`, `i.amount`, `i.vat`, `i.currency`, `i."createdAt"`])
    .where(`i."userId" = :userId`)
    .where(`i."status" = 'active'`)
    .where(`i."createdAt" >= :start`)
    .where(`i."createdAt" <= :end`)
    .withParams({ userId: "u1", start: "2025-01-01", end: "2025-12-31" })
    .orderBy(`i."createdAt" desc`)
    .limit(20)
    .offset(0);

// --- mirror of controller/my/stats.ts getNumberOfLinks() ---
const qStatsLinks = createSelectQuery<S>()
    .from(`"Link" l`)
    .where(`l."referenceUserId" = :userId`)
    .select(`count(*)::int as "cnt"`)
    .withParams({ userId: "u1" });

// --- mirror of controller/my/stats.ts getNumberOfConsultations() ---
const qStatsConsultations = createSelectQuery<S>()
    .from(`"Consultation" c`)
    .where(`c."friId" = :userId`)
    .select(`count(*)::int as "cnt"`)
    .withParams({ userId: "u1" });

// --- mirror of controller/my/stats.ts getNumberOfMoodboards() ---
const qStatsMoodboards = createSelectQuery<S>()
    .from(`"Moodboard" m`)
    .where(`m."friId" = :userId`)
    .select(`count(*)::int as "cnt"`)
    .withParams({ userId: "u1" });

// --- mirror of controller/my/stats.ts getNumberOfLooks() ---
const qStatsLooks = createSelectQuery<S>()
    .from(`"Look" l`)
    .where(`l."friId" = :userId`)
    .select(`count(*)::int as "cnt"`)
    .withParams({ userId: "u1" });

// --- mirror of controller/my/payments-summary.ts action() ---
// materialized from dynamic source: convertToCurrency='GBP' (currency-cast
// branch via selectIf; p.currency branch omitted); startDate && endDate present.
const qPaymentsSummary = createSelectQuery<S>()
    .from(`"Revolut_PaymentDraft" p`)
    .select(`array_agg(p."id")::text[] as "paymentIds"`)
    // NB: these select fragments are kept as single-line string literals (not `+`
    // concatenated). A `"a" + "b"` chain widens to `string` at the type level, so
    // the builder's `select<T extends string>` would infer `T = string` and drop
    // the column. Single literals preserve the precise type. Runtime string is
    // identical, so the "assembles" expectation is unchanged.
    .select(
        `sum(convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) + convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date))::float8 as "total"`,
    )
    .select(
        `sum(convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) + convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date))::float8 as "amount"`,
    )
    .select(
        `sum(convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) + convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date))::float8 as "vat"`,
    )
    .select(`'GBP'::text as "currency"`)
    .where(`p."createdAt" between :start and :end`)
    .where(`p."userId" = :userId`)
    .where(`p."status" = 'COMPLETED'`)
    .withParams({ userId: "u1", start: "2025-01-01", end: "2025-12-31" });

describe("reporting-v2 (my + analytics) builder mirrors", () => {
    it("qCreditNotes assembles", () => {
        expect(normalizeWhitespace(qCreditNotes.toString())).toBe(
            normalizeWhitespace(
                `SELECT i.id, i.amount, i.vat, i.currency, i."createdAt" ` +
                    `FROM "Revolut_PaymentCreditNote" i WHERE i."userId" = $1 ` +
                    `ORDER BY "createdAt" desc LIMIT 20 OFFSET 0`,
            ),
        );
        expect([...qCreditNotes.getParams()]).toEqual(["u1"]);
    });

    it("qDownloadCreditNote assembles", () => {
        expect(normalizeWhitespace(qDownloadCreditNote.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentCreditNote" WHERE "id" = $1`,
            ),
        );
        expect([...qDownloadCreditNote.getParams()]).toEqual(["cn1"]);
    });

    it("qDownloadInvoice assembles", () => {
        expect(normalizeWhitespace(qDownloadInvoice.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentInvoice" WHERE "id" = $1`,
            ),
        );
        expect([...qDownloadInvoice.getParams()]).toEqual(["inv1"]);
    });

    it("qInvoices assembles", () => {
        expect(normalizeWhitespace(qInvoices.toString())).toBe(
            normalizeWhitespace(
                `SELECT i.id, i.amount, i.vat, i.currency, i."createdAt" ` +
                    `FROM "Revolut_PaymentInvoice" i ` +
                    `WHERE i."userId" = $1 AND i."status" = 'active' ` +
                    `AND i."createdAt" >= $2 AND i."createdAt" <= $3 ` +
                    `ORDER BY i."createdAt" desc LIMIT 20 OFFSET 0`,
            ),
        );
        expect([...qInvoices.getParams()]).toEqual(["u1", "2025-01-01", "2025-12-31"]);
    });

    it("qStatsLinks assembles", () => {
        expect(normalizeWhitespace(qStatsLinks.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*)::int as "cnt" FROM "Link" l WHERE l."referenceUserId" = $1`,
            ),
        );
        expect([...qStatsLinks.getParams()]).toEqual(["u1"]);
    });

    it("qStatsConsultations assembles", () => {
        expect(normalizeWhitespace(qStatsConsultations.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*)::int as "cnt" FROM "Consultation" c WHERE c."friId" = $1`,
            ),
        );
        expect([...qStatsConsultations.getParams()]).toEqual(["u1"]);
    });

    it("qStatsMoodboards assembles", () => {
        expect(normalizeWhitespace(qStatsMoodboards.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*)::int as "cnt" FROM "Moodboard" m WHERE m."friId" = $1`,
            ),
        );
        expect([...qStatsMoodboards.getParams()]).toEqual(["u1"]);
    });

    it("qStatsLooks assembles", () => {
        expect(normalizeWhitespace(qStatsLooks.toString())).toBe(
            normalizeWhitespace(
                `SELECT count(*)::int as "cnt" FROM "Look" l WHERE l."friId" = $1`,
            ),
        );
        expect([...qStatsLooks.getParams()]).toEqual(["u1"]);
    });

    it("qPaymentsSummary assembles", () => {
        expect(normalizeWhitespace(qPaymentsSummary.toString())).toBe(
            normalizeWhitespace(
                `SELECT array_agg(p."id")::text[] as "paymentIds", ` +
                    `sum(convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) + ` +
                    `convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date))::float8 as "total", ` +
                    `sum(convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) + ` +
                    `convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date))::float8 as "amount", ` +
                    `sum(convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) + ` +
                    `convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date))::float8 as "vat", ` +
                    `'GBP'::text as "currency" ` +
                    `FROM "Revolut_PaymentDraft" p ` +
                    // builder numbers placeholders by first-reference order in the
                    // assembled SQL: :start/:end (in WHERE) come before :userId.
                    `WHERE p."createdAt" between $1 and $2 AND p."userId" = $3 AND p."status" = 'COMPLETED'`,
            ),
        );
    });

    // =======================================================================
    // createSql typed-raw fallbacks — builder-inexpressible queries
    // =======================================================================

    // TODO(builder-api): UNION ALL — fluent builder cannot model set operations.
    // mirror of controller/my/upcoming-invoice.ts action()
    it("upcoming-invoice (union all) via createSql", () => {
        const q = mainSql(
            `select uapi.id, uapi.amount, uapi.vat, uapi.currency, uap."createdAt", ` +
                `coalesce(ri.sku, ci.sku, pi.sku)::text as "sku", ` +
                `coalesce(ri.product, pi.name)::text as "name", ` +
                `o."advertiser" as "retailer", o."orderId", o."orderDate" ` +
                `from "User_ApprovedPayment_Item" uapi ` +
                `join "User_ApprovedPayment" uap on uap."id" = uapi."userApprovedPaymentId" ` +
                `join "Network_Order" o on o."id" = uap."networkOrderId" ` +
                `join "LogProductClick" click on click.sid = o."clickId" ` +
                `left join "Network_Order_Rakuten_Item" ri on ri."id" = uapi."rakutenItemId" ` +
                `left join "Network_Order_CJ_Item" ci on ci."id" = uapi."cjItemId" ` +
                `left join "Network_Order_Partnerize_Item" pi on pi."id" = uapi."partnerizeItemId" ` +
                `where uap."userId" = :userId and uap."paid" = false ` +
                `and uap."status" in ('approved', 're-approved', 'created', 'pending') ` +
                `and click."teamId" is null ` +
                `union all ` +
                `select uap.id, uap.amount, uap.vat, uap.currency, uap."createdAt", ` +
                `null::text as "sku", uap.comment as "name", ''::text as "retailer", ` +
                `null::text as "orderId", null::timestamptz as "orderDate" ` +
                `from "User_ApprovedPayment" uap ` +
                `where uap."userId" = :userId and uap."paid" = false ` +
                `and uap."status" in ('approved', 're-approved', 'created', 'pending') ` +
                `and uap."networkOrderId" is null ` +
                `order by "createdAt" desc`,
        ).withParams({ userId: "u1" });
        expect(q.toString()).toContain(`union all`);
        // :userId is referenced twice but createSql reuses one placeholder ($1)
        // and collects a single value.
        expect([...q.getParams()]).toEqual(["u1"]);
    });

    // TODO(builder-api): correlated subqueries + derived FROM subquery — no fluent API.
    // mirror of controller/analytics/return-durations.ts rakutenReturnDurations
    it("rakuten return durations via createSql", () => {
        const q = mainSql(
            `select extract(day from max(return_duration))::int as max_duration, ` +
                `extract(day from avg(return_duration))::int as avg_duration ` +
                `from ( select ( ` +
                `(select max("processDate") from "Network_Order_Rakuten_Item_Snapshot" ` +
                `where "commissionAmount" < 0 and "rakutenItemId" = i.id) - ` +
                `(select min("processDate") from "Network_Order_Rakuten_Item_Snapshot" ` +
                `where "commissionAmount" > 0 and "rakutenItemId" = i.id) ` +
                `) as return_duration from "Network_Order_Rakuten_Item" i ` +
                `where exists( select 1 from "Network_Order_Rakuten_Item_Snapshot" ` +
                `where "commissionAmount" < 0 and "rakutenItemId" = i.id ) ` +
                `) as all_durations`,
        ).withParams({});
        expect(q.toString()).toContain(`Network_Order_Rakuten_Item`);
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): derived FROM subquery + join + group by + correlated subqueries.
    // mirror of controller/analytics/return-durations.ts rakutenReturnDurationsByAdvertiser
    it("rakuten return durations by advertiser via createSql", () => {
        const q = mainSql(
            `select advertiser, extract(day from max(return_duration))::int as max_duration, ` +
                `extract(day from avg(return_duration))::int as avg_duration ` +
                `from ( select o.advertiser, ( ` +
                `(select max("processDate") from "Network_Order_Rakuten_Item_Snapshot" ` +
                `where "commissionAmount" < 0 and "rakutenItemId" = i.id) - ` +
                `(select min("processDate") from "Network_Order_Rakuten_Item_Snapshot" ` +
                `where "commissionAmount" > 0 and "rakutenItemId" = i.id) ` +
                `) as return_duration from "Network_Order_Rakuten_Item" i ` +
                `join "Network_Order" o on o."orderId" = i."orderId" ` +
                `where exists( select 1 from "Network_Order_Rakuten_Item_Snapshot" ` +
                `where "commissionAmount" < 0 and "rakutenItemId" = i.id ) ` +
                `) as all_durations group by advertiser`,
        ).withParams({});
        expect(q.toString()).toContain(`group by advertiser`);
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): WITH/CTE + CROSS JOIN LATERAL — no fluent API.
    // mirror of controller/analytics/return-durations.ts cjReturnDurations
    it("cj return durations (cte + lateral) via createSql", () => {
        const q = mainSql(
            `with corrections as ( ` +
                `select concat(o."orderId"::text, (item->>'sku')) as order_sku, o.advertiser, ` +
                `c."correctionDate" as correction_date, (item->>'quantity')::int as quantity ` +
                `from "Network_Order_Correction" c ` +
                `join "Network_Order" o on o."orderId" = c."orderId" ` +
                `cross join lateral json_array_elements((c.details::json)->'items') as item ` +
                `) select avg(return_duration)::int as avg_duration, max(return_duration)::int as max_duration ` +
                `from ( select order_sku, extract(day from ( ` +
                `(select max(correction_date) from corrections mc where mc.order_sku = corrections.order_sku and quantity < 0) - ` +
                `(select min(correction_date) from corrections mc where mc.order_sku = corrections.order_sku and quantity > 0) ` +
                `))::int as return_duration from corrections group by order_sku ` +
                `) as dates where return_duration > 0`,
        ).withParams({});
        expect(q.toString()).toContain(`cross join lateral`);
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): WITH/CTE + CROSS JOIN LATERAL + group by.
    // mirror of controller/analytics/return-durations.ts cjReturnDurationsByAdvertiser
    it("cj return durations by advertiser (cte + lateral) via createSql", () => {
        const q = mainSql(
            `with corrections as ( ` +
                `select concat(o."orderId"::text, (item->>'sku')) as order_sku, o.advertiser, ` +
                `c."correctionDate" as correction_date, (item->>'quantity')::int as quantity ` +
                `from "Network_Order_Correction" c ` +
                `join "Network_Order" o on o."orderId" = c."orderId" ` +
                `cross join lateral json_array_elements((c.details::json)->'items') as item ` +
                `) select advertiser, avg(return_duration)::int as avg_duration, max(return_duration)::int as max_duration ` +
                `from ( select order_sku, (array_agg(advertiser))[1] as advertiser, extract(day from ( ` +
                `(select max(correction_date) from corrections mc where mc.order_sku = corrections.order_sku and quantity < 0) - ` +
                `(select min(correction_date) from corrections mc where mc.order_sku = corrections.order_sku and quantity > 0) ` +
                `))::int as return_duration from corrections group by order_sku ` +
                `) as dates where return_duration > 0 group by advertiser`,
        ).withParams({});
        expect(q.toString()).toContain(`group by advertiser`);
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): WITH/CTE + UNION + CROSS JOIN LATERAL + correlated subqueries.
    // mirror of controller/analytics/return-durations.ts partnerizeReturnDurations
    it("partnerize return durations (cte + union + lateral) via createSql", () => {
        const q = mainSql(
            `with events as ( ` +
                `select item->>'conversion_item_id' as item_id, ` +
                `cast(item->>'last_update' as timestamptz) as event_date, item->>'item_status' as status ` +
                `from "Network_Order" ` +
                `cross join lateral json_array_elements((details::json)->'conversion_items') as item ` +
                `where "networkId" = 'partnerize' ` +
                `union ` +
                `select item->>'conversion_item_id' as item_id, ` +
                `cast(item->>'last_update' as timestamptz) as event_date, item->>'item_status' as status ` +
                `from "Network_Order_Snapshot" ` +
                `cross join lateral json_array_elements((details::json)->'conversion_items') as item ` +
                `where "networkId" = 'partnerize' ` +
                `), return_durations as ( ` +
                `select distinct item_id, extract(day from ( ` +
                `(select min(sub.event_date) from events sub where sub.item_id = e.item_id and sub.status = 'rejected') - ` +
                `(select min(sub.event_date) from events sub where sub.item_id = e.item_id and (sub.status = 'pending' or sub.status = 'approved')) ` +
                `)) as return_duration from events e ` +
                `) select avg(return_duration)::int as avg_duration, max(return_duration)::int as max_duration ` +
                `from return_durations where return_duration is not null`,
        ).withParams({});
        expect(q.toString()).toContain(`union`);
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): WITH/CTE + UNION + LATERAL + group by — by-advertiser variant.
    // mirror of controller/analytics/return-durations.ts partnerizeReturnDurationsByAdvertiser
    it("partnerize return durations by advertiser via createSql", () => {
        const q = mainSql(
            `with events as ( ` +
                `select advertiser, item->>'conversion_item_id' as item_id, ` +
                `cast(item->>'last_update' as timestamptz) as event_date, item->>'item_status' as status ` +
                `from "Network_Order" ` +
                `cross join lateral json_array_elements((details::json)->'conversion_items') as item ` +
                `where "networkId" = 'partnerize' ` +
                `union ` +
                `select o.advertiser, item->>'conversion_item_id' as item_id, ` +
                `cast(item->>'last_update' as timestamptz) as event_date, item->>'item_status' as status ` +
                `from "Network_Order_Snapshot" s ` +
                `join "Network_Order" o on o."orderId" = s."orderId" ` +
                `cross join lateral json_array_elements((s.details::json)->'conversion_items') as item ` +
                `where s."networkId" = 'partnerize' ` +
                `), return_durations as ( ` +
                `select distinct item_id, advertiser, extract(day from ( ` +
                `(select min(sub.event_date) from events sub where sub.item_id = e.item_id and sub.status = 'rejected') - ` +
                `(select min(sub.event_date) from events sub where sub.item_id = e.item_id and (sub.status = 'pending' or sub.status = 'approved')) ` +
                `)) as return_duration from events e ` +
                `) select advertiser, avg(return_duration)::int as avg_duration, max(return_duration)::int as max_duration ` +
                `from return_durations where return_duration is not null group by advertiser`,
        ).withParams({});
        expect(q.toString()).toContain(`group by advertiser`);
        expect([...q.getParams()]).toEqual([]);
    });
});

// ===========================================================================
// type-level row assertions (fluent builders)
// ===========================================================================

type Row_CreditNotes = SelectBuilderResult<typeof qCreditNotes>;
type _Row_CreditNotes = RequireTrue<
    AssertEqual<
        Row_CreditNotes,
        {
            id: string;
            amount: number;
            vat: number;
            currency: string;
            createdAt: string;
        }
    >
>;

type Row_DownloadCreditNote = SelectBuilderResult<typeof qDownloadCreditNote>;
type _Row_DownloadCreditNote = RequireTrue<
    AssertEqual<
        Row_DownloadCreditNote,
        S["schemas"]["public"]["Revolut_PaymentCreditNote"]
    >
>;

type Row_DownloadInvoice = SelectBuilderResult<typeof qDownloadInvoice>;
type _Row_DownloadInvoice = RequireTrue<
    AssertEqual<
        Row_DownloadInvoice,
        S["schemas"]["public"]["Revolut_PaymentInvoice"]
    >
>;

type Row_Invoices = SelectBuilderResult<typeof qInvoices>;
type _Row_Invoices = RequireTrue<
    AssertEqual<
        Row_Invoices,
        {
            id: string;
            amount: number;
            vat: number;
            currency: string;
            createdAt: string;
        }
    >
>;

type Row_StatsLinks = SelectBuilderResult<typeof qStatsLinks>;
type _Row_StatsLinks = RequireTrue<AssertEqual<Row_StatsLinks, { cnt: number }>>;

type Row_StatsConsultations = SelectBuilderResult<typeof qStatsConsultations>;
type _Row_StatsConsultations = RequireTrue<
    AssertEqual<Row_StatsConsultations, { cnt: number }>
>;

type Row_StatsMoodboards = SelectBuilderResult<typeof qStatsMoodboards>;
type _Row_StatsMoodboards = RequireTrue<
    AssertEqual<Row_StatsMoodboards, { cnt: number }>
>;

type Row_StatsLooks = SelectBuilderResult<typeof qStatsLooks>;
type _Row_StatsLooks = RequireTrue<AssertEqual<Row_StatsLooks, { cnt: number }>>;

type Row_PaymentsSummary = SelectBuilderResult<typeof qPaymentsSummary>;
type _Row_PaymentsSummary = RequireTrue<
    AssertEqual<
        Row_PaymentsSummary,
        {
            paymentIds: string[];
            total: number;
            amount: number;
            vat: number;
            currency: string;
        }
    >
>;

export type CommerceReportingV2MyBuilderTestsPass = true;
