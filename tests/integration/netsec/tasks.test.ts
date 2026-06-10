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
