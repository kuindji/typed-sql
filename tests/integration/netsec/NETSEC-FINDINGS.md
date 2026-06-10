# Netsec query-coverage findings

Date: 2026-06-10. Collection pass — port **every** SQL query from the netsec app's
`packages/api` and `services/` into anonymized type-level tests. **Green is not in
scope:** red / `unknown` results are the deliverable (the engine fix-list), not bugs
in the tests. `src/` was not modified.

## Coverage

**343 query sites** covered across the netsec corpus (331 new + 12 pre-existing in
`queries.test.ts`). Sources: raw `/*sql*/` template strings **and** reconstructed
`new Select()` builder sites.

| File | Query blocks | Source area |
|---|---:|---|
| packages-api.test.ts | 48 | packages/api/src (top-level) |
| packages-api-actions-table.test.ts | 36 | packages/api/src/{actions,table} |
| protected-api.test.ts | 36 | services/api/protected-api |
| cron-data-processing.test.ts | 55 | services/cron/data-processing |
| cron-watchlist.test.ts | 31 | services/cron/watchlist-* + stats/watchlist* |
| cron-enrichment-stats.test.ts | 21 | services/cron/{ip-enrichment,stats} |
| cron-misc.test.ts | 46 | services/cron/{index-*,generate-*,threat*,…} |
| tasks.test.ts | 35 | services/tasks/{data-cleaner,geo-import,oryx-export} |
| api-ingestion.test.ts | 23 | services/api/{public,backend,*-ingestion} + functions |
| queries.test.ts (pre-existing) | 12 | misc public/protected-api |

## Schema fixture

`tests/fixtures/netsec-schema.ts` — full **149-table** schema (146 base + 3 foreign
tables), 1201 columns, 2 enums, `public` + `payload_storage`. Deterministically
converted from the app's `schema.sql` (pg_dump). See the project spec
(`docs/superpowers/specs/2026-06-10-netsec-query-coverage-design.md`).

## Memory / depth (the point of the full schema)

Full-corpus `npm run typecheck` (149-table fixture + full netsec + commerce):
**exit 2, completes cleanly, no crash/OOM**. Peak **~6.44 GB** resident
(8 GB heap cap), ~47 s. Within the documented TS6 ~6.5 GB band.

## Findings — 88 total (87 type-shape `TS2344` + 1 depth `TS2589`)

All 88 are inside the netsec collection files. **`src/`, the commerce corpus, and all
other tests remain green** — this pass adds only the intentional collection reds.

By file: tasks 24, packages-api 22, cron-data-processing 17, cron-enrichment-stats 7,
packages-api-actions-table 6, cron-misc 5, cron-watchlist 4, api-ingestion 2,
protected-api 1.

### Buckets

1. **DDL / admin / catalog → `ValidateSQL` = false (by design; biggest bucket, ~tasks).**
   `CREATE TABLE`/`GRANT`/`ENABLE RLS`/`CREATE POLICY`/`DETACH`/`DROP` partition
   management, `pg_catalog.pg_tables`, `pg_stat_user_tables`. typed-sql is **not a DDL
   validator** (README), so these correctly fail an `expected: true` assertion. Tagged
   `// TODO(non-query)`. Not an engine gap — documents scope.

2. **Wide / `excluded.*` DML upserts → `ValidateSQL` = false (cron-data-processing,
   enrichment).** Bulk `INSERT … ON CONFLICT DO UPDATE SET … = excluded.col` with
   many columns, `::inet`/`::cidr`/`::char(2)` casts, and line-wrapped `table\n.col`
   refs. Candidate real validation gaps.

3. **Aggregate / unmodeled-function projection shape (packages-api,
   actions-table).** `min`/`max`/`sum`/`array_agg`/`extract`/`ST_AsGeoJSON`/scalar
   subqueries — authored as `unknown` per the conservative-typing contract; reds are
   expectation-vs-engine deltas to triage (e.g. `min/max` over a non-null column is
   documented to return the column type, not `unknown`).

4. **CTE / derived / geo-fn result inference (packages-api, api-ingestion).**
   `WITH … VALUES(...)` column-alias-list CTEs (`lookupIps`), multi-CTE blacklight /
   last-active-ips rollups with PostGIS / geo stored functions.

5. **Depth — 1× `TS2589` (cron-enrichment-stats):** the 17-column `ip_geo_cache`
   `INSERT … ON CONFLICT DO UPDATE` with enum casts trips the instantiation-depth
   limit — the documented "very wide query" path. A genuine depth finding.

### FIXTURE-GAP (referenced by real queries, absent from schema — not engine bugs)

`entry` / `file` / `username` (separate credentials DB), `auth.users` (Supabase auth
schema), `watchlist_query` (vs `watchlist_tarpit_query`), `company_report_date`,
`tarpit_payload.indexed` / `tarpit_header.indexed` (only the `payload_storage`
variants carry `indexed`), `blacklight_ransomware_victim.group`,
`get_watchlist_counts` (stored function). Left in the SQL verbatim, tagged
`// FIXTURE-GAP`; the fixture was intentionally **not** extended.

## Anonymization

Company name → "netsec" throughout; provenance paths stripped of the monorepo
prefix; sensitive SQL literals (hostnames, domains, error strings) scrubbed to
placeholders. the real app name appears nowhere in `tests/` or `src/`.

## Next steps (NOT in scope here — collection only)

Triage buckets 2–5 per query (engine gap vs over-strict expectation vs fixture).
Bucket 1 is by-design scope, not a fix target. The `TS2589` is a length-gate
candidate (cf. the documented `ExceedsLengthBudget` degrade path).
