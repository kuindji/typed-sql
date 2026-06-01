/**
 * Vigilocity query fixtures.
 *
 * Queries are copied from /Users/kuindji/Projects/Vigilocity/monorepo.
 * These tests assert that typed-sql can validate the project SQL and infer
 * useful row shapes from the generated Supabase schema.
 */

import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, VigilocitySchema } from "../../fixtures/vigilocity-schema.js";

type S = VigilocitySchema;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (
    <T>() => T extends B ? 1 : 2
)
    ? true
    : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// services/api/public-api/src/ip.ts
// ---------------------------------------------------------------------------

type Q_InsertIpCheckerLog = `
    insert into ip_checker_log (client_ip, requested_ip, found) 
    values ($1::inet, $2::inet, true)
`;
type _V1 = Expect<Equal<ValidateSQL<Q_InsertIpCheckerLog, S>, true>>;

type Q_PublicIpInfo = `select * from ip where ip = $1::inet`;
type _V2 = Expect<Equal<ValidateSQL<Q_PublicIpInfo, S>, true>>;
type _R2 = Expect<Equal<GetReturnType<Q_PublicIpInfo, S>, S["schemas"]["public"]["ip"]>>;

type Q_PublicEntityInfo = `select * from entity where id = $1 and type = 'isp'`;
type _V3 = Expect<Equal<ValidateSQL<Q_PublicEntityInfo, S>, true>>;
type _R3 = Expect<
    Equal<GetReturnType<Q_PublicEntityInfo, S>, S["schemas"]["public"]["entity"]>
>;

type Q_PublicEntityCounts = `select * from entity_counter where entity_id = $1`;
type _V4 = Expect<Equal<ValidateSQL<Q_PublicEntityCounts, S>, true>>;
type _R4 = Expect<
    Equal<GetReturnType<Q_PublicEntityCounts, S>, S["schemas"]["public"]["entity_counter"]>
>;

type Q_PublicIpThreats = `
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
type _V5 = Expect<Equal<ValidateSQL<Q_PublicIpThreats, S>, true>>;
type _R5 = Expect<Equal<
    Simplify<GetReturnType<Q_PublicIpThreats, S>>,
    Simplify<S["schemas"]["public"]["ip_threat_domain"] & {
        threat_id: string | null;
        name: string | null;
        description: string | null;
    }>
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
type _V6 = Expect<Equal<ValidateSQL<Q_DomainInfo, S>, true>>;
type _R6 = Expect<Equal<
    Simplify<GetReturnType<Q_DomainInfo, S>>,
    Simplify<S["schemas"]["public"]["domain"] & {
        registrant: Json | null;
        customer: Json | null;
        reseller: Json | null;
    }>
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
type _V7 = Expect<Equal<ValidateSQL<Q_ApiKey, S>, true>>;
type _R7 = Expect<Equal<
    Simplify<GetReturnType<Q_ApiKey, S>>,
    Simplify<S["schemas"]["public"]["api_key"] & { settings: Json | null }>
>>;

// ---------------------------------------------------------------------------
// services/api/protected-api/src/watchlist.ts
// ---------------------------------------------------------------------------

type Q_WatchlistIpMatches = `
    select 
        wi.ip,
        wi.last_match_at,
        wi.description
    from watchlist_ip wi
    where wi.watchlist_id = $1 and wi.matched = true
`;
type _V8 = Expect<Equal<ValidateSQL<Q_WatchlistIpMatches, S>, true>>;
type _R8 = Expect<Equal<
    GetReturnType<Q_WatchlistIpMatches, S>,
    { ip: unknown; last_match_at: string | null; description: string | null }
>>;

type Q_WatchlistCidrMatches = `
    select 
        wc.cidr,
        wc.last_match_at,
        wc.description
    from watchlist_cidr wc
    where wc.watchlist_id = $1 and wc.matched = true
`;
type _V9 = Expect<Equal<ValidateSQL<Q_WatchlistCidrMatches, S>, true>>;
type _R9 = Expect<Equal<
    GetReturnType<Q_WatchlistCidrMatches, S>,
    { cidr: unknown; last_match_at: string | null; description: string | null }
>>;

type Q_WatchlistDomainMatches = `
    select 
        wd.domain,
        wd.last_match_at,
        wd.description,
        wd.ip 
    from watchlist_domain wd
    where wd.watchlist_id = $1 and wd.matched = true
`;
type _V10 = Expect<Equal<ValidateSQL<Q_WatchlistDomainMatches, S>, true>>;
type _R10 = Expect<Equal<
    GetReturnType<Q_WatchlistDomainMatches, S>,
    { domain: string; last_match_at: string | null; description: string | null; ip: unknown }
>>;

type Q_WatchlistEntityMatches = `
    select 
        e.id as entity_id,
        e.name,
        wc.last_match_at,
        wc.description
    from watchlist_company wc
    join entity e on wc.entity_id = e.id
    where wc.watchlist_id = $1 and wc.matched = true
`;
type _V11 = Expect<Equal<ValidateSQL<Q_WatchlistEntityMatches, S>, true>>;
type _R11 = Expect<Equal<
    GetReturnType<Q_WatchlistEntityMatches, S>,
    { entity_id: string; name: string; last_match_at: string | null; description: string | null }
>>;

// The fixture should still reject references that are not in Vigilocity's schema.
type Q_InvalidVigilocityColumn = `select missing_column from ip`;
type _V12 = Expect<Equal<ValidateSQL<Q_InvalidVigilocityColumn, S>, false>>;

export type VigilocityQueryTestsPass = true;
