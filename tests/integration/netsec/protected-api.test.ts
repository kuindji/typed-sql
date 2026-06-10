/**
 * Netsec protected-api query coverage.
 * Queries copied from the netsec app (services/api/protected-api). Collection
 * pass: faithful coverage; red/unknown results are expected findings, not bugs.
 *
 * Builder (`new Select()`) sites are reconstructed into the SQL string the
 * builder emits, in this order:
 *   select [<flags> ]<cols> from <from> <joins> where <AND-joined> ...
 *   group by ... having ... order by ... [offset N ][limit N]
 * `.addValue(v)` -> $N (1-based call order); `.addValue(v,'cast')` -> $N::cast.
 * `.limit(N, offset)` emits `offset <offset> limit <N>`.
 * Conditionally-added `.where(...)` fragments are included in maximal form.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// services/api/protected-api/src/dns_log.ts
// ---------------------------------------------------------------------------

// fetchEntities: dynamic IN-list, maximal form with one literal.
// NOTE: `where id in (...)` list is dynamically built; maximal form shown.
type Q_DnsLog_Entities = `select id, name from entity where id in ('e1')`;
type _V_DnsLog_Entities = Expect<Equal<ValidateSQL<Q_DnsLog_Entities, S>, true>>;
type _R_DnsLog_Entities = Expect<Equal<
    Simplify<GetReturnType<Q_DnsLog_Entities, S>>,
    { id: S["schemas"]["public"]["entity"]["id"]; name: S["schemas"]["public"]["entity"]["name"] }
>>;

// fetchThreats: hunt_report_log left join threat.
// NOTE: `where hrl.domain in (...)` list dynamically built; maximal form shown.
type Q_DnsLog_Threats = `
    select
        hrl.domain,
        hrl.threat_id,
        coalesce(t.name, hrl.threat) as name,
        t.type,
        coalesce(t.actor, hrl.threat_actor) as actor
        from hunt_report_log hrl
        left join threat t on t.id = hrl.threat_id
        where hrl.domain in ('a.example')
`;
type _V_DnsLog_Threats = Expect<Equal<ValidateSQL<Q_DnsLog_Threats, S>, true>>;
type _R_DnsLog_Threats = Expect<Equal<
    Simplify<GetReturnType<Q_DnsLog_Threats, S>>,
    {
        domain: S["schemas"]["public"]["hunt_report_log"]["domain"];
        threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
        // coalesce(t.name [left-joined, nullable], hrl.threat) -> nullable
        name: string | null;
        type: S["schemas"]["public"]["threat"]["type"] | null;
        actor: string | null;
    }
>>;

// main(): Select builder over dns_log_edge.
type Q_DnsLog_Main = `select id, ip, time, question_domain, question_class, question_type, entity_id, domain from dns_log_edge where customer_company_id = $1 and time > $2 order by time desc`;
type _V_DnsLog_Main = Expect<Equal<ValidateSQL<Q_DnsLog_Main, S>, true>>;
type _R_DnsLog_Main = Expect<Equal<
    Simplify<GetReturnType<Q_DnsLog_Main, S>>,
    {
        id: S["schemas"]["public"]["dns_log_edge"]["id"];
        ip: S["schemas"]["public"]["dns_log_edge"]["ip"];
        time: S["schemas"]["public"]["dns_log_edge"]["time"];
        question_domain: S["schemas"]["public"]["dns_log_edge"]["question_domain"];
        question_class: S["schemas"]["public"]["dns_log_edge"]["question_class"];
        question_type: S["schemas"]["public"]["dns_log_edge"]["question_type"];
        entity_id: S["schemas"]["public"]["dns_log_edge"]["entity_id"];
        domain: S["schemas"]["public"]["dns_log_edge"]["domain"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/domain.ts
// ---------------------------------------------------------------------------

// getDomain
type Q_Domain_GetDomain = `
    select domain, status
    from domain
    where domain = $1
    order by creation_date desc
`;
type _V_Domain_GetDomain = Expect<Equal<ValidateSQL<Q_Domain_GetDomain, S>, true>>;
type _R_Domain_GetDomain = Expect<Equal<
    Simplify<GetReturnType<Q_Domain_GetDomain, S>>,
    {
        domain: S["schemas"]["public"]["domain"]["domain"];
        status: S["schemas"]["public"]["domain"]["status"];
    }
>>;

// getStats
type Q_Domain_GetStats = `
    select *
    from threat_domain
    where domain = $1
`;
type _V_Domain_GetStats = Expect<Equal<ValidateSQL<Q_Domain_GetStats, S>, true>>;
type _R_Domain_GetStats = Expect<Equal<
    Simplify<GetReturnType<Q_Domain_GetStats, S>>,
    Simplify<S["schemas"]["public"]["threat_domain"]>
>>;

// getHuntReport
type Q_Domain_GetHunt = `
    select
    hrl.domain,
    hrl.evidence,
    hrl.threat_id,
    coalesce(t.name, hrl.threat) as threat_name,
    coalesce(t.actor, hrl.threat_actor) as threat_actor,
    coalesce(t.type, hrl.threat_type) as threat_type,
    coalesce(t.description, hrl.threat_description) as threat_description
    from hunt_report_log hrl
    left join threat t on t.id = hrl.threat_id
    where hrl.domain = $1
`;
type _V_Domain_GetHunt = Expect<Equal<ValidateSQL<Q_Domain_GetHunt, S>, true>>;
type _R_Domain_GetHunt = Expect<Equal<
    Simplify<GetReturnType<Q_Domain_GetHunt, S>>,
    {
        domain: S["schemas"]["public"]["hunt_report_log"]["domain"];
        evidence: S["schemas"]["public"]["hunt_report_log"]["evidence"];
        threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
        threat_name: string | null;
        threat_actor: string | null;
        threat_type: string | null;
        threat_description: string | null;
    }
>>;

// getIoc
type Q_Domain_GetIoc = `
    select *
    from threatfox_ioc
    where domain = $1
`;
type _V_Domain_GetIoc = Expect<Equal<ValidateSQL<Q_Domain_GetIoc, S>, true>>;
type _R_Domain_GetIoc = Expect<Equal<
    Simplify<GetReturnType<Q_Domain_GetIoc, S>>,
    Simplify<S["schemas"]["public"]["threatfox_ioc"]>
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/ip_data_log.ts
// ---------------------------------------------------------------------------

// getPayloads
// NOTE: `where id in (...)` list dynamically built; maximal form shown.
type Q_IpDataLog_Payloads = `select * from tarpit_payload where id in ('p1')`;
type _V_IpDataLog_Payloads = Expect<Equal<ValidateSQL<Q_IpDataLog_Payloads, S>, true>>;
type _R_IpDataLog_Payloads = Expect<Equal<
    Simplify<GetReturnType<Q_IpDataLog_Payloads, S>>,
    Simplify<S["schemas"]["public"]["tarpit_payload"]>
>>;

// getHeaders
// NOTE: `where id in (...)` list dynamically built; maximal form shown.
type Q_IpDataLog_Headers = `select * from tarpit_header where id in ('h1')`;
type _V_IpDataLog_Headers = Expect<Equal<ValidateSQL<Q_IpDataLog_Headers, S>, true>>;
type _R_IpDataLog_Headers = Expect<Equal<
    Simplify<GetReturnType<Q_IpDataLog_Headers, S>>,
    Simplify<S["schemas"]["public"]["tarpit_header"]>
>>;

// main(): Select over tarpit_log_edge. Maximal form: includes before, period
// (last-month between), and start/end between WHERE fragments.
// NOTE: dynamic WHERE fragments (before/period/start/end); maximal form shown.
type Q_IpDataLog_Main = `select time, port, payload_id, headers_id, domain from tarpit_log_edge where source_ip = $1 and time < $2 and time between $3 and $4 and date(time) between $5 and $6 order by time desc limit 100`;
type _V_IpDataLog_Main = Expect<Equal<ValidateSQL<Q_IpDataLog_Main, S>, true>>;
type _R_IpDataLog_Main = Expect<Equal<
    Simplify<GetReturnType<Q_IpDataLog_Main, S>>,
    {
        time: S["schemas"]["public"]["tarpit_log_edge"]["time"];
        port: S["schemas"]["public"]["tarpit_log_edge"]["port"];
        payload_id: S["schemas"]["public"]["tarpit_log_edge"]["payload_id"];
        headers_id: S["schemas"]["public"]["tarpit_log_edge"]["headers_id"];
        domain: S["schemas"]["public"]["tarpit_log_edge"]["domain"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/ip.ts
// ---------------------------------------------------------------------------
type Q_Ip_Main = `select * from ip where ip = $1`;
type _V_Ip_Main = Expect<Equal<ValidateSQL<Q_Ip_Main, S>, true>>;
type _R_Ip_Main = Expect<Equal<
    Simplify<GetReturnType<Q_Ip_Main, S>>,
    Simplify<S["schemas"]["public"]["ip"]>
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/domain_related.ts
// ---------------------------------------------------------------------------
type Q_DomainRelated = `
    select
        rrh.domain,
        rrh.threat_id,
        rrh.registrant_email,
        rrh.added_at,
        coalesce(t.name, rrh.threat) as threat_name,
        t.description as threat_description,
        t.actor as threat_actor,
        t.type as threat_type
    from registrar_related_hunt rrh
    left join threat t on t.id = rrh.threat_id
    where rrh.hunted_domain = $1
    order by added_at desc
`;
type _V_DomainRelated = Expect<Equal<ValidateSQL<Q_DomainRelated, S>, true>>;
type _R_DomainRelated = Expect<Equal<
    Simplify<GetReturnType<Q_DomainRelated, S>>,
    {
        domain: S["schemas"]["public"]["registrar_related_hunt"]["domain"];
        threat_id: S["schemas"]["public"]["registrar_related_hunt"]["threat_id"];
        registrant_email: S["schemas"]["public"]["registrar_related_hunt"]["registrant_email"];
        added_at: S["schemas"]["public"]["registrar_related_hunt"]["added_at"];
        threat_name: string | null;
        threat_description: S["schemas"]["public"]["threat"]["description"] | null;
        threat_actor: S["schemas"]["public"]["threat"]["actor"] | null;
        threat_type: S["schemas"]["public"]["threat"]["type"] | null;
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/hunt_report_queue.ts
// ---------------------------------------------------------------------------
// NOTE: trailing `d.source in (...)` WHERE added conditionally; maximal form.
type Q_HuntReportQueue = `select hrq.domain, hrq.registrar_id, hrq.registrar_info, hrq.threat_info, hrq.domain_info, r.name as registrar_name, t.actor as threat_actor, t.id as threat_id, t.name as threat_name, t.type as threat_type, t.description as threat_description from hunt_report_queue hrq join domain d on d.domain = hrq.domain left join registrar r on r.id = hrq.registrar_id left join threat t on t.id = hrq.threat_id where hrq.status is null and d.source in ($1) order by hrq.created_at desc offset 0 limit 50`;
type _V_HuntReportQueue = Expect<Equal<ValidateSQL<Q_HuntReportQueue, S>, true>>;
type _R_HuntReportQueue = Expect<Equal<
    Simplify<GetReturnType<Q_HuntReportQueue, S>>,
    {
        domain: S["schemas"]["public"]["hunt_report_queue"]["domain"];
        registrar_id: S["schemas"]["public"]["hunt_report_queue"]["registrar_id"];
        registrar_info: S["schemas"]["public"]["hunt_report_queue"]["registrar_info"];
        threat_info: S["schemas"]["public"]["hunt_report_queue"]["threat_info"];
        domain_info: S["schemas"]["public"]["hunt_report_queue"]["domain_info"];
        registrar_name: S["schemas"]["public"]["registrar"]["name"] | null;
        threat_actor: S["schemas"]["public"]["threat"]["actor"] | null;
        threat_id: S["schemas"]["public"]["threat"]["id"] | null;
        threat_name: S["schemas"]["public"]["threat"]["name"] | null;
        threat_type: S["schemas"]["public"]["threat"]["type"] | null;
        threat_description: S["schemas"]["public"]["threat"]["description"] | null;
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/watchlist_entity.ts
// ---------------------------------------------------------------------------
type Q_WatchlistEntity = `
    select ip, last_dns_log_match, last_tarpit_log_match
    from watchlist_ip_match
    where watchlist_id = $1 and entity_id = $2
    order by last_match desc
`;
type _V_WatchlistEntity = Expect<Equal<ValidateSQL<Q_WatchlistEntity, S>, true>>;
type _R_WatchlistEntity = Expect<Equal<
    Simplify<GetReturnType<Q_WatchlistEntity, S>>,
    {
        ip: S["schemas"]["public"]["watchlist_ip_match"]["ip"];
        last_dns_log_match: S["schemas"]["public"]["watchlist_ip_match"]["last_dns_log_match"];
        last_tarpit_log_match: S["schemas"]["public"]["watchlist_ip_match"]["last_tarpit_log_match"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/ip_dns_log.ts
// ---------------------------------------------------------------------------
// NOTE: dynamic WHERE fragments (before/period/start/end); maximal form shown.
type Q_IpDnsLog_Main = `select time, question_domain, question_class, question_type from dns_log_edge where ip = $1 and time < $2 and time between $3 and $4 and date(time) between $5 and $6 order by time desc limit 100`;
type _V_IpDnsLog_Main = Expect<Equal<ValidateSQL<Q_IpDnsLog_Main, S>, true>>;
type _R_IpDnsLog_Main = Expect<Equal<
    Simplify<GetReturnType<Q_IpDnsLog_Main, S>>,
    {
        time: S["schemas"]["public"]["dns_log_edge"]["time"];
        question_domain: S["schemas"]["public"]["dns_log_edge"]["question_domain"];
        question_class: S["schemas"]["public"]["dns_log_edge"]["question_class"];
        question_type: S["schemas"]["public"]["dns_log_edge"]["question_type"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/watchlist_notification.ts
// ---------------------------------------------------------------------------

// getWatchlistNotifications: Select over watchlist_notification.
// NOTE: dynamic WHERE fragments (company_id/watchlist_id) included; maximal form.
type Q_WlNotif_List = `select wn.*, w.name as watchlist_name, c.name as company_name from watchlist_notification wn join watchlist w on w.id = wn.watchlist_id left join company c on c.id = w.company_id where wn.user_id = $1 and wn.company_id = $2 and wn.watchlist_id = $3 and wn.active = true and wn.disabled = false order by wn.created_at desc limit 500`;
type _V_WlNotif_List = Expect<Equal<ValidateSQL<Q_WlNotif_List, S>, true>>;
type _R_WlNotif_List = Expect<Equal<
    Simplify<GetReturnType<Q_WlNotif_List, S>>,
    Simplify<
        & S["schemas"]["public"]["watchlist_notification"]
        & {
            watchlist_name: S["schemas"]["public"]["watchlist"]["name"];
            // c left-joined -> company.name becomes nullable
            company_name: S["schemas"]["public"]["company"]["name"] | null;
        }
    >
>>;

// fetchIps
type Q_WlNotif_Ips = `select wip.id, wip.ip, ip.dns_log_counter as total_dns_requests, ip.tarpit_log_counter as total_data_requests, ip.country, ip.created_at as first_seen_at, ip.last_dns_log_match as last_dns_request_at, ip.last_tarpit_log_match as last_data_request_at, e.name as entity_name from watchlist_ip wip left join ip on ip.ip = wip.ip_reference left join entity e on e.id = ip.entity_id where wip.id in ($1)`;
type _V_WlNotif_Ips = Expect<Equal<ValidateSQL<Q_WlNotif_Ips, S>, true>>;
type _R_WlNotif_Ips = Expect<Equal<
    Simplify<GetReturnType<Q_WlNotif_Ips, S>>,
    {
        id: S["schemas"]["public"]["watchlist_ip"]["id"];
        ip: S["schemas"]["public"]["watchlist_ip"]["ip"];
        // ip table left-joined -> nullable
        total_dns_requests: S["schemas"]["public"]["ip"]["dns_log_counter"] | null;
        total_data_requests: S["schemas"]["public"]["ip"]["tarpit_log_counter"] | null;
        country: S["schemas"]["public"]["ip"]["country"] | null;
        first_seen_at: S["schemas"]["public"]["ip"]["created_at"] | null;
        last_dns_request_at: S["schemas"]["public"]["ip"]["last_dns_log_match"] | null;
        last_data_request_at: S["schemas"]["public"]["ip"]["last_tarpit_log_match"] | null;
        entity_name: S["schemas"]["public"]["entity"]["name"] | null;
    }
>>;

// fetchCidrs
type Q_WlNotif_Cidrs = `select wcidr.id, wcidr.cidr from watchlist_cidr wcidr where wcidr.id in ($1)`;
type _V_WlNotif_Cidrs = Expect<Equal<ValidateSQL<Q_WlNotif_Cidrs, S>, true>>;
type _R_WlNotif_Cidrs = Expect<Equal<
    Simplify<GetReturnType<Q_WlNotif_Cidrs, S>>,
    {
        id: S["schemas"]["public"]["watchlist_cidr"]["id"];
        cidr: S["schemas"]["public"]["watchlist_cidr"]["cidr"];
    }
>>;

// fetchDomains
type Q_WlNotif_Domains = `select wdomain.id, wdomain.domain, wdomain.ip, ip.dns_log_counter as total_dns_requests, ip.tarpit_log_counter as total_data_requests, ip.country, ip.created_at as first_seen_at, ip.last_dns_log_match as last_dns_request_at, ip.last_tarpit_log_match as last_data_request_at, e.name as entity_name from watchlist_domain wdomain left join ip on ip.ip = wdomain.ip_reference left join entity e on e.id = ip.entity_id where wdomain.id in ($1)`;
type _V_WlNotif_Domains = Expect<Equal<ValidateSQL<Q_WlNotif_Domains, S>, true>>;
type _R_WlNotif_Domains = Expect<Equal<
    Simplify<GetReturnType<Q_WlNotif_Domains, S>>,
    {
        id: S["schemas"]["public"]["watchlist_domain"]["id"];
        domain: S["schemas"]["public"]["watchlist_domain"]["domain"];
        ip: S["schemas"]["public"]["watchlist_domain"]["ip"];
        total_dns_requests: S["schemas"]["public"]["ip"]["dns_log_counter"] | null;
        total_data_requests: S["schemas"]["public"]["ip"]["tarpit_log_counter"] | null;
        country: S["schemas"]["public"]["ip"]["country"] | null;
        first_seen_at: S["schemas"]["public"]["ip"]["created_at"] | null;
        last_dns_request_at: S["schemas"]["public"]["ip"]["last_dns_log_match"] | null;
        last_data_request_at: S["schemas"]["public"]["ip"]["last_tarpit_log_match"] | null;
        entity_name: S["schemas"]["public"]["entity"]["name"] | null;
    }
>>;

// fetchQueries: builder selects `from watchlist_query wquery`.
// FIXTURE-GAP: watchlist_query (fixture has watchlist_tarpit_query, not watchlist_query)
type Q_WlNotif_Queries = `select wquery.id, wquery.query, wquery.content, wquery.ip_reference as ip, ip.dns_log_counter as total_dns_requests, ip.tarpit_log_counter as total_data_requests, ip.country, ip.created_at as first_seen_at, ip.last_dns_log_match as last_dns_request_at, ip.last_tarpit_log_match as last_data_request_at, e.name as entity_name from watchlist_query wquery left join ip on ip.ip = wquery.ip_reference left join entity e on e.id = ip.entity_id where wquery.id in ($1)`;
type _V_WlNotif_Queries = Expect<Equal<ValidateSQL<Q_WlNotif_Queries, S>, true>>;

// fetchEntities
type Q_WlNotif_Entities = `select wcompany.id, e.name as entity_name, e.id as entity_id from watchlist_company wcompany join entity e on e.id = wcompany.entity_id where wcompany.id in ($1)`;
type _V_WlNotif_Entities = Expect<Equal<ValidateSQL<Q_WlNotif_Entities, S>, true>>;
type _R_WlNotif_Entities = Expect<Equal<
    Simplify<GetReturnType<Q_WlNotif_Entities, S>>,
    {
        id: S["schemas"]["public"]["watchlist_company"]["id"];
        entity_name: S["schemas"]["public"]["entity"]["name"];
        entity_id: S["schemas"]["public"]["entity"]["id"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/data_log.ts
// ---------------------------------------------------------------------------

// fetchEntities (same as dns_log.ts)
// NOTE: `where id in (...)` list dynamically built; maximal form shown.
type Q_DataLog_Entities = `select id, name from entity where id in ('e1')`;
type _V_DataLog_Entities = Expect<Equal<ValidateSQL<Q_DataLog_Entities, S>, true>>;
type _R_DataLog_Entities = Expect<Equal<
    Simplify<GetReturnType<Q_DataLog_Entities, S>>,
    { id: S["schemas"]["public"]["entity"]["id"]; name: S["schemas"]["public"]["entity"]["name"] }
>>;

// fetchThreats (same shape as dns_log.ts)
// NOTE: `where hrl.domain in (...)` list dynamically built; maximal form shown.
type Q_DataLog_Threats = `
    select
        hrl.domain,
        hrl.threat_id,
        coalesce(t.name, hrl.threat) as name,
        t.type,
        coalesce(t.actor, hrl.threat_actor) as actor
        from hunt_report_log hrl
        left join threat t on t.id = hrl.threat_id
        where hrl.domain in ('a.example')
`;
type _V_DataLog_Threats = Expect<Equal<ValidateSQL<Q_DataLog_Threats, S>, true>>;
type _R_DataLog_Threats = Expect<Equal<
    Simplify<GetReturnType<Q_DataLog_Threats, S>>,
    {
        domain: S["schemas"]["public"]["hunt_report_log"]["domain"];
        threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
        name: string | null;
        type: S["schemas"]["public"]["threat"]["type"] | null;
        actor: string | null;
    }
>>;

// getPayloads
// NOTE: `where id in (...)` list dynamically built; maximal form shown.
type Q_DataLog_Payloads = `select * from tarpit_payload where id in ('p1')`;
type _V_DataLog_Payloads = Expect<Equal<ValidateSQL<Q_DataLog_Payloads, S>, true>>;
type _R_DataLog_Payloads = Expect<Equal<
    Simplify<GetReturnType<Q_DataLog_Payloads, S>>,
    Simplify<S["schemas"]["public"]["tarpit_payload"]>
>>;

// getHeaders
// NOTE: `where id in (...)` list dynamically built; maximal form shown.
type Q_DataLog_Headers = `select * from tarpit_header where id in ('h1')`;
type _V_DataLog_Headers = Expect<Equal<ValidateSQL<Q_DataLog_Headers, S>, true>>;
type _R_DataLog_Headers = Expect<Equal<
    Simplify<GetReturnType<Q_DataLog_Headers, S>>,
    Simplify<S["schemas"]["public"]["tarpit_header"]>
>>;

// main(): Select over tarpit_log_edge.
type Q_DataLog_Main = `select id, source_ip as ip, time, port, payload_id, headers_id, domain, entity_id from tarpit_log_edge where customer_company_id = $1 and time > $2 order by time desc`;
type _V_DataLog_Main = Expect<Equal<ValidateSQL<Q_DataLog_Main, S>, true>>;
type _R_DataLog_Main = Expect<Equal<
    Simplify<GetReturnType<Q_DataLog_Main, S>>,
    {
        id: S["schemas"]["public"]["tarpit_log_edge"]["id"];
        ip: S["schemas"]["public"]["tarpit_log_edge"]["source_ip"];
        time: S["schemas"]["public"]["tarpit_log_edge"]["time"];
        port: S["schemas"]["public"]["tarpit_log_edge"]["port"];
        payload_id: S["schemas"]["public"]["tarpit_log_edge"]["payload_id"];
        headers_id: S["schemas"]["public"]["tarpit_log_edge"]["headers_id"];
        domain: S["schemas"]["public"]["tarpit_log_edge"]["domain"];
        entity_id: S["schemas"]["public"]["tarpit_log_edge"]["entity_id"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/domain_same_registrant.ts
// ---------------------------------------------------------------------------
type Q_DomainSameReg = `
    select
        rl1.registrant_email,
        rl2.domain as "domain"
    from domain rl1
    join domain rl2 on
        rl1.registrant_email = rl2.registrant_email and
        rl2.domain != rl1.domain
    where rl1.domain = $1
    order by rl2.domain asc
`;
type _V_DomainSameReg = Expect<Equal<ValidateSQL<Q_DomainSameReg, S>, true>>;
type _R_DomainSameReg = Expect<Equal<
    Simplify<GetReturnType<Q_DomainSameReg, S>>,
    {
        registrant_email: S["schemas"]["public"]["domain"]["registrant_email"];
        domain: S["schemas"]["public"]["domain"]["domain"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/hunt_report.ts
// ---------------------------------------------------------------------------
type Q_HuntReport = `select hrl.domain, hrl.domain_type, hrl.registrar_id, hrl.registrar, hrl.registrant_email, hrl.registrant_name, hrl.evidence, hrl.threat, hrl.threat_actor, hrl.threat_type, hrl.threat_description, hrl.creation_date, hrl.expiration_date, r.name as registrar_name, t.name as t_threat_name, t.type as t_threat_type, t.description as t_threat_description from hunt_report_log hrl left join registrar r on r.id = hrl.registrar_id left join threat t on t.id = hrl.threat_id order by hrl.domain asc offset 0 limit 50`;
type _V_HuntReport = Expect<Equal<ValidateSQL<Q_HuntReport, S>, true>>;
type _R_HuntReport = Expect<Equal<
    Simplify<GetReturnType<Q_HuntReport, S>>,
    {
        domain: S["schemas"]["public"]["hunt_report_log"]["domain"];
        domain_type: S["schemas"]["public"]["hunt_report_log"]["domain_type"];
        registrar_id: S["schemas"]["public"]["hunt_report_log"]["registrar_id"];
        registrar: S["schemas"]["public"]["hunt_report_log"]["registrar"];
        registrant_email: S["schemas"]["public"]["hunt_report_log"]["registrant_email"];
        registrant_name: S["schemas"]["public"]["hunt_report_log"]["registrant_name"];
        evidence: S["schemas"]["public"]["hunt_report_log"]["evidence"];
        threat: S["schemas"]["public"]["hunt_report_log"]["threat"];
        threat_actor: S["schemas"]["public"]["hunt_report_log"]["threat_actor"];
        threat_type: S["schemas"]["public"]["hunt_report_log"]["threat_type"];
        threat_description: S["schemas"]["public"]["hunt_report_log"]["threat_description"];
        creation_date: S["schemas"]["public"]["hunt_report_log"]["creation_date"];
        expiration_date: S["schemas"]["public"]["hunt_report_log"]["expiration_date"];
        registrar_name: S["schemas"]["public"]["registrar"]["name"] | null;
        t_threat_name: S["schemas"]["public"]["threat"]["name"] | null;
        t_threat_type: S["schemas"]["public"]["threat"]["type"] | null;
        t_threat_description: S["schemas"]["public"]["threat"]["description"] | null;
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/domain_info.ts
// ---------------------------------------------------------------------------
type Q_DomainInfo = `
    select d.*,
        dr.registrant, dc.customer, dres.reseller
    from domain d
    left join domain_registrant dr on dr.domain = d.domain
    left join domain_customer dc on dc.domain = d.domain
    left join domain_reseller dres on dres.domain = d.domain
    where d.domain = $1
    order by d.creation_date desc
`;
type _V_DomainInfo = Expect<Equal<ValidateSQL<Q_DomainInfo, S>, true>>;
type _R_DomainInfo = Expect<Equal<
    Simplify<GetReturnType<Q_DomainInfo, S>>,
    Simplify<
        & S["schemas"]["public"]["domain"]
        & {
            registrant: S["schemas"]["public"]["domain_registrant"]["registrant"] | null;
            customer: S["schemas"]["public"]["domain_customer"]["customer"] | null;
            reseller: S["schemas"]["public"]["domain_reseller"]["reseller"] | null;
        }
    >
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/ip_threats.ts
// ---------------------------------------------------------------------------
type Q_IpThreats = `
    select
        itd.*,
        hrl.threat_id,
        coalesce(t.name, hrl.threat) as name,
        t.description,
        t.type,
        coalesce(t.actor, hrl.threat_actor) as actor
        from ip_threat_domain itd
        join hunt_report_log hrl on hrl.domain = itd.domain
        left join threat t on t.id = hrl.threat_id
        where itd.ip = $1
`;
type _V_IpThreats = Expect<Equal<ValidateSQL<Q_IpThreats, S>, true>>;
type _R_IpThreats = Expect<Equal<
    Simplify<GetReturnType<Q_IpThreats, S>>,
    Simplify<
        & S["schemas"]["public"]["ip_threat_domain"]
        & {
            threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
            name: string | null;
            description: S["schemas"]["public"]["threat"]["description"] | null;
            type: S["schemas"]["public"]["threat"]["type"] | null;
            actor: string | null;
        }
    >
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/hunt_preview.ts
// ---------------------------------------------------------------------------
// NOTE: trailing `d.source in (...)` WHERE added conditionally; maximal form.
type Q_HuntPreview = `select d.domain, d.registrar, d.country, d.registrant_email, d.registration_ip, d.creation_date, d.expiration_date, r.name as registrar_name, ti.first_seen_at, ti.malware, ti.malware_printable, ti.threat_type, t.name as t_name, t.actor as t_actor, t.description as t_description, t.type as t_type from domain d join registrar_hunt rh on rh.domain = d.domain join threatfox_ioc ti on ti.domain = d.domain join threat t on t.id = ti.malware join registrar r on r.id = d.registrar_id where d.source in ($1) order by ti.first_seen_at desc offset 0 limit 50`;
type _V_HuntPreview = Expect<Equal<ValidateSQL<Q_HuntPreview, S>, true>>;
type _R_HuntPreview = Expect<Equal<
    Simplify<GetReturnType<Q_HuntPreview, S>>,
    {
        domain: S["schemas"]["public"]["domain"]["domain"];
        registrar: S["schemas"]["public"]["domain"]["registrar"];
        country: S["schemas"]["public"]["domain"]["country"];
        registrant_email: S["schemas"]["public"]["domain"]["registrant_email"];
        registration_ip: S["schemas"]["public"]["domain"]["registration_ip"];
        creation_date: S["schemas"]["public"]["domain"]["creation_date"];
        expiration_date: S["schemas"]["public"]["domain"]["expiration_date"];
        registrar_name: S["schemas"]["public"]["registrar"]["name"];
        first_seen_at: S["schemas"]["public"]["threatfox_ioc"]["first_seen_at"];
        malware: S["schemas"]["public"]["threatfox_ioc"]["malware"];
        malware_printable: S["schemas"]["public"]["threatfox_ioc"]["malware_printable"];
        threat_type: S["schemas"]["public"]["threatfox_ioc"]["threat_type"];
        t_name: S["schemas"]["public"]["threat"]["name"];
        t_actor: S["schemas"]["public"]["threat"]["actor"];
        t_description: S["schemas"]["public"]["threat"]["description"];
        t_type: S["schemas"]["public"]["threat"]["type"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/ip_date.ts
// ---------------------------------------------------------------------------
// NOTE: dynamic WHERE fragments (period/start/end); maximal form (last-month between).
type Q_IpDate = `select * from ip_date where ip = $1 and date between $2 and $3 and date(date) between $4 and $5 order by date desc`;
type _V_IpDate = Expect<Equal<ValidateSQL<Q_IpDate, S>, true>>;
type _R_IpDate = Expect<Equal<
    Simplify<GetReturnType<Q_IpDate, S>>,
    Simplify<S["schemas"]["public"]["ip_date"]>
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/lib/apiKey.ts
// ---------------------------------------------------------------------------
type Q_ApiKey = `
    select k.*, aks.settings
    from api_key k
    left join api_key_settings aks on aks.api_key_id = k.id
    where k.aws_api_key_id = $1
`;
type _V_ApiKey = Expect<Equal<ValidateSQL<Q_ApiKey, S>, true>>;
type _R_ApiKey = Expect<Equal<
    Simplify<GetReturnType<Q_ApiKey, S>>,
    Simplify<
        & S["schemas"]["public"]["api_key"]
        & { settings: S["schemas"]["public"]["api_key_settings"]["settings"] | null }
    >
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/watchlist_cidr.ts
// ---------------------------------------------------------------------------
type Q_WatchlistCidr = `
    select ip, last_dns_log_match, last_tarpit_log_match
    from watchlist_ip_match
    where watchlist_id = $1 and cidr = $2
    order by last_match desc
`;
type _V_WatchlistCidr = Expect<Equal<ValidateSQL<Q_WatchlistCidr, S>, true>>;
type _R_WatchlistCidr = Expect<Equal<
    Simplify<GetReturnType<Q_WatchlistCidr, S>>,
    {
        ip: S["schemas"]["public"]["watchlist_ip_match"]["ip"];
        last_dns_log_match: S["schemas"]["public"]["watchlist_ip_match"]["last_dns_log_match"];
        last_tarpit_log_match: S["schemas"]["public"]["watchlist_ip_match"]["last_tarpit_log_match"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/lib/watchlist.ts
// ---------------------------------------------------------------------------
// NOTE: trailing `company_id = $2` / `user_id = $2` appended conditionally;
// maximal form uses company_id.
type Q_Watchlist = `select id, name from watchlist where id = $1 and company_id = $2`;
type _V_Watchlist = Expect<Equal<ValidateSQL<Q_Watchlist, S>, true>>;
type _R_Watchlist = Expect<Equal<
    Simplify<GetReturnType<Q_Watchlist, S>>,
    {
        id: S["schemas"]["public"]["watchlist"]["id"];
        name: S["schemas"]["public"]["watchlist"]["name"];
    }
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/watchlist_notification_clear.ts
// ---------------------------------------------------------------------------
// UPDATE; no RETURNING. WHERE fragments appended conditionally; maximal form.
type Q_WlNotifClear = `
    update watchlist_notification
    set active = false
    where user_id = $1 and company_id = $2 and id = $3
`;
type _V_WlNotifClear = Expect<Equal<ValidateSQL<Q_WlNotifClear, S>, true>>;

// A `Json` reference so the import is always used regardless of inference.
type _JsonUsed = Json | undefined;

export type ProtectedApiTestsPass = true;
