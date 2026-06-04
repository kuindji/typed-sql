/**
 * Commerce query fixtures.
 *
 * Queries are copied from the commerce app.
 * These tests assert that typed-sql can validate the project's raw SQL and
 * infer useful row shapes from the generated main/catalogue database schemas.
 */

import type {
    ExtractParams,
    GetReturnType,
    ValidateSQL,
    ValidQuery,
} from "../../../src/index.js";
import type {
    CommerceCatalogueSchema,
    CommerceMainSchema,
} from "../../fixtures/commerce-schema.js";

type Main = CommerceMainSchema;
type Catalogue = CommerceCatalogueSchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
)
    ? true
    : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// packages/common/src/api/middleware/internalCatalogueApiKey.ts
// ---------------------------------------------------------------------------

type Q_InternalCatalogueApiKey = `
    SELECT api_key_id FROM api_key_settings WHERE internal = true LIMIT 1
`;
type _V1 = Expect<Equal<ValidateSQL<Q_InternalCatalogueApiKey, Catalogue>, true>>;
type _R1 = Expect<
    Equal<GetReturnType<Q_InternalCatalogueApiKey, Catalogue>, { api_key_id: string }>
>;

// ---------------------------------------------------------------------------
// serverless/cron/delete-deactivated-users/src/index.ts
// ---------------------------------------------------------------------------

type Q_DeleteDeactivatedUsers = `
    delete from "User"
    where "enabled" = false
    and "deactivatedAt" is not null
    and "deactivatedAt" < $1
`;
type _V2 = Expect<Equal<ValidateSQL<Q_DeleteDeactivatedUsers, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/cron/cognito-reset-tmp-password/src/index.ts
// ---------------------------------------------------------------------------

type Q_SelectPasswordResets = `select * from "User_Password_Reset"`;
type _V3 = Expect<Equal<ValidateSQL<Q_SelectPasswordResets, Main>, true>>;
type _R3 = Expect<
    Equal<
        GetReturnType<Q_SelectPasswordResets, Main>,
        Main["schemas"]["public"]["User_Password_Reset"]
    >
>;

type Q_UpdatePasswordReset = `
    update "User_Password_Reset" 
    set 
        "updatedAt" = now(), 
        "tempPassword" = $1
    where "userId" = $2
`;
type _V4 = Expect<Equal<ValidateSQL<Q_UpdatePasswordReset, Main>, true>>;

type Q_SelectUserIdByEmail = `select "id" from "User" where "email" = $1`;
type _V5 = Expect<Equal<ValidateSQL<Q_SelectUserIdByEmail, Main>, true>>;
type _R5 = Expect<Equal<GetReturnType<Q_SelectUserIdByEmail, Main>, { id: string }>>;

type Q_InsertPasswordReset = `
    insert into "User_Password_Reset" 
    ("userId", "tempPassword", "email", "updatedAt")
    values
    ($1, $2, $3, now())
`;
type _V6 = Expect<Equal<ValidateSQL<Q_InsertPasswordReset, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/cron/get-exchange-rates/src/index.ts
// ---------------------------------------------------------------------------

type Q_InsertExchangeRateHistory = `
    insert into "ExchangeRate_History" ("from", "to", "rate", "date")
    values ($1, $2, $3, $4)
    on conflict ("date", "from", "to") do nothing;
`;
type _V7 = Expect<Equal<ValidateSQL<Q_InsertExchangeRateHistory, Main>, true>>;

type Q_UpsertExchangeRate = `
    insert into "ExchangeRate" ("from", "to", "rate", "updatedAt")
    values ($1, $2, $3, $4)
    on conflict ("from", "to") do update set "rate" = $3, "updatedAt" = $4;
`;
type _V8 = Expect<Equal<ValidateSQL<Q_UpsertExchangeRate, Main>, true>>;

type Q_SelectExchangeRates = `select * from "ExchangeRate"`;
type _V9 = Expect<Equal<ValidateSQL<Q_SelectExchangeRates, Main>, true>>;
type _R9 = Expect<
    Equal<GetReturnType<Q_SelectExchangeRates, Main>, Main["schemas"]["public"]["ExchangeRate"]>
>;

// ---------------------------------------------------------------------------
// serverless/cron/revolut-draft-state/src/index.ts
// ---------------------------------------------------------------------------

type Q_DeleteRevolutDraft = `
    delete from "Revolut_PaymentDraft"
    where "id" = $1
`;
type _V10 = Expect<Equal<ValidateSQL<Q_DeleteRevolutDraft, Main>, true>>;

type Q_SelectStaleRevolutDrafts = `
    select * from "Revolut_PaymentDraft"
    where "status" in ('CREATED', 'PENDING')
    and "createdAt" < $1
`;
type _V11 = Expect<Equal<ValidateSQL<Q_SelectStaleRevolutDrafts, Main>, true>>;
type _R11 = Expect<
    Equal<
        GetReturnType<Q_SelectStaleRevolutDrafts, Main>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type Q_MarkRevolutDraftNotFound = `
    update "Revolut_PaymentDraft"
    set "status" = 'NOTFOUND'
    where "id" = $1
`;
type _V12 = Expect<Equal<ValidateSQL<Q_MarkRevolutDraftNotFound, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/revolut/src/controller/webhook.ts
// ---------------------------------------------------------------------------

type Q_SelectDraftByTransactionId = `
    select * from "Revolut_PaymentDraft"
    where "transactionId" = $1
`;
type _V13 = Expect<Equal<ValidateSQL<Q_SelectDraftByTransactionId, Main>, true>>;
type _R13 = Expect<
    Equal<
        GetReturnType<Q_SelectDraftByTransactionId, Main>,
        Main["schemas"]["public"]["Revolut_PaymentDraft"]
    >
>;

type Q_SelectDraftById = `
    select * from "Revolut_PaymentDraft"
    where id = $1
`;
type _V14 = Expect<Equal<ValidateSQL<Q_SelectDraftById, Main>, true>>;
type _R14 = Expect<
    Equal<GetReturnType<Q_SelectDraftById, Main>, Main["schemas"]["public"]["Revolut_PaymentDraft"]>
>;

type Q_SetCommissionsPaid = `
    update "User_ApprovedPayment"
    set "paid" = true
    where "revolutDraftId" = $1
`;
type _V15 = Expect<Equal<ValidateSQL<Q_SetCommissionsPaid, Main>, true>>;

type Q_InsertRevolutDraftHistory = `
    insert into "Revolut_PaymentDraft_History" 
    ("revolutDraftId", "data", "createdAt")
    values ($1, $2, $3)
`;
type _V16 = Expect<Equal<ValidateSQL<Q_InsertRevolutDraftHistory, Main>, true>>;

type Q_UpdateDraftTransaction = `
    update "Revolut_PaymentDraft"
    set "transactionId" = $1
    where id = $2
`;
type _V17 = Expect<Equal<ValidateSQL<Q_UpdateDraftTransaction, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/controller/pse/payment-status.ts
// ---------------------------------------------------------------------------

type Q_SelectApprovedPayment = `select * from "User_ApprovedPayment" where id = $1`;
type _V18 = Expect<Equal<ValidateSQL<Q_SelectApprovedPayment, Main>, true>>;
type _R18 = Expect<
    Equal<
        GetReturnType<Q_SelectApprovedPayment, Main>,
        Main["schemas"]["public"]["User_ApprovedPayment"]
    >
>;

type Q_SetApprovedPaymentPaid = `
    update "User_ApprovedPayment" 
    set "paid" = true, "status" = 'paid' 
    where id = $1
`;
type _V19 = Expect<Equal<ValidateSQL<Q_SetApprovedPaymentPaid, Main>, true>>;

type Q_DeleteApprovedPayment = `
    delete from "User_ApprovedPayment" 
    where id = $1
`;
type _V20 = Expect<Equal<ValidateSQL<Q_DeleteApprovedPayment, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/controller/analytics/return-durations.ts
// ---------------------------------------------------------------------------

type Q_RakutenReturnDurations = `
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
type _V21 = Expect<Equal<ValidateSQL<Q_RakutenReturnDurations, Main>, true>>;

type Q_RakutenReturnDurationsByAdvertiser = `
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
type _V21a = Expect<Equal<ValidateSQL<Q_RakutenReturnDurationsByAdvertiser, Main>, true>>;

type Q_CjReturnDurations = `
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
type _V22 = Expect<Equal<ValidateSQL<Q_CjReturnDurations, Main>, true>>;

type Q_CjReturnDurationsByAdvertiser = `
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
type _V22a = Expect<Equal<ValidateSQL<Q_CjReturnDurationsByAdvertiser, Main>, true>>;

type Q_PartnerizeReturnDurations = `
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
type _V23a = Expect<Equal<ValidateSQL<Q_PartnerizeReturnDurations, Main>, true>>;

type Q_PartnerizeReturnDurationsByAdvertiser = `
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
type _V23 = Expect<Equal<ValidateSQL<Q_PartnerizeReturnDurationsByAdvertiser, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/lib/pseRaw.ts
// ---------------------------------------------------------------------------

type Q_PseRawStatsStaticExpansion = `
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
                and look."createdAt" between $1 and $2
        ) as "looks",

        (
            select count(*)
            from "Link" link
            where link."referenceUserId" = u.id 
                and link."createdAt" between $1 and $2
        ) as "links",

        (
            select count(*)
            from "LogProductClick" lpc 
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id
                and lpc."createdAt" between $1 and $2
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
`;
type _V24 = Expect<Equal<ValidateSQL<Q_PseRawStatsStaticExpansion, Main>, true>>;

type Q_PseRawStatsFullStaticExpansion = `
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
                and look."createdAt" between $1 and $2
        ) as "looks",

        (
            select count(*)
            from "Link" link
            where link."referenceUserId" = u.id 
                and link."createdAt" between $1 and $2
        ) as "links",

        (
            select count(*) 
            from "Consultation" c 
            where c."friId" = u.id 
                and c."createdAt" between $1 and $2
        ) as "consultations",

        (
            select count(*) 
            from "Moodboard" m 
            where m."friId" = u.id 
                and m."createdAt" between $1 and $2
        ) as "moodboards",

        (
            select count(*)
            from "LogProductClick" lpc 
            where lpc."shopperId" = u.id
                and lpc."createdAt" between $1 and $2
        ) as "clicks",

        (
            select count(*)
            from "LogProductClick" lpc 
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id
                and lpc."createdAt" between $1 and $2
        ) as "orders",

        (
            select count(*)
            from "LogProductClick" lpc 
            where lpc."shopperId" = u.id and lpc."linkId" is not null
                and lpc."createdAt" between $1 and $2
        ) as "linkClicks",

        (
            select count(*)
            from "LogProductClick" lpc 
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id and lpc."linkId" is not null
                and lpc."createdAt" between $1 and $2
        ) as "linkOrders",

        (
            select count(*)
            from "LogProductClick" lpc 
            where lpc."shopperId" = u.id and lpc."productId" is not null
                and lpc."createdAt" between $1 and $2
        ) as "lookClicks",

        (
            select count(*)
            from "LogProductClick" lpc 
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id and lpc."productId" is not null
                and lpc."createdAt" between $1 and $2
        ) as "lookOrders",

        (
            select count(*)
            from "LogProductClick" lpc 
            where lpc."shopperId" = u.id and lpc."moodboardId" is not null
                and lpc."createdAt" between $1 and $2
        ) as "moodboardClicks",

        (
            select count(*)
            from "LogProductClick" lpc 
            join "Network_Order" ordr on ordr."clickId" = lpc.sid
            where lpc."shopperId" = u.id and lpc."moodboardId" is not null
                and lpc."createdAt" between $1 and $2
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
                and lpc."createdAt" between $1 and $2
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
type _V24a = Expect<Equal<ValidateSQL<Q_PseRawStatsFullStaticExpansion, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/lib/pseAgg.ts
// ---------------------------------------------------------------------------

type Q_ApprovedPseCycleStats = `
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
`;
type _V25 = Expect<Equal<ValidateSQL<Q_ApprovedPseCycleStats, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/controller/team/pse-overview.ts
// ---------------------------------------------------------------------------

type Q_TeamPseInfo = `
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
type _V26 = Expect<Equal<ValidateSQL<Q_TeamPseInfo, Main>, true>>;
type _R26 = Expect<
    Equal<
        GetReturnType<Q_TeamPseInfo, Main>,
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

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/controller/my/upcoming-invoice.ts
// ---------------------------------------------------------------------------

type Q_PersonalUpcomingInvoiceItems = `
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
type _V27 = Expect<Equal<ValidateSQL<Q_PersonalUpcomingInvoiceItems, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/controller/team/upcoming-invoice.ts
// ---------------------------------------------------------------------------

type Q_TeamUpcomingInvoiceItems = `
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
type _V28 = Expect<Equal<ValidateSQL<Q_TeamUpcomingInvoiceItems, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/lib/psePayments.ts
// ---------------------------------------------------------------------------

type Q_PsePaymentsTeamSummary = `
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
`;
type _V29 = Expect<Equal<ValidateSQL<Q_PsePaymentsTeamSummary, Main>, true>>;

type Q_OrderLateReturnRollup = `
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
`;
type _V30 = Expect<Equal<ValidateSQL<Q_OrderLateReturnRollup, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/controller/pse/awaiting-by-team.ts
// ---------------------------------------------------------------------------

type Q_PseAwaitingByTeamRollup = `
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
type _V30a = Expect<Equal<ValidateSQL<Q_PseAwaitingByTeamRollup, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/lib/orders.ts
// ---------------------------------------------------------------------------

type Q_FetchOrdersStaticExpansion = `
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
        ordr."saleAmount"::float8 as "saleAmount",
        convert_currency(
            (ordr."saleAmount")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "saleAmountGBP",
        ordr."grossCommissionAmount"::float8 as "grossCommissionAmount",
        convert_currency(
            (ordr."grossCommissionAmount")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "grossCommissionAmountGBP",
        (ordr."grossCommissionAmount" * ordr."pseCommissionRate")::float8
            as "pseGrossCommissionAmount",
        convert_currency(
            (ordr."grossCommissionAmount" * ordr."pseCommissionRate")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "pseGrossCommissionAmountGBP",
        ordr."commissionAmount"::float8 as "commissionAmount",
        convert_currency(
            (ordr."commissionAmount")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "commissionAmountGBP",
        (ordr."commissionAmount" * ordr."pseCommissionRate")::float8
            as "pseCommissionAmount",
        convert_currency(
            (ordr."commissionAmount" * ordr."pseCommissionRate")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "pseCommissionAmountGBP",
        ordr."pseBalance"::float8 as "pseBalance",
        convert_currency(
            (ordr."pseBalance")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "pseBalanceGBP",
        (
            ordr."pseBalance"
            * (
                case
                    when coalesce("teamPaymentSettings"."vatEnabled", "psePaymentSettings"."vatEnabled") is true
                    then 0.2
                    else 0
                end
            )
        )::float8 as "pseBalanceVatAmount",
        (
            ordr."pseBalance"
            * (
                case
                    when coalesce("teamPaymentSettings"."vatEnabled", "psePaymentSettings"."vatEnabled") is true
                    then 1.2
                    else 1
                end
            )
        )::float8 as "pseBalanceWithVat",
        ordr."currency",
        null as "convertedFromCurrency",
        ordr."status" as "affiliateStatus",
        ordr."autoApprovedAt",
        ordr."manualStatus",
        ordr."internalStatus",
        ordr."psePaymentStatus",
        ordr."manualPsePaymentStatus",
        ordr."networkId",
        ordr."advertiser",
        ordr."details",
        ordr."pseCommissionRate",
        ordr."pseCommissionRateClick",
        ordr."retailerCommissionRate",
        ordr."retailerCommissionRateClick",
        ordr."notes",
        ordr."affiliatePaymentStatus",
        ordr."manualAffiliatePaymentStatus",
        ordr."affiliatePaymentDate",
        ordr."affiliateRefundStatus",
        ordr."manualAffiliateRefundStatus",
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
        ) as "lateReturn",
        ordr."manualPseBalance"::float8 as "manualPseBalance",
        convert_currency(
            (ordr."manualPseBalance")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "manualPseBalanceGBP",
        ordr."realPseBalance"::float8 as "realPseBalance",
        convert_currency(
            (ordr."realPseBalance")::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "realPseBalanceGBP",
        ordr."manualPseBalance" as "manualPseBalanceNative",
        ordr."realPseBalance" as "realPseBalanceNative",
        ordr."clickId",
        click."catalogueProductId",
        click."productId",
        click."usedUrl",
        click."shopperId",
        click."userId" as "customerId",
        click."moodboardId",
        click."createdAt" as "clickedAt",
        "clickProduct"."lookId",
        "clickProduct"."name" as "clickedLookProductName",
        "clickProduct"."retailer" as "clickedLookProductRetailer",
        "clickProductLook"."consultationId",
        "clickProductReference"."productId" as "clickedLookProductCatalogueId",
        ordr."revolutPaymentStatus",
        ordr."manualRevolutPaymentStatus",
        ordr."archived",
        "revolutCounterparty"."id" as "revolutCounterpartyId",
        pse."givenName" as "pseGivenName",
        pse."familyName" as "pseFamilyName",
        pse."email" as "pseEmail",
        customer."givenName" as "customerGivenName",
        customer."familyName" as "customerFamilyName",
        customer."email" as "customerEmail",
        "psePaymentSettings"."pseCommission" as "pseCustomCommissionRate",
        "psePaymentSettings"."vatEnabled" as "pseVatEnabled",
        "psePaymentSettings"."vatCountry" as "pseVatCountry",
        "teamPaymentSettings"."vatEnabled" as "teamVatEnabled",
        "teamPaymentSettings"."vatCountry" as "teamVatCountry",
        (
            case
                when coalesce("teamPaymentSettings"."vatEnabled", "psePaymentSettings"."vatEnabled") is true
                then true
                else false
            end
        ) as "pseVatApplicable",
        "link"."hash" as "linkHash",
        "link"."brand" as "linkBrand",
        "link"."name" as "linkName",
        "link"."retailer" as "linkRetailer",
        (
            case when ordr."commissionAmount" > 0 and ordr."saleAmount" > 0
                then ordr."commissionAmount" / ordr."saleAmount"
            else null
            end
        ) as "retailerCommissionRateEffective",
        (
            case when
                    ordr."retailerCommissionRateClick" is not null
                    and ordr."retailerCommissionRateClick" > 0
                    and ordr."pseCommissionRateClick" is not null
                    and ordr."pseCommissionRateClick" > 0
                then ordr."retailerCommissionRateClick" * ordr."pseCommissionRateClick"
            else null
            end
        ) as "pseDisplayedCommissionRate",
        (
            case when ordr."commissionAmount" > 0
                then ordr."commissionAmount" -
                    coalesce(ordr."commissionAmount" * ordr."pseCommissionRate", 0)
            else 0
            end
        )::float8 as "revenueAmount",
        convert_currency(
            (
                case when ordr."commissionAmount" > 0
                    then ordr."commissionAmount" -
                        coalesce(ordr."commissionAmount" * ordr."pseCommissionRate", 0)
                else 0
                end
            )::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )::float8 as "revenueAmountGBP"
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
    where ordr.id in ($1, $2)
    order by ordr."orderDate" desc
`;
type _V30b = Expect<Equal<ValidateSQL<Q_FetchOrdersStaticExpansion, Main>, true>>;

type Q_FetchOrdersGroupedTeamStaticExpansion = `
    select
        sum(convert_currency(
            ordr."grossSaleAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "grossSaleAmount",
        avg(convert_currency(
            ordr."grossSaleAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "avgGrossSaleAmount",
        sum(convert_currency(
            ordr."saleAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "saleAmount",
        avg(convert_currency(
            ordr."saleAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "avgSaleAmount",
        sum(convert_currency(
            ordr."grossCommissionAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "grossCommissionAmount",
        avg(convert_currency(
            ordr."grossCommissionAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "avgGrossCommissionAmount",
        sum(convert_currency(
            ordr."grossCommissionAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        ) * ordr."pseCommissionRate") as "pseGrossCommissionAmount",
        avg(convert_currency(
            ordr."grossCommissionAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        ) * ordr."pseCommissionRate") as "avgPseGrossCommissionAmount",
        sum(convert_currency(
            ordr."commissionAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "commissionAmount",
        avg(convert_currency(
            ordr."commissionAmount"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "avgCommissionAmount",
        sum(convert_currency(
            coalesce(ordr."commissionAmount" * ordr."pseCommissionRate", 0)::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "pseCommissionAmount",
        sum(convert_currency(
            ordr."pseBalance"::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "pseBalance",
        sum(
            convert_currency(
                ordr."pseBalance"::numeric,
                ordr."currency",
                'GBP'::text,
                ordr."orderDate"::date
            )
            * (
                case
                    when "teamPaymentSettings"."teamId" is not null then
                        case when "teamPaymentSettings"."vatEnabled" is true
                            and "teamPaymentSettings"."vatCountry" = 'GB'
                            then 0.2
                            else 0
                        end
                    else
                        case when "psePaymentSettings"."vatEnabled" is true
                            and "psePaymentSettings"."vatCountry" = 'GB'
                            then 0.2
                            else 0
                        end
                end
            )
        ) as "pseBalanceVatAmount",
        sum(
            convert_currency(
                ordr."pseBalance"::numeric,
                ordr."currency",
                'GBP'::text,
                ordr."orderDate"::date
            )
            * (
                case
                    when "teamPaymentSettings"."teamId" is not null then
                        case when "teamPaymentSettings"."vatEnabled" is true
                            and "teamPaymentSettings"."vatCountry" = 'GB'
                            then 1.2
                            else 1
                        end
                    else
                        case when "psePaymentSettings"."vatEnabled" is true
                            and "psePaymentSettings"."vatCountry" = 'GB'
                            then 1.2
                            else 1
                        end
                end
            )
        ) as "pseBalanceWithVat",
        sum(convert_currency(
            (
                ordr."commissionAmount" -
                    coalesce(ordr."commissionAmount" * ordr."pseCommissionRate", 0)
            )::numeric,
            ordr."currency",
            'GBP'::text,
            ordr."orderDate"::date
        )) as "revenueAmount",
        sum(ordr."grossItemsCount") as "grossItemsCount",
        sum(ordr."itemsCount") as "itemsCount",
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
`;
type _V30c = Expect<Equal<ValidateSQL<Q_FetchOrdersGroupedTeamStaticExpansion, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/lib/revolutPayments.ts
// ---------------------------------------------------------------------------

type Q_FetchRevolutPaymentsStaticExpansion = `
    select
        rpd.*,
        rpd."amount" + rpd."vat" as "total",
        pse."givenName" || ' ' || pse."familyName" as "pseName",
        rpi."id" as "invoiceId"
    from "Revolut_PaymentDraft" rpd
    left join "User" pse on pse.id = rpd."userId"
    left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id"
    where rpd."createdAt" between $1 and $2
    order by rpd."createdAt" desc
`;
type _V30d = Expect<Equal<ValidateSQL<Q_FetchRevolutPaymentsStaticExpansion, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/reporting-v2/src/lib/clicks.ts
// ---------------------------------------------------------------------------

type Q_FetchClicksStaticExpansion = `
    select
        lpc.id,
        lpc.sid,
        lpc."createdAt",
        lpc."shopperId",
        lpc."userId" as "customerId",
        lpc."usedUrl",
        lpc."userAgent",
        lpc."userCountry",
        lpc."targetDomain",
        (
            case
                when lpc."moodboardId" is not null then 'moodboard'
                when lpc."productId" is not null then 'styling'
                when lpc."linkId" is not null then 'link'
                when lpc."catalogueProductId" is not null then 'catalogue'
                else null
            end
        ) as "sourceType",
        lpc."linkId",
        coalesce(lpc."productId", link."lookProductId") as "lookProductId",
        coalesce(product."lookId", "linkProduct"."lookId") as "lookId",
        coalesce(lpc."moodboardId", link."moodboardId") as "moodboardId",
        coalesce(
            "linkProductReference"."productId",
            "lookProductCatalogueReference"."productId",
            "linkProductCatalogueReference"."productId",
            lpc."catalogueProductId",
            link."catalogueProductId"
        ) as "catalogueProductId",
        coalesce(
            link."retailer",
            product."retailer",
            "linkProduct"."retailer",
            case
                when "linkProductReference"."productId" is not null
                    then array_to_string(
                        (regexp_split_to_array("linkProductReference"."productId", '-'))[
                            1:
                            array_length(
                                regexp_split_to_array("linkProductReference"."productId", '-'), 1
                            ) - 1
                        ],
                        '-'
                    )
                when "lookProductCatalogueReference"."productId" is not null
                    then array_to_string(
                        (regexp_split_to_array("lookProductCatalogueReference"."productId", '-'))[
                            1:
                            array_length(
                                regexp_split_to_array("lookProductCatalogueReference"."productId", '-'), 1
                            ) - 1
                        ],
                        '-'
                    )
                when "linkProductCatalogueReference"."productId" is not null
                    then array_to_string(
                        (regexp_split_to_array("linkProductCatalogueReference"."productId", '-'))[
                            1:
                            array_length(
                                regexp_split_to_array("linkProductCatalogueReference"."productId", '-'), 1
                            ) - 1
                        ],
                        '-'
                    )
                else null
            end
        ) as "retailerId",
        pse."givenName" as "pseGivenName",
        pse."familyName" as "pseFamilyName",
        pse."email" as "pseEmail",
        customer."givenName" as "customerGivenName",
        customer."familyName" as "customerFamilyName",
        customer."email" as "customerEmail",
        coalesce(moodboard."name", "linkMoodboard"."name") as "moodboardName",
        link."hash" as "linkHash"
    from "LogProductClick" lpc
    left join "User" pse on pse."id" = lpc."shopperId"
    left join "User" customer on customer."id" = lpc."userId"
    left join "Product" product on product."id" = lpc."productId"
    left join "Look" look on look."id" = product."lookId"
    left join "Moodboard" moodboard on moodboard."id" = lpc."moodboardId"
    left join "Link" link on link."id" = lpc."linkId"
    left join "Product" "linkProduct" on "linkProduct"."id" = link."lookProductId"
    left join "Look" "linkLook" on "linkLook"."id" = "linkProduct"."lookId"
    left join "Moodboard" "linkMoodboard" on "linkMoodboard"."id" = link."moodboardId"
    left join "Catalogue_ProductReference" "linkProductReference"
        on "linkProductReference"."id" = "linkProduct"."productReferenceId"
    left join "Catalogue_ProductReference" "linkProductCatalogueReference"
        on "linkProductCatalogueReference"."id" = "linkProduct"."productReferenceId"
    left join "Catalogue_ProductReference" "lookProductCatalogueReference"
        on "lookProductCatalogueReference"."id" = product."productReferenceId"
    left join "User" "lookPse" on "lookPse"."id" = look."friId"
    left join "User" "moodboardPse" on "moodboardPse"."id" = moodboard."friId"
    left join "User" "linkLookPse" on "linkLookPse"."id" = "linkLook"."friId"
    left join "User" "linkMoodboardPse" on "linkMoodboardPse"."id" = "linkMoodboard"."friId"
    where lpc."isBot" = false
    order by lpc."createdAt" desc
`;
type _V30e = Expect<Equal<ValidateSQL<Q_FetchClicksStaticExpansion, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/rakuten/allocateNaInvoiceSettlements.ts
// ---------------------------------------------------------------------------

type Q_AllocateNaInvoiceSettlementsWrite = `
    with recursive
        params as (
            select
                $1::text as settling_invoice_id,
                $2::integer as advertiser_id,
                $3::text as currency_code,
                $4::date as reference_date,
                $5::date as settling_invoice_date,
                $6::date as settlement_date,
                $7::numeric(18, 6) as carry_forward_raw
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
`;
type _V30f = Expect<Equal<ValidateSQL<Q_AllocateNaInvoiceSettlementsWrite, Main>, true>>;

// ---------------------------------------------------------------------------
// serverless/cron/update-retailer-weight/src/index.ts
// ---------------------------------------------------------------------------

type Q_UpdateRetailerWeight = `
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
`;
type _V30g = Expect<Equal<ValidateSQL<Q_UpdateRetailerWeight, Catalogue>, true>>;

// ---------------------------------------------------------------------------
// serverless/api/hasura-trigger/src/handlers/catalogueProductReference.ts
// ---------------------------------------------------------------------------

type Q_MarkCatalogueProductMetadataUsed = `
    update product_metadata
    set used = true
    where product_id = $1 and file_id = $2
`;
type _V30h = Expect<Equal<ValidateSQL<Q_MarkCatalogueProductMetadataUsed, Catalogue>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/updateOrderAffiliatePaymentStatus.ts
// ---------------------------------------------------------------------------

type Q_UpdateRakutenOrderAffiliatePaymentStatus = `
    update "Network_Order" o set 
    "affiliatePaymentStatus" = (
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
    )
    where "networkId" = 'rakuten' and o."id" = '00000000-0000-0000-0000-000000000000'
`;
type _V30i = Expect<Equal<ValidateSQL<Q_UpdateRakutenOrderAffiliatePaymentStatus, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/item/updateItemBalance.ts
// ---------------------------------------------------------------------------

type Q_UpdateRakutenItemBalanceWithAdvisoryLock = `
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
`;
type _V30k = Expect<Equal<ValidateSQL<Q_UpdateRakutenItemBalanceWithAdvisoryLock, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/item/recalcRakutenItem.ts
// ---------------------------------------------------------------------------

type Q_RecalcRakutenItem = `
    update "Network_Order_Rakuten_Item" i set 
    "grossSaleAmount" = coalesce(
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
    )
    where i.id = :id
`;
// `:id`-parameterized form matching the migrated getRecalcRakutenItemQuery() helper.
// Over the 600-char gate `ValidQuery` passes the literal through (valid); params are
// still extracted from the WHERE clause.
type _V30l = Expect<Equal<ValidQuery<Q_RecalcRakutenItem, Main>, Q_RecalcRakutenItem>>;
type _P30l = Expect<Equal<ExtractParams<Q_RecalcRakutenItem, Main>, { id: string }>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/updateRakutenOrderValues.ts
// ---------------------------------------------------------------------------

type Q_UpdateRakutenOrderValues = `
    update "Network_Order" o set 
    "grossSaleAmount" = coalesce(
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
    )
    where o."networkId" = 'rakuten'
    and o."orderId" = :orderId
`;
// `:orderId`-parameterized form matching the migrated getUpdateRakutenOrderValuesQuery()
// helper. The literal `'rakuten'` is a value comparison, not a param.
type _V30m = Expect<
    Equal<ValidQuery<Q_UpdateRakutenOrderValues, Main>, Q_UpdateRakutenOrderValues>
>;
type _P30m = Expect<
    Equal<ExtractParams<Q_UpdateRakutenOrderValues, Main>, { orderId: string }>
>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/pse-payment/updateApprovedPaymentStatusQuery.ts
// ---------------------------------------------------------------------------

// `:paymentId`-parameterized form matching the migrated
// getUpdateApprovedPaymentStatusQuery() helper.
type Q_UpdateApprovedPaymentStatus = `
    update "User_ApprovedPayment" uap set
    "status" = (
        case
            when uap."paid" = true then 'paid'
            when uap."revolutDraftId" is not null
                then (
                    select
                        case
                            when uap."status" != 're-approved'
                                and rpd."status" = 'COMPLETED'
                                then 'paid'
                            when uap."status" != 're-approved' and
                                (rpd."status" = 'FAILED'
                                or rpd."status" = 'DECLINED'
                                or rpd."status" = 'REVERTED')
                                then 'failed'
                            when rpd."status" = 'CREATED'
                                then 'created'
                            when rpd."status" = 'PENDING'
                                then 'pending'
                            when uap."status" = 're-approved'
                                then 're-approved'
                            else 'approved'
                        end
                    from "Revolut_PaymentDraft" rpd
                    where "id" = uap."revolutDraftId"
                )
            when uap."status" = 're-approved'
                then 're-approved'
            else 'approved'
        end
    )
    where "id" = :paymentId
`;
type _V30uap = Expect<
    Equal<ValidQuery<Q_UpdateApprovedPaymentStatus, Main>, Q_UpdateApprovedPaymentStatus>
>;
type _P30uap = Expect<
    Equal<ExtractParams<Q_UpdateApprovedPaymentStatus, Main>, { paymentId: string }>
>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/updateOrderBalance.ts
// ---------------------------------------------------------------------------

type Q_UpdateOrderBalance = `
    update "Network_Order" o set
        "realPseBalance" = case 
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
        end)
    where o."id" = '00000000-0000-0000-0000-000000000000';
`;
type _V30n = Expect<Equal<ValidateSQL<Q_UpdateOrderBalance, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/updateOrderInternalStatus.ts
// ---------------------------------------------------------------------------

type Q_UpdateOrderInternalStatus = `
    update "Network_Order" o set "internalStatus" = (
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
    )
    where "id" = '00000000-0000-0000-0000-000000000000';
`;
type _V30o = Expect<Equal<ValidateSQL<Q_UpdateOrderInternalStatus, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/updateOrderPsePaymentStatus.ts
// ---------------------------------------------------------------------------

type Q_UpdateOrderPsePaymentStatus = `
    update "Network_Order" o set "psePaymentStatus" = 
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
        )
    where id = '00000000-0000-0000-0000-000000000000'
`;
type _V30p = Expect<Equal<ValidateSQL<Q_UpdateOrderPsePaymentStatus, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/updateOrderRevolutPaymentStatus.ts
// ---------------------------------------------------------------------------

type Q_UpdateOrderRevolutPaymentStatus = `
    update "Network_Order" o
    set "revolutPaymentStatus" = (
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
    )
    where "id" = '00000000-0000-0000-0000-000000000000'
`;
type _V30q = Expect<Equal<ValidateSQL<Q_UpdateOrderRevolutPaymentStatus, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/updateOrderAffiliateRefundStatus.ts
// ---------------------------------------------------------------------------

type Q_UpdateRakutenOrderAffiliateRefundStatus = `
    update "Network_Order" o set 
    "affiliateRefundStatus" = (
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
    )
    where o."id" = '00000000-0000-0000-0000-000000000000';
`;
type _V30r = Expect<Equal<ValidateSQL<Q_UpdateRakutenOrderAffiliateRefundStatus, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/item/updateItemPsePaymentStatus.ts
// ---------------------------------------------------------------------------

type Q_UpdateRakutenItemPsePaymentStatus = `
    update "Network_Order_Rakuten_Item" i set 
    "psePaymentStatus" = (
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
    )
    where i."id" = '00000000-0000-0000-0000-000000000000'
`;
type _V30s = Expect<Equal<ValidateSQL<Q_UpdateRakutenItemPsePaymentStatus, Main>, true>>;

// ---------------------------------------------------------------------------
// packages/common/src/accounting/order/item/updateItemInternalStatus.ts
// ---------------------------------------------------------------------------

type Q_UpdatePartnerizeItemInternalStatus = `
    update "Network_Order_Partnerize_Item" i set 
    "internalStatus" = (
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
    )
    where i."id" = '00000000-0000-0000-0000-000000000000'
`;
type _V30t = Expect<Equal<ValidateSQL<Q_UpdatePartnerizeItemInternalStatus, Main>, true>>;

type Q_PsePaymentsWithLateralTeamResolution = `
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
`;
type _V30j = Expect<Equal<ValidateSQL<Q_PsePaymentsWithLateralTeamResolution, Main>, true>>;

// The fixture should still reject references that are not in the commerce schemas.
type Q_InvalidMainColumn = `select "doesNotExist" from "User"`;
type _V31 = Expect<Equal<ValidateSQL<Q_InvalidMainColumn, Main>, false>>;

type Q_InvalidCatalogueTable = `select api_key_id from missing_settings`;
type _V32 = Expect<Equal<ValidateSQL<Q_InvalidCatalogueTable, Catalogue>, false>>;

export type CommerceQueryTestsPass = true;
