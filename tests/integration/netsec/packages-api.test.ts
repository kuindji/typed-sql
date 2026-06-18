/**
 * Netsec packages/api query coverage.
 * Queries copied from the netsec app (packages/api). Collection pass: faithful
 * coverage; red/unknown results are expected findings, not bugs.
 *
 * Builder (`new Select()`) sites are reconstructed into the SQL string the
 * builder emits, in this order:
 *   select [<flags> ]<cols> from <from> <joins> where <AND-joined> ...
 *   group by ... having ... order by ... [offset N ][limit N]
 * `.addValue(v)` -> $N (1-based call order); `.addValue(v,'cast')` -> $N::cast.
 * Tables extending the base `Table` start `from <table> self`.
 * `_render_limit` emits `offset <offset> limit <N>` (offset only when != 0).
 * Conditionally-added `.where(...)` fragments are included in maximal form.
 *
 * NOTE: `setPeriod` with a dynamic period is rendered in its `lastMonth`
 * maximal form (`<field> between '<start>' and '<end>'`).
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// packages/api/src/blacklightVictim.ts
// ---------------------------------------------------------------------------

// fetchBlacklightVictimsMap: WITH ... two CTEs + aggregate map query.
// The base CTE is a Select builder over `ip self` joined to
// blacklight_ransomware_victim. entityId WHERE shown maximal (= form).
// NOTE: ST_AsGeoJSON / array_agg / sum unmodeled fns -> unknown.
// TODO(non-query): WITH-wrapped multi-CTE aggregate with stored geo fns;
// validate-only.
type Q_BLVictim_Map = `
    with
    ip_cte as (
        select self.ip, counter, dns_log_counter, tarpit_log_counter from ip self join blacklight_ransomware_victim bv on self.entity_id = bv.entity_id where bv.entity_id = $1
    ),
    geo_cte as (
        select ip_cte.*, ipc.location,  ipc.city, ipc.country, irc.name as company_name
        from ip_geo_cache ipc
        join ip_cte on ip_cte.ip = ipc.ip
        join ip on ip.ip = ipc.ip
        left join entity irc on irc.id = ip.entity_id
        where ipc.location is not null
    )
    select
        geo_cte.location,
        ST_AsGeoJSON(geo_cte.location)::json as geo_json,
        sum(dns_log_counter) as dns_log_counter,
        sum(tarpit_log_counter) as tarpit_log_counter,
        sum(counter) as counter,
        array_agg(geo_cte.ip) as ip,
        (array_agg(geo_cte.city))[1] as city,
        (array_agg(geo_cte.country))[1] as country,
        (array_agg(geo_cte.company_name)) as company_name
    from geo_cte
    group by geo_cte.location
`;
type _V_BLVictim_Map = Expect<Equal<ValidateSQL<Q_BLVictim_Map, S>, true>>;

// ---------------------------------------------------------------------------
// packages/api/src/blacklistIp.ts
// ---------------------------------------------------------------------------

// fetchBlaclistedIps: ipSelect over `blacklist_ip self`.
// NOTE: `self.ip in (...)` / `= $1::inet` shown maximal (= form).
type Q_BlacklistIp_Ip = `select self.ip, self.source, bs.description from blacklist_ip self left join blacklist_source bs on bs.id = self.source where self.ip = $1::inet`;
type _V_BlacklistIp_Ip = Expect<Equal<ValidateSQL<Q_BlacklistIp_Ip, S>, true>>;
type _R_BlacklistIp_Ip = Expect<Equal<
    Simplify<GetReturnType<Q_BlacklistIp_Ip, S>>,
    {
        // self.ip is inet -> unknown
        ip: S["schemas"]["public"]["blacklist_ip"]["ip"];
        source: S["schemas"]["public"]["blacklist_ip"]["source"];
        // bs left-joined -> nullable
        description: S["schemas"]["public"]["blacklist_source"]["description"] | null;
    }
>>;

// fetchBlaclistedIps: cidrSelect over `ip as self` joined to blacklist_cidr.
// NOTE: `self.ip in (...)` / `= $1::inet` shown maximal (= form).
type Q_BlacklistIp_Cidr = `select self.ip, bc.source, bs.description from ip as self join blacklist_cidr bc on bc.cidr >> self.ip left join blacklist_source bs on bs.id = bc.source where self.ip = $1::inet`;
type _V_BlacklistIp_Cidr = Expect<Equal<ValidateSQL<Q_BlacklistIp_Cidr, S>, true>>;
type _R_BlacklistIp_Cidr = Expect<Equal<
    Simplify<GetReturnType<Q_BlacklistIp_Cidr, S>>,
    {
        ip: S["schemas"]["public"]["ip"]["ip"];
        source: S["schemas"]["public"]["blacklist_cidr"]["source"];
        description: S["schemas"]["public"]["blacklist_source"]["description"] | null;
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/companyAddress.ts
// ---------------------------------------------------------------------------

// fetchCompanyAddresses: IP/CIDR branch (raw sql, addr && $2::inet).
// NOTE: offset/limit are inlined numeric literals at runtime (page * PER_PAGE).
type Q_CompanyAddr_Inet = `select * from company_addr where company_id = $1 and addr && $2::inet offset 0 limit 50`;
type _V_CompanyAddr_Inet = Expect<Equal<ValidateSQL<Q_CompanyAddr_Inet, S>, true>>;
type _R_CompanyAddr_Inet = Expect<Equal<
    Simplify<GetReturnType<Q_CompanyAddr_Inet, S>>,
    Simplify<S["schemas"]["public"]["company_addr"]>
>>;

// fetchCompanyAddresses: text-ilike branch.
type Q_CompanyAddr_Like = `select * from company_addr where company_id = $1 and addr::text ilike $2 offset 0 limit 50`;
type _V_CompanyAddr_Like = Expect<Equal<ValidateSQL<Q_CompanyAddr_Like, S>, true>>;
type _R_CompanyAddr_Like = Expect<Equal<
    Simplify<GetReturnType<Q_CompanyAddr_Like, S>>,
    Simplify<S["schemas"]["public"]["company_addr"]>
>>;

// ---------------------------------------------------------------------------
// packages/api/src/companyIp.ts
// ---------------------------------------------------------------------------

// fetchCompanyIps: aggregate over ip grouped by ip/customer_company_id.
// NOTE: min/max/sum/array_agg unmodeled fns -> unknown. `ip.ip = $2` shown
// maximal (the optional ip filter present).
type Q_CompanyIp = `select ip.ip, ip.customer_company_id as company_id, min(ip.created_at) as first_seen_at, max(ip.last_dns_log_match) as last_dns_log_match, max(ip.last_tarpit_log_match) as last_data_log_match, sum(ip.dns_log_counter) as dns_log_counter, sum(ip.tarpit_log_counter) as data_log_counter, (array_agg(ip.country))[1] as country from ip where ip.customer_company_id = $1 and ip.ip = $2 group by ip.ip, ip.customer_company_id order by greatest(last_dns_log_match, last_tarpit_log_match) desc nulls last limit 50`;
type _V_CompanyIp = Expect<Equal<ValidateSQL<Q_CompanyIp, S>, true>>;
type _R_CompanyIp = Expect<Equal<
    Simplify<GetReturnType<Q_CompanyIp, S>>,
    {
        // ip.ip projected -> unknown (engine behavior)
        ip: unknown;
        company_id: S["schemas"]["public"]["ip"]["customer_company_id"];
        // min/max(...) -> arg type, nullable
        first_seen_at: string | null;
        last_dns_log_match: string | null;
        last_data_log_match: string | null;
        // sum(...) -> number
        dns_log_counter: number;
        data_log_counter: number;
        // (array_agg(ip.country))[1] -> element type, nullable (out-of-range
        // subscript -> NULL).
        country: S["schemas"]["public"]["ip"]["country"] | null;
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/dnsIntel.ts
// ---------------------------------------------------------------------------

// fetchDnsIntelLog: select * from dnsintel_log (maximal: query ilike + domain).
// NOTE: `${queryBy} ilike $1` column is dynamic ("answer" shown).
type Q_DnsIntel_Log = `select * from dnsintel_log where answer ilike $1 and domain = $2 order by first_seen desc nulls last limit 100`;
type _V_DnsIntel_Log = Expect<Equal<ValidateSQL<Q_DnsIntel_Log, S>, true>>;
type _R_DnsIntel_Log = Expect<Equal<
    Simplify<GetReturnType<Q_DnsIntel_Log, S>>,
    Simplify<S["schemas"]["public"]["dnsintel_log"]>
>>;

// fetchDnsIntelDomains: aggregate over dnsintel_hunt joined to several tables.
// NOTE: array_agg / min / `is not null` projections -> unknown / boolean.
// `di.domain in (...)` shown maximal (= form); hasIoc/hasHuntReport(Queue)
// and source where fragments all present.
type Q_DnsIntel_Domains = `select di.domain, (array_agg(d.registrant_email))[1] as registrant_email, (array_agg(d.creation_date))[1] as creation_date, (array_agg(d.expiration_date))[1] as expiration_date, (array_agg(hrl.domain))[1] is not null as hunted, (array_agg(hrq.domain))[1] is not null as in_queue, (array_agg(tfioc.domain))[1] is not null as has_ioc, min(di.added_at) as added_at from dnsintel_hunt di join domain d on di.domain = d.domain left join hunt_report_log hrl on di.domain = hrl.domain left join hunt_report_queue hrq on di.domain = hrq.domain left join threatfox_ioc tfioc on di.domain = tfioc.domain where di.domain ilike $1 and di.domain = $2 and tfioc.domain is not null and hrl.domain is not null and hrq.domain is not null and di.source_id = $3 group by di.domain order by added_at desc limit 100`;
type _V_DnsIntel_Domains = Expect<Equal<ValidateSQL<Q_DnsIntel_Domains, S>, true>>;
type _R_DnsIntel_Domains = Expect<Equal<
    Simplify<GetReturnType<Q_DnsIntel_Domains, S>>,
    {
        domain: S["schemas"]["public"]["dnsintel_hunt"]["domain"];
        // (array_agg(d.col))[1] -> element type, nullable (out-of-range -> NULL).
        registrant_email: S["schemas"]["public"]["domain"]["registrant_email"] | null;
        creation_date: S["schemas"]["public"]["domain"]["creation_date"] | null;
        expiration_date: S["schemas"]["public"]["domain"]["expiration_date"] | null;
        // `(array_agg(...))[1] is not null` -> boolean (IS NOT NULL never null,
        // even under the left joins these columns are sourced from).
        hunted: boolean;
        in_queue: boolean;
        has_ioc: boolean;
        // min(non-null added_at) -> string
        added_at: string;
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/ip.ts
// ---------------------------------------------------------------------------

// fetchActiveIps: count over ip with greatest() period guard (inlined const).
// NOTE: date_trunc inlined as a known string const (today period shown).
type Q_Ip_ActiveCount = `select count(*) as cnt from ip where greatest(last_dns_log_match, last_tarpit_log_match) > date_trunc('day', now())`;
type _V_Ip_ActiveCount = Expect<Equal<ValidateSQL<Q_Ip_ActiveCount, S>, true>>;
type _R_Ip_ActiveCount = Expect<Equal<
    Simplify<GetReturnType<Q_Ip_ActiveCount, S>>,
    { cnt: number }
>>;

// fetchIpCountByThreat: count(distinct self.ip) over ip_threat_domain self.
type Q_Ip_CountByThreat = `select count(distinct self.ip) as cnt from ip_threat_domain self inner join hunt_report_log hrl on hrl.domain = self.domain where hrl.threat_id = $1`;
type _V_Ip_CountByThreat = Expect<Equal<ValidateSQL<Q_Ip_CountByThreat, S>, true>>;
type _R_Ip_CountByThreat = Expect<Equal<
    Simplify<GetReturnType<Q_Ip_CountByThreat, S>>,
    { cnt: number }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/ipByDate.ts
// ---------------------------------------------------------------------------

// fetchIpByDate: ip_date filtered by ip + period (lastMonth between maximal).
type Q_IpByDate = `select date, dns_log_counter, tarpit_log_counter from ip_date where ip = $1::inet and date between '2026-05-01' and '2026-05-31' order by date asc`;
type _V_IpByDate = Expect<Equal<ValidateSQL<Q_IpByDate, S>, true>>;
type _R_IpByDate = Expect<Equal<
    Simplify<GetReturnType<Q_IpByDate, S>>,
    {
        date: S["schemas"]["public"]["ip_date"]["date"];
        dns_log_counter: S["schemas"]["public"]["ip_date"]["dns_log_counter"];
        tarpit_log_counter: S["schemas"]["public"]["ip_date"]["tarpit_log_counter"];
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/ipGeo.ts
// ---------------------------------------------------------------------------

// fetchIpGeo: ip_geo self + ST_AsGeoJSON; maximal: cidr = $1::cidr + country.
// NOTE: ST_AsGeoJSON unmodeled fn -> geo_json unknown; cidr/location are inet
// -> unknown.
type Q_IpGeo = `select self.*, ST_AsGeoJSON(self.location)::json as geo_json from ip_geo self where self.cidr = $1::cidr and self.country = $2 offset 0 limit 50`;
type _V_IpGeo = Expect<Equal<ValidateSQL<Q_IpGeo, S>, true>>;
type _R_IpGeo = Expect<Equal<
    Simplify<GetReturnType<Q_IpGeo, S>>,
    Simplify<
        & S["schemas"]["public"]["ip_geo"]
        & { geo_json: unknown }
    >
>>;

// ---------------------------------------------------------------------------
// packages/api/src/ipThreat.ts
// ---------------------------------------------------------------------------

// fetchIpThreats: derived-table aggregate joined to threat.
// NOTE: limit/offset inlined numeric literals (limit/offset options).
type Q_IpThreat_Threats = `
    select
        i.threat_id,
        i.dns_request_count,
        i.data_request_count,
        t.name as threat_name,
        t.description as threat_description
    from (
            select
                itd.ip,
                hrl.threat_id,
                sum(itd.dns_log_counter) as dns_request_count,
                sum(itd.tarpit_log_counter) as data_request_count
            from ip_threat_domain itd
            join hunt_report_log hrl on hrl.domain = itd.domain
            where itd.ip = $1::inet
            group by itd.ip, hrl.threat_id
            order by (sum(itd.dns_log_counter) + sum(itd.tarpit_log_counter)) desc
            limit 10 offset 0
    ) i
    join threat t on t.id = i.threat_id
`;
type _V_IpThreat_Threats = Expect<Equal<ValidateSQL<Q_IpThreat_Threats, S>, true>>;
type _R_IpThreat_Threats = Expect<Equal<
    Simplify<GetReturnType<Q_IpThreat_Threats, S>>,
    {
        threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
        // i.<sum-col> -> number
        dns_request_count: number;
        data_request_count: number;
        // base table `threat` JOINed onto derived `i`: t.name / t.description now resolve
        threat_name: S["schemas"]["public"]["threat"]["name"];
        threat_description: S["schemas"]["public"]["threat"]["description"];
    }
>>;

// fetchIpThreatDomains: ip_threat_domain itd joined to hunt_report_log.
// NOTE: limit/offset inlined numeric literals.
type Q_IpThreat_Domains = `
    select
        itd.domain,
        itd.dns_log_counter as dns_request_count,
        itd.tarpit_log_counter as data_request_count,
        itd.last_dns_log_match as last_dns_request_at,
        itd.last_tarpit_log_match as last_data_request_at
    from ip_threat_domain itd
    join hunt_report_log hrl on hrl.domain = itd.domain
    where itd.ip = $1::inet
    and hrl.threat_id = $2
    limit 10
    offset 0
`;
type _V_IpThreat_Domains = Expect<Equal<ValidateSQL<Q_IpThreat_Domains, S>, true>>;
type _R_IpThreat_Domains = Expect<Equal<
    Simplify<GetReturnType<Q_IpThreat_Domains, S>>,
    {
        domain: S["schemas"]["public"]["ip_threat_domain"]["domain"];
        dns_request_count: S["schemas"]["public"]["ip_threat_domain"]["dns_log_counter"];
        data_request_count: S["schemas"]["public"]["ip_threat_domain"]["tarpit_log_counter"];
        last_dns_request_at: S["schemas"]["public"]["ip_threat_domain"]["last_dns_log_match"];
        last_data_request_at: S["schemas"]["public"]["ip_threat_domain"]["last_tarpit_log_match"];
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/lastActiveIps.ts
// ---------------------------------------------------------------------------

// fetchLastActiveIps: WITH two CTEs + aggregate map (companyId branch shown).
// TODO(non-query): WITH-wrapped multi-CTE aggregate with stored geo fns;
// validate-only.
type Q_LastActiveIps = `
    with
    ip_cte as (
        select ip,
            sum(dns_log_counter) as dns_log_counter,
            sum(tarpit_log_counter) as tarpit_log_counter,
            sum(counter) as counter
        from ip_company_date
        where company_id = $1 and
                date > now() - interval '1 month'
        group by ip
        order by sum(counter) desc
        limit 5000
    ),
    geo_cte as (
        select ip_cte.*, ipc.location,  ipc.city, ipc.country, irc.name as company_name
        from ip_geo_cache ipc
        join ip_cte on ip_cte.ip = ipc.ip
        join ip on ip.ip = ipc.ip
        left join entity irc on irc.id = ip.entity_id
        where ipc.location is not null
    )
    select
        geo_cte.location,
        ST_AsGeoJSON(geo_cte.location)::json as geo_json,
        sum(dns_log_counter) as dns_log_counter,
        sum(tarpit_log_counter) as tarpit_log_counter,
        sum(counter) as counter,
        array_agg(geo_cte.ip) as ip,
        (array_agg(geo_cte.city))[1] as city,
        (array_agg(geo_cte.country))[1] as country,
        (array_agg(geo_cte.company_name)) as company_name
    from geo_cte
    group by geo_cte.location
`;
type _V_LastActiveIps = Expect<Equal<ValidateSQL<Q_LastActiveIps, S>, true>>;

// fetchLastActiveEntities: WITH two CTEs (nested derived) + final projection.
// TODO(non-query): WITH-wrapped nested-derived aggregate with stored geo fns;
// validate-only.
type Q_LastActiveEntities = `
    with ips as (
        select
        lh.ip,
        lh.dns_log_counter,
        lh.tarpit_log_counter,
        lh.counter,
        ip.entity_id::text,
        e.name,
        e.type,
        ST_AsGeoJSON(igc.location) as geo_json,
        igc.country
        from (
            select
                ilh.ip,
                sum(ilh.dns_log_counter) as dns_log_counter,
                sum(ilh.tarpit_log_counter) as tarpit_log_counter,
                sum(ilh.counter) as counter
            from ip_last_hour ilh
            group by ilh.ip
            order by sum(ilh.counter) desc
            limit 1000
        ) lh
        join ip on ip.ip = lh.ip
        join entity e on e.id = ip.entity_id
        left join ip_geo_cache igc on igc.ip = lh.ip
        where ip.entity_id is not null
    ),
    grouped as (
        select
        ips.entity_id,
        (array_agg(ips.dns_log_counter))[1] as dns_log_counter,
        (array_agg(ips.tarpit_log_counter))[1] as tarpit_log_counter,
        (array_agg(ips.counter))[1] as counter,
        (array_agg(ips.name))[1] as name,
        (array_agg(ips.type))[1] as type,
        (array_agg(ips.geo_json))[1] as geo_json,
        (array_agg(ips.country))[1] as country
        from ips
        group by ips.entity_id
    )
    select
        entity_id,
        dns_log_counter,
        tarpit_log_counter,
        counter,
        name,
        type,
        geo_json,
        country
    from grouped
`;
type _V_LastActiveEntities = Expect<Equal<ValidateSQL<Q_LastActiveEntities, S>, true>>;

// ---------------------------------------------------------------------------
// packages/api/src/registrarHunt.ts
// ---------------------------------------------------------------------------

// fetchRegistrarHunt: aggregate over registrar_hunt self + 4 joins.
// NOTE: array_agg / min -> unknown/string; hunted/queued CASE over boolean
// literals -> boolean; first_seen_delay CASE (extract THEN, null ELSE) ->
// number | null. All optional where fragments present (maximal form).
type Q_RegistrarHunt = `select self.domain, min(tioc.first_seen_at) as first_seen_at, (array_agg(d.status))[1] as status, (array_agg(d.country))[1] as country, (array_agg(d.source))[1] as source, (array_agg(tioc.threat_type))[1] as threat_type, (array_agg(tioc.malware))[1] as threat_id, (array_agg(tioc.malware_printable))[1] as threat_name, (array_agg(tioc.confidence_level))[1] as confidence_level, (case when (array_agg(distinct hrl.domain))[1] is not null then true else false end) as hunted, (case when (array_agg(distinct hrq.domain))[1] is not null then true else false end) as queued, (case when min(tioc.first_seen_at) is not null and (array_agg(d.creation_date))[1] is not null then extract(day from min(tioc.first_seen_at) - (array_agg(d.creation_date))[1]) else null end) as first_seen_delay from registrar_hunt self join domain d on self.domain = d.domain join threatfox_ioc tioc on tioc.domain = d.domain left join hunt_report_log hrl on hrl.domain = d.domain left join hunt_report_queue hrq on hrq.domain = d.domain where d.country = $1 and self.domain = $2 and d.source in ($3) and tioc.threat_type = $4 and self.domain = $5 group by self.domain order by first_seen_at desc limit 50`;
type _V_RegistrarHunt = Expect<Equal<ValidateSQL<Q_RegistrarHunt, S>, true>>;
type _R_RegistrarHunt = Expect<Equal<
    Simplify<GetReturnType<Q_RegistrarHunt, S>>,
    {
        domain: S["schemas"]["public"]["registrar_hunt"]["domain"];
        // min(tioc.first_seen_at) -> string, nullable
        first_seen_at: string | null;
        // (array_agg(col))[1] -> element type, nullable (out-of-range -> NULL).
        status: S["schemas"]["public"]["domain"]["status"] | null;
        country: S["schemas"]["public"]["domain"]["country"] | null;
        source: S["schemas"]["public"]["domain"]["source"] | null;
        threat_type: S["schemas"]["public"]["threatfox_ioc"]["threat_type"] | null;
        threat_id: S["schemas"]["public"]["threatfox_ioc"]["malware"] | null;
        threat_name: S["schemas"]["public"]["threatfox_ioc"]["malware_printable"] | null;
        confidence_level: S["schemas"]["public"]["threatfox_ioc"]["confidence_level"] | null;
        hunted: boolean;
        queued: boolean;
        first_seen_delay: number | null;
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/suspendedDomain.ts
// ---------------------------------------------------------------------------

// fetchSuspendedDomains: suspended_domain self, maximal where fragments.
type Q_SuspDomain_List = `select self.* from suspended_domain self where self.domain in ($1) and self.current_status = $2 and self.reason = $3 order by self.suspension_date desc nulls last limit 50`;
type _V_SuspDomain_List = Expect<Equal<ValidateSQL<Q_SuspDomain_List, S>, true>>;
type _R_SuspDomain_List = Expect<Equal<
    Simplify<GetReturnType<Q_SuspDomain_List, S>>,
    Simplify<S["schemas"]["public"]["suspended_domain"]>
>>;

// fetchSuspendedDomain: single by domain.
type Q_SuspDomain_One = `select self.* from suspended_domain self where self.domain = $1`;
type _V_SuspDomain_One = Expect<Equal<ValidateSQL<Q_SuspDomain_One, S>, true>>;
type _R_SuspDomain_One = Expect<Equal<
    Simplify<GetReturnType<Q_SuspDomain_One, S>>,
    Simplify<S["schemas"]["public"]["suspended_domain"]>
>>;

// fetchSuspendedStatuses: distinct current_status.
type Q_SuspDomain_Statuses = `select distinct current_status from suspended_domain where current_status is not null order by current_status`;
type _V_SuspDomain_Statuses = Expect<Equal<ValidateSQL<Q_SuspDomain_Statuses, S>, true>>;
type _R_SuspDomain_Statuses = Expect<Equal<
    Simplify<GetReturnType<Q_SuspDomain_Statuses, S>>,
    { current_status: S["schemas"]["public"]["suspended_domain"]["current_status"] }
>>;

// fetchSuspendedReasons: distinct reason.
type Q_SuspDomain_Reasons = `select distinct reason from suspended_domain where reason is not null order by reason`;
type _V_SuspDomain_Reasons = Expect<Equal<ValidateSQL<Q_SuspDomain_Reasons, S>, true>>;
type _R_SuspDomain_Reasons = Expect<Equal<
    Simplify<GetReturnType<Q_SuspDomain_Reasons, S>>,
    { reason: S["schemas"]["public"]["suspended_domain"]["reason"] }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/tarpitLog.ts
// ---------------------------------------------------------------------------

// fetchTarpitLog (queryBy payload/headers branch): id lookup by content ilike.
// NOTE: ${table} -> tarpit_payload shown (payload branch).
type Q_TarpitLog_PayloadIds = `select id from tarpit_payload where content ilike $1 order by created_at desc limit 100`;
type _V_TarpitLog_PayloadIds = Expect<Equal<ValidateSQL<Q_TarpitLog_PayloadIds, S>, true>>;
type _R_TarpitLog_PayloadIds = Expect<Equal<
    Simplify<GetReturnType<Q_TarpitLog_PayloadIds, S>>,
    { id: S["schemas"]["public"]["tarpit_payload"]["id"] }
>>;

// fetchTarpitLog withHeaders relation: distinct id, content from tarpit_header.
// NOTE: created_at > '<iso>' inlined; id in (...) dynamic list (one shown).
type Q_TarpitLog_Headers = `
    select distinct id, content
    from tarpit_header
    where
    created_at > '2026-05-01T00:00:00Z'
    and id in ('h1')
`;
type _V_TarpitLog_Headers = Expect<Equal<ValidateSQL<Q_TarpitLog_Headers, S>, true>>;
type _R_TarpitLog_Headers = Expect<Equal<
    Simplify<GetReturnType<Q_TarpitLog_Headers, S>>,
    {
        id: S["schemas"]["public"]["tarpit_header"]["id"];
        content: S["schemas"]["public"]["tarpit_header"]["content"];
    }
>>;

// fetchTarpitLog withPayload relation: distinct payload columns from tarpit_payload.
// NOTE: created_at > '<iso>' inlined; id in (...) dynamic list (one shown).
type Q_TarpitLog_Payloads = `
    select
        distinct id, content, gzipped,
        failed_decoding, type, extracted_data,
        has_analyzer
    from tarpit_payload
    where
    created_at > '2026-05-01T00:00:00Z'
    and id in ('p1')
`;
type _V_TarpitLog_Payloads = Expect<Equal<ValidateSQL<Q_TarpitLog_Payloads, S>, true>>;
type _R_TarpitLog_Payloads = Expect<Equal<
    Simplify<GetReturnType<Q_TarpitLog_Payloads, S>>,
    {
        id: S["schemas"]["public"]["tarpit_payload"]["id"];
        content: S["schemas"]["public"]["tarpit_payload"]["content"];
        gzipped: S["schemas"]["public"]["tarpit_payload"]["gzipped"];
        failed_decoding: S["schemas"]["public"]["tarpit_payload"]["failed_decoding"];
        type: S["schemas"]["public"]["tarpit_payload"]["type"];
        extracted_data: S["schemas"]["public"]["tarpit_payload"]["extracted_data"];
        has_analyzer: S["schemas"]["public"]["tarpit_payload"]["has_analyzer"];
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/threat.ts
// ---------------------------------------------------------------------------

// fetchThreats: threat t + threat_stats ts, maximal where fragments.
type Q_Threat_List = `select t.id, t.name, t.type, t.description, t.alias, t.actor, t.malpedia_data, t.yara_available, t.notes, ts.last_dns_log_match, ts.last_tarpit_log_match, ts.dns_log_counter, ts.tarpit_log_counter, ts.total_count from threat t left join threat_stats ts on ts.threat_id = t.id where t.name ilike $1 and ts.total_count > 0 and t.id in ($2) order by ts.total_count desc nulls last limit 100`;
type _V_Threat_List = Expect<Equal<ValidateSQL<Q_Threat_List, S>, true>>;
type _R_Threat_List = Expect<Equal<
    Simplify<GetReturnType<Q_Threat_List, S>>,
    {
        id: S["schemas"]["public"]["threat"]["id"];
        name: S["schemas"]["public"]["threat"]["name"];
        type: S["schemas"]["public"]["threat"]["type"];
        description: S["schemas"]["public"]["threat"]["description"];
        alias: S["schemas"]["public"]["threat"]["alias"];
        actor: S["schemas"]["public"]["threat"]["actor"];
        malpedia_data: S["schemas"]["public"]["threat"]["malpedia_data"];
        yara_available: S["schemas"]["public"]["threat"]["yara_available"];
        notes: S["schemas"]["public"]["threat"]["notes"];
        // ts left-joined -> nullable
        last_dns_log_match: S["schemas"]["public"]["threat_stats"]["last_dns_log_match"] | null;
        last_tarpit_log_match: S["schemas"]["public"]["threat_stats"]["last_tarpit_log_match"] | null;
        dns_log_counter: S["schemas"]["public"]["threat_stats"]["dns_log_counter"] | null;
        tarpit_log_counter: S["schemas"]["public"]["threat_stats"]["tarpit_log_counter"] | null;
        total_count: S["schemas"]["public"]["threat_stats"]["total_count"] | null;
    }
>>;

// fetchThreatTypes: distinct threat_type from hunt_report_log.
type Q_Threat_Types = `select distinct threat_type from hunt_report_log order by threat_type`;
type _V_Threat_Types = Expect<Equal<ValidateSQL<Q_Threat_Types, S>, true>>;
type _R_Threat_Types = Expect<Equal<
    Simplify<GetReturnType<Q_Threat_Types, S>>,
    { threat_type: S["schemas"]["public"]["hunt_report_log"]["threat_type"] }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/topCountry.ts
// ---------------------------------------------------------------------------

// fetchTopCountries (companyId branch): select * from company_country self.
type Q_TopCountry_Company = `select * from company_country self where self.company_id = $1 and self.country in ($2) order by self.total_request_count desc limit 10`;
type _V_TopCountry_Company = Expect<Equal<ValidateSQL<Q_TopCountry_Company, S>, true>>;
type _R_TopCountry_Company = Expect<Equal<
    Simplify<GetReturnType<Q_TopCountry_Company, S>>,
    Simplify<S["schemas"]["public"]["company_country"]>
>>;

// fetchTopCountries (no-companyId branch): select * from country self.
type Q_TopCountry_Country = `select * from country self where self.country in ($1) order by self.total_request_count desc limit 10`;
type _V_TopCountry_Country = Expect<Equal<ValidateSQL<Q_TopCountry_Country, S>, true>>;
type _R_TopCountry_Country = Expect<Equal<
    Simplify<GetReturnType<Q_TopCountry_Country, S>>,
    Simplify<S["schemas"]["public"]["country"]>
>>;

// fetchTopCountriesByPeriod (companyId branch): company_country_date self.
// NOTE: setPeriod lastMonth between maximal; sum() -> unknown.
type Q_TopCountry_ByPeriod = `select self.country, sum(self.dns_log_count) as dns_request_count, sum(self.tarpit_log_count) as data_request_count, sum(self.total_request_count) as total_request_count, sum(self.ip_count) as ip_count from company_country_date self where self.date between '2026-05-01' and '2026-05-31' and self.company_id = $1 and self.country in ($2) group by self.country order by sum(self.total_request_count) desc limit 10`;
type _V_TopCountry_ByPeriod = Expect<Equal<ValidateSQL<Q_TopCountry_ByPeriod, S>, true>>;
type _R_TopCountry_ByPeriod = Expect<Equal<
    Simplify<GetReturnType<Q_TopCountry_ByPeriod, S>>,
    {
        country: S["schemas"]["public"]["company_country_date"]["country"];
        // sum(...) / count(...) -> number; sum over the NULLABLE
        // total_request_count column -> number | null (all-NULL group)
        dns_request_count: number;
        data_request_count: number;
        total_request_count: number | null;
        ip_count: number;
    }
>>;

// fetchTopCountriesByDomain: ip_threat_domain self join ip, grouped by country.
type Q_TopCountry_ByDomain = `select ip.country, sum(self.dns_log_counter) as dns_request_count, sum(self.tarpit_log_counter) as data_request_count, count(distinct self.ip) as ip_count, sum(self.dns_log_counter) + sum(self.tarpit_log_counter) as total_request_count from ip_threat_domain self join ip on ip.ip = self.ip where self.domain = $1 group by ip.country order by total_request_count desc limit 10`;
type _V_TopCountry_ByDomain = Expect<Equal<ValidateSQL<Q_TopCountry_ByDomain, S>, true>>;
type _R_TopCountry_ByDomain = Expect<Equal<
    Simplify<GetReturnType<Q_TopCountry_ByDomain, S>>,
    {
        country: S["schemas"]["public"]["ip"]["country"];
        // sum(...) -> number
        dns_request_count: number;
        data_request_count: number;
        ip_count: number;
        total_request_count: number;
    }
>>;

// fetchTopCountriesByThreat: threat_domain_country_date self join hunt_report_log.
// NOTE: setPeriod lastMonth between maximal; sum() -> unknown.
type Q_TopCountry_ByThreat = `select self.country, sum(self.dns_log_counter) as dns_requests, sum(self.tarpit_log_counter) as data_requests, sum(self.dns_log_counter + self.tarpit_log_counter) as total_requests from threat_domain_country_date self inner join hunt_report_log hrl on hrl.domain = self.domain where self.date between '2026-05-01' and '2026-05-31' and hrl.threat_id = $1 group by self.country order by total_requests desc`;
type _V_TopCountry_ByThreat = Expect<Equal<ValidateSQL<Q_TopCountry_ByThreat, S>, true>>;
type _R_TopCountry_ByThreat = Expect<Equal<
    Simplify<GetReturnType<Q_TopCountry_ByThreat, S>>,
    {
        country: S["schemas"]["public"]["threat_domain_country_date"]["country"];
        // both counter columns are NULLABLE -> sums are number | null
        dns_requests: number | null;
        data_requests: number | null;
        total_requests: number | null;
    }
>>;

// fetchCountriesCountByThreat: count(distinct country) over threat_domain_country_date.
type Q_TopCountry_CountByThreat = `select count(distinct self.country) as cnt from threat_domain_country_date self inner join hunt_report_log hrl on hrl.domain = self.domain where hrl.threat_id = $1`;
type _V_TopCountry_CountByThreat = Expect<Equal<ValidateSQL<Q_TopCountry_CountByThreat, S>, true>>;
type _R_TopCountry_CountByThreat = Expect<Equal<
    Simplify<GetReturnType<Q_TopCountry_CountByThreat, S>>,
    { cnt: number }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/topEntity.ts
// ---------------------------------------------------------------------------

// fetchTopEntitiesByPeriod: derived-table aggregate over entity_date join entity.
// NOTE: setPeriod lastMonth between maximal; country + customerCompanyId joins
// present (maximal form); sum() -> unknown.
type Q_TopEntity_ByPeriod = `
    select
        cte.entity_id,
        entity.name as entity_name,
        cte.dns_request_count,
        cte.data_request_count,
        cte.total_request_count
    from (select entity_date.entity_id, sum(entity_date.dns_log_counter) as dns_request_count, sum(entity_date.tarpit_log_counter) as data_request_count, sum(entity_date.counter) as total_request_count from entity_date join ip on ip.entity_id = entity_date.entity_id where entity_date.date between '2026-05-01' and '2026-05-31' and ip.country = $1 and ip.customer_company_id = $2 group by entity_date.entity_id order by sum(entity_date.counter) desc limit 10) cte
    join entity on entity.id = cte.entity_id
`;
type _V_TopEntity_ByPeriod = Expect<Equal<ValidateSQL<Q_TopEntity_ByPeriod, S>, true>>;
type _R_TopEntity_ByPeriod = Expect<Equal<
    Simplify<GetReturnType<Q_TopEntity_ByPeriod, S>>,
    {
        entity_id: S["schemas"]["public"]["entity_date"]["entity_id"];
        // base table `entity` JOINed onto derived `cte`: entity.name now resolves
        entity_name: S["schemas"]["public"]["entity"]["name"];
        // sum(...) -> number; entity_date.counter is NULLABLE -> number | null
        dns_request_count: number;
        data_request_count: number;
        total_request_count: number | null;
    }
>>;

// fetchTopEntitiesByIpPeriod: derived ip_date aggregate joined to ip + entity.
// NOTE: setPeriod lastMonth between maximal; country + customerCompanyId joins.
type Q_TopEntity_ByIpPeriod = `
    select
        ip.entity_id,
        (array_agg(ipc.name))[1] as entity_name,
        sum(cte.dns_request_count) as dns_request_count,
        sum(cte.data_request_count) as data_request_count,
        sum(cte.total_request_count) as total_request_count
    from (select ip_date.ip, sum(ip_date.dns_log_counter) as dns_request_count, sum(ip_date.tarpit_log_counter) as data_request_count, sum(ip_date.counter) as total_request_count from ip_date join ip on ip.ip = ip_date.ip where ip_date.date between '2026-05-01' and '2026-05-31' and ip.country = $1 and ip.customer_company_id = $2 group by ip_date.ip order by sum(ip_date.counter) desc limit 110) cte
    join ip on ip.ip = cte.ip
    left join entity ipc on ipc.id = ip.entity_id
    where ip.entity_id is not null
    group by ip.entity_id
    order by sum(cte.total_request_count) desc
    limit 10
`;
type _V_TopEntity_ByIpPeriod = Expect<Equal<ValidateSQL<Q_TopEntity_ByIpPeriod, S>, true>>;
type _R_TopEntity_ByIpPeriod = Expect<Equal<
    Simplify<GetReturnType<Q_TopEntity_ByIpPeriod, S>>,
    {
        // ip.entity_id; ip left-joined to entity but ip itself is base table
        entity_id: S["schemas"]["public"]["ip"]["entity_id"];
        entity_name: unknown;
        dns_request_count: unknown;
        data_request_count: unknown;
        total_request_count: unknown;
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/topIp.ts
// ---------------------------------------------------------------------------

// fetchTopIps: ip + entity join, maximal (withEntity + domain join + all where).
// NOTE: ipc left-joined -> entity_name nullable; itd join adds cnt projection.
type Q_TopIp_Main = `select ip.ip, ip.country, ip.dns_log_counter as dns_request_count, ip.tarpit_log_counter as data_request_count, ip.counter as total_request_count, ip.last_dns_log_match, ip.last_tarpit_log_match, entity_id, ipc.name as entity_name, itd.dns_log_counter as cnt from ip left join entity ipc on ipc.id = ip.entity_id join ip_threat_domain itd on itd.ip = ip.ip where ip.entity_id = $1 and ip.customer_company_id = $2 and ip.country = $3 and itd.domain = $4 and ip.ip = $5 and greatest(ip.last_dns_log_match, ip.last_tarpit_log_match) > date_trunc('day', now()) order by ip.counter desc offset 0 limit 50`;
type _V_TopIp_Main = Expect<Equal<ValidateSQL<Q_TopIp_Main, S>, true>>;
type _R_TopIp_Main = Expect<Equal<
    Simplify<GetReturnType<Q_TopIp_Main, S>>,
    {
        ip: S["schemas"]["public"]["ip"]["ip"];
        country: S["schemas"]["public"]["ip"]["country"];
        dns_request_count: S["schemas"]["public"]["ip"]["dns_log_counter"];
        data_request_count: S["schemas"]["public"]["ip"]["tarpit_log_counter"];
        total_request_count: S["schemas"]["public"]["ip"]["counter"];
        last_dns_log_match: S["schemas"]["public"]["ip"]["last_dns_log_match"];
        last_tarpit_log_match: S["schemas"]["public"]["ip"]["last_tarpit_log_match"];
        // unqualified entity_id resolves to ip.entity_id
        entity_id: S["schemas"]["public"]["ip"]["entity_id"];
        // ipc (entity) left-joined -> nullable
        entity_name: S["schemas"]["public"]["entity"]["name"] | null;
        cnt: S["schemas"]["public"]["ip_threat_domain"]["dns_log_counter"];
    }
>>;

// fetchTopIpsByPeriod: derived ip_date aggregate join ip + left entity.
// NOTE: setPeriod lastMonth between maximal; sum() -> unknown.
type Q_TopIp_ByPeriod = `
    select
        cte.ip,
        ip.entity_id,
        ip.country,
        ipc.name as entity_name,
        cte.dns_request_count,
        cte.data_request_count,
        cte.total_request_count
    from (select ip_date.ip, sum(ip_date.dns_log_counter) as dns_request_count, sum(ip_date.tarpit_log_counter) as data_request_count, sum(ip_date.counter) as total_request_count from ip_date join ip on ip.ip = ip_date.ip where ip_date.date between '2026-05-01' and '2026-05-31' and ip.country = $1 and ip.customer_company_id = $2 group by ip_date.ip order by sum(ip_date.counter) desc limit 10) cte
    join ip on ip.ip = cte.ip
    left join entity ipc on ipc.id = ip.entity_id
`;
type _V_TopIp_ByPeriod = Expect<Equal<ValidateSQL<Q_TopIp_ByPeriod, S>, true>>;
type _R_TopIp_ByPeriod = Expect<Equal<
    Simplify<GetReturnType<Q_TopIp_ByPeriod, S>>,
    {
        ip: unknown;
        entity_id: S["schemas"]["public"]["ip"]["entity_id"];
        country: S["schemas"]["public"]["ip"]["country"];
        // ipc (entity) left-joined -> nullable
        entity_name: S["schemas"]["public"]["entity"]["name"] | null;
        // cte.<sum-col> -> number; ip_date.counter is NULLABLE -> number | null
        dns_request_count: number;
        data_request_count: number;
        total_request_count: number | null;
    }
>>;

// fetchTopIpsByDomain (withEntity branch): derived ip_date_threat_domain self
// aggregate + blacklist, wrapped and joined to ip + left entity.
// NOTE: setPeriod lastMonth between maximal; entity/company/country joins all
// present (deduped by "join-ip" name -> single `join ip`); blacklisted col.
type Q_TopIp_ByDomain = `
    select
        cte.ip,
        ip.entity_id,
        ipc.name as entity_name,
        cte.dns_request_count,
        cte.data_request_count,
        cte.total_request_count
    , cte.blacklisted
    from (
        select self.ip, sum(dns_log_counter) as dns_request_count, sum(tarpit_log_counter) as data_request_count, sum(dns_log_counter) + sum(tarpit_log_counter) as total_request_count, (array_agg(bl.ip is not null))[1] as blacklisted from ip_date_threat_domain self join ip on ip.ip = self.ip left join blacklist_ip bl on bl.ip = self.ip where self.date between '2026-05-01' and '2026-05-31' and self.domain = $1 and ip.entity_id = $2 and ip.customer_company_id = $3 and ip.country = $4 group by self.ip order by total_request_count desc offset 0 limit 50
    ) cte
    join ip on ip.ip = cte.ip
    left join entity ipc on ipc.id = ip.entity_id
    order by cte.total_request_count desc
`;
type _V_TopIp_ByDomain = Expect<Equal<ValidateSQL<Q_TopIp_ByDomain, S>, true>>;
type _R_TopIp_ByDomain = Expect<Equal<
    Simplify<GetReturnType<Q_TopIp_ByDomain, S>>,
    {
        ip: unknown;
        entity_id: S["schemas"]["public"]["ip"]["entity_id"];
        entity_name: S["schemas"]["public"]["entity"]["name"] | null;
        // cte.<sum-col> -> number
        dns_request_count: number;
        data_request_count: number;
        total_request_count: number;
        // (array_agg(bl.ip is not null))[1] -> boolean (IS NOT NULL) subscript,
        // nullable (out-of-range -> NULL).
        blacklisted: boolean | null;
    }
>>;

// fetchTopIpsByThreat: ip_date_threat_domain self aggregate join hunt_report_log.
// NOTE: setPeriod lastMonth between maximal; sum() -> unknown.
type Q_TopIp_ByThreat = `select self.ip, sum(dns_log_counter) as dns_cnt, sum(tarpit_log_counter) as tarpit_cnt, sum(dns_log_counter + tarpit_log_counter) as cnt from ip_date_threat_domain self inner join hunt_report_log hrl on hrl.domain = self.domain where self.date between '2026-05-01' and '2026-05-31' and hrl.threat_id = $1 group by self.ip order by cnt desc limit 10`;
type _V_TopIp_ByThreat = Expect<Equal<ValidateSQL<Q_TopIp_ByThreat, S>, true>>;
type _R_TopIp_ByThreat = Expect<Equal<
    Simplify<GetReturnType<Q_TopIp_ByThreat, S>>,
    {
        // self.ip projected -> unknown (engine behavior)
        ip: unknown;
        // sum(...) -> number
        dns_cnt: number;
        tarpit_cnt: number;
        cnt: number;
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/users.ts
// ---------------------------------------------------------------------------
// fetchUsers builds from `auth.users u` (the Supabase auth schema), joined to
// public.* tables. auth.users is not in the fixture.
// FIXTURE-GAP: auth.users (and columns email/raw_app_meta_data/created_at/id)

// fetchUsers companies sub-query: company_user cu join company c.
type Q_Users_Companies = `select cu.user_id, c.id as company_id, c.name as company_name from company_user cu inner join company c on c.id = cu.company_id where cu.user_id in ($1)`;
type _V_Users_Companies = Expect<Equal<ValidateSQL<Q_Users_Companies, S>, true>>;
type _R_Users_Companies = Expect<Equal<
    Simplify<GetReturnType<Q_Users_Companies, S>>,
    {
        user_id: S["schemas"]["public"]["company_user"]["user_id"];
        company_id: S["schemas"]["public"]["company"]["id"];
        company_name: S["schemas"]["public"]["company"]["name"];
    }
>>;

// ---------------------------------------------------------------------------
// packages/api/src/table/Ip.ts  (used by ip.ts fetchIps / fetchIp)
// ---------------------------------------------------------------------------
// IpTable: from `ip self`, select self.*; maximal options (companyId, entityId,
// country, ip, withEntity -> left join entity + entity_name, order).
type Q_IpTable = `select self.*, ipc.name as entity_name from ip self left join entity ipc on ipc.id = self.entity_id where self.customer_company_id = $1 and self.entity_id = $2 and self.country = $3 and self.ip = $4::inet offset 0 limit 20`;
type _V_IpTable = Expect<Equal<ValidateSQL<Q_IpTable, S>, true>>;
type _R_IpTable = Expect<Equal<
    Simplify<GetReturnType<Q_IpTable, S>>,
    Simplify<
        & S["schemas"]["public"]["ip"]
        & { entity_name: S["schemas"]["public"]["entity"]["name"] | null }
    >
>>;

// ---------------------------------------------------------------------------
// packages/api/src/table/BlacklightVictim.ts  (used by blacklightVictim.ts)
// ---------------------------------------------------------------------------
// BlacklightVictimTable: from `blacklight_ransomware_victim self`, select self.*;
// maximal (id, withEntityMatch, groupId, name, withCounters -> inner join
// entity_counter + counter cols + scalar subquery first_ip_match, order).
// FIXTURE-GAP: blacklight_ransomware_victim.group (column not in fixture)
// NOTE: scalar subquery `(select min(created_at) ...) as first_ip_match` -> unknown.
type Q_BLVictimTable = `select self.*, ipcnt.dns_log_last_match, ipcnt.tarpit_log_last_match, ipcnt.dns_log_counter, ipcnt.tarpit_log_counter, ipcnt.counter, ipcnt.last_match, (select min(created_at) from ip where entity_id = self.entity_id) as first_ip_match from blacklight_ransomware_victim self join entity_counter ipcnt on ipcnt.entity_id = self.entity_id where self.id in ($1) and self.entity_id is not null and self.group = $2 and self.entity_name = $3 order by (coalesce(ipcnt.tarpit_log_counter, 0) + coalesce(ipcnt.dns_log_counter, 0)) desc nulls last offset 0 limit 20`;
type _V_BLVictimTable = Expect<Equal<ValidateSQL<Q_BLVictimTable, S>, true>>;

export type PackagesApiTestsPass = true;
