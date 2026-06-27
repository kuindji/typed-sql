// SNC-false regression coverage for implicit SQL-text ids and joined rows.
//
// Type-checked by `tsconfig.strict-null-false.json` (the `typecheck:snc` pass,
// also run by `npm test`). The main typecheck + perf budget run under
// `strict: true`, so failures specific to `strictNullChecks: false` are invisible
// to the main typecheck and perf budget. Consumers (including Next.js apps)
// routinely compile in this mode, so the library exercises it directly.
import { createSelectQuery } from "../../src/builder/select.js";
import type { BuilderReturnType, SqlOf } from "../../src/builder/return-type.js";
import type { BuildRowSQL } from "../../src/builder/sql-tag.js";
import type { AssertEqual, RequireTrue } from "../fixtures/helpers.js";
import type { NetsecSchema as S } from "../fixtures/netsec-schema.js";

declare const dyn: boolean;

// Long single-clause-heavy implicit-id chain. Each no-id clause uses its SQL
// text directly instead of running a type-level auto-id algorithm.
const wide = createSelectQuery<S>()
    .from("api_key self")
    .select("self.id")
    .select("self.key")
    .select("self.company_id")
    .select("self.user_id")
    .select("self.description")
    .select("self.enabled")
    .where("self.enabled = :enabled")
    .where("self.company_id = :companyId")
    .whereIf(dyn, "self.user_id = :userId")
    .whereIf(dyn, "self.description is not null")
    .where("self.key = :key")
    .orderBy("self.created_at desc")
    .orderBy("self.id")
    .limit(10)
    .offset(0)
    .withParams({ enabled: true, companyId: "c", userId: "u", key: "k" });

type _Wide = BuilderReturnType<typeof wide>;
const _w: _Wide = null as any;
void _w;

// Implicit-id chain interleaved with joins/group/having — mirrors aggregate report
// queries (topCountry/topEntity) that first surfaced the regression.
const agg = createSelectQuery<S>()
    .select("self.company_id")
    .select("count(self.id) as cnt")
    .from("api_key self")
    .join("join company c on c.id = self.company_id")
    .joinIf(dyn, "left join api_key_usage_plan p on p.id = self.usage_plan_id")
    .where("self.enabled = :enabled")
    .whereIf(dyn, "self.company_id = :companyId")
    .groupBy("self.company_id")
    .having("count(self.id) > :min")
    .orderBy("cnt desc")
    .limit(25)
    .withParams({ enabled: true, companyId: "c", min: 1 });

type _Agg = BuilderReturnType<typeof agg>;
const _a: _Agg = null as any;
void _a;

// SQL-text ids remain stable across removal.
const removed = createSelectQuery<S>()
    .from("api_key self")
    .where("self.enabled = :enabled")
    .where("self.company_id = :companyId")
    .removeWhere("self.enabled = :enabled")
    .where("self.user_id = :userId")
    .withParams({ enabled: true, companyId: "c", userId: "u" });

type _Removed = BuilderReturnType<typeof removed>;
const _r: _Removed = null as any;
void _r;

// Exact consumer regression from Vigilocity packages/api/src/blacklistIp.ts.
// Under strictNullChecks:false, the old `Provided extends string` ResolveId test
// treated its default `undefined` as a string. Multiple implicit joins therefore
// replaced each other in the type state even though runtime state appended them.
type BlacklistSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            ip: { ip: string };
            blacklist_ip: { ip: string; source: string };
            blacklist_cidr: { cidr: string; source: string };
            blacklist_source: { id: string; description: string | null };
        };
    };
};

const ipSelect = createSelectQuery<BlacklistSchema>()
    .select([ "self.ip", "self.source", "bs.description" ])
    .from("blacklist_ip self")
    .join("left join blacklist_source bs on bs.id = self.source")
    .where("self.ip = ANY(:ips::inet[])")
    .withParams({ ips: [ "127.0.0.1" ] });

const cidrSelect = createSelectQuery<BlacklistSchema>()
    .select([ "self.ip", "bc.source", "bs.description" ])
    .from("ip self")
    .join("join blacklist_cidr bc on bc.cidr >> self.ip")
    .join("left join blacklist_source bs on bs.id = bc.source")
    .where("self.ip = ANY(:ips::inet[])")
    .withParams({ ips: [ "127.0.0.1" ] });

type ExpectedBlacklistRow = {
    ip: string;
    source: string;
    description: string | null;
};
type _IpJoinRow = RequireTrue<
    AssertEqual<BuilderReturnType<typeof ipSelect>, ExpectedBlacklistRow>
>;
type _CidrJoinRow = RequireTrue<
    AssertEqual<BuilderReturnType<typeof cidrSelect>, ExpectedBlacklistRow>
>;

type CidrBuilderRowSQL = BuildRowSQL<SqlOf<typeof cidrSelect>, "max">;
type _CidrBuilderKeepsBothJoins = RequireTrue<
    AssertEqual<
        CidrBuilderRowSQL,
        "SELECT self.ip, bc.source, bs.description FROM ip self join blacklist_cidr bc on bc.cidr >> self.ip left join blacklist_source bs on bs.id = bc.source"
    >
>;
