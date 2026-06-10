/**
 * Netsec misc-cron query coverage.
 * Queries copied from the netsec app cron services (services/cron/*). Collection
 * pass: faithful coverage; red/unknown results are expected findings, not bugs.
 *
 * Raw `/*sql* /`-tagged templates are copied verbatim. `${x}` runtime
 * interpolations (id-lists, batch VALUES, constants) are rendered into their
 * maximal/inlined form with a NOTE. `${x.addValue(v)}` does not occur here (these
 * are raw-template + positional-`$N` callsites); positional params are kept as
 * written. Casts like `$1::inet` are kept. DDL/config templates that are not
 * row queries are marked `TODO(non-query)`.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// services/cron/check-domain-dns-status/src/index.ts
// ---------------------------------------------------------------------------

// getNextDomain: hunt_report_log left join domain_dns_status; select d.domain.
type Q_CheckDns_Next = `
    select d.domain
    from hunt_report_log d
    left join domain_dns_status dds on d.domain = dds.domain
    order by dds.last_checked_at asc nulls first
    limit 1
`;
type _V_CheckDns_Next = Expect<Equal<ValidateSQL<Q_CheckDns_Next, S>, true>>;
type _R_CheckDns_Next = Expect<Equal<
    Simplify<GetReturnType<Q_CheckDns_Next, S>>,
    { domain: S["schemas"]["public"]["hunt_report_log"]["domain"] }
>>;

// isDomainActive: select * from domain_settings.
type Q_CheckDns_Settings = `select * from domain_settings where domain = $1`;
type _V_CheckDns_Settings = Expect<Equal<ValidateSQL<Q_CheckDns_Settings, S>, true>>;
type _R_CheckDns_Settings = Expect<Equal<
    Simplify<GetReturnType<Q_CheckDns_Settings, S>>,
    Simplify<S["schemas"]["public"]["domain_settings"]>
>>;

// action(): upsert into domain_dns_status (success path); no RETURNING.
type Q_CheckDns_UpsertOk = `
    insert into domain_dns_status
    (domain, addrs, last_checked_at, is_active, error)
    values ($1, $2, now(), $3, null)
    on conflict (domain) do update
    set addrs = excluded.addrs,
        last_checked_at = excluded.last_checked_at,
        is_active = excluded.is_active,
        error = null
`;
type _V_CheckDns_UpsertOk = Expect<Equal<ValidateSQL<Q_CheckDns_UpsertOk, S>, true>>;

// action(): upsert into domain_dns_status (error path); no RETURNING.
type Q_CheckDns_UpsertErr = `
    insert into domain_dns_status
    (domain, error, last_checked_at, is_active, addrs)
    values ($1, $2, now(), false, null)
    on conflict (domain) do update
    set error = excluded.error,
        last_checked_at = excluded.last_checked_at,
        is_active = excluded.is_active,
        addrs = null
`;
type _V_CheckDns_UpsertErr = Expect<Equal<ValidateSQL<Q_CheckDns_UpsertErr, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/company-domain-match-similar/src/index.ts
// ---------------------------------------------------------------------------

// claimBatch: select from company_domain order by similar_last_checked_at.
type Q_MatchSimilar_Claim = `SELECT company_id, domain
     FROM company_domain
     ORDER BY similar_last_checked_at ASC NULLS FIRST
     LIMIT $1`;
type _V_MatchSimilar_Claim = Expect<Equal<ValidateSQL<Q_MatchSimilar_Claim, S>, true>>;
type _R_MatchSimilar_Claim = Expect<Equal<
    Simplify<GetReturnType<Q_MatchSimilar_Claim, S>>,
    {
        company_id: S["schemas"]["public"]["company_domain"]["company_id"];
        domain: S["schemas"]["public"]["company_domain"]["domain"];
    }
>>;

// buildSelfExclusionMap: dynamic IN-list, maximal form with one literal.
// NOTE: `where company_id in (...)` list dynamically built; maximal form shown.
type Q_MatchSimilar_SelfExcl = `SELECT company_id, domain
     FROM company_domain
     WHERE company_id IN ('c1')`;
type _V_MatchSimilar_SelfExcl = Expect<Equal<ValidateSQL<Q_MatchSimilar_SelfExcl, S>, true>>;
type _R_MatchSimilar_SelfExcl = Expect<Equal<
    Simplify<GetReturnType<Q_MatchSimilar_SelfExcl, S>>,
    {
        company_id: S["schemas"]["public"]["company_domain"]["company_id"];
        domain: S["schemas"]["public"]["company_domain"]["domain"];
    }
>>;

// verifyDomainsExist: select domain from domain where domain = ANY($1).
type Q_MatchSimilar_Verify = `SELECT domain FROM domain WHERE domain = ANY($1)`;
type _V_MatchSimilar_Verify = Expect<Equal<ValidateSQL<Q_MatchSimilar_Verify, S>, true>>;
type _R_MatchSimilar_Verify = Expect<Equal<
    Simplify<GetReturnType<Q_MatchSimilar_Verify, S>>,
    { domain: S["schemas"]["public"]["domain"]["domain"] }
>>;

// insertSimilarDomains: multi-row VALUES batch, ON CONFLICT DO NOTHING.
// NOTE: dynamic multi-row VALUES; maximal form shown as a single-row literal.
type Q_MatchSimilar_Insert = `INSERT INTO company_domain_similar (company_id, domain, similar_domain)
     VALUES ('c1', 'a.example', 'b.example')
     ON CONFLICT (company_id, domain, similar_domain) DO NOTHING`;
type _V_MatchSimilar_Insert = Expect<Equal<ValidateSQL<Q_MatchSimilar_Insert, S>, true>>;

// checkpoint: UPDATE … WHERE (company_id, domain) IN (...); no RETURNING.
// NOTE: dynamic tuple IN-list; maximal form shown as a single tuple literal.
type Q_MatchSimilar_Checkpoint = `UPDATE company_domain SET similar_last_checked_at = now()
     WHERE (company_id, domain) IN (('c1', 'a.example'))`;
type _V_MatchSimilar_Checkpoint = Expect<Equal<ValidateSQL<Q_MatchSimilar_Checkpoint, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/company-process-addrs/src/index.ts
// ---------------------------------------------------------------------------

// getPage: select * from company_addr where processed = false.
type Q_ProcessAddrs_Page = `
    select *
    from company_addr
    where processed = false limit 100
`;
type _V_ProcessAddrs_Page = Expect<Equal<ValidateSQL<Q_ProcessAddrs_Page, S>, true>>;
type _R_ProcessAddrs_Page = Expect<Equal<
    Simplify<GetReturnType<Q_ProcessAddrs_Page, S>>,
    Simplify<S["schemas"]["public"]["company_addr"]>
>>;

// processRow (delete branch): update ip … where $1::inet && ip.ip; no RETURNING.
type Q_ProcessAddrs_UpdNull = `
    update ip
    set
        customer_company_last_updated_at = now(),
        customer_company_id = null
    where
        $1::inet && ip.ip
`;
type _V_ProcessAddrs_UpdNull = Expect<Equal<ValidateSQL<Q_ProcessAddrs_UpdNull, S>, true>>;

// processRow (delete branch): delete from company_addr; no RETURNING.
type Q_ProcessAddrs_Delete = `delete from company_addr where company_id = $1 and addr = $2`;
type _V_ProcessAddrs_Delete = Expect<Equal<ValidateSQL<Q_ProcessAddrs_Delete, S>, true>>;

// processRow (add branch): update ip set customer_company_id = $1; no RETURNING.
type Q_ProcessAddrs_UpdSet = `
    update ip
    set
        customer_company_last_updated_at = now(),
        customer_company_id = $1
    where
        $2::inet && ip.ip
`;
type _V_ProcessAddrs_UpdSet = Expect<Equal<ValidateSQL<Q_ProcessAddrs_UpdSet, S>, true>>;

// processRow (add branch): update company_addr set processed = true; no RETURNING.
type Q_ProcessAddrs_MarkDone = `
    update company_addr set processed = true
    where company_id = $1 and addr = $2
`;
type _V_ProcessAddrs_MarkDone = Expect<Equal<ValidateSQL<Q_ProcessAddrs_MarkDone, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/domain-manager/src/index.ts
// ---------------------------------------------------------------------------

// getNextDomain: domain_settings join tarpit_server_ip join tarpit_server.
// NOTE: literal `'1 week'` interval and `'nginx'` kept inline.
type Q_DomainMgr_Next = `
    select ds.*
    from domain_settings ds
    join tarpit_server_ip tsi on tsi.ip = ds.target
    join tarpit_server ts on ts.id = tsi.tarpit_server_id
    where
        (cert is null or force_refresh = true or
            (cert_expires_at is not null and
            cert_expires_at < now() + interval '1 week')) and
        target is not null and
        enabled != false and
        ts.type = 'nginx'
`;
type _V_DomainMgr_Next = Expect<Equal<ValidateSQL<Q_DomainMgr_Next, S>, true>>;
type _R_DomainMgr_Next = Expect<Equal<
    Simplify<GetReturnType<Q_DomainMgr_Next, S>>,
    Simplify<S["schemas"]["public"]["domain_settings"]>
>>;

// ---------------------------------------------------------------------------
// services/cron/generate-corefile/src/index.ts
// ---------------------------------------------------------------------------

// getAllDomains (1/2): select domain from hunt_report_log order by domain.
type Q_Corefile_HrlDomains = `select domain from hunt_report_log order by domain`;
type _V_Corefile_HrlDomains = Expect<Equal<ValidateSQL<Q_Corefile_HrlDomains, S>, true>>;
type _R_Corefile_HrlDomains = Expect<Equal<
    Simplify<GetReturnType<Q_Corefile_HrlDomains, S>>,
    { domain: S["schemas"]["public"]["hunt_report_log"]["domain"] }
>>;

// getAllDomains (2/2): select domain from hunt_report_queue order by domain.
type Q_Corefile_QueueDomains = `select domain from hunt_report_queue order by domain`;
type _V_Corefile_QueueDomains = Expect<Equal<ValidateSQL<Q_Corefile_QueueDomains, S>, true>>;
type _R_Corefile_QueueDomains = Expect<Equal<
    Simplify<GetReturnType<Q_Corefile_QueueDomains, S>>,
    { domain: S["schemas"]["public"]["hunt_report_queue"]["domain"] }
>>;

// getRecordDomains: domain_settings left join tarpit_server_ip / tarpit_server,
// select ds.*, ts.type.
type Q_Corefile_Records = `
    select ds.*, ts.type
    from domain_settings ds
    left join tarpit_server_ip tsi on tsi.ip = ds.target
    left join tarpit_server ts on ts.id = tsi.tarpit_server_id
    order by ds.domain
`;
type _V_Corefile_Records = Expect<Equal<ValidateSQL<Q_Corefile_Records, S>, true>>;
type _R_Corefile_Records = Expect<Equal<
    Simplify<GetReturnType<Q_Corefile_Records, S>>,
    Simplify<
        & S["schemas"]["public"]["domain_settings"]
        & { type: S["schemas"]["public"]["tarpit_server"]["type"] | null }
    >
>>;

// NOTE: the Corefile/records template strings in this file are CoreDNS config
// text, not SQL → not covered.

// ---------------------------------------------------------------------------
// services/cron/generate-ip-conf/src/index.ts
// ---------------------------------------------------------------------------

// getIps: select * from tarpit_server_ip.
type Q_IpConf_Ips = `select * from tarpit_server_ip`;
type _V_IpConf_Ips = Expect<Equal<ValidateSQL<Q_IpConf_Ips, S>, true>>;
type _R_IpConf_Ips = Expect<Equal<
    Simplify<GetReturnType<Q_IpConf_Ips, S>>,
    Simplify<S["schemas"]["public"]["tarpit_server_ip"]>
>>;

// getServers: select * from tarpit_server.
type Q_IpConf_Servers = `select * from tarpit_server`;
type _V_IpConf_Servers = Expect<Equal<ValidateSQL<Q_IpConf_Servers, S>, true>>;
type _R_IpConf_Servers = Expect<Equal<
    Simplify<GetReturnType<Q_IpConf_Servers, S>>,
    Simplify<S["schemas"]["public"]["tarpit_server"]>
>>;

// NOTE: iptables/netplan templates in this file are config text, not SQL.

// ---------------------------------------------------------------------------
// services/cron/generate-nginx-conf/src/index.ts
// ---------------------------------------------------------------------------

// getAllDomains: select * from domain_settings (cert-ready filter).
type Q_NginxConf_Domains = `
    select *
    from domain_settings
    where target is not null and
        cert_fullchain is not null and
        cert_private_key is not null
    order by domain
`;
type _V_NginxConf_Domains = Expect<Equal<ValidateSQL<Q_NginxConf_Domains, S>, true>>;
type _R_NginxConf_Domains = Expect<Equal<
    Simplify<GetReturnType<Q_NginxConf_Domains, S>>,
    Simplify<S["schemas"]["public"]["domain_settings"]>
>>;

// NOTE: the nginx `log_format`/`server { ... }` templates are nginx config
// text, not SQL → not covered.

// ---------------------------------------------------------------------------
// services/cron/hunt-queue-finalize/src/index.ts
// ---------------------------------------------------------------------------

// getQueue: select q.* from hunt_report_queue q join threat_domain d.
type Q_HuntFinalize_Queue = `
    select q.*
    from hunt_report_queue q
    join threat_domain d on d.domain = q.domain
`;
type _V_HuntFinalize_Queue = Expect<Equal<ValidateSQL<Q_HuntFinalize_Queue, S>, true>>;
type _R_HuntFinalize_Queue = Expect<Equal<
    Simplify<GetReturnType<Q_HuntFinalize_Queue, S>>,
    Simplify<S["schemas"]["public"]["hunt_report_queue"]>
>>;

// createHuntReport: insert into hunt_report_log (...) values (...) on conflict
// do nothing. Columns/values dynamically built; maximal form shown with all
// listed columns and literal/placeholder values.
// NOTE: dynamic column+value lists; maximal form shown with literal values.
type Q_HuntFinalize_Insert = `
    insert into hunt_report_log (domain, domain_type, original_name_servers, creation_date, expiration_date, threat_id, threat, threat_actor, threat_type, threat_description, evidence, registrar_id, registrar, registrant_name, registrant_email)
    values ('a.example', 'phishing', '{ns1.example}', null, null, 't1', 'name', 'actor', 'type', 'desc', '{ev1}', 1, 'reg', 'rname', 'remail')
    on conflict(domain) do nothing
`;
type _V_HuntFinalize_Insert = Expect<Equal<ValidateSQL<Q_HuntFinalize_Insert, S>, true>>;

// deleteQueue: delete from hunt_report_queue where domain = '<domain>'.
// NOTE: `${domain}` inlined as a literal; maximal form shown.
type Q_HuntFinalize_Delete = `
    delete from hunt_report_queue where domain = 'a.example'
`;
type _V_HuntFinalize_Delete = Expect<Equal<ValidateSQL<Q_HuntFinalize_Delete, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/index-domains/src/index.ts
// ---------------------------------------------------------------------------

// claimBatch: WITH cte (...) update domain_index_queue ... returning q.domain.
// NOTE: `${MAX_ATTEMPTS}`=10, `${BATCH_SIZE}`=1000 inlined.
type Q_IndexDomains_Claim = `
    with cte as (
        select domain
        from domain_index_queue
        where (locked_at is null or locked_at < now() - interval '5 minutes')
          and attempts < 10
        order by queued_at asc
        limit 1000
        for update skip locked
    )
    update domain_index_queue q
    set locked_at = now()
    from cte
    where q.domain = cte.domain
    returning q.domain
`;
type _V_IndexDomains_Claim = Expect<Equal<ValidateSQL<Q_IndexDomains_Claim, S>, true>>;
type _R_IndexDomains_Claim = Expect<Equal<
    Simplify<GetReturnType<Q_IndexDomains_Claim, S>>,
    { domain: S["schemas"]["public"]["domain_index_queue"]["domain"] }
>>;

// fetchDomainsForIndexing: domain left join registrant/customer/reseller/misc.
// NOTE: `where d.domain in (...)` list dynamically built; maximal form shown.
type Q_IndexDomains_Fetch = `
    select
        d.domain,
        d.registration_ip,
        d.registrant_email,
        dr.registrant,
        dc.customer,
        dres.reseller,
        dm.misc
    from domain d
    left join domain_registrant dr on dr.domain = d.domain
    left join domain_customer dc on dc.domain = d.domain
    left join domain_reseller dres on dres.domain = d.domain
    left join domain_misc dm on dm.domain = d.domain
    where d.domain in ('a.example')
`;
type _V_IndexDomains_Fetch = Expect<Equal<ValidateSQL<Q_IndexDomains_Fetch, S>, true>>;
type _R_IndexDomains_Fetch = Expect<Equal<
    Simplify<GetReturnType<Q_IndexDomains_Fetch, S>>,
    {
        domain: S["schemas"]["public"]["domain"]["domain"];
        // registration_ip is inet → unknown in fixture; nullable in schema.
        registration_ip: S["schemas"]["public"]["domain"]["registration_ip"];
        registrant_email: S["schemas"]["public"]["domain"]["registrant_email"];
        registrant: S["schemas"]["public"]["domain_registrant"]["registrant"] | null;
        customer: S["schemas"]["public"]["domain_customer"]["customer"] | null;
        reseller: S["schemas"]["public"]["domain_reseller"]["reseller"] | null;
        misc: S["schemas"]["public"]["domain_misc"]["misc"] | null;
    }
>>;

// onSuccess: delete from domain_index_queue where domain in (...); no RETURNING.
// NOTE: dynamic id-list; maximal form shown.
type Q_IndexDomains_Success = `
    delete from domain_index_queue
    where domain in ('a.example')
`;
type _V_IndexDomains_Success = Expect<Equal<ValidateSQL<Q_IndexDomains_Success, S>, true>>;

// onFailure: update domain_index_queue ... where domain in (...); no RETURNING.
// NOTE: `${safeError}` inlined as a literal; dynamic id-list maximal form.
type Q_IndexDomains_Failure = `
    update domain_index_queue
    set attempts = attempts + 1,
        last_error = 'boom',
        locked_at = null
    where domain in ('a.example')
`;
type _V_IndexDomains_Failure = Expect<Equal<ValidateSQL<Q_IndexDomains_Failure, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/index-ransomware-attacks/src/index.ts
// ---------------------------------------------------------------------------

// getPage: select * from blacklight_ransomware_attack where indexed = false.
// NOTE: `${PAGE_SIZE}`=1000 inlined.
type Q_IdxAttacks_Page = `
    select *
    from blacklight_ransomware_attack
    where indexed = false
    limit 1000
`;
type _V_IdxAttacks_Page = Expect<Equal<ValidateSQL<Q_IdxAttacks_Page, S>, true>>;
type _R_IdxAttacks_Page = Expect<Equal<
    Simplify<GetReturnType<Q_IdxAttacks_Page, S>>,
    Simplify<S["schemas"]["public"]["blacklight_ransomware_attack"]>
>>;

// setIndexed: update blacklight_ransomware_attack set indexed = true; no RETURNING.
// NOTE: dynamic id-list; maximal form shown.
type Q_IdxAttacks_SetIndexed = `update blacklight_ransomware_attack set indexed = true
                        where id in ('a1')`;
type _V_IdxAttacks_SetIndexed = Expect<Equal<ValidateSQL<Q_IdxAttacks_SetIndexed, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/index-ransomware-groups/src/index.ts
// ---------------------------------------------------------------------------

// getPage: select * from blacklight_ransomware_group where indexed = false.
// NOTE: `${PAGE_SIZE}`=1000 inlined.
type Q_IdxGroups_Page = `
    select *
    from blacklight_ransomware_group
    where indexed = false
    limit 1000
`;
type _V_IdxGroups_Page = Expect<Equal<ValidateSQL<Q_IdxGroups_Page, S>, true>>;
type _R_IdxGroups_Page = Expect<Equal<
    Simplify<GetReturnType<Q_IdxGroups_Page, S>>,
    Simplify<S["schemas"]["public"]["blacklight_ransomware_group"]>
>>;

// setIndexed: update blacklight_ransomware_group set indexed = true; no RETURNING.
// NOTE: dynamic id-list; maximal form shown.
type Q_IdxGroups_SetIndexed = `update blacklight_ransomware_group set indexed = true
                        where id in ('g1')`;
type _V_IdxGroups_SetIndexed = Expect<Equal<ValidateSQL<Q_IdxGroups_SetIndexed, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/index-ransomware-profiles/src/index.ts
// ---------------------------------------------------------------------------

// getPage: select * from blacklight_profile where indexed = false.
// NOTE: `${PAGE_SIZE}`=1000 inlined.
type Q_IdxProfiles_Page = `
    select *
    from blacklight_profile
    where indexed = false
    limit 1000
`;
type _V_IdxProfiles_Page = Expect<Equal<ValidateSQL<Q_IdxProfiles_Page, S>, true>>;
type _R_IdxProfiles_Page = Expect<Equal<
    Simplify<GetReturnType<Q_IdxProfiles_Page, S>>,
    Simplify<S["schemas"]["public"]["blacklight_profile"]>
>>;

// setIndexed: update blacklight_profile set indexed = true; no RETURNING.
// NOTE: dynamic id-list; maximal form shown.
type Q_IdxProfiles_SetIndexed = `
    update blacklight_profile set indexed = true
    where id in ('p1')
`;
type _V_IdxProfiles_SetIndexed = Expect<Equal<ValidateSQL<Q_IdxProfiles_SetIndexed, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/index-ransomware-victims/src/index.ts
// ---------------------------------------------------------------------------

// getPage: select * from blacklight_ransomware_victim where indexed = false.
// NOTE: `${PAGE_SIZE}`=1000 inlined.
type Q_IdxVictims_Page = `
    select *
    from blacklight_ransomware_victim
    where indexed = false
    limit 1000
`;
type _V_IdxVictims_Page = Expect<Equal<ValidateSQL<Q_IdxVictims_Page, S>, true>>;
type _R_IdxVictims_Page = Expect<Equal<
    Simplify<GetReturnType<Q_IdxVictims_Page, S>>,
    Simplify<S["schemas"]["public"]["blacklight_ransomware_victim"]>
>>;

// setIndexed: update blacklight_ransomware_victim set indexed = true; no RETURNING.
// NOTE: untagged template (no /*sql* /) but real DML; dynamic id-list maximal form.
type Q_IdxVictims_SetIndexed = `update blacklight_ransomware_victim set indexed = true
                        where id in ('v1')`;
type _V_IdxVictims_SetIndexed = Expect<Equal<ValidateSQL<Q_IdxVictims_SetIndexed, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/index-suspended-domains/src/index.ts
// ---------------------------------------------------------------------------

// getPage: select * from suspended_domain where indexed = false.
// NOTE: `${PAGE_SIZE}`=1000 inlined.
type Q_IdxSuspended_Page = `
    select *
    from suspended_domain
    where indexed = false
    limit 1000
`;
type _V_IdxSuspended_Page = Expect<Equal<ValidateSQL<Q_IdxSuspended_Page, S>, true>>;
type _R_IdxSuspended_Page = Expect<Equal<
    Simplify<GetReturnType<Q_IdxSuspended_Page, S>>,
    Simplify<S["schemas"]["public"]["suspended_domain"]>
>>;

// setIndexed: update suspended_domain set indexed = true; no RETURNING.
// NOTE: dynamic domain-list; maximal form shown.
type Q_IdxSuspended_SetIndexed = `
    update suspended_domain set indexed = true
    where domain in ('a.example')
`;
type _V_IdxSuspended_SetIndexed = Expect<Equal<ValidateSQL<Q_IdxSuspended_SetIndexed, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/index-tarpit-data/src/index.ts
// ---------------------------------------------------------------------------

// getPage: select id, content from tarpit_payload (public schema).
// NOTE: `${PAGE_SIZE}`=500 inlined.
type Q_IdxTarpitData_Page = `
    select id, content
    from tarpit_payload
    where indexed = false and failed_decoding = false and gzipped = false
    limit 500
`;
// FIXTURE-GAP: public.tarpit_payload has no `indexed` column (payload_storage.tarpit_payload does)
type _V_IdxTarpitData_Page = Expect<Equal<ValidateSQL<Q_IdxTarpitData_Page, S>, true>>;
type _R_IdxTarpitData_Page = Expect<Equal<
    Simplify<GetReturnType<Q_IdxTarpitData_Page, S>>,
    {
        id: S["schemas"]["public"]["tarpit_payload"]["id"];
        content: S["schemas"]["public"]["tarpit_payload"]["content"];
    }
>>;

// setIndexed: update tarpit_payload set indexed = true; no RETURNING.
// NOTE: dynamic id-list; maximal form shown.
// FIXTURE-GAP: public.tarpit_payload has no `indexed` column
type Q_IdxTarpitData_SetIndexed = `update tarpit_payload set indexed = true
                        where id in ('p1')`;
type _V_IdxTarpitData_SetIndexed = Expect<Equal<ValidateSQL<Q_IdxTarpitData_SetIndexed, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/index-tarpit-headers/src/index.ts
// ---------------------------------------------------------------------------

// getPage: select id, content from tarpit_header (public schema).
// NOTE: `${PAGE_SIZE}`=500 inlined.
type Q_IdxTarpitHeaders_Page = `
    select id, content
    from tarpit_header
    where indexed = false
    limit 500
`;
// FIXTURE-GAP: public.tarpit_header has no `indexed` column (payload_storage.tarpit_header does)
type _V_IdxTarpitHeaders_Page = Expect<Equal<ValidateSQL<Q_IdxTarpitHeaders_Page, S>, true>>;
type _R_IdxTarpitHeaders_Page = Expect<Equal<
    Simplify<GetReturnType<Q_IdxTarpitHeaders_Page, S>>,
    {
        id: S["schemas"]["public"]["tarpit_header"]["id"];
        content: S["schemas"]["public"]["tarpit_header"]["content"];
    }
>>;

// setIndexed: update tarpit_header set indexed = true; no RETURNING.
// NOTE: untagged template (no /*sql* /) but real DML; dynamic id-list maximal form.
// FIXTURE-GAP: public.tarpit_header has no `indexed` column
type Q_IdxTarpitHeaders_SetIndexed = `update tarpit_header set indexed = true
                        where id in ('h1')`;
type _V_IdxTarpitHeaders_SetIndexed = Expect<Equal<ValidateSQL<Q_IdxTarpitHeaders_SetIndexed, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/remove-old-blacklists/src/index.ts
// ---------------------------------------------------------------------------

// removeOldBlacklists (1/2): delete from blacklist_ip; no RETURNING.
type Q_RmBlacklists_Ip = `
    DELETE FROM blacklist_ip
    WHERE added_at < now() - interval '7 days'
`;
type _V_RmBlacklists_Ip = Expect<Equal<ValidateSQL<Q_RmBlacklists_Ip, S>, true>>;

// removeOldBlacklists (2/2): delete from blacklist_cidr returning cidr::text.
type Q_RmBlacklists_Cidr = `
    DELETE FROM blacklist_cidr
    WHERE added_at < now() - interval '7 days'
    RETURNING cidr::text
`;
type _V_RmBlacklists_Cidr = Expect<Equal<ValidateSQL<Q_RmBlacklists_Cidr, S>, true>>;
type _R_RmBlacklists_Cidr = Expect<Equal<
    Simplify<GetReturnType<Q_RmBlacklists_Cidr, S>>,
    // cidr::text -> string
    { cidr: string }
>>;

// NOTE: the ClickHouse `ALTER TABLE ... DELETE` / `SYSTEM RELOAD DICTIONARY`
// statements in this file target ClickHouse, not the typed PG schema → skipped.

// ---------------------------------------------------------------------------
// services/cron/threat-import/src/index.ts
// ---------------------------------------------------------------------------

// prepareQuery: insert into threat (...) values (...) on conflict do update.
// NOTE: dynamic multi-row VALUES; maximal form shown as a single-row literal.
type Q_ThreatImport_Insert = `
    insert into threat (id, name, description, alias, malpedia_data, yara_available, actor)
    values
    ('t1', 'name', 'desc', 'alias', '{}', true, 'actor')
    on conflict (id) do update
        set malpedia_data = excluded.malpedia_data,
            yara_available = excluded.yara_available,
            actor = excluded.actor
`;
type _V_ThreatImport_Insert = Expect<Equal<ValidateSQL<Q_ThreatImport_Insert, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/threatfox-import/src/index.ts
// ---------------------------------------------------------------------------

// prepareQuery: insert into threatfox_ioc (...) values (...) on conflict do nothing.
// NOTE: dynamic multi-row VALUES; maximal form shown as a single-row literal.
type Q_ThreatfoxImport_Insert = `
    insert into threatfox_ioc (
        id, ioc, ioc_type, threat_type, malware, malware_alias, malware_printable,
        first_seen_at, last_seen_at, confidence_level, reference, tags, reporter)
    values
    (1, 'ioc', 'domain', 'botnet_cc', 'malware', 'alias', 'printable', '2026-01-01', '2026-01-02', '100', 'ref', 'tag', 'reporter')
    on conflict (id) do nothing
`;
type _V_ThreatfoxImport_Insert = Expect<Equal<ValidateSQL<Q_ThreatfoxImport_Insert, S>, true>>;

// A `Json` reference so the import is always used regardless of inference.
type _JsonUsed = Json | undefined;

export type CronMiscTestsPass = true;
