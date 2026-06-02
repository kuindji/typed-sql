/**
 * reporting-v2 plain-SQL fixtures — copied verbatim from
 * commerce app, area: reporting-v2.
 * Setup-only: assertions encode the INTENDED row type; failures => engine fix-list.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { ReportingV2Schema, ReportingV2CatalogueSchema } from "../../fixtures/reporting-v2-schema.js";
type Main = ReportingV2Schema;
type Catalogue = ReportingV2CatalogueSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
// Flatten collapses an intersection table type (e.g. Base & { extras }) into a
// flat object so the strict Equal helper compares it against the structurally
// identical select-* row. Without it Equal reports false for intersections even
// when every key/value matches.
type Flatten<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// controller/pse/payment-status.ts:19,39,53
// ---------------------------------------------------------------------------

// payment-status.ts:19 — getPayment
type Q_PaymentStatusSelect = `select * from "User_ApprovedPayment" where id = $1`;
type _V_PaymentStatusSelect = Expect<Equal<ValidateSQL<Q_PaymentStatusSelect, Main>, true>>;
type _R_PaymentStatusSelect = Expect<
    Equal<
        GetReturnType<Q_PaymentStatusSelect, Main>,
        Main["schemas"]["public"]["User_ApprovedPayment"]
    >
>;

// payment-status.ts:39 — setPaid
type Q_PaymentStatusSetPaid = `
            update "User_ApprovedPayment"
            set "paid" = true, "status" = 'paid'
            where id = $1
            `;
type _V_PaymentStatusSetPaid = Expect<Equal<ValidateSQL<Q_PaymentStatusSetPaid, Main>, true>>;

// payment-status.ts:53 — cancel
type Q_PaymentStatusCancel = `
                delete from "User_ApprovedPayment"
                where id = $1
                `;
type _V_PaymentStatusCancel = Expect<Equal<ValidateSQL<Q_PaymentStatusCancel, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/pse/approve-commission.ts:39,44,74,103
// ---------------------------------------------------------------------------

// approve-commission.ts:39 — checkPendingPaymentExists
type Q_ApproveCommissionPending = `
        select id from "User_ApprovedPayment"
        where "userId" = $1 and "networkOrderId" = $2
        and "status" != 'paid' and "status" != 'failed'
        limit 1`;
type _V_ApproveCommissionPending = Expect<Equal<ValidateSQL<Q_ApproveCommissionPending, Main>, true>>;
type _R_ApproveCommissionPending = Expect<
    Equal<GetReturnType<Q_ApproveCommissionPending, Main>, { id: string }>
>;

// approve-commission.ts:44 — getCommissionRate history
type Q_ApproveCommissionHistory = `
            select * from "Retailer_Commission_History"
            where "advertiserName" = $1 and "startedAt" <= $2 and "endedAt" >= $2
        `;
type _V_ApproveCommissionHistory = Expect<Equal<ValidateSQL<Q_ApproveCommissionHistory, Main>, true>>;

// approve-commission.ts:74 — getCommissionRate current rates
type Q_ApproveCommissionRates = `
            select * from "Retailer_Commission"
            where "advertiserName" = $1
        `;
type _V_ApproveCommissionRates = Expect<Equal<ValidateSQL<Q_ApproveCommissionRates, Main>, true>>;

// approve-commission.ts:103 — insert approved payment
type Q_ApproveCommissionInsert = `
        insert into "User_ApprovedPayment"
        ("id", "userId", "networkOrderId", amount, vat, currency, status, type)
        values ($1, $2, $3, $4, $5, $6, 'approved', 1)
    `;
type _V_ApproveCommissionInsert = Expect<Equal<ValidateSQL<Q_ApproveCommissionInsert, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/order/set-pse.ts:44,74,124,136,144,160,177
// ---------------------------------------------------------------------------

// set-pse.ts:44 — getCommissionRate history
type Q_SetPseHistory = `
            select * from "Retailer_Commission_History"
            where "advertiserName" = $1 and "startedAt" <= $2 and "endedAt" >= $2
        `;
type _V_SetPseHistory = Expect<Equal<ValidateSQL<Q_SetPseHistory, Main>, true>>;

// set-pse.ts:74 — getCommissionRate current
type Q_SetPseRates = `
            select * from "Retailer_Commission"
            where "advertiserName" = $1
        `;
type _V_SetPseRates = Expect<Equal<ValidateSQL<Q_SetPseRates, Main>, true>>;

// set-pse.ts:124 — re-attribute existing click
type Q_SetPseUpdateClick = `
                update "LogProductClick"
                set "shopperId" = $1, "referenceUserId" = $1
                where "sid" = $2
            `;
type _V_SetPseUpdateClick = Expect<Equal<ValidateSQL<Q_SetPseUpdateClick, Main>, true>>;

// set-pse.ts:136 — insert synthetic click
type Q_SetPseInsertClick = `
                insert into "LogProductClick"
                ("createdAt", "sid", "shopperId", "referenceUserId")
                values ($1, $2, $3, $4)
            `;
type _V_SetPseInsertClick = Expect<Equal<ValidateSQL<Q_SetPseInsertClick, Main>, true>>;

// set-pse.ts:144 — point order at the click
type Q_SetPseUpdateOrderClick = `
                update "Network_Order" set "clickId" = $1 where "id" = $2
            `;
type _V_SetPseUpdateOrderClick = Expect<Equal<ValidateSQL<Q_SetPseUpdateOrderClick, Main>, true>>;

// set-pse.ts:160 — fetch click createdAt
type Q_SetPseSelectClickDate = `
                select "createdAt" from "LogProductClick" where "sid" = $1
            `;
type _V_SetPseSelectClickDate = Expect<Equal<ValidateSQL<Q_SetPseSelectClickDate, Main>, true>>;
type _R_SetPseSelectClickDate = Expect<
    Equal<GetReturnType<Q_SetPseSelectClickDate, Main>, { createdAt: string }>
>;

// set-pse.ts:177 — write commission rates
type Q_SetPseUpdateRates = `
                update "Network_Order"
                set "pseCommissionRate" = $1,
                    "pseCommissionRateClick" = $2
                where "id" = $3
            `;
type _V_SetPseUpdateRates = Expect<Equal<ValidateSQL<Q_SetPseUpdateRates, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/order/recalc.ts:52
// ---------------------------------------------------------------------------

// recalc.ts:52 — getOrder
type Q_RecalcGetOrder = `select * from "Network_Order" where id = $1`;
type _V_RecalcGetOrder = Expect<Equal<ValidateSQL<Q_RecalcGetOrder, Main>, true>>;
type _R_RecalcGetOrder = Expect<
    Equal<GetReturnType<Q_RecalcGetOrder, Main>, Flatten<Main["schemas"]["public"]["Network_Order"]>>
>;

// ---------------------------------------------------------------------------
// controller/revolut/delete-payment.ts:18,40
// ---------------------------------------------------------------------------

// delete-payment.ts:18 — load draft
type Q_DeletePaymentSelect = `
            select * from "Revolut_PaymentDraft"
            where id = $1
        `;
type _V_DeletePaymentSelect = Expect<Equal<ValidateSQL<Q_DeletePaymentSelect, Main>, true>>;
type _R_DeletePaymentSelect = Expect<
    Equal<
        GetReturnType<Q_DeletePaymentSelect, Main>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

// delete-payment.ts:40 — delete draft
type Q_DeletePaymentDelete = `
            delete from "Revolut_PaymentDraft"
            where id = $1
        `;
type _V_DeletePaymentDelete = Expect<Equal<ValidateSQL<Q_DeletePaymentDelete, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/pse/assign-previous.ts:17,31,45,59,74
// ---------------------------------------------------------------------------

// assign-previous.ts:17 — assignClicks
type Q_AssignClicks = `
            update "LogProductClick"
            set "teamId" = $1
            where "shopperId" = $2 and "teamId" is null
        `;
type _V_AssignClicks = Expect<Equal<ValidateSQL<Q_AssignClicks, Main>, true>>;

// assign-previous.ts:31 — assignConsultations
type Q_AssignConsultations = `
            update "Consultation"
            set "teamId" = $1
            where "friId" = $2 and "teamId" is null
        `;
type _V_AssignConsultations = Expect<Equal<ValidateSQL<Q_AssignConsultations, Main>, true>>;

// assign-previous.ts:45 — assignLooks
type Q_AssignLooks = `
            update "Look"
            set "teamId" = $1
            where "friId" = $2 and "teamId" is null
        `;
type _V_AssignLooks = Expect<Equal<ValidateSQL<Q_AssignLooks, Main>, true>>;

// assign-previous.ts:59 — assignMoodboards
type Q_AssignMoodboards = `
            update "Moodboard"
            set "teamId" = $1
            where "friId" = $2 and "teamId" is null
        `;
type _V_AssignMoodboards = Expect<Equal<ValidateSQL<Q_AssignMoodboards, Main>, true>>;

// assign-previous.ts:74 — validateMembership
type Q_AssignValidateMembership = `
            select id from "Team_Member"
            where "userId" = $1 and "teamId" = $2
        `;
type _V_AssignValidateMembership = Expect<Equal<ValidateSQL<Q_AssignValidateMembership, Main>, true>>;
type _R_AssignValidateMembership = Expect<
    Equal<GetReturnType<Q_AssignValidateMembership, Main>, { id: string }>
>;

// ---------------------------------------------------------------------------
// controller/pse/add-payment.ts:36
// ---------------------------------------------------------------------------

type Q_AddPaymentInsert = `
        insert into "User_ApprovedPayment"
        ("userId", amount, vat, comment, currency, type)
        values ($1, $2, $3, $4, $5, 3)
    `;
type _V_AddPaymentInsert = Expect<Equal<ValidateSQL<Q_AddPaymentInsert, Main>, true>>;

// ---------------------------------------------------------------------------
// controller/pse/awaiting-by-team.ts:78
// (teamFilter materialized to the scalar branch: `and ... = $1`)  // materialized
// ---------------------------------------------------------------------------

type Q_AwaitingByTeam = `
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
          and coalesce(uap."teamId", click."teamId") = $1
        group by coalesce(uap."teamId", click."teamId"), t."name"
        order by sum(
            convert_currency(
                uap."amount"::numeric,
                uap."currency",
                'GBP'::text,
                current_date
            )
        ) desc
        `;
type _V_AwaitingByTeam = Expect<Equal<ValidateSQL<Q_AwaitingByTeam, Main>, true>>;
// INTENDED row type (production AwaitingByTeamRow). currency is the constant
// 'GBP' projection — production declares `string`.
type ExpectedAwaitingByTeam = {
    teamId: string | null;
    teamName: string;
    pseCount: number;
    uapCount: number;
    amount: number;
    vat: number;
    total: number;
    currency: string;
    currencyCount: number;
};
// ENGINE-GAP (failing — backlog): the engine lowercases the string-literal
// projection, inferring currency: "gbp" (wrong case) instead of "GBP"/string.
type _R_AwaitingByTeam = Expect<Equal<GetReturnType<Q_AwaitingByTeam, Main>, ExpectedAwaitingByTeam>>;

// ---------------------------------------------------------------------------
// controller/team/upcoming-invoice.ts:86
// (userFilter materialized to empty — the no-userId branch)  // materialized
// ---------------------------------------------------------------------------

type Q_TeamUpcomingInvoice = `
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
          and coalesce(uap."teamId", click."teamId") = $1
        order by "pseName", uap."createdAt" desc
        `;
type _V_TeamUpcomingInvoice = Expect<Equal<ValidateSQL<Q_TeamUpcomingInvoice, Main>, true>>;
// INTENDED row type (production UpcomingInvoiceRow).
type ExpectedTeamUpcomingInvoice = {
    id: string;
    amount: number;
    vat: number;
    currency: string;
    createdAt: string;
    sku: string | null;
    name: string | null;
    retailer: string;
    orderId: string | null;
    orderDate: string | null;
    pseName: string;
};
// ENGINE-GAP (failing — backlog): coalesce(ri.sku, ci.sku, pi.sku)::text and
// coalesce(ri.product, pi.name, uap.comment)::text are inferred as non-null
// string. All coalesce args are nullable, so the intended type is string|null;
// the ::text cast is currently treated as null-stripping (sku/name).
type _R_TeamUpcomingInvoice = Expect<Equal<GetReturnType<Q_TeamUpcomingInvoice, Main>, ExpectedTeamUpcomingInvoice>>;

// ---------------------------------------------------------------------------
// lib/pseRaw.ts:23
// Each ${dateFilter('col','and')} is materialized to empty (no start/end) — the
// branch returning "" — so the correlated counts run unbounded.  // materialized
// ---------------------------------------------------------------------------

type Q_PseRaw = `
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

            ) as "looks",

            (
                select count(*)
                from "Link" link
                where link."referenceUserId" = u.id

            ) as "links",

            (
                select count(*)
                from "Consultation" c
                where c."friId" = u.id

            ) as "consultations",

            (
                select count(*)
                from "Moodboard" m
                where m."friId" = u.id

            ) as "moodboards",

            (
                select count(*)
                from "LogProductClick" lpc
                where lpc."shopperId" = u.id

            ) as "clicks",

            (
                select count(*)
                from "LogProductClick" lpc
                join "Network_Order" ordr on ordr."clickId" = lpc.sid
                where lpc."shopperId" = u.id

            ) as "orders",

            (
                select count(*)
                from "LogProductClick" lpc
                where lpc."shopperId" = u.id and lpc."linkId" is not null

            ) as "linkClicks",

            (
                select count(*)
                from "LogProductClick" lpc
                join "Network_Order" ordr on ordr."clickId" = lpc.sid
                where lpc."shopperId" = u.id and lpc."linkId" is not null

            ) as "linkOrders",

            (
                select count(*)
                from "LogProductClick" lpc
                where lpc."shopperId" = u.id and lpc."productId" is not null

            ) as "lookClicks",

            (
                select count(*)
                from "LogProductClick" lpc
                join "Network_Order" ordr on ordr."clickId" = lpc.sid
                where lpc."shopperId" = u.id and lpc."productId" is not null

            ) as "lookOrders",

            (
                select count(*)
                from "LogProductClick" lpc
                where lpc."shopperId" = u.id and lpc."moodboardId" is not null

            ) as "moodboardClicks",

            (
                select count(*)
                from "LogProductClick" lpc
                join "Network_Order" ordr on ordr."clickId" = lpc.sid
                where lpc."shopperId" = u.id and lpc."moodboardId" is not null

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
    `;
type _V_PseRaw = Expect<Equal<ValidateSQL<Q_PseRaw, Main>, true>>;

// Catalogue is unused by reporting-v2 raw strings here; reference to silence
// the unused-import lint without asserting anything engine-specific.
type _CatalogueRef = Catalogue;
