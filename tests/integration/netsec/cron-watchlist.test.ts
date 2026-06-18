/**
 * Netsec cron/watchlist + cron/stats query coverage.
 * Queries copied from the netsec app (services/cron/*). Collection pass:
 * faithful coverage; red/unknown results are expected findings, not bugs.
 *
 * RAW `/*sql*​/` strings are copied verbatim; `${x.addValue(v)}` placeholders
 * become $1,$2,… (casts preserved, e.g. $1::inet). Inlined constants are
 * annotated with `// NOTE`. Dynamic/conditional WHERE fragments are rendered in
 * their MAXIMAL form (every fragment present) and annotated.
 *
 * Builder (`new Select()`) sites are reconstructed into the SQL string the
 * builder emits, in this order:
 *   select [<flags> ]<cols> from <from> <joins> where <AND-joined> ...
 *   group by ... having ... order by ... [offset N ][limit N]
 * `.addValue(v)` -> $N (1-based call order). `.limit(N)` emits `limit N`.
 *
 * INSERT/UPDATE without RETURNING and CTE-heavy DML are covered with
 * `ValidateSQL` only. Multi-row VALUES INSERTs are `ValidateSQL` only too.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ===========================================================================
// services/cron/watchlist-domain-ip/src/index.ts
// ===========================================================================

// getPage(): select watchlist_domain rows due for a lookup.
type Q_DomainIp_GetPage = `
    select id, domain, watchlist_id
    from watchlist_domain
    where
        lookup_disabled = false and
        (
            (ip is null and lookup_failed = false) or
            (ip is not null and (
                last_lookup_at is null or
                last_lookup_at < current_date - 30
            ))
        )
    limit 60
`;
type _V_DomainIp_GetPage = Expect<Equal<ValidateSQL<Q_DomainIp_GetPage, S>, true>>;
type _R_DomainIp_GetPage = Expect<Equal<
    Simplify<GetReturnType<Q_DomainIp_GetPage, S>>,
    {
        id: S["schemas"]["public"]["watchlist_domain"]["id"];
        domain: S["schemas"]["public"]["watchlist_domain"]["domain"];
        watchlist_id: S["schemas"]["public"]["watchlist_domain"]["watchlist_id"];
    }
>>;

// lookupDomain() success path: UPDATE, no RETURNING.
type Q_DomainIp_UpdateOk = `
    update watchlist_domain
    set
        ip = $1,
        lookup_failed = false,
        last_lookup_at = now()
    where domain = $2
`;
type _V_DomainIp_UpdateOk = Expect<Equal<ValidateSQL<Q_DomainIp_UpdateOk, S>, true>>;

// lookupDomain() failure path: UPDATE, no RETURNING.
type Q_DomainIp_UpdateFail = `
    update watchlist_domain
    set
        lookup_failed = true,
        last_lookup_at = now()
    where domain = $1
`;
type _V_DomainIp_UpdateFail = Expect<Equal<ValidateSQL<Q_DomainIp_UpdateFail, S>, true>>;

// ===========================================================================
// services/cron/watchlist-match-credentials-domain/src/index.ts
// ===========================================================================

// getNext(): Select builder.
// NOTE: trailing `wcd.watchlist_id = $1` WHERE added conditionally; maximal form.
type Q_CredDomain_GetNext = `select wcd.*, w.company_id from watchlist_credentials_domain wcd join watchlist w on wcd.watchlist_id = w.id where wcd.watchlist_id = $1 order by last_checked_at asc nulls first limit 1`;
type _V_CredDomain_GetNext = Expect<Equal<ValidateSQL<Q_CredDomain_GetNext, S>, true>>;
type _R_CredDomain_GetNext = Expect<Equal<
    Simplify<GetReturnType<Q_CredDomain_GetNext, S>>,
    Simplify<
        & S["schemas"]["public"]["watchlist_credentials_domain"]
        & { company_id: S["schemas"]["public"]["watchlist"]["company_id"] }
    >
>>;

// updateLastCheckedAt(): UPDATE, no RETURNING.
type Q_CredDomain_UpdateChecked = `
    update watchlist_credentials_domain
    set
        last_checked_at = now(),
        hosts_count = $1
    where id = $2
`;
type _V_CredDomain_UpdateChecked = Expect<Equal<ValidateSQL<Q_CredDomain_UpdateChecked, S>, true>>;

// match-found path: UPDATE, no RETURNING.
type Q_CredDomain_UpdateMatch = `
    update watchlist_credentials_domain
    set
        last_checked_at = now(),
        last_match_at = $1,
        matched = true,
        matches_count = matches_count + $2,
        hosts_count = $3
    where id = $4
`;
type _V_CredDomain_UpdateMatch = Expect<Equal<ValidateSQL<Q_CredDomain_UpdateMatch, S>, true>>;

// ===========================================================================
// services/cron/watchlist-match-query/src/index.ts
// ===========================================================================

// getNext(): RAW sql.
type Q_MatchQuery_GetNext = `
    select wtq.*, w.company_id
    from watchlist_tarpit_query wtq
    join watchlist w on wtq.watchlist_id = w.id
    order by last_checked_at asc nulls first
    limit 1
`;
type _V_MatchQuery_GetNext = Expect<Equal<ValidateSQL<Q_MatchQuery_GetNext, S>, true>>;
type _R_MatchQuery_GetNext = Expect<Equal<
    Simplify<GetReturnType<Q_MatchQuery_GetNext, S>>,
    Simplify<
        & S["schemas"]["public"]["watchlist_tarpit_query"]
        & { company_id: S["schemas"]["public"]["watchlist"]["company_id"] }
    >
>>;

// getLatestByPayloadId(): RAW sql.
// NOTE: `payload_id in (...)` list built from string-interpolated ids; one
// literal shown. NOTE: trailing company filter added conditionally; maximal form.
type Q_MatchQuery_LatestByPayload = `select source_ip, time, payload_id from tarpit_log_edge where payload_id in ('p1') and (customer_company_id = $1 or forwarded_company_id = $1) order by time desc limit 1`;
type _V_MatchQuery_LatestByPayload = Expect<Equal<ValidateSQL<Q_MatchQuery_LatestByPayload, S>, true>>;
type _R_MatchQuery_LatestByPayload = Expect<Equal<
    Simplify<GetReturnType<Q_MatchQuery_LatestByPayload, S>>,
    {
        source_ip: S["schemas"]["public"]["tarpit_log_edge"]["source_ip"];
        time: S["schemas"]["public"]["tarpit_log_edge"]["time"];
        payload_id: S["schemas"]["public"]["tarpit_log_edge"]["payload_id"];
    }
>>;

// getLatestByHeaderId(): RAW sql.
// NOTE: `headers_id in (...)` list built from string-interpolated ids; one
// literal shown. NOTE: trailing company filter added conditionally; maximal form.
type Q_MatchQuery_LatestByHeader = `select source_ip, time, headers_id from tarpit_log_edge where headers_id in ('h1') and (customer_company_id = $1 or forwarded_company_id = $1) order by time desc limit 1`;
type _V_MatchQuery_LatestByHeader = Expect<Equal<ValidateSQL<Q_MatchQuery_LatestByHeader, S>, true>>;
type _R_MatchQuery_LatestByHeader = Expect<Equal<
    Simplify<GetReturnType<Q_MatchQuery_LatestByHeader, S>>,
    {
        source_ip: S["schemas"]["public"]["tarpit_log_edge"]["source_ip"];
        time: S["schemas"]["public"]["tarpit_log_edge"]["time"];
        headers_id: S["schemas"]["public"]["tarpit_log_edge"]["headers_id"];
    }
>>;

// getPayloadContent(): RAW sql.
type Q_MatchQuery_PayloadContent = `
    select content
    from tarpit_payload
    where id = $1
`;
type _V_MatchQuery_PayloadContent = Expect<Equal<ValidateSQL<Q_MatchQuery_PayloadContent, S>, true>>;
type _R_MatchQuery_PayloadContent = Expect<Equal<
    Simplify<GetReturnType<Q_MatchQuery_PayloadContent, S>>,
    { content: S["schemas"]["public"]["tarpit_payload"]["content"] }
>>;

// getHeaderContent(): RAW sql.
type Q_MatchQuery_HeaderContent = `
    select content
    from tarpit_header
    where id = $1
`;
type _V_MatchQuery_HeaderContent = Expect<Equal<ValidateSQL<Q_MatchQuery_HeaderContent, S>, true>>;
type _R_MatchQuery_HeaderContent = Expect<Equal<
    Simplify<GetReturnType<Q_MatchQuery_HeaderContent, S>>,
    { content: S["schemas"]["public"]["tarpit_header"]["content"] }
>>;

// getLastMatch(): RAW sql with dynamic `${table}` and `limit ${limit}`.
// NOTE: table is `tarpit_payload` or `tarpit_header`; payload form shown.
// NOTE: `limit ${limit}` inlined as `limit 1`.
type Q_MatchQuery_LastMatchPayload = `
    select id
    from tarpit_payload
    where content ilike $1
    order by created_at desc
    limit 1
`;
type _V_MatchQuery_LastMatchPayload = Expect<Equal<ValidateSQL<Q_MatchQuery_LastMatchPayload, S>, true>>;
type _R_MatchQuery_LastMatchPayload = Expect<Equal<
    Simplify<GetReturnType<Q_MatchQuery_LastMatchPayload, S>>,
    { id: S["schemas"]["public"]["tarpit_payload"]["id"] }
>>;

// getLastMatch(): RAW sql, tarpit_header variant.
type Q_MatchQuery_LastMatchHeader = `
    select id
    from tarpit_header
    where content ilike $1
    order by created_at desc
    limit 1
`;
type _V_MatchQuery_LastMatchHeader = Expect<Equal<ValidateSQL<Q_MatchQuery_LastMatchHeader, S>, true>>;
type _R_MatchQuery_LastMatchHeader = Expect<Equal<
    Simplify<GetReturnType<Q_MatchQuery_LastMatchHeader, S>>,
    { id: S["schemas"]["public"]["tarpit_header"]["id"] }
>>;

// updateLastCheckedAt(): UPDATE, no RETURNING.
type Q_MatchQuery_UpdateChecked = `
    update watchlist_tarpit_query
    set
        last_checked_at = now()
    where id = $1
`;
type _V_MatchQuery_UpdateChecked = Expect<Equal<ValidateSQL<Q_MatchQuery_UpdateChecked, S>, true>>;

// match-found path: UPDATE, no RETURNING.
type Q_MatchQuery_UpdateMatch = `
    update watchlist_tarpit_query
    set
        last_checked_at = now(),
        last_match_at = $6,
        header_id = $1,
        payload_id = $2,
        content = $3,
        ip_reference = $4,
        matched = true
    where id = $5
`;
type _V_MatchQuery_UpdateMatch = Expect<Equal<ValidateSQL<Q_MatchQuery_UpdateMatch, S>, true>>;

// ===========================================================================
// services/cron/watchlist-match-username/src/index.ts
// ===========================================================================

// getNext(): Select builder.
// NOTE: trailing `wu.watchlist_id = $1` WHERE added conditionally; maximal form.
type Q_MatchUser_GetNext = `select wu.*, w.company_id from watchlist_username wu join watchlist w on wu.watchlist_id = w.id where wu.watchlist_id = $1 order by last_checked_at asc nulls first limit 1`;
type _V_MatchUser_GetNext = Expect<Equal<ValidateSQL<Q_MatchUser_GetNext, S>, true>>;
type _R_MatchUser_GetNext = Expect<Equal<
    Simplify<GetReturnType<Q_MatchUser_GetNext, S>>,
    Simplify<
        & S["schemas"]["public"]["watchlist_username"]
        & { company_id: S["schemas"]["public"]["watchlist"]["company_id"] }
    >
>>;

// updateLastCheckedAt(): UPDATE, no RETURNING.
type Q_MatchUser_UpdateChecked = `
    update watchlist_username
    set
        last_checked_at = now()
    where id = $1
`;
type _V_MatchUser_UpdateChecked = Expect<Equal<ValidateSQL<Q_MatchUser_UpdateChecked, S>, true>>;

// match-found path: UPDATE, no RETURNING.
type Q_MatchUser_UpdateMatch = `
    update watchlist_username
    set
        last_checked_at = now(),
        last_match_at = $1,
        matched = true
    where id = $2
`;
type _V_MatchUser_UpdateMatch = Expect<Equal<ValidateSQL<Q_MatchUser_UpdateMatch, S>, true>>;

// ===========================================================================
// services/cron/watchlist-match/src/watchlistCidrMatch.ts
// ===========================================================================

// handler(): SELECT watchlist_cidr page.
// NOTE: `limit ${BATCH_SIZE}` inlined as `limit 100`.
type Q_CidrMatch_GetPage = `
    SELECT id, watchlist_id, cidr::text as cidr,
        last_checked_at
    FROM watchlist_cidr
    ORDER BY last_checked_at ASC NULLS FIRST
    LIMIT 100
`;
type _V_CidrMatch_GetPage = Expect<Equal<ValidateSQL<Q_CidrMatch_GetPage, S>, true>>;
type _R_CidrMatch_GetPage = Expect<Equal<
    Simplify<GetReturnType<Q_CidrMatch_GetPage, S>>,
    {
        id: S["schemas"]["public"]["watchlist_cidr"]["id"];
        watchlist_id: S["schemas"]["public"]["watchlist_cidr"]["watchlist_id"];
        // cidr::text -> string
        cidr: string;
        last_checked_at: S["schemas"]["public"]["watchlist_cidr"]["last_checked_at"];
    }
>>;

// Bulk upsert: multi-row VALUES INSERT with ON CONFLICT. No RETURNING.
// NOTE: VALUES placeholder list dynamically generated; one row shown maximal.
// Multi-row VALUES -> ValidateSQL only.
type Q_CidrMatch_Upsert = `
    INSERT INTO watchlist_ip_match
        (watchlist_id, ip, cidr,
         last_dns_log_match,
         last_tarpit_log_match)
    VALUES ($1::uuid, $2::inet, $3::cidr, $4::timestamptz, $5::timestamptz)
    ON CONFLICT (watchlist_id, ip) DO UPDATE SET
        cidr = excluded.cidr,
        last_dns_log_match =
            excluded.last_dns_log_match,
        last_tarpit_log_match =
            excluded.last_tarpit_log_match
`;
type _V_CidrMatch_Upsert = Expect<Equal<ValidateSQL<Q_CidrMatch_Upsert, S>, true>>;

// Update processed CIDRs: last_checked_at. No RETURNING.
// NOTE: `IN (...)` placeholder list dynamically generated; one shown.
type Q_CidrMatch_UpdateChecked = `
    UPDATE watchlist_cidr
    SET last_checked_at = now()
    WHERE id IN ($1::uuid)
`;
type _V_CidrMatch_UpdateChecked = Expect<Equal<ValidateSQL<Q_CidrMatch_UpdateChecked, S>, true>>;

// Update matched CIDRs from a VALUES source. No RETURNING.
// NOTE: VALUES source list dynamically generated; one row shown.
type Q_CidrMatch_UpdateMatched = `
    UPDATE watchlist_cidr AS wc
    SET matched = true,
        last_match_at = source.t
    FROM (VALUES ($1::uuid, $2::timestamptz)) AS source(id, t)
    WHERE wc.id = source.id
`;
type _V_CidrMatch_UpdateMatched = Expect<Equal<ValidateSQL<Q_CidrMatch_UpdateMatched, S>, true>>;

// ===========================================================================
// services/cron/watchlist-match/src/watchlistCompanyMatch.ts
// ===========================================================================

// handler(): SELECT watchlist_company left join entity_counter.
// NOTE: `limit ${BATCH_SIZE}` inlined as `limit 100`.
type Q_CompanyMatch_GetPage = `
    SELECT wc.id, wc.watchlist_id, wc.entity_id,
        wc.last_checked_at,
        GREATEST(
            ec.dns_log_last_match,
            ec.tarpit_log_last_match
        ) as last_match
    FROM watchlist_company wc
    LEFT JOIN entity_counter ec
        ON ec.entity_id = wc.entity_id
    ORDER BY wc.last_checked_at ASC NULLS FIRST
    LIMIT 100
`;
type _V_CompanyMatch_GetPage = Expect<Equal<ValidateSQL<Q_CompanyMatch_GetPage, S>, true>>;
type _R_CompanyMatch_GetPage = Expect<Equal<
    Simplify<GetReturnType<Q_CompanyMatch_GetPage, S>>,
    {
        id: S["schemas"]["public"]["watchlist_company"]["id"];
        watchlist_id: S["schemas"]["public"]["watchlist_company"]["watchlist_id"];
        entity_id: S["schemas"]["public"]["watchlist_company"]["entity_id"];
        last_checked_at: S["schemas"]["public"]["watchlist_company"]["last_checked_at"];
        // GREATEST(...) -> common arg type; both args are nullable (schema
        // `string | null`, also the left-joined side), so the result is nullable.
        last_match: string | null;
    }
>>;

// Bulk upsert: multi-row VALUES INSERT with ON CONFLICT. No RETURNING.
// NOTE: VALUES placeholder list dynamically generated; one row shown maximal.
// Multi-row VALUES -> ValidateSQL only.
type Q_CompanyMatch_Upsert = `
    INSERT INTO watchlist_ip_match
        (watchlist_id, ip, entity_id,
         last_dns_log_match,
         last_tarpit_log_match)
    VALUES ($1::uuid, $2::inet, $3::uuid, $4::timestamptz, $5::timestamptz)
    ON CONFLICT (watchlist_id, ip) DO UPDATE SET
        entity_id = excluded.entity_id,
        last_dns_log_match =
            excluded.last_dns_log_match,
        last_tarpit_log_match =
            excluded.last_tarpit_log_match
`;
type _V_CompanyMatch_Upsert = Expect<Equal<ValidateSQL<Q_CompanyMatch_Upsert, S>, true>>;

// Update processed rows: last_checked_at. No RETURNING.
// NOTE: `IN (...)` placeholder list dynamically generated; one shown.
type Q_CompanyMatch_UpdateChecked = `
    UPDATE watchlist_company
    SET last_checked_at = now()
    WHERE id IN ($1::uuid)
`;
type _V_CompanyMatch_UpdateChecked = Expect<Equal<ValidateSQL<Q_CompanyMatch_UpdateChecked, S>, true>>;

// Update matched entries from a VALUES source. No RETURNING.
// NOTE: VALUES source list dynamically generated; one row shown.
type Q_CompanyMatch_UpdateMatched = `
    UPDATE watchlist_company AS wc
    SET matched = true,
        last_match_at = source.t
    FROM (VALUES ($1::uuid, $2::timestamptz)) AS source(id, t)
    WHERE wc.id = source.id
`;
type _V_CompanyMatch_UpdateMatched = Expect<Equal<ValidateSQL<Q_CompanyMatch_UpdateMatched, S>, true>>;

// ===========================================================================
// services/cron/stats/src/watchlistUpdateIpCount.ts
// ===========================================================================

// handler(): WITH-CTE chain feeding an UPDATE ... FROM. No RETURNING.
// TODO(non-query): CTE-heavy DML with set-returning functions
// (family/hostmask/masklen) and inet/cidr arithmetic; ValidateSQL only.
type Q_StatsIpCount = `
    WITH direct_ips AS (
        SELECT watchlist_id, count(*)::bigint AS cnt
        FROM watchlist_ip GROUP BY watchlist_id
    ),
    domain_ips AS (
        SELECT watchlist_id, count(*)::bigint AS cnt
        FROM watchlist_domain WHERE ip IS NOT NULL
        GROUP BY watchlist_id
    ),
    cidr_ips AS (
        SELECT watchlist_id, sum(
            CASE WHEN family(cidr) = 4
                THEN (hostmask(cidr::cidr) - '0.0.0.0'::inet)::int8 + 1
            ELSE CASE WHEN masklen(cidr) >= 96
                THEN (hostmask(cidr::cidr) - '0:0:0:0:0:0:0:0'::inet)::int8 + 1
                ELSE 0 END
            END
        ) AS cnt
        FROM watchlist_cidr GROUP BY watchlist_id
    ),
    company_ips AS (
        SELECT watchlist_id, sum(
            CASE WHEN family(ircc.cidr) = 4
                THEN (hostmask(ircc.cidr::cidr) - '0.0.0.0'::inet)::int8 + 1
            ELSE CASE WHEN masklen(ircc.cidr) >= 96
                THEN (hostmask(ircc.cidr::cidr) - '0:0:0:0:0:0:0:0'::inet)::int8 + 1
                ELSE 0 END
            END
        ) AS cnt
        FROM watchlist_company wc
        JOIN entity_cidr ircc ON ircc.entity_id = wc.entity_id
        GROUP BY watchlist_id
    ),
    combined AS (
        SELECT watchlist_id, cnt FROM direct_ips UNION ALL
        SELECT watchlist_id, cnt FROM domain_ips UNION ALL
        SELECT watchlist_id, cnt FROM cidr_ips UNION ALL
        SELECT watchlist_id, cnt FROM company_ips
    ),
    totals AS (
        SELECT
            w.id AS watchlist_id,
            COALESCE(sum(combined.cnt), 0)::bigint AS ip_count
        FROM watchlist w
        LEFT JOIN combined ON combined.watchlist_id = w.id
        GROUP BY w.id
    )
    UPDATE watchlist AS w
    SET ip_count = totals.ip_count
    FROM totals
    WHERE w.id = totals.watchlist_id
`;
type _V_StatsIpCount = Expect<Equal<ValidateSQL<Q_StatsIpCount, S>, true>>;

// ===========================================================================
// services/cron/stats/src/watchlistUpdateMatchedIpCount.ts
// ===========================================================================

// handler(): WITH-CTE chain feeding an UPDATE ... FROM. No RETURNING.
// TODO(non-query): CTE-heavy DML (UNION ALL CTE + UPDATE FROM); ValidateSQL only.
type Q_StatsMatchedIpCount = `
    WITH counts AS (
        SELECT watchlist_id, count(*)::bigint AS cnt
        FROM watchlist_ip_match
        GROUP BY watchlist_id
        UNION ALL
        SELECT watchlist_id, count(*)::bigint AS cnt
        FROM watchlist_ip
        WHERE matched = true
        GROUP BY watchlist_id
        UNION ALL
        SELECT watchlist_id, count(*)::bigint AS cnt
        FROM watchlist_domain
        WHERE matched = true
        GROUP BY watchlist_id
    ),
    totals AS (
        SELECT
            w.id AS watchlist_id,
            COALESCE(sum(counts.cnt), 0)::bigint AS cnt
        FROM watchlist w
        LEFT JOIN counts ON counts.watchlist_id = w.id
        GROUP BY w.id
    )
    UPDATE watchlist AS w
    SET matched_ip_count = totals.cnt
    FROM totals
    WHERE w.id = totals.watchlist_id
`;
type _V_StatsMatchedIpCount = Expect<Equal<ValidateSQL<Q_StatsMatchedIpCount, S>, true>>;

// ===========================================================================
// services/cron/stats/src/watchlistUpdateReferencedIpCount.ts
// ===========================================================================

// handler(): WITH-CTE chain feeding an UPDATE ... FROM. No RETURNING.
// TODO(non-query): CTE-heavy DML (UNION ALL CTE + UPDATE FROM); ValidateSQL only.
type Q_StatsReferencedIpCount = `
    WITH counts AS (
        SELECT watchlist_id, count(*)::bigint AS cnt
        FROM watchlist_ip
        WHERE ip_reference IS NOT NULL
        GROUP BY watchlist_id
        UNION ALL
        SELECT watchlist_id, count(*)::bigint AS cnt
        FROM watchlist_domain
        WHERE ip_reference IS NOT NULL
        GROUP BY watchlist_id
    ),
    totals AS (
        SELECT
            w.id AS watchlist_id,
            COALESCE(sum(counts.cnt), 0)::bigint AS cnt
        FROM watchlist w
        LEFT JOIN counts ON counts.watchlist_id = w.id
        GROUP BY w.id
    )
    UPDATE watchlist AS w
    SET referenced_ip_count = totals.cnt
    FROM totals
    WHERE w.id = totals.watchlist_id
`;
type _V_StatsReferencedIpCount = Expect<Equal<ValidateSQL<Q_StatsReferencedIpCount, S>, true>>;

// A `Json` reference so the import is always used regardless of inference.
type _JsonUsed = Json | undefined;

export type CronWatchlistTestsPass = true;
