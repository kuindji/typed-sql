/**
 * Netsec tasks-service query coverage.
 *
 * Queries copied from the netsec app `services/tasks/*` cron + export jobs.
 * Collection pass: faithful coverage; red/unknown results are expected
 * findings, not bugs.
 *
 * Builder (`new Select()`) sites are reconstructed into the SQL string the
 * builder emits, in this order:
 *   select [<flags> ]<cols> from <from> <joins> where <AND-joined> ...
 *   group by ... having ... order by ... [offset N ][limit N]
 * `.addValue(v)`/`.addValues([...])` -> $N (1-based); `.limit(N)` -> `limit N`.
 *
 * The four data-cleaner partition-manager crons build CREATE TABLE / GRANT /
 * ALTER / CREATE POLICY / DROP statements dynamically from runtime table names;
 * those are DDL/admin and are covered ValidateSQL-only with `// TODO(non-query)`.
 * Each partition manager additionally runs one real catalog SELECT.
 */
import type { GetReturnType, ValidateSQL } from "../../../src/index.js";
import type { Json, NetsecSchema } from "../../fixtures/netsec-schema.js";

type S = NetsecSchema;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Simplify<T> = { [K in keyof T]: T[K] };

// ===========================================================================
// services/tasks/data-cleaner/src/cron/dns-log-partition-manager/index.ts
// ===========================================================================

// getTables(): real catalog SELECT.
// FIXTURE-GAP: pg_catalog.pg_tables (system catalog table not in fixture)
type Q_DnsPart_GetTables = `
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
`;
type _V_DnsPart_GetTables = Expect<Equal<ValidateSQL<Q_DnsPart_GetTables, S>, true>>;

// createNextTable(): partition DDL. NOTE: `${name}` = `dns_log_edge_<YYYYMMDD>`
// (runtime), `${start}`/`${end}` are ISO timestamps. Maximal/inlined form.
// TODO(non-query): CREATE TABLE ... PARTITION OF ... is DDL.
type Q_DnsPart_CreateTable = `create table dns_log_edge_20260601 partition of dns_log_edge for values from ('2026-06-01T00:00:00.000Z') to ('2026-06-01T23:59:59.999Z')`;
type _V_DnsPart_CreateTable = Expect<Equal<ValidateSQL<Q_DnsPart_CreateTable, S>, true>>;

// TODO(non-query): GRANT is DDL/admin. NOTE: roles/privileges are const strings.
type Q_DnsPart_Grant = `grant select, insert, update, delete on table "public"."dns_log_edge_20260601" to "anon", "authenticated", "service_role"`;
type _V_DnsPart_Grant = Expect<Equal<ValidateSQL<Q_DnsPart_Grant, S>, true>>;

// TODO(non-query): ALTER TABLE ... ENABLE ROW LEVEL SECURITY is DDL.
type Q_DnsPart_EnableRls = `alter table "public"."dns_log_edge_20260601" enable row level security`;
type _V_DnsPart_EnableRls = Expect<Equal<ValidateSQL<Q_DnsPart_EnableRls, S>, true>>;

// TODO(non-query): CREATE POLICY is DDL/admin.
type Q_DnsPart_CreatePolicy = `create policy "Read access" on "public"."dns_log_edge_20260601" for select to authenticated using (is_approved())`;
type _V_DnsPart_CreatePolicy = Expect<Equal<ValidateSQL<Q_DnsPart_CreatePolicy, S>, true>>;

// removePrevTable(): TODO(non-query): ALTER TABLE ... DETACH PARTITION is DDL.
type Q_DnsPart_Detach = `alter table dns_log_edge detach partition dns_log_edge_20260601`;
type _V_DnsPart_Detach = Expect<Equal<ValidateSQL<Q_DnsPart_Detach, S>, true>>;

// removePrevTable(): TODO(non-query): DROP TABLE is DDL.
type Q_DnsPart_Drop = `drop table dns_log_edge_20260601`;
type _V_DnsPart_Drop = Expect<Equal<ValidateSQL<Q_DnsPart_Drop, S>, true>>;

// ===========================================================================
// services/tasks/data-cleaner/src/cron/ip-date-threat-domain-partition-manager/index.ts
// ===========================================================================

// getTables(): real catalog SELECT.
// FIXTURE-GAP: pg_catalog.pg_tables (system catalog table not in fixture)
type Q_IpDtdPart_GetTables = `
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
`;
type _V_IpDtdPart_GetTables = Expect<Equal<ValidateSQL<Q_IpDtdPart_GetTables, S>, true>>;

// createPartition(): NOTE: `${name}` = `ip_date_threat_domain_<YYYYMM>`,
// `${rangeStart}`/`${rangeEnd}` are dates. Maximal/inlined form.
// TODO(non-query): CREATE TABLE ... PARTITION OF ... is DDL.
type Q_IpDtdPart_CreateTable = `create table ip_date_threat_domain_202606 partition of ip_date_threat_domain for values from ('2026-06-01') to ('2026-07-01')`;
type _V_IpDtdPart_CreateTable = Expect<Equal<ValidateSQL<Q_IpDtdPart_CreateTable, S>, true>>;

// TODO(non-query): GRANT is DDL/admin.
type Q_IpDtdPart_Grant = `grant select, insert, update, delete on table "public"."ip_date_threat_domain_202606" to "anon", "authenticated", "service_role"`;
type _V_IpDtdPart_Grant = Expect<Equal<ValidateSQL<Q_IpDtdPart_Grant, S>, true>>;

// ===========================================================================
// services/tasks/data-cleaner/src/cron/payloads-partition-manager/index.ts
// ===========================================================================

// getTables(): real catalog SELECT.
// FIXTURE-GAP: pg_catalog.pg_tables (system catalog table not in fixture)
type Q_PayloadPart_GetTables = `
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
`;
type _V_PayloadPart_GetTables = Expect<Equal<ValidateSQL<Q_PayloadPart_GetTables, S>, true>>;

// createNextTable(): NOTE: TABLE_PREFIXES = ["tarpit_header","tarpit_payload"];
// `${name}` = `<prefix>_<YYYY_MM_DD>`. Maximal/inlined form (tarpit_payload).
// TODO(non-query): CREATE TABLE ... PARTITION OF ... is DDL.
type Q_PayloadPart_CreateTable = `create table tarpit_payload_2026_06_01 partition of tarpit_payload for values from ('2026-06-01T00:00:00.000Z') to ('2026-06-02T00:00:00.000Z')`;
type _V_PayloadPart_CreateTable = Expect<Equal<ValidateSQL<Q_PayloadPart_CreateTable, S>, true>>;

// TODO(non-query): GRANT is DDL/admin.
type Q_PayloadPart_Grant = `grant select, insert, update, delete on table "public"."tarpit_payload_2026_06_01" to "anon", "authenticated", "service_role"`;
type _V_PayloadPart_Grant = Expect<Equal<ValidateSQL<Q_PayloadPart_Grant, S>, true>>;

// TODO(non-query): ALTER TABLE ... ENABLE ROW LEVEL SECURITY is DDL.
type Q_PayloadPart_EnableRls = `alter table "public"."tarpit_payload_2026_06_01" enable row level security`;
type _V_PayloadPart_EnableRls = Expect<Equal<ValidateSQL<Q_PayloadPart_EnableRls, S>, true>>;

// TODO(non-query): CREATE POLICY is DDL/admin (note: `using (true)` here).
type Q_PayloadPart_CreatePolicy = `create policy "Read access" on "public"."tarpit_payload_2026_06_01" for select to authenticated using (true)`;
type _V_PayloadPart_CreatePolicy = Expect<Equal<ValidateSQL<Q_PayloadPart_CreatePolicy, S>, true>>;

// removePrevTable(): TODO(non-query): ALTER TABLE ... DETACH PARTITION is DDL.
type Q_PayloadPart_Detach = `alter table tarpit_payload detach partition tarpit_payload_2026_06_01`;
type _V_PayloadPart_Detach = Expect<Equal<ValidateSQL<Q_PayloadPart_Detach, S>, true>>;

// removePrevTable(): TODO(non-query): DROP TABLE is DDL.
type Q_PayloadPart_Drop = `drop table tarpit_payload_2026_06_01`;
type _V_PayloadPart_Drop = Expect<Equal<ValidateSQL<Q_PayloadPart_Drop, S>, true>>;

// ===========================================================================
// services/tasks/data-cleaner/src/cron/tarpit-log-partition-manager/index.ts
// ===========================================================================

// getTables(): real catalog SELECT.
// FIXTURE-GAP: pg_catalog.pg_tables (system catalog table not in fixture)
type Q_TarpitPart_GetTables = `
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
`;
type _V_TarpitPart_GetTables = Expect<Equal<ValidateSQL<Q_TarpitPart_GetTables, S>, true>>;

// createNextTable(): NOTE: `${name}` = `tarpit_log_edge_<YYYYMMDD>`.
// Maximal/inlined form.
// TODO(non-query): CREATE TABLE ... PARTITION OF ... is DDL.
type Q_TarpitPart_CreateTable = `create table tarpit_log_edge_20260601 partition of tarpit_log_edge for values from ('2026-06-01T00:00:00.000Z') to ('2026-06-01T23:59:59.999Z')`;
type _V_TarpitPart_CreateTable = Expect<Equal<ValidateSQL<Q_TarpitPart_CreateTable, S>, true>>;

// TODO(non-query): GRANT is DDL/admin.
type Q_TarpitPart_Grant = `grant select, insert, update, delete on table "public"."tarpit_log_edge_20260601" to "anon", "authenticated", "service_role"`;
type _V_TarpitPart_Grant = Expect<Equal<ValidateSQL<Q_TarpitPart_Grant, S>, true>>;

// TODO(non-query): ALTER TABLE ... ENABLE ROW LEVEL SECURITY is DDL.
type Q_TarpitPart_EnableRls = `alter table "public"."tarpit_log_edge_20260601" enable row level security`;
type _V_TarpitPart_EnableRls = Expect<Equal<ValidateSQL<Q_TarpitPart_EnableRls, S>, true>>;

// TODO(non-query): CREATE POLICY is DDL/admin.
type Q_TarpitPart_CreatePolicy = `create policy "Read access" on "public"."tarpit_log_edge_20260601" for select to authenticated using (is_approved())`;
type _V_TarpitPart_CreatePolicy = Expect<Equal<ValidateSQL<Q_TarpitPart_CreatePolicy, S>, true>>;

// removePrevTable(): TODO(non-query): ALTER TABLE ... DETACH PARTITION is DDL.
type Q_TarpitPart_Detach = `alter table tarpit_log_edge detach partition tarpit_log_edge_20260601`;
type _V_TarpitPart_Detach = Expect<Equal<ValidateSQL<Q_TarpitPart_Detach, S>, true>>;

// removePrevTable(): TODO(non-query): DROP TABLE is DDL.
type Q_TarpitPart_Drop = `drop table tarpit_log_edge_20260601`;
type _V_TarpitPart_Drop = Expect<Equal<ValidateSQL<Q_TarpitPart_Drop, S>, true>>;

// ===========================================================================
// services/tasks/geo-import/src/cron/geo-import/state.ts
// ===========================================================================

// getActiveJob()
type Q_Geo_ActiveJob = `
    SELECT * FROM geo_import_jobs
    WHERE status NOT IN ('completed', 'error')
    ORDER BY id DESC LIMIT 1
`;
type _V_Geo_ActiveJob = Expect<Equal<ValidateSQL<Q_Geo_ActiveJob, S>, true>>;
type _R_Geo_ActiveJob = Expect<Equal<
    Simplify<GetReturnType<Q_Geo_ActiveJob, S>>,
    Simplify<S["schemas"]["public"]["geo_import_jobs"]>
>>;

// createJob(): INSERT ... RETURNING id
type Q_Geo_CreateJob = `
    INSERT INTO geo_import_jobs (file_key, status)
    VALUES ($1, 'pending')
    RETURNING id
`;
type _V_Geo_CreateJob = Expect<Equal<ValidateSQL<Q_Geo_CreateJob, S>, true>>;
type _R_Geo_CreateJob = Expect<Equal<
    Simplify<GetReturnType<Q_Geo_CreateJob, S>>,
    { id: S["schemas"]["public"]["geo_import_jobs"]["id"] }
>>;

// updateStatus(): UPDATE; no RETURNING.
type Q_Geo_UpdateStatus = `
    UPDATE geo_import_jobs
    SET status = $1, updated_at = now()
    WHERE id = $2
`;
type _V_Geo_UpdateStatus = Expect<Equal<ValidateSQL<Q_Geo_UpdateStatus, S>, true>>;

// updateTaskArn(): UPDATE with jsonb_set + ::jsonb cast; no RETURNING.
type Q_Geo_UpdateTaskArn = `
    UPDATE geo_import_jobs
    SET task_arns = jsonb_set(task_arns, $2, $3::jsonb), updated_at = now()
    WHERE id = $1
`;
type _V_Geo_UpdateTaskArn = Expect<Equal<ValidateSQL<Q_Geo_UpdateTaskArn, S>, true>>;

// setError(): UPDATE; no RETURNING.
type Q_Geo_SetError = `
    UPDATE geo_import_jobs
    SET error = $1, status = 'error', updated_at = now()
    WHERE id = $2 AND error IS NULL
`;
type _V_Geo_SetError = Expect<Equal<ValidateSQL<Q_Geo_SetError, S>, true>>;

// hasUnreviewedError(): COUNT(*)::int aggregate over rows.
type Q_Geo_HasUnreviewed = `
    SELECT COUNT(*)::int as count FROM geo_import_jobs
    WHERE status = 'error' AND reviewed = false
`;
type _V_Geo_HasUnreviewed = Expect<Equal<ValidateSQL<Q_Geo_HasUnreviewed, S>, true>>;
type _R_Geo_HasUnreviewed = Expect<Equal<
    Simplify<GetReturnType<Q_Geo_HasUnreviewed, S>>,
    { count: number }
>>;

// ===========================================================================
// services/tasks/oryx-export/src/automatedHuntPreview.ts
// ===========================================================================

// exportAutomatedHuntPreview(): `where ${periodWhere}` is dynamic
// (date/year/month). Maximal form uses the "date" branch: `created_at::date = $1`.
// NOTE: dynamic WHERE (period); maximal form shown.
type Q_AutoHuntPreview = `
    select * from registrar_hunt
    where created_at::date = $1
    order by created_at asc
`;
type _V_AutoHuntPreview = Expect<Equal<ValidateSQL<Q_AutoHuntPreview, S>, true>>;
type _R_AutoHuntPreview = Expect<Equal<
    Simplify<GetReturnType<Q_AutoHuntPreview, S>>,
    Simplify<S["schemas"]["public"]["registrar_hunt"]>
>>;

// ===========================================================================
// services/tasks/oryx-export/src/regenerate.ts
// ===========================================================================

// fetchRelatedHuntData(): `where ${periodWhere}` is dynamic (date/month).
// Maximal form uses the "date" branch: `added_at::date = $1`.
// NOTE: dynamic WHERE (period); maximal form shown.
type Q_Regen_RelatedHunt = `
    select * from registrar_related_hunt
    where added_at::date = $1
    order by added_at asc
`;
type _V_Regen_RelatedHunt = Expect<Equal<ValidateSQL<Q_Regen_RelatedHunt, S>, true>>;
type _R_Regen_RelatedHunt = Expect<Equal<
    Simplify<GetReturnType<Q_Regen_RelatedHunt, S>>,
    Simplify<S["schemas"]["public"]["registrar_related_hunt"]>
>>;

// fetchIocBatch(): `new Select()` builder.
//   select("*"); fromTable("threatfox_ioc"); order("first_seen_at desc");
//   where(`domain in (${select.addValues(chunk)})`)  -> $1 (single chunk value)
// NOTE: `domain in (...)` list built via addValues; maximal form = one value.
type Q_Regen_IocBatch = `select * from threatfox_ioc where domain in ($1) order by first_seen_at desc`;
type _V_Regen_IocBatch = Expect<Equal<ValidateSQL<Q_Regen_IocBatch, S>, true>>;
type _R_Regen_IocBatch = Expect<Equal<
    Simplify<GetReturnType<Q_Regen_IocBatch, S>>,
    Simplify<S["schemas"]["public"]["threatfox_ioc"]>
>>;

// fetchDnsIntelBatch(): `new Select()` builder.
//   select("*"); fromTable("dnsintel_log"); order("first_seen desc nulls last");
//   where(`domain in (${select.addValues(chunk)})`); limit(10000)
// NOTE: `domain in (...)` list built via addValues; maximal form = one value.
type Q_Regen_DnsIntelBatch = `select * from dnsintel_log where domain in ($1) order by first_seen desc nulls last limit 10000`;
type _V_Regen_DnsIntelBatch = Expect<Equal<ValidateSQL<Q_Regen_DnsIntelBatch, S>, true>>;
type _R_Regen_DnsIntelBatch = Expect<Equal<
    Simplify<GetReturnType<Q_Regen_DnsIntelBatch, S>>,
    Simplify<S["schemas"]["public"]["dnsintel_log"]>
>>;

// ===========================================================================
// services/tasks/oryx-export/src/relatedDomains.ts
// ===========================================================================

// exportRelatedDomains(): `where ${periodWhere}` is dynamic (date/year/month).
// Maximal form uses the "date" branch: `added_at::date = $1`.
// NOTE: dynamic WHERE (period); maximal form shown.
type Q_Related_Export = `
    select *
    from registrar_related_hunt
    where added_at::date = $1
    order by added_at asc
`;
type _V_Related_Export = Expect<Equal<ValidateSQL<Q_Related_Export, S>, true>>;
type _R_Related_Export = Expect<Equal<
    Simplify<GetReturnType<Q_Related_Export, S>>,
    Simplify<S["schemas"]["public"]["registrar_related_hunt"]>
>>;

// A `Json` reference so the import is always used regardless of inference.
type _JsonUsed = Json | undefined;

export type TasksTestsPass = true;
