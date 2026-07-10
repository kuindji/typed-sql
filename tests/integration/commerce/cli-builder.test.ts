/**
 * Commerce cli — builder runtime mirrors. Setup-only; failures => engine fix-list.
 *
 * SELECT queries are mirrored with createSelectQuery. DML (UPDATE) and
 * builder-inexpressible SELECTs (SELECT DISTINCT — no fluent `.distinct()`;
 * jsonb-path filters; count(*)-only projections that the builder models the same
 * as the typed-raw path) use the typed-raw createSql path, tagged
 * `TODO(builder-api)`.
 *
 * SKIPPED here (covered in cli-plain.test.ts; DML / pure introspection):
 *   - migrations/backfill-click-domains.ts UPDATE          (createSql below)
 *   - maintenance/orders/recalc.ts UPDATE rate             (createSql below)
 *   - maintenance/orders/recalc-invoices.ts UPDATE         (createSql below)
 *   - db/pg-to-ts/schemaPostgres.ts                        (pg_catalog introspection)
 *   - maintenance/refunds/cj.ts                            (GraphQL builder, no SQL)
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
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = ReportingV2Schema;
type C = ReportingV2CatalogueSchema;

const mainSql = createSql<S>();
const catSql = createSql<C>();

// ===========================================================================
// SELECT mirrors (createSelectQuery)
// ===========================================================================

// --- mirror of migrations/backfill-click-domains.ts:100-110  getClicksPage() ---
// materialized from dynamic source: PAGE_SIZE/offset are JS literals (500/0).
const qBackfillClicksPage = createSelectQuery<S>()
    .from(`"LogProductClick"`)
    .select([`id`, `"usedUrl"`])
    .where(`"targetDomain" IS NULL`)
    .where(`"usedUrl" IS NOT NULL`)
    .orderBy(`id`)
    .limit(500)
    .offset(0);

// --- mirror of maintenance/refunds/rakuten.ts:26-28  items ---
const qRakutenItems = createSelectQuery<S>()
    .from(`"Network_Order_Rakuten_Item"`)
    .select(`*`);

// --- mirror of maintenance/refunds/rakuten.ts:29-35  snapshots ---
const qRakutenSnapshots = createSelectQuery<S>()
    .from(`"Network_Order_Rakuten_Item_Snapshot"`)
    .select(`*`)
    .orderBy(`"processDate" asc`);

// --- mirror of maintenance/refunds/rakuten.ts:36-41  rakutenPayments ---
const qRakutenPayments = createSelectQuery<S>()
    .from(`"Network_Payment_Rakuten"`)
    .select(`*`)
    .orderBy(`"date" asc`);

// --- mirror of maintenance/refunds/rakuten.ts:42-47  rakutenInvoices ---
const qRakutenInvoices = createSelectQuery<S>()
    .from(`"Network_Payment_Invoice_Rakuten"`)
    .select(`*`)
    .orderBy(`"invoiceDate" asc`);

// --- mirror of maintenance/refunds/rakuten.ts:48-53  rakutenInvoiceItems ---
const qRakutenInvoiceItems = createSelectQuery<S>()
    .from(`"Network_Payment_Invoice_Item_Rakuten"`)
    .select(`*`)
    .orderBy(`"date" asc, "time" asc`);

// --- mirror of maintenance/orders/diagnose-order-accounting.ts:439-458 ---
// materialized from dynamic source: single networkId placeholder for the IN-list.
const qDiagnoseOrders = createSelectQuery<S>()
    .from(`"Network_Order" o`)
    .select([
        `o.*`,
        `lpc."shopperId" as "shopperId"`,
        `lpc."referenceUserId" as "referenceUserId"`,
        `shopper."givenName" as "shopperGivenName"`,
        `shopper."familyName" as "shopperFamilyName"`,
        `shopper."handle" as "shopperHandle"`,
        `shopper."email" as "shopperEmail"`,
        `reference."givenName" as "referenceGivenName"`,
        `reference."familyName" as "referenceFamilyName"`,
        `reference."handle" as "referenceHandle"`,
        `reference."email" as "referenceEmail"`,
    ])
    .join(`left join "LogProductClick" lpc on lpc."sid" = o."clickId"`)
    .join(`left join "User" shopper on shopper."id" = lpc."shopperId"`)
    .join(`left join "User" reference on reference."id" = lpc."referenceUserId"`)
    .where(`o."networkId" in (:networkId)`)
    .withParams({ networkId: "rakuten" })
    .orderBy(`o."id" desc`);

// --- mirror of diagnose-order-accounting.ts:574  getOrderItems() CJ ---
const qDiagnoseCjItems = createSelectQuery<S>()
    .from(`"Network_Order_CJ_Item"`)
    .select(`*`)
    .where(`"orderId" = :orderId`)
    .withParams({ orderId: "o1" });

// --- mirror of diagnose-order-accounting.ts:588  getOrderItems() Partnerize ---
const qDiagnosePartnerizeItems = createSelectQuery<S>()
    .from(`"Network_Order_Partnerize_Item"`)
    .select(`*`)
    .where(`"orderId" = :orderId`)
    .withParams({ orderId: "o1" });

// --- mirror of diagnose-order-accounting.ts:600  getOrderItems() Rakuten ---
const qDiagnoseRakutenItems = createSelectQuery<S>()
    .from(`"Network_Order_Rakuten_Item"`)
    .select(`*`)
    .where(`"orderId" = :orderId`)
    .withParams({ orderId: "o1" });

// --- mirror of maintenance/orders/recalc.ts:853-858  fetchOrdersByRawOrderId() ---
// materialized from dynamic source: single rawOrderId placeholder for the IN-list.
const qRecalcByRawOrderId = createSelectQuery<S>()
    .from(`"Network_Order" o`)
    .select(`o."id"`)
    .where(`o."rawOrderId" in (:rawOrderId)`)
    .withParams({ rawOrderId: "raw1" })
    .orderBy(`o."orderDate" desc`);

// --- mirror of maintenance/orders/recalc.ts:958-959  getOrderById() ---
const qRecalcOrderById = createSelectQuery<S>()
    .from(`"Network_Order"`)
    .select(`*`)
    .where(`"id" = :id`)
    .withParams({ id: "n1" })
    .limit(1);

// --- mirror of maintenance/orders/recalc.ts:1031  getOrderItemsByNetwork() ---
// materialized from dynamic source: ${table} resolved to Rakuten item table.
const qRecalcOrderItems = createSelectQuery<S>()
    .from(`"Network_Order_Rakuten_Item"`)
    .select(`*`)
    .where(`"orderId" = :orderId`)
    .withParams({ orderId: "o1" });

// --- mirror of maintenance/orders/recalc.ts:1231-1238  getCommissionRateWarnings() ---
const qRecalcClickShopper = createSelectQuery<S>()
    .from(`"LogProductClick"`)
    .select(`"shopperId"`)
    .where(`"sid" = :sid`)
    .where(`("shopperId" is not null or "referenceUserId" is not null)`)
    .withParams({ sid: "s1" });

// --- mirror of maintenance/orders/recalc.ts:1633-1638  region check ---
const qRecalcCommissionRegion = createSelectQuery<S>()
    .from(`"Retailer_Commission"`)
    .select(`"pseCommission"`)
    .where(`"advertiserName" = :adv`)
    .where(`"region" = :region`)
    .withParams({ adv: "Nike", region: "GB" });

// --- mirror of maintenance/orders/recalc.ts:1646-1653  current ---
const qRecalcCommissionCurrent = createSelectQuery<S>()
    .from(`"Retailer_Commission"`)
    .select(`"pseCommission"`)
    .where(`"advertiserName" = :adv`)
    .where(`"region" = :region`)
    .where(`"updatedAt" < :date`)
    .withParams({ adv: "Nike", region: "GB", date: "2025-01-01" });

// --- mirror of maintenance/orders/recalc.ts:1661-1671  history ---
const qRecalcCommissionHistory = createSelectQuery<S>()
    .from(`"Retailer_Commission_History"`)
    .select(`"pseCommission"`)
    .where(`"advertiserName" = :adv`)
    .where(`"region" = :region`)
    .where(`"startedAt" <= :date`)
    .where(`"endedAt" >= :date`)
    .withParams({ adv: "Nike", region: "GB", date: "2025-01-01" })
    .orderBy(`"endedAt" desc`)
    .limit(1);

// --- mirror of maintenance/orders/recalc.ts:1704-1710  click with date ---
const qRecalcClickWithDate = createSelectQuery<S>()
    .from(`"LogProductClick"`)
    .select([`"shopperId"`, `"createdAt"`])
    .where(`"sid" = :sid`)
    .where(`("shopperId" is not null or "referenceUserId" is not null)`)
    .withParams({ sid: "s1" });

// --- mirror of maintenance/orders/recalc-invoices.ts:31-37  invoice ---
const qRecalcInvInvoice = createSelectQuery<S>()
    .from(`"Revolut_PaymentInvoice"`)
    .select(`*`)
    .where(`"paymentId" = :paymentId`)
    .withParams({ paymentId: "p1" });

// --- mirror of maintenance/orders/preview-invoice.ts:38-41  draft ---
const qPreviewDraft = createSelectQuery<S>()
    .from(`"Revolut_PaymentDraft"`)
    .select(`*`)
    .where(`"id" = :id`)
    .withParams({ id: "d1" });

// --- mirror of maintenance/orders/backfill-rakuten-na-settlements.ts:27-46 ---
const qNaSettlements = createSelectQuery<S>()
    .from(`"Network_Payment_Invoice_Rakuten" nir`)
    .select([
        `nir."invoiceId"`,
        `nir."advertiserId"`,
        `npr."currency"`,
        `nir."invoiceDate"`,
        `npr."date" as "settlementDate"`,
        `nir."previouslyHeldCommissions"`,
    ])
    .join(
        `join "Network_Payment_Rakuten" npr on npr."paymentId" = nir."paymentId"`,
    )
    .where(`npr."paymentStatus" != 'N/A'`)
    .where(`nir."previouslyHeldCommissions" < 0`)
    .orderBy(
        `nir."advertiserId" asc, npr."currency" asc, nir."invoiceDate" asc nulls last, nir."invoiceId" asc`,
    );

// --- mirror of maintenance/feeds/stale-feeds-report.ts:51-64  getStaleFeeds() ---
// FIXTURE-GAP: catalogue.file.{source,source_path,variant,last_downloaded_at,
//   last_checked_at,last_modified_at,s3_filename,download_failed,
//   last_download_error,size_downloaded} not in fixture.
const qStaleFeeds = createSelectQuery<C>()
    .from(`file`)
    .select([
        `id`,
        `source`,
        `source_path`,
        `region`,
        `variant`,
        `last_downloaded_at`,
        `last_checked_at`,
        `last_modified_at`,
        `s3_filename`,
        `download_enabled`,
        `download_failed`,
        `last_download_error`,
        `size_downloaded`,
    ])
    .where(`(last_downloaded_at IS NULL OR last_downloaded_at < :since)`)
    .where(`source_path != '__unknown__'`)
    .where(`variant != 'none'`)
    .withParams({ since: "2025-01-01" })
    .orderBy(`source, last_downloaded_at NULLS FIRST`);

// --- mirror of maintenance/feeds/check-remote-sources.ts:50-62  getStaleFeeds() ---
// FIXTURE-GAP: catalogue.file.{source,source_path,variant,last_downloaded_at,
//   last_modified_at,download_failed,last_download_error} not in fixture.
const qRemoteStaleFeeds = createSelectQuery<C>()
    .from(`file`)
    .select([
        `id`,
        `source`,
        `source_path`,
        `region`,
        `variant`,
        `last_downloaded_at`,
        `last_modified_at`,
        `download_enabled`,
        `download_failed`,
        `last_download_error`,
    ])
    .where(`(last_downloaded_at IS NULL OR last_downloaded_at < :since)`)
    .where(`source_path != '__unknown__'`)
    .where(`variant != 'none'`)
    .withParams({ since: "2025-01-01" })
    .orderBy(`source, last_downloaded_at NULLS FIRST`);

// --- mirror of migrations/s3-vector/s3-vectors-migrate.ts:159-176  fetchVectorBatch() ---
// materialized from dynamic source: partition suffix resolved to "gb".
// FIXTURE-GAP: catalogue.product_image_search_<partition> table absent;
//   product_search.{partition_key,min_price_usd} + color_id/embedding not in fixture.
const qVectorBatch = createSelectQuery<C>()
    .from(`product_image_search_gb pis`)
    .select([
        `pis.product_id`,
        `pis.partition_key`,
        `pis.color_id`,
        `pis.embedding`,
        `ps.tags`,
        `ps.min_price_usd`,
        `ps.new_in_at`,
    ])
    .join(
        `left join product_search_gb ps on pis.product_id = ps.product_id and pis.partition_key = ps.partition_key`,
    )
    .where(`pis.embedding IS NOT NULL`)
    .orderBy(`pis.product_id`)
    .offset(0)
    .limit(100);

describe("commerce cli builder duplicates", () => {
    it("qBackfillClicksPage assembles", () => {
        expect(normalizeWhitespace(qBackfillClicksPage.toString())).toBe(
            normalizeWhitespace(
                `SELECT id, "usedUrl" FROM "LogProductClick" ` +
                    `WHERE "targetDomain" IS NULL AND "usedUrl" IS NOT NULL ` +
                    `ORDER BY id LIMIT 500 OFFSET 0`,
            ),
        );
    });

    it("qRakutenItems assembles", () => {
        expect(normalizeWhitespace(qRakutenItems.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "Network_Order_Rakuten_Item"`),
        );
    });

    it("qRakutenSnapshots assembles", () => {
        expect(normalizeWhitespace(qRakutenSnapshots.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Order_Rakuten_Item_Snapshot" ORDER BY "processDate" asc`,
            ),
        );
    });

    it("qRakutenPayments assembles", () => {
        expect(normalizeWhitespace(qRakutenPayments.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Payment_Rakuten" ORDER BY "date" asc`,
            ),
        );
    });

    it("qRakutenInvoices assembles", () => {
        expect(normalizeWhitespace(qRakutenInvoices.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Payment_Invoice_Rakuten" ORDER BY "invoiceDate" asc`,
            ),
        );
    });

    it("qRakutenInvoiceItems assembles", () => {
        expect(normalizeWhitespace(qRakutenInvoiceItems.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Payment_Invoice_Item_Rakuten" ORDER BY "date" asc, "time" asc`,
            ),
        );
    });

    it("qDiagnoseOrders assembles", () => {
        expect(normalizeWhitespace(qDiagnoseOrders.toString())).toBe(
            normalizeWhitespace(
                `SELECT o.*, lpc."shopperId" as "shopperId", ` +
                    `lpc."referenceUserId" as "referenceUserId", ` +
                    `shopper."givenName" as "shopperGivenName", ` +
                    `shopper."familyName" as "shopperFamilyName", ` +
                    `shopper."handle" as "shopperHandle", ` +
                    `shopper."email" as "shopperEmail", ` +
                    `reference."givenName" as "referenceGivenName", ` +
                    `reference."familyName" as "referenceFamilyName", ` +
                    `reference."handle" as "referenceHandle", ` +
                    `reference."email" as "referenceEmail" ` +
                    `FROM "Network_Order" o ` +
                    `left join "LogProductClick" lpc on lpc."sid" = o."clickId" ` +
                    `left join "User" shopper on shopper."id" = lpc."shopperId" ` +
                    `left join "User" reference on reference."id" = lpc."referenceUserId" ` +
                    `WHERE o."networkId" in ($1) ORDER BY o."id" desc`,
            ),
        );
    });

    it("qDiagnoseCjItems assembles", () => {
        expect(normalizeWhitespace(qDiagnoseCjItems.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Order_CJ_Item" WHERE "orderId" = $1`,
            ),
        );
    });

    it("qDiagnosePartnerizeItems assembles", () => {
        expect(normalizeWhitespace(qDiagnosePartnerizeItems.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Order_Partnerize_Item" WHERE "orderId" = $1`,
            ),
        );
    });

    it("qDiagnoseRakutenItems assembles", () => {
        expect(normalizeWhitespace(qDiagnoseRakutenItems.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Order_Rakuten_Item" WHERE "orderId" = $1`,
            ),
        );
    });

    it("qRecalcByRawOrderId assembles", () => {
        expect(normalizeWhitespace(qRecalcByRawOrderId.toString())).toBe(
            normalizeWhitespace(
                `SELECT o."id" FROM "Network_Order" o ` +
                    `WHERE o."rawOrderId" in ($1) ORDER BY o."orderDate" desc`,
            ),
        );
    });

    it("qRecalcOrderById assembles", () => {
        expect(normalizeWhitespace(qRecalcOrderById.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Order" WHERE "id" = $1 LIMIT 1`,
            ),
        );
    });

    it("qRecalcOrderItems assembles", () => {
        expect(normalizeWhitespace(qRecalcOrderItems.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Network_Order_Rakuten_Item" WHERE "orderId" = $1`,
            ),
        );
    });

    it("qRecalcClickShopper assembles", () => {
        expect(normalizeWhitespace(qRecalcClickShopper.toString())).toBe(
            normalizeWhitespace(
                `SELECT "shopperId" FROM "LogProductClick" ` +
                    `WHERE "sid" = $1 AND ("shopperId" is not null or "referenceUserId" is not null)`,
            ),
        );
    });

    it("qRecalcCommissionRegion assembles", () => {
        expect(normalizeWhitespace(qRecalcCommissionRegion.toString())).toBe(
            normalizeWhitespace(
                `SELECT "pseCommission" FROM "Retailer_Commission" ` +
                    `WHERE "advertiserName" = $1 AND "region" = $2`,
            ),
        );
    });

    it("qRecalcCommissionCurrent assembles", () => {
        expect(normalizeWhitespace(qRecalcCommissionCurrent.toString())).toBe(
            normalizeWhitespace(
                `SELECT "pseCommission" FROM "Retailer_Commission" ` +
                    `WHERE "advertiserName" = $1 AND "region" = $2 AND "updatedAt" < $3`,
            ),
        );
    });

    it("qRecalcCommissionHistory assembles", () => {
        expect(normalizeWhitespace(qRecalcCommissionHistory.toString())).toBe(
            normalizeWhitespace(
                `SELECT "pseCommission" FROM "Retailer_Commission_History" ` +
                    `WHERE "advertiserName" = $1 AND "region" = $2 ` +
                    `AND "startedAt" <= $3 AND "endedAt" >= $3 ` +
                    `ORDER BY "endedAt" desc LIMIT 1`,
            ),
        );
    });

    it("qRecalcClickWithDate assembles", () => {
        expect(normalizeWhitespace(qRecalcClickWithDate.toString())).toBe(
            normalizeWhitespace(
                `SELECT "shopperId", "createdAt" FROM "LogProductClick" ` +
                    `WHERE "sid" = $1 AND ("shopperId" is not null or "referenceUserId" is not null)`,
            ),
        );
    });

    it("qRecalcInvInvoice assembles", () => {
        expect(normalizeWhitespace(qRecalcInvInvoice.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentInvoice" WHERE "paymentId" = $1`,
            ),
        );
    });

    it("qPreviewDraft assembles", () => {
        expect(normalizeWhitespace(qPreviewDraft.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentDraft" WHERE "id" = $1`,
            ),
        );
    });

    it("qNaSettlements assembles", () => {
        expect(normalizeWhitespace(qNaSettlements.toString())).toBe(
            normalizeWhitespace(
                `SELECT nir."invoiceId", nir."advertiserId", npr."currency", ` +
                    `nir."invoiceDate", npr."date" as "settlementDate", ` +
                    `nir."previouslyHeldCommissions" ` +
                    `FROM "Network_Payment_Invoice_Rakuten" nir ` +
                    `join "Network_Payment_Rakuten" npr on npr."paymentId" = nir."paymentId" ` +
                    `WHERE npr."paymentStatus" != 'N/A' AND nir."previouslyHeldCommissions" < 0 ` +
                    `ORDER BY nir."advertiserId" asc, npr."currency" asc, ` +
                    `nir."invoiceDate" asc nulls last, nir."invoiceId" asc`,
            ),
        );
    });

    it("qStaleFeeds assembles", () => {
        expect(normalizeWhitespace(qStaleFeeds.toString())).toBe(
            normalizeWhitespace(
                `SELECT id, source, source_path, region, variant, ` +
                    `last_downloaded_at, last_checked_at, last_modified_at, ` +
                    `s3_filename, download_enabled, download_failed, ` +
                    `last_download_error, size_downloaded FROM file ` +
                    `WHERE (last_downloaded_at IS NULL OR last_downloaded_at < $1) ` +
                    `AND source_path != '__unknown__' AND variant != 'none' ` +
                    `ORDER BY source, last_downloaded_at NULLS FIRST`,
            ),
        );
    });

    it("qRemoteStaleFeeds assembles", () => {
        expect(normalizeWhitespace(qRemoteStaleFeeds.toString())).toBe(
            normalizeWhitespace(
                `SELECT id, source, source_path, region, variant, ` +
                    `last_downloaded_at, last_modified_at, ` +
                    `download_enabled, download_failed, last_download_error FROM file ` +
                    `WHERE (last_downloaded_at IS NULL OR last_downloaded_at < $1) ` +
                    `AND source_path != '__unknown__' AND variant != 'none' ` +
                    `ORDER BY source, last_downloaded_at NULLS FIRST`,
            ),
        );
    });

    it("qVectorBatch assembles", () => {
        expect(normalizeWhitespace(qVectorBatch.toString())).toBe(
            normalizeWhitespace(
                `SELECT pis.product_id, pis.partition_key, pis.color_id, ` +
                    `pis.embedding, ps.tags, ps.min_price_usd, ps.new_in_at ` +
                    `FROM product_image_search_gb pis ` +
                    `left join product_search_gb ps on pis.product_id = ps.product_id ` +
                    `and pis.partition_key = ps.partition_key ` +
                    `WHERE pis.embedding IS NOT NULL ORDER BY pis.product_id LIMIT 100 OFFSET 0`,
            ),
        );
    });

    // =======================================================================
    // createSql fallbacks — SELECT DISTINCT, DML, jsonb-path filters
    // =======================================================================

    // TODO(builder-api): SELECT DISTINCT — fluent builder has no `.distinct()`.
    // mirror of maintenance/orders/recalc-invoices.ts:17-24  drafts
    it("recalc-invoices drafts (distinct) via createSql", () => {
        const q = mainSql(
            `select distinct "revolutDraftId" from "User_ApprovedPayment" ` +
                `where "revolutDraftId" is not null and "userId" is not null`,
        ).withParams({});
        expect(q.toString()).toBe(
            `select distinct "revolutDraftId" from "User_ApprovedPayment" ` +
                `where "revolutDraftId" is not null and "userId" is not null`,
        );
        expect([...q.getParams()]).toEqual([]);
    });

    // TODO(builder-api): SELECT DISTINCT + jsonb date filter.
    // mirror of maintenance/orders/preview-all-invoices.ts:32-40  drafts
    it("preview-all drafts (distinct join) via createSql", () => {
        const q = mainSql(
            `select distinct rpd.* from "Revolut_PaymentDraft" rpd ` +
                `join "User_ApprovedPayment" uap on uap."revolutDraftId" = rpd."id" ` +
                `where rpd."createdAt" >= '2025-07-01' order by rpd."createdAt" desc`,
        ).withParams({});
        expect(q.toString()).toBe(
            `select distinct rpd.* from "Revolut_PaymentDraft" rpd ` +
                `join "User_ApprovedPayment" uap on uap."revolutDraftId" = rpd."id" ` +
                `where rpd."createdAt" >= '2025-07-01' order by rpd."createdAt" desc`,
        );
    });

    // TODO(builder-api): jsonb-path WHERE filter (->'data'->>'state').
    // FIXTURE-GAP: Revolut_PaymentDraft_History.revolutDraftId.
    // mirror of maintenance/orders/preview-all-invoices.ts:63-74  historyRows
    it("preview-all history (jsonb filter) via createSql", () => {
        const q = mainSql(
            `select "createdAt" from "Revolut_PaymentDraft_History" ` +
                `where "revolutDraftId" = :id and ( ` +
                `lower("data"::jsonb->'data'->>'new_state') = 'completed' ` +
                `or lower("data"::jsonb->'data'->>'state') = 'completed' ) ` +
                `order by "createdAt" desc limit 1`,
        ).withParams({ id: "d1" });
        expect(q.toString()).toBe(
            `select "createdAt" from "Revolut_PaymentDraft_History" ` +
                `where "revolutDraftId" = $1 and ( ` +
                `lower("data"::jsonb->'data'->>'new_state') = 'completed' ` +
                `or lower("data"::jsonb->'data'->>'state') = 'completed' ) ` +
                `order by "createdAt" desc limit 1`,
        );
        expect([...q.getParams()]).toEqual(["d1"]);
    });

    // TODO(builder-api): SELECT COUNT(*)-only — builder models it the same as raw.
    // mirror of migrations/backfill-click-domains.ts:121-127  getTotalCount
    it("backfill click count via createSql", () => {
        const q = mainSql(
            `SELECT COUNT(*) as count FROM "LogProductClick" ` +
                `WHERE "targetDomain" IS NULL AND "usedUrl" IS NOT NULL`,
        ).withParams({});
        expect(q.toString()).toBe(
            `SELECT COUNT(*) as count FROM "LogProductClick" ` +
                `WHERE "targetDomain" IS NULL AND "usedUrl" IS NOT NULL`,
        );
    });

    // TODO(builder-api): catalogue count(*) via createSql.
    // mirror of migrations/s3-vector/s3-vectors-migrate.ts:203-207  countVectors
    it("vector count via createSql", () => {
        const q = catSql(
            `SELECT COUNT(*) as count FROM product_image_search_gb ` +
                `WHERE embedding IS NOT NULL`,
        ).withParams({});
        expect(q.toString()).toBe(
            `SELECT COUNT(*) as count FROM product_image_search_gb ` +
                `WHERE embedding IS NOT NULL`,
        );
    });

    // TODO(builder-api): cognito join+count via createSql.
    // mirror of migrations/cognito-custom-attr/backfill-cognito-attrs.ts:84-88
    it("cognito user count via createSql", () => {
        const q = mainSql(
            `SELECT COUNT(*) as count FROM "User_Cognito" uc ` +
                `JOIN "User" u ON u.id = uc."userId"`,
        ).withParams({});
        expect(q.toString()).toBe(
            `SELECT COUNT(*) as count FROM "User_Cognito" uc ` +
                `JOIN "User" u ON u.id = uc."userId"`,
        );
    });

    // TODO(builder-api): cognito join page via createSql (no fluent multi-join+limit dynamic).
    // mirror of migrations/cognito-custom-attr/backfill-cognito-attrs.ts:61-72
    it("cognito users page via createSql", () => {
        const q = mainSql(
            `SELECT uc."cognitoId", uc."userId", u."firstLoggedIn" ` +
                `FROM "User_Cognito" uc JOIN "User" u ON u.id = uc."userId" ` +
                `ORDER BY uc."cognitoId" LIMIT 500 OFFSET 0`,
        ).withParams({});
        expect(q.toString()).toBe(
            `SELECT uc."cognitoId", uc."userId", u."firstLoggedIn" ` +
                `FROM "User_Cognito" uc JOIN "User" u ON u.id = uc."userId" ` +
                `ORDER BY uc."cognitoId" LIMIT 500 OFFSET 0`,
        );
    });

    // TODO(builder-api): UPDATE — DML not modeled by createSelectQuery.
    // mirror of migrations/backfill-click-domains.ts:159-163  updateBatch
    it("backfill click update (UPDATE/CASE) via createSql", () => {
        const q = mainSql(
            `UPDATE "LogProductClick" ` +
                `SET "targetDomain" = CASE WHEN id = 'a' THEN 'example.com' END ` +
                `WHERE id IN ('a')`,
        ).withParams({});
        expect(q.toString()).toBe(
            `UPDATE "LogProductClick" ` +
                `SET "targetDomain" = CASE WHEN id = 'a' THEN 'example.com' END ` +
                `WHERE id IN ('a')`,
        );
    });

    // TODO(builder-api): UPDATE — DML not modeled by createSelectQuery.
    // mirror of maintenance/orders/recalc.ts:1740-1746  runCommissionRateRecalc update
    it("recalc commission-rate update via createSql", () => {
        const q = mainSql(
            `update "Network_Order" ` +
                `set "pseCommissionRate" = :rate, "pseCommissionRateClick" = :clickRate ` +
                `where "id" = :id`,
        ).withParams({ rate: "0.8", clickRate: "0.8", id: "n1" });
        expect(q.toString()).toBe(
            `update "Network_Order" ` +
                `set "pseCommissionRate" = $1, "pseCommissionRateClick" = $2 ` +
                `where "id" = $3`,
        );
        expect([...q.getParams()]).toEqual(["0.8", "0.8", "n1"]);
    });

    // TODO(builder-api): UPDATE — DML not modeled by createSelectQuery.
    // mirror of maintenance/orders/recalc-invoices.ts:62-68  update data
    it("recalc-invoices update via createSql", () => {
        const q = mainSql(
            `update "Revolut_PaymentInvoice" set "data" = :data where "paymentId" = :paymentId`,
        ).withParams({ data: "{}", paymentId: "p1" });
        expect(q.toString()).toBe(
            `update "Revolut_PaymentInvoice" set "data" = $1 where "paymentId" = $2`,
        );
        expect([...q.getParams()]).toEqual(["{}", "p1"]);
    });
});

// ===========================================================================
// type-level row assertions (SELECT builders)
// ===========================================================================

type _Row_BackfillClicksPage = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qBackfillClicksPage>,
        { id: string; usedUrl: string | null }
    >
>;

type _Row_RakutenItems = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRakutenItems>,
        S["schemas"]["public"]["Network_Order_Rakuten_Item"]
    >
>;

type _Row_RakutenSnapshots = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRakutenSnapshots>,
        S["schemas"]["public"]["Network_Order_Rakuten_Item_Snapshot"]
    >
>;

type _Row_RakutenPayments = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRakutenPayments>,
        S["schemas"]["public"]["Network_Payment_Rakuten"]
    >
>;

type _Row_RakutenInvoices = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRakutenInvoices>,
        S["schemas"]["public"]["Network_Payment_Invoice_Rakuten"]
    >
>;

type _Row_RakutenInvoiceItems = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRakutenInvoiceItems>,
        S["schemas"]["public"]["Network_Payment_Invoice_Item_Rakuten"]
    >
>;

type _Row_DiagnoseCjItems = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qDiagnoseCjItems>,
        S["schemas"]["public"]["Network_Order_CJ_Item"]
    >
>;

type _Row_DiagnosePartnerizeItems = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qDiagnosePartnerizeItems>,
        S["schemas"]["public"]["Network_Order_Partnerize_Item"]
    >
>;

type _Row_DiagnoseRakutenItems = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qDiagnoseRakutenItems>,
        S["schemas"]["public"]["Network_Order_Rakuten_Item"]
    >
>;

type _Row_RecalcByRawOrderId = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcByRawOrderId>,
        { id: string }
    >
>;

type _Row_RecalcOrderById = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcOrderById>,
        S["schemas"]["public"]["Network_Order"]
    >
>;

type _Row_RecalcOrderItems = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcOrderItems>,
        S["schemas"]["public"]["Network_Order_Rakuten_Item"]
    >
>;

type _Row_RecalcClickShopper = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcClickShopper>,
        { shopperId: string | null }
    >
>;

type _Row_RecalcCommissionRegion = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcCommissionRegion>,
        { pseCommission: number }
    >
>;

type _Row_RecalcCommissionCurrent = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcCommissionCurrent>,
        { pseCommission: number }
    >
>;

type _Row_RecalcCommissionHistory = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcCommissionHistory>,
        { pseCommission: number }
    >
>;

type _Row_RecalcClickWithDate = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcClickWithDate>,
        { shopperId: string | null; createdAt: string }
    >
>;

type _Row_RecalcInvInvoice = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qRecalcInvInvoice>,
        S["schemas"]["public"]["Revolut_PaymentInvoice"]
    >
>;

type _Row_PreviewDraft = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qPreviewDraft>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type _Row_NaSettlements = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qNaSettlements>,
        {
            invoiceId: string;
            advertiserId: number;
            currency: string;
            invoiceDate: string | null;
            settlementDate: string;
            previouslyHeldCommissions: number;
        }
    >
>;

export type CommerceCliBuilderTestsPass = true;
