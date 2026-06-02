/**
 * Commerce reporting-v2 lib — plain type-level mirrors. COLLECTION pass; reds => engine fix-list.
 *
 * Mirrors every raw SQL query in the reporting-v2 lib layer:
 *   exchangeRates.ts, user.ts, pseAnalytics.ts, clicks.ts, clickSelect.ts,
 *   links.ts, orders.ts, orderSelect.ts, pseAgg.ts, pseRaw.ts, psePayments.ts,
 *   revolutPayments.ts, network/{cj,partnerize,rakuten}.ts
 *
 * Many queries are CTE-free but use correlated/scalar subqueries, lateral joins,
 * window/aggregate expressions, and dynamic projection assembly. For dynamic
 * `${...}` SQL a representative static form is materialized (tagged inline).
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type {
    ReportingV2Schema,
} from "../../fixtures/reporting-v2-schema.js";

type S = ReportingV2Schema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
) ? true : false;
type Expect<T extends true> = T;

// ===========================================================================
// exchangeRates.ts  getExchangeRates()
// ===========================================================================

// mirror of commerce reporting-v2 lib/exchangeRates.ts getExchangeRates()
type Q_ExchangeRates = `
        select "from", "to", "rate"
        from "ExchangeRate"
    `;
type _V_ExchangeRates = Expect<Equal<ValidateSQL<Q_ExchangeRates, S>, true>>;
type _R_ExchangeRates = Expect<
    Equal<
        GetReturnType<Q_ExchangeRates, S>,
        { from: string; to: string; rate: number }
    >
>;

// ===========================================================================
// user.ts
// ===========================================================================

// mirror of commerce reporting-v2 lib/user.ts getUserDashboardType()
type Q_UserDashboardType = `
        select
        ("details"::json)->>'dashboardType' as "dashboardType"
        from "User"
        where id = $1
    `;
type _V_UserDashboardType = Expect<Equal<ValidateSQL<Q_UserDashboardType, S>, true>>;
// TODO(return-type): json ->> arrow operator result type — assert validation only.

// mirror of commerce reporting-v2 lib/user.ts getUserTeamId()
type Q_UserTeamId = `
            select *
            from "Team_Member"
            where "userId" = $1
            limit 1
        `;
type _V_UserTeamId = Expect<Equal<ValidateSQL<Q_UserTeamId, S>, true>>;
type _R_UserTeamId = Expect<
    Equal<
        GetReturnType<Q_UserTeamId, S>,
        S["schemas"]["public"]["Team_Member"]
    >
>;

// mirror of commerce reporting-v2 lib/user.ts getUserTeamAccessRole()
type Q_UserTeamAccessRole = `
            select "role"
            from "Team_Member"
            where "userId" = $1 and "teamId" = $2
            limit 1
        `;
type _V_UserTeamAccessRole = Expect<Equal<ValidateSQL<Q_UserTeamAccessRole, S>, true>>;
type _R_UserTeamAccessRole = Expect<
    Equal<
        GetReturnType<Q_UserTeamAccessRole, S>,
        { role: string }
    >
>;

// ===========================================================================
// pseAnalytics.ts  fetchPseAnalytics()  (builder source — flattened to SQL)
// ===========================================================================

// mirror of commerce reporting-v2 lib/pseAnalytics.ts fetchPseAnalytics()
// materialized from dynamic source: all whereIf filters dropped (adopted="all", active=null).
type Q_PseAnalytics = `
        select
            u.email,
            u.phone,
            u."givenName",
            u."familyName",
            u."createdAt",
            u."firstLoggedIn",
            u."lastLoggedIn",
            u."groups",
            pa.id as "pseApplicationId",
            ua.*
        from "User_Analytics" ua
        join "User" u on u.id = ua."userId"
        left join "PSEApplication" pa on pa."userId" = ua."userId"
        where (u."groups" like '%FRI%' or u."groups" like '%GPS%')
    `;
type _V_PseAnalytics = Expect<Equal<ValidateSQL<Q_PseAnalytics, S>, true>>;

// ===========================================================================
// clicks.ts  fetchClicks()  (Select builder — flattened to SQL)
// ===========================================================================

// mirror of commerce reporting-v2 lib/clicks.ts fetchClicks()
// materialized from dynamic source: all left joins + filters present; the
// retailerIdExpression (regexp_split_to_array slice) inlined from clickSelect.ts.
type Q_Clicks = `
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
            coalesce(lpc."moodboardId", "link"."moodboardId") as "moodboardId",
            coalesce(
                "linkProductReference"."productId",
                "lookProductCatalogueReference"."productId",
                "linkProductCatalogueReference"."productId",
                lpc."catalogueProductId",
                "link"."catalogueProductId"
            ) as "catalogueProductId",
            pse."givenName" as "pseGivenName",
            pse."familyName" as "pseFamilyName",
            pse."email" as "pseEmail",
            customer."givenName" as "customerGivenName",
            customer."familyName" as "customerFamilyName",
            customer."email" as "customerEmail",
            coalesce("moodboard"."name","linkMoodboard"."name") as "moodboardName",
            link."hash" as "linkHash"
        from "LogProductClick" lpc
        left join "User" pse on pse."id" = lpc."shopperId"
        left join "User" customer on customer."id" = lpc."userId"
        left join "Product" product on "product"."id" = "lpc"."productId"
        left join "Look" look on "look"."id" = "product"."lookId"
        left join "Moodboard" moodboard on "moodboard"."id" = "lpc"."moodboardId"
        left join "Link" link on link."id" = lpc."linkId"
        left join "Product" "linkProduct" on "linkProduct"."id" = "link"."lookProductId"
        left join "Moodboard" "linkMoodboard" on "linkMoodboard"."id" = "link"."moodboardId"
        left join "Catalogue_ProductReference" "linkProductReference" on "linkProductReference"."id" = "linkProduct"."productReferenceId"
        left join "Catalogue_ProductReference" "linkProductCatalogueReference" on "linkProductCatalogueReference"."id" = "linkProduct"."productReferenceId"
        left join "Catalogue_ProductReference" "lookProductCatalogueReference" on "lookProductCatalogueReference"."id" = "product"."productReferenceId"
        where lpc."isBot" = false
        order by lpc."createdAt" desc
    `;
type _V_Clicks = Expect<Equal<ValidateSQL<Q_Clicks, S>, true>>;

// mirror of commerce reporting-v2 lib/clicks.ts fetchClicksGroupped() (groupBy=pseId)
// materialized from dynamic source: pseId grouping branch + inner pse join.
type Q_ClicksGroupped = `
        select
            count(*) as "clickCount",
            (array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel",
            lpc."shopperId" as "group"
        from "LogProductClick" lpc
        join "User" pse on pse."id" = lpc."shopperId"
        group by lpc."shopperId"
        limit 1000
    `;
type _V_ClicksGroupped = Expect<Equal<ValidateSQL<Q_ClicksGroupped, S>, true>>;

// mirror of commerce reporting-v2 lib/clicks.ts fetchClicksGroupped() (date group)
// materialized from dynamic source: to_char date grouping branch, null groupLabel.
type Q_ClicksGrouppedDate = `
        select
            count(*) as "clickCount",
            null as "groupLabel",
            to_char(lpc."createdAt", 'YYYY-MM') as "group"
        from "LogProductClick" lpc
        group by to_char(lpc."createdAt", 'YYYY-MM')
        order by "group" desc
        limit 1000
    `;
type _V_ClicksGrouppedDate = Expect<Equal<ValidateSQL<Q_ClicksGrouppedDate, S>, true>>;

// mirror of commerce reporting-v2 lib/clickSelect.ts applyClickFilters() retailerId filter
// materialized from dynamic source: the shared retailerIdExpression used as a
// WHERE predicate over joined click sources.
type Q_ClickRetailerFilter = `
        select lpc.id
        from "LogProductClick" lpc
        left join "Link" link on link."id" = lpc."linkId"
        left join "Product" "linkProduct" on "linkProduct"."id" = "link"."lookProductId"
        left join "Catalogue_ProductReference" "linkProductReference" on "linkProductReference"."id" = "linkProduct"."productReferenceId"
        left join "Catalogue_ProductReference" "linkProductCatalogueReference" on "linkProductCatalogueReference"."id" = "linkProduct"."productReferenceId"
        left join "Catalogue_ProductReference" "lookProductCatalogueReference" on "lookProductCatalogueReference"."id" = "product"."productReferenceId"
        where lpc."isBot" = false
        and coalesce(link."retailer", product."retailer", "linkProduct"."retailer") = $1
    `;
type _V_ClickRetailerFilter = Expect<Equal<ValidateSQL<Q_ClickRetailerFilter, S>, true>>;

// ===========================================================================
// links.ts
// ===========================================================================

// mirror of commerce reporting-v2 lib/links.ts fetchLinks()
type Q_Links = `
        select
            l.id,
            l."createdAt",
            l."referenceUserId" as "pseId",
            l."teamId",
            l."retailer" as "retailerId",
            r."name" as "retailerName",
            l."catalogueProductId",
            l."hash",
            l."sku",
            l."name",
            l."targetUrl",
            l."brand",
            pse."givenName" as "pseGivenName",
            pse."familyName" as "pseFamilyName",
            pse."email" as "pseEmail"
        from "Link" l
        inner join "User" pse on pse."id" = l."referenceUserId"
        left join "Retailer" r on r."id" = l."retailer"
        order by l."createdAt" desc
    `;
type _V_Links = Expect<Equal<ValidateSQL<Q_Links, S>, true>>;

// mirror of commerce reporting-v2 lib/links.ts fetchLinkOrderSums() (groupBy=linkId)
// materialized from dynamic source: convertToCurrency='GBP', groupBy='linkId'
// (drops the pse join; uses the convert_currency() money rollup).
type Q_LinkOrderSums = `
        select
            'GBP' as "currency",
            sum(convert_currency(ordr."grossSaleAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "grossSaleAmount",
            avg(convert_currency(ordr."grossSaleAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "avgGrossSaleAmount",
            sum(convert_currency(ordr."saleAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "saleAmount",
            avg(convert_currency(ordr."saleAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "avgSaleAmount",
            sum(convert_currency(ordr."grossCommissionAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "grossCommissionAmount",
            avg(convert_currency(ordr."grossCommissionAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "avgGrossCommissionAmount",
            sum(convert_currency(ordr."commissionAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "commissionAmount",
            avg(convert_currency(ordr."commissionAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "avgCommissionAmount",
            count(*) as "orderCount",
            null as "groupLabel",
            l."id" as "group"
        from "Link" l
        inner join "Network_Order" ordr on ordr."clickId" = l."hash"
        group by l."id"
        order by sum(convert_currency(ordr."commissionAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) desc
    `;
type _V_LinkOrderSums = Expect<Equal<ValidateSQL<Q_LinkOrderSums, S>, true>>;

// mirror of commerce reporting-v2 lib/links.ts fetchLinkClickSum() (groupBy=linkId)
type Q_LinkClickSum = `
        select
            count(*) as "clickCount",
            null as "groupLabel",
            l."id" as "group"
        from "Link" l
        inner join "LogProductClick" lpc on lpc."linkId" = l."id"
        group by l."id"
    `;
type _V_LinkClickSum = Expect<Equal<ValidateSQL<Q_LinkClickSum, S>, true>>;

// mirror of commerce reporting-v2 lib/links.ts fetchLinksGroupped() (groupBy=pseId)
type Q_LinksGroupped = `
        select
            count(*) as "linkCount",
            (array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel",
            l."referenceUserId" as "group"
        from "Link" l
        inner join "User" pse on pse."id" = l."referenceUserId"
        group by l."referenceUserId"
    `;
type _V_LinksGroupped = Expect<Equal<ValidateSQL<Q_LinksGroupped, S>, true>>;

// ===========================================================================
// pseAgg.ts
// ===========================================================================

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfApplications()
type Q_PseAggApplications = `select count(*) as cnt from "PSEApplication"`;
type _V_PseAggApplications = Expect<Equal<ValidateSQL<Q_PseAggApplications, S>, true>>;
type _R_PseAggApplications = Expect<
    Equal<GetReturnType<Q_PseAggApplications, S>, { cnt: number }>
>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfAcceptedApplications()
type Q_PseAggAccepted = `
        select count(*) as cnt
        from "PSEApplication"
        where "accepted" = true
    `;
type _V_PseAggAccepted = Expect<Equal<ValidateSQL<Q_PseAggAccepted, S>, true>>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfMobileApplications()
type Q_PseAggMobile = `
        select count(*) as cnt
        from "PSEApplication"
        where "createdVia" = 'mobile/shopper/apply'`;
type _V_PseAggMobile = Expect<Equal<ValidateSQL<Q_PseAggMobile, S>, true>>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfMobileApplicationsWithOptional()
type Q_PseAggMobileOpt = `
        select count(*) as cnt
        from "PSEApplication"
        where "createdVia" = 'mobile/shopper/apply' and
            "submittedWithOptional" = true
    `;
type _V_PseAggMobileOpt = Expect<Equal<ValidateSQL<Q_PseAggMobileOpt, S>, true>>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfWebsiteApplications()
type Q_PseAggWebsite = `
        select count(*) as cnt
        from "PSEApplication"
        where "createdVia" = 'website/shopper/form'
    `;
type _V_PseAggWebsite = Expect<Equal<ValidateSQL<Q_PseAggWebsite, S>, true>>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfWebsiteApplicationsWithOptional()
type Q_PseAggWebsiteOpt = `
        select count(*) as cnt from "PSEApplication"
        where "createdVia" = 'website/shopper/form' and
                "submittedWithOptional" = true
    `;
type _V_PseAggWebsiteOpt = Expect<Equal<ValidateSQL<Q_PseAggWebsiteOpt, S>, true>>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfAdopted()
type Q_PseAggAdopted = `
        select count(*) as cnt
        from "User_Analytics"
        where "isPSE" = true and "isPSEAdopted" = true
    `;
type _V_PseAggAdopted = Expect<Equal<ValidateSQL<Q_PseAggAdopted, S>, true>>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfPartiallyAdopted()
type Q_PseAggPartial = `
        select count(*) as cnt
        from "User_Analytics"
        where "isPSE" = true and
                "isPSEPartiallyAdopted" = true and
                "isPSEAdopted" = false`;
type _V_PseAggPartial = Expect<Equal<ValidateSQL<Q_PseAggPartial, S>, true>>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchTotalNumberOfActive()
type Q_PseAggActive = `
        select count(*) as cnt
        from "User_Analytics"
        where "isPSE" = true and
                "isPSEActive" = true
    `;
type _V_PseAggActive = Expect<Equal<ValidateSQL<Q_PseAggActive, S>, true>>;

// mirror of commerce reporting-v2 lib/pseAgg.ts fetchApprovedPSEs()
// Aggregate cohort query: extract(epoch from min/avg/max(interval))/86400 over
// User_Analytics first-event columns. Trimmed to a representative subset of the
// ~50 projections (each follows the identical shape).
type Q_PseAggApprovedPSEs = `
        select
        count(*) as cnt,
        extract(epoch from min(u."firstLoggedIn" - pa."createdAt")) / 86400 as "loginCycleMin",
        extract(epoch from avg(u."firstLoggedIn" - pa."createdAt")) / 86400 as "loginCycleAvg",
        extract(epoch from max(u."firstLoggedIn" - pa."createdAt")) / 86400 as "loginCycleMax",
        count(u."firstLoggedIn") as "loginCycleCnt",
        extract(epoch from min(ua."pushFirstEnabledAt" - pa."createdAt")) / 86400 as "firstPushCycleMin",
        count(ua."pushFirstEnabledAt") as "firstPushCycleCnt"
        from "User" u
        join "PSEApplication" pa on pa."userId" = u."id"
        join "User_Analytics" ua on ua."userId" = u."id"
        where (u."groups" like '%GPS%' or u."groups" like '%FRI%') and
                u."firstLoggedIn" is not null
    `;
type _V_PseAggApprovedPSEs = Expect<Equal<ValidateSQL<Q_PseAggApprovedPSEs, S>, true>>;

// ===========================================================================
// pseRaw.ts  fetchPseRawStats()
// ===========================================================================

// mirror of commerce reporting-v2 lib/pseRaw.ts fetchPseRawStats()
// materialized from dynamic source: dateFilter() blocks dropped (no start/end).
// Scalar-subquery projections + json_build_object money rollup + array() subquery.
type Q_PseRawStats = `
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
                        ), 0)
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
type _V_PseRawStats = Expect<Equal<ValidateSQL<Q_PseRawStats, S>, true>>;

// ===========================================================================
// psePayments.ts
// ===========================================================================

// mirror of commerce reporting-v2 lib/psePayments.ts fetchPsePayments()
// Lateral subqueries (utc/utm), case projections, convert_currency casts.
type Q_PsePayments = `
        select
            uap.*,
            pse."givenName" as "pseGivenName",
            pse."familyName" as "pseFamilyName",
            (
                case
                    when uap."revolutDraftId" is not null then true
                    else (rc."id" is not null or coalesce(rpd."teamId", case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end) is not null)
                end
            )::boolean as "hasBankDetails",
            (coalesce(rpd."teamId", case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end) is not null)::boolean as "hasTeamBankDetails",
            (coalesce(dt."name", uapt."name", case when utm."teamMemberCount" = 1 then utm."teamName" else null end))::text as "teamName",
            (coalesce(rpd."teamId", uap."teamId", case when utm."teamMemberCount" = 1 then utm."teamId" else null end))::text as "teamId",
            (uap."amount" + uap."vat")::float8 as "total",
            convert_currency((uap."amount")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date)::float8 as "amountGBP",
            convert_currency((uap."vat")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date)::float8 as "vatGBP",
            convert_currency((uap."amount" + uap."vat")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date)::float8 as "totalGBP"
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
type _V_PsePayments = Expect<Equal<ValidateSQL<Q_PsePayments, S>, true>>;

// mirror of commerce reporting-v2 lib/psePayments.ts fetchPsePayments() draftData inner query
type Q_PsePaymentsDrafts = `
                select rpd.*, rpi."id" as "invoiceId"
                from "Revolut_PaymentDraft" rpd
                left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id"
                where rpd."id" in ($1, $2)
            `;
type _V_PsePaymentsDrafts = Expect<Equal<ValidateSQL<Q_PsePaymentsDrafts, S>, true>>;

// mirror of commerce reporting-v2 lib/psePayments.ts fetchPsePaymentItems()
// materialized from dynamic source: array-form approvedPaymentId branch present.
type Q_PsePaymentItems = `
        select
            uapi.*,
            (uapi.amount + uapi.vat)::float8 as "total",
            uap."createdAt",
            o."orderId",
            coalesce(ci.sku, ri.sku, pi.sku)::text as "sku",
            coalesce(ri.product, pi.name)::text as "name",
            o."advertiser" as "retailer",
            convert_currency((uapi."amount")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date)::float8 as "amountGBP",
            convert_currency((uapi."vat")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date)::float8 as "vatGBP",
            convert_currency((uapi."amount" + uapi."vat")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date)::float8 as "totalGBP"
        from "User_ApprovedPayment_Item" uapi
        join "User_ApprovedPayment" uap on uap.id = uapi."userApprovedPaymentId"
        left join "Network_Order_CJ_Item" ci on ci.id = uapi."cjItemId"
        left join "Network_Order_Partnerize_Item" pi on pi.id = uapi."partnerizeItemId"
        left join "Network_Order_Rakuten_Item" ri on ri.id = uapi."rakutenItemId"
        left join "Network_Order" o on o.id = uap."networkOrderId"
        where uapi."userApprovedPaymentId" in ($1)
    `;
type _V_PsePaymentItems = Expect<Equal<ValidateSQL<Q_PsePaymentItems, S>, true>>;

// mirror of commerce reporting-v2 lib/psePayments.ts fetchPsePaymentsSummary() (groupBy=pseId)
// Aggregate rollup: bool_and / count(distinct) / array_agg over the lateral team scope.
type Q_PsePaymentsSummary = `
        select
            uap."userId" as "pseId",
            ((array_agg(pse."givenName" || ' ' || pse."familyName"))[1])::text as "pseName",
            'GBP'::text as "currency",
            (
                bool_and((
                    case
                        when uap."revolutDraftId" is not null then true
                        else (rc."id" is not null or coalesce(rpd."teamId", case when utc."teamCounterpartyCount" = 1 then utc."teamId" else null end) is not null)
                    end
                ))
                and count(distinct (
                    case
                        when uap."revolutDraftId" is not null then
                            case when rpd."teamId" is not null then 'draft:team:' || rpd."teamId"::text else 'draft:user' end
                        else null
                    end
                )) = 1
            )::boolean as "hasBankDetails",
            (array_agg(uap."id"))::text[] as "approvedPaymentIds",
            sum(convert_currency((uap."amount")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date))::float8 as "amount",
            sum(convert_currency((uap."vat")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date))::float8 as "vat",
            sum(convert_currency((uap."amount" + uap."vat")::numeric, uap."currency", 'GBP'::text, uap."createdAt"::date))::float8 as "total"
        from "User_ApprovedPayment" uap
        left join "User" pse on pse.id = uap."userId"
        left join "Revolut_Counterparty" rc on rc."userId" = uap."userId"
        left join "Revolut_PaymentDraft" rpd on rpd."id" = uap."revolutDraftId"
        left join "Team" dt on dt."id" = rpd."teamId"
        left join "Team" uapt on uapt."id" = uap."teamId"
        left join lateral (
            select
                count(*)::int as "teamCounterpartyCount",
                (array_agg(tm."teamId"))[1]::uuid as "teamId"
            from "Team_Member" tm
            join "Team_Revolut_Counterparty" trc on trc."teamId" = tm."teamId"
            where tm."userId" = uap."userId" and tm."disabled" = false
        ) utc on true
        where uap."userId" is not null and (uap."revolutDraftId" is null or rpd."userId" is not null)
        group by uap."userId"
    `;
type _V_PsePaymentsSummary = Expect<Equal<ValidateSQL<Q_PsePaymentsSummary, S>, true>>;

// ===========================================================================
// revolutPayments.ts  fetchRevolutPayments()
// ===========================================================================

// mirror of commerce reporting-v2 lib/revolutPayments.ts fetchRevolutPayments()
type Q_RevolutPayments = `
        select
            rpd.*,
            rpd."amount" + rpd."vat" as "total",
            pse."givenName" || ' ' || pse."familyName" as "pseName",
            rpi."id" as "invoiceId"
        from "Revolut_PaymentDraft" rpd
        left join "User" pse on pse.id = rpd."userId"
        left join "Revolut_PaymentInvoice" rpi on rpi."paymentId" = rpd."id"
        order by rpd."createdAt" desc
    `;
type _V_RevolutPayments = Expect<Equal<ValidateSQL<Q_RevolutPayments, S>, true>>;

// mirror of commerce reporting-v2 lib/revolutPayments.ts applyFilters() orderId EXISTS branch
type Q_RevolutPaymentsOrderFilter = `
        select rpd.*
        from "Revolut_PaymentDraft" rpd
        where exists (
            select 1
            from "User_ApprovedPayment" uap
            where uap."networkOrderId" = $1
                and uap."revolutDraftId" = rpd."id"
        )
    `;
type _V_RevolutPaymentsOrderFilter = Expect<
    Equal<ValidateSQL<Q_RevolutPaymentsOrderFilter, S>, true>
>;

// ===========================================================================
// orders.ts
// ===========================================================================

// mirror of commerce reporting-v2 lib/orders.ts fetchOrderIds()
type Q_OrderIds = `
        select ordr.id, ordr."orderId", ordr."networkId"
        from "Network_Order" ordr
        order by ordr."orderDate" desc
        limit 100
    `;
type _V_OrderIds = Expect<Equal<ValidateSQL<Q_OrderIds, S>, true>>;
type _R_OrderIds = Expect<
    Equal<
        GetReturnType<Q_OrderIds, S>,
        { id: string; orderId: string; networkId: string }
    >
>;

// mirror of commerce reporting-v2 lib/orders.ts fetchOrders()
// materialized from dynamic source: the ~100-column projection is trimmed to a
// representative subset (passthrough cols + case-rate + convert_currency money +
// the joined click/pse/link/payment-settings sources).
type Q_Orders = `
        select
            ordr."id",
            ordr."orderId",
            ordr."orderDate",
            ordr."status" as "affiliateStatus",
            ordr."networkId",
            ordr."advertiser",
            ordr."manualPseBalance" as "manualPseBalanceNative",
            ordr."realPseBalance" as "realPseBalanceNative",
            ordr."clickId",
            click."catalogueProductId",
            click."productId",
            click."shopperId",
            click."userId" as "customerId",
            click."createdAt" as "clickedAt",
            pse."givenName" as "pseGivenName",
            pse."familyName" as "pseFamilyName",
            pse."email" as "pseEmail",
            customer."givenName" as "customerGivenName",
            "link"."hash" as "linkHash",
            "psePaymentSettings"."pseCommission" as "pseCustomCommissionRate",
            "teamPaymentSettings"."vatEnabled" as "teamVatEnabled",
            (
                case when ordr."commissionAmount" > 0 and ordr."saleAmount" > 0
                    then ordr."commissionAmount" / ordr."saleAmount"
                else null
                end
            ) as "retailerCommissionRateEffective"
        from "Network_Order" ordr
        left join "LogProductClick" click on click."sid" = ordr."clickId"
        left join "User" pse on pse."id" = click."shopperId"
        left join "User" customer on customer."id" = click."userId"
        left join "Revolut_Counterparty" "revolutCounterparty" on "revolutCounterparty"."userId" = click."shopperId"
        left join "Link" link on link."id" = click."linkId"
        left join "User_PaymentSettings" "psePaymentSettings" on "psePaymentSettings"."userId" = click."shopperId"
        left join "Team_PaymentSettings" "teamPaymentSettings" on "teamPaymentSettings"."teamId" = click."teamId"
        order by ordr."orderDate" desc
    `;
type _V_Orders = Expect<Equal<ValidateSQL<Q_Orders, S>, true>>;

// mirror of commerce reporting-v2 lib/orders.ts fetchOrdersGroupped() (groupBy=pseId)
// materialized from dynamic source: aggregate money rollup + pse/team join + group.
type Q_OrdersGroupped = `
        select
            sum(convert_currency(ordr."grossSaleAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "grossSaleAmount",
            avg(convert_currency(ordr."grossSaleAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "avgGrossSaleAmount",
            sum(convert_currency(ordr."commissionAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) as "commissionAmount",
            sum(ordr."grossItemsCount") as "grossItemsCount",
            sum(ordr."itemsCount") as "itemsCount",
            count(distinct ordr."id") as "count",
            count(distinct click."shopperId") as "pseCount",
            click."shopperId" as "group",
            (array_agg(pse."givenName" || ' ' || pse."familyName"))[1] as "groupLabel",
            (array_agg(team."name"))[1] as "teamName"
        from "Network_Order" ordr
        left join "LogProductClick" click on click."sid" = ordr."clickId"
        inner join "User" pse on pse."id" = click."shopperId"
        left join "Team" team on team."id" = click."teamId"
        group by click."shopperId"
        order by sum(convert_currency(ordr."commissionAmount"::numeric, ordr."currency", 'GBP'::text, ordr."orderDate"::date)) desc
    `;
type _V_OrdersGroupped = Expect<Equal<ValidateSQL<Q_OrdersGroupped, S>, true>>;

// ===========================================================================
// orderSelect.ts  (filter EXISTS subqueries injected into the orders queries)
// ===========================================================================

// mirror of commerce reporting-v2 lib/orderSelect.ts applyOrderFilters() collectionId branch
type Q_OrderCollectionFilter = `
        select ordr.id
        from "Network_Order" ordr
        where exists (
            select 1
            from "Network_Order_Collection_Order" noco
            where noco."networkOrderId" = ordr."id"
              and noco."collectionId" = $1
        )
    `;
// FIXTURE-GAP: Network_Order_Collection_Order not in fixture
type _V_OrderCollectionFilter = Expect<
    Equal<ValidateSQL<Q_OrderCollectionFilter, S>, true>
>;

// mirror of commerce reporting-v2 lib/orderSelect.ts applyOrderFilters() rakutenPaymentId branch
type Q_OrderRakutenPaymentFilter = `
        select ordr.id
        from "Network_Order" ordr
        where exists (
            select 1
            from "Network_Payment_Invoice_Item_Rakuten" nipi
            join "Network_Payment_Invoice_Rakuten" nipr
                on nipr."invoiceId" = nipi."invoiceId"
            join "Network_Payment_Rakuten" npr
                on npr."paymentId" = nipr."paymentId"
            where npr."id" = $1
            and nipi."orderId" = ordr."rawOrderId"
        )
    `;
type _V_OrderRakutenPaymentFilter = Expect<
    Equal<ValidateSQL<Q_OrderRakutenPaymentFilter, S>, true>
>;

// mirror of commerce reporting-v2 lib/orderSelect.ts applyOrderFilters() internalOrderItemStatus branch
type Q_OrderInternalStatusFilter = `
        select ordr.id
        from "Network_Order" ordr
        where (
            ordr."networkId" = 'rakuten' and
            exists (
                select 1
                from "Network_Order_Rakuten_Item" nri
                where nri."orderId" = ordr."orderId"
                and nri."internalStatus" in ($1)
            )
        ) or (
            ordr."networkId" = 'cj' and
            exists (
                select 1
                from "Network_Order_CJ_Item" cji
                where cji."orderId" = ordr."orderId"
                and cji."internalStatus" in ($1)
            )
        )
    `;
type _V_OrderInternalStatusFilter = Expect<
    Equal<ValidateSQL<Q_OrderInternalStatusFilter, S>, true>
>;

// ===========================================================================
// network/cj.ts
// ===========================================================================

// mirror of commerce reporting-v2 lib/network/cj.ts fetchCjOrderCorrections()
type Q_CjCorrections = `
        select *, null as "affiliateStatus"
        from "Network_Order_Correction"
        where "orderId" in ($1, $2)
    `;
type _V_CjCorrections = Expect<Equal<ValidateSQL<Q_CjCorrections, S>, true>>;

// mirror of commerce reporting-v2 lib/network/cj.ts fetchCjItems()
// materialized from dynamic source: convertToCurrency undefined (only *GBP projections),
// exchangeRateDate not "today" (o."orderDate"::date), itemLateReturnSql inlined.
type Q_CjItems = `
        select
            i.*,
            null as "affiliateStatus",
            (
                i."pseBalance" < -0.1
                or exists (
                    select 1 from "User_ApprovedPayment_Item" uapi
                    where uapi."anyItemId" = i."id"
                        and uapi."amount" < 0
                )
            ) as "lateReturn",
            convert_currency(i."itemValue"::numeric, i."currency", 'GBP'::text, o."orderDate"::date)::float8 as "itemValueGBP",
            convert_currency(i."commissionAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date)::float8 as "commissionAmountGBP"
        from "Network_Order_CJ_Item" i
        join "Network_Order" o on o."orderId" = i."orderId"
        where i."orderId" in ($1, $2)
    `;
type _V_CjItems = Expect<Equal<ValidateSQL<Q_CjItems, S>, true>>;

// mirror of commerce reporting-v2 lib/network/cj.ts fetchAffiliatePayments()
type Q_CjAffiliatePayments = `
        select
            p.*,
            pg."datePaid",
            po."orderId",
            po."manuallyAssigned"
        from "Network_Payment_CJ_Order" po
        join "Network_Payment_CJ" p on p."id" = po."paymentId"
        join "Network_Payment_CJ_Group" pg on pg."id" = p."groupId"
        where po."orderId" in ($1, $2)
    `;
type _V_CjAffiliatePayments = Expect<Equal<ValidateSQL<Q_CjAffiliatePayments, S>, true>>;

// ===========================================================================
// network/partnerize.ts
// ===========================================================================

// mirror of commerce reporting-v2 lib/network/partnerize.ts fetchPartnerizeItems()
type Q_PartnerizeItems = `
        select
            i.*,
            i."status" as "affiliateStatus",
            (
                i."pseBalance" < -0.1
                or exists (
                    select 1 from "User_ApprovedPayment_Item" uapi
                    where uapi."anyItemId" = i."id"
                        and uapi."amount" < 0
                )
            ) as "lateReturn",
            convert_currency(i."itemValue"::numeric, i."currency", 'GBP'::text, o."orderDate"::date)::float8 as "itemValueGBP"
        from "Network_Order_Partnerize_Item" i
        join "Network_Order" o on o."orderId" = i."orderId"
        where i."orderId" in ($1, $2)
    `;
type _V_PartnerizeItems = Expect<Equal<ValidateSQL<Q_PartnerizeItems, S>, true>>;

// mirror of commerce reporting-v2 lib/network/partnerize.ts fetchPartnerizeItemSnapshots()
// FIXTURE-GAP: Network_Order_Partnerize_Item_Snapshot not in fixture
type Q_PartnerizeSnapshots = `
        select *
        from "Network_Order_Partnerize_Item_Snapshot"
        where "conversionItemId" in ($1, $2)
    `;
type _V_PartnerizeSnapshots = Expect<Equal<ValidateSQL<Q_PartnerizeSnapshots, S>, true>>;

// mirror of commerce reporting-v2 lib/network/partnerize.ts fetchPartnerizePayments() item query
type Q_PartnerizePaymentItems = `
        select *
        from "Network_Order_Partnerize_Item"
        where "orderId" in ($1, $2)
        and "selfBillId" is not null
    `;
type _V_PartnerizePaymentItems = Expect<
    Equal<ValidateSQL<Q_PartnerizePaymentItems, S>, true>
>;

// mirror of commerce reporting-v2 lib/network/partnerize.ts fetchPartnerizePayments() selfbill query
type Q_PartnerizeSelfbill = `
        select *
        from "Network_Partnerize_Selfbill"
        where "id" in ($1, $2)
    `;
type _V_PartnerizeSelfbill = Expect<Equal<ValidateSQL<Q_PartnerizeSelfbill, S>, true>>;

// ===========================================================================
// network/rakuten.ts
// ===========================================================================

// mirror of commerce reporting-v2 lib/network/rakuten.ts fetchRakutenItems()
type Q_RakutenItems = `
        select
            i.*,
            null as "affiliateStatus",
            (
                i."pseBalance" < -0.1
                or exists (
                    select 1 from "User_ApprovedPayment_Item" uapi
                    where uapi."anyItemId" = i."id"
                        and uapi."amount" < 0
                )
            ) as "lateReturn",
            convert_currency(i."saleAmount"::numeric, i."currency", 'GBP'::text, o."orderDate"::date)::float8 as "saleAmountGBP"
        from "Network_Order_Rakuten_Item" i
        join "Network_Order" o on o."orderId" = i."orderId"
        where i."orderId" in ($1, $2)
    `;
type _V_RakutenItems = Expect<Equal<ValidateSQL<Q_RakutenItems, S>, true>>;

// mirror of commerce reporting-v2 lib/network/rakuten.ts fetchRakutenItemSnapshots()
type Q_RakutenSnapshots = `
        select *
        from "Network_Order_Rakuten_Item_Snapshot"
        where "rakutenItemId" in ($1, $2)
    `;
type _V_RakutenSnapshots = Expect<Equal<ValidateSQL<Q_RakutenSnapshots, S>, true>>;

// mirror of commerce reporting-v2 lib/network/rakuten.ts fetchRakutenSettlements()
type Q_RakutenSettlements = `
        select *
        from "Network_Rakuten_Invoice_Settlement"
        where "naInvoiceId" in ($1, $2)
        order by "settlingInvoiceDate" asc, "settlingInvoiceId" asc
    `;
type _V_RakutenSettlements = Expect<Equal<ValidateSQL<Q_RakutenSettlements, S>, true>>;

// mirror of commerce reporting-v2 lib/network/rakuten.ts fetchRakutenPayments() item query
type Q_RakutenPaymentItems = `
        select *
        from "Network_Payment_Invoice_Item_Rakuten"
        where "orderId" in ($1, $2)
    `;
type _V_RakutenPaymentItems = Expect<Equal<ValidateSQL<Q_RakutenPaymentItems, S>, true>>;

// mirror of commerce reporting-v2 lib/network/rakuten.ts fetchRakutenPayments() invoice query
type Q_RakutenInvoices = `
        select *
        from "Network_Payment_Invoice_Rakuten"
        where "invoiceId" in ($1, $2)
    `;
type _V_RakutenInvoices = Expect<Equal<ValidateSQL<Q_RakutenInvoices, S>, true>>;

// mirror of commerce reporting-v2 lib/network/rakuten.ts fetchRakutenPayments() payment query
type Q_RakutenPayments = `
        select *
        from "Network_Payment_Rakuten"
        where "paymentId" in ($1, $2)
    `;
type _V_RakutenPayments = Expect<Equal<ValidateSQL<Q_RakutenPayments, S>, true>>;

export type CommerceReportingV2LibPlainTestsPass = true;
