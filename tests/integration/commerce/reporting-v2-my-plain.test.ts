/**
 * Commerce reporting-v2 (my + analytics) — plain type-level mirrors.
 * COLLECTION / stress-test pass; reds => engine fix-list.
 *
 * Source area: reporting-v2 controllers under controller/my/* and
 * controller/analytics/return-durations.ts. Every raw SQL query is mirrored
 * here with a ValidateSQL=true assertion plus a GetReturnType assertion where
 * the row shape is determinable. Dynamic SQL is materialized to a
 * representative static form (// materialized from dynamic source).
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { ReportingV2Schema } from "../../fixtures/reporting-v2-schema.js";

type S = ReportingV2Schema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;
// Flatten collapses an intersection table type (Base & { extras }) into a flat
// object so the strict Equal helper matches a structurally identical select-* row.
type Flatten<T> = { [K in keyof T]: T[K] };

// ===========================================================================
// controller/my/credit-notes.ts
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/my/credit-notes.ts action() ---
type Q_CreditNotes = `
        select i.id, i.amount, i.vat, i.currency, i."createdAt"
        from "Revolut_PaymentCreditNote" i
        where i."userId" = $1
        order by "createdAt" desc
        limit $2 offset $3
    `;
type _V_CreditNotes = Expect<Equal<ValidateSQL<Q_CreditNotes, S>, true>>;
type _R_CreditNotes = Expect<
    Equal<
        GetReturnType<Q_CreditNotes, S>,
        {
            id: string;
            amount: number;
            vat: number;
            currency: string;
            createdAt: string;
        }
    >
>;

// ===========================================================================
// controller/my/download-credit-note.ts
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/my/download-credit-note.ts getCreditNote() ---
type Q_DownloadCreditNote = `
        select * from "Revolut_PaymentCreditNote"
        WHERE "id" = $1
    `;
type _V_DownloadCreditNote = Expect<Equal<ValidateSQL<Q_DownloadCreditNote, S>, true>>;
type _R_DownloadCreditNote = Expect<
    Equal<
        GetReturnType<Q_DownloadCreditNote, S>,
        S["schemas"]["public"]["Revolut_PaymentCreditNote"]
    >
>;

// ===========================================================================
// controller/my/download-invoice.ts
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/my/download-invoice.ts getInvoice() ---
type Q_DownloadInvoice = `
        select * from "Revolut_PaymentInvoice"
        WHERE "id" = $1
    `;
type _V_DownloadInvoice = Expect<Equal<ValidateSQL<Q_DownloadInvoice, S>, true>>;
type _R_DownloadInvoice = Expect<
    Equal<
        GetReturnType<Q_DownloadInvoice, S>,
        Flatten<S["schemas"]["public"]["Revolut_PaymentInvoice"]>
    >
>;

// ===========================================================================
// controller/my/invoices.ts  (createSelectQuery in source; mirrored as raw SQL)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/my/invoices.ts action() ---
// materialized from dynamic source: !period && start && end branches included;
// the .applyIf(period) period-window branch omitted (period absent).
type Q_Invoices = `
        select i.id, i.amount, i.vat, i.currency, i."createdAt"
        from "Revolut_PaymentInvoice" i
        where i."userId" = $1
        and i."status" = 'active'
        and i."createdAt" >= $2
        and i."createdAt" <= $3
        order by i."createdAt" desc
        limit 20 offset 0
    `;
type _V_Invoices = Expect<Equal<ValidateSQL<Q_Invoices, S>, true>>;
type _R_Invoices = Expect<
    Equal<
        GetReturnType<Q_Invoices, S>,
        {
            id: string;
            amount: number;
            vat: number;
            currency: string;
            createdAt: string;
        }
    >
>;

// ===========================================================================
// controller/my/payments-summary.ts  (createSelectQuery in source; mirrored raw)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/my/payments-summary.ts action() ---
// materialized from dynamic source: convertToCurrency='GBP' (so currency cast
// branch included, p.currency branch omitted); startDate && endDate present.
// convert_currency() is an unmodeled function -> ambiguous -> unknown.
type Q_PaymentsSummary = `
        select
            array_agg(p."id")::text[] as "paymentIds",
            sum(
                convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) +
                convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date)
            )::float8 as "total",
            sum(
                convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) +
                convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date)
            )::float8 as "amount",
            sum(
                convert_currency(p."amount"::numeric, p."currency", 'GBP'::text, p."createdAt"::date) +
                convert_currency(p."vat"::numeric, p."currency", 'GBP'::text, p."createdAt"::date)
            )::float8 as "vat",
            'GBP'::text as "currency"
        from "Revolut_PaymentDraft" p
        where p."createdAt" between $2 and $3
        and p."userId" = $1
        and p."status" = 'COMPLETED'
    `;
type _V_PaymentsSummary = Expect<Equal<ValidateSQL<Q_PaymentsSummary, S>, true>>;
// total/amount/vat are sum(...)::float8 -> number; paymentIds is array_agg(...)::text[];
// currency is a string literal cast -> string.
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
// controller/my/stats.ts  (4 count(*) queries; createSelectQuery in source)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/my/stats.ts getNumberOfLinks() ---
type Q_StatsLinks = `
        select count(*)::int as "cnt"
        from "Link" l
        where l."referenceUserId" = $1
    `;
type _V_StatsLinks = Expect<Equal<ValidateSQL<Q_StatsLinks, S>, true>>;
type _R_StatsLinks = Expect<
    Equal<GetReturnType<Q_StatsLinks, S>, { cnt: number }>
>;

// --- mirror of commerce reporting-v2 controller/my/stats.ts getNumberOfConsultations() ---
type Q_StatsConsultations = `
        select count(*)::int as "cnt"
        from "Consultation" c
        where c."friId" = $1
    `;
type _V_StatsConsultations = Expect<Equal<ValidateSQL<Q_StatsConsultations, S>, true>>;
type _R_StatsConsultations = Expect<
    Equal<GetReturnType<Q_StatsConsultations, S>, { cnt: number }>
>;

// --- mirror of commerce reporting-v2 controller/my/stats.ts getNumberOfMoodboards() ---
type Q_StatsMoodboards = `
        select count(*)::int as "cnt"
        from "Moodboard" m
        where m."friId" = $1
    `;
type _V_StatsMoodboards = Expect<Equal<ValidateSQL<Q_StatsMoodboards, S>, true>>;
type _R_StatsMoodboards = Expect<
    Equal<GetReturnType<Q_StatsMoodboards, S>, { cnt: number }>
>;

// --- mirror of commerce reporting-v2 controller/my/stats.ts getNumberOfLooks() ---
type Q_StatsLooks = `
        select count(*)::int as "cnt"
        from "Look" l
        where l."friId" = $1
    `;
type _V_StatsLooks = Expect<Equal<ValidateSQL<Q_StatsLooks, S>, true>>;
type _R_StatsLooks = Expect<
    Equal<GetReturnType<Q_StatsLooks, S>, { cnt: number }>
>;

// ===========================================================================
// controller/my/upcoming-invoice.ts  (UNION ALL of two itemized selects)
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/my/upcoming-invoice.ts action() ---
type Q_UpcomingInvoice = `
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
        where uap."userId" = $1
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
        where uap."userId" = $1
            and uap."paid" = false
            and uap."status" in ('approved', 're-approved', 'created', 'pending')
            and uap."networkOrderId" is null

        order by "createdAt" desc
    `;
type _V_UpcomingInvoice = Expect<Equal<ValidateSQL<Q_UpcomingInvoice, S>, true>>;
// TODO(return-type): UNION ALL row shape across coalesce/null-casts/left-join
// nullability is not asserted here — only validity. Source expects
// { id; amount; vat; currency; createdAt; sku; name; retailer; orderId; orderDate }.

// ===========================================================================
// controller/analytics/return-durations.ts
// ===========================================================================

// --- mirror of commerce reporting-v2 controller/analytics/return-durations.ts rakutenReturnDurations ---
type Q_RakutenReturns = `
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
`;
type _V_RakutenReturns = Expect<Equal<ValidateSQL<Q_RakutenReturns, S>, true>>;
type _R_RakutenReturns = Expect<
    Equal<
        GetReturnType<Q_RakutenReturns, S>,
        { max_duration: number; avg_duration: number }
    >
>;

// --- mirror of commerce reporting-v2 controller/analytics/return-durations.ts rakutenReturnDurationsByAdvertiser ---
type Q_RakutenReturnsByAdv = `
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
`;
type _V_RakutenReturnsByAdv = Expect<Equal<ValidateSQL<Q_RakutenReturnsByAdv, S>, true>>;
// TODO(return-type): `advertiser` is sourced from a derived subquery column
// (aliased from o.advertiser); max/avg are ::int -> number. Asserting validity only.

// --- mirror of commerce reporting-v2 controller/analytics/return-durations.ts cjReturnDurations ---
type Q_CjReturns = `
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
`;
type _V_CjReturns = Expect<Equal<ValidateSQL<Q_CjReturns, S>, true>>;
type _R_CjReturns = Expect<
    Equal<
        GetReturnType<Q_CjReturns, S>,
        { avg_duration: number; max_duration: number }
    >
>;

// --- mirror of commerce reporting-v2 controller/analytics/return-durations.ts cjReturnDurationsByAdvertiser ---
type Q_CjReturnsByAdv = `
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
`;
type _V_CjReturnsByAdv = Expect<Equal<ValidateSQL<Q_CjReturnsByAdv, S>, true>>;
// TODO(return-type): advertiser derived via (array_agg(advertiser))[1]; validity only.

// --- mirror of commerce reporting-v2 controller/analytics/return-durations.ts partnerizeReturnDurations ---
type Q_PartnerizeReturns = `
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
`;
type _V_PartnerizeReturns = Expect<Equal<ValidateSQL<Q_PartnerizeReturns, S>, true>>;
type _R_PartnerizeReturns = Expect<
    Equal<
        GetReturnType<Q_PartnerizeReturns, S>,
        { avg_duration: number; max_duration: number }
    >
>;

// --- mirror of commerce reporting-v2 controller/analytics/return-durations.ts partnerizeReturnDurationsByAdvertiser ---
type Q_PartnerizeReturnsByAdv = `
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
`;
type _V_PartnerizeReturnsByAdv = Expect<
    Equal<ValidateSQL<Q_PartnerizeReturnsByAdv, S>, true>
>;
// TODO(return-type): advertiser carried through CTE chain; validity only.

export type CommerceReportingV2MyPlainTestsPass = true;
