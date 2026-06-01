/**
 * TheFloorr query fixtures.
 *
 * Queries are copied from /Users/kuindji/Projects/TheFloorr/monorepo.
 * These tests assert that typed-sql can validate the project's raw SQL and
 * infer useful row shapes from the generated main/catalogue database schemas.
 */

import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    TheFloorrCatalogueSchema,
    TheFloorrMainSchema,
} from "../../fixtures/thefloorr-schema.js";

type Main = TheFloorrMainSchema;
type Catalogue = TheFloorrCatalogueSchema;

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
            annualSalesTarget: unknown;
            monthlySalesTarget: unknown;
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

// The fixture should still reject references that are not in TheFloorr schemas.
type Q_InvalidMainColumn = `select "doesNotExist" from "User"`;
type _V31 = Expect<Equal<ValidateSQL<Q_InvalidMainColumn, Main>, false>>;

type Q_InvalidCatalogueTable = `select api_key_id from missing_settings`;
type _V32 = Expect<Equal<ValidateSQL<Q_InvalidCatalogueTable, Catalogue>, false>>;

export type TheFloorrQueryTestsPass = true;
