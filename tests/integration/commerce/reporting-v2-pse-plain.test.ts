/**
 * Commerce reporting-v2 (pse + order controllers) — plain type-level mirrors.
 * COLLECTION pass; reds => engine fix-list. Assertions encode INTENDED behavior.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";
type S = ReportingV2Schema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
// Flatten collapses Base & { extras } intersections into a flat object so the
// strict Equal helper compares them against a structurally identical row.
type Flatten<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pses.ts action()
// builder chain in source; here the assembled SQL is mirrored as plain SQL.
// query materialized non-empty so the ilike branch is present.
// ---------------------------------------------------------------------------
type Q_PseSearch = `select "id", "email", "givenName", "familyName" from "User"
    where ("groups" like '%GPS%' or "groups" like '%FRI%')
    and ("givenName" ilike $1 or "familyName" ilike $1 or "email" ilike $1)
    limit 20 offset 0`;
type _V_PseSearch = Expect<Equal<ValidateSQL<Q_PseSearch, S>, true>>;
type _R_PseSearch = Expect<
    Equal<
        GetReturnType<Q_PseSearch, S>,
        { id: string; email: string | null; givenName: string | null; familyName: string | null }
    >
>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/add-payment.ts handler()
// ---------------------------------------------------------------------------
type Q_AddPayment = `
        insert into "User_ApprovedPayment"
        ("userId", amount, vat, comment, currency, type)
        values ($1, $2, $3, $4, $5, 3)
    `;
type _V_AddPayment = Expect<Equal<ValidateSQL<Q_AddPayment, S>, true>>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/approve-commission.ts
// ---------------------------------------------------------------------------

// checkPendingPaymentExists() — limit-1 lookup of an unpaid approved payment
type Q_CheckPending = `select id from "User_ApprovedPayment"
        where "userId" = $1 and "networkOrderId" = $2
        and "status" != 'paid' and "status" != 'failed'
        limit 1`;
type _V_CheckPending = Expect<Equal<ValidateSQL<Q_CheckPending, S>, true>>;
type _R_CheckPending = Expect<Equal<GetReturnType<Q_CheckPending, S>, { id: string }>>;

// main() — insert the approved (status='approved', type=1) payment
type Q_ApproveInsert = `
        insert into "User_ApprovedPayment"
        ("id", "userId", "networkOrderId", amount, vat, currency, status, type)
        values ($1, $2, $3, $4, $5, $6, 'approved', 1)
    `;
type _V_ApproveInsert = Expect<Equal<ValidateSQL<Q_ApproveInsert, S>, true>>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/assign-previous.ts
// ---------------------------------------------------------------------------

// assignClicks() — re-attribute null-team clicks to a team
type Q_AssignClicks = `
            update "LogProductClick"
            set "teamId" = $1
            where "shopperId" = $2 and "teamId" is null
        `;
type _V_AssignClicks = Expect<Equal<ValidateSQL<Q_AssignClicks, S>, true>>;

// assignConsultations()
type Q_AssignConsultations = `
            update "Consultation"
            set "teamId" = $1
            where "friId" = $2 and "teamId" is null
        `;
type _V_AssignConsultations = Expect<Equal<ValidateSQL<Q_AssignConsultations, S>, true>>;

// assignLooks()
type Q_AssignLooks = `
            update "Look"
            set "teamId" = $1
            where "friId" = $2 and "teamId" is null
        `;
type _V_AssignLooks = Expect<Equal<ValidateSQL<Q_AssignLooks, S>, true>>;

// assignMoodboards()
type Q_AssignMoodboards = `
            update "Moodboard"
            set "teamId" = $1
            where "friId" = $2 and "teamId" is null
        `;
type _V_AssignMoodboards = Expect<Equal<ValidateSQL<Q_AssignMoodboards, S>, true>>;

// validateMembership() — confirm PSE belongs to the team
type Q_ValidateMembership = `
            select id from "Team_Member"
            where "userId" = $1 and "teamId" = $2
        `;
type _V_ValidateMembership = Expect<Equal<ValidateSQL<Q_ValidateMembership, S>, true>>;
type _R_ValidateMembership = Expect<Equal<GetReturnType<Q_ValidateMembership, S>, { id: string }>>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/awaiting-by-team.ts action()
// Aggregate roll-up of awaiting UAPs by coalesced team attribution.
// teamFilter materialized to the single-team `= $1` branch.
// Uses convert_currency() and current_date — custom fn / unmodeled, so the
// summed/converted columns infer as unknown per the conservative contract.
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
type _V_AwaitingByTeam = Expect<Equal<ValidateSQL<Q_AwaitingByTeam, S>, true>>;
// TODO(return-type): convert_currency/current_date casts make amount/vat/total
// ambiguous; pseCount/uapCount/currencyCount are ::int, teamName/currency are
// string. Assert only validation here.

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/pse/payment-status.ts
// (overlaps the existing reporting-v2-plain file; covered here for completeness)
// ---------------------------------------------------------------------------

// getPayment()
type Q_GetPayment = `select * from "User_ApprovedPayment" where id = $1`;
type _V_GetPayment = Expect<Equal<ValidateSQL<Q_GetPayment, S>, true>>;
type _R_GetPayment = Expect<
    Equal<
        Flatten<GetReturnType<Q_GetPayment, S>>,
        Flatten<S["schemas"]["public"]["User_ApprovedPayment"]>
    >
>;

// setPaid()
type Q_SetPaid = `
            update "User_ApprovedPayment"
            set "paid" = true, "status" = 'paid'
            where id = $1
            `;
type _V_SetPaid = Expect<Equal<ValidateSQL<Q_SetPaid, S>, true>>;

// cancel()
type Q_Cancel = `
                delete from "User_ApprovedPayment"
                where id = $1
                `;
type _V_Cancel = Expect<Equal<ValidateSQL<Q_Cancel, S>, true>>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/order/recalc.ts getOrder()
// recalc.ts has one inline query; every status mutation is delegated to
// @common/accounting helper builders (getUpdateOrder*StatusQuery etc.) outside
// this controller area, so only getOrder is mirrored.
// ---------------------------------------------------------------------------
type Q_RecalcGetOrder = `select * from "Network_Order" where id = $1`;
type _V_RecalcGetOrder = Expect<Equal<ValidateSQL<Q_RecalcGetOrder, S>, true>>;
type _R_RecalcGetOrder = Expect<
    Equal<
        Flatten<GetReturnType<Q_RecalcGetOrder, S>>,
        Flatten<S["schemas"]["public"]["Network_Order"]>
    >
>;

// ---------------------------------------------------------------------------
// mirror of commerce reporting-v2 controller/order/set-pse.ts
// ---------------------------------------------------------------------------

// getCommissionRate() — history-rate lookup window
type Q_CommissionHistory = `
            select * from "Retailer_Commission_History"
            where "advertiserName" = $1 and "startedAt" <= $2 and "endedAt" >= $2
        `;
type _V_CommissionHistory = Expect<Equal<ValidateSQL<Q_CommissionHistory, S>, true>>;
type _R_CommissionHistory = Expect<
    Equal<
        Flatten<GetReturnType<Q_CommissionHistory, S>>,
        Flatten<S["schemas"]["public"]["Retailer_Commission_History"]>
    >
>;

// getCommissionRate() — current-rates fallback
type Q_CommissionCurrent = `
            select * from "Retailer_Commission"
            where "advertiserName" = $1
        `;
type _V_CommissionCurrent = Expect<Equal<ValidateSQL<Q_CommissionCurrent, S>, true>>;
type _R_CommissionCurrent = Expect<
    Equal<
        Flatten<GetReturnType<Q_CommissionCurrent, S>>,
        Flatten<S["schemas"]["public"]["Retailer_Commission"]>
    >
>;

// handler() — attach PSE to an existing unattributed click
type Q_AttachExistingClick = `
                update "LogProductClick"
                set "shopperId" = $1, "referenceUserId" = $1
                where "sid" = $2
            `;
type _V_AttachExistingClick = Expect<Equal<ValidateSQL<Q_AttachExistingClick, S>, true>>;

// handler() — synthesise a click row attributed to the PSE
type Q_InsertClick = `
                insert into "LogProductClick"
                ("createdAt", "sid", "shopperId", "referenceUserId")
                values ($1, $2, $3, $4)
            `;
type _V_InsertClick = Expect<Equal<ValidateSQL<Q_InsertClick, S>, true>>;

// handler() — point the order at the new click
type Q_OrderSetClick = `
                update "Network_Order" set "clickId" = $1 where "id" = $2
            `;
type _V_OrderSetClick = Expect<Equal<ValidateSQL<Q_OrderSetClick, S>, true>>;

// handler() — read the click's createdAt for the click-time rate lookup
type Q_ClickCreatedAt = `
                select "createdAt" from "LogProductClick" where "sid" = $1
            `;
type _V_ClickCreatedAt = Expect<Equal<ValidateSQL<Q_ClickCreatedAt, S>, true>>;
type _R_ClickCreatedAt = Expect<
    Equal<GetReturnType<Q_ClickCreatedAt, S>, { createdAt: string }>
>;

// handler() — persist both order- and click-side commission rates
type Q_OrderSetRates = `
                update "Network_Order"
                set "pseCommissionRate" = $1,
                    "pseCommissionRateClick" = $2
                where "id" = $3
            `;
type _V_OrderSetRates = Expect<Equal<ValidateSQL<Q_OrderSetRates, S>, true>>;

export type CommerceReportingV2PsePlainTestsPass = true;
