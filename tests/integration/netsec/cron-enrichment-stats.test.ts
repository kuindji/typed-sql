/**
 * Netsec cron ip-enrichment + stats query coverage.
 * Queries copied from the netsec app (services/cron/ip-enrichment and
 * services/cron/stats). Collection pass: faithful coverage; red/unknown results
 * are expected findings, not bugs.
 *
 * Extraction rules applied here:
 *   - RAW `/*sql* /` templates copied verbatim; `${x.addValue(v)}` interpolations
 *     and dynamically-built VALUES placeholder lists are rendered to `$1`, `$2`…
 *     in 1-based order (cast-suffixed `$1::inet` where the source emits a cast).
 *   - `${BATCH_SIZE}` and similar inlined consts are inlined + `// NOTE`.
 *   - Dynamically-built IN-lists / VALUES are shown in MAXIMAL form (one row)
 *     + `// NOTE: dynamic, maximal form`.
 *   - DDL/admin/catalog queries get `ValidateSQL` only + `// TODO(non-query)`.
 *
 * These are mostly UPDATE/INSERT stat rollups; none use RETURNING, so only
 * ValidateSQL is asserted for those. The handful of SELECTs get GetReturnType.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// services/cron/ip-enrichment/src/updateIpCountry.ts
// ---------------------------------------------------------------------------

// Batch SELECT of IPs needing a country.
// NOTE: `LIMIT ${BATCH_SIZE}` inlined (BATCH_SIZE = 200).
// `host(ip)` is an unmodeled function over an inet column -> unknown.
type Q_IpCountry_Select = `
    SELECT host(ip) as ip
    FROM ip
    WHERE country IS NULL
    ORDER BY country_last_updated_at ASC NULLS FIRST
    LIMIT 200
`;
type _V_IpCountry_Select = Expect<Equal<ValidateSQL<Q_IpCountry_Select, S>, true>>;
type _R_IpCountry_Select = Expect<Equal<
    Simplify<GetReturnType<Q_IpCountry_Select, S>>,
    { ip: unknown }
>>;

// Country lookup by CIDR.
// NOTE: `cidr IN (...)` list dynamically built; maximal form (one literal).
// `cidr::text` cast -> string; `country` from ip_geo.
type Q_IpCountry_Geo = `
    SELECT cidr::text, country FROM ip_geo
    WHERE cidr IN ('10.0.0.0/8')
`;
type _V_IpCountry_Geo = Expect<Equal<ValidateSQL<Q_IpCountry_Geo, S>, true>>;
type _R_IpCountry_Geo = Expect<Equal<
    Simplify<GetReturnType<Q_IpCountry_Geo, S>>,
    {
        cidr: string;
        country: S["schemas"]["public"]["ip_geo"]["country"];
    }
>>;

// UPDATE … FROM (VALUES …) AS source(ip, country). No RETURNING.
// NOTE: VALUES placeholder list dynamically built; maximal form (one row).
type Q_IpCountry_Update = `
    UPDATE ip AS target
    SET country = source.country::char(2),
        country_last_updated_at = NOW()
    FROM (VALUES ($1::inet, $2)) AS source(ip, country)
    WHERE target.ip = source.ip
`;
type _V_IpCountry_Update = Expect<Equal<ValidateSQL<Q_IpCountry_Update, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/ip-enrichment/src/updateIpCustomerCompanyId.ts
// ---------------------------------------------------------------------------

// Batch SELECT, LEFT JOIN company_addr via GiST containment (`>>=`).
// NOTE: `LIMIT ${BATCH_SIZE}` inlined (BATCH_SIZE = 1000).
// `host(ip.ip)` -> unknown. ca left-joined -> ca.company_id nullable.
type Q_IpCustCompany_Select = `
    SELECT host(ip.ip) as ip, ca.company_id as customer_company_id
    FROM ip
    LEFT JOIN company_addr ca ON ca.addr >>= ip.ip
    WHERE ip.customer_company_id IS NULL
    ORDER BY ip.customer_company_last_updated_at ASC NULLS FIRST
    LIMIT 1000
`;
type _V_IpCustCompany_Select = Expect<Equal<ValidateSQL<Q_IpCustCompany_Select, S>, true>>;
type _R_IpCustCompany_Select = Expect<Equal<
    Simplify<GetReturnType<Q_IpCustCompany_Select, S>>,
    {
        ip: unknown;
        // company_addr.company_id is NOT NULL in schema, but left-joined -> nullable
        customer_company_id: S["schemas"]["public"]["company_addr"]["company_id"] | null;
    }
>>;

// UPDATE … FROM (VALUES …) AS source(ip, customer_company_id). No RETURNING.
// NOTE: VALUES placeholder list dynamically built; maximal form (one row).
type Q_IpCustCompany_Update = `
    UPDATE ip AS target
    SET customer_company_id = source.customer_company_id,
        customer_company_last_updated_at = NOW()
    FROM (VALUES ($1::inet, $2::uuid))
        AS source(ip, customer_company_id)
    WHERE target.ip = source.ip
`;
type _V_IpCustCompany_Update = Expect<Equal<ValidateSQL<Q_IpCustCompany_Update, S>, true>>;

// Timestamp bump for unmatched IPs. No RETURNING.
// NOTE: `ip IN (...)` placeholder list dynamically built; maximal form (one).
type Q_IpCustCompany_Bump = `
    UPDATE ip
    SET customer_company_last_updated_at = NOW()
    WHERE ip IN ($1::inet)
`;
type _V_IpCustCompany_Bump = Expect<Equal<ValidateSQL<Q_IpCustCompany_Bump, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/ip-enrichment/src/updateIpEntity.ts
// ---------------------------------------------------------------------------

// Batch SELECT of IPs needing an entity.
// NOTE: `LIMIT ${BATCH_SIZE}` inlined (BATCH_SIZE = 500). `host(ip)` -> unknown.
type Q_IpEntity_Select = `
    SELECT host(ip) as ip,
        last_dns_log_match,
        last_tarpit_log_match
    FROM ip
    WHERE entity_id IS NULL
    ORDER BY entity_last_updated_at ASC NULLS FIRST
    LIMIT 500
`;
type _V_IpEntity_Select = Expect<Equal<ValidateSQL<Q_IpEntity_Select, S>, true>>;
type _R_IpEntity_Select = Expect<Equal<
    Simplify<GetReturnType<Q_IpEntity_Select, S>>,
    {
        ip: unknown;
        last_dns_log_match: S["schemas"]["public"]["ip"]["last_dns_log_match"];
        last_tarpit_log_match: S["schemas"]["public"]["ip"]["last_tarpit_log_match"];
    }
>>;

// entity_id lookup by CIDR.
// NOTE: `cidr IN (...)` list dynamically built; maximal form. `cidr::text` -> string.
type Q_IpEntity_Lookup = `
    SELECT cidr::text, entity_id
    FROM entity_cidr
    WHERE cidr IN ('10.0.0.0/8')
`;
type _V_IpEntity_Lookup = Expect<Equal<ValidateSQL<Q_IpEntity_Lookup, S>, true>>;
type _R_IpEntity_Lookup = Expect<Equal<
    Simplify<GetReturnType<Q_IpEntity_Lookup, S>>,
    {
        cidr: string;
        entity_id: S["schemas"]["public"]["entity_cidr"]["entity_id"];
    }
>>;

// UPDATE … FROM (VALUES …) AS source(ip, entity_id). No RETURNING.
// NOTE: VALUES placeholder list dynamically built; maximal form (one row).
type Q_IpEntity_Update = `
    UPDATE ip AS target
    SET entity_id = source.entity_id,
        entity_last_updated_at = NOW()
    FROM (VALUES ($1::inet, $2::uuid))
        AS source(ip, entity_id)
    WHERE target.ip = source.ip
`;
type _V_IpEntity_Update = Expect<Equal<ValidateSQL<Q_IpEntity_Update, S>, true>>;

// Timestamp bump for unmatched IPs (bumpEntityTimestamp). No RETURNING.
// NOTE: `ip IN (...)` placeholder list dynamically built; maximal form (one).
type Q_IpEntity_Bump = `
    UPDATE ip
    SET entity_last_updated_at = NOW()
    WHERE ip IN ($1::inet)
`;
type _V_IpEntity_Bump = Expect<Equal<ValidateSQL<Q_IpEntity_Bump, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/ip-enrichment/src/updateIpGeoCache.ts
// ---------------------------------------------------------------------------

// Batch SELECT of IPs ordered by stalest geo-cache entry.
// NOTE: `LIMIT ${BATCH_SIZE}` inlined (BATCH_SIZE = 500). `host(ip.ip)` -> unknown.
type Q_IpGeoCache_Select = `
    SELECT host(ip.ip) as ip
    FROM ip
    LEFT JOIN ip_geo_cache igc ON igc.ip = ip.ip
    ORDER BY igc.cached_at ASC NULLS FIRST
    LIMIT 500
`;
type _V_IpGeoCache_Select = Expect<Equal<ValidateSQL<Q_IpGeoCache_Select, S>, true>>;
type _R_IpGeoCache_Select = Expect<Equal<
    Simplify<GetReturnType<Q_IpGeoCache_Select, S>>,
    { ip: unknown }
>>;

// `SELECT * FROM ip_geo WHERE cidr IN (...)`.
// NOTE: `cidr IN (...)` list dynamically built; maximal form (one literal).
type Q_IpGeoCache_Geo = `
    SELECT * FROM ip_geo WHERE cidr IN ('10.0.0.0/8')
`;
type _V_IpGeoCache_Geo = Expect<Equal<ValidateSQL<Q_IpGeoCache_Geo, S>, true>>;
type _R_IpGeoCache_Geo = Expect<Equal<
    Simplify<GetReturnType<Q_IpGeoCache_Geo, S>>,
    Simplify<S["schemas"]["public"]["ip_geo"]>
>>;

// ---------------------------------------------------------------------------
// services/cron/stats/src/updateCompanyStats.ts
// ---------------------------------------------------------------------------

// WITH cte AS (aggregate over ip) INSERT … SELECT … ON CONFLICT DO UPDATE.
// No RETURNING.
type Q_CompanyStats = `
    WITH cte AS (
        SELECT customer_company_id,
            count(ip) AS victim_ip_count,
            max(last_tarpit_log_match) AS last_tarpit_log_match,
            max(last_dns_log_match) AS last_dns_log_match,
            sum(dns_log_counter) AS dns_log_count,
            sum(tarpit_log_counter) AS tarpit_log_count
        FROM ip
        WHERE customer_company_id IS NOT NULL
        GROUP BY customer_company_id
    )
    INSERT INTO company_stats
        (company_id, victim_ip_count, last_tarpit_log_match,
         last_dns_log_match, tarpit_log_count, dns_log_count)
    SELECT customer_company_id, victim_ip_count,
        last_tarpit_log_match, last_dns_log_match,
        tarpit_log_count, dns_log_count
    FROM cte
    ON CONFLICT (company_id) DO UPDATE SET
        victim_ip_count = EXCLUDED.victim_ip_count,
        last_tarpit_log_match = EXCLUDED.last_tarpit_log_match,
        last_dns_log_match = EXCLUDED.last_dns_log_match,
        tarpit_log_count = EXCLUDED.tarpit_log_count,
        dns_log_count = EXCLUDED.dns_log_count
`;
type _V_CompanyStats = Expect<Equal<ValidateSQL<Q_CompanyStats, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/stats/src/updateCompanyStatsIpCount.ts
// ---------------------------------------------------------------------------

// WITH cte AS (nested-CASE / inet-arithmetic count over company_addr) INSERT …
// SELECT … ON CONFLICT DO UPDATE. No RETURNING.
type Q_CompanyStatsIpCount = `
    WITH cte AS (
        SELECT company_id, sum(
            CASE WHEN family(addr) = 4
                THEN (hostmask(addr::cidr) - '0.0.0.0'::inet)::int8 + 1
            ELSE CASE WHEN masklen(addr) >= 96
                THEN (hostmask(addr::cidr) - '0:0:0:0:0:0:0:0'::inet)::int8 + 1
                ELSE 0 END
            END
        ) AS ip_count
        FROM company_addr
        GROUP BY company_id
    )
    INSERT INTO company_stats (company_id, ip_count)
    SELECT company_id, ip_count FROM cte
    ON CONFLICT (company_id) DO UPDATE SET
        ip_count = EXCLUDED.ip_count
`;
type _V_CompanyStatsIpCount = Expect<Equal<ValidateSQL<Q_CompanyStatsIpCount, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/stats/src/updateCompanyStatsThreatDomainCount.ts
// ---------------------------------------------------------------------------

// WITH cte AS (count(*) over company_report_threat_domain) INSERT … SELECT …
// ON CONFLICT DO UPDATE. No RETURNING.
type Q_CompanyStatsThreatDomainCount = `
    WITH cte AS (
        SELECT company_id, count(*) AS threat_domain_count
        FROM company_report_threat_domain
        GROUP BY company_id
    )
    INSERT INTO company_stats (company_id, threat_domain_count)
    SELECT company_id, threat_domain_count FROM cte
    ON CONFLICT (company_id) DO UPDATE SET
        threat_domain_count = EXCLUDED.threat_domain_count
`;
type _V_CompanyStatsThreatDomainCount = Expect<Equal<ValidateSQL<Q_CompanyStatsThreatDomainCount, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/stats/src/updateCountryStats.ts
// ---------------------------------------------------------------------------

// INSERT … SELECT (aggregate over ip GROUP BY country) ON CONFLICT DO UPDATE.
// No RETURNING.
type Q_CountryStats = `
    INSERT INTO country
        (country, ip_count, last_dns_log_match,
         last_tarpit_log_match, dns_log_count, tarpit_log_count)
    SELECT country, count(*),
        max(last_dns_log_match), max(last_tarpit_log_match),
        sum(dns_log_counter), sum(tarpit_log_counter)
    FROM ip
    WHERE country IS NOT NULL
    GROUP BY country
    ON CONFLICT (country) DO UPDATE SET
        ip_count = EXCLUDED.ip_count,
        last_dns_log_match = EXCLUDED.last_dns_log_match,
        last_tarpit_log_match = EXCLUDED.last_tarpit_log_match,
        dns_log_count = EXCLUDED.dns_log_count,
        tarpit_log_count = EXCLUDED.tarpit_log_count
`;
type _V_CountryStats = Expect<Equal<ValidateSQL<Q_CountryStats, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/stats/src/updateGeneralStatsDomainCount.ts
// ---------------------------------------------------------------------------

// UPDATE general_stats with scalar subqueries; one reads the pg_stat_user_tables
// catalog. No RETURNING.
// TODO(non-query): reads pg_stat_user_tables (PG statistics catalog), not a
//   modeled application table. Validated only; not in fixture by design.
// NOTE: literal `'Active'` / `'domain'` / `'public'` scrubbed-equivalent app
//   constants kept verbatim (non-sensitive).
type Q_GeneralStatsDomainCount = `
    UPDATE general_stats SET
        registered_domain_count = (
            SELECT n_live_tup FROM pg_stat_user_tables
            WHERE relname = 'domain' AND schemaname = 'public'
        ),
        active_registered_domain_count = (
            SELECT count(*) FROM domain WHERE status = 'Active'
        ),
        registrant_email_count = (
            SELECT count(*) FROM domain_registrant_email
        )
`;
type _V_GeneralStatsDomainCount = Expect<Equal<ValidateSQL<Q_GeneralStatsDomainCount, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/stats/src/updateGeneralStatsDomainIpCount.ts
// ---------------------------------------------------------------------------

// UPDATE general_stats with three count(*) scalar subqueries. No RETURNING.
type Q_GeneralStatsDomainIpCount = `
    UPDATE general_stats SET
        threat_domain_count = (SELECT count(*) FROM threat_domain),
        threat_count = (SELECT count(*) FROM threat_stats),
        ip_count = (SELECT count(*) FROM ip)
`;
type _V_GeneralStatsDomainIpCount = Expect<Equal<ValidateSQL<Q_GeneralStatsDomainIpCount, S>, true>>;

// ---------------------------------------------------------------------------
// services/cron/stats/src/updateGeneralStatsLogsCount.ts
// ---------------------------------------------------------------------------

// SELECT yesterday's date_counter row.
// NOTE: `current_date - 1` date arithmetic kept verbatim.
type Q_GeneralStatsLogs_Select = `SELECT dns_log_counter, tarpit_log_counter, new_ip_counter
    FROM date_counter WHERE date = current_date - 1`;
type _V_GeneralStatsLogs_Select = Expect<Equal<ValidateSQL<Q_GeneralStatsLogs_Select, S>, true>>;
type _R_GeneralStatsLogs_Select = Expect<Equal<
    Simplify<GetReturnType<Q_GeneralStatsLogs_Select, S>>,
    {
        dns_log_counter: S["schemas"]["public"]["date_counter"]["dns_log_counter"];
        tarpit_log_counter: S["schemas"]["public"]["date_counter"]["tarpit_log_counter"];
        new_ip_counter: S["schemas"]["public"]["date_counter"]["new_ip_counter"];
    }
>>;

// UPDATE general_stats from the fetched counters. No RETURNING.
type Q_GeneralStatsLogs_Update = `UPDATE general_stats SET
    dns_log_count = $1,
    tarpit_log_count = $2,
    new_ip_count = $3`;
type _V_GeneralStatsLogs_Update = Expect<Equal<ValidateSQL<Q_GeneralStatsLogs_Update, S>, true>>;

// A `Json` reference so the import is always used regardless of inference.
type _JsonUsed = Json | undefined;

export type CronEnrichmentStatsTestsPass = true;
