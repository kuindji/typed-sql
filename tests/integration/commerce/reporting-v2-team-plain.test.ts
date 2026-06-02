/**
 * Commerce reporting-v2 team controllers — plain type-level mirrors.
 * COLLECTION / stress-test pass: assertions encode the INTENDED behavior;
 * reds => engine fix-list. Do not weaken intended assertions.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    ReportingV2Schema,
    ReportingV2CatalogueSchema,
} from "../../fixtures/reporting-v2-schema.js";

type S = ReportingV2Schema;
// (catalogue schema unused here but kept for parity with sibling files)
type _C = ReportingV2CatalogueSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;
// Flatten collapses an intersection table type (Base & { extras }) into a flat
// object so the strict Equal helper matches a structurally identical select-* row.
type Flatten<T> = { [K in keyof T]: T[K] };

// ===========================================================================
// controller/team/add-payment.ts  (db.main.run, DML INSERT)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/team/add-payment.ts handler() ---
// Team-attributed extra payment: userId null, type literal 3.
type Q_AddPayment = `
        insert into "User_ApprovedPayment"
        ("userId", "teamId", amount, vat, comment, currency, type)
        values (null, $1, $2, $3, $4, $5, 3)
    `;
type _V_AddPayment = Expect<Equal<ValidateSQL<Q_AddPayment, S>, true>>;

// ===========================================================================
// controller/team/download-invoice.ts  (db.main.typedSelect)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/team/download-invoice.ts getInvoice() ---
// i.* from Revolut_PaymentInvoice + coalesce(i."teamId", tm."teamId") via LEFT JOIN.
type Q_DownloadInvoice = `
        select i.*, coalesce(i."teamId", tm."teamId") as "resolvedTeamId"
        from "Revolut_PaymentInvoice" i
        left join "Team_Member" tm on tm."userId" = i."userId"
        where i."id" = $1
    `;
type _V_DownloadInvoice = Expect<Equal<ValidateSQL<Q_DownloadInvoice, S>, true>>;
// i.* expands to the full Revolut_PaymentInvoice row; resolvedTeamId is
// coalesce(i.teamId [string|null], tm.teamId [string, left-joined => string|null]).
// Both args nullable => result nullable (Postgres coalesce semantics).
type _R_DownloadInvoice = Expect<
    Equal<
        GetReturnType<Q_DownloadInvoice, S>,
        Flatten<
            S["schemas"]["public"]["Revolut_PaymentInvoice"] & {
                resolvedTeamId: string | null;
            }
        >
    >
>;

// ===========================================================================
// controller/team/invoices.ts  (db.main.typedSelect via builder)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/team/invoices.ts action() ---
// materialized from dynamic source: builder query with applyIf(period) +
// whereIf(start)/whereIf(end). Representative form resolves period=false and
// keeps the unconditional teamId/status filters plus a start/end range.
type Q_Invoices = `
        select i.id, i.amount, i.vat, i.currency, i."createdAt"
        from "Revolut_PaymentInvoice" i
        where i."status" = 'active'
          and i."teamId" = $1
          and i."createdAt" >= $2
          and i."createdAt" <= $3
        order by i."createdAt" desc
        limit 20
        offset 0
    `;
type _V_Invoices = Expect<Equal<ValidateSQL<Q_Invoices, S>, true>>;
type _R_Invoices = Expect<
    Equal<
        GetReturnType<Q_Invoices, S>,
        { id: string; amount: number; vat: number; currency: string; createdAt: string }
    >
>;

// ===========================================================================
// controller/team/payments-summary.ts  (db.main.typedSelect via builder)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/team/payments-summary.ts action() ---
// materialized from dynamic source: convertToCurrency='GBP' (so the '...'::text
// literal currency branch is kept and p.currency branch dropped); date range
// materialized to the BETWEEN branch.
type Q_PaymentsSummary = `
        select
            array_agg(p."id")::text[] as "paymentIds",
            sum(
                convert_currency(
                    p."amount"::numeric,
                    p."currency",
                    'GBP'::text,
                    p."createdAt"::date
                ) +
                convert_currency(
                    p."vat"::numeric,
                    p."currency",
                    'GBP'::text,
                    p."createdAt"::date
                )
            )::float8 as "total",
            sum(
                convert_currency(
                    p."amount"::numeric,
                    p."currency",
                    'GBP'::text,
                    p."createdAt"::date
                )
            )::float8 as "amount",
            sum(
                convert_currency(
                    p."vat"::numeric,
                    p."currency",
                    'GBP'::text,
                    p."createdAt"::date
                )
            )::float8 as "vat",
            'GBP'::text as "currency"
        from "Revolut_PaymentDraft" p
        where p."teamId" = $1
          and p."status" = 'COMPLETED'
          and p."createdAt" between $2 and $3
    `;
type _V_PaymentsSummary = Expect<Equal<ValidateSQL<Q_PaymentsSummary, S>, true>>;
// paymentIds is array_agg(...)::text[]; total/amount/vat are sum(...)::float8;
// currency is a ::text-cast string literal => string.
type _R_PaymentsSummary = Expect<
    Equal<
        GetReturnType<Q_PaymentsSummary, S>,
        {
            paymentIds: string[];
            total: number;
            amount: number;
            vat: number;
            currency: string;
        }
    >
>;

// ===========================================================================
// controller/team/pse-overview.ts  (db.main.typedSelect)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/team/pse-overview.ts fetchPseInfo() ---
// Team_Member-driven join chain with two left joins and convert_currency casts.
type Q_PseOverview = `
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
                $1::text,
                current_date
            )::float8 as "annualSalesTarget",
            convert_currency(
                tms."monthlySalesTarget"::numeric,
                tms."currency"::text,
                $1::text,
                current_date
            )::float8 as "monthlySalesTarget",
            tms."currency" as "targetCurrency"
        from "Team_Member" tm
        join "User" pse on pse."id" = tm."userId"
        left join "Team_Member_SalesTarget" tms on tms."teamId" = tm."teamId" and tms."pseId" = pse."id"
        left join "Team_Role" tr on tr."id" = tm."teamRoleId"
        where tm."teamId" = $2
    `;
type _V_PseOverview = Expect<Equal<ValidateSQL<Q_PseOverview, S>, true>>;
// Row shape:
//  pseId       <- pse.id (User.id: string)
//  pseName     <- (concat)::text => string
//  pseGivenName<- pse.givenName: string | null
//  pseFamilyName<- pse.familyName: string | null
//  avatar      <- pse.avatar: string | null
//  teamRoleId  <- tm.teamRoleId: string | null
//  teamRole    <- tr.name (Team_Role.name: string, left-joined => string | null)
//  annual/monthly <- convert_currency(...)::float8 => number
//  targetCurrency <- tms.currency (string, left-joined => string | null)
type _R_PseOverview = Expect<
    Equal<
        GetReturnType<Q_PseOverview, S>,
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

// ===========================================================================
// controller/team/stats.ts  (db.main.typedSelect via builder, 4 count queries)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/team/stats.ts getNumberOfLinks() ---
// materialized from dynamic source: pseId provided so whereIf(pseId) kept.
type Q_StatsLinks = `
        select count(*)::int as "cnt"
        from "Link" l
        join "Team_Member" tm on tm."userId" = l."referenceUserId"
        where tm."teamId" = $1
          and l."referenceUserId" = $2
    `;
type _V_StatsLinks = Expect<Equal<ValidateSQL<Q_StatsLinks, S>, true>>;
type _R_StatsLinks = Expect<
    Equal<GetReturnType<Q_StatsLinks, S>, { cnt: number }>
>;

// --- mirror of commerce reporting-v2 controller/team/stats.ts getNumberOfConsultations() ---
type Q_StatsConsultations = `
        select count(*)::int as "cnt"
        from "Consultation" c
        join "Team_Member" tm on tm."userId" = c."friId"
        where tm."teamId" = $1
          and c."friId" = $2
    `;
type _V_StatsConsultations = Expect<
    Equal<ValidateSQL<Q_StatsConsultations, S>, true>
>;
type _R_StatsConsultations = Expect<
    Equal<GetReturnType<Q_StatsConsultations, S>, { cnt: number }>
>;

// --- mirror of commerce reporting-v2 controller/team/stats.ts getNumberOfMoodboards() ---
type Q_StatsMoodboards = `
        select count(*)::int as "cnt"
        from "Moodboard" m
        join "Team_Member" tm on tm."userId" = m."friId"
        where tm."teamId" = $1
          and m."friId" = $2
    `;
type _V_StatsMoodboards = Expect<
    Equal<ValidateSQL<Q_StatsMoodboards, S>, true>
>;
type _R_StatsMoodboards = Expect<
    Equal<GetReturnType<Q_StatsMoodboards, S>, { cnt: number }>
>;

// --- mirror of commerce reporting-v2 controller/team/stats.ts getNumberOfLooks() ---
type Q_StatsLooks = `
        select count(*)::int as "cnt"
        from "Look" l
        join "Team_Member" tm on tm."userId" = l."friId"
        where tm."teamId" = $1
          and l."friId" = $2
    `;
type _V_StatsLooks = Expect<Equal<ValidateSQL<Q_StatsLooks, S>, true>>;
type _R_StatsLooks = Expect<
    Equal<GetReturnType<Q_StatsLooks, S>, { cnt: number }>
>;

// ===========================================================================
// controller/team/target.ts  (db.main.typedSelect via builder, 2 branches)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/team/target.ts main() — no-pseId branch ---
// materialized from dynamic source: convertToCurrency provided (selectIf-true
// converted columns kept; plain "annual/monthly/currency" columns dropped).
type Q_TargetTeam = `
        select
            "teamId",
            convert_currency(
                "annualSalesTarget"::numeric,
                "currency",
                $1,
                current_date
            )::float8 as "annualSalesTarget",
            convert_currency(
                "monthlySalesTarget"::numeric,
                "currency",
                $1,
                current_date
            )::float8 as "monthlySalesTarget",
            $1 as "currency",
            "updatedAt"
        from "Team_SalesTarget"
        where "teamId" = $1
    `;
type _V_TargetTeam = Expect<Equal<ValidateSQL<Q_TargetTeam, S>, true>>;

// --- mirror of commerce reporting-v2 controller/team/target.ts main() — pseId branch ---
// materialized from dynamic source: convertToCurrency provided (selectIf-true
// converted columns kept; plain columns dropped).
type Q_TargetPse = `
        select
            "teamId",
            "pseId",
            convert_currency(
                "annualSalesTarget"::numeric,
                "currency",
                $1,
                current_date
            )::float8 as "annualSalesTarget",
            convert_currency(
                "monthlySalesTarget"::numeric,
                "currency",
                $1,
                current_date
            )::float8 as "monthlySalesTarget",
            $1 as "currency",
            "updatedAt"
        from "Team_Member_SalesTarget"
        where "teamId" = $2
          and "pseId" = $3
    `;
type _V_TargetPse = Expect<Equal<ValidateSQL<Q_TargetPse, S>, true>>;
// teamId/pseId/updatedAt from schema (string); annual/monthly => ::float8 number;
// currency <- $1 param positional => unknown (untyped placeholder projection).
type _R_TargetPse = Expect<
    Equal<
        GetReturnType<Q_TargetPse, S>,
        {
            teamId: string;
            pseId: string;
            annualSalesTarget: number;
            monthlySalesTarget: number;
            currency: unknown;
            updatedAt: string;
        }
    >
>;

// ===========================================================================
// controller/team/upcoming-invoice.ts  (db.main.select, raw multi-join SELECT)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/team/upcoming-invoice.ts action() ---
// materialized from dynamic source: userFilter included (userId provided => $2).
type Q_UpcomingInvoice = `
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
          and uap."userId" = $2
        order by "pseName", uap."createdAt" desc
    `;
type _V_UpcomingInvoice = Expect<
    Equal<ValidateSQL<Q_UpcomingInvoice, S>, true>
>;
// Highly conditional projection (nested coalesce/nullif/trim over left-joined
// columns). A `::text` cast does NOT strip nullability — coalesce is nullable
// iff every arg is nullable (Postgres semantics). So:
//   - id/amount/vat/currency coalesce a left-joined item col with a non-null
//     uap col => stay non-null.
//   - retailer = coalesce(o.advertiser, '')::text and pseName = coalesce(.., 'Team
//     Payment')::text each have a non-null literal arg => non-null string.
//   - sku = coalesce(ri.sku, ci.sku, pi.sku)::text — all three from left-joined
//     tables => all nullable => string | null.
//   - name = coalesce(ri.product, pi.name, uap.comment)::text — uap.comment is
//     schema-nullable, ri/pi left-joined => all nullable => string | null.
//   - raw left-joined o."orderId"/o."orderDate" => string | null.
//   - uap."createdAt" => string.
type _R_UpcomingInvoice = Expect<
    Equal<
        GetReturnType<Q_UpcomingInvoice, S>,
        {
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
        }
    >
>;

export type CommerceReportingV2TeamPlainTestsPass = true;
