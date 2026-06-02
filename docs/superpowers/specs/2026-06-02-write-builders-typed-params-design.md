# Insert / Update / Delete builders with typed (brand-checked) parameters

**Status:** Design approved — ready for implementation planning
**Date:** 2026-06-02
**Package:** `@kuindji/typed-sql` (published as `@kuindji/sql-type-parser`)

---

## 1. Motivation

The library has a stable, type-checked **SELECT** surface: a string-level
validator/inferrer plus a runtime builder (`createSelectQuery`) and executor
(`createSelectFn`). There is no equivalent for writes.

Survey of the real consumer (TheFloorr monorepo):

- Writes are done almost entirely with **raw SQL strings → `db.main.run(sql, values)`**
  (`hasura-trigger`: 73 `.run()` calls; `backend-v2`: 8), heavy on
  `ON CONFLICT … DO UPDATE SET`, `RETURNING`, and expression RHS
  (`set "position" = "position" + 10`).
- A hand-rolled `prepareInsert` / `prepareUpdate` in `packages/common/src/db/api.ts`
  builds `{ keys, placeholders, values }` from a typed object but **does not
  assemble SQL** and supports no `ON CONFLICT` / `RETURNING` / `WHERE`.
- Branded column types already exist and are pervasive
  (`User_id = string & { __table: "User" }`, FK columns reference brands:
  `friId: User_id`). Generated `insertTypes.ts` already exists per table.

The differentiating capability requested: **parameter validation** — match the
runtime value type supplied for each `:placeholder` to the *column it binds to*,
including **exact branded types**. Passing a plain `string` where a `User_id` is
expected must be a compile error.

## 2. Goals

- Runtime builders for INSERT / UPDATE / DELETE mirroring `createSelectQuery`,
  including conditional (`*If`) fragments.
- A standalone typed raw-SQL wrapper (`createSql`) and an executor
  (`createMutateFn`) mirroring `createSelectFn`.
- **Parameter type inference**: every `:name` placeholder is typed to the
  (branded, nullability-correct) type of the column it binds to. Brand matching
  is **exact** (the column's branded type is required).
- **RETURNING** result-row typing.
- Stay within TypeScript depth limits (no `TS2589`).

## 3. Non-goals (deferred — Phase 2 / notes)

- **SELECT `withParams` brand-checking.** Wanted ("affects select too") but
  gated on multi-table/join **alias resolution** being proven depth-safe. Done
  after the single-target write builders ship.
- **Multi-row `VALUES (...),(...)`** in the builder — use the raw-SQL path
  meanwhile.
- Full SQL expression type-checking — out of scope by the existing conservative
  contract.

## 4. Feasibility result (spike)

A throwaway type-level spike (`tests/spike/`) implemented `ExtractParams<Q, S>`
on top of the existing depth-tuned parsers and was validated under the project's
strict tsconfig. **Verdict: GREEN.**

Proven working (all probes pass, full `tsc --noEmit` exit 0, no `TS2589`):

- INSERT positional column↔value pairing (incl. full 32-column table)
- UPDATE `set col = :p` + WHERE
- DELETE WHERE incl. `id in (:ids)` → array param (`Product_id[]`)
- SELECT WHERE params (single-table scope)
- RETURNING result-row typing
- Exact-brand enforcement (plain `string` for `User_id` column → error)
- Branded FK + nullability (`teamId → Team_id | null`)

Depth cost (isolated, `src` vs `src + spike` of ~20 queries, 7 wide tables):

| | src only | + spike | delta |
|---|---|---|---|
| Instantiations | 102k | 276k | +173k (~8.6k/query) |
| Types | 16k | 43k | +27k |
| Time | 0.64s | 0.83s | +0.2s |

Linear and modest; a 32-deep `ZipInsert` recursion stays well under TS's ~50
recursion limit. The one flagged risk — multi-table SELECT alias resolution — is
deliberately scoped out of Phase 1 (writes are single-target).

## 5. Public API

### 5.1 Builders (dynamic / conditional)

```ts
// INSERT — column/value pairs (misalignment-proof, conditional-friendly)
createInsertQuery<Schema>()
  .into("orders")
  .value("userId", ":uid")
  .value("amount", ":amt")
  .value("createdAt", "now()")            // non-:name fragment → literal/expr, no param
  .valueIf(hasNote, "note", ":note")      // conditional → :note optional in withParams
  .onConflict("(id) do update set amount = :amt2")  // params inferred from fragment too
  .returning("id, createdAt")
  .withParams({ uid, amt, amt2, note? });

// UPDATE
createUpdateQuery<Schema>()
  .table("orders")
  .set("amount = :amt")
  .setIf(bumpCur, "currency = :cur")      // :cur optional
  .from("users u")                        // UPDATE…FROM (+ fromIf)
  .where("id = :oid")
  .whereIf(byUser, "userId = :uid")       // :uid optional
  .returning("id")
  .withParams({ amt, oid, cur?, uid? });

// DELETE
createDeleteQuery<Schema>()
  .from("orders")
  .using("payments p")                    // (+ usingIf)
  .where("id = :id")
  .whereIf(c, "paid = :paid")             // :paid optional
  .returning("*")
  .withParams({ id, paid? });
```

### 5.2 Standalone typed raw-SQL wrapper

```ts
const sql = createSql<Schema>();                     // factory binds Schema once
const q = sql("delete from orders where id = :id")   // covers insert/update/delete
  .withParams({ id });                               // brand-checked from the string
q.toString(); q.getParams();                         // reusable typed query object
```

`createSql` covers I/U/D in Phase 1; may absorb SELECT in Phase 2.

### 5.3 Executor

```ts
const mutate = createMutateFn<Schema>(driver);   // analog of createSelectFn
await mutate(q);                                  // builder OR createSql() object
await mutate(
  "insert into orders (userId) values (:uid) returning id",
  { uid },                                        // raw + brand-checked params
);
// returns RETURNING rows, same row shape contract as createSelectFn
```

### 5.4 Type-level exports

`ExtractParams<Q, S>`, `ExtractReturning<Q, S>`, `MutationReturnType<B>` — plus
the existing `ValidateInsertSQL` / `GetInsertTableColumns` / etc. Consumers
(e.g. the monorepo's `db/api.ts`) use these to build their own typed wrappers
(`typedRun`) the way `typedSelect` is built today.

## 6. Parameter inference semantics

For a normalized query, `ExtractParams<Q, S>` produces `{ [paramName]: type }`:

- **INSERT** — pair the column list with the VALUES list positionally; each
  `:name` value is typed to its paired column. `onConflict` `do update set`
  fragments contribute their params too, resolved against the target table.
- **UPDATE** — `set col = :p` assignment binds `:p` to `col`; WHERE binds as below.
- **WHERE / USING** — `col op :p` binds `:p` to `col`; `col in (:ps)` binds `:ps`
  to `ColType[]` (array). Applies to UPDATE, DELETE (and SELECT in Phase 2).
- **A fragment contributes a param iff it contains `:name` tokens.** Expression
  RHS without placeholders (`pos = pos + 1`, `not flag`) contributes none. Where
  a fragment is an expression containing a placeholder (`coalesce(:a, '')`), each
  `:name` found is typed to the bound column.
- **Brand matching is exact** — the param type is the column's declared
  (branded) type; the underlying base type is not accepted.
- **Nullability** is preserved from the schema (`Team_id | null`).
- `::cast` suffixes on a placeholder are stripped from the param name.

### `*If` → optional param contract

Consistent with `selectIf`: a **conditional** fragment that introduces `:p`
makes `p` an **optional** key (`p?: T`) in `withParams`, because the runtime may
omit the fragment. **Unconditional** fragments → **required**. This is the
existing "optional (`?:`) = maybe-absent" axis, distinct from "`| null` =
present-but-null".

## 7. Architecture

Reuse existing depth-tuned machinery rather than adding a parallel parser:

- `NormalizeQuery`, `ExtractInsertColumns`, `ExtractUpdateSetColumns` /
  `SplitAssignments`, `ExtractLastWhere`, `ExtractReturningList`,
  `SplitTopLevel`, `Trim`, `CleanIdent`
- `InsertTargetTable` / `UpdateTargetTable` / `DeleteTargetTable`
- `ColumnTypeFromTableKey` (brand-preserving), `RowTypeForTable`

New type-level modules (productionized from the spike):

- `ExtractParams<Q, S>` — dispatch by query kind → INSERT / UPDATE / DELETE param
  maps (`ZipInsert`, `SetParams`, `WhereParams`).
- `ExtractReturning<Q, S>` — RETURNING row type (`*` → full row; reuse
  `GetReturnType` machinery for aliases/expressions where applicable).

New runtime modules under `src/builder/`:

- `insert.ts`, `update.ts`, `delete.ts` — builders mirroring `select.ts` (state
  object + fragment methods + `*If` + terminals). Param/return types layered via
  the type-level modules over the accumulated SQL.
- `createSql` (standalone wrapper) and `createMutateFn` (executor) alongside
  `db.ts` / `createSelectFn`.

Depth discipline (per project contracts): chunked-driver pattern for any char
walks; step caps; conservative widening over rejection. Validate depth at each
construct (the spike's incremental method) before stacking.

## 8. Testing strategy

- Type-level probes under the **strict** project tsconfig (never standalone
  `tsc file.ts` — strictNullChecks must be on), mirroring `tests/spike/probe.ts`:
  positive inference per construct + `@ts-expect-error` negative (brand mismatch,
  wrong scalar) as single-line typed assignments.
- Runtime tests (bun, under `tests/builder/`): assembled SQL string + ordered
  `getParams()` for each builder, `ON CONFLICT` / `RETURNING` / `*If` inclusion,
  named→`$n` expansion incl. array params.
- Depth regression: a stacked wide-table fixture file kept in the suite;
  `tsc --extendedDiagnostics` instantiation budget watched.
- Realistic fixtures mirroring the monorepo brand/insert-types shape.

## 9. Open / deferred items

- SELECT param brand-checking + multi-table alias resolution (Phase 2).
- Multi-row VALUES in the builder.
- Whether `createSql` later subsumes the SELECT raw-string path.
- The `tests/spike/` files are a throwaway prototype; productionize into
  `src/` + real tests, then delete the spike.
