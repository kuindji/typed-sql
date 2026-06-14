# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.7.0 — unreleased

### Added

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
