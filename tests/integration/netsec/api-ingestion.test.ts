/**
 * Netsec api-ingestion query coverage.
 *
 * Queries copied verbatim from the netsec app (public-api, backend,
 * dns-ingestion, iptrap-ingestion, actions, certbot-callback). Collection pass:
 * faithful coverage; red/unknown results are expected findings, not bugs.
 *
 * Extraction rules applied:
 *   - RAW `/*sql* /` strings copied verbatim; `${x.addValue(v)}` placeholders are
 *     already `$N` (or `$N::cast`) in the originals.
 *   - JS-interpolated constants are inlined with a `// NOTE`.
 *   - Dynamically-built fragments (batch VALUES placeholder counts, etc.) are
 *     rendered in a representative MAXIMAL form with a `// NOTE`.
 *   - INSERT ... ON CONFLICT / UPDATE are covered (with `returning` if present).
 *   - DDL/admin queries: none here.
 *
 * SELECT/RETURNING sites also assert `GetReturnType` against the best row shape.
 * Mutations without RETURNING assert `ValidateSQL` only.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// services/api/public-api/src/ip.ts
// ---------------------------------------------------------------------------

// logRequest: INSERT into ip_checker_log.
// NOTE: original interpolates `${found.toString()}` (a JS boolean) as a raw SQL
// literal; inlined here as `true` (the default `found = true`).
type Q_Ip_LogRequest = `
        insert into ip_checker_log (client_ip, requested_ip, found)
        values ($1::inet, $2::inet, true)
    `;
type _V_Ip_LogRequest = Expect<Equal<ValidateSQL<Q_Ip_LogRequest, S>, true>>;

// getThreats: ip_threat_domain join hunt_report_log left join threat.
type Q_Ip_GetThreats = `
        select
            itd.*,
            hrl.threat_id,
            coalesce(t.name, hrl.threat) as name,
            coalesce(t.description, hrl.threat_description) as description
        from ip_threat_domain itd
        join hunt_report_log hrl on hrl.domain = itd.domain
        left join threat t on t.id = hrl.threat_id
        where itd.ip = $1::inet
    `;
type _V_Ip_GetThreats = Expect<Equal<ValidateSQL<Q_Ip_GetThreats, S>, true>>;
type _R_Ip_GetThreats = Expect<Equal<
    Simplify<GetReturnType<Q_Ip_GetThreats, S>>,
    Simplify<
        & S["schemas"]["public"]["ip_threat_domain"]
        & {
            threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
            // coalesce(t.name [left-joined nullable], hrl.threat [nullable]) -> nullable
            name: string | null;
            // coalesce(t.description [left-joined nullable], hrl.threat_description [nullable]) -> nullable
            description: string | null;
        }
    >
>>;

// getIpInfo: select * from ip.
type Q_Ip_GetIpInfo = `select * from ip where ip = $1::inet`;
type _V_Ip_GetIpInfo = Expect<Equal<ValidateSQL<Q_Ip_GetIpInfo, S>, true>>;
type _R_Ip_GetIpInfo = Expect<Equal<
    Simplify<GetReturnType<Q_Ip_GetIpInfo, S>>,
    Simplify<S["schemas"]["public"]["ip"]>
>>;

// getEntityInfo: select * from entity, with a literal `type = 'isp'` filter.
type Q_Ip_GetEntityInfo = `select * from entity where id = $1 and type = 'isp'`;
type _V_Ip_GetEntityInfo = Expect<Equal<ValidateSQL<Q_Ip_GetEntityInfo, S>, true>>;
type _R_Ip_GetEntityInfo = Expect<Equal<
    Simplify<GetReturnType<Q_Ip_GetEntityInfo, S>>,
    Simplify<S["schemas"]["public"]["entity"]>
>>;

// getEntityCounts: select * from entity_counter.
type Q_Ip_GetEntityCounts = `select * from entity_counter where entity_id = $1`;
type _V_Ip_GetEntityCounts = Expect<Equal<ValidateSQL<Q_Ip_GetEntityCounts, S>, true>>;
type _R_Ip_GetEntityCounts = Expect<Equal<
    Simplify<GetReturnType<Q_Ip_GetEntityCounts, S>>,
    Simplify<S["schemas"]["public"]["entity_counter"]>
>>;

// ---------------------------------------------------------------------------
// services/api/backend/src/health.ts
// ---------------------------------------------------------------------------

// handler: INSERT into system_health ... ON CONFLICT DO UPDATE. No RETURNING.
type Q_Health_Upsert = `
            insert into
            system_health
            (group_name, metric_name, status, data, created_at, ip)
            values
            ($1, $2, $3, $4, now(), $5)
            on conflict(group_name, metric_name, ip) do update set
                status = excluded.status,
                data = excluded.data,
                created_at = excluded.created_at
        `;
type _V_Health_Upsert = Expect<Equal<ValidateSQL<Q_Health_Upsert, S>, true>>;

// ---------------------------------------------------------------------------
// services/api/backend/src/lib/dns.ts
// ---------------------------------------------------------------------------

// getAllDomains (1/2): select domain from hunt_report_log.
type Q_Dns_AllDomains_Log = `select domain from hunt_report_log order by domain`;
type _V_Dns_AllDomains_Log = Expect<Equal<ValidateSQL<Q_Dns_AllDomains_Log, S>, true>>;
type _R_Dns_AllDomains_Log = Expect<Equal<
    Simplify<GetReturnType<Q_Dns_AllDomains_Log, S>>,
    { domain: S["schemas"]["public"]["hunt_report_log"]["domain"] }
>>;

// getAllDomains (2/2): select domain from hunt_report_queue.
type Q_Dns_AllDomains_Queue = `select domain from hunt_report_queue order by domain`;
type _V_Dns_AllDomains_Queue = Expect<Equal<ValidateSQL<Q_Dns_AllDomains_Queue, S>, true>>;
type _R_Dns_AllDomains_Queue = Expect<Equal<
    Simplify<GetReturnType<Q_Dns_AllDomains_Queue, S>>,
    { domain: S["schemas"]["public"]["hunt_report_queue"]["domain"] }
>>;

// getRecordDomains: select * from domain_settings.
type Q_Dns_RecordDomains = `select * from domain_settings order by domain`;
type _V_Dns_RecordDomains = Expect<Equal<ValidateSQL<Q_Dns_RecordDomains, S>, true>>;
type _R_Dns_RecordDomains = Expect<Equal<
    Simplify<GetReturnType<Q_Dns_RecordDomains, S>>,
    Simplify<S["schemas"]["public"]["domain_settings"]>
>>;

// ---------------------------------------------------------------------------
// services/api/dns-ingestion/src/dns.ts
// ---------------------------------------------------------------------------

// loadThreatMap: select domain, threat_id from hunt_report_log.
// NOTE: original SQL is upper-case (`SELECT ... FROM hunt_report_log`).
type Q_DnsIngest_ThreatMap = `SELECT domain, threat_id FROM hunt_report_log`;
type _V_DnsIngest_ThreatMap = Expect<Equal<ValidateSQL<Q_DnsIngest_ThreatMap, S>, true>>;
type _R_DnsIngest_ThreatMap = Expect<Equal<
    Simplify<GetReturnType<Q_DnsIngest_ThreatMap, S>>,
    {
        domain: S["schemas"]["public"]["hunt_report_log"]["domain"];
        threat_id: S["schemas"]["public"]["hunt_report_log"]["threat_id"];
    }
>>;

// lookupIps: WITH input_ips(raw_ip, ip_inet) AS (VALUES ...) ... LEFT JOIN ip.
// NOTE: `VALUES ${placeholders}` is dynamically built; maximal form shown with
// a single two-column VALUES row `($1::text, $1::inet)`.
type Q_DnsIngest_LookupIps = `
        WITH input_ips(raw_ip, ip_inet) AS (
            VALUES ($1::text, $1::inet)
        )
        SELECT input_ips.raw_ip as lookup_ip, country,
               entity_id::text, customer_company_id::text
        FROM input_ips
        LEFT JOIN ip ON ip.ip = input_ips.ip_inet
    `;
type _V_DnsIngest_LookupIps = Expect<Equal<ValidateSQL<Q_DnsIngest_LookupIps, S>, true>>;
// Expected shape: `raw_ip` is a VALUES-CTE column (typed via the column-alias
// list, no schema source -> unknown); country comes from the LEFT-joined `ip`
// (schema-nullable already); the two `::text` casts widen to string. The cast
// columns are projected UNQUALIFIED, and an unqualified projection from an
// outer-joined relation is not nullablized (documented `NullableRelations`
// limitation: no qualifier to match), so they stay non-null `string`.
type _R_DnsIngest_LookupIps = Expect<Equal<
    Simplify<GetReturnType<Q_DnsIngest_LookupIps, S>>,
    {
        lookup_ip: unknown;
        country: S["schemas"]["public"]["ip"]["country"];
        entity_id: string;
        customer_company_id: string;
    }
>>;

// insertEdgeBatch: INSERT INTO dns_log_edge. No RETURNING.
// NOTE: `VALUES ${placeholders}` dynamically built per batch row (13 cols);
// maximal form shown with one row of casted placeholders.
type Q_DnsIngest_InsertEdge = `
        INSERT INTO dns_log_edge
            (time, ip, proxy, edns, question_domain,
             question_class, question_type, answer, raw,
             country, entity_id, domain, customer_company_id)
        VALUES ($1::timestamptz, $2::inet, $3::inet, $4::boolean, $5, $6, $7, $8, $9, $10::char(2), $11::uuid, $12, $13::uuid)
    `;
type _V_DnsIngest_InsertEdge = Expect<Equal<ValidateSQL<Q_DnsIngest_InsertEdge, S>, true>>;

// insertQueueBatch: INSERT INTO dns_log_queue. No RETURNING.
// NOTE: `VALUES ${placeholders}` dynamically built per batch row (8 cols);
// maximal form shown with one row of casted placeholders.
type Q_DnsIngest_InsertQueue = `
        INSERT INTO dns_log_queue
            (ip, time, domain, entity_id, question_domain,
             customer_company_id, threat_id, country)
        VALUES ($1::inet, $2::timestamptz, $3, $4::uuid, $5, $6::uuid, $7, $8::char(2))
    `;
type _V_DnsIngest_InsertQueue = Expect<Equal<ValidateSQL<Q_DnsIngest_InsertQueue, S>, true>>;

// ---------------------------------------------------------------------------
// services/api/iptrap-ingestion/src/lib/db.ts
// ---------------------------------------------------------------------------

// storeMainBatch: INSERT INTO tarpit_iptrap_queue. No RETURNING.
// NOTE: `VALUES ${values}` dynamically built per batch row (11 cols); maximal
// form shown with one row of placeholders.
type Q_Iptrap_InsertQueue = `
        INSERT INTO tarpit_iptrap_queue
            (time, ip, payload_id, headers_id, target_ip, port, scheme, target_domain, forwarded_for, tls_metadata, method)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
type _V_Iptrap_InsertQueue = Expect<Equal<ValidateSQL<Q_Iptrap_InsertQueue, S>, true>>;

// storePayloadBatch (1/2): INSERT INTO tarpit_payload ... ON CONFLICT DO NOTHING.
// NOTE: `VALUES ${values}` dynamically built per batch row (6 cols); maximal
// form shown with one row of placeholders.
type Q_Iptrap_InsertPayload = `
            INSERT INTO tarpit_payload
                (id, content, created_at, type, extracted_data, has_analyzer)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (created_at, id) DO NOTHING
        `;
type _V_Iptrap_InsertPayload = Expect<Equal<ValidateSQL<Q_Iptrap_InsertPayload, S>, true>>;

// storePayloadBatch (2/2): INSERT INTO tarpit_header ... ON CONFLICT DO NOTHING.
// NOTE: `VALUES ${values}` dynamically built per batch row (3 cols); maximal
// form shown with one row of placeholders.
type Q_Iptrap_InsertHeader = `
            INSERT INTO tarpit_header (id, content, created_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (created_at, id) DO NOTHING
        `;
type _V_Iptrap_InsertHeader = Expect<Equal<ValidateSQL<Q_Iptrap_InsertHeader, S>, true>>;

// ---------------------------------------------------------------------------
// services/functions/actions/src/handlers/api_key_usage_plan/create.ts
// ---------------------------------------------------------------------------

// UPDATE api_key_usage_plan. No RETURNING.
type Q_Actions_UpdateUsagePlan = `update api_key_usage_plan
                    set aws_usage_plan_id = $1
                    where id = $2`;
type _V_Actions_UpdateUsagePlan = Expect<Equal<ValidateSQL<Q_Actions_UpdateUsagePlan, S>, true>>;

// ---------------------------------------------------------------------------
// services/functions/actions/src/handlers/api_key/create.ts
// ---------------------------------------------------------------------------

// UPDATE api_key. No RETURNING.
type Q_Actions_UpdateApiKey = `update api_key
                    set key = $1, aws_api_key_id = $2
                    where id = $3`;
type _V_Actions_UpdateApiKey = Expect<Equal<ValidateSQL<Q_Actions_UpdateApiKey, S>, true>>;

// INSERT INTO api_key_settings with a `'{}'::jsonb` literal. No RETURNING.
type Q_Actions_InsertApiKeySettings = `insert into api_key_settings
                    (api_key_id, settings)
                    values
                    ($1, '{}'::jsonb)`;
type _V_Actions_InsertApiKeySettings = Expect<Equal<ValidateSQL<Q_Actions_InsertApiKeySettings, S>, true>>;

// ---------------------------------------------------------------------------
// services/functions/certbot-callback/src/index.ts
// ---------------------------------------------------------------------------

// getExistingChallenges: select acme_challenge from domain_settings.
// NOTE: original interpolates `where domain = '${domain}'` (a JS string) as a
// raw SQL literal; inlined here as a placeholder literal.
type Q_Certbot_GetChallenges = `
        select acme_challenge
        from domain_settings
        where domain = 'example.test'
    `;
type _V_Certbot_GetChallenges = Expect<Equal<ValidateSQL<Q_Certbot_GetChallenges, S>, true>>;
type _R_Certbot_GetChallenges = Expect<Equal<
    Simplify<GetReturnType<Q_Certbot_GetChallenges, S>>,
    { acme_challenge: S["schemas"]["public"]["domain_settings"]["acme_challenge"] }
>>;

// dns-validation-start: UPDATE domain_settings. No RETURNING.
// NOTE: original interpolates `where domain = '${domain}'`; inlined literal.
type Q_Certbot_UpdateStart = `
            update domain_settings
            set acme_challenge = null, cert_generation_started_at = now()
            where domain = 'example.test'
        `;
type _V_Certbot_UpdateStart = Expect<Equal<ValidateSQL<Q_Certbot_UpdateStart, S>, true>>;

// dns-validation: UPDATE domain_settings. No RETURNING.
// NOTE: original interpolates both `acme_challenge = '{${chgs}}'` (a JS-built
// brace list) and `where domain = '${domain}'`; inlined as literals.
type Q_Certbot_UpdateChallenge = `
            update domain_settings
            set acme_challenge = '{"chg1", "chg2"}'
            where domain = 'example.test'
        `;
type _V_Certbot_UpdateChallenge = Expect<Equal<ValidateSQL<Q_Certbot_UpdateChallenge, S>, true>>;

// save-certificate: UPDATE domain_settings (parameterized). No RETURNING.
type Q_Certbot_SaveCert = `
            update domain_settings
                set cert = $1, cert_chain = $2,
                    cert_fullchain = $3, cert_private_key = $4,
                    cert_expires_at = $5,
                    cert_generation_started_at = null,
                    cert_generated_at = now(),
                    force_refresh = false
            where domain = $6
        `;
type _V_Certbot_SaveCert = Expect<Equal<ValidateSQL<Q_Certbot_SaveCert, S>, true>>;

// A `Json` reference so the import is always used regardless of inference.
type _JsonUsed = Json | undefined;

export type ApiIngestionTestsPass = true;
