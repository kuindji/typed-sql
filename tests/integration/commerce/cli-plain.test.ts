/**
 * Commerce cli — plain type-level mirrors. COLLECTION pass; reds => engine fix-list.
 *
 * Every raw SQL query found in the commerce `cli/` area (migrations, maintenance
 * orders/feeds/refunds) is mirrored here. Assertions encode the INTENDED row type;
 * failures => engine fix-list.
 *
 * SKIPPED (pure pg_catalog / information_schema introspection, no app tables):
 *   - db/pg-to-ts/schemaPostgres.ts  (enum/column/table/comment/foreign-key probes)
 *
 * SKIPPED (no raw SQL — GraphQL `g.*` builder only):
 *   - maintenance/refunds/cj.ts
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";

type S = ReportingV2Schema;
type C = ReportingV2CatalogueSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;

// ===========================================================================
// migrations/backfill-click-domains.ts  (db.main.select / db.main.run)
// ===========================================================================

// --- backfill-click-domains.ts:100-110  getClicksPage() (db.main.select) ---
// materialized from dynamic source: PAGE_SIZE/offset are JS-interpolated literals.
type Q_BackfillClicksPage = `
        SELECT id, "usedUrl"
        FROM "LogProductClick"
        WHERE "targetDomain" IS NULL
          AND "usedUrl" IS NOT NULL
        ORDER BY id
        LIMIT 500
        OFFSET 0
    `;
type _V_BackfillClicksPage = Expect<
    Equal<ValidateSQL<Q_BackfillClicksPage, S>, true>
>;
type _R_BackfillClicksPage = Expect<
    Equal<
        GetReturnType<Q_BackfillClicksPage, S>,
        { id: string; usedUrl: string | null }
    >
>;

// --- backfill-click-domains.ts:121-127  getTotalCount() (db.main.select) ---
type Q_BackfillClicksCount = `
        SELECT COUNT(*) as count
        FROM "LogProductClick"
        WHERE "targetDomain" IS NULL
          AND "usedUrl" IS NOT NULL
    `;
type _V_BackfillClicksCount = Expect<
    Equal<ValidateSQL<Q_BackfillClicksCount, S>, true>
>;
type _R_BackfillClicksCount = Expect<
    Equal<GetReturnType<Q_BackfillClicksCount, S>, { count: number }>
>;

// --- backfill-click-domains.ts:159-163  updateBatch() (db.main.run, DML) ---
// materialized from dynamic source: CASE/WHEN branches + IN-list built from JS.
type Q_BackfillClicksUpdate = `
        UPDATE "LogProductClick"
        SET "targetDomain" = CASE WHEN id = 'a' THEN 'example.com' END
        WHERE id IN ('a')
    `;
type _V_BackfillClicksUpdate = Expect<
    Equal<ValidateSQL<Q_BackfillClicksUpdate, S>, true>
>;

// ===========================================================================
// migrations/cognito-custom-attr/backfill-cognito-attrs.ts  (db.main.select)
// ===========================================================================

// --- backfill-cognito-attrs.ts:61-72  getUsersPage() (db.main.select) ---
// FIXTURE-GAP: User_Cognito (table absent from all fixtures)
// materialized from dynamic source: PAGE_SIZE/offset are JS-interpolated literals.
type Q_CognitoUsersPage = `
        SELECT
            uc."cognitoId",
            uc."userId",
            u."firstLoggedIn"
        FROM "User_Cognito" uc
        JOIN "User" u ON u.id = uc."userId"
        ORDER BY uc."cognitoId"
        LIMIT 500
        OFFSET 0
    `;
type _V_CognitoUsersPage = Expect<
    Equal<ValidateSQL<Q_CognitoUsersPage, S>, true>
>;
type _R_CognitoUsersPage = Expect<
    Equal<
        GetReturnType<Q_CognitoUsersPage, S>,
        { cognitoId: unknown; userId: unknown; firstLoggedIn: string | null }
    >
>;

// --- backfill-cognito-attrs.ts:84-88  getTotalUserCount() (db.main.select) ---
// FIXTURE-GAP: User_Cognito (table absent from all fixtures)
type Q_CognitoUserCount = `
        SELECT COUNT(*) as count
        FROM "User_Cognito" uc
        JOIN "User" u ON u.id = uc."userId"
    `;
type _V_CognitoUserCount = Expect<
    Equal<ValidateSQL<Q_CognitoUserCount, S>, true>
>;
type _R_CognitoUserCount = Expect<
    Equal<GetReturnType<Q_CognitoUserCount, S>, { count: number }>
>;

// ===========================================================================
// maintenance/refunds/rakuten.ts  (db.main.typedSelect)
// ===========================================================================

// --- rakuten.ts:26-28  items (db.main.typedSelect) ---
type Q_RakutenItems = `select * from "Network_Order_Rakuten_Item"`;
type _V_RakutenItems = Expect<Equal<ValidateSQL<Q_RakutenItems, S>, true>>;
type _R_RakutenItems = Expect<
    Equal<
        GetReturnType<Q_RakutenItems, S>,
        S["schemas"]["public"]["Network_Order_Rakuten_Item"]
    >
>;

// --- rakuten.ts:29-35  snapshots (db.main.typedSelect) ---
type Q_RakutenSnapshots = `
            select *
            from "Network_Order_Rakuten_Item_Snapshot"
            order by "processDate" asc
        `;
type _V_RakutenSnapshots = Expect<
    Equal<ValidateSQL<Q_RakutenSnapshots, S>, true>
>;
type _R_RakutenSnapshots = Expect<
    Equal<
        GetReturnType<Q_RakutenSnapshots, S>,
        S["schemas"]["public"]["Network_Order_Rakuten_Item_Snapshot"]
    >
>;

// --- rakuten.ts:36-41  rakutenPayments (db.main.typedSelect) ---
type Q_RakutenPayments = `
            select * from "Network_Payment_Rakuten"
            order by "date" asc
        `;
type _V_RakutenPayments = Expect<Equal<ValidateSQL<Q_RakutenPayments, S>, true>>;
type _R_RakutenPayments = Expect<
    Equal<
        GetReturnType<Q_RakutenPayments, S>,
        S["schemas"]["public"]["Network_Payment_Rakuten"]
    >
>;

// --- rakuten.ts:42-47  rakutenInvoices (db.main.typedSelect) ---
type Q_RakutenInvoices = `
            select * from "Network_Payment_Invoice_Rakuten"
            order by "invoiceDate" asc
        `;
type _V_RakutenInvoices = Expect<Equal<ValidateSQL<Q_RakutenInvoices, S>, true>>;
type _R_RakutenInvoices = Expect<
    Equal<
        GetReturnType<Q_RakutenInvoices, S>,
        S["schemas"]["public"]["Network_Payment_Invoice_Rakuten"]
    >
>;

// --- rakuten.ts:48-53  rakutenInvoiceItems (db.main.typedSelect) ---
type Q_RakutenInvoiceItems = `
            select * from "Network_Payment_Invoice_Item_Rakuten"
            order by "date" asc, "time" asc
        `;
type _V_RakutenInvoiceItems = Expect<
    Equal<ValidateSQL<Q_RakutenInvoiceItems, S>, true>
>;
type _R_RakutenInvoiceItems = Expect<
    Equal<
        GetReturnType<Q_RakutenInvoiceItems, S>,
        S["schemas"]["public"]["Network_Payment_Invoice_Item_Rakuten"]
    >
>;

// ===========================================================================
// maintenance/feeds/stale-feeds-report.ts  (db.catalogue.select)
// ===========================================================================

// --- stale-feeds-report.ts:51-64  getStaleFeeds() (db.catalogue.select) ---
// FIXTURE-GAP: catalogue.file.{source,source_path,variant,last_downloaded_at,
//   last_checked_at,last_modified_at,s3_filename,download_failed,
//   last_download_error,size_downloaded} not in fixture
type Q_StaleFeeds = `
        SELECT
            id, source, source_path, region, variant,
            last_downloaded_at, last_checked_at, last_modified_at,
            s3_filename, download_enabled, download_failed,
            last_download_error, size_downloaded
        FROM file
        WHERE
            (last_downloaded_at IS NULL OR last_downloaded_at < $1)
            AND source_path != '__unknown__'
            AND variant != 'none'
        ORDER BY source, last_downloaded_at NULLS FIRST
    `;
type _V_StaleFeeds = Expect<Equal<ValidateSQL<Q_StaleFeeds, C>, true>>;

// ===========================================================================
// maintenance/feeds/check-remote-sources.ts  (db.catalogue.select)
// ===========================================================================

// --- check-remote-sources.ts:50-62  getStaleFeeds() (db.catalogue.select) ---
// FIXTURE-GAP: catalogue.file.{source,source_path,variant,last_downloaded_at,
//   last_modified_at,download_failed,last_download_error} not in fixture
type Q_RemoteStaleFeeds = `
        SELECT
            id, source, source_path, region, variant,
            last_downloaded_at, last_modified_at,
            download_enabled, download_failed, last_download_error
        FROM file
        WHERE
            (last_downloaded_at IS NULL OR last_downloaded_at < $1)
            AND source_path != '__unknown__'
            AND variant != 'none'
        ORDER BY source, last_downloaded_at NULLS FIRST
    `;
type _V_RemoteStaleFeeds = Expect<
    Equal<ValidateSQL<Q_RemoteStaleFeeds, C>, true>
>;

// ===========================================================================
// migrations/s3-vector/s3-vectors-migrate.ts  (db.catalogue.select)
// ===========================================================================

// --- s3-vectors-migrate.ts:159-176  fetchVectorBatch() (db.catalogue.select) ---
// FIXTURE-GAP: catalogue.product_image_search_<partition> table absent; catalogue
//   .product_search.{partition_key,min_price_usd} + .color_id/.embedding not in fixture.
// materialized from dynamic source: partition suffix resolved to "gb".
type Q_VectorBatch = `
        SELECT
            pis.product_id,
            pis.partition_key,
            pis.color_id,
            pis.embedding,
            ps.tags,
            ps.min_price_usd,
            ps.new_in_at
        FROM product_image_search_gb pis
        LEFT JOIN product_search_gb ps
            ON pis.product_id = ps.product_id
            AND pis.partition_key = ps.partition_key
        WHERE pis.embedding IS NOT NULL
        ORDER BY pis.product_id
        OFFSET $1
        LIMIT $2
    `;
type _V_VectorBatch = Expect<Equal<ValidateSQL<Q_VectorBatch, C>, true>>;

// --- s3-vectors-migrate.ts:203-207  countVectors() (db.catalogue.select) ---
// FIXTURE-GAP: catalogue.product_image_search_<partition> table absent.
// materialized from dynamic source: partition suffix resolved to "gb".
type Q_VectorCount = `
        SELECT COUNT(*) as count
        FROM product_image_search_gb
        WHERE embedding IS NOT NULL
    `;
type _V_VectorCount = Expect<Equal<ValidateSQL<Q_VectorCount, C>, true>>;
type _R_VectorCount = Expect<
    Equal<GetReturnType<Q_VectorCount, C>, { count: number }>
>;

// ===========================================================================
// maintenance/orders/diagnose-order-accounting.ts  (db.main.select)
// ===========================================================================

// --- diagnose-order-accounting.ts:439-458  buildOrdersQuery() (db.main.select) ---
// materialized from dynamic source: WHERE built from networkId/orderId IN-lists +
//   date filters; representative form uses a single networkId placeholder.
type Q_DiagnoseOrders = `
        select
            o.*,
            lpc."shopperId" as "shopperId",
            lpc."referenceUserId" as "referenceUserId",
            shopper."givenName" as "shopperGivenName",
            shopper."familyName" as "shopperFamilyName",
            shopper."handle" as "shopperHandle",
            shopper."email" as "shopperEmail",
            reference."givenName" as "referenceGivenName",
            reference."familyName" as "referenceFamilyName",
            reference."handle" as "referenceHandle",
            reference."email" as "referenceEmail"
        from "Network_Order" o
        left join "LogProductClick" lpc on lpc."sid" = o."clickId"
        left join "User" shopper on shopper."id" = lpc."shopperId"
        left join "User" reference on reference."id" = lpc."referenceUserId"
        where o."networkId" in ($1)
        order by o."id" desc
    `;
type _V_DiagnoseOrders = Expect<Equal<ValidateSQL<Q_DiagnoseOrders, S>, true>>;

// --- diagnose-order-accounting.ts:574  getOrderItems() CJ (db.main.select) ---
type Q_DiagnoseCjItems =
    `select * from "Network_Order_CJ_Item" where "orderId" = $1`;
type _V_DiagnoseCjItems = Expect<Equal<ValidateSQL<Q_DiagnoseCjItems, S>, true>>;
type _R_DiagnoseCjItems = Expect<
    Equal<
        GetReturnType<Q_DiagnoseCjItems, S>,
        S["schemas"]["public"]["Network_Order_CJ_Item"]
    >
>;

// --- diagnose-order-accounting.ts:588  getOrderItems() Partnerize (db.main.select) ---
type Q_DiagnosePartnerizeItems =
    `select * from "Network_Order_Partnerize_Item" where "orderId" = $1`;
type _V_DiagnosePartnerizeItems = Expect<
    Equal<ValidateSQL<Q_DiagnosePartnerizeItems, S>, true>
>;
type _R_DiagnosePartnerizeItems = Expect<
    Equal<
        GetReturnType<Q_DiagnosePartnerizeItems, S>,
        S["schemas"]["public"]["Network_Order_Partnerize_Item"]
    >
>;

// --- diagnose-order-accounting.ts:600  getOrderItems() Rakuten (db.main.select) ---
type Q_DiagnoseRakutenItems =
    `select * from "Network_Order_Rakuten_Item" where "orderId" = $1`;
type _V_DiagnoseRakutenItems = Expect<
    Equal<ValidateSQL<Q_DiagnoseRakutenItems, S>, true>
>;
type _R_DiagnoseRakutenItems = Expect<
    Equal<
        GetReturnType<Q_DiagnoseRakutenItems, S>,
        S["schemas"]["public"]["Network_Order_Rakuten_Item"]
    >
>;

// --- diagnose-order-accounting.ts:479-499 / recalc.ts:1045-1068
//     getOrderExpectations() (db.main.select) ---
// The real query projects ${accounting-expression} columns (CASE-heavy status/
// balance helpers) which are dynamic SQL fragments. Representative static form
// keeps the FROM/WHERE shape; status expressions stand in as `unknown` CASEs.
// TODO(return-type): expression columns are CASE/coalesce ⇒ unknown by contract.
type Q_OrderExpectations = `
        select
            (case when o."internalStatus" = 'x' then 'a' else 'b' end) as "internalStatus",
            coalesce(o."manualPseBalance", o."pseBalance") as "pseBalance"
        from "Network_Order" o
        where o."id" = $1
        limit 1
    `;
type _V_OrderExpectations = Expect<
    Equal<ValidateSQL<Q_OrderExpectations, S>, true>
>;

// ===========================================================================
// maintenance/orders/recalc.ts  (db.main.select / db.main.run)
// ===========================================================================

// --- recalc.ts:853-858  fetchOrdersByRawOrderId() (db.main.select) ---
// materialized from dynamic source: rawOrderId/networkId IN-lists.
type Q_RecalcByRawOrderId = `
        select o."id"
        from "Network_Order" o
        where o."rawOrderId" in ($1)
        order by o."orderDate" desc
    `;
type _V_RecalcByRawOrderId = Expect<
    Equal<ValidateSQL<Q_RecalcByRawOrderId, S>, true>
>;
type _R_RecalcByRawOrderId = Expect<
    Equal<GetReturnType<Q_RecalcByRawOrderId, S>, { id: string }>
>;

// --- recalc.ts:958-959  getOrderById() (db.main.select) ---
type Q_RecalcOrderById =
    `select * from "Network_Order" where "id" = $1 limit 1`;
type _V_RecalcOrderById = Expect<
    Equal<ValidateSQL<Q_RecalcOrderById, S>, true>
>;
type _R_RecalcOrderById = Expect<
    Equal<
        GetReturnType<Q_RecalcOrderById, S>,
        S["schemas"]["public"]["Network_Order"]
    >
>;

// --- recalc.ts:1031  getOrderItemsByNetwork() (db.main.select) ---
// materialized from dynamic source: ${table} resolved to Rakuten item table.
type Q_RecalcOrderItems =
    `select * from "Network_Order_Rakuten_Item" where "orderId" = $1`;
type _V_RecalcOrderItems = Expect<
    Equal<ValidateSQL<Q_RecalcOrderItems, S>, true>
>;
type _R_RecalcOrderItems = Expect<
    Equal<
        GetReturnType<Q_RecalcOrderItems, S>,
        S["schemas"]["public"]["Network_Order_Rakuten_Item"]
    >
>;

// --- recalc.ts:1231-1238 / 1257-1264  getCommissionRateWarnings() (db.main.select) ---
type Q_RecalcClickShopper = `
                select "shopperId"
                from "LogProductClick"
                where "sid" = $1
                  and ("shopperId" is not null or "referenceUserId" is not null)
            `;
type _V_RecalcClickShopper = Expect<
    Equal<ValidateSQL<Q_RecalcClickShopper, S>, true>
>;
type _R_RecalcClickShopper = Expect<
    Equal<GetReturnType<Q_RecalcClickShopper, S>, { shopperId: string | null }>
>;

// --- recalc.ts:1633-1638  lookupPseCommissionRate() region check (db.main.select) ---
type Q_RecalcCommissionRegion = `
            select "pseCommission"
            from "Retailer_Commission"
            where "advertiserName" = $1 and "region" = $2
        `;
type _V_RecalcCommissionRegion = Expect<
    Equal<ValidateSQL<Q_RecalcCommissionRegion, S>, true>
>;
type _R_RecalcCommissionRegion = Expect<
    Equal<
        GetReturnType<Q_RecalcCommissionRegion, S>,
        { pseCommission: number }
    >
>;

// --- recalc.ts:1646-1653  lookupPseCommissionRate() current (db.main.select) ---
type Q_RecalcCommissionCurrent = `
            select "pseCommission"
            from "Retailer_Commission"
            where "advertiserName" = $1
              and "region" = $2
              and "updatedAt" < $3
        `;
type _V_RecalcCommissionCurrent = Expect<
    Equal<ValidateSQL<Q_RecalcCommissionCurrent, S>, true>
>;
type _R_RecalcCommissionCurrent = Expect<
    Equal<
        GetReturnType<Q_RecalcCommissionCurrent, S>,
        { pseCommission: number }
    >
>;

// --- recalc.ts:1661-1671  lookupPseCommissionRate() history (db.main.select) ---
type Q_RecalcCommissionHistory = `
            select "pseCommission"
            from "Retailer_Commission_History"
            where "advertiserName" = $1
              and "region" = $2
              and "startedAt" <= $3
              and "endedAt" >= $3
            order by "endedAt" desc
            limit 1
        `;
type _V_RecalcCommissionHistory = Expect<
    Equal<ValidateSQL<Q_RecalcCommissionHistory, S>, true>
>;
type _R_RecalcCommissionHistory = Expect<
    Equal<
        GetReturnType<Q_RecalcCommissionHistory, S>,
        { pseCommission: number }
    >
>;

// --- recalc.ts:1704-1710  runCommissionRateRecalc() click check (db.main.select) ---
type Q_RecalcClickWithDate = `
            select "shopperId", "createdAt"
            from "LogProductClick"
            where "sid" = $1
              and ("shopperId" is not null or "referenceUserId" is not null)
        `;
type _V_RecalcClickWithDate = Expect<
    Equal<ValidateSQL<Q_RecalcClickWithDate, S>, true>
>;
type _R_RecalcClickWithDate = Expect<
    Equal<
        GetReturnType<Q_RecalcClickWithDate, S>,
        { shopperId: string | null; createdAt: string }
    >
>;

// --- recalc.ts:1740-1746  runCommissionRateRecalc() update (db.main.run, DML) ---
type Q_RecalcUpdateRate = `
            update "Network_Order"
            set "pseCommissionRate" = $1,
                "pseCommissionRateClick" = $2
            where "id" = $3
        `;
type _V_RecalcUpdateRate = Expect<
    Equal<ValidateSQL<Q_RecalcUpdateRate, S>, true>
>;

// ===========================================================================
// maintenance/orders/recalc-invoices.ts  (db.main.typedSelect / db.main.run)
// ===========================================================================

// --- recalc-invoices.ts:17-24  drafts (db.main.typedSelect) ---
type Q_RecalcInvDrafts = `
            select distinct "revolutDraftId"
            from "User_ApprovedPayment"
            where "revolutDraftId" is not null
                and "userId" is not null
        `;
type _V_RecalcInvDrafts = Expect<
    Equal<ValidateSQL<Q_RecalcInvDrafts, S>, true>
>;
type _R_RecalcInvDrafts = Expect<
    Equal<
        GetReturnType<Q_RecalcInvDrafts, S>,
        { revolutDraftId: string | null }
    >
>;

// --- recalc-invoices.ts:31-37  invoice (db.main.typedSelect) ---
type Q_RecalcInvInvoice = `
                select * from "Revolut_PaymentInvoice"
                where "paymentId" = $1
            `;
type _V_RecalcInvInvoice = Expect<
    Equal<ValidateSQL<Q_RecalcInvInvoice, S>, true>
>;
type _R_RecalcInvInvoice = Expect<
    Equal<
        GetReturnType<Q_RecalcInvInvoice, S>,
        S["schemas"]["public"]["Revolut_PaymentInvoice"]
    >
>;

// --- recalc-invoices.ts:62-68  update data (db.main.run, DML) ---
type Q_RecalcInvUpdate = `
                update "Revolut_PaymentInvoice"
                set "data" = $1
                where "paymentId" = $2
            `;
type _V_RecalcInvUpdate = Expect<
    Equal<ValidateSQL<Q_RecalcInvUpdate, S>, true>
>;

// ===========================================================================
// maintenance/orders/preview-invoice.ts  (db.main.typedSelect)
// ===========================================================================

// --- preview-invoice.ts:38-41  draft (db.main.typedSelect) ---
type Q_PreviewDraft =
    `select * from "Revolut_PaymentDraft" where "id" = $1`;
type _V_PreviewDraft = Expect<Equal<ValidateSQL<Q_PreviewDraft, S>, true>>;
type _R_PreviewDraft = Expect<
    Equal<
        GetReturnType<Q_PreviewDraft, S>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// ===========================================================================
// maintenance/orders/preview-all-invoices.ts  (db.main.typedSelect)
// ===========================================================================

// --- preview-all-invoices.ts:32-40  drafts (db.main.typedSelect) ---
type Q_PreviewAllDrafts = `
            select distinct rpd.*
            from "Revolut_PaymentDraft" rpd
            join "User_ApprovedPayment" uap on uap."revolutDraftId" = rpd."id"
            where rpd."createdAt" >= '2025-07-01'
            order by rpd."createdAt" desc
        `;
type _V_PreviewAllDrafts = Expect<
    Equal<ValidateSQL<Q_PreviewAllDrafts, S>, true>
>;
type _R_PreviewAllDrafts = Expect<
    Equal<
        GetReturnType<Q_PreviewAllDrafts, S>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// --- preview-all-invoices.ts:63-74  historyRows (db.main.typedSelect) ---
// FIXTURE-GAP: Revolut_PaymentDraft_History.revolutDraftId — fixture history table
//   exists but uses different key columns; jsonb path filter on "data".
type Q_PreviewAllHistory = `
                    select "createdAt" from "Revolut_PaymentDraft_History"
                    where "revolutDraftId" = $1
                    and (
                        lower("data"::jsonb->'data'->>'new_state') = 'completed'
                        or lower("data"::jsonb->'data'->>'state') = 'completed'
                    )
                    order by "createdAt" desc limit 1
                `;
type _V_PreviewAllHistory = Expect<
    Equal<ValidateSQL<Q_PreviewAllHistory, S>, true>
>;

// ===========================================================================
// maintenance/orders/backfill-rakuten-na-settlements.ts  (db.main.run as select)
// ===========================================================================

// --- backfill-rakuten-na-settlements.ts:27-46  settlingInvoices (db.main.run<Row>) ---
type Q_NaSettlements = `
        select
            nir."invoiceId",
            nir."advertiserId",
            npr."currency",
            nir."invoiceDate",
            npr."date" as "settlementDate",
            nir."previouslyHeldCommissions"
        from "Network_Payment_Invoice_Rakuten" nir
        join "Network_Payment_Rakuten" npr
            on npr."paymentId" = nir."paymentId"
        where
            npr."paymentStatus" != 'N/A'
            and nir."previouslyHeldCommissions" < 0
        order by
            nir."advertiserId" asc,
            npr."currency" asc,
            nir."invoiceDate" asc nulls last,
            nir."invoiceId" asc
    `;
type _V_NaSettlements = Expect<Equal<ValidateSQL<Q_NaSettlements, S>, true>>;
type _R_NaSettlements = Expect<
    Equal<
        GetReturnType<Q_NaSettlements, S>,
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

export type CommerceCliPlainTestsPass = true;
