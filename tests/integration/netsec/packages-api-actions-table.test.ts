/**
 * Netsec packages/api query coverage (server actions + table builders).
 *
 * Queries copied from the netsec app `packages/api`. Collection pass: faithful
 * coverage; red/unknown results are expected findings, not bugs.
 *
 * RAW `/*sql* /` queries are copied verbatim with `$N` params (casts kept, e.g.
 * `$1::inet`). Builder (`new Select()` / `Table`) sites are reconstructed into
 * the SQL string the builder emits, in assembly order:
 *   select [<flags> ]<cols> from <from> <joins> where <AND-joined> ...
 *   group by ... having ... order by ... [offset N ][limit N]
 * `.addValue(v)` -> $N (1-based call order); `.addValue(v,'cast')` -> $N::cast.
 * `.limit(N, offset)` emits `offset <offset> limit <N>`.
 * The Table base class does `from <tableName> self`, so `self.*` is the edge
 * table. Conditional joins / where fragments are included in maximal form.
 *
 * DDL / admin / stored-fn queries are asserted with `ValidateSQL` only.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ===========================================================================
// packages/api/src/actions/server/company.ts
// ===========================================================================

// checkAddrExists: select with inet `&&` overlap operator.
type Q_Company_CheckAddr = `
        select addr
        from company_addr
        where addr && $1::inet
    `;
type _V_Company_CheckAddr = Expect<Equal<ValidateSQL<Q_Company_CheckAddr, S>, true>>;
type _R_Company_CheckAddr = Expect<Equal<
    Simplify<GetReturnType<Q_Company_CheckAddr, S>>,
    // company_addr.addr is inet -> unknown
    { addr: S["schemas"]["public"]["company_addr"]["addr"] }
>>;

// addAddr: INSERT, no RETURNING.
type Q_Company_AddAddr = `
                insert into company_addr
                (addr, company_id)
                values ($1, $2)
            `;
type _V_Company_AddAddr = Expect<Equal<ValidateSQL<Q_Company_AddAddr, S>, true>>;

// deleteCompany: DELETE, no RETURNING.
type Q_Company_Delete = `
        delete from company where id = $1
    `;
type _V_Company_Delete = Expect<Equal<ValidateSQL<Q_Company_Delete, S>, true>>;

// ===========================================================================
// packages/api/src/actions/server/importIpHistory.ts
// ===========================================================================

// assignDnsLog: UPDATE, no RETURNING.
type Q_ImportIp_AssignDns = `
        update dns_log_edge
        set customer_company_id = $1
        where ip = $2::inet and customer_company_id is null
    `;
type _V_ImportIp_AssignDns = Expect<Equal<ValidateSQL<Q_ImportIp_AssignDns, S>, true>>;

// assignForwardedDataLog: UPDATE, no RETURNING.
type Q_ImportIp_AssignFwd = `
        update tarpit_log_edge
        set customer_company_id = $1
        where forwarded_for = $2::inet and customer_company_id is null
    `;
type _V_ImportIp_AssignFwd = Expect<Equal<ValidateSQL<Q_ImportIp_AssignFwd, S>, true>>;

// copyIpDateData: INSERT ... SELECT ... ON CONFLICT DO UPDATE.
// FIXTURE-GAP: company_report_date (table absent from fixture)
type Q_ImportIp_CopyIpDate = `
        insert into company_report_date
        (company_id, date, dns_log_counter, tarpit_log_counter, ip_count)
        select
            $1 as company_id,
            date,
            dns_log_counter,
            tarpit_log_counter,
            1 as ip_count
        from ip_date
        where ip_date.ip = $2::inet
        on conflict (company_id, date) do update
        set dns_log_counter = company_report_date.dns_log_counter + ip_date.dns_log_counter,
            tarpit_log_counter = company_report_date.tarpit_log_counter + ip_date.tarpit_log_counter,
            ip_count = company_report_date.ip_count + 1
    `;
type _V_ImportIp_CopyIpDate = Expect<Equal<ValidateSQL<Q_ImportIp_CopyIpDate, S>, true>>;

// copyIpDateThreatDomainData: INSERT ... SELECT ... ON CONFLICT DO UPDATE.
type Q_ImportIp_CopyIpDateTd = `
        insert into company_report_threat_domain_date
        (company_id, date, domain, dns_log_counter, tarpit_log_counter)
        select
            $1 as company_id,
            date,
            domain,
            dns_log_counter,
            tarpit_log_counter
        from ip_date_threat_domain
        where ip_date_threat_domain.ip = $2::inet
        on conflict (company_id, date, domain) do update
        set dns_log_counter = company_report_threat_domain_date.dns_log_counter + ip_date_threat_domain.dns_log_counter,
            tarpit_log_counter = company_report_threat_domain_date.tarpit_log_counter + ip_date_threat_domain.tarpit_log_counter
    `;
type _V_ImportIp_CopyIpDateTd = Expect<Equal<ValidateSQL<Q_ImportIp_CopyIpDateTd, S>, true>>;

// copyIpThreatDomainData: INSERT ... SELECT ... ON CONFLICT DO UPDATE (greatest()).
type Q_ImportIp_CopyIpTd = `
        insert into company_report_threat_domain
        (company_id, domain,
        dns_log_counter, tarpit_log_counter,
        last_dns_log_match, last_tarpit_log_match)
        select
            $1 as company_id,
            domain,
            dns_log_counter,
            tarpit_log_counter,
            last_dns_log_match,
            last_tarpit_log_match
        from ip_threat_domain
        where ip_threat_domain.ip = $2::inet
        on conflict (company_id, domain) do update
        set dns_log_counter = company_report_threat_domain.dns_log_counter + ip_threat_domain.dns_log_counter,
            tarpit_log_counter = company_report_threat_domain.tarpit_log_counter + ip_threat_domain.tarpit_log_counter,
            last_dns_log_match = greatest(company_report_threat_domain.last_dns_log_match, ip_threat_domain.last_dns_log_match),
            last_tarpit_log_match = greatest(company_report_threat_domain.last_tarpit_log_match, ip_threat_domain.last_tarpit_log_match)
    `;
type _V_ImportIp_CopyIpTd = Expect<Equal<ValidateSQL<Q_ImportIp_CopyIpTd, S>, true>>;

// checkIp: select count(*) over ip.
type Q_ImportIp_CheckIp = `
        select count(*) from ip where ip = $1::inet and customer_company_id = $2
    `;
type _V_ImportIp_CheckIp = Expect<Equal<ValidateSQL<Q_ImportIp_CheckIp, S>, true>>;
type _R_ImportIp_CheckIp = Expect<Equal<
    Simplify<GetReturnType<Q_ImportIp_CheckIp, S>>,
    // unaliased count(*) -> { count: number }
    { count: number }
>>;

// ===========================================================================
// packages/api/src/actions/server/watchlist.ts
// ===========================================================================

// getWatchlist
type Q_Wl_GetWatchlist = `select id, user_id, company_id from watchlist where id = $1`;
type _V_Wl_GetWatchlist = Expect<Equal<ValidateSQL<Q_Wl_GetWatchlist, S>, true>>;
type _R_Wl_GetWatchlist = Expect<Equal<
    Simplify<GetReturnType<Q_Wl_GetWatchlist, S>>,
    {
        id: S["schemas"]["public"]["watchlist"]["id"];
        user_id: S["schemas"]["public"]["watchlist"]["user_id"];
        company_id: S["schemas"]["public"]["watchlist"]["company_id"];
    }
>>;

// getIpReference: dynamic IN-list; maximal form with one param.
// NOTE: `where ip in (...)` list dynamically built ($1,$2,...); maximal form shown.
type Q_Wl_GetIpRef = `select ip from ip where ip in ($1)`;
type _V_Wl_GetIpRef = Expect<Equal<ValidateSQL<Q_Wl_GetIpRef, S>, true>>;
type _R_Wl_GetIpRef = Expect<Equal<
    Simplify<GetReturnType<Q_Wl_GetIpRef, S>>,
    // ip.ip is inet -> unknown
    { ip: S["schemas"]["public"]["ip"]["ip"] }
>>;

// addIpToWatchlist: INSERT ... VALUES (multi-row, inline literals) ON CONFLICT DO NOTHING.
// NOTE: rows built dynamically with inlined literals + optional $1 description;
// maximal single-row form with literals shown.
type Q_Wl_AddIp = `
            insert into watchlist_ip
                (watchlist_id, ip, user_id, last_checked_at, ip_reference, description)
            values
            ('w1', 'i1', null, null, 'i1', $1)
            on conflict (watchlist_id, ip) do nothing;
        `;
type _V_Wl_AddIp = Expect<Equal<ValidateSQL<Q_Wl_AddIp, S>, true>>;

// addCidrToWatchlist: INSERT ... VALUES ON CONFLICT DO NOTHING RETURNING cidr.
// NOTE: rows built dynamically with inlined literals + optional $1 description;
// maximal single-row form with literals shown.
type Q_Wl_AddCidr = `
            insert into watchlist_cidr
            (watchlist_id, cidr, user_id, last_checked_at, description)
            values
            ('w1', 'c1', null, null, $1)
            on conflict (watchlist_id, cidr) do nothing
            returning cidr;
        `;
type _V_Wl_AddCidr = Expect<Equal<ValidateSQL<Q_Wl_AddCidr, S>, true>>;
type _R_Wl_AddCidr = Expect<Equal<
    Simplify<GetReturnType<Q_Wl_AddCidr, S>>,
    // watchlist_cidr.cidr is cidr -> unknown
    { cidr: S["schemas"]["public"]["watchlist_cidr"]["cidr"] }
>>;

// addDomainToWatchlist: existence select with dynamic IN-list.
// NOTE: `domain in (...)` list dynamically built ($2,$3,...); maximal form shown.
type Q_Wl_AddDomain_Exists = `
        select domain
        from watchlist_domain
        where watchlist_id = $1
        and domain in ($2)
    `;
type _V_Wl_AddDomain_Exists = Expect<Equal<ValidateSQL<Q_Wl_AddDomain_Exists, S>, true>>;
type _R_Wl_AddDomain_Exists = Expect<Equal<
    Simplify<GetReturnType<Q_Wl_AddDomain_Exists, S>>,
    { domain: S["schemas"]["public"]["watchlist_domain"]["domain"] }
>>;

// addDomainToWatchlist: INSERT ... VALUES (inline literals) ON CONFLICT DO NOTHING.
// NOTE: rows built dynamically with inlined literals; maximal single-row form shown.
type Q_Wl_AddDomain_Insert = `
        insert into watchlist_domain (watchlist_id, domain, user_id, last_checked_at)
        values
        ('w1', 'd1', null, null)
        on conflict (watchlist_id, domain, ip) do nothing;
    `;
type _V_Wl_AddDomain_Insert = Expect<Equal<ValidateSQL<Q_Wl_AddDomain_Insert, S>, true>>;

// addCredentialsDomainToWatchlist: INSERT ... VALUES ON CONFLICT DO NOTHING.
// NOTE: rows built dynamically with inlined literals; maximal single-row form shown.
type Q_Wl_AddCredDomain = `
            insert into watchlist_credentials_domain (watchlist_id, domain, user_id, last_checked_at)
            values
            ('w1', 'd1', null, null)
            on conflict (watchlist_id, domain) do nothing;
        `;
type _V_Wl_AddCredDomain = Expect<Equal<ValidateSQL<Q_Wl_AddCredDomain, S>, true>>;

// addEntityToWatchlist: INSERT into watchlist_company ON CONFLICT DO NOTHING.
// NOTE: rows built dynamically with inlined literals; maximal single-row form shown.
type Q_Wl_AddEntity = `
            insert into watchlist_company (watchlist_id, entity_id, user_id, last_checked_at)
            values
            ('w1', 'e1', null, null)
            on conflict (watchlist_id, entity_id) do nothing;
        `;
type _V_Wl_AddEntity = Expect<Equal<ValidateSQL<Q_Wl_AddEntity, S>, true>>;

// NOTE: addUsernameToWatchlist / addQueryToWatchlist emit no SQL (disabled stubs).

// ===========================================================================
// packages/api/src/table/DnsLog.ts  (Select builder over `dns_log_edge self`)
// ===========================================================================

// setOptions: maximal form. Cols are the default projection. All conditional
// joins/where fragments included; period uses lastHour (periodField self.time).
// Joins (in select.join() call order): inner ip, entity (company), threat
// (hunt_report_log + threat), blacklist (ip + cidr).
// NOTE: dynamic builder; maximal form. distinct branch is mutually-exclusive
// with the default projection/order, shown separately below.
// NOTE: filters use IN-lists for country/entity_id/customer_company_id/domain/
// threat_id ($N); maximal single-value form shown.
type Q_DnsLog_Main = `select self.id, self.time, self.ip, self.proxy, self.edns, self.question_domain, self.question_class, self.question_type, self.answer, self.domain, self.country, self.entity_id, coalesce(thr.name, hrl.threat) as threat, hrl.threat_id, coalesce(hrl.threat_description, thr.description) as threat_description, ipc.name as company_name, ipc.domain as company_domain from dns_log_edge self join ip on ip.ip = self.ip left join entity ipc on ipc.id = self.entity_id join hunt_report_log hrl on hrl.domain = self.domain left join threat thr on thr.id = hrl.threat_id left join blacklist_ip bi on bi.ip = self.ip left join blacklist_cidr bc on bc.cidr >> self.ip where self.country in ($1) and self.entity_id in ($2) and self.customer_company_id in ($3) and self.domain in ($4) and self.ip in ($5::inet) and self.time between $6 and $7 and self.time >= '2026-01-01' and hrl.threat_id in ($8) and (bi.ip is not null or bc.cidr is not null) order by self.time desc offset 0 limit 20`;
type _V_DnsLog_Main = Expect<Equal<ValidateSQL<Q_DnsLog_Main, S>, true>>;
type _R_DnsLog_Main = Expect<Equal<
    Simplify<GetReturnType<Q_DnsLog_Main, S>>,
    {
        id: S["schemas"]["public"]["dns_log_edge"]["id"];
        time: S["schemas"]["public"]["dns_log_edge"]["time"];
        ip: S["schemas"]["public"]["dns_log_edge"]["ip"];
        proxy: S["schemas"]["public"]["dns_log_edge"]["proxy"];
        edns: S["schemas"]["public"]["dns_log_edge"]["edns"];
        question_domain: S["schemas"]["public"]["dns_log_edge"]["question_domain"];
        question_class: S["schemas"]["public"]["dns_log_edge"]["question_class"];
        question_type: S["schemas"]["public"]["dns_log_edge"]["question_type"];
        answer: S["schemas"]["public"]["dns_log_edge"]["answer"];
        domain: S["schemas"]["public"]["dns_log_edge"]["domain"];
        country: S["schemas"]["public"]["dns_log_edge"]["country"];
        entity_id: S["schemas"]["public"]["dns_log_edge"]["entity_id"];
        // coalesce(thr.name [left join, nullable], hrl.threat [inner, nullable]) -> nullable
        threat: string | null;
        // hrl is inner-joined here -> not nullable
        threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
        threat_description: string | null;
        // ipc (entity) left-joined -> nullable
        company_name: S["schemas"]["public"]["entity"]["name"] | null;
        company_domain: S["schemas"]["public"]["entity"]["domain"] | null;
    }
>>;

// DnsLog distinct branch: select.select("distinct on(self.ip) self.ip","distinct")
// added before the default column list; emits `distinct on(...)` prefix.
// NOTE: dynamic; distinct mode. No order/limit applied when distinct set.
type Q_DnsLog_Distinct = `select distinct on(self.ip) self.ip, self.id, self.time, self.ip, self.proxy, self.edns, self.question_domain, self.question_class, self.question_type, self.answer, self.domain, self.country, self.entity_id from dns_log_edge self`;
type _V_DnsLog_Distinct = Expect<Equal<ValidateSQL<Q_DnsLog_Distinct, S>, true>>;

// DnsLog threat-query branch (queryBy "threat"): inner threat join + `%` similarity.
// NOTE: dynamic; queryBy=threat variant.
type Q_DnsLog_ThreatQuery = `select self.id, self.time, self.ip, self.proxy, self.edns, self.question_domain, self.question_class, self.question_type, self.answer, self.domain, self.country, self.entity_id from dns_log_edge self join hunt_report_log hrl on hrl.domain = self.domain left join threat thr on thr.id = hrl.threat_id where (hrl.threat % $1 or thr.name % $2) order by self.time desc offset 0 limit 20`;
type _V_DnsLog_ThreatQuery = Expect<Equal<ValidateSQL<Q_DnsLog_ThreatQuery, S>, true>>;

// DnsLog prepareFetch: threat_domain similarity select (queryBy questionDomain).
type Q_DnsLog_PrepThreatDomain = `select domain from threat_domain where domain % $1`;
type _V_DnsLog_PrepThreatDomain = Expect<Equal<ValidateSQL<Q_DnsLog_PrepThreatDomain, S>, true>>;
type _R_DnsLog_PrepThreatDomain = Expect<Equal<
    Simplify<GetReturnType<Q_DnsLog_PrepThreatDomain, S>>,
    { domain: S["schemas"]["public"]["threat_domain"]["domain"] }
>>;

// DnsLog fetchRelations: blacklist_ip select with dynamic IN-list.
// NOTE: `ip in (...)` list dynamically built; maximal form shown.
type Q_DnsLog_BlacklistIp = `select bi.ip, bi.source, bs.description from blacklist_ip bi left join blacklist_source bs on bs.id = bi.source where ip in ($1)`;
type _V_DnsLog_BlacklistIp = Expect<Equal<ValidateSQL<Q_DnsLog_BlacklistIp, S>, true>>;
type _R_DnsLog_BlacklistIp = Expect<Equal<
    Simplify<GetReturnType<Q_DnsLog_BlacklistIp, S>>,
    {
        ip: S["schemas"]["public"]["blacklist_ip"]["ip"];
        source: S["schemas"]["public"]["blacklist_ip"]["source"];
        // bs left-joined -> nullable
        description: S["schemas"]["public"]["blacklist_source"]["description"] | null;
    }
>>;

// DnsLog fetchRelations: blacklist_cidr select over `ip as self`.
// NOTE: `self.ip in (...)` list dynamically built; maximal form shown.
type Q_DnsLog_BlacklistCidr = `select self.ip, bc.source, bs.description from ip as self join blacklist_cidr bc on bc.cidr >> self.ip left join blacklist_source bs on bs.id = bc.source where self.ip in ($1)`;
type _V_DnsLog_BlacklistCidr = Expect<Equal<ValidateSQL<Q_DnsLog_BlacklistCidr, S>, true>>;
type _R_DnsLog_BlacklistCidr = Expect<Equal<
    Simplify<GetReturnType<Q_DnsLog_BlacklistCidr, S>>,
    {
        // self = ip table; ip.ip is inet -> unknown
        ip: S["schemas"]["public"]["ip"]["ip"];
        source: S["schemas"]["public"]["blacklist_cidr"]["source"];
        description: S["schemas"]["public"]["blacklist_source"]["description"] | null;
    }
>>;

// ===========================================================================
// packages/api/src/table/TarpitLog.ts  (Select over `tarpit_log_edge self`)
// ===========================================================================

// setOptions: maximal form over `self.*`. Joins (call order): ip (dns flag),
// payload, headers, threat (hrl + threat), blacklist (ip + cidr), entity(company).
// `self.*` -> tarpit_log_edge row, plus aliased extra columns.
// NOTE: dynamic builder; maximal form. payloadId/headersId branches (subselect)
// and queryBy variants are mutually-exclusive; shown separately below.
// NOTE: IN-list filters ($N); maximal single-value form shown.
type Q_Tarpit_Main = `select self.*, ip.dns_and_tarpit as dns_log_exists, tp.content, tp.gzipped, tp.failed_decoding, th.content as "headers", coalesce(thr.name, hrl.threat) as threat, hrl.threat_id, coalesce(hrl.threat_description, thr.description) as threat_description, ipc.name as company_name, ipc.domain as company_domain from tarpit_log_edge self join ip on ip.ip = self.source_ip left join tarpit_payload tp on tp.id = self.payload_id left join tarpit_header th on th.id = self.headers_id join hunt_report_log hrl on hrl.domain = self.domain left join threat thr on thr.id = hrl.threat_id left join blacklist_ip bi on bi.ip = self.source_ip left join blacklist_cidr bc on bc.cidr >> self.source_ip left join entity ipc on ipc.id = self.entity_id where hrl.threat_id in ($1) and (bi.ip is not null or bc.cidr is not null) and ip.dns_and_tarpit = true and self.country in ($2) and self.entity_id in ($3) and self.customer_company_id in ($4) and self.domain in ($5) and self.source_ip in ($6::inet) and self.forwarded_for in ($7::inet) and self.time between $8 and $9 and self.time >= '2026-01-01' and self.payload_id is not null and self.payload_id != 'd41d8cd98f00b204e9800998ecf8427e' and tp.gzipped = true order by self.time desc offset 0 limit 20`;
type _V_Tarpit_Main = Expect<Equal<ValidateSQL<Q_Tarpit_Main, S>, true>>;
type _R_Tarpit_Main = Expect<Equal<
    Simplify<GetReturnType<Q_Tarpit_Main, S>>,
    Simplify<
        & S["schemas"]["public"]["tarpit_log_edge"]
        & {
            // ip inner-joined -> not nullable
            dns_log_exists: S["schemas"]["public"]["ip"]["dns_and_tarpit"];
            // tp (tarpit_payload) left-joined -> nullable
            content: S["schemas"]["public"]["tarpit_payload"]["content"] | null;
            gzipped: S["schemas"]["public"]["tarpit_payload"]["gzipped"] | null;
            failed_decoding: S["schemas"]["public"]["tarpit_payload"]["failed_decoding"] | null;
            // th (tarpit_header) left-joined -> nullable
            headers: S["schemas"]["public"]["tarpit_header"]["content"] | null;
            // coalesce over thr (left) and hrl (inner) -> nullable
            threat: string | null;
            // hrl inner-joined -> not nullable
            threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
            threat_description: string | null;
            // ipc (entity) left-joined -> nullable
            company_name: S["schemas"]["public"]["entity"]["name"] | null;
            company_domain: S["schemas"]["public"]["entity"]["domain"] | null;
        }
    >
>>;

// Tarpit payloadId branch: id-in-subselect (no outer limit when payloadId set).
// NOTE: dynamic; payloadId IN-list variant. Inner sub has offset/limit.
type Q_Tarpit_PayloadId = `select self.* from tarpit_log_edge self where self.id in (select self.id from tarpit_log_edge self where self.payload_id in ($1) offset 0 limit 20) order by self.time desc`;
type _V_Tarpit_PayloadId = Expect<Equal<ValidateSQL<Q_Tarpit_PayloadId, S>, true>>;
type _R_Tarpit_PayloadId = Expect<Equal<
    Simplify<GetReturnType<Q_Tarpit_PayloadId, S>>,
    Simplify<S["schemas"]["public"]["tarpit_log_edge"]>
>>;

// Tarpit headersId branch: id-in-subselect.
// NOTE: dynamic; headersId IN-list variant.
type Q_Tarpit_HeadersId = `select self.* from tarpit_log_edge self where self.id in (select self.id from tarpit_log_edge self where self.headers_id in ($1) offset 0 limit 20) order by self.time desc`;
type _V_Tarpit_HeadersId = Expect<Equal<ValidateSQL<Q_Tarpit_HeadersId, S>, true>>;

// Tarpit queryBy "ip" -> ipOrForwardedFor (OR ConditionTree).
// NOTE: dynamic; queryBy=ip variant.
type Q_Tarpit_IpOrFwd = `select self.* from tarpit_log_edge self where (self.source_ip = $1::inet or self.forwarded_for = $2::inet) order by self.time desc offset 0 limit 20`;
type _V_Tarpit_IpOrFwd = Expect<Equal<ValidateSQL<Q_Tarpit_IpOrFwd, S>, true>>;

// Tarpit queryBy "domain" variant.
// NOTE: dynamic; queryBy=domain variant.
type Q_Tarpit_DomainQuery = `select self.* from tarpit_log_edge self where self.domain = $1 order by self.time desc offset 0 limit 20`;
type _V_Tarpit_DomainQuery = Expect<Equal<ValidateSQL<Q_Tarpit_DomainQuery, S>, true>>;

// Tarpit fetchRelations: blacklist_ip select (same shape as DnsLog).
// NOTE: `ip in (...)` list dynamically built; maximal form shown.
type Q_Tarpit_BlacklistIp = `select bi.ip, bi.source, bs.description from blacklist_ip bi left join blacklist_source bs on bs.id = bi.source where ip in ($1)`;
type _V_Tarpit_BlacklistIp = Expect<Equal<ValidateSQL<Q_Tarpit_BlacklistIp, S>, true>>;
type _R_Tarpit_BlacklistIp = Expect<Equal<
    Simplify<GetReturnType<Q_Tarpit_BlacklistIp, S>>,
    {
        ip: S["schemas"]["public"]["blacklist_ip"]["ip"];
        source: S["schemas"]["public"]["blacklist_ip"]["source"];
        description: S["schemas"]["public"]["blacklist_source"]["description"] | null;
    }
>>;

// Tarpit fetchRelations: blacklist_cidr select over `ip as self`.
// NOTE: `self.ip in (...)` list dynamically built; maximal form shown.
type Q_Tarpit_BlacklistCidr = `select self.ip, bc.source, bs.description from ip as self join blacklist_cidr bc on bc.cidr >> self.ip left join blacklist_source bs on bs.id = bc.source where self.ip in ($1)`;
type _V_Tarpit_BlacklistCidr = Expect<Equal<ValidateSQL<Q_Tarpit_BlacklistCidr, S>, true>>;
type _R_Tarpit_BlacklistCidr = Expect<Equal<
    Simplify<GetReturnType<Q_Tarpit_BlacklistCidr, S>>,
    {
        ip: S["schemas"]["public"]["ip"]["ip"];
        source: S["schemas"]["public"]["blacklist_cidr"]["source"];
        description: S["schemas"]["public"]["blacklist_source"]["description"] | null;
    }
>>;

// A `Json` reference so the import is always used regardless of inference.
type _JsonUsed = Json | undefined;

export type PackagesApiActionsTableTestsPass = true;
