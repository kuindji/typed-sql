/**
 * Commerce queries — builder runtime mirrors. Setup-only; failures => engine fix-list.
 *
 * Builder mirror of commerce queries.test.ts. One builder test per query, EXCEPT the
 * two intentional-invalid ones (Q_InvalidMainColumn / Q_InvalidCatalogueTable), which
 * have no builder analogue and are skipped.
 *
 * Classification:
 *   - createSelectQuery   → simple SELECTs (SELECT * / SELECT id with WHERE/LIMIT/IN)
 *   - createInsertQuery   → INSERT (incl. ON CONFLICT do nothing / do update)
 *   - createUpdateQuery   → UPDATE (simple + large CASE/coalesce/subselect — whole
 *                           assignment list emitted as ONE raw .set(...) for byte fidelity)
 *   - createDeleteQuery   → DELETE
 *   - createSql           → builder-inexpressible (CTE/WITH, UNION, derived FROM,
 *                           LATERAL, correlated array()/EXISTS) — each tagged TODO(builder-api)
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
    CommerceCatalogueSchema,
    CommerceMainSchema,
} from "../../fixtures/commerce-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type Main = CommerceMainSchema;
type Catalogue = CommerceCatalogueSchema;

const sqlMain = createSql<Main>();
const sqlCat = createSql<Catalogue>();

// ===========================================================================
// SELECTs (createSelectQuery)
// ===========================================================================

// mirror of commerce queries.test.ts Q_InternalCatalogueApiKey
const qInternalCatalogueApiKey = createSelectQuery<Catalogue>()
    .from(`api_key_settings`)
    .select(`api_key_id`)
    .where(`internal = true`)
    .limit(1);

// mirror of commerce queries.test.ts Q_SelectPasswordResets
const qSelectPasswordResets = createSelectQuery<Main>()
    .from(`"User_Password_Reset"`)
    .select(`*`);

// mirror of commerce queries.test.ts Q_SelectUserIdByEmail
const qSelectUserIdByEmail = createSelectQuery<Main>()
    .from(`"User"`)
    .select(`"id"`)
    .where(`"email" = :email`)
    .withParams({ email: "a@b.c" });

// mirror of commerce queries.test.ts Q_SelectExchangeRates
const qSelectExchangeRates = createSelectQuery<Main>()
    .from(`"ExchangeRate"`)
    .select(`*`);

// mirror of commerce queries.test.ts Q_SelectStaleRevolutDrafts
const qSelectStaleRevolutDrafts = createSelectQuery<Main>()
    .from(`"Revolut_PaymentDraft"`)
    .select(`*`)
    .where(`"status" in ('CREATED', 'PENDING')`)
    .where(`"createdAt" < :before`)
    .withParams({ before: "2024-01-01" });

// mirror of commerce queries.test.ts Q_SelectDraftByTransactionId
const qSelectDraftByTransactionId = createSelectQuery<Main>()
    .from(`"Revolut_PaymentDraft"`)
    .select(`*`)
    .where(`"transactionId" = :txId`)
    .withParams({ txId: "t1" });

// mirror of commerce queries.test.ts Q_SelectDraftById
const qSelectDraftById = createSelectQuery<Main>()
    .from(`"Revolut_PaymentDraft"`)
    .select(`*`)
    .where(`id = :id`)
    .withParams({ id: "d1" });

// mirror of commerce queries.test.ts Q_SelectApprovedPayment
const qSelectApprovedPayment = createSelectQuery<Main>()
    .from(`"User_ApprovedPayment"`)
    .select(`*`)
    .where(`id = :id`)
    .withParams({ id: "p1" });

describe("commerce queries — SELECT builders", () => {
    it("qInternalCatalogueApiKey assembles", () => {
        expect(normalizeWhitespace(qInternalCatalogueApiKey.toString())).toBe(
            normalizeWhitespace(
                `SELECT api_key_id FROM api_key_settings WHERE internal = true LIMIT 1`,
            ),
        );
    });

    it("qSelectPasswordResets assembles", () => {
        expect(normalizeWhitespace(qSelectPasswordResets.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "User_Password_Reset"`),
        );
    });

    it("qSelectUserIdByEmail assembles", () => {
        expect(normalizeWhitespace(qSelectUserIdByEmail.toString())).toBe(
            normalizeWhitespace(`SELECT "id" FROM "User" WHERE "email" = $1`),
        );
        expect([...qSelectUserIdByEmail.getParams()]).toEqual(["a@b.c"]);
    });

    it("qSelectExchangeRates assembles", () => {
        expect(normalizeWhitespace(qSelectExchangeRates.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "ExchangeRate"`),
        );
    });

    it("qSelectStaleRevolutDrafts assembles", () => {
        expect(normalizeWhitespace(qSelectStaleRevolutDrafts.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentDraft" ` +
                    `WHERE "status" in ('CREATED', 'PENDING') AND "createdAt" < $1`,
            ),
        );
    });

    it("qSelectDraftByTransactionId assembles", () => {
        expect(normalizeWhitespace(qSelectDraftByTransactionId.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM "Revolut_PaymentDraft" WHERE "transactionId" = $1`,
            ),
        );
    });

    it("qSelectDraftById assembles", () => {
        expect(normalizeWhitespace(qSelectDraftById.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "Revolut_PaymentDraft" WHERE id = $1`),
        );
    });

    it("qSelectApprovedPayment assembles", () => {
        expect(normalizeWhitespace(qSelectApprovedPayment.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM "User_ApprovedPayment" WHERE id = $1`),
        );
    });
});

// --- SELECT row-type assertions (only where determinable) ---

type _R_InternalCatalogueApiKey = RequireTrue<
    AssertEqual<SelectBuilderResult<typeof qInternalCatalogueApiKey>, { api_key_id: string }>
>;

type _R_SelectPasswordResets = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qSelectPasswordResets>,
        Main["schemas"]["public"]["User_Password_Reset"]
    >
>;

type _R_SelectUserIdByEmail = RequireTrue<
    AssertEqual<SelectBuilderResult<typeof qSelectUserIdByEmail>, { id: string }>
>;

type _R_SelectExchangeRates = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qSelectExchangeRates>,
        Main["schemas"]["public"]["ExchangeRate"]
    >
>;

type _R_SelectStaleRevolutDrafts = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qSelectStaleRevolutDrafts>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type _R_SelectDraftByTransactionId = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qSelectDraftByTransactionId>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type _R_SelectDraftById = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qSelectDraftById>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type _R_SelectApprovedPayment = RequireTrue<
    AssertEqual<
        SelectBuilderResult<typeof qSelectApprovedPayment>,
        Main["schemas"]["public"]["User_ApprovedPayment"]
    >
>;

// ===========================================================================
// INSERTs (createInsertQuery)
// ===========================================================================

// mirror of commerce queries.test.ts Q_InsertPasswordReset
const qInsertPasswordReset = createInsertQuery<Main>()
    .into(`"User_Password_Reset"`)
    .value(`"userId"`, `:userId`)
    .value(`"tempPassword"`, `:tempPassword`)
    .value(`"email"`, `:email`)
    .value(`"updatedAt"`, `now()`)
    .withParams({ userId: "u1", tempPassword: "p", email: "a@b.c" });

// mirror of commerce queries.test.ts Q_InsertExchangeRateHistory
const qInsertExchangeRateHistory = createInsertQuery<Main>()
    .into(`"ExchangeRate_History"`)
    .value(`"from"`, `:from`)
    .value(`"to"`, `:to`)
    .value(`"rate"`, `:rate`)
    .value(`"date"`, `:date`)
    .onConflict(`("date", "from", "to") do nothing`)
    .withParams({ from: "USD", to: "GBP", rate: 1.2, date: "2024-01-01" });

// mirror of commerce queries.test.ts Q_UpsertExchangeRate
const qUpsertExchangeRate = createInsertQuery<Main>()
    .into(`"ExchangeRate"`)
    .value(`"from"`, `:from`)
    .value(`"to"`, `:to`)
    .value(`"rate"`, `:rate`)
    .value(`"updatedAt"`, `:updatedAt`)
    .onConflict(`("from", "to") do update set "rate" = :rate2, "updatedAt" = :updatedAt2`)
    .withParams({
        from: "USD",
        to: "GBP",
        rate: 1.2,
        updatedAt: "2024-01-01",
        rate2: 1.2,
        updatedAt2: "2024-01-01",
    });

// mirror of commerce queries.test.ts Q_InsertRevolutDraftHistory
const qInsertRevolutDraftHistory = createInsertQuery<Main>()
    .into(`"Revolut_PaymentDraft_History"`)
    .value(`"revolutDraftId"`, `:revolutDraftId`)
    .value(`"data"`, `:data`)
    .value(`"createdAt"`, `:createdAt`)
    .withParams({ revolutDraftId: "d1", data: "{}", createdAt: "2024-01-01" });

describe("commerce queries — INSERT builders", () => {
    it("qInsertPasswordReset assembles", () => {
        expect(qInsertPasswordReset.toString()).toBe(
            `insert into "User_Password_Reset" ("userId", "tempPassword", "email", "updatedAt") ` +
                `values ($1, $2, $3, now())`,
        );
        expect([...qInsertPasswordReset.getParams()]).toEqual(["u1", "p", "a@b.c"]);
    });

    it("qInsertExchangeRateHistory assembles (on conflict do nothing)", () => {
        expect(qInsertExchangeRateHistory.toString()).toBe(
            `insert into "ExchangeRate_History" ("from", "to", "rate", "date") ` +
                `values ($1, $2, $3, $4) ` +
                `on conflict ("date", "from", "to") do nothing`,
        );
        expect([...qInsertExchangeRateHistory.getParams()]).toEqual([
            "USD",
            "GBP",
            1.2,
            "2024-01-01",
        ]);
    });

    it("qUpsertExchangeRate assembles (on conflict do update)", () => {
        expect(qUpsertExchangeRate.toString()).toBe(
            `insert into "ExchangeRate" ("from", "to", "rate", "updatedAt") ` +
                `values ($1, $2, $3, $4) ` +
                `on conflict ("from", "to") do update set "rate" = $5, "updatedAt" = $6`,
        );
        expect([...qUpsertExchangeRate.getParams()]).toEqual([
            "USD",
            "GBP",
            1.2,
            "2024-01-01",
            1.2,
            "2024-01-01",
        ]);
    });

    it("qInsertRevolutDraftHistory assembles", () => {
        expect(qInsertRevolutDraftHistory.toString()).toBe(
            `insert into "Revolut_PaymentDraft_History" ("revolutDraftId", "data", "createdAt") ` +
                `values ($1, $2, $3)`,
        );
        expect([...qInsertRevolutDraftHistory.getParams()]).toEqual([
            "d1",
            "{}",
            "2024-01-01",
        ]);
    });
});

// ===========================================================================
// UPDATEs (createUpdateQuery)
//   Simple SET fragments are split; large CASE/coalesce/subselect bodies are
//   emitted as ONE raw .set(...) fragment for byte-faithful toString().
// ===========================================================================

// mirror of commerce queries.test.ts Q_UpdatePasswordReset
const qUpdatePasswordReset = createUpdateQuery<Main>()
    .table(`"User_Password_Reset"`)
    .set(`"updatedAt" = now()`)
    .set(`"tempPassword" = :tempPassword`)
    .where(`"userId" = :userId`)
    .withParams({ tempPassword: "p", userId: "u1" });

// mirror of commerce queries.test.ts Q_MarkRevolutDraftNotFound
const qMarkRevolutDraftNotFound = createUpdateQuery<Main>()
    .table(`"Revolut_PaymentDraft"`)
    .set(`"status" = 'NOTFOUND'`)
    .where(`"id" = :id`)
    .withParams({ id: "d1" });

// mirror of commerce queries.test.ts Q_SetCommissionsPaid
const qSetCommissionsPaid = createUpdateQuery<Main>()
    .table(`"User_ApprovedPayment"`)
    .set(`"paid" = true`)
    .where(`"revolutDraftId" = :revolutDraftId`)
    .withParams({ revolutDraftId: "d1" });

// mirror of commerce queries.test.ts Q_UpdateDraftTransaction
const qUpdateDraftTransaction = createUpdateQuery<Main>()
    .table(`"Revolut_PaymentDraft"`)
    .set(`"transactionId" = :transactionId`)
    .where(`id = :id`)
    .withParams({ transactionId: "t1", id: "d1" });

// mirror of commerce queries.test.ts Q_SetApprovedPaymentPaid
const qSetApprovedPaymentPaid = createUpdateQuery<Main>()
    .table(`"User_ApprovedPayment"`)
    .set(`"paid" = true`)
    .set(`"status" = 'paid'`)
    .where(`id = :id`)
    .withParams({ id: "p1" });

// mirror of commerce queries.test.ts Q_MarkCatalogueProductMetadataUsed
const qMarkCatalogueProductMetadataUsed = createUpdateQuery<Catalogue>()
    .table(`product_metadata`)
    .set(`used = true`)
    .where(`product_id = :productId`)
    .where(`file_id = :fileId`)
    .withParams({ productId: "pr1", fileId: "f1" });

describe("commerce queries — UPDATE builders (simple)", () => {
    it("qUpdatePasswordReset assembles", () => {
        expect(qUpdatePasswordReset.toString()).toBe(
            `update "User_Password_Reset" set "updatedAt" = now(), "tempPassword" = $1 ` +
                `where "userId" = $2`,
        );
        expect([...qUpdatePasswordReset.getParams()]).toEqual(["p", "u1"]);
    });

    it("qMarkRevolutDraftNotFound assembles", () => {
        expect(qMarkRevolutDraftNotFound.toString()).toBe(
            `update "Revolut_PaymentDraft" set "status" = 'NOTFOUND' where "id" = $1`,
        );
    });

    it("qSetCommissionsPaid assembles", () => {
        expect(qSetCommissionsPaid.toString()).toBe(
            `update "User_ApprovedPayment" set "paid" = true where "revolutDraftId" = $1`,
        );
    });

    it("qUpdateDraftTransaction assembles", () => {
        expect(qUpdateDraftTransaction.toString()).toBe(
            `update "Revolut_PaymentDraft" set "transactionId" = $1 where id = $2`,
        );
    });

    it("qSetApprovedPaymentPaid assembles", () => {
        expect(qSetApprovedPaymentPaid.toString()).toBe(
            `update "User_ApprovedPayment" set "paid" = true, "status" = 'paid' where id = $1`,
        );
    });

    it("qMarkCatalogueProductMetadataUsed assembles", () => {
        expect(qMarkCatalogueProductMetadataUsed.toString()).toBe(
            `update product_metadata set used = true where product_id = $1 and file_id = $2`,
        );
    });
});

// --- Large CASE/coalesce/subselect UPDATEs — single raw .set(...) fragment ---

// mirror of commerce queries.test.ts Q_UpdateRakutenOrderAffiliatePaymentStatus
const qUpdateRakutenOrderAffiliatePaymentStatus = createUpdateQuery<Main>()
    .table(`"Network_Order" o`)
    .set(
        `"affiliatePaymentStatus" = (
        case
            when o."manualAffiliatePaymentStatus" is not null
                then o."manualAffiliatePaymentStatus"
            when exists(
                select 1
                from "Network_Payment_Invoice_Item_Rakuten" i
                join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = i."invoiceId"
                join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
                where
                    i."orderId" = o."rawOrderId"
                    and (
                        npr."paymentStatus" != 'N/A'
                        or exists(
                            select 1
                            from "Network_Rakuten_Invoice_Settlement" s
                            where
                                s."naInvoiceId" = nip."invoiceId"
                                and s."allocatedAmount" > 0
                                and (
                                    o."commissionAmount" > 0
                                    or exists(
                                        select 1
                                        from "Network_Order_Rakuten_Item_Snapshot" snap
                                        where snap."orderId" = o."orderId"
                                            and (
                                                case
                                                    when btrim(
                                                        regexp_replace(
                                                            coalesce(snap.details::jsonb->>'Sales', ''),
                                                            ',',
                                                            '',
                                                            'g'
                                                        )
                                                    ) ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                                                        then btrim(
                                                            regexp_replace(
                                                                coalesce(snap.details::jsonb->>'Sales', ''),
                                                                ',',
                                                                '',
                                                                'g'
                                                            )
                                                        )::numeric
                                                    else 0
                                                end
                                            ) < 0
                                            and snap."processDate" > s."settlementDate"
                                    )
                                )
                        )
                    )
            ) then 'paid'
            when o."internalStatus" = 'rejected' then 'na'
            else null
        end
    ),
    "affiliatePaymentDate" = (
        select max(d."paymentDate")::timestamptz
        from (
            select npr."date" as "paymentDate"
            from "Network_Payment_Invoice_Item_Rakuten" i
            join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = i."invoiceId"
            join "Network_Payment_Rakuten" npr on npr."paymentId" = nip."paymentId"
            where i."orderId" = o."rawOrderId" and npr."paymentStatus" != 'N/A'

            union all

            select s."settlingInvoiceDate" as "paymentDate"
            from "Network_Payment_Invoice_Item_Rakuten" i
            join "Network_Payment_Invoice_Rakuten" nip on nip."invoiceId" = i."invoiceId"
            join "Network_Rakuten_Invoice_Settlement" s on s."naInvoiceId" = nip."invoiceId"
            where
                i."orderId" = o."rawOrderId"
                and s."allocatedAmount" > 0
                and s."settlingInvoiceDate" is not null
                and (
                    o."commissionAmount" > 0
                    or exists(
                        select 1
                        from "Network_Order_Rakuten_Item_Snapshot" snap
                        where snap."orderId" = o."orderId"
                            and (
                                case
                                    when btrim(
                                        regexp_replace(
                                            coalesce(snap.details::jsonb->>'Sales', ''),
                                            ',',
                                            '',
                                            'g'
                                        )
                                    ) ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                                        then btrim(
                                            regexp_replace(
                                                coalesce(snap.details::jsonb->>'Sales', ''),
                                                ',',
                                                '',
                                                'g'
                                            )
                                        )::numeric
                                    else 0
                                end
                            ) < 0
                            and snap."processDate" > s."settlementDate"
                    )
                )
        ) d
    )`,
    )
    .where(`"networkId" = 'rakuten'`)
    .where(`o."id" = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_RecalcRakutenItem
const qRecalcRakutenItem = createUpdateQuery<Main>()
    .table(`"Network_Order_Rakuten_Item" i`)
    .set(
        `"grossSaleAmount" = coalesce(
        (
            select sum((replace((details::json)->>'Sales', ',', ''))::numeric)
            from "Network_Order_Rakuten_Item_Snapshot"
            where "rakutenItemId" = i.id
                and replace(((details::json)->>'Sales'), ',', '')::numeric >= 0
        ),
        "grossSaleAmount"
    ),
    "grossCommissionAmount" = coalesce(
        (
            select sum((replace((details::json)->>'Total_Commission', ',', ''))::numeric)
            from "Network_Order_Rakuten_Item_Snapshot"
            where "rakutenItemId" = i.id
                and replace(((details::json)->>'Sales'), ',', '')::numeric >= 0
        ),
        "grossCommissionAmount"
    ),
    "saleAmount" = coalesce(
        case when "manualStatus" is null or "manualStatus" = 'approved' then (
            select round(sum("saleAmount")::numeric, 4)
            from "Network_Order_Rakuten_Item_Snapshot"
            where "rakutenItemId" = i.id
        )
        else 0
        end,
        "saleAmount"
    ),
    "commissionAmount" = coalesce(
        case when "manualStatus" is null or "manualStatus" = 'approved' then (
            select round(sum("commissionAmount")::numeric, 4)
            from "Network_Order_Rakuten_Item_Snapshot"
            where "rakutenItemId" = i.id
        )
        else 0
        end,
        "commissionAmount"
    ),
    "grossItemsCount" = coalesce(
        (
            select sum(((details::json)->>'__of_Items')::int4)
            from "Network_Order_Rakuten_Item_Snapshot"
            where "rakutenItemId" = i.id
                and replace(((details::json)->>'Sales'), ',', '')::numeric >= 0
        ),
        "grossItemsCount"
    ),
    "itemsCount" = coalesce(
        (
            case when "manualStatus" is null or "manualStatus" = 'approved' then (
                select sum("num")
                from (
                    (
                        select sum(((details::json)->>'__of_Items')::int4) as "num"
                        from "Network_Order_Rakuten_Item_Snapshot"
                        where "rakutenItemId" = i.id
                            and replace(((details::json)->>'Sales'), ',', '')::numeric >= 0
                    )
                    union
                    (
                        select sum(-1 * ((details::json)->>'__of_Cancelled_Items')::int4) as "num"
                        from "Network_Order_Rakuten_Item_Snapshot"
                        where "rakutenItemId" = i.id
                            and replace(((details::json)->>'Sales'), ',', '')::numeric < 0
                    )
                )
            )
            else 0
            end
        ),
        "itemsCount"
    ),
    "cancelledItemsCount" = coalesce(
        (
            case when "manualStatus" is null or "manualStatus" = 'approved' then (
                select sum(((details::json)->>'__of_Cancelled_Items')::int4)
                from "Network_Order_Rakuten_Item_Snapshot"
                where "rakutenItemId" = i.id
                    and replace(((details::json)->>'Sales'), ',', '')::numeric < 0
            )
            else (
                select sum(((details::json)->>'__of_Items')::int4)
                from "Network_Order_Rakuten_Item_Snapshot"
                where "rakutenItemId" = i.id
                    and replace(((details::json)->>'Sales'), ',', '')::numeric >= 0
            )
            end
        ),
        "cancelledItemsCount"
    ),
    "quantity" = coalesce(
        (
            case when "manualStatus" is null or "manualStatus" = 'approved' then (
                select sum("num")
                from (
                    (
                        select sum(((details::json)->>'__of_Items')::int4) as "num"
                        from "Network_Order_Rakuten_Item_Snapshot"
                        where "rakutenItemId" = i.id
                            and replace(((details::json)->>'Sales'), ',', '')::numeric >= 0
                    )
                    union
                    (
                        select sum(-1 * ((details::json)->>'__of_Cancelled_Items')::int4) as "num"
                        from "Network_Order_Rakuten_Item_Snapshot"
                        where "rakutenItemId" = i.id
                            and replace(((details::json)->>'Sales'), ',', '')::numeric < 0
                    )
                )
            )
            else 0
            end
        ),
        "quantity"
    )`,
    )
    .where(`i.id = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_UpdateRakutenOrderValues
const qUpdateRakutenOrderValues = createUpdateQuery<Main>()
    .table(`"Network_Order" o`)
    .set(
        `"grossSaleAmount" = coalesce(
        (
            select round(sum("grossSaleAmount")::numeric, 2)
            from "Network_Order_Rakuten_Item" i
            where i."orderId" = o."orderId"
        ),
        "grossSaleAmount"
    ),
    "saleAmount" = coalesce(
        case when o."manualStatus" is null or o."manualStatus" = 'approved' then
        (
            select round(sum("saleAmount")::numeric, 2)
            from "Network_Order_Rakuten_Item" i
            where i."orderId" = o."orderId"
        )
        else 0
        end,
        "saleAmount"
    ),
    "grossCommissionAmount" = coalesce(
        (
            select round(sum("grossCommissionAmount")::numeric, 2)
            from "Network_Order_Rakuten_Item" i
            where i."orderId" = o."orderId"
        ),
        "grossCommissionAmount"
    ),
    "commissionAmount" = (
        coalesce(
            case when (o."manualStatus" is null or o."manualStatus" = 'approved') then
            (
                select round(sum("commissionAmount")::numeric, 2)
                from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
            )
            else 0
            end,
            "commissionAmount"
        )
    ),
    "grossItemsCount" = coalesce(
        (
            select sum("grossItemsCount")
            from "Network_Order_Rakuten_Item" i
            where i."orderId" = o."orderId"
        ),
        "grossItemsCount"
    ),
    "itemsCount" = coalesce(
        (
            case when (o."manualStatus" is null or o."manualStatus" = 'approved') then (
                select sum("itemsCount")
                from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
            )
            else 0
            end
        ),
        "itemsCount"
    ),
    "cancelledItemsCount" = coalesce(
        (
            case when (o."manualStatus" is null or o."manualStatus" = 'approved') then (
                select sum("cancelledItemsCount") as "cancelledItemsCount"
                from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
            )
            else (
                select sum("grossItemsCount")
                from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
            )
            end
        ),
        "cancelledItemsCount"
    )`,
    )
    .where(`o."networkId" = 'rakuten'`)
    .where(`o."orderId" = 'GB123'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_UpdateOrderBalance
const qUpdateOrderBalance = createUpdateQuery<Main>()
    .table(`"Network_Order" o`)
    .set(
        `"realPseBalance" = case
        when (
            (
                o."affiliatePaymentStatus" is not null
                and o."affiliatePaymentStatus" = 'paid'
            )
            or (
                o."manualAffiliatePaymentStatus" is not null
                and o."manualAffiliatePaymentStatus" = 'paid'
            )
        )
        then
            round(
                coalesce(
                    (
                        (o."commissionAmount" * o."pseCommissionRate") -
                        coalesce(
                            (
                                select sum(uap.amount)
                                from "User_ApprovedPayment" uap
                                where
                                    uap."networkOrderId" = o.id
                                    and uap."status" = 'paid'
                            ),
                            0
                        )
                    ),
                    0
                )::numeric,
                2
            )
        else round(0::numeric, 2)
        end,
        "pseBalance" = coalesce(o."manualPseBalance", case
        when (
            (
                o."affiliatePaymentStatus" is not null
                and o."affiliatePaymentStatus" = 'paid'
            )
            or (
                o."manualAffiliatePaymentStatus" is not null
                and o."manualAffiliatePaymentStatus" = 'paid'
            )
        )
        then
            round(
                coalesce(
                    (
                        (o."commissionAmount" * o."pseCommissionRate") -
                        coalesce(
                            (
                                select sum(uap.amount)
                                from "User_ApprovedPayment" uap
                                where
                                    uap."networkOrderId" = o.id
                                    and uap."status" = 'paid'
                            ),
                            0
                        )
                    ),
                    0
                )::numeric,
                2
            )
        else round(0::numeric, 2)
        end)`,
    )
    .where(`o."id" = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_UpdateOrderInternalStatus
const qUpdateOrderInternalStatus = createUpdateQuery<Main>()
    .table(`"Network_Order" o`)
    .set(
        `"internalStatus" = (
        coalesce(
            "manualStatus",
            case
                when "saleAmount" <= 0 and "itemsCount" <= 0 then 'rejected'
                else null
            end,
            case
                when "networkId" = 'rakuten'
                    and "affiliatePaymentStatus" = 'paid' then 'approved'
                when "status" = 'declined' then 'rejected'
                when "status" = 'new' then 'pending'
                when "status" = 'locked' then 'approved'
                when "status" = 'closed' then 'approved'
                when "status" = 'mixed' then (
                    case when exists (
                        select 1 from "Network_Order_Partnerize_Item" pi
                        where pi."orderId" = o."orderId"
                            and pi.status = 'pending'
                    ) then 'pending'
                    else 'approved'
                    end
                )
                when "status" = '' then null
                else "status"
            end,
            'pending'
        )
    )`,
    )
    .where(`"id" = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_UpdateOrderPsePaymentStatus
const qUpdateOrderPsePaymentStatus = createUpdateQuery<Main>()
    .table(`"Network_Order" o`)
    .set(
        `"psePaymentStatus" =
        (
            case
                when "manualPsePaymentStatus" is not null
                    then "manualPsePaymentStatus"
                when exists (
                    select 1
                    from "User_ApprovedPayment" uap
                    where uap."status" = 'paid'
                        and uap."networkOrderId" = o."id"
                ) then 'paid'
                when "commissionAmount" <= 0 then 'na'
                when ("commissionAmount" * "pseCommissionRate") < 0.1 then 'na'
                when not exists(
                    select 1
                    from "LogProductClick" lpc
                    where lpc."sid" = o."clickId"
                        and (lpc."shopperId" is not null or
                            lpc."referenceUserId" is not null)
                ) then 'na'
                when "internalStatus" = 'pending' then null
                when "internalStatus" = 'rejected' then 'na'
                else 'pending'
            end
        )`,
    )
    .where(`id = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_UpdateOrderRevolutPaymentStatus
const qUpdateOrderRevolutPaymentStatus = createUpdateQuery<Main>()
    .table(`"Network_Order" o`)
    .set(
        `"revolutPaymentStatus" = (
        case
            when o."manualRevolutPaymentStatus" is not null
                then o."manualRevolutPaymentStatus"
            when o."psePaymentStatus" = 'na' then 'na'
            when exists(
                select 1
                from "User_ApprovedPayment" uap
                join "Revolut_PaymentDraft" rpd on rpd.id = uap."revolutDraftId"
                where uap."networkOrderId" = o."id"
            ) then (
                select (
                    case
                        when uap."status" = 'approved' then 'approved'
                        when uap."status" = 're-approved' then 'approved'
                        when rpd."status" = 'COMPLETED' then 'completed'
                        when rpd."status" = 'CREATED' then 'created'
                        when rpd."status" = 'PENDING' then 'sent'
                        else 'failed'
                    end
                )
                from "User_ApprovedPayment" uap
                join "Revolut_PaymentDraft" rpd on rpd.id = uap."revolutDraftId"
                where uap."networkOrderId" = o."id"
                limit 1
            )
            when exists(
                select 1
                from "User_ApprovedPayment" uap
                left join "Revolut_PaymentDraft" rpd on rpd.id = uap."revolutDraftId"
                where uap."networkOrderId" = o."id" and rpd.id is null
            ) then 'approved'
            else null
        end
    )`,
    )
    .where(`"id" = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_UpdateRakutenOrderAffiliateRefundStatus
const qUpdateRakutenOrderAffiliateRefundStatus = createUpdateQuery<Main>()
    .table(`"Network_Order" o`)
    .set(
        `"affiliateRefundStatus" = (
        case
            when o."manualAffiliateRefundStatus" is not null
                then o."manualAffiliateRefundStatus"
            when exists(
                select 1 from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
                and i."affiliateRefundStatus" = 'pending'
                limit 1
            ) then 'pending'
            when (
                exists (
                    select 1 from "Network_Order_Rakuten_Item" i
                    where i."orderId" = o."orderId"
                    and i."affiliateRefundStatus" = 'refunded'
                    limit 1
                )
                and
                (select count(*) from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId")
                =
                (select count(*) from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
                and i."affiliateRefundStatus" = 'refunded')
            ) then 'refunded'
            when exists(
                select 1 from "Network_Order_Rakuten_Item" i
                where i."orderId" = o."orderId"
                and (
                    i."affiliateRefundStatus" = 'partially-refunded'
                    or i."affiliateRefundStatus" = 'refunded'
                )
            ) then 'partially-refunded'
            else null
        end
    )`,
    )
    .where(`o."id" = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_UpdateRakutenItemPsePaymentStatus
const qUpdateRakutenItemPsePaymentStatus = createUpdateQuery<Main>()
    .table(`"Network_Order_Rakuten_Item" i`)
    .set(
        `"psePaymentStatus" = (
        case
            when i."manualPsePaymentStatus" is not null
                then i."manualPsePaymentStatus"
            when exists (
                select 1
                from "User_ApprovedPayment_Item" uapi
                join "User_ApprovedPayment" uap on uap."id" = uapi."userApprovedPaymentId"
                where uap."status" = 'paid'
                    and uapi."rakutenItemId" = i."id"
            ) then 'paid'
            when i."internalStatus" = 'rejected' then 'na'
            when i."commissionAmount" <= 0 then 'na'
            when not exists(
                select 1
                from "Network_Order" o
                join "LogProductClick" lpc on lpc.sid = o."clickId"
                where o."orderId" = i."orderId"
                    and (lpc."shopperId" is not null or
                        lpc."referenceUserId" is not null)
            ) then 'na'
            when not exists(
                select 1
                from "Network_Order" o
                where o."orderId" = i."orderId" and
                    (i."commissionAmount"
                        * o."pseCommissionRate") >= 0.1
            ) then 'na'
            else (
                select "psePaymentStatus"
                from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )`,
    )
    .where(`i."id" = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

// mirror of commerce queries.test.ts Q_UpdatePartnerizeItemInternalStatus
const qUpdatePartnerizeItemInternalStatus = createUpdateQuery<Main>()
    .table(`"Network_Order_Partnerize_Item" i`)
    .set(
        `"internalStatus" = (
        case
            when i."manualStatus" is not null then i."manualStatus"
            when i."saleAmount" <= 0 and i."commissionAmount" <= 0 then 'rejected'
            when i.status is not null
                and (i.status = 'pending'
                    or i.status = 'rejected'
                    or i.status = 'approved')
                then i.status
            else (
                select o."internalStatus" from "Network_Order" o
                where o."orderId" = i."orderId"
            )
        end
    )`,
    )
    .where(`i."id" = '00000000-0000-0000-0000-000000000000'`)
    .withParams({});

describe("commerce queries — UPDATE builders (large CASE/coalesce/subselect)", () => {
    it("qUpdateRakutenOrderAffiliatePaymentStatus assembles + starts/ends right", () => {
        const s = qUpdateRakutenOrderAffiliatePaymentStatus.toString();
        expect(s.startsWith(`update "Network_Order" o set`)).toBe(true);
        expect(s.endsWith(`'00000000-0000-0000-0000-000000000000'`)).toBe(true);
        expect(s).toContain(`"affiliatePaymentStatus" = (`);
        expect(s).toContain(`union all`);
    });

    it("qRecalcRakutenItem assembles", () => {
        const s = qRecalcRakutenItem.toString();
        expect(s.startsWith(`update "Network_Order_Rakuten_Item" i set`)).toBe(true);
        expect(s.endsWith(`where i.id = '00000000-0000-0000-0000-000000000000'`)).toBe(true);
        expect(s).toContain(`"grossSaleAmount" = coalesce(`);
    });

    it("qUpdateRakutenOrderValues assembles", () => {
        const s = qUpdateRakutenOrderValues.toString();
        expect(s.startsWith(`update "Network_Order" o set`)).toBe(true);
        expect(s).toContain(`where o."networkId" = 'rakuten' and o."orderId" = 'GB123'`);
    });

    it("qUpdateOrderBalance assembles", () => {
        const s = qUpdateOrderBalance.toString();
        expect(s.startsWith(`update "Network_Order" o set`)).toBe(true);
        expect(s).toContain(`"realPseBalance" = case`);
        expect(s.endsWith(`where o."id" = '00000000-0000-0000-0000-000000000000'`)).toBe(true);
    });

    it("qUpdateOrderInternalStatus assembles", () => {
        const s = qUpdateOrderInternalStatus.toString();
        expect(s.startsWith(`update "Network_Order" o set`)).toBe(true);
        expect(s).toContain(`"internalStatus" = (`);
    });

    it("qUpdateOrderPsePaymentStatus assembles", () => {
        const s = qUpdateOrderPsePaymentStatus.toString();
        expect(s.startsWith(`update "Network_Order" o set`)).toBe(true);
        expect(s).toContain(`"psePaymentStatus" =`);
    });

    it("qUpdateOrderRevolutPaymentStatus assembles", () => {
        const s = qUpdateOrderRevolutPaymentStatus.toString();
        expect(s.startsWith(`update "Network_Order" o set`)).toBe(true);
        expect(s).toContain(`"revolutPaymentStatus" = (`);
    });

    it("qUpdateRakutenOrderAffiliateRefundStatus assembles", () => {
        const s = qUpdateRakutenOrderAffiliateRefundStatus.toString();
        expect(s.startsWith(`update "Network_Order" o set`)).toBe(true);
        expect(s).toContain(`"affiliateRefundStatus" = (`);
    });

    it("qUpdateRakutenItemPsePaymentStatus assembles", () => {
        const s = qUpdateRakutenItemPsePaymentStatus.toString();
        expect(s.startsWith(`update "Network_Order_Rakuten_Item" i set`)).toBe(true);
        expect(s).toContain(`"psePaymentStatus" = (`);
    });

    it("qUpdatePartnerizeItemInternalStatus assembles", () => {
        const s = qUpdatePartnerizeItemInternalStatus.toString();
        expect(s.startsWith(`update "Network_Order_Partnerize_Item" i set`)).toBe(true);
        expect(s).toContain(`"internalStatus" = (`);
    });
});

// ===========================================================================
// DELETEs (createDeleteQuery)
// ===========================================================================

// mirror of commerce queries.test.ts Q_DeleteDeactivatedUsers
const qDeleteDeactivatedUsers = createDeleteQuery<Main>()
    .from(`"User"`)
    .where(`"enabled" = false`)
    .where(`"deactivatedAt" is not null`)
    .where(`"deactivatedAt" < :before`)
    .withParams({ before: "2024-01-01" });

// mirror of commerce queries.test.ts Q_DeleteRevolutDraft
const qDeleteRevolutDraft = createDeleteQuery<Main>()
    .from(`"Revolut_PaymentDraft"`)
    .where(`"id" = :id`)
    .withParams({ id: "d1" });

// mirror of commerce queries.test.ts Q_DeleteApprovedPayment
const qDeleteApprovedPayment = createDeleteQuery<Main>()
    .from(`"User_ApprovedPayment"`)
    .where(`id = :id`)
    .withParams({ id: "p1" });

describe("commerce queries — DELETE builders", () => {
    it("qDeleteDeactivatedUsers assembles", () => {
        expect(qDeleteDeactivatedUsers.toString()).toBe(
            `delete from "User" where "enabled" = false ` +
                `and "deactivatedAt" is not null and "deactivatedAt" < $1`,
        );
        expect([...qDeleteDeactivatedUsers.getParams()]).toEqual(["2024-01-01"]);
    });

    it("qDeleteRevolutDraft assembles", () => {
        expect(qDeleteRevolutDraft.toString()).toBe(
            `delete from "Revolut_PaymentDraft" where "id" = $1`,
        );
        expect([...qDeleteRevolutDraft.getParams()]).toEqual(["d1"]);
    });

    it("qDeleteApprovedPayment assembles", () => {
        expect(qDeleteApprovedPayment.toString()).toBe(
            `delete from "User_ApprovedPayment" where id = $1`,
        );
        expect([...qDeleteApprovedPayment.getParams()]).toEqual(["p1"]);
    });
});

// ===========================================================================
// createSql fallback (builder-inexpressible)
//   CTE/WITH, UNION, derived-table FROM, LATERAL, correlated array()/EXISTS.
// ===========================================================================

// mirror of commerce queries.test.ts Q_RakutenReturnDurations
// TODO(builder-api): derived-table FROM + correlated scalar subselects — fluent builder can't model this yet
const qRakutenReturnDurations = sqlMain(`
    select
    extract(day from max(return_duration))::int as max_duration,
    extract(day from avg(return_duration))::int as avg_duration
    from (
        select
        (
            (select max("processDate")
            from "Network_Order_Rakuten_Item_Snapshot"
            where "commissionAmount" < 0 and "rakutenItemId" = i.id)
            -
            (select min("processDate")
            from "Network_Order_Rakuten_Item_Snapshot"
            where "commissionAmount" > 0  and "rakutenItemId" = i.id)
        ) as return_duration
        from "Network_Order_Rakuten_Item" i
        where exists(
            select 1
            from "Network_Order_Rakuten_Item_Snapshot"
            where "commissionAmount" < 0 and "rakutenItemId" = i.id
        )
    ) as all_durations
`).withParams({});

// mirror of commerce queries.test.ts Q_RakutenReturnDurationsByAdvertiser
// TODO(builder-api): derived-table FROM + JOIN inside subquery + GROUP BY — fluent builder can't model this yet
const qRakutenReturnDurationsByAdvertiser = sqlMain(`
    select
    advertiser,
    extract(day from max(return_duration))::int as max_duration,
    extract(day from avg(return_duration))::int as avg_duration
    from (
        select
        o.advertiser,
        (
            (select max("processDate")
            from "Network_Order_Rakuten_Item_Snapshot"
            where "commissionAmount" < 0 and "rakutenItemId" = i.id)
            -
            (select min("processDate")
            from "Network_Order_Rakuten_Item_Snapshot"
            where "commissionAmount" > 0  and "rakutenItemId" = i.id)
        ) as return_duration
        from "Network_Order_Rakuten_Item" i
        join "Network_Order" o on o."orderId" = i."orderId"
        where exists(
            select 1
            from "Network_Order_Rakuten_Item_Snapshot"
            where "commissionAmount" < 0 and "rakutenItemId" = i.id
        )
    ) as all_durations
    group by advertiser
`).withParams({});

// mirror of commerce queries.test.ts Q_CjReturnDurations
// TODO(builder-api): WITH CTE + cross join lateral + derived-table FROM — fluent builder can't model this yet
const qCjReturnDurations = sqlMain(`
    with corrections as (
        select
        concat(o."orderId"::text, (item->>'sku')) as order_sku,
        o.advertiser,
        c."correctionDate" as correction_date,
        (item->>'quantity')::int as quantity
        from "Network_Order_Correction" c
        join "Network_Order" o on o."orderId" = c."orderId"
        cross join lateral json_array_elements((c.details::json)->'items') as item
    )
    select
        avg(return_duration)::int as avg_duration,
        max(return_duration)::int as max_duration
    from (
        select
        order_sku,
        extract(day from (
            (
                select max(correction_date)
                from corrections mc
                where mc.order_sku = corrections.order_sku and quantity < 0
            ) -
            (
                select min(correction_date)
                from corrections mc
                where mc.order_sku = corrections.order_sku and quantity > 0
            )
        ))::int as return_duration
        from corrections
        group by order_sku
    ) as dates
    where return_duration > 0
`).withParams({});

// mirror of commerce queries.test.ts Q_CjReturnDurationsByAdvertiser
// TODO(builder-api): WITH CTE + cross join lateral + derived-table FROM + GROUP BY — fluent builder can't model this yet
const qCjReturnDurationsByAdvertiser = sqlMain(`
    with corrections as (
        select
        concat(o."orderId"::text, (item->>'sku')) as order_sku,
        o.advertiser,
        c."correctionDate" as correction_date,
        (item->>'quantity')::int as quantity
        from "Network_Order_Correction" c
        join "Network_Order" o on o."orderId" = c."orderId"
        cross join lateral json_array_elements((c.details::json)->'items') as item
    )
    select
        advertiser,
        avg(return_duration)::int as avg_duration,
        max(return_duration)::int as max_duration
    from (
        select
        order_sku,
        (array_agg(advertiser))[1] as advertiser,
        extract(day from (
            (
                select max(correction_date)
                from corrections mc
                where mc.order_sku = corrections.order_sku and quantity < 0
            ) -
            (
                select min(correction_date)
                from corrections mc
                where mc.order_sku = corrections.order_sku and quantity > 0
            )
        ))::int as return_duration
        from corrections
        group by order_sku
    ) as dates
    where return_duration > 0
    group by advertiser
`).withParams({});

// mirror of commerce queries.test.ts Q_PartnerizeReturnDurations
// TODO(builder-api): WITH CTE + UNION + cross join lateral — fluent builder can't model this yet
const qPartnerizeReturnDurations = sqlMain(`
    with events as (
        select
        item->>'conversion_item_id' as item_id,
        cast(item->>'last_update' as timestamptz) as event_date,
        item->>'item_status' as status
        from "Network_Order"
        cross join lateral json_array_elements((details::json)->'conversion_items') as item
        where "networkId" = 'partnerize'

        union

        select
        item->>'conversion_item_id' as item_id,
        cast(item->>'last_update' as timestamptz) as event_date,
        item->>'item_status' as status
        from "Network_Order_Snapshot"
        cross join lateral json_array_elements((details::json)->'conversion_items') as item
        where "networkId" = 'partnerize'
    ),
    return_durations as (
        select
        distinct item_id,
        extract(day from (
            (
                select min(sub.event_date)
                from events sub
                where sub.item_id = e.item_id and sub.status = 'rejected'
            )
            -
            (
                select min(sub.event_date)
                from events sub
                where sub.item_id = e.item_id and (sub.status = 'pending' or sub.status = 'approved')
            )
        )) as return_duration
        from events e
    )
    select
    avg(return_duration)::int as avg_duration,
    max(return_duration)::int as max_duration
    from return_durations
    where return_duration is not null
`).withParams({});

// mirror of commerce queries.test.ts Q_PartnerizeReturnDurationsByAdvertiser
// TODO(builder-api): WITH CTE + UNION + JOIN + cross join lateral + GROUP BY — fluent builder can't model this yet
const qPartnerizeReturnDurationsByAdvertiser = sqlMain(`
    with events as (
        select
        advertiser,
        item->>'conversion_item_id' as item_id,
        cast(item->>'last_update' as timestamptz) as event_date,
        item->>'item_status' as status
        from "Network_Order"
        cross join lateral json_array_elements((details::json)->'conversion_items') as item
        where "networkId" = 'partnerize'

        union

        select
        o.advertiser,
        item->>'conversion_item_id' as item_id,
        cast(item->>'last_update' as timestamptz) as event_date,
        item->>'item_status' as status
        from "Network_Order_Snapshot" s
        join "Network_Order" o on o."orderId" = s."orderId"
        cross join lateral json_array_elements((s.details::json)->'conversion_items') as item
        where s."networkId" = 'partnerize'
    ),
    return_durations as (
        select
        distinct item_id,
        advertiser,
        extract(day from (
            (
                select min(sub.event_date)
                from events sub
                where sub.item_id = e.item_id and sub.status = 'rejected'
            )
            -
            (
                select min(sub.event_date)
                from events sub
                where sub.item_id = e.item_id and (sub.status = 'pending' or sub.status = 'approved')
            )
        )) as return_duration
        from events e
    )
    select
    advertiser,
    avg(return_duration)::int as avg_duration,
    max(return_duration)::int as max_duration
    from return_durations
    where return_duration is not null
    group by advertiser
`).withParams({});

// mirror of commerce queries.test.ts Q_PseRawStatsStaticExpansion
// TODO(builder-api): correlated scalar subselects + array() subquery in projection — fluent builder can't model this yet
const qPseRawStatsStaticExpansion = sqlMain(`
    select
        u.id,
        u.email,
        u.phone,
        u.groups,
        u."createdAt",
        u."firstLoggedIn",
        u."lastLoggedIn",
        u."givenName",
        u."familyName",

        (
            select count(*)
            from "Look" look
            where look."friId" = u.id
                and look."publishedAt" is not null
                and look."createdAt" between :from and :to
        ) as "looks",

        (
            select count(*)
            from "Link" link
            where link."referenceUserId" = u.id
                and link."createdAt" between :from and :to
        ) as "links",

        (
            select count(*)
            from "LogProductClick" lpc
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id
                and lpc."createdAt" between :from and :to
        ) as "orders",

        array(
            select
                cu."givenName" || ' ' || cu."familyName"
            from "Chat_Participant" cp
            inner join "User" cu on cu."id" = cp."userId"
            where cp."userId" != u.id
                and cp."chatId" in (
                    select distinct cp1."chatId" from "Chat_Participant" cp1
                    where cp1."userId" = u.id
                )
        ) as "connections"

    from "User" u
    where (
        "groups" like '%GPS%' or
        "groups" like '%FRI%' or
        "groups" like '%Contributor%'
    )
`).withParams({ from: "2024-01-01", to: "2024-02-01" });

// mirror of commerce queries.test.ts Q_PseRawStatsFullStaticExpansion
// TODO(builder-api): many correlated scalar subselects + json_build_object + array() subquery — fluent builder can't model this yet
const qPseRawStatsFullStaticExpansion = sqlMain(`
    select
        u.id,
        u.email,
        u.phone,
        u.groups,
        u."createdAt",
        u."firstLoggedIn",
        u."lastLoggedIn",
        u."givenName",
        u."familyName",

        (
            select count(*)
            from "Look" look
            where look."friId" = u.id
                and look."publishedAt" is not null
                and look."createdAt" between :from and :to
        ) as "looks",

        (
            select count(*)
            from "Link" link
            where link."referenceUserId" = u.id
                and link."createdAt" between :from and :to
        ) as "links",

        (
            select count(*)
            from "Consultation" c
            where c."friId" = u.id
                and c."createdAt" between :from and :to
        ) as "consultations",

        (
            select count(*)
            from "Moodboard" m
            where m."friId" = u.id
                and m."createdAt" between :from and :to
        ) as "moodboards",

        (
            select count(*)
            from "LogProductClick" lpc
            where lpc."shopperId" = u.id
                and lpc."createdAt" between :from and :to
        ) as "clicks",

        (
            select count(*)
            from "LogProductClick" lpc
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id
                and lpc."createdAt" between :from and :to
        ) as "orders",

        (
            select count(*)
            from "LogProductClick" lpc
            where lpc."shopperId" = u.id and lpc."linkId" is not null
                and lpc."createdAt" between :from and :to
        ) as "linkClicks",

        (
            select count(*)
            from "LogProductClick" lpc
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id and lpc."linkId" is not null
                and lpc."createdAt" between :from and :to
        ) as "linkOrders",

        (
            select count(*)
            from "LogProductClick" lpc
            where lpc."shopperId" = u.id and lpc."productId" is not null
                and lpc."createdAt" between :from and :to
        ) as "lookClicks",

        (
            select count(*)
            from "LogProductClick" lpc
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id and lpc."productId" is not null
                and lpc."createdAt" between :from and :to
        ) as "lookOrders",

        (
            select count(*)
            from "LogProductClick" lpc
            where lpc."shopperId" = u.id and lpc."moodboardId" is not null
                and lpc."createdAt" between :from and :to
        ) as "moodboardClicks",

        (
            select count(*)
            from "LogProductClick" lpc
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id and lpc."moodboardId" is not null
                and lpc."createdAt" between :from and :to
        ) as "moodboardOrders",

        (
            select
                json_build_object(
                    'currency',
                    'GBP',
                    'grossSaleAmount',
                    coalesce(sum(
                        convert_currency(
                            ordr."grossSaleAmount"::numeric,
                            ordr.currency,
                            'GBP'::text,
                            ordr."orderDate"::date
                        )
                    ), 0),
                    'avgGrossSaleAmount',
                    coalesce(avg(
                        convert_currency(
                            ordr."grossSaleAmount"::numeric,
                            ordr.currency,
                            'GBP'::text,
                            ordr."orderDate"::date
                        )
                    ), 0),
                    'saleAmount',
                    coalesce(sum(
                        convert_currency(
                            ordr."saleAmount"::numeric,
                            ordr.currency,
                            'GBP'::text,
                            ordr."orderDate"::date
                        )
                    ), 0),
                    'avgSaleAmount',
                    coalesce(avg(
                        convert_currency(
                            ordr."saleAmount"::numeric,
                            ordr.currency,
                            'GBP'::text,
                            ordr."orderDate"::date
                        )
                    ), 0),
                    'grossCommissionAmount',
                    coalesce(sum(
                        convert_currency(
                            ordr."grossCommissionAmount"::numeric,
                            ordr.currency,
                            'GBP'::text,
                            ordr."orderDate"::date
                        )
                    ), 0),
                    'avgGrossCommissionAmount',
                    coalesce(avg(
                        convert_currency(
                            ordr."grossCommissionAmount"::numeric,
                            ordr.currency,
                            'GBP'::text,
                            ordr."orderDate"::date
                        )
                    ), 0),
                    'commissionAmount',
                    coalesce(sum(
                        convert_currency(
                            ordr."commissionAmount"::numeric,
                            ordr.currency,
                            'GBP'::text,
                            ordr."orderDate"::date
                        )
                    ), 0),
                    'avgCommissionAmount',
                    coalesce(avg(
                        convert_currency(
                            ordr."commissionAmount"::numeric,
                            ordr.currency,
                            'GBP'::text,
                            ordr."orderDate"::date
                        )
                    ), 0),
                    'grossItemsCount',
                    coalesce(sum(ordr."grossItemsCount"),  0),
                    'avgGrossItemsCount',
                    coalesce(avg(ordr."grossItemsCount"),  0),
                    'itemsCount',
                    coalesce(sum("itemsCount"),  0),
                    'avgItemsCount',
                    coalesce(avg("itemsCount"),  0),
                    'cancelledItemsCount',
                    coalesce(sum(ordr."cancelledItemsCount"), 0),
                    'avgCancelledItemsCount',
                    coalesce(avg(ordr."cancelledItemsCount"), 0)
                )
            from "LogProductClick" lpc
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id
                and lpc."createdAt" between :from and :to
        ) as "orderSums",

        array(
            select
                cu."givenName" || ' ' || cu."familyName"
            from "Chat_Participant" cp
            inner join "User" cu on cu."id" = cp."userId"
            where cp."userId" != u.id
                and cp."chatId" in (
                    select distinct cp1."chatId" from "Chat_Participant" cp1
                    where cp1."userId" = u.id
                )
        ) as "connections"

    from "User" u
    where (
        "groups" like '%GPS%' or
        "groups" like '%FRI%' or
        "groups" like '%Contributor%'
    )
`).withParams({ from: "2024-01-01", to: "2024-02-01" });

// mirror of commerce queries.test.ts Q_ApprovedPseCycleStats
// TODO(builder-api): extract(epoch from ...) aggregate projections over multi-join — fluent builder can't model this byte-faithfully
const qApprovedPseCycleStats = sqlMain(`
    select
    count(*) as cnt,
    extract(epoch from min(u."firstLoggedIn" - pa."createdAt")) / 86400 as "loginCycleMin",
    extract(epoch from avg(u."firstLoggedIn" - pa."createdAt")) / 86400 as "loginCycleAvg",
    extract(epoch from max(u."firstLoggedIn" - pa."createdAt")) / 86400 as "loginCycleMax",
    count(u."firstLoggedIn") as "loginCycleCnt",

    extract(epoch from min(ua."pushFirstEnabledAt" - pa."createdAt")) / 86400 as "firstPushCycleMin",
    extract(epoch from max(ua."pushFirstEnabledAt" - pa."createdAt")) / 86400 as "firstPushCycleMax",
    extract(epoch from avg(ua."pushFirstEnabledAt" - pa."createdAt")) / 86400 as "firstPushCycleAvg",
    count(ua."pushFirstEnabledAt") as "firstPushCycleCnt",

    extract(epoch from min(ua."bankDetailsFirstAddedAt" - pa."createdAt")) / 86400 as "firstBankDetailsCycleMin",
    extract(epoch from max(ua."bankDetailsFirstAddedAt" - pa."createdAt")) / 86400 as "firstBankDetailsCycleMax",
    extract(epoch from avg(ua."bankDetailsFirstAddedAt" - pa."createdAt")) / 86400 as "firstBankDetailsCycleAvg",
    count(ua."bankDetailsFirstAddedAt") as "firstBankDetailsCycleCnt"

    from "User" u
    join "PSEApplication" pa on pa."userId" = u."id"
    join "User_Analytics" ua on ua."userId" = u."id"
    where (u."groups" like '%GPS%' or u."groups" like '%FRI%') and
            u."firstLoggedIn" is not null
`).withParams({});

// mirror of commerce queries.test.ts Q_TeamPseInfo
// TODO(builder-api): multi-join SELECT with positional + materialized casts — kept as raw for byte fidelity
const qTeamPseInfo = sqlMain(`
    select
        pse."id" as "pseId",
        (pse."givenName" || ' ' || pse."familyName")::text as "pseName",
        pse."givenName" as "pseGivenName",
        pse."familyName" as "pseFamilyName",
        pse.avatar,
        tm."teamRoleId" as "teamRoleId",
        tr."name" as "teamRole",
        convert_currency(
            tms."annualSalesTarget"::numeric,
            tms."currency"::text,
            :currency::text,
            current_date
        )::float8 as "annualSalesTarget",
        convert_currency(
            tms."monthlySalesTarget"::numeric,
            tms."currency"::text,
            :currency::text,
            current_date
        )::float8 as "monthlySalesTarget",
        tms."currency" as "targetCurrency"
    from "Team_Member" tm
    join "User" pse on pse."id" = tm."userId"
    left join "Team_Member_SalesTarget" tms on tms."teamId" = tm."teamId" and tms."pseId" = pse."id"
    left join "Team_Role" tr on tr."id" = tm."teamRoleId"
    where tm."teamId" = :teamId
`).withParams({ currency: "GBP", teamId: "t1" });

// mirror of commerce queries.test.ts Q_PersonalUpcomingInvoiceItems
// TODO(builder-api): UNION ALL of two multi-join SELECTs + order by — fluent builder can't model this yet
const qPersonalUpcomingInvoiceItems = sqlMain(`
    select
        uapi.id,
        uapi.amount,
        uapi.vat,
        uapi.currency,
        uap."createdAt",
        coalesce(ri.sku, ci.sku, pi.sku)::text as "sku",
        coalesce(ri.product, pi.name)::text as "name",
        o."advertiser" as "retailer",
        o."orderId",
        o."orderDate"
    from "User_ApprovedPayment_Item" uapi
    join "User_ApprovedPayment" uap on uap."id" = uapi."userApprovedPaymentId"
    join "Network_Order" o on o."id" = uap."networkOrderId"
    join "LogProductClick" click on click.sid = o."clickId"
    left join "Network_Order_Rakuten_Item" ri on ri."id" = uapi."rakutenItemId"
    left join "Network_Order_CJ_Item" ci on ci."id" = uapi."cjItemId"
    left join "Network_Order_Partnerize_Item" pi on pi."id" = uapi."partnerizeItemId"
    where uap."userId" = :userId
        and uap."paid" = false
        and uap."status" in ('approved', 're-approved', 'created', 'pending')
        and click."teamId" is null

    union all

    select
        uap.id,
        uap.amount,
        uap.vat,
        uap.currency,
        uap."createdAt",
        null::text as "sku",
        uap.comment as "name",
        ''::text as "retailer",
        null::text as "orderId",
        null::timestamptz as "orderDate"
    from "User_ApprovedPayment" uap
    where uap."userId" = :userId2
        and uap."paid" = false
        and uap."status" in ('approved', 're-approved', 'created', 'pending')
        and uap."networkOrderId" is null

    order by "createdAt" desc
`).withParams({ userId: "u1", userId2: "u1" });

// mirror of commerce queries.test.ts Q_TeamUpcomingInvoiceItems
// TODO(builder-api): coalesce-heavy multi-left-join SELECT with nullif/trim — kept as raw for byte fidelity
const qTeamUpcomingInvoiceItems = sqlMain(`
    select
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
        coalesce(
            nullif(trim(u."givenName" || ' ' || u."familyName"), ''),
            'Team Payment'
        )::text as "pseName"
    from "User_ApprovedPayment" uap
    left join "User_ApprovedPayment_Item" uapi
        on uapi."userApprovedPaymentId" = uap."id"
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
    order by "pseName", uap."createdAt" desc
`).withParams({ teamId: "t1", userId: "u1" });

// mirror of commerce queries.test.ts Q_PsePaymentsTeamSummary
// TODO(builder-api): bool_and/array_agg/count(distinct) aggregates over left-lateral joins — fluent builder can't model this yet
const qPsePaymentsTeamSummary = sqlMain(`
    select
        null::uuid as "pseId",
        null::text as "pseName",
        'GBP'::text as "currency",
        (
            bool_and(
                case
                    when uap."revolutDraftId" is not null then true
                    else (
                        rc."id" is not null or coalesce(
                            rpd."teamId",
                            case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end
                        ) is not null
                    )
                end
            )
            and count(distinct (
                case
                    when uap."revolutDraftId" is not null then
                        case
                            when rpd."teamId" is not null then 'draft:team:' || rpd."teamId"::text
                            else 'draft:user'
                        end
                    when coalesce(
                        rpd."teamId",
                        case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end
                    ) is not null then 'team:' || coalesce(
                        rpd."teamId",
                        case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end
                    )::text
                    when rc."id" is not null then 'user'
                    else null
                end
            )) = 1
        )::boolean as "hasBankDetails",
        (
            count(distinct coalesce(
                rpd."teamId",
                case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end
            )) = 1
            and (array_agg(coalesce(
                rpd."teamId",
                case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end
            )))[1] is not null
        )::boolean as "hasTeamBankDetails",
        ((
            case
                when count(distinct coalesce(
                    rpd."teamId",
                    uap."teamId",
                    case when utm."teamMemberCount" = 1 then utm."teamId" else null end
                )) = 1
                then (array_agg(coalesce(
                    dt."name",
                    uapt."name",
                    case when utm."teamMemberCount" = 1 then utm."teamName" else null end
                )))[1]::text
                else null
            end
        )::text) as "teamName",
        (
            case
                when count(distinct coalesce(
                    rpd."teamId",
                    uap."teamId",
                    case when utm."teamMemberCount" = 1 then utm."teamId" else null end
                )) = 1
                then (array_agg(coalesce(
                    rpd."teamId",
                    uap."teamId",
                    case when utm."teamMemberCount" = 1 then utm."teamId" else null end
                )))[1]::text
                else null
            end
        ) as "teamId",
        (array_agg(uap."id"))::text[] as "approvedPaymentIds",
        sum(convert_currency(
            (uap."amount")::numeric,
            uap."currency",
            'GBP'::text,
            uap."createdAt"::date
        ))::float8 as "amount",
        sum(convert_currency(
            (uap."vat")::numeric,
            uap."currency",
            'GBP'::text,
            uap."createdAt"::date
        ))::float8 as "vat",
        sum(convert_currency(
            (uap."amount" + uap."vat")::numeric,
            uap."currency",
            'GBP'::text,
            uap."createdAt"::date
        ))::float8 as "total"
    from "User_ApprovedPayment" uap
    left join "User" pse on pse.id = uap."userId"
    left join "Revolut_Counterparty" rc on rc."userId" = uap."userId"
    left join "Revolut_PaymentDraft" rpd on rpd."id" = uap."revolutDraftId"
    left join "Team" dt on dt."id" = rpd."teamId"
    left join "Team" uapt on uapt."id" = uap."teamId"
    left join lateral (
        select
            count(*)::int as "teamCounterpartyCount",
            (array_agg(tm."teamId"))[1]::uuid as "teamId",
            (array_agg(t."name"))[1]::text as "teamName"
        from "Team_Member" tm
        join "Team_Revolut_Counterparty" trc on trc."teamId" = tm."teamId"
        join "Team" t on t."id" = tm."teamId"
        where tm."userId" = uap."userId"
          and tm."disabled" = false
    ) utc on true
    left join lateral (
        select
            count(*)::int as "teamMemberCount",
            (array_agg(tm2."teamId"))[1]::uuid as "teamId",
            (array_agg(t2."name"))[1]::text as "teamName"
        from "Team_Member" tm2
        join "Team" t2 on t2."id" = tm2."teamId"
        where tm2."userId" = uap."userId"
          and tm2."disabled" = false
    ) utm on true
    where rpd."userId" is null and rpd."teamId" is not null
    group by rpd."teamId", dt."name"
`).withParams({});

// mirror of commerce queries.test.ts Q_OrderLateReturnRollup
// TODO(builder-api): nested EXISTS rollup projection + WHERE NOT(...) — fluent builder can't model this yet
const qOrderLateReturnRollup = sqlMain(`
    select
        ordr."id",
        (
            exists (
                select 1 from "Network_Order_Rakuten_Item" ri
                where ri."orderId" = ordr."orderId"
                    and (
                        ri."pseBalance" < -0.1
                        or exists (
                            select 1 from "User_ApprovedPayment_Item" uapi
                            where uapi."anyItemId" = ri."id"
                                and uapi."amount" < 0
                        )
                    )
            )
            or exists (
                select 1 from "Network_Order_CJ_Item" ci
                where ci."orderId" = ordr."orderId"
                    and (
                        ci."pseBalance" < -0.1
                        or exists (
                            select 1 from "User_ApprovedPayment_Item" uapi
                            where uapi."anyItemId" = ci."id"
                                and uapi."amount" < 0
                        )
                    )
            )
            or exists (
                select 1 from "Network_Order_Partnerize_Item" pi
                where pi."orderId" = ordr."orderId"
                    and (
                        pi."pseBalance" < -0.1
                        or exists (
                            select 1 from "User_ApprovedPayment_Item" uapi
                            where uapi."anyItemId" = pi."id"
                                and uapi."amount" < 0
                        )
                    )
            )
        )::boolean as "lateReturn"
    from "Network_Order" ordr
    where not (
        exists (
            select 1 from "Network_Order_Rakuten_Item" ri
            where ri."orderId" = ordr."orderId" and ri."pseBalance" < -0.1
        )
        or exists (
            select 1 from "Network_Order_CJ_Item" ci
            where ci."orderId" = ordr."orderId" and ci."pseBalance" < -0.1
        )
        or exists (
            select 1 from "Network_Order_Partnerize_Item" pi
            where pi."orderId" = ordr."orderId" and pi."pseBalance" < -0.1
        )
    )
    order by ordr."orderDate" desc
`).withParams({});

// mirror of commerce queries.test.ts Q_PseAwaitingByTeamRollup
// TODO(builder-api): coalesce GROUP BY + aggregate ORDER BY over multi-left-join — kept as raw for byte fidelity
const qPseAwaitingByTeamRollup = sqlMain(`
    select
        coalesce(uap."teamId", click."teamId") as "teamId",
        t."name" as "teamName",
        count(distinct uap."userId")::int as "pseCount",
        count(uap.id)::int as "uapCount",
        sum(
            convert_currency(
                uap."amount"::numeric,
                uap."currency",
                'GBP'::text,
                current_date
            )
        )::float8 as "amount",
        sum(
            convert_currency(
                uap."vat"::numeric,
                uap."currency",
                'GBP'::text,
                current_date
            )
        )::float8 as "vat",
        sum(
            convert_currency(
                (uap."amount" + uap."vat")::numeric,
                uap."currency",
                'GBP'::text,
                current_date
            )
        )::float8 as "total",
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
    order by sum(
        convert_currency(
            uap."amount"::numeric,
            uap."currency",
            'GBP'::text,
            current_date
        )
    ) desc
`).withParams({ teamId: "t1" });

// mirror of commerce queries.test.ts Q_FetchOrdersStaticExpansion
// TODO(builder-api): wide multi-left-join SELECT + nested EXISTS/CASE + IN-list — kept as raw for byte fidelity
const qFetchOrdersStaticExpansion = sqlMain(`
    select
        ordr."id",
        ordr."orderId",
        ordr."orderDate",
        ordr."rawOrderId",
        ordr."grossSaleAmount"::float8 as "grossSaleAmount",
        convert_currency(
            (ordr."grossSaleAmount")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "grossSaleAmountGBP",
        ordr."status" as "affiliateStatus",
        ordr."clickId",
        click."shopperId",
        pse."givenName" as "pseGivenName",
        "link"."hash" as "linkHash",
        (
            case when ordr."commissionAmount" > 0 and ordr."saleAmount" > 0
                then ordr."commissionAmount" / ordr."saleAmount"
            else null
            end
        ) as "retailerCommissionRateEffective"
    from "Network_Order" ordr
    left join "LogProductClick" click on click."sid" = ordr."clickId"
    left join "User" pse on pse."id" = click."shopperId"
    left join "Revolut_Counterparty" "revolutCounterparty"
        on "revolutCounterparty"."userId" = click."userId"
    left join "Link" "link" on "link"."id" = click."linkId"
    left join "User_PaymentSettings" "psePaymentSettings"
        on "psePaymentSettings"."userId" = click."shopperId"
    left join "Team_PaymentSettings" "teamPaymentSettings"
        on "teamPaymentSettings"."teamId" = click."teamId"
    left join "User" customer on customer."id" = click."userId"
    left join "Product" "clickProduct" on "clickProduct"."id" = click."productId"
    left join "Catalogue_ProductReference" "clickProductReference"
        on "clickProductReference"."id" = "clickProduct"."productReferenceId"
    left join "Look" "clickProductLook" on "clickProductLook"."id" = "clickProduct"."lookId"
    where ordr.id in (:id1, :id2)
    order by ordr."orderDate" desc
`).withParams({ id1: "o1", id2: "o2" });

// mirror of commerce queries.test.ts Q_FetchOrdersGroupedTeamStaticExpansion
// TODO(builder-api): aggregate rollup with CASE-weighted sums + GROUP BY + aggregate ORDER BY — kept as raw
const qFetchOrdersGroupedTeamStaticExpansion = sqlMain(`
    select
        sum(convert_currency(
            ordr."grossSaleAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "grossSaleAmount",
        sum(convert_currency(
            ordr."commissionAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "commissionAmount",
        count(distinct ordr."id") as "count",
        count(distinct click."shopperId") as "pseCount",
        click."teamId" as "group",
        (array_agg(team."name"))[1] as "groupLabel"
    from "Network_Order" ordr
    left join "LogProductClick" click on click."sid" = ordr."clickId"
    left join "User_PaymentSettings" "psePaymentSettings"
        on "psePaymentSettings"."userId" = click."shopperId"
    left join "Team_PaymentSettings" "teamPaymentSettings"
        on "teamPaymentSettings"."teamId" = click."teamId"
    inner join "Team" team on team."id" = click."teamId"
    group by click."teamId"
    order by sum(convert_currency(
        ordr."commissionAmount"::numeric,
        ordr."currency",
        'GBP'::text,
        ordr."orderDate"::date
    )) desc
`).withParams({});

// mirror of commerce queries.test.ts Q_FetchRevolutPaymentsStaticExpansion
// TODO(builder-api): SELECT rpd.* + computed projections over left joins — kept as raw for byte fidelity
const qFetchRevolutPaymentsStaticExpansion = sqlMain(`
    select
        rpd.*,
        rpd."amount" + rpd."vat" as "total",
        pse."givenName" || ' ' || pse."familyName" as "pseName",
        rpi."id" as "invoiceId"
    from "Revolut_PaymentDraft" rpd
    left join "User" pse on pse.id = rpd."userId"
    left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id"
    where rpd."createdAt" between :from and :to
    order by rpd."createdAt" desc
`).withParams({ from: "2024-01-01", to: "2024-02-01" });

// mirror of commerce queries.test.ts Q_FetchClicksStaticExpansion
// TODO(builder-api): wide coalesce/CASE projection over many left joins — kept as raw for byte fidelity
const qFetchClicksStaticExpansion = sqlMain(`
    select
        lpc.id,
        lpc.sid,
        lpc."createdAt",
        lpc."shopperId",
        lpc."userId" as "customerId",
        (
            case
                when lpc."moodboardId" is not null then 'moodboard'
                when lpc."productId" is not null then 'styling'
                when lpc."linkId" is not null then 'link'
                when lpc."catalogueProductId" is not null then 'catalogue'
                else null
            end
        ) as "sourceType",
        coalesce(lpc."productId", link."lookProductId") as "lookProductId",
        coalesce(product."lookId", "linkProduct"."lookId") as "lookId",
        pse."givenName" as "pseGivenName",
        link."hash" as "linkHash"
    from "LogProductClick" lpc
    left join "User" pse on pse."id" = lpc."shopperId"
    left join "User" customer on customer."id" = lpc."userId"
    left join "Product" product on product."id" = lpc."productId"
    left join "Look" look on look."id" = product."lookId"
    left join "Moodboard" moodboard on moodboard."id" = lpc."moodboardId"
    left join "Link" link on link."id" = lpc."linkId"
    left join "Product" "linkProduct" on "linkProduct"."id" = link."lookProductId"
    where lpc."isBot" = false
    order by lpc."createdAt" desc
`).withParams({});

// mirror of commerce queries.test.ts Q_AllocateNaInvoiceSettlementsWrite
// TODO(builder-api): WITH RECURSIVE + advisory-lock CTE + writable CTE (insert ... returning) — fluent builder can't model this yet
const qAllocateNaInvoiceSettlementsWrite = sqlMain(`
    with recursive
        params as (
            select
                :settlingInvoiceId::text as settling_invoice_id,
                :advertiserId::integer as advertiser_id,
                :currencyCode::text as currency_code,
                :referenceDate::date as reference_date,
                :settlingInvoiceDate::date as settling_invoice_date,
                :settlementDate::date as settlement_date,
                :carryForwardRaw::numeric(18, 6) as carry_forward_raw
        ),
        lock_scope as (
            select pg_advisory_xact_lock(
                (select advertiser_id from params),
                hashtext((select currency_code from params))
            )
        ),
        settler_capacity as (
            select
                abs(least(p.carry_forward_raw, 0))::numeric(18, 6)
                    as capacity
            from params p
            cross join lock_scope
        ),
        existing_settler_allocations as (
            select
                coalesce(sum(s."allocatedAmount"), 0)::numeric(18, 6)
                    as already_allocated
            from "Network_Rakuten_Invoice_Settlement" s
            join params p on true
            where s."settlingInvoiceId" = p.settling_invoice_id
        ),
        settling_capacity as (
            select
                greatest(c.capacity - e.already_allocated, 0)::numeric(18, 6)
                    as remaining_capacity
            from settler_capacity c
            cross join existing_settler_allocations e
        ),
        candidate_na_invoices as (
            select
                na."invoiceId" as na_invoice_id,
                na."invoiceDate" as na_invoice_date,
                greatest(
                    abs(least(
                        (
                            na."transactionCommissions"
                            + na."bonusAmount"
                            + na."cpmCpcCommissions"
                            + na."cancelledCommissions"
                            + na."previouslyHeldCommissions"
                        ),
                        0
                    ))
                    - abs(least(na."previouslyHeldCommissions", 0)),
                    0
                )::numeric(18, 6) as na_target_amount,
                coalesce(sum(s."allocatedAmount"), 0)::numeric(18, 6)
                    as already_allocated
            from "Network_Payment_Invoice_Rakuten" na
            join "Network_Payment_Rakuten" npr on npr."paymentId" = na."paymentId"
            join params p on true
            left join "Network_Rakuten_Invoice_Settlement" s
                on s."naInvoiceId" = na."invoiceId"
            where
                na."advertiserId" = p.advertiser_id
                and npr."currency" = p.currency_code
                and npr."paymentStatus" = 'N/A'
                and (
                    p.reference_date is null
                    or na."invoiceDate" is null
                    or na."invoiceDate" <= p.reference_date
                )
            group by
                na."invoiceId",
                na."invoiceDate",
                na."transactionCommissions",
                na."bonusAmount",
                na."cpmCpcCommissions",
                na."cancelledCommissions",
                na."previouslyHeldCommissions"
        ),
        na_outstanding_invoices as (
            select
                row_number() over (
                    order by
                        c.na_invoice_date asc nulls last,
                        c.na_invoice_id asc
                ) as seq,
                c.na_invoice_id,
                c.na_invoice_date,
                greatest(c.na_target_amount - c.already_allocated, 0)
                    ::numeric(18, 6) as na_outstanding
            from candidate_na_invoices c
            where greatest(c.na_target_amount - c.already_allocated, 0) > 0
        ),
        recursive_allocations as (
            select
                n.seq,
                n.na_invoice_id,
                n.na_invoice_date,
                least(cap.remaining_capacity, n.na_outstanding)
                    ::numeric(18, 6) as allocated_amount,
                greatest(cap.remaining_capacity - n.na_outstanding, 0)
                    ::numeric(18, 6) as remaining_after
            from na_outstanding_invoices n
            cross join settling_capacity cap
            where n.seq = 1 and cap.remaining_capacity > 0

            union all

            select
                n.seq,
                n.na_invoice_id,
                n.na_invoice_date,
                least(r.remaining_after, n.na_outstanding)
                    ::numeric(18, 6) as allocated_amount,
                greatest(r.remaining_after - n.na_outstanding, 0)
                    ::numeric(18, 6) as remaining_after
            from recursive_allocations r
            join na_outstanding_invoices n on n.seq = r.seq + 1
            where r.remaining_after > 0
        ),
        final_allocations as (
            select
                r.na_invoice_id,
                r.na_invoice_date,
                r.allocated_amount
            from recursive_allocations r
            where r.allocated_amount > 0
        ),
        upserted_allocations as (
            insert into "Network_Rakuten_Invoice_Settlement" (
                "naInvoiceId",
                "settlingInvoiceId",
                "advertiserId",
                "currency",
                "allocatedAmount",
                "naInvoiceDate",
                "settlingInvoiceDate",
                "settlementDate"
            )
            select
                f.na_invoice_id,
                p.settling_invoice_id,
                p.advertiser_id,
                p.currency_code,
                f.allocated_amount,
                f.na_invoice_date,
                p.settling_invoice_date,
                p.settlement_date
            from final_allocations f
            join params p on true
            on conflict ("naInvoiceId", "settlingInvoiceId")
            do update set
                "allocatedAmount" = excluded."allocatedAmount",
                "settlementDate" = excluded."settlementDate",
                "naInvoiceDate" = excluded."naInvoiceDate",
                "settlingInvoiceDate" = excluded."settlingInvoiceDate",
                "advertiserId" = excluded."advertiserId",
                "currency" = excluded."currency"
            returning "naInvoiceId", "allocatedAmount"
        ),
        allocation_totals as (
            select
                array_agg(u."naInvoiceId" order by u."naInvoiceId")
                    as affected_na_invoice_ids,
                count(*)::integer as rows_allocated,
                coalesce(sum(u."allocatedAmount"), 0)::numeric(18, 6)
                    as total_allocated
            from upserted_allocations u
        )
    select
        coalesce(t.affected_na_invoice_ids, '{}'::text[])
            as "affectedNaInvoiceIds",
        coalesce(t.rows_allocated, 0)::integer as "rowsAllocated",
        coalesce(t.total_allocated, 0)::numeric(18, 6) as "totalAllocated",
        greatest(
            cap.remaining_capacity - coalesce(t.total_allocated, 0),
            0
        )::numeric(18, 6) as "leftoverCarryForward"
    from settling_capacity cap
    left join allocation_totals t on true
`).withParams({
    settlingInvoiceId: "inv1",
    advertiserId: 1,
    currencyCode: "GBP",
    referenceDate: "2024-01-01",
    settlingInvoiceDate: "2024-01-01",
    settlementDate: "2024-01-02",
    carryForwardRaw: "-100",
});

// mirror of commerce queries.test.ts Q_UpdateRetailerWeight
// TODO(builder-api): WITH CTE chain feeding UPDATE ... FROM — fluent builder can't model this yet
const qUpdateRetailerWeight = sqlCat(`
    with rs as (
        select
        r.id,
        (
            select count(*) as r_count
            from product_search
            where tags @> array['retailer/'||r.id]
                and new_in_at >= now() - interval '1 week'
        )
        from retailer r
    ),
    total as (
        select sum(r_count) as total_count from rs
    ),
    relative as (
        select
        rs.id, rs.r_count,
        rs.r_count / total.total_count as rel_count,
        (
            (((rs.r_count / total.total_count) - 0) / (1 - 0)) *
            (1 - 0.5) +
            0.5
        ) as interpolated_count
        from rs
        join total on true
    )
    update retailer
    set new_in_weight = 1 - relative.interpolated_count
    from relative
    where retailer.id = relative.id
`).withParams({});

// mirror of commerce queries.test.ts Q_UpdateRakutenItemBalanceWithAdvisoryLock
// TODO(builder-api): materialized advisory-lock CTE + correlated-subselect CASE assignments + UPDATE ... FROM — fluent builder can't model this yet
const qUpdateRakutenItemBalanceWithAdvisoryLock = sqlMain(`
    with _advisory_lock as materialized (
        select pg_advisory_xact_lock(hashtextextended(
            coalesce(
                (
                    select i2."orderId"::text
                    from "Network_Order_Rakuten_Item" i2
                    where i2."id" = '00000000-0000-0000-0000-000000000000'
                ),
                ''
            ),
            0
        )) as _
    )
    update "Network_Order_Rakuten_Item" i set
    "realPseBalance" = (
        case
        when (
            select coalesce("manualAffiliatePaymentStatus", "affiliatePaymentStatus", '')
            from "Network_Order" o
            where o."orderId" = i."orderId") != 'paid'
        then 0
        when i."grossCommissionAmount" = 0
        then 0
        when (
            select "pseCommissionRate"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        when (
            select "grossCommissionAmount"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        else round(
                coalesce(
                (
                    (
                        (
                            select "pseCommissionRate"
                            from "Network_Order" o
                            where o."orderId" = i."orderId"
                        ) *
                        i."commissionAmount"
                    ) -
                    coalesce(
                        (select sum(uapi."amount")
                        from "User_ApprovedPayment_Item" uapi
                        join "User_ApprovedPayment" uap
                            on uap.id = uapi."userApprovedPaymentId"
                        where uapi."anyItemId" = i."id"
                        and uap."status" = 'paid'),
                        0
                    )
                ),
                0
            )::numeric,
            2
        )
        end
    ),
    "pseBalance" = coalesce(i."manualPseBalance", (
        case
        when (
            select coalesce("manualAffiliatePaymentStatus", "affiliatePaymentStatus", '')
            from "Network_Order" o
            where o."orderId" = i."orderId") != 'paid'
        then 0
        when i."grossCommissionAmount" = 0
        then 0
        when (
            select "pseCommissionRate"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        when (
            select "grossCommissionAmount"
            from "Network_Order" o
            where o."orderId" = i."orderId"
        ) = 0
        then 0
        else round(
                coalesce(
                (
                    (
                        (
                            select "pseCommissionRate"
                            from "Network_Order" o
                            where o."orderId" = i."orderId"
                        ) *
                        i."commissionAmount"
                    ) -
                    coalesce(
                        (select sum(uapi."amount")
                        from "User_ApprovedPayment_Item" uapi
                        join "User_ApprovedPayment" uap
                            on uap.id = uapi."userApprovedPaymentId"
                        where uapi."anyItemId" = i."id"
                        and uap."status" = 'paid'),
                        0
                    )
                ),
                0
            )::numeric,
            2
        )
        end
    ))
    from _advisory_lock
    where i."id" = '00000000-0000-0000-0000-000000000000';
`).withParams({});

// mirror of commerce queries.test.ts Q_PsePaymentsWithLateralTeamResolution
// TODO(builder-api): SELECT uap.* + CASE/coalesce projections over two left-lateral subqueries — fluent builder can't model this yet
const qPsePaymentsWithLateralTeamResolution = sqlMain(`
    select
        uap.*,
        pse."givenName" as "pseGivenName",
        pse."familyName" as "pseFamilyName",
        (
            case
                when uap."revolutDraftId" is not null then true
                else (
                    rc."id" is not null
                    or coalesce(
                        rpd."teamId",
                        case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end
                    ) is not null
                )
            end
        )::boolean as "hasBankDetails",
        (
            coalesce(
                rpd."teamId",
                case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end
            ) is not null
        )::boolean as "hasTeamBankDetails",
        (
            coalesce(
                dt."name",
                uapt."name",
                case when utm."teamMemberCount" = 1 then utm."teamName" else null end
            )
        )::text as "teamName",
        (
            coalesce(
                rpd."teamId",
                uap."teamId",
                case when utm."teamMemberCount" = 1 then utm."teamId" else null end
            )
        )::text as "teamId",
        (uap."amount" + uap."vat")::float8 as "total",
        convert_currency(
            (uap."amount")::numeric,
            uap."currency",
            'GBP'::text,
            uap."createdAt"::date
        )::float8 as "amountGBP",
        convert_currency(
            (uap."vat")::numeric,
            uap."currency",
            'GBP'::text,
            uap."createdAt"::date
        )::float8 as "vatGBP",
        convert_currency(
            (uap."amount" + uap."vat")::numeric,
            uap."currency",
            'GBP'::text,
            uap."createdAt"::date
        )::float8 as "totalGBP"
    from "User_ApprovedPayment" uap
    left join "User" pse on pse.id = uap."userId"
    left join "Revolut_Counterparty" rc on rc."userId" = uap."userId"
    left join "Revolut_PaymentDraft" rpd on rpd."id" = uap."revolutDraftId"
    left join "Team" dt on dt."id" = rpd."teamId"
    left join "Team" uapt on uapt."id" = uap."teamId"
    left join lateral (
        select
            count(*)::int as "teamCounterpartyCount",
            (array_agg(tm."teamId"))[1]::uuid as "teamId",
            (array_agg(t."name"))[1]::text as "teamName"
        from "Team_Member" tm
        join "Team_Revolut_Counterparty" trc on trc."teamId" = tm."teamId"
        join "Team" t on t."id" = tm."teamId"
        where tm."userId" = uap."userId"
          and tm."disabled" = false
    ) utc on true
    left join lateral (
        select
            count(*)::int as "teamMemberCount",
            (array_agg(tm2."teamId"))[1]::uuid as "teamId",
            (array_agg(t2."name"))[1]::text as "teamName"
        from "Team_Member" tm2
        join "Team" t2 on t2."id" = tm2."teamId"
        where tm2."userId" = uap."userId"
          and tm2."disabled" = false
    ) utm on true
    order by uap."createdAt" desc
`).withParams({});

describe("commerce queries — createSql fallback (builder-inexpressible)", () => {
    it("CTE/UNION/derived/lateral raw queries assemble", () => {
        // Smoke-check: each raw query produces a non-empty SQL string.
        //
        // NOTE: asserted one-by-one rather than via `for (const q of [..])`.
        // Collecting the heterogeneous builders into one array literal forces TS to
        // compute the *union* of all ~23 raw-SQL builder result types as the element
        // type, and that union instantiation overflows TS 6's (shallower) conditional-
        // type stack — `RangeError: Maximum call stack size exceeded` at compile time.
        // Individual statements type-check each builder independently and stay well
        // under the limit. (The const declarations themselves are fine in bulk.)
        expect(qRakutenReturnDurations.toString().length).toBeGreaterThan(0);
        expect(qRakutenReturnDurationsByAdvertiser.toString().length).toBeGreaterThan(0);
        expect(qCjReturnDurations.toString().length).toBeGreaterThan(0);
        expect(qCjReturnDurationsByAdvertiser.toString().length).toBeGreaterThan(0);
        expect(qPartnerizeReturnDurations.toString().length).toBeGreaterThan(0);
        expect(qPartnerizeReturnDurationsByAdvertiser.toString().length).toBeGreaterThan(0);
        expect(qPseRawStatsStaticExpansion.toString().length).toBeGreaterThan(0);
        expect(qPseRawStatsFullStaticExpansion.toString().length).toBeGreaterThan(0);
        expect(qApprovedPseCycleStats.toString().length).toBeGreaterThan(0);
        expect(qTeamPseInfo.toString().length).toBeGreaterThan(0);
        expect(qPersonalUpcomingInvoiceItems.toString().length).toBeGreaterThan(0);
        expect(qTeamUpcomingInvoiceItems.toString().length).toBeGreaterThan(0);
        expect(qPsePaymentsTeamSummary.toString().length).toBeGreaterThan(0);
        expect(qOrderLateReturnRollup.toString().length).toBeGreaterThan(0);
        expect(qPseAwaitingByTeamRollup.toString().length).toBeGreaterThan(0);
        expect(qFetchOrdersStaticExpansion.toString().length).toBeGreaterThan(0);
        expect(qFetchOrdersGroupedTeamStaticExpansion.toString().length).toBeGreaterThan(0);
        expect(qFetchRevolutPaymentsStaticExpansion.toString().length).toBeGreaterThan(0);
        expect(qFetchClicksStaticExpansion.toString().length).toBeGreaterThan(0);
        expect(qAllocateNaInvoiceSettlementsWrite.toString().length).toBeGreaterThan(0);
        expect(qUpdateRetailerWeight.toString().length).toBeGreaterThan(0);
        expect(qUpdateRakutenItemBalanceWithAdvisoryLock.toString().length).toBeGreaterThan(0);
        expect(qPsePaymentsWithLateralTeamResolution.toString().length).toBeGreaterThan(0);
    });

    it("named params in raw queries expand positionally", () => {
        // named :params are rewritten to positional $N placeholders
        expect(qTeamPseInfo.toString()).toContain("$1");
        expect(qTeamPseInfo.toString()).not.toContain(":teamId");
        expect([...qTeamPseInfo.getParams()]).toEqual(["GBP", "t1"]);
        expect([...qPseAwaitingByTeamRollup.getParams()]).toEqual(["t1"]);
        expect([...qFetchOrdersStaticExpansion.getParams()]).toEqual(["o1", "o2"]);
        expect([...qPersonalUpcomingInvoiceItems.getParams()]).toEqual(["u1", "u1"]);
    });
});

export type CommerceQueriesBuilderTestsPass = true;
