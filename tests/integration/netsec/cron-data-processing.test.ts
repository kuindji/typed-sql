/**
 * Netsec cron data-processing query coverage.
 *
 * Queries copied from the netsec app (services/cron/data-processing). Collection
 * pass: faithful coverage; red/unknown results are expected findings, not bugs.
 *
 * Both source files are pure bulk-DML pipelines: every site is an
 * `INSERT INTO <table> (...) VALUES ${sql} ON CONFLICT (...) DO UPDATE/NOTHING`
 * where `${sql}` is a runtime-assembled multi-row VALUES clause produced by
 * `valuesClause(rows, casts)`. There are NO `SELECT`, NO `RETURNING`, and NO
 * `new Select()` builder sites in either file.
 *
 * Extraction rules applied here:
 *  - `VALUES ${sql}` -> a single representative value row `($1::cast, $2, ...)`
 *    using the per-column `casts` array passed alongside each query (empty cast
 *    -> bare `$N`). Multi-row VALUES is runtime-only; one row is faithful to the
 *    emitted shape for a single input row.
 *  - `excluded.<col>` / `<table>.<col>` references in DO UPDATE are copied
 *    verbatim.
 *  - No RETURNING in any query -> `ValidateSQL` only (no `GetReturnType`).
 */
import type { ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

// ===========================================================================
// services/cron/data-processing/src/processDnsLogQueue.ts
// ===========================================================================

// 1. ip — casts [::inet, ::timestamptz, ::bigint, ::timestamptz]
type Q_Dns_Ip = `
        INSERT INTO ip
            (ip, last_dns_log_match, dns_log_counter,
             created_at)
        VALUES ($1::inet, $2::timestamptz, $3::bigint, $4::timestamptz)
        ON CONFLICT (ip) DO UPDATE SET
            last_dns_log_match =
                excluded.last_dns_log_match,
            dns_log_counter = ip.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_Ip = Expect<Equal<ValidateSQL<Q_Dns_Ip, S>, true>>;

// 2. threat_domain_variant — casts ["", ""] ; DO NOTHING
type Q_Dns_TdVariant = `
            INSERT INTO threat_domain_variant
                (domain, variant)
            VALUES ($1, $2)
            ON CONFLICT (domain, variant) DO NOTHING
        `;
type _V_Dns_TdVariant = Expect<Equal<ValidateSQL<Q_Dns_TdVariant, S>, true>>;

// 3. threat_domain — casts ["", ::timestamptz, ::bigint]
type Q_Dns_ThreatDomain = `
        INSERT INTO threat_domain
            (domain, last_dns_log_match, dns_log_counter)
        VALUES ($1, $2::timestamptz, $3::bigint)
        ON CONFLICT (domain) DO UPDATE SET
            last_dns_log_match =
                excluded.last_dns_log_match,
            dns_log_counter =
                threat_domain.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_ThreatDomain = Expect<Equal<ValidateSQL<Q_Dns_ThreatDomain, S>, true>>;

// 4. date_counter — casts [::date, ::bigint]
type Q_Dns_DateCounter = `
        INSERT INTO date_counter
            (date, dns_log_counter)
        VALUES ($1::date, $2::bigint)
        ON CONFLICT (date) DO UPDATE SET
            dns_log_counter =
                date_counter.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_DateCounter = Expect<Equal<ValidateSQL<Q_Dns_DateCounter, S>, true>>;

// 5. threat_date — casts [::date, "", ::bigint]
type Q_Dns_ThreatDate = `
        INSERT INTO threat_date
            (date, threat_id, dns_log_counter)
        VALUES ($1::date, $2, $3::bigint)
        ON CONFLICT (date, threat_id) DO UPDATE SET
            dns_log_counter =
                threat_date.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_ThreatDate = Expect<Equal<ValidateSQL<Q_Dns_ThreatDate, S>, true>>;

// 6. threat_domain_date — casts [::date, "", ::bigint]
type Q_Dns_ThreatDomainDate = `
        INSERT INTO threat_domain_date
            (date, domain, dns_log_counter)
        VALUES ($1::date, $2, $3::bigint)
        ON CONFLICT (date, domain) DO UPDATE SET
            dns_log_counter =
                threat_domain_date.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_ThreatDomainDate = Expect<Equal<ValidateSQL<Q_Dns_ThreatDomainDate, S>, true>>;

// 7. ip_date — casts [::date, ::inet, ::bigint]
type Q_Dns_IpDate = `
        INSERT INTO ip_date
            (date, ip, dns_log_counter)
        VALUES ($1::date, $2::inet, $3::bigint)
        ON CONFLICT (date, ip) DO UPDATE SET
            dns_log_counter = ip_date.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_IpDate = Expect<Equal<ValidateSQL<Q_Dns_IpDate, S>, true>>;

// 8. ip_last_hour — casts [::timestamptz, ::inet, ::bigint]
type Q_Dns_IpLastHour = `
        INSERT INTO ip_last_hour
            (time, ip, dns_log_counter)
        VALUES ($1::timestamptz, $2::inet, $3::bigint)
        ON CONFLICT (time, ip) DO UPDATE SET
            dns_log_counter =
                ip_last_hour.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_IpLastHour = Expect<Equal<ValidateSQL<Q_Dns_IpLastHour, S>, true>>;

// 9. ip_threat_domain — casts [::inet, "", ::timestamptz, ::bigint]
type Q_Dns_IpThreatDomain = `
        INSERT INTO ip_threat_domain
            (ip, domain, last_dns_log_match,
             dns_log_counter)
        VALUES ($1::inet, $2, $3::timestamptz, $4::bigint)
        ON CONFLICT (ip, domain) DO UPDATE SET
            last_dns_log_match =
                excluded.last_dns_log_match,
            dns_log_counter =
                ip_threat_domain.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_IpThreatDomain = Expect<Equal<ValidateSQL<Q_Dns_IpThreatDomain, S>, true>>;

// 10. ip_date_threat_domain — casts [::date, ::inet, "", ::bigint]
type Q_Dns_IpDateThreatDomain = `
        INSERT INTO ip_date_threat_domain
            (date, ip, domain, dns_log_counter)
        VALUES ($1::date, $2::inet, $3, $4::bigint)
        ON CONFLICT (date, ip, domain) DO UPDATE SET
            dns_log_counter =
                ip_date_threat_domain.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_IpDateThreatDomain = Expect<Equal<ValidateSQL<Q_Dns_IpDateThreatDomain, S>, true>>;

// 11. entity_counter — casts [::uuid, ::timestamptz, ::bigint]
type Q_Dns_EntityCounter = `
        INSERT INTO entity_counter
            (entity_id, dns_log_last_match,
             dns_log_counter)
        VALUES ($1::uuid, $2::timestamptz, $3::bigint)
        ON CONFLICT (entity_id) DO UPDATE SET
            dns_log_last_match =
                excluded.dns_log_last_match,
            dns_log_counter =
                entity_counter.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_EntityCounter = Expect<Equal<ValidateSQL<Q_Dns_EntityCounter, S>, true>>;

// 12. entity_date — casts [::date, ::uuid, ::bigint]
type Q_Dns_EntityDate = `
        INSERT INTO entity_date
            (date, entity_id, dns_log_counter)
        VALUES ($1::date, $2::uuid, $3::bigint)
        ON CONFLICT (date, entity_id) DO UPDATE SET
            dns_log_counter =
                entity_date.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_EntityDate = Expect<Equal<ValidateSQL<Q_Dns_EntityDate, S>, true>>;

// 13. threat_domain_country_date — casts [::date, "", ::char(2), ::bigint]
type Q_Dns_TdCountryDate = `
        INSERT INTO threat_domain_country_date
            (date, domain, country, dns_log_counter)
        VALUES ($1::date, $2, $3::char(2), $4::bigint)
        ON CONFLICT (date, domain, country) DO UPDATE SET
            dns_log_counter =
                threat_domain_country_date.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_TdCountryDate = Expect<Equal<ValidateSQL<Q_Dns_TdCountryDate, S>, true>>;

// 14. threat_stats — casts ["", ::timestamptz, ::bigint]
type Q_Dns_ThreatStats = `
        INSERT INTO threat_stats
            (threat_id, last_dns_log_match,
             dns_log_counter)
        VALUES ($1, $2::timestamptz, $3::bigint)
        ON CONFLICT (threat_id) DO UPDATE SET
            last_dns_log_match =
                excluded.last_dns_log_match,
            dns_log_counter =
                threat_stats.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_ThreatStats = Expect<Equal<ValidateSQL<Q_Dns_ThreatStats, S>, true>>;

// 15. ip_company_date — casts [::uuid, ::date, ::inet, ::bigint]
type Q_Dns_IpCompanyDate = `
        INSERT INTO ip_company_date
            (company_id, date, ip, dns_log_counter)
        VALUES ($1::uuid, $2::date, $3::inet, $4::bigint)
        ON CONFLICT (company_id, date, ip) DO UPDATE SET
            dns_log_counter =
                ip_company_date.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_IpCompanyDate = Expect<Equal<ValidateSQL<Q_Dns_IpCompanyDate, S>, true>>;

// 16. entity_threat_domain — casts [::uuid, "", ::timestamptz, ::timestamptz, ::bigint]
type Q_Dns_EntityThreatDomain = `
        INSERT INTO entity_threat_domain
            (entity_id, domain, first_dns_log_match,
             last_dns_log_match, dns_log_counter)
        VALUES ($1::uuid, $2, $3::timestamptz, $4::timestamptz, $5::bigint)
        ON CONFLICT (entity_id, domain) DO UPDATE SET
            last_dns_log_match =
                excluded.last_dns_log_match,
            dns_log_counter =
                entity_threat_domain.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_EntityThreatDomain = Expect<Equal<ValidateSQL<Q_Dns_EntityThreatDomain, S>, true>>;

// 17. company_report_date — casts [::date, ::uuid, ::bigint]
type Q_Dns_CompanyReportDate = `
        INSERT INTO company_report_date
            (date, company_id, dns_log_counter)
        VALUES ($1::date, $2::uuid, $3::bigint)
        ON CONFLICT (date, company_id) DO UPDATE SET
            dns_log_counter =
                company_report_date.dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_CompanyReportDate = Expect<Equal<ValidateSQL<Q_Dns_CompanyReportDate, S>, true>>;

// 18. company_report_threat — casts [::uuid, "", ::bigint, ::timestamptz]
type Q_Dns_CompanyReportThreat = `
        INSERT INTO company_report_threat
            (company_id, threat_id, dns_log_count,
             last_dns_log_match)
        VALUES ($1::uuid, $2, $3::bigint, $4::timestamptz)
        ON CONFLICT (company_id, threat_id) DO UPDATE SET
            dns_log_count =
                company_report_threat.dns_log_count
                + excluded.dns_log_count,
            last_dns_log_match =
                excluded.last_dns_log_match
    `;
type _V_Dns_CompanyReportThreat = Expect<Equal<ValidateSQL<Q_Dns_CompanyReportThreat, S>, true>>;

// 19. company_report_threat_domain — casts [::uuid, "", ::timestamptz, ::bigint]
type Q_Dns_CompanyReportThreatDomain = `
        INSERT INTO company_report_threat_domain
            (company_id, domain, last_dns_log_match,
             dns_log_counter)
        VALUES ($1::uuid, $2, $3::timestamptz, $4::bigint)
        ON CONFLICT (company_id, domain) DO UPDATE SET
            last_dns_log_match =
                excluded.last_dns_log_match,
            dns_log_counter =
                company_report_threat_domain
                    .dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_CompanyReportThreatDomain = Expect<Equal<ValidateSQL<Q_Dns_CompanyReportThreatDomain, S>, true>>;

// 20. company_report_threat_domain_date — casts [::uuid, ::date, "", ::bigint]
type Q_Dns_CompanyReportTdDate = `
        INSERT INTO company_report_threat_domain_date
            (company_id, date, domain, dns_log_counter)
        VALUES ($1::uuid, $2::date, $3, $4::bigint)
        ON CONFLICT (company_id, date, domain)
            DO UPDATE SET
            dns_log_counter =
                company_report_threat_domain_date
                    .dns_log_counter
                + excluded.dns_log_counter
    `;
type _V_Dns_CompanyReportTdDate = Expect<Equal<ValidateSQL<Q_Dns_CompanyReportTdDate, S>, true>>;

// 21. company_country_date — casts [::uuid, ::date, ::char(2), ::bigint]
type Q_Dns_CompanyCountryDate = `
        INSERT INTO company_country_date
            (company_id, date, country, dns_log_count)
        VALUES ($1::uuid, $2::date, $3::char(2), $4::bigint)
        ON CONFLICT (company_id, date, country)
            DO UPDATE SET
            dns_log_count =
                company_country_date.dns_log_count
                + excluded.dns_log_count
    `;
type _V_Dns_CompanyCountryDate = Expect<Equal<ValidateSQL<Q_Dns_CompanyCountryDate, S>, true>>;

// 22. country_date — casts [::date, ::char(2), ::bigint]
type Q_Dns_CountryDate = `
        INSERT INTO country_date
            (date, country, dns_log_count)
        VALUES ($1::date, $2::char(2), $3::bigint)
        ON CONFLICT (date, country) DO UPDATE SET
            dns_log_count =
                country_date.dns_log_count
                + excluded.dns_log_count
    `;
type _V_Dns_CountryDate = Expect<Equal<ValidateSQL<Q_Dns_CountryDate, S>, true>>;

// ===========================================================================
// services/cron/data-processing/src/processTarpitLogQueue.ts
// ===========================================================================

// 1. ip — casts [::inet, ::timestamptz, ::bigint, ::timestamptz]
type Q_Tarpit_Ip = `
            INSERT INTO ip
                (ip, last_tarpit_log_match,
                 tarpit_log_counter, created_at)
            VALUES ($1::inet, $2::timestamptz, $3::bigint, $4::timestamptz)
            ON CONFLICT (ip) DO UPDATE SET
                last_tarpit_log_match =
                    excluded.last_tarpit_log_match,
                tarpit_log_counter =
                    ip.tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_Ip = Expect<Equal<ValidateSQL<Q_Tarpit_Ip, S>, true>>;

// 2. date_counter — casts [::date, ::bigint]
type Q_Tarpit_DateCounter = `
        INSERT INTO date_counter
            (date, tarpit_log_counter)
        VALUES ($1::date, $2::bigint)
        ON CONFLICT (date) DO UPDATE SET
            tarpit_log_counter =
                date_counter.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_DateCounter = Expect<Equal<ValidateSQL<Q_Tarpit_DateCounter, S>, true>>;

// 3. threat_domain — casts ["", ::timestamptz, ::bigint]
type Q_Tarpit_ThreatDomain = `
        INSERT INTO threat_domain
            (domain, last_tarpit_log_match,
             tarpit_log_counter)
        VALUES ($1, $2::timestamptz, $3::bigint)
        ON CONFLICT (domain) DO UPDATE SET
            last_tarpit_log_match =
                excluded.last_tarpit_log_match,
            tarpit_log_counter =
                threat_domain.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_ThreatDomain = Expect<Equal<ValidateSQL<Q_Tarpit_ThreatDomain, S>, true>>;

// 4. threat_date — casts [::date, "", ::bigint]
type Q_Tarpit_ThreatDate = `
        INSERT INTO threat_date
            (date, threat_id, tarpit_log_counter)
        VALUES ($1::date, $2, $3::bigint)
        ON CONFLICT (date, threat_id) DO UPDATE SET
            tarpit_log_counter =
                threat_date.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_ThreatDate = Expect<Equal<ValidateSQL<Q_Tarpit_ThreatDate, S>, true>>;

// 5. threat_domain_date — casts [::date, "", ::bigint]
type Q_Tarpit_ThreatDomainDate = `
        INSERT INTO threat_domain_date
            (date, domain, tarpit_log_counter)
        VALUES ($1::date, $2, $3::bigint)
        ON CONFLICT (date, domain) DO UPDATE SET
            tarpit_log_counter =
                threat_domain_date.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_ThreatDomainDate = Expect<Equal<ValidateSQL<Q_Tarpit_ThreatDomainDate, S>, true>>;

// 6. threat_stats — casts ["", ::timestamptz, ::bigint]
type Q_Tarpit_ThreatStats = `
        INSERT INTO threat_stats
            (threat_id, last_tarpit_log_match,
             tarpit_log_counter)
        VALUES ($1, $2::timestamptz, $3::bigint)
        ON CONFLICT (threat_id) DO UPDATE SET
            last_tarpit_log_match =
                excluded.last_tarpit_log_match,
            tarpit_log_counter =
                threat_stats.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_ThreatStats = Expect<Equal<ValidateSQL<Q_Tarpit_ThreatStats, S>, true>>;

// 7. threat_domain_country_date — casts [::date, "", ::char(2), ::bigint]
type Q_Tarpit_TdCountryDate = `
        INSERT INTO threat_domain_country_date
            (date, domain, country,
             tarpit_log_counter)
        VALUES ($1::date, $2, $3::char(2), $4::bigint)
        ON CONFLICT (date, domain, country)
            DO UPDATE SET
            tarpit_log_counter =
                threat_domain_country_date
                    .tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_TdCountryDate = Expect<Equal<ValidateSQL<Q_Tarpit_TdCountryDate, S>, true>>;

// 8. ip_date (direct) — casts [::date, ::inet, ::bigint]
type Q_Tarpit_IpDate = `
        INSERT INTO ip_date
            (date, ip, tarpit_log_counter)
        VALUES ($1::date, $2::inet, $3::bigint)
        ON CONFLICT (date, ip) DO UPDATE SET
            tarpit_log_counter =
                ip_date.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_IpDate = Expect<Equal<ValidateSQL<Q_Tarpit_IpDate, S>, true>>;

// 9. ip_date (fwd) — identical text/casts to #8 (forwarded-ip variant)
type Q_Tarpit_IpDateFwd = `
            INSERT INTO ip_date
                (date, ip, tarpit_log_counter)
            VALUES ($1::date, $2::inet, $3::bigint)
            ON CONFLICT (date, ip) DO UPDATE SET
                tarpit_log_counter =
                    ip_date.tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_IpDateFwd = Expect<Equal<ValidateSQL<Q_Tarpit_IpDateFwd, S>, true>>;

// 10. ip_last_hour (direct) — casts [::timestamptz, ::inet, ::bigint]
type Q_Tarpit_IpLastHour = `
        INSERT INTO ip_last_hour
            (time, ip, tarpit_log_counter)
        VALUES ($1::timestamptz, $2::inet, $3::bigint)
        ON CONFLICT (time, ip) DO UPDATE SET
            tarpit_log_counter =
                ip_last_hour.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_IpLastHour = Expect<Equal<ValidateSQL<Q_Tarpit_IpLastHour, S>, true>>;

// 11. ip_last_hour (fwd) — identical text/casts to #10
type Q_Tarpit_IpLastHourFwd = `
            INSERT INTO ip_last_hour
                (time, ip, tarpit_log_counter)
            VALUES ($1::timestamptz, $2::inet, $3::bigint)
            ON CONFLICT (time, ip) DO UPDATE SET
                tarpit_log_counter =
                    ip_last_hour.tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_IpLastHourFwd = Expect<Equal<ValidateSQL<Q_Tarpit_IpLastHourFwd, S>, true>>;

// 12. entity_counter — casts [::uuid, ::timestamptz, ::bigint]
type Q_Tarpit_EntityCounter = `
        INSERT INTO entity_counter
            (entity_id, tarpit_log_last_match,
             tarpit_log_counter)
        VALUES ($1::uuid, $2::timestamptz, $3::bigint)
        ON CONFLICT (entity_id) DO UPDATE SET
            tarpit_log_last_match =
                excluded.tarpit_log_last_match,
            tarpit_log_counter =
                entity_counter.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_EntityCounter = Expect<Equal<ValidateSQL<Q_Tarpit_EntityCounter, S>, true>>;

// 13. entity_date — casts [::date, ::uuid, ::bigint]
type Q_Tarpit_EntityDate = `
        INSERT INTO entity_date
            (date, entity_id, tarpit_log_counter)
        VALUES ($1::date, $2::uuid, $3::bigint)
        ON CONFLICT (date, entity_id) DO UPDATE SET
            tarpit_log_counter =
                entity_date.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_EntityDate = Expect<Equal<ValidateSQL<Q_Tarpit_EntityDate, S>, true>>;

// 14. entity_threat_domain — casts [::uuid, "", ::timestamptz, ::bigint]
type Q_Tarpit_EntityThreatDomain = `
        INSERT INTO entity_threat_domain
            (entity_id, domain,
             last_tarpit_log_match,
             tarpit_log_counter)
        VALUES ($1::uuid, $2, $3::timestamptz, $4::bigint)
        ON CONFLICT (entity_id, domain) DO UPDATE SET
            last_tarpit_log_match =
                excluded.last_tarpit_log_match,
            tarpit_log_counter =
                entity_threat_domain
                    .tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_EntityThreatDomain = Expect<Equal<ValidateSQL<Q_Tarpit_EntityThreatDomain, S>, true>>;

// 15. ip_company_date (direct) — casts [::uuid, ::date, ::inet, ::bigint]
type Q_Tarpit_IpCompanyDate = `
        INSERT INTO ip_company_date
            (company_id, date, ip,
             tarpit_log_counter)
        VALUES ($1::uuid, $2::date, $3::inet, $4::bigint)
        ON CONFLICT (company_id, date, ip) DO UPDATE SET
            tarpit_log_counter =
                ip_company_date.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_IpCompanyDate = Expect<Equal<ValidateSQL<Q_Tarpit_IpCompanyDate, S>, true>>;

// 16. ip_company_date (fwd) — identical text/casts to #15
type Q_Tarpit_IpCompanyDateFwd = `
            INSERT INTO ip_company_date
                (company_id, date, ip,
                 tarpit_log_counter)
            VALUES ($1::uuid, $2::date, $3::inet, $4::bigint)
            ON CONFLICT (company_id, date, ip)
                DO UPDATE SET
                tarpit_log_counter =
                    ip_company_date
                        .tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_IpCompanyDateFwd = Expect<Equal<ValidateSQL<Q_Tarpit_IpCompanyDateFwd, S>, true>>;

// 17. ip_threat_domain (direct) — casts [::inet, "", ::timestamptz, ::bigint]
type Q_Tarpit_IpThreatDomain = `
        INSERT INTO ip_threat_domain
            (ip, domain, last_tarpit_log_match,
             tarpit_log_counter)
        VALUES ($1::inet, $2, $3::timestamptz, $4::bigint)
        ON CONFLICT (ip, domain) DO UPDATE SET
            last_tarpit_log_match =
                excluded.last_tarpit_log_match,
            tarpit_log_counter =
                ip_threat_domain.tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_IpThreatDomain = Expect<Equal<ValidateSQL<Q_Tarpit_IpThreatDomain, S>, true>>;

// 18. ip_threat_domain (fwd) — identical text/casts to #17
type Q_Tarpit_IpThreatDomainFwd = `
            INSERT INTO ip_threat_domain
                (ip, domain,
                 last_tarpit_log_match,
                 tarpit_log_counter)
            VALUES ($1::inet, $2, $3::timestamptz, $4::bigint)
            ON CONFLICT (ip, domain) DO UPDATE SET
                last_tarpit_log_match =
                    excluded.last_tarpit_log_match,
                tarpit_log_counter =
                    ip_threat_domain
                        .tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_IpThreatDomainFwd = Expect<Equal<ValidateSQL<Q_Tarpit_IpThreatDomainFwd, S>, true>>;

// 19. ip_date_threat_domain (direct) — casts [::date, ::inet, "", ::bigint]
type Q_Tarpit_IpDateThreatDomain = `
        INSERT INTO ip_date_threat_domain
            (date, ip, domain,
             tarpit_log_counter)
        VALUES ($1::date, $2::inet, $3, $4::bigint)
        ON CONFLICT (date, ip, domain) DO UPDATE SET
            tarpit_log_counter =
                ip_date_threat_domain
                    .tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_IpDateThreatDomain = Expect<Equal<ValidateSQL<Q_Tarpit_IpDateThreatDomain, S>, true>>;

// 20. ip_date_threat_domain (fwd) — identical text/casts to #19
type Q_Tarpit_IpDateThreatDomainFwd = `
            INSERT INTO ip_date_threat_domain
                (date, ip, domain,
                 tarpit_log_counter)
            VALUES ($1::date, $2::inet, $3, $4::bigint)
            ON CONFLICT (date, ip, domain)
                DO UPDATE SET
                tarpit_log_counter =
                    ip_date_threat_domain
                        .tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_IpDateThreatDomainFwd = Expect<Equal<ValidateSQL<Q_Tarpit_IpDateThreatDomainFwd, S>, true>>;

// 21. company_report_date (direct) — casts [::date, ::uuid, ::bigint]
type Q_Tarpit_CompanyReportDate = `
        INSERT INTO company_report_date
            (date, company_id, tarpit_log_counter)
        VALUES ($1::date, $2::uuid, $3::bigint)
        ON CONFLICT (date, company_id) DO UPDATE SET
            tarpit_log_counter =
                company_report_date
                    .tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_CompanyReportDate = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyReportDate, S>, true>>;

// 22. company_report_date (fwd) — identical text/casts to #21
type Q_Tarpit_CompanyReportDateFwd = `
            INSERT INTO company_report_date
                (date, company_id,
                 tarpit_log_counter)
            VALUES ($1::date, $2::uuid, $3::bigint)
            ON CONFLICT (date, company_id)
                DO UPDATE SET
                tarpit_log_counter =
                    company_report_date
                        .tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_CompanyReportDateFwd = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyReportDateFwd, S>, true>>;

// 23. company_report_threat (direct) — casts [::uuid, "", ::bigint, ::timestamptz]
type Q_Tarpit_CompanyReportThreat = `
        INSERT INTO company_report_threat
            (company_id, threat_id,
             tarpit_log_count,
             last_tarpit_log_match)
        VALUES ($1::uuid, $2, $3::bigint, $4::timestamptz)
        ON CONFLICT (company_id, threat_id)
            DO UPDATE SET
            tarpit_log_count =
                company_report_threat
                    .tarpit_log_count
                + excluded.tarpit_log_count,
            last_tarpit_log_match =
                excluded.last_tarpit_log_match
    `;
type _V_Tarpit_CompanyReportThreat = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyReportThreat, S>, true>>;

// 24. company_report_threat (fwd) — identical text/casts to #23
type Q_Tarpit_CompanyReportThreatFwd = `
            INSERT INTO company_report_threat
                (company_id, threat_id,
                 tarpit_log_count,
                 last_tarpit_log_match)
            VALUES ($1::uuid, $2, $3::bigint, $4::timestamptz)
            ON CONFLICT (company_id, threat_id)
                DO UPDATE SET
                tarpit_log_count =
                    company_report_threat
                        .tarpit_log_count
                    + excluded.tarpit_log_count,
                last_tarpit_log_match =
                    excluded.last_tarpit_log_match
        `;
type _V_Tarpit_CompanyReportThreatFwd = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyReportThreatFwd, S>, true>>;

// 25. company_report_threat_domain (direct) — casts [::uuid, "", ::timestamptz, ::bigint]
type Q_Tarpit_CompanyReportThreatDomain = `
        INSERT INTO company_report_threat_domain
            (company_id, domain,
             last_tarpit_log_match,
             tarpit_log_counter)
        VALUES ($1::uuid, $2, $3::timestamptz, $4::bigint)
        ON CONFLICT (company_id, domain) DO UPDATE SET
            last_tarpit_log_match =
                excluded.last_tarpit_log_match,
            tarpit_log_counter =
                company_report_threat_domain
                    .tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_CompanyReportThreatDomain = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyReportThreatDomain, S>, true>>;

// 26. company_report_threat_domain (fwd) — identical text/casts to #25
type Q_Tarpit_CompanyReportThreatDomainFwd = `
            INSERT INTO company_report_threat_domain
                (company_id, domain,
                 last_tarpit_log_match,
                 tarpit_log_counter)
            VALUES ($1::uuid, $2, $3::timestamptz, $4::bigint)
            ON CONFLICT (company_id, domain)
                DO UPDATE SET
                last_tarpit_log_match =
                    excluded.last_tarpit_log_match,
                tarpit_log_counter =
                    company_report_threat_domain
                        .tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_CompanyReportThreatDomainFwd = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyReportThreatDomainFwd, S>, true>>;

// 27. company_report_threat_domain_date (direct) — casts [::uuid, ::date, "", ::bigint]
type Q_Tarpit_CompanyReportTdDate = `
        INSERT INTO company_report_threat_domain_date
            (company_id, date, domain,
             tarpit_log_counter)
        VALUES ($1::uuid, $2::date, $3, $4::bigint)
        ON CONFLICT (company_id, date, domain)
            DO UPDATE SET
            tarpit_log_counter =
                company_report_threat_domain_date
                    .tarpit_log_counter
                + excluded.tarpit_log_counter
    `;
type _V_Tarpit_CompanyReportTdDate = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyReportTdDate, S>, true>>;

// 28. company_report_threat_domain_date (fwd) — identical text/casts to #27
type Q_Tarpit_CompanyReportTdDateFwd = `
            INSERT INTO company_report_threat_domain_date
                (company_id, date, domain,
                 tarpit_log_counter)
            VALUES ($1::uuid, $2::date, $3, $4::bigint)
            ON CONFLICT (company_id, date, domain)
                DO UPDATE SET
                tarpit_log_counter =
                    company_report_threat_domain_date
                        .tarpit_log_counter
                    + excluded.tarpit_log_counter
        `;
type _V_Tarpit_CompanyReportTdDateFwd = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyReportTdDateFwd, S>, true>>;

// 29. ip_tarpit_port (direct) — casts [::inet, ::integer, ::timestamptz, ::timestamptz, ::bigint]
type Q_Tarpit_IpTarpitPort = `
        INSERT INTO ip_tarpit_port
            (ip, port, first_occurence,
             last_occurence, occurences)
        VALUES ($1::inet, $2::integer, $3::timestamptz, $4::timestamptz, $5::bigint)
        ON CONFLICT (ip, port) DO UPDATE SET
            occurences = ip_tarpit_port.occurences
                + excluded.occurences,
            last_occurence =
                excluded.last_occurence
    `;
type _V_Tarpit_IpTarpitPort = Expect<Equal<ValidateSQL<Q_Tarpit_IpTarpitPort, S>, true>>;

// 30. ip_tarpit_port (fwd) — identical text/casts to #29
type Q_Tarpit_IpTarpitPortFwd = `
            INSERT INTO ip_tarpit_port
                (ip, port, first_occurence,
                 last_occurence, occurences)
            VALUES ($1::inet, $2::integer, $3::timestamptz, $4::timestamptz, $5::bigint)
            ON CONFLICT (ip, port) DO UPDATE SET
                occurences =
                    ip_tarpit_port.occurences
                    + excluded.occurences,
                last_occurence =
                    excluded.last_occurence
        `;
type _V_Tarpit_IpTarpitPortFwd = Expect<Equal<ValidateSQL<Q_Tarpit_IpTarpitPortFwd, S>, true>>;

// 31. company_country_date (direct) — casts [::uuid, ::date, ::char(2), ::bigint]
type Q_Tarpit_CompanyCountryDate = `
        INSERT INTO company_country_date
            (company_id, date, country,
             tarpit_log_count)
        VALUES ($1::uuid, $2::date, $3::char(2), $4::bigint)
        ON CONFLICT (company_id, date, country)
            DO UPDATE SET
            tarpit_log_count =
                company_country_date.tarpit_log_count
                + excluded.tarpit_log_count
    `;
type _V_Tarpit_CompanyCountryDate = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyCountryDate, S>, true>>;

// 32. company_country_date (fwd) — identical text/casts to #31
type Q_Tarpit_CompanyCountryDateFwd = `
            INSERT INTO company_country_date
                (company_id, date, country,
                 tarpit_log_count)
            VALUES ($1::uuid, $2::date, $3::char(2), $4::bigint)
            ON CONFLICT (company_id, date, country)
                DO UPDATE SET
                tarpit_log_count =
                    company_country_date
                        .tarpit_log_count
                    + excluded.tarpit_log_count
        `;
type _V_Tarpit_CompanyCountryDateFwd = Expect<Equal<ValidateSQL<Q_Tarpit_CompanyCountryDateFwd, S>, true>>;

// 33. country_date — casts [::date, ::char(2), ::bigint]
type Q_Tarpit_CountryDate = `
        INSERT INTO country_date
            (date, country, tarpit_log_count)
        VALUES ($1::date, $2::char(2), $3::bigint)
        ON CONFLICT (date, country) DO UPDATE SET
            tarpit_log_count =
                country_date.tarpit_log_count
                + excluded.tarpit_log_count
    `;
type _V_Tarpit_CountryDate = Expect<Equal<ValidateSQL<Q_Tarpit_CountryDate, S>, true>>;

// A `Json` reference so the import is always used regardless of inference.
type _JsonUsed = Json | undefined;

export type CronDataProcessingTestsPass = true;
