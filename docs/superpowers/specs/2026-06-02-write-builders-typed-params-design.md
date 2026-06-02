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
- **Parameter type inference**: every `:name` placeholder **in a recognized
  binding pattern** (§6.4) is typed to the (branded, nullability-correct) type of
  the column it binds to. Brand matching is **exact** (the column's branded type
  is required). Placeholders in positions the parser does not recognize **widen
  to a loose driver param type** (§6.5) rather than being rejected or mistyped —
  per the conservative contract.
- **RETURNING** result-row typing.
- Stay within TypeScript depth limits (no `TS2589`).

## 3. Non-goals (deferred — Phase 2 / notes)

- **SELECT `withParams` brand-checking.** Wanted ("affects select too") but
  gated on multi-table/join **alias resolution** being proven depth-safe. Done
  after the single-target write builders ship.
- **Multi-row `VALUES (...),(...)`** — not covered by typed param inference in
  Phase 1. To avoid the unsound "first-tuple-only" inference (later-tuple
  placeholders silently untyped / flagged as excess / caught only at runtime),
  the typed paths **reject** multi-row INSERT in Phase 1:
  - The **builder** cannot express it — `.value(col, frag)` produces a single
    tuple by construction.
  - **`createSql`** detects a top-level `),(` after `values` and resolves to a
    `[SQL Error] multi-row VALUES not supported …` type (same mechanism as the
    existing `ValidQuery` error string), so `.withParams` is unusable on it.
  - For multi-row writes, use the existing **untyped** path (`db.main.run` / a
    plain driver call). Typed multi-row inference is future work.
- **Multi-table column resolution in WHERE/FROM/USING** — see §6: Phase 1 binds
  WHERE/USING params against the **target table only**; refs to other tables fall
  back to a loose type. Full alias resolution is Phase 2.
- Full SQL expression type-checking — out of scope by the existing conservative
  contract.

## 4. Feasibility result (spike)

A throwaway type-level spike (`tests/spike/`) implemented `ExtractParams<Q, S>`
on top of the existing depth-tuned parsers and was validated under the project's
strict tsconfig. **Verdict: GREEN.**

Proven working (all probes pass, full `tsc --noEmit` exit 0, no `TS2589`):

- INSERT positional column↔value pairing (incl. full 32-column table)
- **INSERT … ON CONFLICT … DO UPDATE SET** params (resolve against target table),
  incl. conflict `WHERE` params and `excluded.col` correctly contributing none
- UPDATE `set col = :p` + WHERE
- DELETE WHERE incl. `id in (:ids)` → array param (`Product_id[]`)
- **Array-valued columns** (`set tags = :tags` → `string[]`) and **JSON/object
  columns** (`set meta = :meta` → the declared object type) flow through as the
  column's declared type — distinct from IN-expansion arrays (§6.5)
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

### 4.1 Scope of the spike — proven vs. not-yet-proven

**What the spike establishes:** (a) the approach is **depth-feasible** (no
`TS2589`, linear cost), and (b) the **core binding patterns** above work
(`col <op> :p`, `in (:ps)`, INSERT pairing, `set`, ON CONFLICT `do update set`,
array/JSON columns, RETURNING, exact brands). It does **not** yet prove the full
finalized §6.1/§6.4/§6.5 matrix.

**Not yet proven — must be TDD'd as early plan tasks (each is a small, bounded
proof, not a depth risk):**

- **`col between :lo and :hi`** and **`col is [not] distinct from :p`** — the
  naive `and`/`or` splitter currently breaks `between` (the inner `and` splits
  the range, leaving `:hi` unresolved → `never`). Needs a **range-aware** split
  pass *before* the boolean split.
- **Loose-fallback typing as include-not-drop** — the spike currently returns
  `{}` for unrecognized WHERE conditions, which **drops** the param. §6.5 requires
  it to be **present and typed `DriverParamValue`**. This is a behavior change to
  `WhereParam`.
- **Precise target-alias qualifier fallback** (§6.1) — capturing the target's own
  alias (`update orders o … where o.id`) and widening **other** qualifiers to
  loose. The spike strips the alias and always resolves against the target table.
- **Multi-row INSERT → `[SQL Error]`** (§3) — detect top-level `),(` after
  `values`.
- **Quote/cast/comment-aware placeholder scanner** (§6.3) — the cast/literal
  false-match must be proven absent before the live-check ships.

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
  // withParams type: { uid: User_id; amt: number; amt2: number; note?: string }
  .withParams({ uid, amt, amt2, ...(hasNote ? { note } : {}) });

// UPDATE
createUpdateQuery<Schema>()
  .table("orders")
  .set("amount = :amt")
  .setIf(bumpCur, "currency = :cur")      // :cur optional
  .from("users u")                        // UPDATE…FROM (+ fromIf)
  .where("id = :oid")
  .whereIf(byUser, "userId = :uid")       // :uid optional
  .returning("id")
  // withParams type: { amt: number; oid: Order_id; cur?: string; uid?: User_id }
  .withParams({ amt, oid, ...(bumpCur ? { cur } : {}), ...(byUser ? { uid } : {}) });

// DELETE
createDeleteQuery<Schema>()
  .from("orders")
  .using("payments p")                    // (+ usingIf)
  .where("id = :id")
  .whereIf(c, "paid = :paid")             // :paid optional
  .returning("*")
  // withParams type: { id: Order_id; paid?: boolean }
  .withParams({ id, ...(c ? { paid } : {}) });
```

### 5.2 Standalone typed raw-SQL wrapper

```ts
const sql = createSql<Schema>();                     // factory binds Schema once
const q = sql("delete from orders where id = :id")   // covers insert/update/delete
  .withParams({ id });                               // brand-checked from the string
q.toString(); q.getParams();                         // reusable typed query object
```

`createSql` covers I/U/D in Phase 1; may absorb SELECT in Phase 2. A multi-row
INSERT string resolves to a `[SQL Error]` type (§3), so it cannot be parameterized
through this path.

### 5.3 Executor

```ts
// driver returns the ROW ARRAY (RETURNING rows, or [] when none) — see below
type MutationHandler = (sql: string, params: DriverParamValue[]) => Promise<unknown[]>;

const mutate = createMutateFn<Schema>(driver);   // analog of createSelectFn
await mutate(q);                                  // builder OR createSql() object
await mutate(
  "insert into orders (userId) values (:uid) returning id",
  { uid },                                        // raw + brand-checked params
);
```

**Driver contract (`MutationHandler`).** Like `createSelectFn`'s `QueryHandler`
(`(query, params?) => unknown`, whose result `select` casts to a row array),
`createMutateFn` takes a `MutationHandler` expected to return the **row array**:
the `RETURNING` rows, or `[]` for a mutation with no `RETURNING`. `mutate` casts
that result to the inferred `Row[]` and does **not** inspect a `pg.QueryResult`
itself — the adapter passed to `createMutateFn` is responsible for extracting
`.rows` (e.g. `(sql, p) => pool.query(sql, p).then(r => r.rows)`). Consumers
needing `rowCount`/driver metadata call the driver directly; `mutate` exposes
only typed rows, consistent with `createSelectFn`.

**Named-param expansion (raw-string overload).** Unlike `createSelectFn`, whose
raw overload passes `params?: unknown[]` straight through positionally
(`src/builder/db.ts`), `mutate`'s raw overload takes a **named-params object**
and, before calling the driver, expands `:name → $n` and produces the ordered
value array (the same `expandNamedParams` / `collectParamValues` the builder uses
in `getParams()`, but over the broadened `DriverParamValue` domain — §6.5, and
with position-aware IN-expansion). It therefore also performs the runtime
live-placeholder check from §6.3. A positional `DriverParamValue[]` form may be
offered as a separate untyped overload, but the typed path is named-object only.

**Return shape.** `mutate` returns `Promise<ExtractReturning<Q, S>[]>`, mirroring
`createSelectFn`'s row-array contract:

- **With `RETURNING`** → `Promise<Row[]>` where `Row = ExtractReturning<Q, S>`.
- **Without `RETURNING`** → `ExtractReturning<Q, S>` is `{}`, so the typed result
  is `Promise<{}[]>` and the runtime array is empty (`[]`). Callers that need
  affected-row counts use the driver directly; `mutate` intentionally exposes
  only the typed rows, consistent with `createSelectFn`.

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
- **WHERE / USING** — recognized binding patterns only (§6.4); unrecognized
  positions widen to loose (§6.5). Applies to UPDATE, DELETE (and SELECT in
  Phase 2).
- **A fragment contributes a param iff it contains `:name` tokens.** Expression
  RHS without placeholders (`pos = pos + 1`, `not flag`) contributes none. Where
  a fragment is an expression containing a placeholder (`coalesce(:a, '')`), each
  `:name` found is typed to the bound column.
- **Brand matching is exact** — the param type is the column's declared
  (branded) type; the underlying base type is not accepted.
- **Nullability** is preserved from the schema (`Team_id | null`).
- `::cast` suffixes on a placeholder are stripped from the param name.

### 6.1 Target-table scoping for WHERE/USING/FROM (Phase 1)

Because multi-table alias resolution is Phase 2, Phase 1 resolves WHERE/USING
param columns **against the target table only** (the INSERT/UPDATE/DELETE
target). `INSERT…ON CONFLICT…DO UPDATE SET`, `UPDATE…FROM`, and `DELETE…USING`
are still assembled as SQL, but param column resolution follows these rules:

- **Unqualified** `col` → resolved against the target table.
- **Qualified** `x.col` → resolved **only if** `x` is the target table's name or
  its own alias (captured from `update orders o` / `delete from orders o`).
- **Any other case** (column not on the target table, or qualified by a
  `FROM`/`USING` alias) → the param falls back to the **loose type
  `DriverParamValue`** (§6.5) — *not* brand-checked, not `never`, not dropped.
  This is the conservative contract: never reject a valid query, widen instead.
  Full cross-table resolution arrives in Phase 2.

This removes the `where("id = :id")`-when-joined-table-also-has-`id` ambiguity:
the target table's `id` always wins; an ambiguous foreign `id` is loosely typed
rather than mis-bound.

### 6.2 Duplicate placeholder names

A `:name` may appear multiple times; at runtime **one** value is substituted for
**every** occurrence (named-param semantics). The type contract therefore
**requires all occurrences of a name to resolve to a mutually compatible type**.
Implementation: accumulate each occurrence's column type by **intersection**.

- Same column / same type repeated → the type (no change).
- Different columns that share a type (`a = :x and b = :x`, both `string`) →
  `string` (compatible).
- **Conflicting brands** (`userId = :id and id = :id` → `User_id & Order_id`) →
  the intersection is unsatisfiable (`__table: "User" & "Order"` collapses), so
  **the call site cannot supply a value = a type error**. This is the intended
  rejection. A clearer diagnostic (e.g. mapping conflicts to a branded
  `{ __error: ... }` type) is a nice-to-have, not required for Phase 1.

### 6.3 Runtime live-placeholder validation (required)

The `*If` contract makes conditional params **optional** at the type level. The
runtime must therefore guarantee correctness when an optional param is omitted
but its fragment *was* included: **before execution, scan the fully-assembled SQL
for every live `:name` placeholder and throw a clear error for any whose key is
absent from the supplied params** (e.g. `Missing value for query parameter ":p"`).

This closes the current gap: `expandNamedParams`/`collectParamValues` today only
iterate keys present in the params object (`src/builder/params.ts`), so a live
placeholder with no key is silently left as literal `:p` in the SQL and surfaces
only as an opaque driver error. The write builders, `createSql`, and `mutate`'s
raw overload must all run this check (in `getParams()`/before driver dispatch).
Conditional params whose fragment was **excluded** are correctly absent from the
emitted SQL and must **not** error.

**Required: a single quote/cast/comment-aware placeholder scanner.** The current
`PARAM_REGEX` (`src/builder/params.ts`) deliberately matches the **second colon of
a `::cast`** — so `where id = :id::uuid` yields a spurious `:uuid`, and the regex
also matches `:name` sequences inside **string literals** (`'... :nope ...'`) and
**comments** (`-- :nope`, `/* :nope */`). The existing key-present-only iteration
hides this (a non-key match is ignored), but a live-check that *throws on
unmatched live placeholders* would raise **false missing-param errors**. Phase 1
must therefore introduce **one shared scanner** that:

- skips single-quoted string literals, dollar-quoted strings, and `--` / `/* */`
  comments,
- treats `::type` as a cast (never a placeholder — the second colon is not a
  param start), and
- returns each real placeholder name **with its occurrence position/context**
  (needed by §6.5 IN-expansion too).

`expandNamedParams`, `collectParamValues`, and the live-check all consume this one
scanner, so detection, expansion, and validation can never disagree. (The
existing `PARAM_REGEX` behavior is pinned by `params.test.ts`; the new scanner is
additive for the typed paths and the select retrofit in §9.)

### 6.4 Recognized WHERE/HAVING binding patterns

The goal (§2) is deliberately bounded: a placeholder is precisely typed **only**
when it appears in one of these recognized patterns (column on the left, operator,
placeholder). Everything else **widens to loose** (§6.5) — never rejected,
never mistyped.

**Inferred (Phase 1):**

- `col <op> :p` where `<op>` ∈ `= != <> < <= > >= like ilike` → `:p` = `col` type
- `col in (:ps)` / `col not in (:ps)` → `:ps` = `ColType[]` (IN-expansion, §6.5)
- `col between :lo and :hi` → both `:lo`, `:hi` = `col` type
- `col is [not] distinct from :p` → `:p` = `col` type

`col` here follows §6.1 target-table scoping (unqualified or target-alias).

**Widened to loose (Phase 1 — `DriverParamValue`, may be tightened later):**

- Reversed operand order — `:p = col`
- `col = any(:ids)` / `col = all(:ids)`
- Placeholder inside a function/expression — `coalesce(col, :fallback)`,
  `lower(col) = :p`, `col + :n > 0`
- Placeholder compared to another placeholder, or any position the splitter
  (`and`/`or`, top-level) can't reduce to `col <op> :p`

Nested boolean expressions are handled to the extent the `and`/`or` top-level
split reduces them to recognized leaf conditions; parenthesised/again-nested
leaves that don't reduce fall through to loose. This keeps the parser shallow
(depth-safe) and honest about what it guarantees.

### 6.5 Parameter value domain, JSON, and IN-expansion vs array columns

**Driver param domain.** The exact-typed contract means a param's type can be
**any column type** — scalars, branded scalars, string-literal enums, **arrays,
and JSON/object columns**. The narrow `QueryParamValue`
(`string | number | boolean | null`) in `src/builder/params.ts` is therefore
insufficient. Introduce **`DriverParamValue`** as the value domain at the typed
boundary:

- Default `DriverParamValue = unknown` (accepts objects/arrays/dates). The driver
  adapter is responsible for serialization (the monorepo `prepareValue`
  JSON-stringifies objects; that logic stays consumer-side or in an optional
  value-coercion hook on `createMutateFn`).
- The **loose fallback** type from §6.1/§6.4 is `DriverParamValue` (not the narrow
  `QueryParamValue`), so a loosely-typed param never wrongly rejects a valid
  JSON/array/date value.
- `DriverParamValue` may be made **generic/configurable** per consumer
  (e.g. `createSql<Schema, DriverParam>()`) — to be decided in the plan; default
  `unknown` is the safe floor.

**IN-expansion arrays vs array-valued columns** — both surface as `T[]` at the
type level but have **different runtime semantics**, and must not be conflated:

| Case | Type | Runtime |
|---|---|---|
| `col in (:ids)` | `ColType[]` | **expanded** to `$1, $2, …`, one slot per element |
| array-valued `col = :tags` (col is `text[]`) | `string[]` (the column type) | **single** `$n`, passed as one array value (pg array) |
| JSON/object `col = :meta` | the object type | **single** `$n`, serialized by the driver |

The current `expandNamedParams` expands **every** array value
(`src/builder/params.ts`), which would wrongly explode an array-column value.
Phase 1 makes expansion **position-aware**: only placeholders the parser tagged
as **IN-expansion** are expanded; all other values (including arrays for array
columns and objects for JSON columns) pass through as a single parameter. The
expansion decision is **occurrence-level** — driven by the shared scanner's
per-occurrence context (§6.3) — not merely by placeholder name.

**Mixed IN / non-IN reuse of one name is rejected.** A single named param cannot
coherently be both an expanded IN list and a scalar in the same query: `:ids`
used once in `col in (:ids)` and once in `x = :ids` would need to be both N
positional slots and one slot, for one supplied value. Phase 1 detects a name
appearing in **both** an IN-expansion and a non-IN occurrence and **errors**
(runtime error always; a type-level error where feasible — the §6.2 intersection
already makes the `T[]`-vs-scalar collision unsatisfiable in the common case).
General occurrence-level *expansion metadata* (allowing such mixes) is possible
future work but explicitly out of Phase 1.

### `*If` → optional param contract

Consistent with `selectIf`: a **conditional** fragment that introduces `:p`
makes `p` an **optional** key (`p?: T`) in `withParams`, because the runtime may
omit the fragment. **Unconditional** fragments → **required**. This is the
existing "optional (`?:`) = maybe-absent" axis, distinct from "`| null` =
present-but-null".

**Required wins over optional (duplicate names).** A name's optionality is
decided across **all** its occurrences: a name is optional **only if every
occurrence is in a conditional fragment**. If the same name appears in **any**
unconditional fragment (e.g. `:id` in an unconditional `where id = :id` and also
in a `whereIf(...)` fragment), the key is **required** — because at least one
emission path always needs it. The optional/required reduction therefore happens
after the §6.2 type intersection, over the per-occurrence conditional flags. (A
test mirrors this near the duplicate-name tests.)

## 7. Architecture

Reuse existing depth-tuned machinery rather than adding a parallel parser:

- `NormalizeQuery`, `ExtractInsertColumns`, `ExtractUpdateSetColumns` /
  `SplitAssignments`, `ExtractLastWhere`, `ExtractReturningList`,
  `SplitTopLevel`, `Trim`, `CleanIdent`
- `InsertTargetTable` / `UpdateTargetTable` / `DeleteTargetTable`
- `ColumnTypeFromTableKey` (brand-preserving), `RowTypeForTable`

New type-level modules (productionized from the spike):

- `ExtractParams<Q, S>` — dispatch by query kind → INSERT / UPDATE / DELETE param
  maps (`ZipInsert`, `SetParams` incl. `ON CONFLICT … DO UPDATE SET` via a
  conflict-set block, `WhereParams` over the §6.4 recognized patterns). Multi-row
  INSERT (`),(` after `values`) resolves to a `[SQL Error]` type.
- `ExtractReturning<Q, S>` — RETURNING row type (`*` → full row; reuse
  `GetReturnType` machinery for aliases/expressions where applicable).
- Param value domain: `DriverParamValue` (§6.5) replacing the narrow
  `QueryParamValue` at the typed boundary; loose fallback uses it.

New runtime modules under `src/builder/`:

- `insert.ts`, `update.ts`, `delete.ts` — builders mirroring `select.ts` (state
  object + fragment methods + `*If` + terminals). Param/return types layered via
  the type-level modules over the accumulated SQL.
- `createSql` (standalone wrapper) and `createMutateFn` (executor) alongside
  `db.ts` / `createSelectFn`.
- Param runtime (`params.ts` extensions): a **shared quote/cast/comment-aware
  placeholder scanner** (§6.3) consumed by expansion, collection, and the
  live-check; broaden the value domain to `DriverParamValue`; **occurrence-level
  position-aware IN-expansion** (only IN-context occurrences expand; mixed
  IN/non-IN reuse of a name is rejected — §6.5); and the **live-placeholder
  check** (§6.3).

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
- **§6.3 live-placeholder check**: a `*If`-included fragment whose param key is
  omitted **throws** with a clear message; an excluded fragment's param omitted
  does **not** throw. Cover builder, `createSql`, and `mutate` raw overload.
- **§6.2 duplicate names**: `@ts-expect-error` that conflicting-brand reuse is
  rejected; compatible reuse (same type) compiles.
- **§6.1 target-table scoping**: unqualified + target-alias-qualified refs are
  brand-checked; a foreign/unknown ref yields the loose `DriverParamValue` (probe
  the fallback type, that the param is **present-but-loose** (not dropped), and
  that it does not error).
- **§5.3 return shape**: with-`RETURNING` → typed `Row[]`; without → `{}[]` and
  an empty runtime array. `mutate` raw overload expands named params to `$n`;
  `MutationHandler` is fed the ordered values and its row-array result is returned.
- **ON CONFLICT** (§4/spike): `do update set` params resolve to target table;
  quoted columns; `excluded.col` → no param; conflict `WHERE` param; duplicate
  placeholder conflict inside `do update set` rejected (§6.2).
- **§6.4 recognized vs loose**: `between`/`in`/`is distinct from` inferred;
  `:p = col`, `any(:ids)`, `coalesce(col, :p)` widen to `DriverParamValue`
  (probe the loose type and that they compile).
- **§6.5 IN vs array column**: `col in (:ids)` → `T[]` and runtime-**expands**;
  array-valued `col = :tags` → `T[]` but runtime passes a **single** param; JSON
  `col = :meta` → object type, single param. Assert `getParams()` arity for each.
- **§3 multi-row rejection**: a multi-row INSERT string is a `[SQL Error]` type
  (`@ts-expect-error` on `.withParams`).
- **§6.3 scanner edge cases**: `where id = :id::uuid` does **not** throw for a
  phantom `:uuid`; `:name` inside a string literal (`'… :nope …'`) or comment
  (`-- :nope`, `/* :nope */`) is **not** treated as a live placeholder.
- **§6.5 mixed IN/non-IN reuse**: `:ids` in both `id in (:ids)` and `x = :ids`
  is rejected (runtime error; type error where feasible).
- **§6.2/`*If` required-wins**: a name in an unconditional fragment **and** a
  `*If` fragment stays **required** (not optional).
- Depth regression: a stacked wide-table fixture file kept in the suite;
  `tsc --extendedDiagnostics` instantiation budget watched.
- Realistic fixtures mirroring the monorepo brand/insert-types shape.

## 9. Open / deferred items

- SELECT param brand-checking + multi-table alias resolution (Phase 2). Phase 2
  replaces the §6.1 target-table-only scoping with real per-ref alias resolution
  across `FROM`/`USING`/joins.
- Multi-row VALUES typed param inference (builder and `createSql`) — Phase 1
  rejects these in the typed path; untyped path is the workaround (§3).
- Tightening §6.4-loose WHERE positions (`:p = col`, `any(:ids)`,
  `coalesce(col, :p)`, nested/parenthesised leaves) to precise inference.
- Whether `DriverParamValue` is a fixed `unknown` or a per-consumer generic
  (`createSql<Schema, DriverParam>()`); default `unknown` ships in Phase 1.
- Whether `createSql` later subsumes the SELECT raw-string path.
- **Retrofit the §6.3 live-placeholder runtime check onto the existing SELECT
  builder/`createSelectFn`**, which has the same silent-missing-param gap today.
  Out of Phase 1 scope (write-feature-focused) but low-risk and worth doing —
  no caller depends on emitting literal `:p` into SQL.
- The `tests/spike/` files are a throwaway prototype; productionize into
  `src/` + real tests, then delete the spike.
