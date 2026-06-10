# Netsec (Vigilocity) query coverage — design

Date: 2026-06-10. Status: approved, in progress.

## Goal

Port **every** SQL query in the netsec app's `packages/api` and `services/`
into anonymized type-level tests under `tests/integration/netsec/`, mirroring the
prior `commerce` collection pass. **Green is not in scope** — red / `unknown`
results are the deliverable (the engine fix-list), not bugs in the tests.

Inventory at collection time: **~314 query sites** = 256 raw `/*sql*/` template
strings + 58 `new Select()` builder sites, across **104 files**. Biggest
concentrations: `services/api/protected-api` (20 files), `services/cron/*` (many
small jobs), `packages/api` (actions, table, top-level).

## Decisions (from brainstorming)

1. **Test pairing — plain, builder only where natural.** Every query →
   `ValidateSQL` + `GetReturnType`. Add a typed-sql builder mirror
   (`createSelectQuery`/`createInsertQuery`/…) only where the query maps cleanly;
   raw-SQL-only constructs stay plain.
2. **Schema — full 149-table fixture.** The whole `schema.sql` is converted, not
   just referenced tables, so the corpus exercises realistic type-level memory.
3. **`Select`-builder sites — covered.** Reconstruct the SQL each `new Select()`
   site emits and cover it like any other query.

## Schema fixture (`tests/fixtures/netsec-schema.ts`) — DONE

Generated deterministically from `schema.sql` (pg_dump) by a DDL→TS converter
(`/tmp/parse-netsec-schema.ts`, throwaway), then committed. 149 tables (146 base
+ 3 foreign tables), 1201 columns, 2 enums, 2 schemas (`public` +
`payload_storage`). Type mapping:

| PG type | TS |
|---|---|
| text, varchar, character varying, uuid, name | `string` |
| bigint, int*, smallint, numeric, double precision, real, money | `number` |
| boolean | `boolean` |
| timestamp(tz), date, time, interval | `string` |
| jsonb, json | `Json` |
| inet, cidr, macaddr, bytea, tsvector | `unknown` |
| enum types | string-literal union (`"a" \| "b"`) |
| `T[]` arrays | `T[]` / `(union)[]` |
| `NOT NULL` absent | `… \| null` |

`defaultSchema: "public"`. Verified: full fixture compiles (tsc exit 0) and both
pre-existing netsec test files still pass (tsc 0, bun 11/0).

## Anonymization

Light, matching the prior netsec pass: company name `vigilocity → netsec`
everywhere (comments, type names, provenance paths). Generic network-security
table/column names (`ip`, `domain`, `threat`, `watchlist`, `tarpit_*`, …) are
kept — not identifying. Scan `schema.sql` + queries for anything actually
sensitive (real company names, emails, hostnames, secrets, proprietary vendor
names) and anonymize those. Acceptance gate: `grep -ri "vigilocity" tests/ src/`
returns empty.

## Test organization

One file per source area under `tests/integration/netsec/`, mirroring commerce's
granularity (keeps each `tsc` unit small/reviewable):

- `packages-api.test.ts` (+ `…-actions`, `…-table` if large)
- `protected-api.test.ts` (split if needed — 20 source files)
- `api-misc.test.ts` (public/backend/ingestion/functions)
- `cron.test.ts` (the many small cron jobs)
- `tasks.test.ts`

Each query → provenance comment (`// services/.../file.ts`) + `ValidateSQL` +
`GetReturnType` assertion, optional builder mirror. Each file exports a
`*TestsPass` marker wired into `tests/index.ts`. Existing `queries.test.ts` /
`queries-builder.test.ts` are retained.

## Out-of-scope constructs

Some `/*sql*/` sites assemble DDL / dynamic admin SQL (partition managers,
`generate-corefile`, nginx/ip conf generation, RPC calls like
`get_watchlist_counts`). Cover leniently (`ValidateSQL` only) or annotate
`// TODO(non-query)` and skip inference — flagged per file, never silently
dropped.

## Execution

Parallel subagents grouped by directory read source files and draft test files;
orchestrate from main and verify all counts / `tsc` directly (not subagent
claims). The full corpus is expected to need the 8 GB heap and to surface reds /
`unknown`s — that is the informative outcome.

## Deliverable

~314 covered queries, full anonymized schema, a `NETSEC-FINDINGS.md` capturing
red / `unknown` / `TODO` buckets (the fix-list), `grep -ri "vigilocity"` clean.
