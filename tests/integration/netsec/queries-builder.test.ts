/**
 * Netsec query set — builder runtime mirrors. Setup-only collection pass;
 * failures => engine fix-list. SELECT queries use the fluent builder; queries
 * the builder cannot model (positional `$n`, `::inet` casts on INSERT values)
 * fall back to the typed-raw `createSql` path and are tagged TODO(builder-api).
 *
 * Mirrors the plain type-level tests in ./queries.test.ts (same query set),
 * minus the intentional-invalid `Q_InvalidNetsecColumn`.
 */
import { describe, it, expect } from "bun:test";
import {
    createSelectQuery,
    createSql,
    normalizeWhitespace,
} from "../../../src/builder/index.js";
import type { SelectBuilderResult } from "../../../src/builder/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";

type S = NetsecSchema;
type Pub = S["schemas"]["public"];

const sql = createSql<S>();

// ---------------------------------------------------------------------------
// mirror of netsec public-api ip.ts — ip-checker log insert
// ---------------------------------------------------------------------------
// TODO(builder-api): positional `$1::inet`/`$2::inet` casts + bare `true`
// literal value — the fluent insert builder models named params, not
// positional inet-cast value expressions, so use the typed-raw path.
const qInsertIpCheckerLog = sql(`
    insert into ip_checker_log (client_ip, requested_ip, found)
    values ($1::inet, $2::inet, true)
`).withParams({});

// ---------------------------------------------------------------------------
// mirror of netsec public-api ip.ts — public ip info lookup
// ---------------------------------------------------------------------------
// Original WHERE used positional `$1::inet`; mirrored with a named `:ip` param
// carrying the same `::inet` cast.
const qPublicIpInfo = createSelectQuery<S>()
    .from(`ip`)
    .select(`*`)
    .where(`ip = :ip::inet`)
    .withParams({ ip: "203.0.113.1" });

// ---------------------------------------------------------------------------
// mirror of netsec public-api ip.ts — public entity info lookup
// ---------------------------------------------------------------------------
const qPublicEntityInfo = createSelectQuery<S>()
    .from(`entity`)
    .select(`*`)
    .where(`id = :id and type = 'isp'`)
    .withParams({ id: "e1" });

// ---------------------------------------------------------------------------
// mirror of netsec public-api ip.ts — public entity counters lookup
// ---------------------------------------------------------------------------
const qPublicEntityCounts = createSelectQuery<S>()
    .from(`entity_counter`)
    .select(`*`)
    .where(`entity_id = :entityId`)
    .withParams({ entityId: "e1" });

// ---------------------------------------------------------------------------
// mirror of netsec public-api ip.ts — ip threats join (itd + hunt_report_log + threat)
// ---------------------------------------------------------------------------
const qPublicIpThreats = createSelectQuery<S>()
    .from(`ip_threat_domain itd`)
    .join(`join hunt_report_log hrl on hrl.domain = itd.domain`)
    .join(`left join threat t on t.id = hrl.threat_id`)
    .select([
        `itd.*`,
        `hrl.threat_id`,
        `coalesce(t.name, hrl.threat) as name`,
        `coalesce(t.description, hrl.threat_description) as description`,
    ])
    .where(`itd.ip = :ip::inet`)
    .withParams({ ip: "203.0.113.1" });

// ---------------------------------------------------------------------------
// mirror of netsec protected-api domain_info.ts — domain + registrant/customer/reseller
// ---------------------------------------------------------------------------
const qDomainInfo = createSelectQuery<S>()
    .from(`domain d`)
    .join(`left join domain_registrant dr on dr.domain = d.domain`)
    .join(`left join domain_customer dc on dc.domain = d.domain`)
    .join(`left join domain_reseller dres on dres.domain = d.domain`)
    .select([`d.*`, `dr.registrant`, `dc.customer`, `dres.reseller`])
    .where(`d.domain = :domain`)
    .withParams({ domain: "example.com" })
    .orderBy(`d.creation_date desc`);

// ---------------------------------------------------------------------------
// mirror of netsec protected-api lib/apiKey.ts — api_key + settings
// ---------------------------------------------------------------------------
const qApiKey = createSelectQuery<S>()
    .from(`api_key k`)
    .join(`left join api_key_settings aks on aks.api_key_id = k.id`)
    .select([`k.*`, `aks.settings`])
    .where(`k.aws_api_key_id = :awsApiKeyId`)
    .withParams({ awsApiKeyId: "k1" });

// ---------------------------------------------------------------------------
// mirror of netsec protected-api watchlist.ts — ip matches
// ---------------------------------------------------------------------------
const qWatchlistIpMatches = createSelectQuery<S>()
    .from(`watchlist_ip wi`)
    .select([`wi.ip`, `wi.last_match_at`, `wi.description`])
    .where(`wi.watchlist_id = :watchlistId and wi.matched = true`)
    .withParams({ watchlistId: "w1" });

// ---------------------------------------------------------------------------
// mirror of netsec protected-api watchlist.ts — cidr matches
// ---------------------------------------------------------------------------
const qWatchlistCidrMatches = createSelectQuery<S>()
    .from(`watchlist_cidr wc`)
    .select([`wc.cidr`, `wc.last_match_at`, `wc.description`])
    .where(`wc.watchlist_id = :watchlistId and wc.matched = true`)
    .withParams({ watchlistId: "w1" });

// ---------------------------------------------------------------------------
// mirror of netsec protected-api watchlist.ts — domain matches
// ---------------------------------------------------------------------------
const qWatchlistDomainMatches = createSelectQuery<S>()
    .from(`watchlist_domain wd`)
    .select([`wd.domain`, `wd.last_match_at`, `wd.description`, `wd.ip`])
    .where(`wd.watchlist_id = :watchlistId and wd.matched = true`)
    .withParams({ watchlistId: "w1" });

// ---------------------------------------------------------------------------
// mirror of netsec protected-api watchlist.ts — entity (company) matches
// ---------------------------------------------------------------------------
const qWatchlistEntityMatches = createSelectQuery<S>()
    .from(`watchlist_company wc`)
    .join(`join entity e on wc.entity_id = e.id`)
    .select([`e.id as entity_id`, `e.name`, `wc.last_match_at`, `wc.description`])
    .where(`wc.watchlist_id = :watchlistId and wc.matched = true`)
    .withParams({ watchlistId: "w1" });

describe("netsec query builder mirrors", () => {
    it("qInsertIpCheckerLog assembles (typed-raw)", () => {
        expect(normalizeWhitespace(qInsertIpCheckerLog.toString())).toBe(
            normalizeWhitespace(
                `insert into ip_checker_log (client_ip, requested_ip, found) ` +
                    `values ($1::inet, $2::inet, true)`,
            ),
        );
        expect([...qInsertIpCheckerLog.getParams()]).toEqual([]);
    });

    it("qPublicIpInfo assembles", () => {
        expect(normalizeWhitespace(qPublicIpInfo.toString())).toBe(
            normalizeWhitespace(`SELECT * FROM ip WHERE ip = $1::inet`),
        );
        expect([...qPublicIpInfo.getParams()]).toEqual(["203.0.113.1"]);
    });

    it("qPublicEntityInfo assembles", () => {
        expect(normalizeWhitespace(qPublicEntityInfo.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM entity WHERE id = $1 and type = 'isp'`,
            ),
        );
        expect([...qPublicEntityInfo.getParams()]).toEqual(["e1"]);
    });

    it("qPublicEntityCounts assembles", () => {
        expect(normalizeWhitespace(qPublicEntityCounts.toString())).toBe(
            normalizeWhitespace(
                `SELECT * FROM entity_counter WHERE entity_id = $1`,
            ),
        );
        expect([...qPublicEntityCounts.getParams()]).toEqual(["e1"]);
    });

    it("qPublicIpThreats assembles", () => {
        expect(normalizeWhitespace(qPublicIpThreats.toString())).toBe(
            normalizeWhitespace(
                `SELECT itd.*, hrl.threat_id, ` +
                    `coalesce(t.name, hrl.threat) as name, ` +
                    `coalesce(t.description, hrl.threat_description) as description ` +
                    `FROM ip_threat_domain itd ` +
                    `join hunt_report_log hrl on hrl.domain = itd.domain ` +
                    `left join threat t on t.id = hrl.threat_id ` +
                    `WHERE itd.ip = $1::inet`,
            ),
        );
        expect([...qPublicIpThreats.getParams()]).toEqual(["203.0.113.1"]);
    });

    it("qDomainInfo assembles", () => {
        expect(normalizeWhitespace(qDomainInfo.toString())).toBe(
            normalizeWhitespace(
                `SELECT d.*, dr.registrant, dc.customer, dres.reseller ` +
                    `FROM domain d ` +
                    `left join domain_registrant dr on dr.domain = d.domain ` +
                    `left join domain_customer dc on dc.domain = d.domain ` +
                    `left join domain_reseller dres on dres.domain = d.domain ` +
                    `WHERE d.domain = $1 ` +
                    `ORDER BY d.creation_date desc`,
            ),
        );
        expect([...qDomainInfo.getParams()]).toEqual(["example.com"]);
    });

    it("qApiKey assembles", () => {
        expect(normalizeWhitespace(qApiKey.toString())).toBe(
            normalizeWhitespace(
                `SELECT k.*, aks.settings ` +
                    `FROM api_key k ` +
                    `left join api_key_settings aks on aks.api_key_id = k.id ` +
                    `WHERE k.aws_api_key_id = $1`,
            ),
        );
        expect([...qApiKey.getParams()]).toEqual(["k1"]);
    });

    it("qWatchlistIpMatches assembles", () => {
        expect(normalizeWhitespace(qWatchlistIpMatches.toString())).toBe(
            normalizeWhitespace(
                `SELECT wi.ip, wi.last_match_at, wi.description ` +
                    `FROM watchlist_ip wi ` +
                    `WHERE wi.watchlist_id = $1 and wi.matched = true`,
            ),
        );
        expect([...qWatchlistIpMatches.getParams()]).toEqual(["w1"]);
    });

    it("qWatchlistCidrMatches assembles", () => {
        expect(normalizeWhitespace(qWatchlistCidrMatches.toString())).toBe(
            normalizeWhitespace(
                `SELECT wc.cidr, wc.last_match_at, wc.description ` +
                    `FROM watchlist_cidr wc ` +
                    `WHERE wc.watchlist_id = $1 and wc.matched = true`,
            ),
        );
        expect([...qWatchlistCidrMatches.getParams()]).toEqual(["w1"]);
    });

    it("qWatchlistDomainMatches assembles", () => {
        expect(normalizeWhitespace(qWatchlistDomainMatches.toString())).toBe(
            normalizeWhitespace(
                `SELECT wd.domain, wd.last_match_at, wd.description, wd.ip ` +
                    `FROM watchlist_domain wd ` +
                    `WHERE wd.watchlist_id = $1 and wd.matched = true`,
            ),
        );
        expect([...qWatchlistDomainMatches.getParams()]).toEqual(["w1"]);
    });

    it("qWatchlistEntityMatches assembles", () => {
        expect(normalizeWhitespace(qWatchlistEntityMatches.toString())).toBe(
            normalizeWhitespace(
                `SELECT e.id as entity_id, e.name, wc.last_match_at, wc.description ` +
                    `FROM watchlist_company wc ` +
                    `join entity e on wc.entity_id = e.id ` +
                    `WHERE wc.watchlist_id = $1 and wc.matched = true`,
            ),
        );
        expect([...qWatchlistEntityMatches.getParams()]).toEqual(["w1"]);
    });
});

// ---------------------------------------------------------------------------
// type-level row assertions (encode INTENDED result shapes; reds => fix-list)
// ---------------------------------------------------------------------------

type Row_PublicIpInfo = SelectBuilderResult<typeof qPublicIpInfo>;
type _Row_PublicIpInfo = RequireTrue<AssertEqual<Row_PublicIpInfo, Pub["ip"]>>;

type Row_PublicEntityInfo = SelectBuilderResult<typeof qPublicEntityInfo>;
type _Row_PublicEntityInfo = RequireTrue<
    AssertEqual<Row_PublicEntityInfo, Pub["entity"]>
>;

type Row_PublicEntityCounts = SelectBuilderResult<typeof qPublicEntityCounts>;
type _Row_PublicEntityCounts = RequireTrue<
    AssertEqual<Row_PublicEntityCounts, Pub["entity_counter"]>
>;

type Row_PublicIpThreats = SelectBuilderResult<typeof qPublicIpThreats>;
type _Row_PublicIpThreats = RequireTrue<
    AssertEqual<
        Row_PublicIpThreats,
        Pub["ip_threat_domain"] & {
            threat_id: string | null;
            name: string | null;
            description: string | null;
        }
    >
>;

type Row_DomainInfo = SelectBuilderResult<typeof qDomainInfo>;
type _Row_DomainInfo = RequireTrue<
    AssertEqual<
        Row_DomainInfo,
        Pub["domain"] & {
            registrant: Json | null;
            customer: Json | null;
            reseller: Json | null;
        }
    >
>;

type Row_ApiKey = SelectBuilderResult<typeof qApiKey>;
type _Row_ApiKey = RequireTrue<
    AssertEqual<Row_ApiKey, Pub["api_key"] & { settings: Json | null }>
>;

type Row_WatchlistIpMatches = SelectBuilderResult<typeof qWatchlistIpMatches>;
type _Row_WatchlistIpMatches = RequireTrue<
    AssertEqual<
        Row_WatchlistIpMatches,
        { ip: unknown; last_match_at: string | null; description: string | null }
    >
>;

type Row_WatchlistCidrMatches = SelectBuilderResult<typeof qWatchlistCidrMatches>;
type _Row_WatchlistCidrMatches = RequireTrue<
    AssertEqual<
        Row_WatchlistCidrMatches,
        { cidr: unknown; last_match_at: string | null; description: string | null }
    >
>;

type Row_WatchlistDomainMatches = SelectBuilderResult<
    typeof qWatchlistDomainMatches
>;
type _Row_WatchlistDomainMatches = RequireTrue<
    AssertEqual<
        Row_WatchlistDomainMatches,
        {
            domain: string;
            last_match_at: string | null;
            description: string | null;
            ip: unknown;
        }
    >
>;

type Row_WatchlistEntityMatches = SelectBuilderResult<
    typeof qWatchlistEntityMatches
>;
type _Row_WatchlistEntityMatches = RequireTrue<
    AssertEqual<
        Row_WatchlistEntityMatches,
        {
            entity_id: string;
            name: string;
            last_match_at: string | null;
            description: string | null;
        }
    >
>;

export type NetsecQueryBuilderTestsPass = true;
