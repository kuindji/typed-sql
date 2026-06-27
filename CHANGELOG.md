# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.7.0 — unreleased

### Added

- **Schema-declared cast types (`casts`)** — type a cast `expr::T` whose target
  the built-in scalar map can't resolve (a custom `CREATE TYPE`/`CREATE DOMAIN`,
  or `json`/`jsonb`) via two optional, layered schema maps:
  - `schema.casts` — a schema-wide `Record<castTargetName, TsType>`
    (`citext → string`, `geometry → Geometry`); the per-schema counterpart to
    `PgTypeOverrides`. Consulted only when the built-in is *uninformative* for
    the target (the uninformative gate — so it names custom types but never
    redefines `::text`). Covers `::geometry[]` automatically.
  - `functions[fn].casts` — a per-function map for targets determinate only in
    combination with a specific call (`ST_AsGeoJSON(x)::json → Point | null`).
    Authoritative: wins even over a built-in target; carries its own
    nullability.

  Precedence: per-function → schema-global (gated) → built-in. `PgTypeOverrides`
  stays the lever for *built-in* driver remaps; `casts` is additive and names
  *custom* types. Cost is cast-only and zero when the maps are absent (measured
  −0.47% instantiations — the new path replaces the old per-projection
  fallback). See "Custom cast types" in the README.

  This **supersedes the unpublished `ModeledFnCastReturn` heuristic** ("an
  uninformative cast over a modeled function falls back to its `returns`"):
  `modeled_fn()::json` now resolves to `unknown` unless the function declares a
  `casts.json` entry. The split also corrects a latent soundness gap — a bare
  `ST_AsGeoJSON(x)` projection now reflects `returns` (GeoJSON **text**, a
  `string`) instead of the post-`::json` object shape. Both are fixes, not
  breaks, because the heuristic was never published.

- **`PgTypeOverrides` — per-type scalar mapping overrides** (module
  augmentation). The pg → TS scalar mapping is now driver-configurable: a
  consumer whose node-postgres is set up with custom `setTypeParser`s augments
  the exported `PgTypeOverrides` interface to remap a pg type, e.g.
  ```ts
  declare module "@kuindji/typed-sql" {
    interface PgTypeOverrides { numeric: number }
  }
  ```
  Keys are canonical pg type names (`CanonicalScalarName` folds synonyms, so
  overriding `numeric` also covers `::decimal`, `int8` covers `bigint`, etc.).
  The lookup short-circuits when the interface is un-augmented (`[keyof
  PgTypeOverrides] extends [never]`), so consumers who never override pay nothing
  — measured at +0.05% instantiations. `SqlScalarToTsWith<N, O>` exposes the
  override-aware mapping with an explicit map (used in tests).

- **Multi-CTE outer joins now infer their real row** — a
  `WITH a AS (...), b AS (...) SELECT x.col, y.col FROM a x JOIN b y ...`
  outer query previously routed through a lenient fallback that resolved
  `ExtractSelectList<N>`, leaking the *first* inner CTE's select list into the
  result row (wrong shape). The new `CteJoinOuterReturn` resolves the real outer
  select list in a single pass: each CTE-qualified ref against the CTE body its
  alias points to (with outer-join nullability applied), and every other ref
  (unqualified, or base-table-qualified — e.g. a `CTE ↔ base` join) against the
  base tables. Covers `WITH RECURSIVE`, aliased CTEs, left-join null-widening,
  and three-way CTE joins. Cost: ~+1% type instantiations, scoped to CTE-join
  queries only (within budget).

### Changed

- **Runtime-honest default scalar mapping for `numeric`/`bigint`/dates.** The
  built-in pg → TS defaults now match what node-postgres actually returns with
  its default type parsers, instead of assuming everything numeric-ish is a JS
  `number`:
  - `numeric` / `decimal` / `bigint` / `int8` / `money` → **`string`** (were
    `number`) — none fit losslessly in a JS double, so node-pg returns them as
    strings.
  - `date` / `timestamp` / `timestamptz` → **`Date`** (were `string`) — node-pg
    parses these to `Date` objects. `time` / `timetz` stay `string`.
  - `int2` / `int4` / `integer` / `smallint` / `real` / `float4` / `float8`
    remain `number` (unchanged — these do fit).

  Consumers running a different driver config override any of these via
  `PgTypeOverrides` (see Added). Potentially-breaking → minor bump.

- **All-string-literal `CASE` narrowing** — a `CASE` whose every arm (all `THEN`s
  plus `ELSE`) is a bare single-quoted string literal or the `null` keyword now
  infers the exact literal union of those arms instead of widening to `string`.
  Any non-literal arm falls back to the previous widening behavior, and mixed
  `CASE`s are byte-identical, so the change only ever narrows the all-literal
  case. (Treated as potentially-breaking → minor bump.)
- **`coalesce(...)` drops opaque arguments** — an argument that types as `unknown`
  (an unmodeled/untypable function such as
  `array_to_string(regexp_split_to_array(...))`, a `jsonb` column, etc.) no longer
  widens the whole `coalesce(...)` result to `unknown`. Since PostgreSQL requires
  every `coalesce` argument to share a common type, the result is inferred from
  the RESOLVABLE arguments and only falls back to `unknown` when **every**
  argument is opaque. Nullability is unaffected — the opaque-arg drop is scoped
  to coalesce's value type (`CoalesceArgUnion`) and deliberately kept out of the
  shared `UnionArgTypes`, so strict scalar functions still treat an unmodeled
  arg as conservatively NULL. Cost: ~+0.8% type instantiations (within budget).

### Fixed

- **A `${string}` interpolation hole in the JOIN region no longer poisons the
  whole outer-join nullable set.** When a hole degraded a relation-qualifier
  token to wide `string`, `CleanIdent<string>` = `Lowercase<string>` entered the
  nullable-qualifier accumulator. Being a supertype of every alias, it made
  `ApplyJoinNull` union `| null` onto EVERY plain column ref — including the
  columns of the non-nullable FROM source, which no outer join can ever null. A
  dense projection over a deep LEFT-join chain (reporting-v2 `fetchOrders`, ~85
  cast/interpolated columns) tripped this and nullablized the driving relation's
  own columns. `CnJoinAcc` now drops non-literal wide forms (`string`,
  `Lowercase<string>`, `Uppercase<string>`) from every qualifier contribution
  (`DropStr`) so only real literal aliases enter the set — the same class of
  poison the sibling `CtDrive`/`TablesInQuery` walker already guards via its
  never-guard. Regression: `tests/builder/types/join-hole-nullable-poison.test.ts`.
- **Outer-join nullability sees through a guarding `coalesce(...)` nested in a
  function call.** A projection like
  `greatest(cap.x - coalesce(t.total, 0), 0)::numeric` over a `LEFT JOIN ... t`
  previously inferred a spurious `| null`: the arithmetic-operand nullability
  pass treated the whole `greatest(...)` call as a function call and flat-scanned
  it for any nullable-side qualified ref, finding `t.total` *inside* the
  `coalesce` and flagging the result nullable — even though `coalesce(t.total, 0)`
  can never be NULL. A non-null `coalesce` fallback now neutralises its inner
  refs before that scan (`StripGuardedCoalesce`): a `coalesce` whose args are NOT
  all nullable is dropped from the operand text, while an all-nullable `coalesce`
  keeps its refs (still nullable). Whole-operand `coalesce` was already handled;
  this closes the nested-in-a-call case. Cost: ~+0.17% type instantiations,
  scoped to function-call arithmetic operands containing `coalesce`.

## 0.2.0 — 2026-06-10

### Added

- **`SELECT DISTINCT` / `DISTINCT ON`** in the select builder —
  `createSelectQuery().distinct()` and `.distinctOn("col", …)`. Neither changes
  the inferred row shape.

### Fixed

- **Builder param expansion** — SELECT and conditional (`*If`) named-param
  expansion is now unified onto a single scanner, fixing inconsistent `$n`
  numbering between the plain and conditional paths.

### Performance

- Substantial type-checker performance improvements to the type-level parser
  (segment-jump lowercasing, fused token post-passes, marker-jump quote walks,
  and fast-paths). Whole-project `tsc` type instantiations down ~25% and peak
  memory down ~29%, lowering compile cost for consumers of the inferred types.
  No behavior or API changes.

## 0.1.0 — 2026-06-05

Initial public release.

### Added

- **Type-level SQL validation** — `ValidateSQL<Query, Schema>` checks tables,
  columns, aliases, and references against a `DatabaseSchema` type entirely at
  compile time (PostgreSQL dialect).
- **Result-type inference** — `GetReturnType<Query, Schema>` infers the row
  shape of `SELECT`/`RETURNING` queries, including join nullability, `::` casts,
  and `coalesce` semantics.
- **DML helpers** — `GetInsertTableColumns`, `GetUpdateTableColumns`,
  `GetDeleteTableColumns`, statement-specific validators
  (`ValidateSelectSQL`, `ValidateInsertSQL`, `ValidateUpdateSQL`,
  `ValidateDeleteSQL`), and fragment-level validators
  (`ValidateFromPart`, `ValidateWherePart`, …).
- **Runtime select builder** — `createSelectQuery()` with conditional `*If`
  methods (`selectIf`, `whereIf`, `joinIf`, …), named-param expansion to
  `$1, $2…`, and `BuilderReturnType` inference; `createSelectFn(driver)` wires
  your own database client.
- **Runtime write builders** — `createInsertQuery()`, `createUpdateQuery()`,
  `createDeleteQuery()`, the `createSql()` raw-SQL tag, and
  `createMutateFn(driver)` with typed `RETURNING` rows.
- **Condition trees & conditional SQL** — `createConditionTree()`,
  `conditionalSQL()`, and friends for assembling dynamic `WHERE`/`HAVING`
  logic.
