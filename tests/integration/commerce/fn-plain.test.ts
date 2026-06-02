/**
 * Commerce fn — plain type-level mirrors. COLLECTION pass; reds => engine fix-list.
 *
 * Mirrors EVERY raw SQL query from the commerce `fn` lambda area:
 *   - fn/create-pse-invoice/src/index.ts
 *   - fn/create-pse-invoice/src/generateInvoiceId.ts
 *   - fn/generate-pse-invoice/src/index.ts
 *   - fn/process-cj-report/src/index.ts
 *   - fn/actions/src/handlers/user/updateAnalytics.ts
 *   - fn/actions/src/handlers/user/syncPosthog.ts
 *
 * Setup-only: assertions encode the INTENDED row type; failures => engine fix-list.
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
// GetReturnType yields a flattened row; flatten the expected table type (an
// intersection in the fixture) so the assertion compares the resolved shape.
type Flatten<T> = { [K in keyof T]: T[K] };

// ===========================================================================
// create-pse-invoice/src/index.ts
// ===========================================================================

// --- index.ts:16-25  checkInvoiceExists() (db.main.typedSelect) ---
type Q_CheckInvoiceExists = `
        select id
        from "Revolut_PaymentInvoice"
        where "paymentId" = $1 and "status" = 'active'`;
type _V_CheckInvoiceExists = Expect<Equal<ValidateSQL<Q_CheckInvoiceExists, S>, true>>;
type _R_CheckInvoiceExists = Expect<
    Equal<GetReturnType<Q_CheckInvoiceExists, S>, { id: string }>
>;

// --- index.ts:27-38  getPSEVatInfo() (db.main.typedSelect) ---
type Q_GetPSEVatInfo = `
        select * from "User_PaymentSettings"
        where "userId" = $1`;
type _V_GetPSEVatInfo = Expect<Equal<ValidateSQL<Q_GetPSEVatInfo, S>, true>>;
type _R_GetPSEVatInfo = Expect<
    Equal<
        GetReturnType<Q_GetPSEVatInfo, S>,
        S["schemas"]["public"]["User_PaymentSettings"]
    >
>;

// --- index.ts:40-52  getPSEInfo() (db.main.typedSelect) ---
type Q_GetPSEInfo = `
        select "givenName", "familyName"
        from "User"
        where "id" = $1`;
type _V_GetPSEInfo = Expect<Equal<ValidateSQL<Q_GetPSEInfo, S>, true>>;
type _R_GetPSEInfo = Expect<
    Equal<
        GetReturnType<Q_GetPSEInfo, S>,
        { givenName: string | null; familyName: string | null }
    >
>;

// --- index.ts:56-67  getTeamCounterpartyId() (db.main.typedSelect) ---
type Q_GetTeamCounterpartyId = `
        select "counterpartyId" from "Team_Revolut_Counterparty"
        where "teamId" = $1`;
type _V_GetTeamCounterpartyId = Expect<
    Equal<ValidateSQL<Q_GetTeamCounterpartyId, S>, true>
>;
type _R_GetTeamCounterpartyId = Expect<
    Equal<GetReturnType<Q_GetTeamCounterpartyId, S>, { counterpartyId: string }>
>;

// --- index.ts:72-83  getUserCounterpartyId() (db.main.typedSelect) ---
type Q_GetUserCounterpartyId = `
        select "counterpartyId" from "Revolut_Counterparty"
        where "userId" = $1`;
type _V_GetUserCounterpartyId = Expect<
    Equal<ValidateSQL<Q_GetUserCounterpartyId, S>, true>
>;
type _R_GetUserCounterpartyId = Expect<
    Equal<GetReturnType<Q_GetUserCounterpartyId, S>, { counterpartyId: string }>
>;

// --- index.ts:89-100  getTeamName() (db.main.typedSelect) ---
type Q_GetTeamName = `
        select "name" from "Team"
        where "id" = $1`;
type _V_GetTeamName = Expect<Equal<ValidateSQL<Q_GetTeamName, S>, true>>;
type _R_GetTeamName = Expect<
    Equal<GetReturnType<Q_GetTeamName, S>, { name: string }>
>;

// --- index.ts:104-115  getTeamPaymentSettings() (db.main.typedSelect) ---
type Q_GetTeamPaymentSettings = `
        select * from "Team_PaymentSettings"
        where "teamId" = $1`;
type _V_GetTeamPaymentSettings = Expect<
    Equal<ValidateSQL<Q_GetTeamPaymentSettings, S>, true>
>;
type _R_GetTeamPaymentSettings = Expect<
    Equal<
        GetReturnType<Q_GetTeamPaymentSettings, S>,
        S["schemas"]["public"]["Team_PaymentSettings"]
    >
>;

// --- index.ts:117-128  getPayment() (db.main.typedSelect) ---
type Q_GetPayment = `
        select * from "Revolut_PaymentDraft"
        where "id" = $1`;
type _V_GetPayment = Expect<Equal<ValidateSQL<Q_GetPayment, S>, true>>;
type _R_GetPayment = Expect<
    Equal<
        GetReturnType<Q_GetPayment, S>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// --- index.ts:132-164  getUserApprovedPayments() (db.main.typedSelect) ---
// LEFT JOINs to "User" u and "Network_Order" no => columns sourced from those
// nullable sides become T | null. pseName uses (||) => string, then left-join
// nullability applies (u.* is nullable) => string | null.
type Q_GetUserApprovedPayments = `
        select uap.id, uap."userId", uap."networkOrderId", uap.type,
            convert_currency(uap.amount::numeric, uap.currency, $2, $3::date)::float8 as "amount",
            convert_currency(uap.vat::numeric, uap.currency, $2, $3::date)::float8 as "vat",
            $2 as "currency",
            uap.comment, uap."createdAt", uap.paid, uap."paymentMonth",
            uap."revolutDraftId", uap."revolutReference", uap.status,
            no."orderId", no."orderDate", no."advertiser" as "retailer",
            (u."givenName" || ' ' || u."familyName")::text as "pseName"
        from "User_ApprovedPayment" uap
        left join "User" u on u."id" = uap."userId"
        left join "Network_Order" no on no."id" = uap."networkOrderId"
        where uap."revolutDraftId" = $1`;
type _V_GetUserApprovedPayments = Expect<
    Equal<ValidateSQL<Q_GetUserApprovedPayments, S>, true>
>;
type _R_GetUserApprovedPayments = Expect<
    Equal<
        GetReturnType<Q_GetUserApprovedPayments, S>,
        {
            id: string;
            userId: string | null;
            networkOrderId: string | null;
            type: number | null;
            amount: number;
            vat: number;
            currency: string;
            comment: string | null;
            createdAt: string;
            paid: boolean;
            paymentMonth: string | null;
            revolutDraftId: string | null;
            revolutReference: string | null;
            status: string;
            orderId: string | null;
            orderDate: string | null;
            retailer: string | null;
            pseName: string | null;
        }
    >
>;

// --- index.ts:168-211  getUserApprovedPaymentItems() (db.main.typedSelect) ---
// IN-list materialized from dynamic placeholders (paymentIds.map -> $3..$n).
// coalesce(ci.sku, ri.sku, pi.sku) etc. over LEFT-joined item tables => string | null.
type Q_GetUserApprovedPaymentItems = `
        select
            uapi.id, uapi."userApprovedPaymentId",
            uapi."rakutenItemId", uapi."cjItemId", uapi."partnerizeItemId",
            uapi."anyItemId",
            convert_currency(uapi.amount::numeric, uapi.currency, $1, $2::date)::float8 as "amount",
            convert_currency(uapi.vat::numeric, uapi.currency, $1, $2::date)::float8 as "vat",
            $1 as "currency",
            coalesce(ci.sku, ri.sku, pi.sku)::text as "sku",
            coalesce(ri.product, pi.name)::text as "name",
            o."advertiser" as "retailer",
            o."orderId" as "orderId",
            o."orderDate" as "orderDate",
            (u."givenName" || ' ' || u."familyName")::text as "pseName"
        from "User_ApprovedPayment_Item" uapi
        join "User_ApprovedPayment" uap on uap."id" = uapi."userApprovedPaymentId"
        join "User" u on u."id" = uap."userId"
        join "Network_Order" o on o."id" = uap."networkOrderId"
        left join "Network_Order_Rakuten_Item" ri on ri."id" = uapi."rakutenItemId"
        left join "Network_Order_CJ_Item" ci on ci."id" = uapi."cjItemId"
        left join "Network_Order_Partnerize_Item" pi on pi."id" = uapi."partnerizeItemId"
        where uapi."userApprovedPaymentId" in ($3, $4, $5)`;
type _V_GetUserApprovedPaymentItems = Expect<
    Equal<ValidateSQL<Q_GetUserApprovedPaymentItems, S>, true>
>;
// TODO(return-type): coalesce over LEFT-joined sides + casts; row shape is
// determinable but conservative typing may widen. Asserting validity only.

// --- index.ts:503-510  action() INSERT (db.main.run, dynamic prepareInsert) ---
// materialized from dynamic source: prepareInsert builds the column/placeholder
// lists at runtime; here is the representative static form.
type Q_InsertInvoice = `
            insert into "Revolut_PaymentInvoice"
            (id, "paymentId", data, "userId", "teamId", status, "createdAt", amount, vat, currency)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
// FIXTURE-GAP: Revolut_PaymentInvoice.teamId not in fixture (ecommerce shape lacks it).
type _V_InsertInvoice = Expect<Equal<ValidateSQL<Q_InsertInvoice, S>, true>>;

// ===========================================================================
// create-pse-invoice/src/generateInvoiceId.ts
// ===========================================================================

// --- generateInvoiceId.ts:10-25  getInvoiceNumber() (db.main.typedSelect) ---
// count(*) aliased "cnt" => number; date(...) is a where-only filter.
type Q_GetInvoiceNumber = `
            select count(*) as cnt
            from "Revolut_PaymentInvoice"
            where date("createdAt") = $1
        `;
type _V_GetInvoiceNumber = Expect<Equal<ValidateSQL<Q_GetInvoiceNumber, S>, true>>;
type _R_GetInvoiceNumber = Expect<
    Equal<GetReturnType<Q_GetInvoiceNumber, S>, { cnt: number }>
>;

// --- generateInvoiceId.ts:31-38  generateInvoiceId() (db.main.typedSelect) ---
type Q_GenInvoiceDraft = `
        select *
        from "Revolut_PaymentDraft"
        where "id" = $1
        `;
type _V_GenInvoiceDraft = Expect<Equal<ValidateSQL<Q_GenInvoiceDraft, S>, true>>;
type _R_GenInvoiceDraft = Expect<
    Equal<
        GetReturnType<Q_GenInvoiceDraft, S>,
        S["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// ===========================================================================
// generate-pse-invoice/src/index.ts
// ===========================================================================

// --- index.ts:56-63  action() UPDATE invoice s3key (db.main.run, DML) ---
// FIXTURE-GAP: Revolut_PaymentInvoice."s3key" — fixture has "s3Key" (case-insensitive
// matching means this still validates).
type Q_UpdateInvoiceS3Key = `
            update "Revolut_PaymentInvoice"
            set "s3key" = $1
            where "id" = $2
            `;
type _V_UpdateInvoiceS3Key = Expect<Equal<ValidateSQL<Q_UpdateInvoiceS3Key, S>, true>>;

// --- index.ts:78-85  action() UPDATE credit note s3key (db.main.run, DML) ---
// FIXTURE-GAP: Revolut_PaymentCreditNote.s3key not in fixture (table exists, no s3key col).
type Q_UpdateCreditNoteS3Key = `
            update "Revolut_PaymentCreditNote"
            set "s3key" = $1
            where "id" = $2
            `;
type _V_UpdateCreditNoteS3Key = Expect<
    Equal<ValidateSQL<Q_UpdateCreditNoteS3Key, S>, true>
>;

// ===========================================================================
// process-cj-report/src/index.ts
// ===========================================================================

// --- index.ts:169-175  getPaymentRecord() (db.main.typedSelect) ---
type Q_GetPaymentRecord = `select * from "Network_Payment_CJ" where id = $1`;
type _V_GetPaymentRecord = Expect<Equal<ValidateSQL<Q_GetPaymentRecord, S>, true>>;
type _R_GetPaymentRecord = Expect<
    Equal<
        GetReturnType<Q_GetPaymentRecord, S>,
        S["schemas"]["public"]["Network_Payment_CJ"]
    >
>;

// --- index.ts:180-183  createGroup() SELECT (db.main.typedSelect) ---
type Q_GetCJGroup = `select * from "Network_Payment_CJ_Group" where id = $1`;
type _V_GetCJGroup = Expect<Equal<ValidateSQL<Q_GetCJGroup, S>, true>>;
type _R_GetCJGroup = Expect<
    Equal<
        GetReturnType<Q_GetCJGroup, S>,
        S["schemas"]["public"]["Network_Payment_CJ_Group"]
    >
>;

// --- index.ts:187-191  createGroup() INSERT (db.main.run, DML) ---
type Q_InsertCJGroup = `
        insert into "Network_Payment_CJ_Group" (id, "datePaid")
        values ($1, $2)
        on conflict (id) do nothing
    `;
type _V_InsertCJGroup = Expect<Equal<ValidateSQL<Q_InsertCJGroup, S>, true>>;

// --- index.ts:197-205  getLocalOrderId() (db.main.typedSelect) ---
type Q_GetLocalOrderId = `
        select "id"
        from "Network_Order" no
        where no."networkId" = 'cj'
        and no."orderId" = $1
    `;
type _V_GetLocalOrderId = Expect<Equal<ValidateSQL<Q_GetLocalOrderId, S>, true>>;
type _R_GetLocalOrderId = Expect<
    Equal<GetReturnType<Q_GetLocalOrderId, S>, { id: string }>
>;

// --- index.ts:225-234  processOrderRecord() SELECT paymentId (db.main.typedSelect) ---
type Q_GetCJOrderPaymentId = `
        select "paymentId"
        from "Network_Payment_CJ_Order" npo
        where npo."orderId" = $1
    `;
type _V_GetCJOrderPaymentId = Expect<
    Equal<ValidateSQL<Q_GetCJOrderPaymentId, S>, true>
>;
type _R_GetCJOrderPaymentId = Expect<
    Equal<GetReturnType<Q_GetCJOrderPaymentId, S>, { paymentId: string }>
>;

// --- index.ts:238-245 / 258-265  processOrderRecord() UPDATE groupId (db.main.run, DML) ---
type Q_UpdateCJGroupId = `
            update "Network_Payment_CJ"
            set "groupId" = $1
            where id = $2
        `;
type _V_UpdateCJGroupId = Expect<Equal<ValidateSQL<Q_UpdateCJGroupId, S>, true>>;

// --- index.ts:248-255  processOrderRecord() SELECT by details->>'order_id' (db.main.typedSelect) ---
type Q_GetCJByDetails = `
            select *
            from "Network_Payment_CJ" np
            where details->>'order_id' = $1
        `;
type _V_GetCJByDetails = Expect<Equal<ValidateSQL<Q_GetCJByDetails, S>, true>>;
type _R_GetCJByDetails = Expect<
    Equal<
        GetReturnType<Q_GetCJByDetails, S>,
        S["schemas"]["public"]["Network_Payment_CJ"]
    >
>;

// --- index.ts:306-318  processTransactionRecord() INSERT...ON CONFLICT (db.main.run, DML) ---
type Q_UpsertCJPayment = `
            insert into "Network_Payment_CJ"
            (id, advertiser_name, payment_date,
            sale_amount, publisher_commission, details, "groupId")
            values ($1, $2, $3, $4, $5, $6, $7)
            on conflict (id) do update set
                advertiser_name = excluded.advertiser_name,
                payment_date = excluded.payment_date,
                sale_amount = excluded.sale_amount,
                publisher_commission = excluded.publisher_commission,
                details = excluded.details,
                "groupId" = coalesce("Network_Payment_CJ"."groupId", excluded."groupId")
        `;
type _V_UpsertCJPayment = Expect<Equal<ValidateSQL<Q_UpsertCJPayment, S>, true>>;

// --- index.ts:333-351  assignSingleOrders() INSERT...SELECT (db.main.run, DML) ---
type Q_AssignSingleOrders = `
        insert into "Network_Payment_CJ_Order"
        ("orderId", "paymentId", "paymentDate")
        (
            select
            o."id",
            p.id as "paymentId",
            p.payment_date as "paymentDate"
            from "Network_Order" o
            join "Network_Payment_CJ" p
                on p.sale_amount > 0.1
                    and p.advertiser_name = o.advertiser
                    and abs(p.sale_amount - coalesce(o."correctedSaleAmount", o."saleAmount")) < 0.1
            where o."networkId" = 'cj'
                and o."status" = 'closed'
        )
        on conflict ("orderId", "paymentId") do update set
            "manuallyAssigned" = false;
    `;
type _V_AssignSingleOrders = Expect<Equal<ValidateSQL<Q_AssignSingleOrders, S>, true>>;

// --- index.ts:357-364  assignMultipleOrders() SELECT payments w/ NOT EXISTS (db.main.typedSelect) ---
type Q_UnassignedPayments = `
        select *
        from "Network_Payment_CJ" npc
        where sale_amount > 0 and not exists (
            select 1 from "Network_Payment_CJ_Order" npco
            where npco."paymentId" = npc.id
        )
    `;
type _V_UnassignedPayments = Expect<Equal<ValidateSQL<Q_UnassignedPayments, S>, true>>;
type _R_UnassignedPayments = Expect<
    Equal<
        GetReturnType<Q_UnassignedPayments, S>,
        S["schemas"]["public"]["Network_Payment_CJ"]
    >
>;

// --- index.ts:385-398  assignMultipleOrders() SELECT orders w/ coalesce + NOT EXISTS (db.main.typedSelect) ---
type Q_CandidateOrders = `
                select *
                from "Network_Order" no
                where no."networkId" = 'cj'
                and no."advertiser" = $1
                and no."status" = 'closed'
                and coalesce(no."correctedSaleAmount", no."saleAmount") < $2
                and coalesce(no."correctedSaleAmount", no."saleAmount") > 0.1
                and no."orderDate" < $3
                and not exists (
                    select 1 from "Network_Payment_CJ_Order" npco
                    where npco."orderId" = no."id"
                )
            `;
type _V_CandidateOrders = Expect<Equal<ValidateSQL<Q_CandidateOrders, S>, true>>;
type _R_CandidateOrders = Expect<
    Equal<
        GetReturnType<Q_CandidateOrders, S>,
        Flatten<S["schemas"]["public"]["Network_Order"]>
    >
>;

// --- index.ts:465-470  assignMultipleOrders() INSERT values...ON CONFLICT (db.main.run, DML) ---
type Q_InsertCJOrder = `
                    insert into "Network_Payment_CJ_Order"
                    ("orderId", "paymentId", "paymentDate")
                    values ($1, $2, $3)
                    on conflict ("orderId", "paymentId") do nothing
                `;
type _V_InsertCJOrder = Expect<Equal<ValidateSQL<Q_InsertCJOrder, S>, true>>;

// ===========================================================================
// actions/src/handlers/user/updateAnalytics.ts
// ===========================================================================

// --- updateAnalytics.ts:102-109  incrementField() INSERT...ON CONFLICT (db.main.run, DML) ---
// materialized from dynamic source: `${fieldName}` resolved to "bankDetailsAddedNum".
type Q_IncrementField = `
        insert into "User_Analytics"
            ("userId", "bankDetailsAddedNum")
        values
            ($1, 1)
        on conflict("userId") do update set
            "bankDetailsAddedNum" = "User_Analytics"."bankDetailsAddedNum" + excluded."bankDetailsAddedNum"
    `;
type _V_IncrementField = Expect<Equal<ValidateSQL<Q_IncrementField, S>, true>>;

// ===========================================================================
// actions/src/handlers/user/syncPosthog.ts
// ===========================================================================

// --- syncPosthog.ts:7-22  getAnalytics() (db.main.typedSelect) ---
// LEFT JOIN "PSEApplication" pa => pa.id becomes string | null. ua.* expands to
// the full User_Analytics row. Wide projection; assert validity only.
type Q_GetAnalytics = `
        select
        u.email,
        u.phone,
        u."givenName",
        u."familyName",
        u."createdAt",
        u."firstLoggedIn",
        u."lastLoggedIn",
        pa.id as "pseApplicationId",
        ua.*
        from "User_Analytics" ua
        join "User" u on u.id = ua."userId"
        left join "PSEApplication" pa on pa."userId" = ua."userId"
        where ua."userId" = $1
    `;
type _V_GetAnalytics = Expect<Equal<ValidateSQL<Q_GetAnalytics, S>, true>>;
// TODO(return-type): mix of qualified User columns + ua.* wildcard + left-joined
// pa.id; row shape determinable but wide. Asserting validity only.

export type CommerceFnPlainTestsPass = true;
